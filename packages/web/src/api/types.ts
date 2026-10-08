// Domain types. These mirror the seven tables in the design doc so the screens
// are built against the same shape the real SQLite database will return.
// When packages/core exists, these move there and web imports them.

export type IssueType = "epic" | "story" | "task" | "bug" | "spike" | "subtask";
export type Status = "todo" | "in_progress" | "in_review" | "done";
export type Points = 1 | 2 | 3 | 5 | 8 | 13;
export type Priority = "low" | "medium" | "high";
export type Actor = "me" | "claude";

export const STATUSES: Status[] = ["todo", "in_progress", "in_review", "done"];
export const POINTS: Points[] = [1, 2, 3, 5, 8, 13];
export const PRIORITIES: Priority[] = ["low", "medium", "high"];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export const TYPE_LABEL: Record<IssueType, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
  spike: "Spike",
  subtask: "Subtask",
};

/** spaces table */
export interface Space {
  id: number;
  key: string; // "FR"
  name: string; // "French"
  color: string; // hex, used for the dot and card stripe
  description: string;
  nextNumber: number; // hands out issue numbers: FR-15 follows FR-14
  archived: boolean;
}

export interface Criterion {
  text: string;
  done: boolean;
}

/** issues table: epics, stories, tasks, bugs, spikes and subtasks all live here */
export interface Issue {
  id: number;
  key: string; // "FR-4"
  spaceId: number;
  type: IssueType;
  parentId: number | null; // story -> epic, subtask -> story
  title: string;
  description: string;
  acceptanceCriteria: Criterion[];
  status: Status;
  points: Points | null; // null = unestimated; subtasks and epics are always null
  priority: Priority;
  labels: string[];
  rank: string; // fractional index: sorting by this string gives backlog order
  sprintId: number | null;
  createdBy: Actor;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  completedAt: string | null;
  // Two small additions the design doc's rules imply:
  deletedAt: string | null; // soft delete for 30 days
  previousKeys: string[]; // old keys kept as aliases after a move to another space
}

export type SprintState = "planned" | "active" | "completed";

/** sprints table */
export interface Sprint {
  id: number;
  number: number;
  name: string;
  goal: string;
  lengthWeeks: 1 | 2;
  startDate: string; // ISO date "2026-09-22"
  endDate: string;
  capacity: number;
  state: SprintState;
  completedAt: string | null;
}

export type Outcome = "done" | "carried_over" | "returned";

/** sprint_issues table: the sprint history that Past sprints and slip counts read */
export interface SprintIssue {
  sprintId: number;
  issueId: number;
  pointsAtStart: number | null;
  outcome: Outcome | null; // null while the sprint is still active
  movedTo: number | null; // sprint id when carried over
}

/** issue_events table: the activity log */
export interface IssueEvent {
  id: number;
  issueId: number;
  at: string;
  actor: Actor;
  kind: "created" | "status" | "sprint" | "points" | "space" | "field";
  fromValue: string | null;
  toValue: string | null;
}

/** insights table: saved write ups from the local model */
export interface Insight {
  id: number;
  kind: "sprint_review" | "check_in" | "planning_hint" | "pattern_report";
  sprintId: number | null;
  model: string;
  inputHash: string; // avoids regenerating when nothing changed
  body: string; // JSON with fixed fields per kind
  createdAt: string;
}

/** settings table, read as one typed object */
export interface Settings {
  theme: "system" | "light" | "dark";
  ollamaUrl: string;
  ollamaModel: string;
  capacityDefault: number;
  insightSprintReview: boolean;
  insightCheckIn: boolean;
  insightPlanningHint: boolean;
  insightPatternReport: boolean;
}

/** Whether the local model server answers, and which models it has pulled. */
export interface OllamaStatus {
  running: boolean;
  models: string[];
}

// ---- Shapes the API returns that combine tables ----

export interface SpaceSummary extends Space {
  openCount: number;
  epicCount: number;
  epics: Pick<Issue, "id" | "key" | "title">[];
  doneThisMonth: number;
  percentDone: number;
}

/** An issue plus the tags its sprint history earns, computed by the API (Backlog, Plan). */
export interface BacklogItem extends Issue {
  epic: Pick<Issue, "key" | "title"> | null;
  slipCount: number; // sprint_issues rows with outcome carried_over or returned
  lastReturnedSprint: number | null; // sprint number, when the latest outcome was "returned"
  carriedOver: boolean; // came into its current sprint unfinished from the previous one
}

export type SprintInput = Pick<Sprint, "goal" | "lengthWeeks" | "startDate" | "capacity">;

/** Committed against done for one completed sprint; the numbers behind velocity. */
export interface SprintResult {
  sprintId: number;
  number: number;
  committed: number; // points_at_start summed over every issue in the sprint
  done: number; // points of the issues whose outcome was done
}

/** The numbers behind Complete sprint (and later Past sprints). Computed by the API. */
export interface SprintSummary {
  sprintId: number;
  committed: number; // points_at_start over every issue in the sprint
  done: number;
  unfinished: number;
  percent: number; // done as a share of committed, 0 to 100
  bySpace: { spaceId: number; committed: number; done: number }[];
  finishedIssues: SprintIssueResult[];
  unfinishedIssues: SprintIssueResult[];
}

/** An issue as it ended a sprint: what it was worth at the start and where it went. */
export interface SprintIssueResult extends Issue {
  pointsAtStart: number | null;
  outcome: Outcome | null; // null while the sprint is running
  movedToSprint: number | null; // sprint number, when carried over
}

/** Where one unfinished issue goes when its sprint completes. */
export type Rollover = "next" | "backlog";

export interface Velocity {
  average: number | null; // null until a sprint has been completed
  recent: SprintResult[]; // the last 3 completed sprints, oldest first
}

/** Where a dragged issue lands: the keys of its new neighbours (null at either end). */
export interface RankPosition {
  prevKey: string | null;
  nextKey: string | null;
}

export interface NewIssue {
  spaceId: number;
  type: IssueType;
  parentId?: number | null;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  points?: Points | null;
  priority?: Priority;
  sprintId?: number | null;
  createdBy?: Actor;
}

export type IssuePatch = Partial<
  Pick<
    Issue,
    | "title"
    | "description"
    | "acceptanceCriteria"
    | "status"
    | "points"
    | "priority"
    | "labels"
    | "parentId"
    | "sprintId"
  >
>;
