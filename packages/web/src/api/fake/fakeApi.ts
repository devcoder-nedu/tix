// In-browser implementation of TixApi. It applies the same rules the real core
// services will (key assignment, parent rules, points, events), so the screens
// behave realistically. Delete this folder once the Fastify server exists.

import { generateKeyBetween } from "fractional-indexing";
import type { IssueFilter, TixApi } from "../client";
import { ApiError } from "../errors";
import {
  POINTS,
  type Issue,
  type IssueEvent,
  type IssuePatch,
  type IssueType,
  type BacklogItem,
  type SpaceSummary,
  type Sprint,
  type SprintInput,
  type SprintIssue,
  type SprintIssueResult,
  type SprintResult,
} from "../types";
import { addDays, sprintEndDate } from "../../lib/dates";
import { db, save } from "./db";

// A short pause so loading states show up during development, like a real network call.
const LATENCY_MS = 120;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

// Hand out copies: if a screen mutated a returned object it would silently
// change the "database" without going through the rules below.
const copy = <T>(value: T): T => structuredClone(value);

const live = (i: Issue) => i.deletedAt === null;
const nowIso = () => new Date().toISOString();

function findSpace(key: string) {
  const space = db.spaces.find((s) => s.key === key.toUpperCase());
  if (!space) throw new ApiError(`No space with key ${key}`, 404);
  return space;
}

function findIssue(key: string) {
  const upper = key.toUpperCase();
  // previousKeys lets old links keep working after an issue moves space.
  const issue = db.issues.find(
    (i) => live(i) && (i.key === upper || i.previousKeys.includes(upper)),
  );
  if (!issue) throw new ApiError(`No issue with key ${key}`, 404);
  return issue;
}

function summarise(spaceId: number): SpaceSummary {
  const space = db.spaces.find((s) => s.id === spaceId)!;
  const issues = db.issues.filter((i) => live(i) && i.spaceId === spaceId);
  const work = issues.filter((i) => i.type !== "epic");
  const epics = issues.filter((i) => i.type === "epic");
  const done = work.filter((i) => i.status === "done");
  const month = nowIso().slice(0, 7);

  return {
    ...space,
    openCount: work.length - done.length,
    epicCount: epics.length,
    epics: epics.map(({ id, key, title }) => ({ id, key, title })),
    doneThisMonth: done.filter((i) => i.completedAt?.startsWith(month)).length,
    percentDone: work.length ? Math.round((done.length / work.length) * 100) : 0,
  };
}

function logEvent(issueId: number, kind: IssueEvent["kind"], from: unknown, to: unknown) {
  db.events.push({
    id: db.events.length + 1,
    issueId,
    at: nowIso(),
    actor: "me",
    kind,
    fromValue: from === null || from === undefined ? null : String(from),
    toValue: to === null || to === undefined ? null : String(to),
  });
}

// ---- Rules from the design doc ----

const WORK_TYPES: IssueType[] = ["story", "task", "bug", "spike"];

/** Epics have no parent; stories/tasks/bugs/spikes sit under an epic (or none); subtasks sit under a story-level issue. */
function checkParent(type: IssueType, spaceId: number, parentId: number | null | undefined) {
  if (type === "epic") {
    if (parentId) throw new ApiError("An epic cannot have a parent");
    return;
  }
  if (!parentId) {
    if (type === "subtask") throw new ApiError("A subtask needs a parent story or task");
    return;
  }
  const parent = db.issues.find((i) => live(i) && i.id === parentId);
  if (!parent) throw new ApiError("Parent issue not found", 404);
  if (parent.spaceId !== spaceId) throw new ApiError("Parent must be in the same space");
  if (type === "subtask" && !WORK_TYPES.includes(parent.type)) {
    throw new ApiError("A subtask's parent must be a story, task, bug or spike");
  }
  if (type !== "subtask" && parent.type !== "epic") {
    throw new ApiError(`A ${type}'s parent must be an epic`);
  }
}

function checkPoints(type: IssueType, points: unknown) {
  if (points === null || points === undefined) return;
  if (type === "subtask" || type === "epic")
    throw new ApiError(`${type === "epic" ? "An epic" : "A subtask"} cannot carry points`);
  if (!POINTS.includes(points as never)) throw new ApiError("Points must be 1, 2, 3, 5, 8 or 13");
}

function lastRank(): string | null {
  return db.issues.reduce<string | null>(
    (max, i) => (max === null || i.rank > max ? i.rank : max),
    null,
  );
}

const byRank = (a: Issue, b: Issue) => (a.rank < b.rank ? -1 : 1);

/** Add the tags an issue's sprint history earns: slips, "was in Sprint N", carried over. */
function withHistory(issue: Issue): BacklogItem {
  // Finished sprint rows for this issue, oldest first.
  const history = db.sprintIssues
    .filter((r) => r.issueId === issue.id && r.outcome !== null)
    .sort((a, b) => a.sprintId - b.sprintId);
  const last = history.at(-1);
  const epic = db.issues.find((i) => i.id === issue.parentId);
  return {
    ...issue,
    epic: epic ? { key: epic.key, title: epic.title } : null,
    slipCount: history.filter((r) => r.outcome === "carried_over" || r.outcome === "returned")
      .length,
    lastReturnedSprint:
      last?.outcome === "returned"
        ? (db.sprints.find((s) => s.id === last.sprintId)?.number ?? null)
        : null,
    carriedOver: last?.outcome === "carried_over" && last.movedTo === issue.sprintId,
  };
}

function findSprint(id: number) {
  const sprint = db.sprints.find((s) => s.id === id);
  if (!sprint) throw new ApiError("Sprint not found", 404);
  return sprint;
}

function checkSprintInput(input: Partial<SprintInput>) {
  if (input.lengthWeeks !== undefined && input.lengthWeeks !== 1 && input.lengthWeeks !== 2) {
    throw new ApiError("A sprint is 1 or 2 weeks long");
  }
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 0)) {
    throw new ApiError("Capacity must be a whole number of points");
  }
  if (input.startDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new ApiError("Start date must look like 2026-10-06");
  }
}

/** Committed against done for a completed sprint, read from sprint_issues. */
function sprintResult(sprint: Sprint): SprintResult {
  const rows = db.sprintIssues.filter((r) => r.sprintId === sprint.id);
  return {
    sprintId: sprint.id,
    number: sprint.number,
    committed: rows.reduce((sum, r) => sum + (r.pointsAtStart ?? 0), 0),
    done: rows
      .filter((r) => r.outcome === "done")
      .reduce((sum, r) => sum + (r.pointsAtStart ?? 0), 0),
  };
}

/** The sprint_issues rows of a sprint, joined to their issues. */
function sprintRows(sprintId: number) {
  return db.sprintIssues
    .filter((r) => r.sprintId === sprintId)
    .map((row) => ({ row, issue: db.issues.find((i) => i.id === row.issueId)! }))
    .filter(({ issue }) => issue !== undefined);
}

/** Running sprint: done means status done now. Completed sprint: the recorded outcome. */
function asResult({ row, issue }: { row: SprintIssue; issue: Issue }): SprintIssueResult {
  return {
    ...issue,
    pointsAtStart: row.pointsAtStart,
    outcome: row.outcome,
    movedToSprint: row.movedTo
      ? (db.sprints.find((s) => s.id === row.movedTo)?.number ?? null)
      : null,
  };
}

function isDone(sprint: Sprint, row: SprintIssue, issue: Issue) {
  return sprint.state === "completed" ? row.outcome === "done" : issue.status === "done";
}

export const fakeApi: TixApi = {
  async listSpaces() {
    await delay();
    return copy(db.spaces.filter((s) => !s.archived).map((s) => summarise(s.id)));
  },

  async getSpace(key) {
    await delay();
    return copy(summarise(findSpace(key).id));
  },

  async createSpace(input) {
    await delay();
    const key = input.key.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      throw new ApiError("Key must be 2 to 10 letters or digits, starting with a letter");
    }
    if (db.spaces.some((s) => s.key === key))
      throw new ApiError(`Space ${key} already exists`, 409);
    const name = input.name.trim();
    if (!name) throw new ApiError("Name is required");
    const space = {
      key,
      name,
      color: input.color,
      description: input.description.trim(),
      id: Math.max(0, ...db.spaces.map((s) => s.id)) + 1,
      nextNumber: 1,
      archived: false,
    };
    db.spaces.push(space);
    save();
    return copy(space);
  },

  async listIssues(filter: IssueFilter = {}) {
    await delay();
    const result = db.issues.filter(
      (i) =>
        live(i) &&
        (filter.spaceId === undefined || i.spaceId === filter.spaceId) &&
        (filter.sprintId === undefined || i.sprintId === filter.sprintId) &&
        (filter.parentId === undefined || i.parentId === filter.parentId),
    );
    return copy(result.sort((a, b) => (a.rank < b.rank ? -1 : 1)));
  },

  async getIssue(key) {
    await delay();
    return copy(findIssue(key));
  },

  async createIssue(input) {
    await delay();
    const space = db.spaces.find((s) => s.id === input.spaceId);
    if (!space) throw new ApiError("Space not found", 404);
    const title = input.title.trim();
    if (!title) throw new ApiError("Summary is required");
    checkParent(input.type, space.id, input.parentId);
    checkPoints(input.type, input.points);

    // Keys come from the space's counter and are never reused, even after delete.
    const key = `${space.key}-${space.nextNumber}`;
    space.nextNumber += 1;

    const now = nowIso();
    const issue: Issue = {
      id: Math.max(0, ...db.issues.map((i) => i.id)) + 1,
      key,
      spaceId: space.id,
      type: input.type,
      parentId: input.parentId ?? null,
      title,
      description: input.description?.trim() ?? "",
      acceptanceCriteria: (input.acceptanceCriteria ?? [])
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false })),
      status: "todo",
      points: input.points ?? null,
      priority: input.priority ?? "medium",
      labels: [],
      rank: generateKeyBetween(lastRank(), null), // new issues go to the bottom of the backlog
      sprintId: input.sprintId ?? null,
      createdBy: input.createdBy ?? "me",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deletedAt: null,
      previousKeys: [],
    };
    db.issues.push(issue);
    db.events.push({
      id: db.events.length + 1,
      issueId: issue.id,
      at: now,
      actor: issue.createdBy,
      kind: "created",
      fromValue: null,
      toValue: issue.createdBy === "claude" ? "via Claude" : "from the Create form",
    });
    save();
    return copy(issue);
  },

  async updateIssue(key, patch: IssuePatch) {
    await delay();
    const issue = findIssue(key);
    if (patch.title !== undefined && !patch.title.trim()) throw new ApiError("Summary is required");
    if (patch.points !== undefined) checkPoints(issue.type, patch.points);
    if (patch.parentId !== undefined) checkParent(issue.type, issue.spaceId, patch.parentId);

    // Every status, sprint and points change goes into the activity log.
    if (patch.status !== undefined && patch.status !== issue.status) {
      logEvent(issue.id, "status", issue.status, patch.status);
      issue.completedAt = patch.status === "done" ? nowIso() : null;
    }
    if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
      logEvent(issue.id, "sprint", issue.sprintId, patch.sprintId);
    }
    if (patch.points !== undefined && patch.points !== issue.points) {
      logEvent(issue.id, "points", issue.points, patch.points);
    }

    Object.assign(issue, patch, { updatedAt: nowIso() });
    save();
    return copy(issue);
  },

  async deleteIssue(key) {
    await delay();
    const issue = findIssue(key);
    const openChildren = db.issues.some(
      (i) => live(i) && i.parentId === issue.id && i.status !== "done",
    );
    if (issue.type === "epic" && openChildren) {
      throw new ApiError("This epic still has open issues; finish or move them first", 409);
    }
    // Soft delete: hidden now, restorable for 30 days (purge comes with the real server).
    issue.deletedAt = nowIso();
    save();
  },

  async moveIssueToSpace(key, spaceId) {
    await delay();
    const issue = findIssue(key);
    if (!WORK_TYPES.includes(issue.type)) {
      throw new ApiError(
        issue.type === "subtask"
          ? "A subtask moves with its parent; move the parent instead"
          : "An epic cannot move; move its issues one by one",
      );
    }
    const target = db.spaces.find((s) => s.id === spaceId && !s.archived);
    if (!target) throw new ApiError("Space not found", 404);
    if (target.id === issue.spaceId) return copy(issue);

    // Each moved issue gets the target's next key; the old key becomes an alias
    // so links and notes that mention it keep working.
    const moveOne = (i: Issue) => {
      const oldKey = i.key;
      i.previousKeys.push(oldKey);
      i.key = `${target.key}-${target.nextNumber}`;
      target.nextNumber += 1;
      i.spaceId = target.id;
      i.updatedAt = nowIso();
      logEvent(i.id, "space", oldKey, i.key);
    };
    moveOne(issue);
    issue.parentId = null; // its epic belongs to the old space
    for (const sub of db.issues.filter((i) => live(i) && i.parentId === issue.id)) moveOne(sub);

    save();
    return copy(issue);
  },

  async listEvents(issueId) {
    await delay();
    return copy(
      db.events.filter((e) => e.issueId === issueId).sort((a, b) => (a.at < b.at ? 1 : -1)),
    );
  },

  async searchIssues(text) {
    await delay();
    const q = text.trim().toLowerCase();
    if (!q) return [];
    // Score: exact key, then key prefix (FR-1 finds FR-12), then title words.
    const score = (i: Issue) => {
      const keys = [i.key, ...i.previousKeys].map((k) => k.toLowerCase());
      if (keys.includes(q)) return 0;
      if (keys.some((k) => k.startsWith(q))) return 1;
      if (i.title.toLowerCase().includes(q)) return 2;
      return -1;
    };
    const matches = db.issues
      .filter(live)
      .map((issue) => ({ issue, s: score(issue) }))
      .filter(({ s }) => s >= 0)
      .sort(
        (a, b) =>
          a.s - b.s || (a.issue.status === "done" ? 1 : 0) - (b.issue.status === "done" ? 1 : 0),
      )
      .slice(0, 8)
      .map(({ issue }) => issue);
    return copy(matches);
  },

  async listBacklog() {
    await delay();
    const items = db.issues
      .filter(
        (i) =>
          live(i) &&
          i.sprintId === null &&
          i.status !== "done" &&
          i.type !== "epic" &&
          i.type !== "subtask",
      )
      .sort(byRank)
      .map(withHistory);
    return copy(items);
  },

  async rankIssue(key, { prevKey, nextKey }) {
    await delay();
    const issue = findIssue(key);
    const prev = prevKey ? findIssue(prevKey) : null;
    const next = nextKey ? findIssue(nextKey) : null;
    if (prev && next && prev.rank >= next.rank) {
      throw new ApiError("Neighbours are out of order; refresh and try again", 409);
    }
    // A string that sorts between the two neighbours, e.g. between "a0" and "a1" -> "a0V".
    // No other issue's rank changes, which is the point of fractional indexing.
    issue.rank = generateKeyBetween(prev?.rank ?? null, next?.rank ?? null);
    issue.updatedAt = nowIso();
    save();
    return copy(issue);
  },

  async listSprints() {
    await delay();
    return copy([...db.sprints].sort((a, b) => a.number - b.number));
  },

  async listSprintItems(sprintId) {
    await delay();
    findSprint(sprintId);
    const items = db.issues
      .filter(
        (i) => live(i) && i.sprintId === sprintId && i.type !== "epic" && i.type !== "subtask",
      )
      .sort(byRank)
      .map(withHistory);
    return copy(items);
  },

  async createSprint(input) {
    await delay();
    checkSprintInput(input);
    // One sprint is planned at a time: plan it, start it, then plan the next.
    if (db.sprints.some((s) => s.state === "planned")) {
      throw new ApiError("A planned sprint already exists; plan that one first", 409);
    }
    const number = Math.max(0, ...db.sprints.map((s) => s.number)) + 1;
    const sprint: Sprint = {
      id: Math.max(0, ...db.sprints.map((s) => s.id)) + 1,
      number,
      name: `Sprint ${number}`,
      goal: input.goal.trim(),
      lengthWeeks: input.lengthWeeks,
      startDate: input.startDate,
      endDate: sprintEndDate(input.startDate, input.lengthWeeks),
      capacity: input.capacity,
      state: "planned",
      completedAt: null,
    };
    db.sprints.push(sprint);
    save();
    return copy(sprint);
  },

  async updateSprint(id, patch) {
    await delay();
    const sprint = findSprint(id);
    if (sprint.state === "completed") throw new ApiError("A completed sprint cannot change", 409);
    checkSprintInput(patch);
    if (sprint.state === "active" && (patch.startDate || patch.lengthWeeks)) {
      throw new ApiError("Dates of a running sprint cannot change", 409);
    }
    Object.assign(sprint, patch);
    if (patch.goal !== undefined) sprint.goal = patch.goal.trim();
    // end_date is always worked out from the start and length, never typed in.
    sprint.endDate = sprintEndDate(sprint.startDate, sprint.lengthWeeks);
    save();
    return copy(sprint);
  },

  async addToSprint(sprintId, keys) {
    await delay();
    const sprint = findSprint(sprintId);
    if (sprint.state === "completed") throw new ApiError("Cannot add to a completed sprint", 409);
    const issues = keys.map(findIssue);
    for (const issue of issues) {
      if (!WORK_TYPES.includes(issue.type)) {
        throw new ApiError(`${issue.key}: only stories, tasks, bugs and spikes go into a sprint`);
      }
      if (issue.status === "done") throw new ApiError(`${issue.key} is already done`);
    }
    for (const issue of issues) {
      if (issue.sprintId === sprint.id) continue;
      logEvent(issue.id, "sprint", issue.sprintId, sprint.id);
      issue.sprintId = sprint.id;
      issue.updatedAt = nowIso();
      // Added after the start: it joins the commitment with its current points.
      if (sprint.state === "active") {
        db.sprintIssues.push({
          sprintId: sprint.id,
          issueId: issue.id,
          pointsAtStart: issue.points,
          outcome: null,
          movedTo: null,
        });
      }
    }
    save();
  },

  async removeFromSprint(sprintId, keys) {
    await delay();
    const sprint = findSprint(sprintId);
    if (sprint.state === "completed") throw new ApiError("Cannot change a completed sprint", 409);
    for (const issue of keys.map(findIssue)) {
      if (issue.sprintId !== sprint.id) continue;
      logEvent(issue.id, "sprint", sprint.id, null);
      issue.sprintId = null;
      issue.updatedAt = nowIso();
      db.sprintIssues = db.sprintIssues.filter(
        (r) => !(r.sprintId === sprint.id && r.issueId === issue.id && r.outcome === null),
      );
    }
    save();
  },

  async startSprint(id) {
    await delay();
    const sprint = findSprint(id);
    if (sprint.state !== "planned") throw new ApiError("Only a planned sprint can start", 409);
    const active = db.sprints.find((s) => s.state === "active");
    if (active) {
      throw new ApiError(`${active.name} is still running; complete it first`, 409);
    }
    sprint.state = "active";
    // points_at_start freezes the commitment: later re-estimates don't rewrite history.
    for (const issue of db.issues.filter((i) => live(i) && i.sprintId === sprint.id)) {
      if (issue.type === "epic" || issue.type === "subtask") continue;
      db.sprintIssues.push({
        sprintId: sprint.id,
        issueId: issue.id,
        pointsAtStart: issue.points,
        outcome: null,
        movedTo: null,
      });
    }
    save();
    return copy(sprint);
  },

  async getVelocity() {
    await delay();
    const recent = db.sprints
      .filter((s) => s.state === "completed")
      .sort((a, b) => a.number - b.number)
      .slice(-3)
      .map(sprintResult);
    const average = recent.length
      ? Math.round(recent.reduce((sum, r) => sum + r.done, 0) / recent.length)
      : null;
    return copy({ average, recent });
  },

  async getSprintSummary(id) {
    await delay();
    const sprint = findSprint(id);
    const rows = sprintRows(id);
    const points = (list: typeof rows) =>
      list.reduce((n, { row }) => n + (row.pointsAtStart ?? 0), 0);
    const finished = rows.filter(({ row, issue }) => isDone(sprint, row, issue));
    const unfinished = rows.filter(({ row, issue }) => !isDone(sprint, row, issue));
    const committed = points(rows);
    const done = points(finished);

    const spaceIds = [...new Set(rows.map(({ issue }) => issue.spaceId))];
    return copy({
      sprintId: id,
      committed,
      done,
      unfinished: points(unfinished),
      percent: committed ? Math.round((done / committed) * 100) : 0,
      bySpace: spaceIds
        .map((spaceId) => ({
          spaceId,
          committed: points(rows.filter(({ issue }) => issue.spaceId === spaceId)),
          done: points(finished.filter(({ issue }) => issue.spaceId === spaceId)),
        }))
        .sort((a, b) => b.committed - a.committed),
      finishedIssues: finished.map(asResult),
      unfinishedIssues: unfinished.map(asResult),
    });
  },

  async listSprintResults() {
    await delay();
    return copy(
      db.sprints
        .filter((s) => s.state === "completed")
        .sort((a, b) => a.number - b.number)
        .map(sprintResult),
    );
  },

  async getInsight(kind, sprintId) {
    await delay();
    const saved = db.insights
      .filter((i) => i.kind === kind && i.sprintId === sprintId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return copy(saved[0] ?? null);
  },

  async completeSprint(id, moves) {
    await delay();
    const sprint = findSprint(id);
    if (sprint.state !== "active") throw new ApiError("Only the running sprint can complete", 409);

    // An issue put in the sprint without a row (should not happen) still gets one,
    // so the history never silently drops work.
    for (const issue of db.issues.filter((i) => live(i) && i.sprintId === id)) {
      if (issue.type === "epic" || issue.type === "subtask") continue;
      if (!db.sprintIssues.some((r) => r.sprintId === id && r.issueId === issue.id)) {
        db.sprintIssues.push({
          sprintId: id,
          issueId: issue.id,
          pointsAtStart: issue.points,
          outcome: null,
          movedTo: null,
        });
      }
    }

    const rows = sprintRows(id).filter(({ row }) => row.outcome === null);
    const needsNext = rows.some(
      ({ issue }) => issue.status !== "done" && moves[issue.key] === "next",
    );
    let next = db.sprints.find((s) => s.state === "planned");
    if (needsNext && !next) {
      // "Sprint 5 (new)": same length, starting the day after this one ends.
      const number = Math.max(...db.sprints.map((s) => s.number)) + 1;
      const startDate = addDays(sprint.endDate, 1);
      next = {
        id: Math.max(...db.sprints.map((s) => s.id)) + 1,
        number,
        name: `Sprint ${number}`,
        goal: "",
        lengthWeeks: sprint.lengthWeeks,
        startDate,
        endDate: sprintEndDate(startDate, sprint.lengthWeeks),
        capacity: sprint.capacity,
        state: "planned",
        completedAt: null,
      };
      db.sprints.push(next);
    }

    for (const { row, issue } of rows) {
      if (issue.status === "done") {
        row.outcome = "done";
        continue; // done issues keep pointing at this sprint: that is their history
      }
      // Status and ticked criteria are untouched; only the sprint changes.
      if (moves[issue.key] === "next" && next) {
        row.outcome = "carried_over";
        row.movedTo = next.id;
        logEvent(issue.id, "sprint", id, next.id);
        issue.sprintId = next.id;
      } else {
        row.outcome = "returned";
        logEvent(issue.id, "sprint", id, null);
        issue.sprintId = null;
      }
      issue.updatedAt = nowIso();
    }

    sprint.state = "completed";
    sprint.completedAt = nowIso();
    save();
    return copy(sprint);
  },

  async checkOllama(url) {
    // No fake delay: this is a real call. The server will make it later; until
    // then the browser asks Ollama directly (it accepts localhost pages by default).
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return { running: false, models: [] };
      const body = (await response.json()) as { models?: { name: string }[] };
      return { running: true, models: (body.models ?? []).map((m) => m.name) };
    } catch {
      return { running: false, models: [] }; // not installed, not started, or wrong URL
    }
  },

  async getSettings() {
    await delay();
    return copy(db.settings);
  },

  async updateSettings(patch) {
    await delay();
    Object.assign(db.settings, patch);
    save();
    return copy(db.settings);
  },
};
