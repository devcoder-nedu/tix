// The fake database: the seven tables held in memory and saved to localStorage,
// so changes survive a page refresh. Replaced by SQLite once packages/core exists.

import type { Insight, Issue, IssueEvent, Settings, Space, Sprint, SprintIssue } from "../types";
import { buildSeed } from "./seed";

export interface Db {
  spaces: Space[];
  issues: Issue[];
  sprints: Sprint[];
  sprintIssues: SprintIssue[];
  events: IssueEvent[];
  insights: Insight[];
  settings: Settings;
}

// Bump the version when the Db shape changes, so old saved data is replaced
// instead of crashing the app with fields it no longer has.
const STORAGE_KEY = "tix:fake-db:v1";

function load(): Db {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Db;
  } catch {
    // Corrupt or blocked storage: fall through to a fresh seed.
  }
  return buildSeed();
}

export let db: Db = load();

export function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

/** Throw away all changes and start again from the mockup data. */
export function resetDb(): void {
  db = buildSeed();
  save();
}
