// TixApi over HTTP: each method calls one route of the Fastify server.
// Same contract as the old in-browser fake, so no screen had to change.

import type { IssueFilter, TixApi } from "./client";
import { ApiError } from "./errors";

/** Send a request to /api; an { error } reply becomes an ApiError with its status. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      // Writes are always JSON: the server refuses anything else (see server/app.ts).
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the Tix server. Is it running? (tix start)", 503);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error ?? `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown = {}) => request<T>("POST", path, body);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const enc = encodeURIComponent;

function query(params: Record<string, string | number | null | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined);
  if (pairs.length === 0) return "";
  return "?" + pairs.map(([k, v]) => `${k}=${enc(String(v))}`).join("&");
}

export const httpApi: TixApi = {
  listSpaces: () => get("/spaces"),
  listArchivedSpaces: () => get("/spaces?archived=true"),
  getSpace: (key) => get(`/spaces/${enc(key)}`),
  createSpace: (input) => post("/spaces", input),
  archiveSpace: (key) => post(`/spaces/${enc(key)}/archive`),
  restoreSpace: (key) => post(`/spaces/${enc(key)}/restore`),
  deleteSpace: (key) => request("DELETE", `/spaces/${enc(key)}`),

  listIssues: (filter: IssueFilter = {}) => get(`/issues${query({ ...filter })}`),
  getIssue: (key) => get(`/issues/${enc(key)}`),
  createIssue: (input) => post("/issues", input),
  updateIssue: (key, changes) => patch(`/issues/${enc(key)}`, changes),
  deleteIssue: (key) => request("DELETE", `/issues/${enc(key)}`),
  moveIssueToSpace: (key, spaceId) => post(`/issues/${enc(key)}/move-space`, { spaceId }),
  listEvents: (issueId) => get(`/events${query({ issueId })}`),
  searchIssues: (text) => get(`/search${query({ q: text })}`),

  listBacklog: () => get("/backlog"),
  rankIssue: (key, position) => post(`/issues/${enc(key)}/rank`, position),

  listSprints: () => get("/sprints"),
  listSprintItems: (sprintId) => get(`/sprints/${sprintId}/items`),
  createSprint: (input) => post("/sprints", input),
  updateSprint: (id, changes) => patch(`/sprints/${id}`, changes),
  addToSprint: (sprintId, keys) => post(`/sprints/${sprintId}/add`, { keys }),
  removeFromSprint: (sprintId, keys) => post(`/sprints/${sprintId}/remove`, { keys }),
  startSprint: (id) => post(`/sprints/${id}/start`),
  completeSprint: (id, moves) => post(`/sprints/${id}/complete`, { moves }),
  getVelocity: () => get("/velocity"),
  getSprintSummary: (id) => get(`/sprints/${id}/summary`),
  listSprintResults: () => get("/sprint-results"),
  getInsight: (kind, sprintId) => get(`/insights${query({ kind, sprintId })}`),

  getSettings: () => get("/settings"),
  updateSettings: (changes) => patch("/settings", changes),
  checkOllama: (url) => get(`/ollama${query({ url })}`),
};
