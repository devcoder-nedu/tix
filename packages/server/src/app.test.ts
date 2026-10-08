// HTTP tests with Fastify's inject(): real requests through every hook and
// route, no open port, against a fresh in-memory database.

import { openDb } from "@tix/core";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  app = buildApp({ db: openDb(":memory:") });
});

const json = { "content-type": "application/json", host: "localhost:4000" };
const get = (url: string) =>
  app.inject({ method: "GET", url, headers: { host: "localhost:4000" } });
const send = (method: "POST" | "PATCH", url: string, body: unknown = {}) =>
  app.inject({ method, url, headers: json, payload: JSON.stringify(body) });

describe("API", () => {
  it("creates a space and an issue, then reads them back", async () => {
    expect(
      (await send("POST", "/api/spaces", { key: "code", name: "Coding", color: "#d6466f" }))
        .statusCode,
    ).toBe(201);
    const created = await send("POST", "/api/issues", {
      spaceId: 1,
      type: "story",
      title: "Build Tix board",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().key).toBe("CODE-1");
    expect((await get("/api/issues/code-1")).json().title).toBe("Build Tix board");
    expect((await get("/api/backlog")).json()).toHaveLength(1);
    expect((await get("/api/spaces")).json()[0]).toMatchObject({ key: "CODE", openCount: 1 });
  });

  it("turns rule errors into their status and message", async () => {
    await send("POST", "/api/spaces", { key: "FR", name: "French", color: "#3b74d6" });
    const bad = await send("POST", "/api/issues", {
      spaceId: 1,
      type: "story",
      title: "x",
      points: 4,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: "Points must be 1, 2, 3, 5, 8 or 13" });
    expect((await get("/api/issues/FR-99")).statusCode).toBe(404);
    expect((await get("/api/nope")).statusCode).toBe(404);
  });

  it("runs a sprint end to end over HTTP", async () => {
    await send("POST", "/api/spaces", { key: "FR", name: "French", color: "#3b74d6" });
    for (const title of ["a", "b"])
      await send("POST", "/api/issues", { spaceId: 1, type: "story", title, points: 3 });
    const sprint = (
      await send("POST", "/api/sprints", { lengthWeeks: 2, startDate: "2026-10-05", capacity: 20 })
    ).json();
    await send("POST", `/api/sprints/${sprint.id}/add`, { keys: ["FR-1", "FR-2"] });
    expect((await send("POST", `/api/sprints/${sprint.id}/start`)).json().state).toBe("active");
    await send("PATCH", "/api/issues/FR-1", { status: "done" });
    await send("POST", `/api/sprints/${sprint.id}/complete`, { moves: { "FR-2": "backlog" } });
    expect((await get(`/api/sprints/${sprint.id}/summary`)).json()).toMatchObject({
      committed: 6,
      done: 3,
    });
    expect((await get("/api/velocity")).json().average).toBe(3);
    expect((await get("/api/backlog")).json()[0]).toMatchObject({
      key: "FR-2",
      lastReturnedSprint: 1,
    });
  });

  it("reads and saves settings", async () => {
    expect((await get("/api/settings")).json().theme).toBe("system");
    expect((await send("PATCH", "/api/settings", { theme: "dark" })).json().theme).toBe("dark");
  });
});

describe("safety", () => {
  it("refuses requests not addressed to localhost (DNS rebinding)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/spaces",
      headers: { host: "evil.example:4000" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses writes that are not JSON (form posts from other sites)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/spaces",
      headers: { host: "localhost:4000", "content-type": "text/plain" },
      payload: '{"key":"X","name":"x","color":"#000000"}',
    });
    expect(res.statusCode).toBe(415);
  });

  it("only checks Ollama on this Mac", async () => {
    expect((await get("/api/ollama?url=http://10.0.0.5:11434")).statusCode).toBe(400);
    // Nothing listens on port 1: reported as not running, not as an error.
    expect((await get("/api/ollama?url=http://localhost:1")).json()).toEqual({
      running: false,
      models: [],
    });
  });
});
