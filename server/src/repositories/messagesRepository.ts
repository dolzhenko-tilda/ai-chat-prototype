import { db } from "../db/index.js";
import type { AppUIMessage, MessageRow, MessageStatus } from "../types.js";

interface RawRow {
  id: string;
  chat_id: string;
  role: MessageRow["role"];
  parts: string;
  status: MessageStatus;
  seq: number;
  created_at: number;
}

function toMessageRow(row: RawRow): MessageRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    parts: JSON.parse(row.parts),
    status: row.status,
    seq: row.seq,
    createdAt: row.created_at,
  };
}

const insertStmt = db.prepare(
  `INSERT INTO messages (id, chat_id, role, parts, status, seq, created_at)
   VALUES (@id, @chatId, @role, @parts, @status, @seq, @createdAt)`
);
const updateStmt = db.prepare(
  `UPDATE messages SET parts = @parts, status = @status WHERE id = @id`
);
const listByChatStmt = db.prepare(
  `SELECT id, chat_id, role, parts, status, seq, created_at FROM messages WHERE chat_id = ? ORDER BY seq ASC`
);
const getByIdStmt = db.prepare(
  `SELECT id, chat_id, role, parts, status, seq, created_at FROM messages WHERE id = ?`
);
const deleteStmt = db.prepare(`DELETE FROM messages WHERE id = ?`);
const maxSeqStmt = db.prepare(`SELECT COALESCE(MAX(seq), -1) as maxSeq FROM messages WHERE chat_id = ?`);

export const messagesRepository = {
  listByChat(chatId: string): MessageRow[] {
    return (listByChatStmt.all(chatId) as RawRow[]).map(toMessageRow);
  },

  getById(messageId: string): MessageRow | undefined {
    const row = getByIdStmt.get(messageId) as RawRow | undefined;
    return row ? toMessageRow(row) : undefined;
  },

  nextSeq(chatId: string): number {
    const { maxSeq } = maxSeqStmt.get(chatId) as { maxSeq: number };
    return maxSeq + 1;
  },

  insert(row: Omit<MessageRow, "seq"> & { seq?: number }): MessageRow {
    const seq = row.seq ?? this.nextSeq(row.chatId);
    insertStmt.run({
      id: row.id,
      chatId: row.chatId,
      role: row.role,
      parts: JSON.stringify(row.parts),
      status: row.status,
      seq,
      createdAt: row.createdAt,
    });
    return { ...row, seq };
  },

  update(id: string, parts: AppUIMessage["parts"], status: MessageStatus) {
    updateStmt.run({ id, parts: JSON.stringify(parts), status });
  },

  delete(messageId: string) {
    deleteStmt.run(messageId);
  },
};
