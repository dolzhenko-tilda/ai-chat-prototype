import { db } from "../db/index.js";

export interface ChatRow {
  id: string;
  createdAt: number;
  updatedAt: number;
}

const insertChatStmt = db.prepare(
  `INSERT INTO chats (id, created_at, updated_at) VALUES (@id, @createdAt, @updatedAt)`
);
const getChatStmt = db.prepare(`SELECT id, created_at as createdAt, updated_at as updatedAt FROM chats WHERE id = ?`);
const touchChatStmt = db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`);

export const chatsRepository = {
  get(chatId: string): ChatRow | undefined {
    return getChatStmt.get(chatId) as ChatRow | undefined;
  },

  /** Creates the chat row if it doesn't exist yet (chats are created implicitly, see README). */
  ensureExists(chatId: string): ChatRow {
    const existing = this.get(chatId);
    if (existing) return existing;
    const now = Date.now();
    insertChatStmt.run({ id: chatId, createdAt: now, updatedAt: now });
    return { id: chatId, createdAt: now, updatedAt: now };
  },

  touch(chatId: string) {
    touchChatStmt.run(Date.now(), chatId);
  },
};
