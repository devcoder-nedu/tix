// Opens the one SQLite file every part of Tix shares, and brings it up to date.

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

/** ~/.tix/tix.db, unless TIX_DB points elsewhere (tests and experiments use that). */
export function defaultDbPath(): string {
  return process.env.TIX_DB ?? join(homedir(), ".tix", "tix.db");
}

// The SQL files drizzle-kit generated, found relative to this file so it works
// from any current directory.
const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

export function openDb(file: string = defaultDbPath()) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);

  // WAL: the server and the MCP server open this file at the same time;
  // WAL lets one write while the others keep reading.
  sqlite.pragma("journal_mode = WAL");
  // SQLite ignores REFERENCES unless this is on, for backwards compatibility.
  sqlite.pragma("foreign_keys = ON");
  // If another process is mid-write, wait up to 5 s instead of failing at once.
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle({ client: sqlite, schema });
  // Applies any migration this file has not seen yet; a no-op when up to date.
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export type TixDb = ReturnType<typeof openDb>;
