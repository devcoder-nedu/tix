// Unique space names, archive, restore and delete.

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type TixDb } from "../db.ts";
import { TixError } from "../errors.ts";
import { spaces } from "../schema.ts";
import { createIssue, deleteIssue, moveIssueToSpace, updateIssue } from "./issues.ts";
import {
  archiveSpace,
  createSpace,
  deleteSpace,
  getSpace,
  listSpaces,
  restoreSpace,
} from "./spaces.ts";

let db: TixDb;
beforeEach(() => {
  db = openDb(":memory:");
});

const add = (key: string, name: string) => createSpace(db, { key, name, color: "#3b74d6" });
const keys = (list: { key: string }[]) => list.map((s) => s.key);

function errorOf(fn: () => unknown): TixError {
  try {
    fn();
  } catch (e) {
    if (e instanceof TixError) return e;
    throw e;
  }
  throw new Error("expected a TixError");
}

describe("unique names", () => {
  it("rejects a second space with the same name, ignoring case and outer spaces", () => {
    add("FR", "French");
    for (const name of ["French", "french", "  FRENCH "]) {
      const e = errorOf(() => add("FREN", name));
      expect(e).toMatchObject({ status: 409, message: "A space named French already exists (FR)" });
    }
    expect(() => add("FR2", "French 2")).not.toThrow(); // a different name is fine
  });

  it("counts archived spaces, and says to restore instead", () => {
    add("FR", "French");
    archiveSpace(db, "FR");
    expect(errorOf(() => add("FRA", "French")).message).toBe(
      "An archived space is already named French (FR); restore it instead",
    );
  });

  it("is enforced by the database too", () => {
    add("FR", "French");
    expect(() =>
      db.insert(spaces).values({ key: "X", name: "FRENCH", color: "#000000" }).run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("upgrades an old database that already has duplicate names", () => {
    // Build a database with only the first migration, holding two "French" spaces.
    const dir = mkdtempSync(join(tmpdir(), "tix-migrate-"));
    try {
      // Recreate a database from before this rule: only migration 0000 applied
      // (and recorded, as Drizzle does), holding two spaces called "French".
      const firstOnly = join(dir, "migrations");
      mkdirSync(join(firstOnly, "meta"), { recursive: true });
      const source = new URL("../../drizzle/", import.meta.url);
      copyFileSync(new URL("0000_init.sql", source), join(firstOnly, "0000_init.sql"));
      const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", source), "utf8"));
      journal.entries = journal.entries.slice(0, 1);
      writeFileSync(join(firstOnly, "meta", "_journal.json"), JSON.stringify(journal));

      const file = join(dir, "old.db");
      const old = new Database(file);
      migrate(drizzle({ client: old }), { migrationsFolder: firstOnly });
      old.exec(
        `INSERT INTO spaces (key, name, color) VALUES ('FREN','French','#000'), ('FR','French','#000')`,
      );
      old.close();

      // Opening it with today's code applies only the new migration.
      const upgraded = openDb(file);
      expect(listSpaces(upgraded).map((s) => [s.key, s.name])).toEqual([
        ["FREN", "French"],
        ["FR", "French (FR)"],
      ]);
      upgraded.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("archive and restore", () => {
  it("hides an archived space from lists, keeps it findable, and restores it", () => {
    add("FR", "French");
    add("GCP", "GCP");
    archiveSpace(db, "fr");
    expect(keys(listSpaces(db))).toEqual(["GCP"]);
    expect(keys(listSpaces(db, { archived: true }))).toEqual(["FR"]);
    expect(getSpace(db, "FR").archived).toBe(true); // its page still works
    restoreSpace(db, "FR");
    expect(keys(listSpaces(db))).toEqual(["FR", "GCP"]);
  });

  it("is blocked while open story-level issues remain, and names them", () => {
    const fr = add("FR", "French").id;
    createIssue(db, { spaceId: fr, type: "epic", title: "Epic" }); // epics never block
    const a = createIssue(db, { spaceId: fr, type: "story", title: "a" });
    createIssue(db, { spaceId: fr, type: "task", title: "b" });
    expect(errorOf(() => archiveSpace(db, "FR")).message).toBe(
      "French still has 2 open issues (FR-2, FR-3). Finish, move or delete them first.",
    );
    updateIssue(db, a.key, { status: "done" });
    deleteIssue(db, "FR-3");
    expect(archiveSpace(db, "FR").archived).toBe(true);
  });

  it("keeps issues out of an archived space", () => {
    const fr = add("FR", "French").id;
    const gcp = add("GCP", "GCP").id;
    archiveSpace(db, "FR");
    expect(errorOf(() => createIssue(db, { spaceId: fr, type: "story", title: "x" })).message).toBe(
      "French is archived; restore it to add issues",
    );
    const moved = createIssue(db, { spaceId: gcp, type: "story", title: "y" });
    expect(errorOf(() => moveIssueToSpace(db, moved.key, fr)).status).toBe(404);
  });
});

describe("delete", () => {
  it("removes a space that never had issues", () => {
    add("FREN", "French");
    deleteSpace(db, "FREN");
    expect(errorOf(() => getSpace(db, "FREN")).status).toBe(404);
    expect(() => add("FR", "French")).not.toThrow(); // its name is free again
  });

  it("refuses once a key was handed out, even if every issue left", () => {
    const fr = add("FR", "French").id;
    const gcp = add("GCP", "GCP").id;
    const issue = createIssue(db, { spaceId: fr, type: "story", title: "x" });
    moveIssueToSpace(db, issue.key, gcp); // FR is now empty, but FR-1 lives on as an alias
    expect(errorOf(() => deleteSpace(db, "FR")).message).toBe(
      "French has had issues (up to FR-1), so its history must stay. Archive it instead.",
    );
  });
});
