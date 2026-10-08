// Talks to the MCP server the way the Claude app does: a real MCP client,
// connected through an in-memory pipe instead of stdin/stdout.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSpace, getIssue, listEvents, openDb, type TixDb } from "@tix/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTixServer } from "./tools.ts";

let db: TixDb;
let client: Client;

beforeEach(async () => {
  db = openDb(":memory:");
  createSpace(db, { key: "FR", name: "French", color: "#3b74d6" });
  createSpace(db, { key: "CODE", name: "Coding", color: "#d6466f" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createTixServer(db).connect(serverSide);
  client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
});

/** Call a tool; return its parsed JSON, or the error text when it reports one. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
  };
  const text = result.content[0]!.text;
  return result.isError ? { error: text } : JSON.parse(text);
}

describe("Tix MCP tools", () => {
  it("offers the nine tools from the design doc, and no delete", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "create_issues",
        "get_issue",
        "get_sprint",
        "list_spaces",
        "move_issue",
        "plan_sprint",
        "search_issues",
        "split_issue",
        "update_issue",
      ].sort(),
    );
  });

  it("passes the Phase 5 check: a 1 point French story, marked as created by Claude", async () => {
    const created = await call("create_issues", {
      drafts: [
        {
          space: "FR",
          title: "Book the DELF exam",
          description: "As a French learner, I want a fixed exam date, so that I plan my study.",
          criteria: ["A date is chosen", "The fee is paid"],
          points: 1,
        },
      ],
    });
    expect(created).toEqual([{ key: "FR-1", title: "Book the DELF exam" }]);
    const issue = getIssue(db, "FR-1");
    expect(issue).toMatchObject({ createdBy: "claude", points: 1, type: "story" });
    expect(listEvents(db, issue.id)[0]).toMatchObject({ actor: "claude", toValue: "via Claude" });
  });

  it("creates all drafts or none", async () => {
    const result = await call("create_issues", {
      drafts: [
        { space: "FR", title: "fine" },
        { space: "NOPE", title: "bad space" },
      ],
    });
    expect(result).toEqual({ error: "No space with key NOPE" });
    expect(await call("search_issues", {})).toEqual([]); // "fine" was rolled back too
  });

  it("finds epics by title, and explains when one does not exist", async () => {
    await call("create_issues", { drafts: [{ space: "FR", type: "epic", title: "Reach B1" }] });
    const [story] = await call("create_issues", {
      drafts: [{ space: "FR", title: "Unit 7", epic: "reach b1", points: 3 }],
    });
    expect((await call("get_issue", { key: story.key })).parent).toBe("FR-1");
    expect(
      (await call("create_issues", { drafts: [{ space: "FR", title: "x", epic: "Vocab" }] })).error,
    ).toBe('No epic "Vocab" in FR. Epics there: FR-1 Reach B1');
  });

  it("returns rule errors as messages Claude can act on", async () => {
    await call("create_issues", { drafts: [{ space: "FR", title: "x" }] });
    expect((await call("update_issue", { key: "FR-1", title: "  " })).error).toBe(
      "Summary is required",
    );
    expect((await call("get_issue", { key: "FR-99" })).error).toBe("No issue with key FR-99");
  });

  it("searches with filters and moves status, logged as Claude", async () => {
    await call("create_issues", {
      drafts: [
        { space: "FR", title: "Listen daily", points: 3 },
        { space: "CODE", title: "Build board", type: "task", points: 5 },
      ],
    });
    expect(
      (await call("search_issues", { space: "CODE" })).map((i: { key: string }) => i.key),
    ).toEqual(["CODE-1"]);
    expect((await call("search_issues", { text: "listen" }))[0].key).toBe("FR-1");
    expect(await call("move_issue", { key: "FR-1", status: "in_progress" })).toMatchObject({
      status: "in_progress",
    });
    const events = listEvents(db, getIssue(db, "FR-1").id);
    expect(events[0]).toMatchObject({ kind: "status", actor: "claude" });
  });

  it("plans the next sprint against velocity and reads it back", async () => {
    await call("create_issues", {
      drafts: [
        { space: "FR", title: "a", points: 3 },
        { space: "CODE", title: "b", points: 5 },
      ],
    });
    const plan = await call("plan_sprint", { add: ["FR-1", "CODE-1"] });
    expect(plan).toMatchObject({
      number: 1,
      state: "planned",
      plannedPoints: 8,
      capacity: 20,
      velocity: null,
    });
    expect(plan.pointsBySpace).toEqual({ FR: 3, CODE: 5 });
    expect((await call("plan_sprint", { remove: ["CODE-1"] })).plannedPoints).toBe(3);
    expect(
      (await call("get_sprint", { sprint: "next" })).issues.map((i: { key: string }) => i.key),
    ).toEqual(["FR-1"]);
    expect((await call("get_sprint", {})).error).toBe("No sprint is running");
  });

  it("splits a big story; closing the original keeps its points out of done work", async () => {
    await call("create_issues", { drafts: [{ space: "FR", type: "epic", title: "Reach B1" }] });
    await call("create_issues", {
      drafts: [{ space: "FR", title: "Mock exam", epic: "FR-1", points: 13 }],
    });
    const result = await call("split_issue", {
      key: "FR-2",
      original: "close",
      drafts: [
        { title: "Mock exam: reading and listening", points: 5 },
        { title: "Mock exam: writing and speaking", points: 5 },
      ],
    });
    expect(result).toEqual({ created: ["FR-3", "FR-4"], original: { key: "FR-2", closed: true } });
    expect(getIssue(db, "FR-3").parentId).toBe(getIssue(db, "FR-1").id); // same epic
    expect(getIssue(db, "FR-2")).toMatchObject({ status: "done", points: null });
    expect(getIssue(db, "FR-2").description).toContain("Split into FR-3, FR-4.");
  });
});
