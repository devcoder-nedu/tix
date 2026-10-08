// Proves the database itself enforces the design doc's rules, so bad data is
// rejected even if a service has a bug. Each test gets a fresh in-memory database.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type TixDb } from "./db.ts";
import { issues, spaces, sprints } from "./schema.ts";

let db: TixDb;
let spaceId: number;

beforeEach(() => {
  db = openDb(":memory:");
  spaceId = db
    .insert(spaces)
    .values({ key: "FR", name: "French", color: "#3b74d6" })
    .returning()
    .get().id;
});

/** Insert an issue with sensible defaults; override what the test is about. */
function addIssue(values: Partial<typeof issues.$inferInsert> = {}) {
  return db
    .insert(issues)
    .values({
      key: `FR-${Math.random()}`,
      spaceId,
      type: "story",
      title: "x",
      rank: "a0",
      ...values,
    })
    .returning()
    .get();
}

function addSprint(number: number, state: "planned" | "active" | "completed") {
  return db
    .insert(sprints)
    .values({
      number,
      name: `Sprint ${number}`,
      lengthWeeks: 2,
      startDate: "2026-10-05",
      endDate: "2026-10-18",
      capacity: 20,
      state,
    })
    .returning()
    .get();
}

describe("opening the database", () => {
  it("creates all seven tables", () => {
    const tables = db.$client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'",
      )
      .pluck()
      .all();
    expect(tables.sort()).toEqual(
      [
        "insights",
        "issue_events",
        "issues",
        "settings",
        "spaces",
        "sprint_issues",
        "sprints",
      ].sort(),
    );
  });

  it("turns on WAL and foreign keys for a real file, and reopens cleanly", () => {
    const dir = mkdtempSync(join(tmpdir(), "tix-test-"));
    try {
      const file = join(dir, "tix.db");
      const first = openDb(file);
      expect(first.$client.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(first.$client.pragma("foreign_keys", { simple: true })).toBe(1);
      first.$client.close();
      // Opening again runs migrate() on an up to date file: must be a no-op.
      openDb(file).$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rules the schema enforces", () => {
  it("accepts every allowed point value and empty", () => {
    for (const points of [1, 2, 3, 5, 8, 13, null])
      expect(() => addIssue({ points })).not.toThrow();
  });

  it("rejects points that are not 1, 2, 3, 5, 8 or 13", () => {
    expect(() => addIssue({ points: 4 })).toThrow(/CHECK constraint failed: issue_points/);
  });

  it("rejects points on an epic or a subtask", () => {
    expect(() => addIssue({ type: "epic", points: 3 })).toThrow(/issue_points_type/);
    const story = addIssue();
    expect(() => addIssue({ type: "subtask", parentId: story.id, points: 1 })).toThrow(
      /issue_points_type/,
    );
  });

  it("requires a parent for a subtask and forbids one for an epic", () => {
    expect(() => addIssue({ type: "subtask" })).toThrow(/issue_subtask_parent/);
    const epic = addIssue({ type: "epic" });
    expect(() => addIssue({ type: "epic", parentId: epic.id })).toThrow(/issue_epic_parent/);
  });

  it("rejects an unknown status", () => {
    // `as never` gets past TypeScript on purpose: this tests the database, not the types.
    expect(() => addIssue({ status: "blocked" as never })).toThrow(/issue_status/);
  });

  it("never reuses a key", () => {
    addIssue({ key: "FR-1" });
    expect(() => addIssue({ key: "FR-1" })).toThrow(/UNIQUE constraint failed: issues.key/);
  });

  it("rejects an issue in a space that does not exist (foreign keys are on)", () => {
    expect(() => addIssue({ spaceId: 999 })).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("allows only one active sprint", () => {
    addSprint(1, "active");
    addSprint(2, "completed");
    expect(() => addSprint(3, "active")).toThrow(/UNIQUE constraint failed: sprints.state/);
  });

  it("allows only one planned sprint", () => {
    addSprint(1, "planned");
    expect(() => addSprint(2, "planned")).toThrow(/UNIQUE constraint failed: sprints.state/);
  });

  it("rejects a sprint that is not 1 or 2 weeks", () => {
    expect(() =>
      db
        .insert(sprints)
        .values({ number: 9, name: "x", lengthWeeks: 3, startDate: "a", endDate: "b", capacity: 1 })
        .run(),
    ).toThrow(/sprint_length/);
  });

  it("stores criteria as JSON and reads them back as objects", () => {
    const criteria = [{ text: "Book the exam", done: true }];
    const saved = addIssue({ acceptanceCriteria: criteria });
    expect(saved.acceptanceCriteria).toEqual(criteria);
    expect(saved.labels).toEqual([]); // default
  });
});
