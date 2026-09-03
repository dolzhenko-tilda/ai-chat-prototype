import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";

const insertStmt = db.prepare(`INSERT INTO tokens (token, created_at) VALUES (?, ?)`);
const existsStmt = db.prepare(`SELECT 1 FROM tokens WHERE token = ?`);

/**
 * Mock auth (see `ai-chat-contracts.ts`'s `GET /api/v1/init`): the MVP has a
 * single implicit user, so a token is just an opaque proof that the client
 * completed `/init` - it isn't linked to any particular chat/user row.
 */
export const tokensRepository = {
  /** Mints and persists a brand new token. */
  create(): string {
    const token = randomUUID();
    insertStmt.run(token, Date.now());
    return token;
  },

  isValid(token: unknown): token is string {
    return typeof token === "string" && token.length > 0 && existsStmt.get(token) !== undefined;
  },
};
