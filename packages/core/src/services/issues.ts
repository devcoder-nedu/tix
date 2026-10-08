// Issue services: every rule about creating, changing, moving, ranking and
// deleting issues. Each write runs in a transaction, so its parts (the space's
// counter, the issue row, the activity event) are saved together or not at all.

import { generateKeyBetween } from "fractional-indexing";
import { and, asc, desc, eq, inArray, isNull, max, ne, notInArray, sql } from "drizzle-orm";
import type { Conn } from "../db.ts";
import { TixError } from "../errors.ts";
import { issueEvents, issues, spaces, sprintIssues, sprints, type ACTORS } from "../schema.ts";
import {
  issuePatchInput,
  newIssueInput,
  parse,
  type IssuePatch,
  type NewIssueInput,
} from "../validation.ts";

export type Issue = typeof issues.$inferSelect;
export type IssueEvent = typeof issueEvents.$inferSelect;
type Actor = (typeof ACTORS)[number];
type IssueType = Issue["type"];

/** Who is making a change; MCP calls pass "claude" so the activity log says so. */
export interface ChangeOptions {
  actor?: Actor;
}

const nowIso = () => new Date().toISOString();
const live = isNull(issues.deletedAt);
const WORK_TYPES: IssueType[] = ["story", "task", "bug", "spike"];

// ---- lookups

/** By current key or an old one (kept after a move), case-insensitive. */
export function findIssue(conn: Conn, key: string): Issue {
  const upper = key.trim().toUpperCase();
  const issue =
    conn
      .select()
      .from(issues)
      .where(and(live, eq(issues.key, upper)))
      .get() ??
    // previous_keys is a JSON array; json_each lets SQL look inside it.
    conn
      .select()
      .from(issues)
      .where(
        and(
          live,
          sql`EXISTS (SELECT 1 FROM json_each(${issues.previousKeys}) WHERE value = ${upper})`,
        ),
      )
      .get();
  if (!issue) throw new TixError(`No issue with key ${key}`, 404);
  return issue;
}

function logEvent(
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

// ---- rules

/** Epics have no parent; story-level issues sit under an epic (or none); subtasks under a story-level issue. */
function checkParent(conn: Conn, type: IssueType, spaceId: number, parentId: number | null) {
  if (type === "epic") {
    if (parentId !== null) throw new TixError("An epic cannot have a parent");
    return;
  }
  if (parentId === null) {
    if (type === "subtask") throw new TixError("A subtask needs a parent story or task");
    return;
  }
  const parent = conn
    .select({ type: issues.type, spaceId: issues.spaceId })
    .from(issues)
    .where(and(live, eq(issues.id, parentId)))
    .get();
  if (!parent) throw new TixError("Parent issue not found", 404);
  if (parent.spaceId !== spaceId) throw new TixError("Parent must be in the same space");
  if (type === "subtask" && !WORK_TYPES.includes(parent.type)) {
    throw new TixError("A subtask's parent must be a story, task, bug or spike");
  }
  if (type !== "subtask" && parent.type !== "epic") {
    throw new TixError(`A ${type}'s parent must be an epic`);
  }
}

function checkPoints(type: IssueType, points: number | null | undefined) {
  if (points === null || points === undefined) return;
  if (type === "epic") throw new TixError("An epic cannot carry points");
  if (type === "subtask") throw new TixError("A subtask cannot carry points");
}

function checkSprint(conn: Conn, type: IssueType, sprintId: number | null | undefined) {
  if (sprintId === null || sprintId === undefined) return;
  if (!WORK_TYPES.includes(type)) {
    throw new TixError("Only stories, tasks, bugs and spikes go into a sprint");
  }
  const sprint = conn
    .select({ state: sprints.state })
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .get();
  if (!sprint) throw new TixError("Sprint not found", 404);
  if (sprint.state === "completed") throw new TixError("Cannot add to a completed sprint", 409);
}

/** Hand out the space's next key and advance its counter. Keys are never reused. */
function takeKey(conn: Conn, spaceId: number): string {
  const space = conn
    .update(spaces)
    .set({ nextNumber: sql`${spaces.nextNumber} + 1` })
    .where(eq(spaces.id, spaceId))
    .returning({ key: spaces.key, next: spaces.nextNumber })
    .get();
  if (!space) throw new TixError("Space not found", 404);
  // `next` is the value after the increment, so this issue gets next - 1.
  return `${space.key}-${space.next - 1}`;
}

// ---- reads

export interface IssueFilter {
  spaceId?: number;
  sprintId?: number | null;
  parentId?: number;
}

export function listIssues(conn: Conn, filter: IssueFilter = {}): Issue[] {
  const conditions = [live];
  if (filter.spaceId !== undefined) conditions.push(eq(issues.spaceId, filter.spaceId));
  if (filter.sprintId === null) conditions.push(isNull(issues.sprintId));
  else if (filter.sprintId !== undefined) conditions.push(eq(issues.sprintId, filter.sprintId));
  if (filter.parentId !== undefined) conditions.push(eq(issues.parentId, filter.parentId));
  return conn
    .select()
    .from(issues)
    .where(and(...conditions))
    .orderBy(asc(issues.rank))
    .all();
}

export function getIssue(conn: Conn, key: string): Issue {
  return findIssue(conn, key);
}

/** Newest first: the Activity list on Issue detail. */
export function listEvents(conn: Conn, issueId: number): IssueEvent[] {
  return conn
    .select()
    .from(issueEvents)
    .where(eq(issueEvents.issueId, issueId))
    .orderBy(desc(issueEvents.at), desc(issueEvents.id))
    .all();
}

/** An issue plus the tags its sprint history earns (Backlog and Plan show them). */
export interface BacklogItem extends Issue {
  epic: { key: string; title: string } | null;
  slipCount: number; // sprint_issues rows with outcome carried_over or returned
  lastReturnedSprint: number | null; // sprint number, when the latest outcome was "returned"
  carriedOver: boolean; // came into its current sprint unfinished from the previous one
}

/** Add history tags to a list of issues, with one query for all their history. */
export function withHistory(conn: Conn, list: Issue[]): BacklogItem[] {
  if (list.length === 0) return [];
  const ids = list.map((i) => i.id);
  const history = conn
    .select({
      issueId: sprintIssues.issueId,
      outcome: sprintIssues.outcome,
      movedTo: sprintIssues.movedTo,
      sprintNumber: sprints.number,
    })
    .from(sprintIssues)
    .innerJoin(sprints, eq(sprints.id, sprintIssues.sprintId))
    .where(and(inArray(sprintIssues.issueId, ids), sql`${sprintIssues.outcome} IS NOT NULL`))
    .orderBy(asc(sprints.number))
    .all();
  const parentIds = [...new Set(list.map((i) => i.parentId).filter((id) => id !== null))];
  const parents = parentIds.length
    ? conn
        .select({ id: issues.id, key: issues.key, title: issues.title })
        .from(issues)
        .where(inArray(issues.id, parentIds))
        .all()
    : [];

  return list.map((issue) => {
    const own = history.filter((h) => h.issueId === issue.id); // oldest first
    const last = own.at(-1);
    const epic = parents.find((p) => p.id === issue.parentId);
    return {
      ...issue,
      epic: epic ? { key: epic.key, title: epic.title } : null,
      slipCount: own.filter((h) => h.outcome === "carried_over" || h.outcome === "returned").length,
      lastReturnedSprint: last?.outcome === "returned" ? last.sprintNumber : null,
      carriedOver: last?.outcome === "carried_over" && last.movedTo === issue.sprintId,
    };
  });
}

/** Every open story-level issue with no sprint, in rank order. */
export function listBacklog(conn: Conn): BacklogItem[] {
  const list = conn
    .select()
    .from(issues)
    .where(
      and(
        live,
        isNull(issues.sprintId),
        ne(issues.status, "done"),
        notInArray(issues.type, ["epic", "subtask"]),
      ),
    )
    .orderBy(asc(issues.rank))
    .all();
  return withHistory(conn, list);
}

/** Key, old key or title matches: exact key first, then key prefix, then title. */
export function searchIssues(conn: Conn, text: string, limit = 8): Issue[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`; // treat % and _ as plain text
  const candidates = conn
    .select()
    .from(issues)
    .where(
      and(
        live,
        sql`(lower(${issues.key}) LIKE ${like} ESCAPE '\\'
          OR lower(${issues.title}) LIKE ${like} ESCAPE '\\'
          OR lower(${issues.previousKeys}) LIKE ${like} ESCAPE '\\')`,
      ),
    )
    .all();
  const score = (i: Issue) => {
    const keys = [i.key, ...i.previousKeys].map((k) => k.toLowerCase());
    if (keys.includes(q)) return 0;
    if (keys.some((k) => k.startsWith(q))) return 1;
    if (i.title.toLowerCase().includes(q)) return 2;
    return 3;
  };
  return candidates
    .map((issue) => ({ issue, s: score(issue) }))
    .filter(({ s }) => s < 3)
    .sort(
      (a, b) => a.s - b.s || Number(a.issue.status === "done") - Number(b.issue.status === "done"),
    )
    .slice(0, limit)
    .map(({ issue }) => issue);
}

// ---- writes

export function createIssue(conn: Conn, input: NewIssueInput): Issue {
  const values = parse(newIssueInput, input);
  return conn.transaction((tx) => {
    checkParent(tx, values.type, values.spaceId, values.parentId);
    checkPoints(values.type, values.points);
    checkSprint(tx, values.type, values.sprintId);

    const key = takeKey(tx, values.spaceId);
    // New issues go to the bottom of the backlog: a rank after the current last one.
    const last =
      tx
        .select({ rank: max(issues.rank) })
        .from(issues)
        .get()?.rank ?? null;
    const now = nowIso();
    const issue = tx
      .insert(issues)
      .values({
        ...values,
        key,
        acceptanceCriteria: values.acceptanceCriteria.map((text) => ({ text, done: false })),
        rank: generateKeyBetween(last, null),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    logEvent(
      tx,
      issue.id,
      "created",
      null,
      issue.createdBy === "claude" ? "via Claude" : "from the Create form",
      issue.createdBy,
    );

    // Added straight into a running sprint: it joins that sprint's commitment.
    if (issue.sprintId !== null) joinRunningSprint(tx, issue);
    return issue;
  });
}

/** If the issue's sprint is already running, give it a sprint_issues row (points at start). */
function joinRunningSprint(conn: Conn, issue: Issue) {
  if (issue.sprintId === null) return;
  const sprint = conn
    .select({ state: sprints.state })
    .from(sprints)
    .where(eq(sprints.id, issue.sprintId))
    .get();
  if (sprint?.state !== "active") return;
  conn
    .insert(sprintIssues)
    .values({ sprintId: issue.sprintId, issueId: issue.id, pointsAtStart: issue.points })
    .onConflictDoNothing() // already part of it
    .run();
}

export function updateIssue(
  conn: Conn,
  key: string,
  input: IssuePatch,
  opts: ChangeOptions = {},
): Issue {
  const patch = parse(issuePatchInput, input);
  const actor = opts.actor ?? "me";
  return conn.transaction((tx) => {
    const issue = findIssue(tx, key);
    if (patch.points !== undefined) checkPoints(issue.type, patch.points);
    if (patch.parentId !== undefined) checkParent(tx, issue.type, issue.spaceId, patch.parentId);
    if (patch.sprintId !== undefined) checkSprint(tx, issue.type, patch.sprintId);

    // Every status, sprint and points change goes into the activity log.
    const changes: Partial<Issue> = { ...patch, updatedAt: nowIso() };
    if (patch.status !== undefined && patch.status !== issue.status) {
      logEvent(tx, issue.id, "status", issue.status, patch.status, actor);
      changes.completedAt = patch.status === "done" ? nowIso() : null;
    }
    if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
      logEvent(tx, issue.id, "sprint", issue.sprintId, patch.sprintId, actor);
      // Leaving a running sprint before it ends: drop the open commitment row.
      if (issue.sprintId !== null) {
        tx.delete(sprintIssues)
          .where(
            and(
              eq(sprintIssues.sprintId, issue.sprintId),
              eq(sprintIssues.issueId, issue.id),
              isNull(sprintIssues.outcome),
            ),
          )
          .run();
      }
    }
    if (patch.points !== undefined && patch.points !== issue.points) {
      logEvent(tx, issue.id, "points", issue.points, patch.points, actor);
    }

    const updated = tx.update(issues).set(changes).where(eq(issues.id, issue.id)).returning().get();
    if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId)
      joinRunningSprint(tx, updated);
    return updated;
  });
}

/** Move a story-level issue (and its subtasks) to another space: new keys, old ones kept as aliases. */
export function moveIssueToSpace(
  conn: Conn,
  key: string,
  spaceId: number,
  opts: ChangeOptions = {},
): Issue {
  return conn.transaction((tx) => {
    const issue = findIssue(tx, key);
    if (!WORK_TYPES.includes(issue.type)) {
      throw new TixError(
        issue.type === "subtask"
          ? "A subtask moves with its parent; move the parent instead"
          : "An epic cannot move; move its issues one by one",
      );
    }
    const target = tx
      .select()
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), eq(spaces.archived, false)))
      .get();
    if (!target) throw new TixError("Space not found", 404);
    if (target.id === issue.spaceId) return issue;

    const moveOne = (i: Issue, extra: Partial<Issue> = {}) => {
      const newKey = takeKey(tx, target.id);
      logEvent(tx, i.id, "space", i.key, newKey, opts.actor);
      return tx
        .update(issues)
        .set({
          key: newKey,
          spaceId: target.id,
          previousKeys: [...i.previousKeys, i.key],
          updatedAt: nowIso(),
          ...extra,
        })
        .where(eq(issues.id, i.id))
        .returning()
        .get();
    };
    const moved = moveOne(issue, { parentId: null }); // its epic belongs to the old space
    const subtasks = tx
      .select()
      .from(issues)
      .where(and(live, eq(issues.parentId, issue.id)))
      .all();
    for (const sub of subtasks) moveOne(sub);
    return moved;
  });
}

/** Put an issue between two neighbours. Only this issue's rank changes. */
export function rankIssue(
  conn: Conn,
  key: string,
  position: { prevKey: string | null; nextKey: string | null },
): Issue {
  return conn.transaction((tx) => {
    const issue = findIssue(tx, key);
    const prev = position.prevKey ? findIssue(tx, position.prevKey) : null;
    const next = position.nextKey ? findIssue(tx, position.nextKey) : null;
    if (prev && next && prev.rank >= next.rank) {
      throw new TixError("Neighbours are out of order; refresh and try again", 409);
    }
    return tx
      .update(issues)
      .set({
        rank: generateKeyBetween(prev?.rank ?? null, next?.rank ?? null),
        updatedAt: nowIso(),
      })
      .where(eq(issues.id, issue.id))
      .returning()
      .get();
  });
}

/** Soft delete: hidden now, restorable for 30 days. An epic with open issues is blocked. */
export function deleteIssue(conn: Conn, key: string): void {
  conn.transaction((tx) => {
    const issue = findIssue(tx, key);
    if (issue.type === "epic") {
      const open = tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(live, eq(issues.parentId, issue.id), ne(issues.status, "done")))
        .get();
      if (open)
        throw new TixError("This epic still has open issues; finish or move them first", 409);
    }
    tx.update(issues).set({ deletedAt: nowIso() }).where(eq(issues.id, issue.id)).run();
  });
}
