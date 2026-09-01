import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { chatsRepository } from "../repositories/chatsRepository.js";
import { messagesRepository } from "../repositories/messagesRepository.js";
import {
  cancelGeneration,
  discardGenerationIfTargeting,
  getActiveGeneration,
  isGenerationActive,
  newMessageId,
  runGeneration,
  subscribeToGeneration,
} from "../services/generationService.js";
import { endSse, startSse, writeChunk } from "../utils/sse.js";
import { REASONING_EFFORT_LEVELS } from "../types.js";
import type { AppUIMessage, MessageRow } from "../types.js";

const reasoningEffortSchema = z.enum(REASONING_EFFORT_LEVELS).optional();
const sourceProbabilityPercentSchema = z.number().min(0).max(100).optional();

export const chatsRouter = Router();

function toUIMessage(row: MessageRow): AppUIMessage {
  return { id: row.id, role: row.role, parts: row.parts, metadata: { status: row.status } };
}

// Loosely validates the shape of a UIMessage sent by the client; the actual
// `parts` union is intentionally left as `z.any()` since ai-sdk's UIMessagePart
// union is large and evolves with the SDK - the server treats it as an opaque
// JSON blob it stores/forwards, while the LLM-facing conversion (`convertToModelMessages`)
// is what really needs the parts to be well-formed ai-sdk UIMessage parts.
const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.any()).min(1),
});

/** Streams a just-started generation's chunks to `res` as SSE, until it finishes. */
function streamGenerationToResponse(res: Response, gen: ReturnType<typeof runGeneration>) {
  startSse(res);
  const unsubscribe = subscribeToGeneration(
    gen,
    (chunk) => writeChunk(res, chunk),
    () => endSse(res)
  );
  // Note: `req` (IncomingMessage) fires "close" as soon as the request body has
  // been fully read, which happens almost immediately for small JSON bodies -
  // long before the client actually disconnects. We must watch `res` (the
  // outgoing response) instead, which only closes when the underlying
  // connection is actually torn down (client disconnect / abort).
  res.on("close", unsubscribe);
}

/** GET /api/chats/:chatId/messages - full message history (creates the chat implicitly). */
chatsRouter.get("/:chatId/messages", (req, res) => {
  const { chatId } = req.params;
  chatsRepository.ensureExists(chatId);
  const messages = messagesRepository.listByChat(chatId).map(toUIMessage);
  res.json({ messages });
});

/** POST /api/chats/:chatId/messages - submit a new user message and stream the assistant reply. */
chatsRouter.post("/:chatId/messages", (req, res) => {
  const { chatId } = req.params;
  const bodySchema = z.object({
    message: uiMessageSchema,
    requireApproval: z.boolean().optional(),
    reasoningEffort: reasoningEffortSchema,
    sourceProbabilityPercent: sourceProbabilityPercentSchema,
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  chatsRepository.ensureExists(chatId);
  const history = messagesRepository.listByChat(chatId).map(toUIMessage);

  const userMessage: AppUIMessage = {
    id: parsed.data.message.id ?? newMessageId(),
    role: "user",
    parts: parsed.data.message.parts,
  };
  messagesRepository.insert({
    id: userMessage.id,
    chatId,
    role: "user",
    parts: userMessage.parts,
    status: "complete",
    createdAt: Date.now(),
  });
  chatsRepository.touch(chatId);

  const assistantMessageId = newMessageId();
  const gen = runGeneration({
    chatId,
    assistantMessageId,
    conversation: [...history, userMessage],
    requireApproval: parsed.data.requireApproval ?? false,
    reasoningEffort: parsed.data.reasoningEffort,
    sourceProbabilityPercent: parsed.data.sourceProbabilityPercent,
  });
  streamGenerationToResponse(res, gen);
});

/**
 * POST /api/chats/:chatId/messages/:messageId/regenerate - regenerate the
 * assistant message identified by :messageId. Semantics (documented in
 * README): :messageId must be an assistant message; the server takes all
 * history strictly before it (not including it), deletes it and any
 * messages that came after it, and streams a brand new assistant message.
 */
chatsRouter.post("/:chatId/messages/:messageId/regenerate", (req, res) => {
  const { chatId, messageId } = req.params;
  const bodySchema = z.object({
    requireApproval: z.boolean().optional(),
    reasoningEffort: reasoningEffortSchema,
    sourceProbabilityPercent: sourceProbabilityPercentSchema,
  });
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    res.status(404).json({ error: `Chat ${chatId} not found` });
    return;
  }

  const all = messagesRepository.listByChat(chatId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    res.status(404).json({ error: `Message ${messageId} not found` });
    return;
  }
  if (all[idx].role !== "assistant") {
    res.status(400).json({ error: "Only assistant messages can be regenerated" });
    return;
  }

  const history = all.slice(0, idx).map(toUIMessage);
  for (const m of all.slice(idx)) {
    messagesRepository.delete(m.id);
  }

  const assistantMessageId = newMessageId();
  const gen = runGeneration({
    chatId,
    assistantMessageId,
    conversation: history,
    requireApproval: parsed.data.requireApproval ?? false,
    reasoningEffort: parsed.data.reasoningEffort,
    sourceProbabilityPercent: parsed.data.sourceProbabilityPercent,
  });
  streamGenerationToResponse(res, gen);
});

/**
 * POST /api/chats/:chatId/messages/:messageId/continue - not in the original
 * spec verbatim, but required to support client-side tools (section 7.6) and
 * the tool-approval feature: after the browser resolves a pending tool call
 * (executes a client tool, or approves/denies a gated tool), it POSTs the
 * updated assistant message (same id, with resolved tool parts) here so the
 * server can feed it back to the LLM and keep streaming the same message.
 */
chatsRouter.post("/:chatId/messages/:messageId/continue", (req, res) => {
  const { chatId, messageId } = req.params;
  const bodySchema = z.object({
    message: uiMessageSchema,
    requireApproval: z.boolean().optional(),
    reasoningEffort: reasoningEffortSchema,
    sourceProbabilityPercent: sourceProbabilityPercentSchema,
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.message.role !== "assistant") {
    res.status(400).json({ error: "Continuation message must have role 'assistant'" });
    return;
  }

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    res.status(404).json({ error: `Chat ${chatId} not found` });
    return;
  }

  const all = messagesRepository.listByChat(chatId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    res.status(404).json({ error: `Message ${messageId} not found` });
    return;
  }

  const history = all.slice(0, idx).map(toUIMessage);
  const updatedAssistantMessage: AppUIMessage = {
    id: messageId,
    role: "assistant",
    parts: parsed.data.message.parts,
  };

  const gen = runGeneration({
    chatId,
    assistantMessageId: messageId,
    conversation: [...history, updatedAssistantMessage],
    requireApproval: parsed.data.requireApproval ?? false,
    reasoningEffort: parsed.data.reasoningEffort,
    sourceProbabilityPercent: parsed.data.sourceProbabilityPercent,
  });
  streamGenerationToResponse(res, gen);
});

/** DELETE /api/chats/:chatId/messages/:messageId - remove a message from history. */
chatsRouter.delete("/:chatId/messages/:messageId", (req, res) => {
  const { chatId, messageId } = req.params;
  const existing = messagesRepository.getById(messageId);
  if (!existing) {
    res.status(404).json({ error: `Message ${messageId} not found` });
    return;
  }
  // If this message is still being generated, stop that generation and make
  // sure it won't re-persist the message once the in-flight LLM call ends
  // (otherwise the "deleted" message would silently reappear).
  discardGenerationIfTargeting(chatId, messageId);
  messagesRepository.delete(messageId);
  res.status(204).end();
});

/** POST /api/chats/:chatId/cancel - stop the active generation for this chat, if any. */
chatsRouter.post("/:chatId/cancel", (req, res) => {
  const { chatId } = req.params;
  const chat = chatsRepository.get(chatId);
  if (!chat) {
    res.status(404).json({ error: `Chat ${chatId} not found` });
    return;
  }
  const wasActive = cancelGeneration(chatId);
  res.status(200).json({ cancelled: wasActive });
});

/**
 * GET /api/chats/:chatId/resume (SSE) - reattach to an in-progress
 * generation. Replays whatever has accumulated so far, then continues
 * streaming live. If nothing is active, responds 204 with no body.
 */
chatsRouter.get("/:chatId/resume", (req, res) => {
  const { chatId } = req.params;
  if (!isGenerationActive(chatId)) {
    res.status(204).end();
    return;
  }
  const gen = getActiveGeneration(chatId)!;
  startSse(res);
  for (const chunk of gen.chunks) {
    writeChunk(res, chunk);
  }
  const unsubscribe = subscribeToGeneration(
    gen,
    (chunk) => writeChunk(res, chunk),
    () => endSse(res)
  );
  res.on("close", unsubscribe);
});
