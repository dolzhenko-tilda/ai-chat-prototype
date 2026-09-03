import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureDirFor(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const dbPath = resolve(process.cwd(), env.dbPath);
ensureDirFor(dbPath);

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

/**
 * Lightweight migration for databases created before the `rate`/`rated_at`
 * columns existed (see `POST /api/v1/messages/rate`): `CREATE TABLE IF NOT
 * EXISTS` above is a no-op against an already-existing `messages` table, so
 * older on-disk databases need these columns added explicitly.
 */
const messageColumns = db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[];
const hasColumn = (name: string) => messageColumns.some((c) => c.name === name);
if (!hasColumn("rate")) {
  db.exec(`ALTER TABLE messages ADD COLUMN rate TEXT CHECK (rate IN ('like', 'dislike'))`);
}
if (!hasColumn("rated_at")) {
  db.exec(`ALTER TABLE messages ADD COLUMN rated_at INTEGER`);
}
