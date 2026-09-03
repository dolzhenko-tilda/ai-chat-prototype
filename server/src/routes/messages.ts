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
import { requireToken } from "../utils/auth.js";
import { sendError, sendResult } from "../utils/response.js";
import { REASONING_EFFORT_LEVELS } from "../types.js";
import type {
  AppUIMessage,
  MessageRow,
  Rate,
  RateInfo,
  RateResult,
} from "../types.js";

const reasoningEffortSchema = z.enum(REASONING_EFFORT_LEVELS).optional();
const rateSchema = z.enum(["like", "dislike"]) satisfies z.ZodType<Rate>;

const CHAT_NAME_MAX_LENGTH = 60;

/** Derives an auto-title for a still-unnamed chat from its first user message (see `chatsRepository.setNameIfUnset`). */
function deriveChatName(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  if (singleLine.length <= CHAT_NAME_MAX_LENGTH) return singleLine;
  return `${singleLine.slice(0, CHAT_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * `requireApproval`/`reasoningEffort` aren't part of `ai-chat-contracts.ts`
 * (that contract only documents `chatId`/`message`/`messageId`/`toolPart`),
 * but they drive the existing settings UI (`useChatSettings.ts`) and are
 * accepted here as an additive extension - both are optional, so any client
 * following the documented contract still works unmodified.
 */
const genOptionsSchema = z.object({
  requireApproval: z.boolean().optional(),
  reasoningEffort: reasoningEffortSchema,
});

// Loosely validates the shape of a single UIMessage tool part sent by the
// client for `/continue`. Left permissive (`.passthrough()`) because ai-sdk's
// tool part union is large/evolving and, for the approval-gated tool flow,
// carries an extra `approval` object that `ai-chat-contracts.ts`'s `ToolPart`
// type doesn't (yet) document.
const toolPartSchema = z
  .object({
    type: z.string(),
    toolCallId: z.string(),
    state: z.string(),
  })
  .passthrough();

export const messagesRouter = Router();

messagesRouter.use(requireToken);

function toUIMessage(row: MessageRow): AppUIMessage {
  const rateInfo: RateInfo | undefined =
    row.rate && row.ratedAt !== undefined
      ? { rate: row.rate, ratedAt: new Date(row.ratedAt).toISOString() }
      : undefined;
  return {
    id: row.id,
    role: row.role,
    parts: row.parts,
    metadata: { status: row.status, rateInfo, createdAt: new Date(row.createdAt).toISOString() },
  };
}

/** Streams a just-started generation's chunks to `res` as SSE, until it finishes. */
function streamGenerationToResponse(
  res: Response,
  gen: ReturnType<typeof runGeneration>,
) {
  startSse(res);
  const unsubscribe = subscribeToGeneration(
    gen,
    (chunk) => writeChunk(res, chunk),
    () => endSse(res),
  );
  // Note: `req` (IncomingMessage) fires "close" as soon as the request body has
  // been fully read, which happens almost immediately for small JSON bodies -
  // long before the client actually disconnects. We must watch `res` (the
  // outgoing response) instead, which only closes when the underlying
  // connection is actually torn down (client disconnect / abort).
  res.on("close", unsubscribe);
}

/** GET /api/v1/messages/list - see `GetMessagesRequest`/`GetMessagesResponse`. */
messagesRouter.get("/list", (req, res) => {
  const querySchema = z.object({
    chatId: z.string().min(1),
    beforeId: z.string().optional(),
    limit: z.coerce.number().int().positive().optional(),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Invalid query", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, beforeId, limit } = parsed.data;

  // Per the contract: "если чата ещё нет — возвращает пустой массив", so
  // unlike the other endpoints we don't implicitly create the chat here.
  let rows = messagesRepository.listByChat(chatId);
  if (beforeId) {
    const idx = rows.findIndex((m) => m.id === beforeId);
    rows = idx === -1 ? [] : rows.slice(0, idx);
  }
  let hasMore = false;
  if (limit !== undefined && rows.length > limit) {
    hasMore = true;
    rows = rows.slice(rows.length - limit);
  }

  sendResult(res, { chatId, messages: rows.map(toUIMessage), hasMore });
});

/** POST /api/v1/messages/create - see `CreateMessageRequest`/`CreateMessageResponse`. */
messagesRouter.post("/create", (req, res) => {
  const bodySchema = z
    .object({
      chatId: z.string().min(1),
      message: z.string().min(1),
    })
    .merge(genOptionsSchema);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, message, requireApproval, reasoningEffort } = parsed.data;

  chatsRepository.ensureExists(chatId);
  chatsRepository.setNameIfUnset(chatId, deriveChatName(message));
  const history = messagesRepository.listByChat(chatId).map(toUIMessage);

  const userMessage: AppUIMessage = {
    id: newMessageId(),
    role: "user",
    parts: [{ type: "text", text: message }],
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
    requireApproval: requireApproval ?? false,
    reasoningEffort,
  });
  streamGenerationToResponse(res, gen);
});

/**
 * POST /api/v1/messages/regenerate - see `RegenerateMessageRequest`/
 * `RegenerateMessageResponse`. `messageId` must be an assistant message; the
 * server takes all history strictly before it (not including it), deletes it
 * and any messages that came after it, and streams a brand new assistant
 * message.
 */
messagesRouter.post("/regenerate", (req, res) => {
  const bodySchema = z
    .object({
      chatId: z.string().min(1),
      messageId: z.string().min(1),
    })
    .merge(genOptionsSchema);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, messageId, requireApproval, reasoningEffort } = parsed.data;

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    sendError(res, 404, `Chat ${chatId} not found`);
    return;
  }

  const all = messagesRepository.listByChat(chatId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    sendError(res, 404, `Message ${messageId} not found`);
    return;
  }
  if (all[idx].role !== "assistant") {
    sendError(res, 400, "Only assistant messages can be regenerated");
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
    requireApproval: requireApproval ?? false,
    reasoningEffort,
  });
  streamGenerationToResponse(res, gen);
});

/**
 * POST /api/v1/messages/continue - see `ContinueMessageRequest`/
 * `ContinueMessageResponse`. Used after a client-side tool call (e.g.
 * `logToConsole`) executes in the browser, or after the user approves/denies
 * a gated tool call: the client sends just the updated `toolPart`, the
 * server merges it into the stored assistant message (matched by
 * `toolCallId`) and feeds the result back to the LLM to keep streaming the
 * same message.
 */
messagesRouter.post("/continue", (req, res) => {
  const bodySchema = z
    .object({
      chatId: z.string().min(1),
      messageId: z.string().min(1),
      toolPart: toolPartSchema,
    })
    .merge(genOptionsSchema);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, messageId, toolPart, requireApproval, reasoningEffort } =
    parsed.data;

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    sendError(res, 404, `Chat ${chatId} not found`);
    return;
  }

  const all = messagesRepository.listByChat(chatId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    sendError(res, 404, `Message ${messageId} not found`);
    return;
  }
  if (all[idx].role !== "assistant") {
    sendError(res, 400, "Only assistant messages can be continued");
    return;
  }

  const storedParts = all[idx].parts as AppUIMessage["parts"];
  const partIdx = storedParts.findIndex(
    (p) =>
      "toolCallId" in p &&
      (p as { toolCallId: string }).toolCallId === toolPart.toolCallId,
  );
  const mergedParts =
    partIdx === -1
      ? [...storedParts, toolPart as AppUIMessage["parts"][number]]
      : storedParts.map((p, i) =>
          i === partIdx ? (toolPart as AppUIMessage["parts"][number]) : p,
        );

  const history = all.slice(0, idx).map(toUIMessage);
  const updatedAssistantMessage: AppUIMessage = {
    id: messageId,
    role: "assistant",
    parts: mergedParts,
  };

  const gen = runGeneration({
    chatId,
    assistantMessageId: messageId,
    conversation: [...history, updatedAssistantMessage],
    requireApproval: requireApproval ?? false,
    reasoningEffort,
  });
  streamGenerationToResponse(res, gen);
});

/** POST /api/v1/messages/delete - see `DeleteMessageRequest`/`DeleteMessageResponse`. */
messagesRouter.post("/delete", (req, res) => {
  const bodySchema = z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, messageId } = parsed.data;

  const existing = messagesRepository.getById(messageId);
  if (!existing) {
    sendError(res, 404, `Message ${messageId} not found`);
    return;
  }
  // If this message is still being generated, stop that generation and make
  // sure it won't re-persist the message once the in-flight LLM call ends
  // (otherwise the "deleted" message would silently reappear).
  discardGenerationIfTargeting(chatId, messageId);
  messagesRepository.delete(messageId);
  sendResult(res, {});
});

/** POST /api/v1/messages/rate - see `RateAnswerRequest`/`RateAnswerResponse`. */
messagesRouter.post("/rate", (req, res) => {
  const bodySchema = z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
    rate: rateSchema,
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { messageId, rate } = parsed.data;

  const existing = messagesRepository.getById(messageId);
  if (!existing) {
    sendError(res, 404, `Message ${messageId} not found`);
    return;
  }
  if (existing.role !== "assistant") {
    sendError(res, 400, "Only assistant messages can be rated");
    return;
  }

  const ratedAt = Date.now();
  messagesRepository.rate(messageId, rate, ratedAt);
  const rateResult: RateResult = {
    messageId,
    rate,
    ratedAt: new Date(ratedAt).toISOString(),
  };
  sendResult(res, rateResult);
});

/** POST /api/v1/messages/cancel - see `CancelGenerationRequest`/`CancelGenerationResponse`. */
messagesRouter.post("/cancel", (req, res) => {
  const bodySchema = z.object({ chatId: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId } = parsed.data;

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    sendError(res, 404, `Chat ${chatId} not found`);
    return;
  }
  const cancelled = cancelGeneration(chatId);
  sendResult(res, { cancelled });
});

/**
 * GET /api/v1/messages/resume (SSE) - see `ResumeGenerationRequest`/
 * `ResumeGenerationResponse`. Reattaches to an in-progress generation,
 * replaying whatever has accumulated so far and then continuing to stream
 * live. If nothing is active, responds `204 No Content` (the contract's
 * `null` case can't be expressed as a JSON envelope since the success case
 * is a raw SSE stream).
 */
messagesRouter.get("/resume", (req, res) => {
  const querySchema = z.object({ chatId: z.string().min(1) });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Invalid query", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId } = parsed.data;

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
    () => endSse(res),
  );
  res.on("close", unsubscribe);
});
