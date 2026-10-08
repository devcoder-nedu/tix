// Small helpers the issue and sprint services both need.

import { isNull } from "drizzle-orm";
import type { Conn } from "../db.ts";
import { issueEvents, issues, type ACTORS } from "../schema.ts";

export type Issue = typeof issues.$inferSelect;
export type IssueEvent = typeof issueEvents.$inferSelect;
export type Actor = (typeof ACTORS)[number];

/** Who is making a change; MCP calls pass "claude" so the activity log says so. */
export interface ChangeOptions {
  actor?: Actor;
  /** For creates: shown in the activity log, e.g. "from the CLI". */
  source?: string;
}

/** Story-level types: the only ones that carry points and go into sprints. */
export const WORK_TYPES: Issue["type"][] = ["story", "task", "bug", "spike"];

export const nowIso = () => new Date().toISOString();

/** Not soft deleted. */
export const live = isNull(issues.deletedAt);

/** One activity log row. Values are stored as text ("in_progress", "4", null). */
export function logEvent(
  conn: Conn,
  issueId: number,
  kind: IssueEvent["kind"],
  from: unknown,
  to: unknown,
  actor: Actor = "me",
) {
  const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
  conn
    .insert(issueEvents)
    .values({ issueId, kind, fromValue: text(from), toValue: text(to), actor, at: nowIso() })
    .run();
}
