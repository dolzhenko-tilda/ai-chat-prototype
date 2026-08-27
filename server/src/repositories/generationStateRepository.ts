import { db } from "../db/index.js";
import type { AppUIMessageChunk } from "../types.js";

interface RawRow {
  chat_id: string;
  message_id: string;
  accumulated_chunks: string;
  is_active: number;
  abort_requested: number;
  updated_at: number;
}

export interface GenerationStateRow {
  chatId: string;
  messageId: string;
  accumulatedChunks: AppUIMessageChunk[];
  isActive: boolean;
  abortRequested: boolean;
  updatedAt: number;
}

function toRow(row: RawRow): GenerationStateRow {
  return {
    chatId: row.chat_id,
    messageId: row.message_id,
    accumulatedChunks: JSON.parse(row.accumulated_chunks),
    isActive: row.is_active === 1,
    abortRequested: row.abort_requested === 1,
    updatedAt: row.updated_at,
  };
}

const upsertStmt = db.prepare(`
  INSERT INTO generation_state (chat_id, message_id, accumulated_chunks, is_active, abort_requested, updated_at)
  VALUES (@chatId, @messageId, @accumulatedChunks, @isActive, @abortRequested, @updatedAt)
  ON CONFLICT(chat_id) DO UPDATE SET
    message_id = excluded.message_id,
    accumulated_chunks = excluded.accumulated_chunks,
    is_active = excluded.is_active,
    abort_requested = excluded.abort_requested,
    updated_at = excluded.updated_at
`);
const getStmt = db.prepare(`SELECT * FROM generation_state WHERE chat_id = ?`);
const appendChunkStmt = db.prepare(
  `UPDATE generation_state SET accumulated_chunks = ?, updated_at = ? WHERE chat_id = ?`
);
const setAbortRequestedStmt = db.prepare(
  `UPDATE generation_state SET abort_requested = 1, updated_at = ? WHERE chat_id = ? AND is_active = 1`
);
const clearStmt = db.prepare(
  `UPDATE generation_state SET is_active = 0, abort_requested = 0, updated_at = ? WHERE chat_id = ?`
);

export const generationStateRepository = {
  get(chatId: string): GenerationStateRow | undefined {
    const row = getStmt.get(chatId) as RawRow | undefined;
    return row ? toRow(row) : undefined;
  },

  start(chatId: string, messageId: string) {
    upsertStmt.run({
      chatId,
      messageId,
      accumulatedChunks: "[]",
      isActive: 1,
      abortRequested: 0,
      updatedAt: Date.now(),
    });
  },

  appendChunk(chatId: string, chunks: AppUIMessageChunk[]) {
    appendChunkStmt.run(JSON.stringify(chunks), Date.now(), chatId);
  },

  requestAbort(chatId: string) {
    setAbortRequestedStmt.run(Date.now(), chatId);
  },

  finish(chatId: string) {
    clearStmt.run(Date.now(), chatId);
  },
};
