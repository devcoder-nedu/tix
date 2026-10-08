// The contract between the screens and the data. Screens only ever call `api`.
// Today `api` is the in-browser fake; later an HTTP client that calls the
// Fastify server implements the same interface and replaces it here.

import { resetDb } from "./fake/db";
import { fakeApi } from "./fake/fakeApi";
import type {
  BacklogItem,
  Insight,
  Issue,
  IssueEvent,
  IssuePatch,
  NewIssue,
  OllamaStatus,
  RankPosition,
  Settings,
  Space,
  SpaceSummary,
  Sprint,
  Rollover,
  SprintInput,
  SprintResult,
  SprintSummary,
  Velocity,
} from "./types";

export interface IssueFilter {
  spaceId?: number;
  sprintId?: number | null;
  parentId?: number;
}

export interface TixApi {
  listSpaces(): Promise<SpaceSummary[]>;
  getSpace(key: string): Promise<SpaceSummary>;
  createSpace(input: Pick<Space, "key" | "name" | "color" | "description">): Promise<Space>;

  listIssues(filter?: IssueFilter): Promise<Issue[]>;
  getIssue(key: string): Promise<Issue>;
  createIssue(input: NewIssue): Promise<Issue>;
  updateIssue(key: string, patch: IssuePatch): Promise<Issue>;
  deleteIssue(key: string): Promise<void>;
  /** New key in the target space; the old key stays as an alias. Subtasks move too. */
  moveIssueToSpace(key: string, spaceId: number): Promise<Issue>;
  listEvents(issueId: number): Promise<IssueEvent[]>;
  /** Issues whose key, old key or title matches, best matches first. */
  searchIssues(text: string): Promise<Issue[]>;

  /** Every open story/task/bug/spike with no sprint, in rank order. */
  listBacklog(): Promise<BacklogItem[]>;
  /** Move one issue between two neighbours; only that issue's rank changes. */
  rankIssue(key: string, position: RankPosition): Promise<Issue>;

  listSprints(): Promise<Sprint[]>;
  /** The issues in a sprint with their history tags (for the Plan screen). */
  listSprintItems(sprintId: number): Promise<BacklogItem[]>;
  createSprint(input: SprintInput): Promise<Sprint>;
  updateSprint(id: number, patch: Partial<SprintInput>): Promise<Sprint>;
  addToSprint(sprintId: number, keys: string[]): Promise<void>;
  removeFromSprint(sprintId: number, keys: string[]): Promise<void>;
  /** Allowed only when no other sprint is active; records points_at_start. */
  startSprint(id: number): Promise<Sprint>;
  getVelocity(): Promise<Velocity>;
  getSprintSummary(id: number): Promise<SprintSummary>;
  /** Committed against done for every completed sprint, oldest first (the velocity chart). */
  listSprintResults(): Promise<SprintResult[]>;
  /** The saved write up of a kind for a sprint, or null. */
  getInsight(kind: Insight["kind"], sprintId: number): Promise<Insight | null>;
  /**
   * Done issues get outcome "done"; each unfinished issue goes to the next sprint
   * ("carried_over", created if needed) or the backlog ("returned"). Status and
   * ticked criteria are kept. Returns the completed sprint.
   */
  completeSprint(id: number, moves: Record<string, Rollover>): Promise<Sprint>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Ask Ollama at `url` whether it is running and which models it has. */
  checkOllama(url: string): Promise<OllamaStatus>;
}

export { ApiError } from "./errors";

export const api: TixApi = fakeApi;

// Development helper: run `tixReset()` in the browser console to restore the mockup data.
if (import.meta.env.DEV) {
  (window as unknown as { tixReset: () => void }).tixReset = () => {
    resetDb();
    location.reload();
  };
}
