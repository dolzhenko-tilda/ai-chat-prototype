import { Router } from "express";
import { z } from "zod";
import { chatsRepository } from "../repositories/chatsRepository.js";
import type { ChatRow } from "../repositories/chatsRepository.js";
import { cancelGeneration, isGenerationActive } from "../services/generationService.js";
import { requireToken } from "../utils/auth.js";
import { sendError, sendResult } from "../utils/response.js";
import type { Chat } from "../types.js";

export const chatsRouter = Router();

chatsRouter.use(requireToken);

function toChat(row: ChatRow): Chat {
  return { id: row.id, name: row.name ?? "New chat", updatedAt: new Date(row.updatedAt).toISOString() };
}

/** GET /api/v1/chats/list - see `GetChatsRequest`/`GetChatsResponse`. */
chatsRouter.get("/list", (req, res) => {
  const querySchema = z.object({
    beforeId: z.string().optional(),
    limit: z.coerce.number().int().positive().optional(),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Invalid query", parsed.error.issues[0]?.message);
    return;
  }
  const { beforeId, limit } = parsed.data;

  // Sorted most-recently-updated first; `beforeId` continues pagination
  // *after* that chat in this order (i.e. "give me the next, older page"),
  // mirroring `GET /messages/list`'s `beforeId` semantics but adapted to a
  // list that's already sorted newest-first.
  let rows = chatsRepository.listAll();
  if (beforeId) {
    const idx = rows.findIndex((c) => c.id === beforeId);
    rows = idx === -1 ? [] : rows.slice(idx + 1);
  }
  let hasMore = false;
  if (limit !== undefined && rows.length > limit) {
    hasMore = true;
    rows = rows.slice(0, limit);
  }

  sendResult(res, { chats: rows.map(toChat), hasMore });
});

/** POST /api/v1/chats/rename - see `RenameChatRequest`/`RenameChatResponse`. */
chatsRouter.post("/rename", (req, res) => {
  const bodySchema = z.object({
    chatId: z.string().min(1),
    name: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid body", parsed.error.issues[0]?.message);
    return;
  }
  const { chatId, name } = parsed.data;

  const chat = chatsRepository.get(chatId);
  if (!chat) {
    sendError(res, 404, `Chat ${chatId} not found`);
    return;
  }
  chatsRepository.rename(chatId, name);
  sendResult(res, {});
});

/** POST /api/v1/chats/delete - see `DeleteChatRequest`/`DeleteChatResponse`. */
chatsRouter.post("/delete", (req, res) => {
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
  // Stop any in-flight generation first: `messages`/`generation_state` rows
  // cascade-delete with the chat (see schema.sql's `ON DELETE CASCADE`), and
  // an active generation would otherwise try to persist its assistant
  // message into a chat_id that no longer exists once it finishes.
  if (isGenerationActive(chatId)) {
    cancelGeneration(chatId);
  }
  chatsRepository.delete(chatId);
  sendResult(res, {});
});
