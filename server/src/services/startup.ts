import { db } from "../db/index.js";
import { messagesRepository } from "../repositories/messagesRepository.js";

interface StaleRow {
  chat_id: string;
  message_id: string;
}

const findActiveStmt = db.prepare(
  `SELECT chat_id, message_id FROM generation_state WHERE is_active = 1`
);
const clearAllActiveStmt = db.prepare(
  `UPDATE generation_state SET is_active = 0, abort_requested = 0, updated_at = ? WHERE is_active = 1`
);

/**
 * On boot, any generation_state rows still marked `is_active` belong to a
 * previous process (in-memory streamText calls can't survive a restart).
 * Mark them aborted so `/resume` correctly reports "nothing active" instead
 * of hanging forever, and flip their assistant message out of "streaming".
 */
export function reconcileStaleGenerationsOnStartup() {
  const stale = findActiveStmt.all() as StaleRow[];
  for (const row of stale) {
    const message = messagesRepository.getById(row.message_id);
    if (message && message.status === "streaming") {
      messagesRepository.update(row.message_id, message.parts, "aborted");
    }
  }
  clearAllActiveStmt.run(Date.now());
  if (stale.length > 0) {
    console.log(`[startup] reconciled ${stale.length} stale generation(s) from a previous run`);
  }
}
