// The design doc's issue rules, tested against a fresh in-memory database each time.

import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type TixDb } from "../db.ts";
import { TixError } from "../errors.ts";
import { sprintIssues, sprints } from "../schema.ts";
import {
  createIssue,
  deleteIssue,
  getIssue,
  listBacklog,
  listEvents,
  listIssues,
  moveIssueToSpace,
  rankIssue,
  searchIssues,
  updateIssue,
} from "./issues.ts";
import { createSpace, getSpace, listSpaces } from "./spaces.ts";

let db: TixDb;
let fr: number;
let gcp: number;

beforeEach(() => {
  db = openDb(":memory:");
  fr = createSpace(db, { key: "fr", name: " French ", color: "#3b74d6" }).id;
  gcp = createSpace(db, { key: "GCP", name: "GCP", color: "#2a9d68" }).id;
});

const story = (title = "A story", extra = {}) =>
  createIssue(db, { spaceId: fr, type: "story", title, ...extra });

/** The error a call throws, so tests can check both message and status. */
function errorOf(fn: () => unknown): TixError {
  try {
    fn();
  } catch (e) {
    if (e instanceof TixError) return e;
    throw e;
  }
  throw new Error("expected a TixError");
}

describe("spaces", () => {
  it("uppercases keys and trims names", () => {
    expect(getSpace(db, "fr")).toMatchObject({ key: "FR", name: "French", nextNumber: 1 });
  });

  it("rejects a duplicate key, a bad key and a blank name", () => {
    expect(errorOf(() => createSpace(db, { key: "FR", name: "x", color: "#000000" })).status).toBe(
      409,
    );
    expect(
      errorOf(() => createSpace(db, { key: "1AB", name: "x", color: "#000000" })).message,
    ).toMatch(/starting with a letter/);
    expect(errorOf(() => createSpace(db, { key: "ES", name: " ", color: "#000000" })).message).toBe(
      "Name is required",
    );
  });

  it("summarises open, done and epics per space", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Reach B1" });
    story("one", { parentId: epic.id });
    const done = story("two", { parentId: epic.id });
    updateIssue(db, done.key, { status: "done" });
    const french = listSpaces(db).find((s) => s.key === "FR")!;
    expect(french).toMatchObject({ openCount: 1, epicCount: 1, percentDone: 50, doneThisMonth: 1 });
    expect(french.epics.map((e) => e.title)).toEqual(["Reach B1"]);
  });
});

describe("keys", () => {
  it("hands out keys from the space's counter", () => {
    expect([story().key, story().key, story().key]).toEqual(["FR-1", "FR-2", "FR-3"]);
    expect(createIssue(db, { spaceId: gcp, type: "task", title: "t" }).key).toBe("GCP-1");
  });

  it("never reuses a key after delete", () => {
    story();
    const second = story();
    deleteIssue(db, second.key);
    expect(story().key).toBe("FR-3");
  });

  it("does not use up a key when a create fails (the transaction rolls back)", () => {
    story();
    expect(() => createIssue(db, { spaceId: fr, type: "subtask", title: "orphan" })).toThrow();
    expect(story().key).toBe("FR-2");
    expect(getSpace(db, "FR").nextNumber).toBe(3);
  });

  it("finds issues by key in any case", () => {
    story("Book the exam");
    expect(getIssue(db, "fr-1").title).toBe("Book the exam");
    expect(errorOf(() => getIssue(db, "FR-99")).status).toBe(404);
  });
});

describe("parent rules", () => {
  it("allows story under epic and subtask under story", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    const s = story("Story", { parentId: epic.id });
    const sub = createIssue(db, { spaceId: fr, type: "subtask", title: "Sub", parentId: s.id });
    expect(sub.parentId).toBe(s.id);
  });

  it("rejects a subtask without a parent and an epic with one", () => {
    expect(
      errorOf(() => createIssue(db, { spaceId: fr, type: "subtask", title: "x" })).message,
    ).toBe("A subtask needs a parent story or task");
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    expect(
      errorOf(() => createIssue(db, { spaceId: fr, type: "epic", title: "x", parentId: epic.id }))
        .message,
    ).toBe("An epic cannot have a parent");
  });

  it("rejects a story under a story, and a subtask under an epic", () => {
    const s = story();
    expect(errorOf(() => story("x", { parentId: s.id })).message).toBe(
      "A story's parent must be an epic",
    );
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    expect(
      errorOf(() =>
        createIssue(db, { spaceId: fr, type: "subtask", title: "x", parentId: epic.id }),
      ).message,
    ).toMatch(/must be a story, task, bug or spike/);
  });

  it("rejects a parent in another space", () => {
    const gcpEpic = createIssue(db, { spaceId: gcp, type: "epic", title: "IAP" });
    expect(errorOf(() => story("x", { parentId: gcpEpic.id })).message).toBe(
      "Parent must be in the same space",
    );
  });
});

describe("points", () => {
  it("accepts 1, 2, 3, 5, 8, 13 and empty", () => {
    for (const points of [1, 2, 3, 5, 8, 13, null] as const)
      expect(story("x", { points }).points).toBe(points);
  });

  it("rejects other values with a clear message", () => {
    expect(errorOf(() => story("x", { points: 4 as never })).message).toBe(
      "Points must be 1, 2, 3, 5, 8 or 13",
    );
  });

  it("rejects points on epics and subtasks, on create and on update", () => {
    expect(
      errorOf(() => createIssue(db, { spaceId: fr, type: "epic", title: "x", points: 3 })).message,
    ).toBe("An epic cannot carry points");
    const s = story();
    const sub = createIssue(db, { spaceId: fr, type: "subtask", title: "x", parentId: s.id });
    expect(errorOf(() => updateIssue(db, sub.key, { points: 2 })).message).toBe(
      "A subtask cannot carry points",
    );
  });
});

describe("validation at the door", () => {
  it("trims the title and drops blank criteria lines", () => {
    const s = story("  Join a club  ", {
      acceptanceCriteria: ["Two sessions", "  ", "Ten expressions"],
    });
    expect(s.title).toBe("Join a club");
    expect(s.acceptanceCriteria).toEqual([
      { text: "Two sessions", done: false },
      { text: "Ten expressions", done: false },
    ]);
  });

  it("rejects a blank title and unknown fields in a patch", () => {
    expect(errorOf(() => story("   ")).message).toBe("Summary is required");
    const s = story();
    expect(() => updateIssue(db, s.key, { statsu: "done" } as never)).toThrow(TixError);
  });
});

describe("updates and the activity log", () => {
  it("logs status, points and sprint changes, and sets completedAt on done", () => {
    const s = story();
    updateIssue(db, s.key, { status: "in_progress" });
    updateIssue(db, s.key, { points: 3 });
    const done = updateIssue(db, s.key, { status: "done" });
    expect(done.completedAt).not.toBeNull();
    expect(updateIssue(db, s.key, { status: "todo" }).completedAt).toBeNull();

    const kinds = listEvents(db, s.id).map((e) => `${e.kind}:${e.fromValue}->${e.toValue}`);
    expect(kinds).toEqual([
      "status:done->todo",
      "status:in_progress->done",
      "points:null->3",
      "status:todo->in_progress",
      "created:null->from the Create form",
    ]);
  });

  it("records who made a change", () => {
    const s = createIssue(db, { spaceId: fr, type: "story", title: "x", createdBy: "claude" });
    updateIssue(db, s.key, { status: "in_review" }, { actor: "claude" });
    expect(listEvents(db, s.id).map((e) => e.actor)).toEqual(["claude", "claude"]);
  });

  it("keeps criteria ticks", () => {
    const s = story("x", { acceptanceCriteria: ["a", "b"] });
    const ticked = updateIssue(db, s.key, {
      acceptanceCriteria: [
        { text: "a", done: true },
        { text: "b", done: false },
      ],
    });
    expect(ticked.acceptanceCriteria.map((c) => c.done)).toEqual([true, false]);
  });
});

describe("moving to another space", () => {
  it("gives new keys, keeps old ones as aliases, and moves subtasks", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    const s = story("Mover", { parentId: epic.id });
    createIssue(db, { spaceId: fr, type: "subtask", title: "Sub", parentId: s.id });

    const moved = moveIssueToSpace(db, s.key, gcp);
    expect(moved).toMatchObject({ key: "GCP-1", parentId: null, previousKeys: ["FR-2"] });
    expect(getIssue(db, "FR-2").key).toBe("GCP-1"); // old links keep working
    expect(listIssues(db, { spaceId: gcp }).map((i) => i.key)).toEqual(["GCP-1", "GCP-2"]);
    expect(story().key).toBe("FR-4"); // FR's counter is untouched by the move
  });

  it("refuses to move an epic or a subtask on its own", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    expect(errorOf(() => moveIssueToSpace(db, epic.key, gcp)).message).toMatch(/epic cannot move/);
    const s = story();
    const sub = createIssue(db, { spaceId: fr, type: "subtask", title: "x", parentId: s.id });
    expect(errorOf(() => moveIssueToSpace(db, sub.key, gcp)).message).toMatch(
      /moves with its parent/,
    );
  });
});

describe("delete", () => {
  it("soft deletes: hidden, but the row stays", () => {
    const s = story();
    deleteIssue(db, s.key);
    expect(errorOf(() => getIssue(db, s.key)).status).toBe(404);
    expect(
      db.$client.prepare("SELECT deleted_at FROM issues WHERE id = ?").pluck().get(s.id),
    ).not.toBeNull();
  });

  it("blocks deleting an epic with open issues", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    const s = story("x", { parentId: epic.id });
    expect(errorOf(() => deleteIssue(db, epic.key)).status).toBe(409);
    updateIssue(db, s.key, { status: "done" });
    expect(() => deleteIssue(db, epic.key)).not.toThrow();
  });
});

describe("backlog and ranking", () => {
  it("lists open story-level issues without a sprint, in rank order", () => {
    const epic = createIssue(db, { spaceId: fr, type: "epic", title: "Epic" });
    const a = story("a", { parentId: epic.id });
    story("b");
    createIssue(db, { spaceId: fr, type: "subtask", title: "sub", parentId: a.id });
    updateIssue(db, story("done").key, { status: "done" });
    const backlog = listBacklog(db);
    expect(backlog.map((i) => i.title)).toEqual(["a", "b"]);
    expect(backlog[0]!.epic).toEqual({ key: "FR-1", title: "Epic" });
  });

  it("moves one issue between neighbours and changes only its rank", () => {
    const [a, b, c] = [story("a"), story("b"), story("c")];
    const before = new Map(listBacklog(db).map((i) => [i.key, i.rank]));
    rankIssue(db, c.key, { prevKey: null, nextKey: a.key });
    const after = listBacklog(db);
    expect(after.map((i) => i.title)).toEqual(["c", "a", "b"]);
    expect(after.filter((i) => before.get(i.key) !== i.rank).map((i) => i.key)).toEqual([c.key]);
    expect(errorOf(() => rankIssue(db, a.key, { prevKey: b.key, nextKey: c.key })).status).toBe(
      409,
    );
  });

  it("tags slips and 'was in Sprint N' from sprint history", () => {
    const s = story();
    const sprint = (number: number) =>
      db
        .insert(sprints)
        .values({
          number,
          name: `Sprint ${number}`,
          lengthWeeks: 2,
          startDate: "2026-09-01",
          endDate: "2026-09-14",
          capacity: 20,
          state: "completed",
        })
        .returning()
        .get().id;
    const [s1, s2] = [sprint(1), sprint(2)];
    db.insert(sprintIssues)
      .values([
        { sprintId: s1, issueId: s.id, pointsAtStart: 3, outcome: "returned" },
        { sprintId: s2, issueId: s.id, pointsAtStart: 3, outcome: "returned" },
      ])
      .run();
    expect(listBacklog(db)[0]).toMatchObject({
      slipCount: 2,
      lastReturnedSprint: 2,
      carriedOver: false,
    });
  });
});

describe("search", () => {
  it("ranks exact key, then key prefix, then title; finds old keys", () => {
    for (let n = 1; n <= 12; n++) story(n === 12 ? "DELF mock exam" : `Story ${n}`);
    expect(
      searchIssues(db, "fr-1")
        .map((i) => i.key)
        .slice(0, 3),
    ).toEqual(["FR-1", "FR-10", "FR-11"]);
    expect(searchIssues(db, "delf").map((i) => i.key)).toEqual(["FR-12"]);
    moveIssueToSpace(db, "FR-12", gcp);
    expect(searchIssues(db, "FR-12").map((i) => i.key)).toEqual(["GCP-1"]);
    expect(searchIssues(db, "   ")).toEqual([]);
    expect(searchIssues(db, "100%")).toEqual([]); // % is plain text, not a wildcard
  });
});
