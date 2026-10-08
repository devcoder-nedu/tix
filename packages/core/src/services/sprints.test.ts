// Sprint lifecycle and rollover, as the design doc describes them.

import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type TixDb } from "../db.ts";
import { TixError } from "../errors.ts";
import { createIssue, getIssue, listBacklog, listEvents, updateIssue } from "./issues.ts";
import { getSettings, updateSettings } from "./settings.ts";
import { createSpace } from "./spaces.ts";
import {
  addToSprint,
  completeSprint,
  createSprint,
  getSprintSummary,
  getVelocity,
  listSprintItems,
  listSprints,
  removeFromSprint,
  startSprint,
  updateSprint,
} from "./sprints.ts";

let db: TixDb;
let fr: number;

beforeEach(() => {
  db = openDb(":memory:");
  fr = createSpace(db, { key: "FR", name: "French", color: "#3b74d6" }).id;
});

const story = (title: string, points: 1 | 2 | 3 | 5 | 8 | 13 | null = 3) =>
  createIssue(db, { spaceId: fr, type: "story", title, points });
const plan = (startDate = "2026-10-05") =>
  createSprint(db, { lengthWeeks: 2, startDate, capacity: 20 });

function errorOf(fn: () => unknown): TixError {
  try {
    fn();
  } catch (e) {
    if (e instanceof TixError) return e;
    throw e;
  }
  throw new Error("expected a TixError");
}

describe("planning", () => {
  it("numbers sprints and works out the end date from the length", () => {
    const s = plan();
    expect(s).toMatchObject({
      number: 1,
      name: "Sprint 1",
      state: "planned",
      endDate: "2026-10-18",
    });
    expect(updateSprint(db, s.id, { lengthWeeks: 1 }).endDate).toBe("2026-10-11");
  });

  it("allows one planned sprint at a time", () => {
    plan();
    expect(errorOf(() => plan()).status).toBe(409);
  });

  it("adds and removes issues, logging each move", () => {
    const s = plan();
    const a = story("a");
    addToSprint(db, s.id, [a.key]);
    expect(listSprintItems(db, s.id).map((i) => i.key)).toEqual([a.key]);
    expect(listBacklog(db)).toEqual([]);
    removeFromSprint(db, s.id, [a.key]);
    expect(listBacklog(db).map((i) => i.key)).toEqual([a.key]);
    expect(
      listEvents(db, a.id)
        .map((e) => `${e.kind}:${e.fromValue}->${e.toValue}`)
        .slice(0, 2),
    ).toEqual([`sprint:${s.id}->null`, `sprint:null->${s.id}`]);
  });

  it("refuses epics and done issues, and adds none if any key is bad", () => {
    const s = plan();
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    const ok = story("ok");
    expect(errorOf(() => addToSprint(db, s.id, [ok.key, epic.key])).message).toMatch(
      /only stories/,
    );
    expect(listSprintItems(db, s.id)).toEqual([]); // ok was not added either
    const done = story("done");
    updateIssue(db, done.key, { status: "done" });
    expect(errorOf(() => addToSprint(db, s.id, [done.key])).message).toMatch(/already done/);
  });
});

describe("starting", () => {
  it("freezes points at start, so re-estimating later does not change the commitment", () => {
    const s = plan();
    const a = story("a", 3);
    addToSprint(db, s.id, [a.key]);
    startSprint(db, s.id);
    updateIssue(db, a.key, { points: 8 });
    expect(getSprintSummary(db, s.id).committed).toBe(3);
  });

  it("is allowed only when no other sprint is active", () => {
    const first = plan();
    startSprint(db, first.id);
    const second = plan("2026-10-19");
    expect(errorOf(() => startSprint(db, second.id)).message).toBe(
      "Sprint 1 is still running; complete it first",
    );
  });

  it("counts an issue added mid sprint in the commitment", () => {
    const s = plan();
    startSprint(db, s.id);
    addToSprint(db, s.id, [story("late", 5).key]);
    expect(getSprintSummary(db, s.id).committed).toBe(5);
  });
});

describe("completing (rollover)", () => {
  function runningSprint() {
    const s = plan();
    const done = story("finished", 5);
    const carried = createIssue(db, {
      spaceId: fr,
      type: "story",
      title: "carried",
      points: 3,
      acceptanceCriteria: ["one", "two"],
    });
    const returned = story("returned", 2);
    addToSprint(db, s.id, [done.key, carried.key, returned.key]);
    startSprint(db, s.id);
    updateIssue(db, done.key, { status: "done" });
    updateIssue(db, carried.key, {
      status: "in_progress",
      acceptanceCriteria: [
        { text: "one", done: true },
        { text: "two", done: false },
      ],
    });
    return { s, done, carried, returned };
  }

  it("records done, carried over and returned, and keeps status and ticks", () => {
    const { s, done, carried, returned } = runningSprint();
    completeSprint(db, s.id, { [carried.key]: "next", [returned.key]: "backlog" });

    const next = listSprints(db).find((x) => x.state === "planned")!;
    expect(next).toMatchObject({ number: 2, startDate: "2026-10-19", capacity: 20 }); // created for us

    const kept = getIssue(db, carried.key);
    expect(kept).toMatchObject({ sprintId: next.id, status: "in_progress" }); // status kept
    expect(kept.acceptanceCriteria.map((c) => c.done)).toEqual([true, false]); // ticks kept
    expect(getIssue(db, returned.key).sprintId).toBeNull();
    expect(getIssue(db, done.key).sprintId).toBe(s.id); // done work stays in its sprint's history

    const summary = getSprintSummary(db, s.id);
    expect(summary).toMatchObject({ committed: 10, done: 5, unfinished: 5, percent: 50 });
    expect(
      Object.fromEntries(
        summary.unfinishedIssues.map((i) => [i.key, [i.outcome, i.movedToSprint]]),
      ),
    ).toEqual({
      [carried.key]: ["carried_over", 2],
      [returned.key]: ["returned", null],
    });
    expect(listSprints(db).find((x) => x.id === s.id)!.state).toBe("completed");
  });

  it("returns unfinished work to the backlog by default, tagged, and it can be picked again", () => {
    const { s, carried, returned } = runningSprint();
    completeSprint(db, s.id, {});
    const back = listBacklog(db);
    expect(back.map((i) => i.key).sort()).toEqual([carried.key, returned.key].sort());
    expect(back.find((i) => i.key === returned.key)).toMatchObject({
      lastReturnedSprint: 1,
      slipCount: 1,
    });

    // Picked again: into the next sprint, then started.
    const next = plan("2026-10-19");
    addToSprint(db, next.id, [returned.key]);
    startSprint(db, next.id);
    expect(getSprintSummary(db, next.id).committed).toBe(2);
  });

  it("marks carried over issues in the next sprint, and computes velocity", () => {
    const { s, carried } = runningSprint();
    completeSprint(db, s.id, { [carried.key]: "next" });
    const next = listSprints(db).find((x) => x.state === "planned")!;
    expect(listSprintItems(db, next.id).find((i) => i.key === carried.key)?.carriedOver).toBe(true);
    expect(getVelocity(db)).toEqual({
      average: 5,
      recent: [{ sprintId: s.id, number: 1, committed: 10, done: 5 }],
    });
  });

  it("only completes the running sprint, and only once", () => {
    const { s } = runningSprint();
    completeSprint(db, s.id, {});
    expect(errorOf(() => completeSprint(db, s.id, {})).status).toBe(409);
  });
});

describe("settings", () => {
  it("starts from defaults and saves changes", () => {
    expect(getSettings(db)).toMatchObject({
      theme: "system",
      capacityDefault: 20,
      insightPatternReport: false,
    });
    expect(updateSettings(db, { theme: "dark", capacityDefault: 15 })).toMatchObject({
      theme: "dark",
      capacityDefault: 15,
    });
    expect(getSettings(db).theme).toBe("dark");
    expect(() => updateSettings(db, { ollamaUrl: "not a url" })).toThrow(/Ollama address/);
  });
});
