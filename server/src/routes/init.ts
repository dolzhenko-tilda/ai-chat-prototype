import { Router } from "express";
import { randomUUID } from "node:crypto";
import { chatsRepository } from "../repositories/chatsRepository.js";
import { tokensRepository } from "../repositories/tokensRepository.js";
import { sendResult } from "../utils/response.js";

export const initRouter = Router();

/**
 * `GET /api/v1/init` - see `ai-chat-contracts.ts`. Imitates authorization:
 * mints a fresh token (the MVP has a single implicit user, so there's
 * nothing to actually authenticate) and resolves the chat the client should
 * open - the most recently updated chat if one exists, otherwise a brand
 * new (empty, lazily-created) chat.
 */
initRouter.get("/init", (_req, res) => {
  const token = tokensRepository.create();
  const lastChat = chatsRepository.getLast();
  const chatId = lastChat ? lastChat.id : chatsRepository.ensureExists(randomUUID()).id;
  sendResult(res, { chatId, token });
});
