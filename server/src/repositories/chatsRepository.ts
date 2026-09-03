import { db } from "../db/index.js";

export interface ChatRow {
  id: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
}

const insertChatStmt = db.prepare(
  `INSERT INTO chats (id, created_at, updated_at) VALUES (@id, @createdAt, @updatedAt)`
);
const getChatStmt = db.prepare(
  `SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM chats WHERE id = ?`
);
const touchChatStmt = db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`);
const renameChatStmt = db.prepare(`UPDATE chats SET name = @name WHERE id = @id`);
const deleteChatStmt = db.prepare(`DELETE FROM chats WHERE id = ?`);
const getLastChatStmt = db.prepare(
  `SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM chats ORDER BY updated_at DESC LIMIT 1`
);
const listChatsStmt = db.prepare(
  `SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM chats ORDER BY updated_at DESC`
);

export const chatsRepository = {
  get(chatId: string): ChatRow | undefined {
    return getChatStmt.get(chatId) as ChatRow | undefined;
  },

  /** Most recently updated chat, if any (used by `GET /api/v1/init` - see routes/init.ts). */
  getLast(): ChatRow | undefined {
    return getLastChatStmt.get() as ChatRow | undefined;
  },

  /** All chats, most recently updated first (see `GET /api/v1/chats/list`). */
  listAll(): ChatRow[] {
    return listChatsStmt.all() as ChatRow[];
  },

  /** Creates the chat row if it doesn't exist yet (chats are created implicitly, see README). */
  ensureExists(chatId: string): ChatRow {
    const existing = this.get(chatId);
    if (existing) return existing;
    const now = Date.now();
    insertChatStmt.run({ id: chatId, createdAt: now, updatedAt: now });
    return { id: chatId, name: null, createdAt: now, updatedAt: now };
  },

  touch(chatId: string) {
    touchChatStmt.run(Date.now(), chatId);
  },

  /**
   * Explicit rename (see `POST /api/v1/chats/rename`). Deliberately does
   * *not* touch `updated_at`: that column (and the `updatedAt` surfaced to
   * the client) tracks the chat's last message activity, used to sort
   * `GET /api/v1/chats/list` and to display "last modified" - renaming
   * isn't activity and shouldn't reorder or re-date the chat.
   */
  rename(chatId: string, name: string) {
    renameChatStmt.run({ id: chatId, name });
  },

  /** Auto-titles a still-unnamed chat (e.g. from its first user message); a no-op if already named. */
  setNameIfUnset(chatId: string, name: string) {
    const chat = this.get(chatId);
    if (chat && !chat.name) {
      renameChatStmt.run({ id: chatId, name });
    }
  },

  delete(chatId: string) {
    deleteChatStmt.run(chatId);
  },
};
