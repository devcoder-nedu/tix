// Runs the real `tix` command as a separate process, the way you would type it,
// against a temporary database (TIX_DB) so ~/.tix is never touched.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("./index.ts", import.meta.url));
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tix-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Run `tix ...args`; colours are off because output is not a terminal. */
function tix(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, TIX_DB: join(dir, "tix.db"), NO_COLOR: "1" },
    encoding: "utf8",
  });
  return { out: result.stdout.trim(), err: result.stderr.trim(), code: result.status };
}

describe("tix", () => {
  it("passes the Phase 1 check: create prints CODE-1 and list shows it", () => {
    expect(tix("seed").out).toContain("Added CODE (Coding)");
    expect(
      tix("create", "--space", "CODE", "--type", "story", "--title", "Build Tix board"),
    ).toEqual({
      out: "CODE-1",
      err: "",
      code: 0,
    });
    expect(tix("list").out).toMatch(/CODE-1\s+S\s+To do\s+-\s+Build Tix board/);
  });

  it("seeds once: running it again skips existing spaces", () => {
    tix("seed");
    expect(tix("seed").out).toContain("CODE already exists");
    expect(tix("space", "list").out.split("\n")).toHaveLength(6);
  });

  it("moves status with friendly names and shows the activity", () => {
    tix("space", "add", "FR", "French");
    tix(
      "create",
      "-s",
      "fr",
      "-t",
      "Book DELF",
      "--points",
      "1",
      "-c",
      "Date chosen",
      "-c",
      "Paid",
    );
    expect(tix("move", "FR-1", "in progress").out).toBe("FR-1 -> In progress");
    const shown = tix("show", "fr-1").out;
    expect(shown).toContain("Acceptance criteria · 0 of 2");
    expect(shown).toContain("To do -> In progress");
    expect(shown).toContain("Created from the CLI");
  });

  it("moves an issue to another space and still finds it by its old key", () => {
    tix("seed");
    tix("create", "-s", "FR", "-t", "Mover");
    expect(tix("move", "FR-1", "--space", "GCP").out).toBe("GCP-1 -> To do in GCP");
    expect(tix("show", "FR-1").out).toContain("Old keys  FR-1");
  });

  it("reports rule errors on stderr with exit code 1", () => {
    tix("seed");
    expect(tix("create", "-s", "CODE", "-t", "x", "--points", "4")).toMatchObject({
      err: "Error: Points must be 1, 2, 3, 5, 8 or 13",
      code: 1,
    });
    expect(tix("create", "-s", "NOPE", "-t", "x").err).toBe("Error: No space with key NOPE");
    expect(tix("move", "CODE-1", "blocked").code).not.toBe(0);
  });
});
