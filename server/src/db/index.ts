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
