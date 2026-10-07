// Business rules from the design doc. Pure functions with no storage, so they
// can move to packages/core unchanged and be shared by server, CLI and MCP.

import { POINTS, type Issue, type IssueType, type Points, type SprintIssue } from "./types";

export class TixError extends Error {
  constructor(
    public code: "not_found" | "invalid" | "blocked",
    message: string,
  ) {
    super(message);
    this.name = "TixError";
  }
}

// ---------- keys ----------

/** 2 to 10 capital letters or digits, starting with a letter: FR, GCP, DSAI. */
export const SPACE_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export function issueKey(spaceKey: string, number: number): string {
  return `${spaceKey}-${number}`;
}

// ---------- points ----------

export function isPoints(value: unknown): value is Points {
  return POINTS.includes(value as Points);
}

/** Only stories, tasks, bugs and spikes carry points. */
export function canHavePoints(type: IssueType): boolean {
  return type !== "epic" && type !== "subtask";
}

export function validatePoints(type: IssueType, points: number | null): void {
  if (points === null) return;
  if (!canHavePoints(type)) {
    throw new TixError("invalid", `A ${type} cannot carry points`);
  }
  if (!isPoints(points)) {
    throw new TixError("invalid", `Points must be one of ${POINTS.join(", ")}`);
  }
}

// ---------- hierarchy: Space > Epic > Story/Task/Bug/Spike > Subtask ----------

/** Which parent types each issue type may have. Empty = must have no parent. */
const ALLOWED_PARENTS: Record<IssueType, readonly IssueType[]> = {
  epic: [],
  story: ["epic"],
  task: ["epic"],
  bug: ["epic"],
  spike: ["epic"],
  subtask: ["story", "task", "bug", "spike"],
};

export function validateParent(
  type: IssueType,
  spaceId: number,
  parent: Pick<Issue, "type" | "spaceId"> | null,
): void {
  const allowed = ALLOWED_PARENTS[type];
  if (parent === null) {
    if (type === "subtask") throw new TixError("invalid", "A subtask needs a parent");
    return;
  }
  if (!allowed.includes(parent.type)) {
    throw new TixError("invalid", `A ${type} cannot sit under a ${parent.type}`);
  }
  if (parent.spaceId !== spaceId) {
    throw new TixError("invalid", "Parent must be in the same space");
  }
}

// ---------- sprint history ----------

/** Times an issue left a sprint unfinished (carried over or returned). */
export function slipCount(history: SprintIssue[]): number {
  return history.filter((r) => r.outcome === "carried_over" || r.outcome === "returned").length;
}

/** Sprint id behind the "was in Sprint N" tag: set when the last outcome was returned. */
export function returnedFromSprintId(history: SprintIssue[]): number | null {
  const finished = history.filter((r) => r.outcome !== null);
  const last = finished[finished.length - 1];
  return last?.outcome === "returned" ? last.sprintId : null;
}

/** Average done points over the last 3 completed sprints (null before any). */
export function velocity(donePointsPerSprint: number[]): number | null {
  const last3 = donePointsPerSprint.slice(-3);
  if (last3.length === 0) return null;
  return Math.round(last3.reduce((a, b) => a + b, 0) / last3.length);
}

export const isOpen = (issue: Pick<Issue, "status" | "deletedAt">) =>
  issue.status !== "done" && issue.deletedAt === null;
