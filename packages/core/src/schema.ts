// The seven tables from the design doc, described in TypeScript.
// drizzle-kit reads this file and writes the SQL migration that creates them;
// drizzle-orm uses it to type-check every query.
//
// Rules that can live in the database do: CHECK constraints and partial unique
// indexes reject bad data even if a bug in the services lets it through.

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const ISSUE_TYPES = ["epic", "story", "task", "bug", "spike", "subtask"] as const;
export const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const POINTS = [1, 2, 3, 5, 8, 13] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const ACTORS = ["me", "claude"] as const;
export const SPRINT_STATES = ["planned", "active", "completed"] as const;
export const OUTCOMES = ["done", "carried_over", "returned"] as const;
export const EVENT_KINDS = ["created", "status", "sprint", "points", "space", "field"] as const;
export const INSIGHT_KINDS = [
  "sprint_review",
  "check_in",
  "planning_hint",
  "pattern_report",
] as const;

export type Criterion = { text: string; done: boolean };

/** SQL list for a CHECK: ('todo', 'in_progress', ...). Values are our own constants, never user input. */
const sqlList = (values: readonly (string | number)[]) =>
  sql.raw(`(${values.map((v) => (typeof v === "number" ? v : `'${v}'`)).join(", ")})`);

// Timestamps are ISO strings ("2026-10-08T09:00:00.000Z") and dates "2026-10-08":
// both sort correctly as text and match what the UI already uses.
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const spaces = sqliteTable("spaces", {
  id: integer().primaryKey({ autoIncrement: true }),
  key: text().notNull().unique(), // "FR"
  name: text().notNull(),
  color: text().notNull(),
  description: text().notNull().default(""),
  nextNumber: integer("next_number").notNull().default(1), // FR-15 follows FR-14
  archived: integer({ mode: "boolean" }).notNull().default(false),
});

export const sprints = sqliteTable(
  "sprints",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    number: integer().notNull().unique(),
    name: text().notNull(),
    goal: text().notNull().default(""),
    lengthWeeks: integer("length_weeks").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    capacity: integer().notNull(),
    state: text({ enum: SPRINT_STATES }).notNull().default("planned"),
    completedAt: text("completed_at"),
  },
  (t) => [
    check("sprint_length", sql`${t.lengthWeeks} IN (1, 2)`),
    check("sprint_state", sql`${t.state} IN ${sqlList(SPRINT_STATES)}`),
    check("sprint_capacity", sql`${t.capacity} >= 0`),
    // "Only one active at a time": a unique index over just the active rows.
    uniqueIndex("one_active_sprint")
      .on(t.state)
      .where(sql`${t.state} = 'active'`),
    // And one planned sprint at a time, matching the Plan screen.
    uniqueIndex("one_planned_sprint")
      .on(t.state)
      .where(sql`${t.state} = 'planned'`),
  ],
);

export const issues = sqliteTable(
  "issues",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    key: text().notNull().unique(), // "FR-4"
    spaceId: integer("space_id")
      .notNull()
      .references(() => spaces.id),
    type: text({ enum: ISSUE_TYPES }).notNull(),
    // Self reference: a story's parent is an epic, a subtask's parent a story.
    parentId: integer("parent_id").references((): AnySQLiteColumn => issues.id),
    title: text().notNull(),
    description: text().notNull().default(""),
    acceptanceCriteria: text("acceptance_criteria", { mode: "json" })
      .$type<Criterion[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text({ enum: STATUSES }).notNull().default("todo"),
    points: integer(), // null = unestimated
    priority: text({ enum: PRIORITIES }).notNull().default("medium"),
    labels: text({ mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    rank: text().notNull(), // fractional index: ORDER BY rank gives backlog order
    sprintId: integer("sprint_id").references(() => sprints.id),
    createdBy: text("created_by", { enum: ACTORS }).notNull().default("me"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    completedAt: text("completed_at"),
    deletedAt: text("deleted_at"), // soft delete: hidden, restorable for 30 days
    previousKeys: text("previous_keys", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`), // old keys after a move to another space
  },
  (t) => [
    check("issue_type", sql`${t.type} IN ${sqlList(ISSUE_TYPES)}`),
    check("issue_status", sql`${t.status} IN ${sqlList(STATUSES)}`),
    check("issue_priority", sql`${t.priority} IN ${sqlList(PRIORITIES)}`),
    check("issue_created_by", sql`${t.createdBy} IN ${sqlList(ACTORS)}`),
    // Points: 1, 2, 3, 5, 8, 13 or empty, and never on epics or subtasks.
    check("issue_points", sql`${t.points} IS NULL OR ${t.points} IN ${sqlList(POINTS)}`),
    check("issue_points_type", sql`${t.points} IS NULL OR ${t.type} NOT IN ('epic', 'subtask')`),
    check("issue_epic_parent", sql`${t.type} <> 'epic' OR ${t.parentId} IS NULL`),
    check("issue_subtask_parent", sql`${t.type} <> 'subtask' OR ${t.parentId} IS NOT NULL`),
    // The queries every screen runs: by space, by sprint, children, backlog order.
    index("issues_space").on(t.spaceId),
    index("issues_sprint").on(t.sprintId),
    index("issues_parent").on(t.parentId),
    index("issues_rank").on(t.rank),
  ],
);

/** Sprint history: Past sprints, slip counts and velocity all read from here. */
export const sprintIssues = sqliteTable(
  "sprint_issues",
  {
    sprintId: integer("sprint_id")
      .notNull()
      .references(() => sprints.id),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id),
    pointsAtStart: integer("points_at_start"),
    outcome: text({ enum: OUTCOMES }), // null while the sprint runs
    movedTo: integer("moved_to").references(() => sprints.id),
  },
  (t) => [
    primaryKey({ columns: [t.sprintId, t.issueId] }), // an issue is in a sprint once
    check(
      "sprint_issue_outcome",
      sql`${t.outcome} IS NULL OR ${t.outcome} IN ${sqlList(OUTCOMES)}`,
    ),
    check("sprint_issue_moved", sql`${t.movedTo} IS NULL OR ${t.outcome} = 'carried_over'`),
    index("sprint_issues_issue").on(t.issueId),
  ],
);

/** The activity log: every status, sprint, points and space change. */
export const issueEvents = sqliteTable(
  "issue_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id),
    at: text().notNull().default(now),
    actor: text({ enum: ACTORS }).notNull().default("me"),
    kind: text({ enum: EVENT_KINDS }).notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
  },
  (t) => [
    check("event_kind", sql`${t.kind} IN ${sqlList(EVENT_KINDS)}`),
    index("issue_events_issue").on(t.issueId),
  ],
);

/** Saved write ups from the local model. */
export const insights = sqliteTable(
  "insights",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    kind: text({ enum: INSIGHT_KINDS }).notNull(),
    sprintId: integer("sprint_id").references(() => sprints.id),
    model: text().notNull(),
    inputHash: text("input_hash").notNull(), // same facts, same hash: no regeneration
    body: text().notNull(), // JSON with fixed fields per kind
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    check("insight_kind", sql`${t.kind} IN ${sqlList(INSIGHT_KINDS)}`),
    index("insights_sprint").on(t.sprintId, t.kind),
  ],
);

/** Key/value settings: theme, Ollama URL and model, capacity default, toggles. */
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text({ mode: "json" }).notNull(),
});
