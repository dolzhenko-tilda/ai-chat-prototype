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
 * Lightweight migrations for databases created before certain columns
 * existed: `CREATE TABLE IF NOT EXISTS` above is a no-op against an
 * already-existing table, so older on-disk databases need these columns
 * added explicitly.
 */
function ensureColumn(table: string, column: string, ddl: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// `rate`/`rated_at` (see `POST /api/v1/messages/rate`).
ensureColumn("messages", "rate", `rate TEXT CHECK (rate IN ('like', 'dislike'))`);
ensureColumn("messages", "rated_at", `rated_at INTEGER`);
// `name` (see `POST /api/v1/chats/rename` and auto-titling in routes/messages.ts).
ensureColumn("chats", "name", `name TEXT`);
