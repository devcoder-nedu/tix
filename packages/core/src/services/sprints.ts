// Sprint services: plan, start, complete (with rollover), and the numbers
// Past sprints and velocity read from sprint_issues.

import { and, asc, desc, eq, inArray, max, notInArray } from "drizzle-orm";
import { addDays, sprintEndDate } from "../dates.ts";
import type { Conn } from "../db.ts";
import { TixError } from "../errors.ts";
import { insights, issues, sprintIssues, sprints, type INSIGHT_KINDS } from "../schema.ts";
import {
  parse,
  rolloverInput,
  sprintInput,
  sprintPatchInput,
  type Rollover,
  type SprintInput,
  type SprintPatch,
} from "../validation.ts";
import { findIssue, updateIssue, withHistory, type BacklogItem } from "./issues.ts";
import { live, logEvent, nowIso, WORK_TYPES, type ChangeOptions, type Issue } from "./shared.ts";

export type Sprint = typeof sprints.$inferSelect;
export type SprintIssue = typeof sprintIssues.$inferSelect;
export type Insight = typeof insights.$inferSelect;

/** Committed against done for one completed sprint; the numbers behind velocity. */
export interface SprintResult {
  sprintId: number;
  number: number;
  committed: number;
  done: number;
}

/** An issue as it ended a sprint: what it was worth at the start and where it went. */
export interface SprintIssueResult extends Issue {
  pointsAtStart: number | null;
  outcome: SprintIssue["outcome"];
  movedToSprint: number | null; // sprint number, when carried over
}

export interface SprintSummary {
  sprintId: number;
  committed: number;
  done: number;
  unfinished: number;
  percent: number;
  bySpace: { spaceId: number; committed: number; done: number }[];
  finishedIssues: SprintIssueResult[];
  unfinishedIssues: SprintIssueResult[];
}

export interface Velocity {
  average: number | null; // null until a sprint has been completed
  recent: SprintResult[]; // the last 3 completed sprints, oldest first
}

// ---- lookups

export function findSprint(conn: Conn, id: number): Sprint {
  const sprint = conn.select().from(sprints).where(eq(sprints.id, id)).get();
  if (!sprint) throw new TixError("Sprint not found", 404);
  return sprint;
}

export function listSprints(conn: Conn): Sprint[] {
  return conn.select().from(sprints).orderBy(asc(sprints.number)).all();
}

/** The story-level issues in a sprint, with history tags (Plan shows "carried over"). */
export function listSprintItems(conn: Conn, sprintId: number): BacklogItem[] {
  findSprint(conn, sprintId);
  const list = conn
    .select()
    .from(issues)
    .where(and(live, eq(issues.sprintId, sprintId), notInArray(issues.type, ["epic", "subtask"])))
    .orderBy(asc(issues.rank))
    .all();
  return withHistory(conn, list);
}

/** The sprint_issues rows of a sprint, each with its issue. */
function sprintRows(conn: Conn, sprintId: number) {
  return conn
    .select({ row: sprintIssues, issue: issues })
    .from(sprintIssues)
    .innerJoin(issues, eq(issues.id, sprintIssues.issueId))
    .where(eq(sprintIssues.sprintId, sprintId))
    .orderBy(asc(issues.rank))
    .all();
}

const sumPoints = (rows: { row: SprintIssue }[]) =>
  rows.reduce((n, { row }) => n + (row.pointsAtStart ?? 0), 0);

// ---- planning

export function createSprint(conn: Conn, input: SprintInput): Sprint {
  const values = parse(sprintInput, input);
  return conn.transaction((tx) => {
    // One sprint is planned at a time (the database enforces it too).
    if (tx.select({ id: sprints.id }).from(sprints).where(eq(sprints.state, "planned")).get()) {
      throw new TixError("A planned sprint already exists; plan that one first", 409);
    }
    const number =
      (tx
        .select({ n: max(sprints.number) })
        .from(sprints)
        .get()?.n ?? 0) + 1;
    return tx
      .insert(sprints)
      .values({
        ...values,
        number,
        name: `Sprint ${number}`,
        endDate: sprintEndDate(values.startDate, values.lengthWeeks),
        state: "planned",
      })
      .returning()
      .get();
  });
}

export function updateSprint(conn: Conn, id: number, input: SprintPatch): Sprint {
  const patch = parse(sprintPatchInput, input);
  return conn.transaction((tx) => {
    const sprint = findSprint(tx, id);
    if (sprint.state === "completed") throw new TixError("A completed sprint cannot change", 409);
    if (sprint.state === "active" && (patch.startDate || patch.lengthWeeks)) {
      throw new TixError("Dates of a running sprint cannot change", 409);
    }
    const startDate = patch.startDate ?? sprint.startDate;
    const lengthWeeks = patch.lengthWeeks ?? sprint.lengthWeeks;
    return (
      tx
        .update(sprints)
        // end_date is always worked out from start and length, never typed in.
        .set({ ...patch, endDate: sprintEndDate(startDate, lengthWeeks) })
        .where(eq(sprints.id, id))
        .returning()
        .get()
    );
  });
}

/** Put issues into a sprint. Added to a running sprint, they join its commitment. */
export function addToSprint(
  conn: Conn,
  sprintId: number,
  keys: string[],
  opts: ChangeOptions = {},
): void {
  conn.transaction((tx) => {
    const sprint = findSprint(tx, sprintId);
    if (sprint.state === "completed") throw new TixError("Cannot add to a completed sprint", 409);
    const list = keys.map((key) => findIssue(tx, key));
    // Check them all before changing any: one bad key means none are added.
    for (const issue of list) {
      if (!WORK_TYPES.includes(issue.type)) {
        throw new TixError(`${issue.key}: only stories, tasks, bugs and spikes go into a sprint`);
      }
      if (issue.status === "done") throw new TixError(`${issue.key} is already done`);
    }
    for (const issue of list) {
      if (issue.sprintId !== sprintId) updateIssue(tx, issue.key, { sprintId }, opts);
    }
  });
}

export function removeFromSprint(
  conn: Conn,
  sprintId: number,
  keys: string[],
  opts: ChangeOptions = {},
): void {
  conn.transaction((tx) => {
    const sprint = findSprint(tx, sprintId);
    if (sprint.state === "completed") throw new TixError("Cannot change a completed sprint", 409);
    for (const key of keys) {
      const issue = findIssue(tx, key);
      if (issue.sprintId === sprintId) updateIssue(tx, issue.key, { sprintId: null }, opts);
    }
  });
}

/** Allowed only when no other sprint is active. Freezes the commitment in points_at_start. */
export function startSprint(conn: Conn, id: number): Sprint {
  return conn.transaction((tx) => {
    const sprint = findSprint(tx, id);
    if (sprint.state !== "planned") throw new TixError("Only a planned sprint can start", 409);
    const active = tx.select().from(sprints).where(eq(sprints.state, "active")).get();
    if (active) throw new TixError(`${active.name} is still running; complete it first`, 409);

    const members = tx
      .select({ id: issues.id, points: issues.points })
      .from(issues)
      .where(and(live, eq(issues.sprintId, id), inArray(issues.type, WORK_TYPES)))
      .all();
    // Re-estimating later won't rewrite what was committed at the start.
    if (members.length) {
      tx.insert(sprintIssues)
        .values(members.map((m) => ({ sprintId: id, issueId: m.id, pointsAtStart: m.points })))
        .onConflictDoNothing()
        .run();
    }
    return tx.update(sprints).set({ state: "active" }).where(eq(sprints.id, id)).returning().get();
  });
}

/**
 * Close the running sprint. Done issues get outcome "done". Each unfinished
 * issue goes to the next sprint ("carried_over"; the sprint is created if
 * needed) or back to the backlog ("returned", the default). Status and ticked
 * criteria are kept.
 */
export function completeSprint(
  conn: Conn,
  id: number,
  input: Record<string, Rollover>,
  opts: ChangeOptions = {},
): Sprint {
  const moves = parse(rolloverInput, input);
  const actor = opts.actor ?? "me";
  return conn.transaction((tx) => {
    const sprint = findSprint(tx, id);
    if (sprint.state !== "active") throw new TixError("Only the running sprint can complete", 409);

    // Safety net: anything in the sprint without a history row still gets one,
    // so the history never silently drops work.
    const members = tx
      .select({ id: issues.id, points: issues.points })
      .from(issues)
      .where(and(live, eq(issues.sprintId, id), inArray(issues.type, WORK_TYPES)))
      .all();
    if (members.length) {
      tx.insert(sprintIssues)
        .values(members.map((m) => ({ sprintId: id, issueId: m.id, pointsAtStart: m.points })))
        .onConflictDoNothing()
        .run();
    }

    const open = sprintRows(tx, id).filter(({ row }) => row.outcome === null);
    const unfinished = open.filter(({ issue }) => issue.status !== "done");
    const keyOf = (issue: Issue) =>
      [issue.key, ...issue.previousKeys].find((k) => moves[k]) ?? issue.key;
    const wantsNext = unfinished.some(({ issue }) => moves[keyOf(issue)] === "next");

    let next = tx.select().from(sprints).where(eq(sprints.state, "planned")).get();
    if (wantsNext && !next) {
      // "Sprint 5 (new)": same length and capacity, starting the day after.
      const number =
        (tx
          .select({ n: max(sprints.number) })
          .from(sprints)
          .get()?.n ?? 0) + 1;
      const startDate = addDays(sprint.endDate, 1);
      next = tx
        .insert(sprints)
        .values({
          number,
          name: `Sprint ${number}`,
          lengthWeeks: sprint.lengthWeeks,
          startDate,
          endDate: sprintEndDate(startDate, sprint.lengthWeeks),
          capacity: sprint.capacity,
          state: "planned",
        })
        .returning()
        .get();
    }

    const setOutcome = (issueId: number, values: Partial<SprintIssue>) =>
      tx
        .update(sprintIssues)
        .set(values)
        .where(and(eq(sprintIssues.sprintId, id), eq(sprintIssues.issueId, issueId)))
        .run();

    for (const { issue } of open) {
      if (issue.status === "done") {
        setOutcome(issue.id, { outcome: "done" }); // keeps pointing at this sprint: its history
        continue;
      }
      const target = moves[keyOf(issue)] === "next" && next ? next.id : null;
      setOutcome(
        issue.id,
        target ? { outcome: "carried_over", movedTo: target } : { outcome: "returned" },
      );
      logEvent(tx, issue.id, "sprint", id, target, actor);
      // Only the sprint changes: status and ticked criteria stay as they were.
      tx.update(issues)
        .set({ sprintId: target, updatedAt: nowIso() })
        .where(eq(issues.id, issue.id))
        .run();
    }

    return tx
      .update(sprints)
      .set({ state: "completed", completedAt: nowIso() })
      .where(eq(sprints.id, id))
      .returning()
      .get();
  });
}

// ---- history and numbers

function sprintResult(conn: Conn, sprint: Sprint): SprintResult {
  const rows = sprintRows(conn, sprint.id);
  return {
    sprintId: sprint.id,
    number: sprint.number,
    committed: sumPoints(rows),
    done: sumPoints(rows.filter(({ row }) => row.outcome === "done")),
  };
}

function completedSprints(conn: Conn): Sprint[] {
  return conn
    .select()
    .from(sprints)
    .where(eq(sprints.state, "completed"))
    .orderBy(asc(sprints.number))
    .all();
}

/** Committed against done for every completed sprint, oldest first. */
export function listSprintResults(conn: Conn): SprintResult[] {
  return completedSprints(conn).map((s) => sprintResult(conn, s));
}

/** Average done points over the last 3 completed sprints. */
export function getVelocity(conn: Conn): Velocity {
  const recent = completedSprints(conn)
    .slice(-3)
    .map((s) => sprintResult(conn, s));
  const average = recent.length
    ? Math.round(recent.reduce((n, r) => n + r.done, 0) / recent.length)
    : null;
  return { average, recent };
}

/** The numbers behind Complete sprint and Past sprints. */
export function getSprintSummary(conn: Conn, id: number): SprintSummary {
  const sprint = findSprint(conn, id);
  const rows = sprintRows(conn, id);
  // A running sprint counts done by status now; a completed one by its recorded outcome.
  const isDone = ({ row, issue }: (typeof rows)[number]) =>
    sprint.state === "completed" ? row.outcome === "done" : issue.status === "done";
  const finished = rows.filter(isDone);
  const unfinished = rows.filter((r) => !isDone(r));
  const numbers = new Map(listSprints(conn).map((s) => [s.id, s.number]));
  const asResult = ({ row, issue }: (typeof rows)[number]): SprintIssueResult => ({
    ...issue,
    pointsAtStart: row.pointsAtStart,
    outcome: row.outcome,
    movedToSprint: row.movedTo ? (numbers.get(row.movedTo) ?? null) : null,
  });
  const committed = sumPoints(rows);
  const done = sumPoints(finished);
  const spaceIds = [...new Set(rows.map(({ issue }) => issue.spaceId))];

  return {
    sprintId: id,
    committed,
    done,
    unfinished: sumPoints(unfinished),
    percent: committed ? Math.round((done / committed) * 100) : 0,
    bySpace: spaceIds
      .map((spaceId) => ({
        spaceId,
        committed: sumPoints(rows.filter(({ issue }) => issue.spaceId === spaceId)),
        done: sumPoints(finished.filter(({ issue }) => issue.spaceId === spaceId)),
      }))
      .sort((a, b) => b.committed - a.committed),
    finishedIssues: finished.map(asResult),
    unfinishedIssues: unfinished.map(asResult),
  };
}

/** The latest saved write up of a kind for a sprint, or null. */
export function getInsight(
  conn: Conn,
  kind: (typeof INSIGHT_KINDS)[number],
  sprintId: number,
): Insight | null {
  return (
    conn
      .select()
      .from(insights)
      .where(and(eq(insights.kind, kind), eq(insights.sprintId, sprintId)))
      .orderBy(desc(insights.createdAt))
      .get() ?? null
  );
}

/** The running sprint, or null. */
export const activeSprint = (conn: Conn): Sprint | null =>
  conn.select().from(sprints).where(eq(sprints.state, "active")).get() ?? null;
