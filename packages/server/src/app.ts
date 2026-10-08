// The HTTP API. Every route reads the request, calls one core service and
// returns its result as JSON; all rules live in @tix/core.

import fastifyStatic from "@fastify/static";
import {
  addToSprint,
  completeSprint,
  createIssue,
  createSprint,
  createSpace,
  deleteIssue,
  findIssue,
  getInsight,
  getIssue,
  getSettings,
  getSpace,
  getSprintSummary,
  getVelocity,
  listBacklog,
  listEvents,
  listIssues,
  listSpaces,
  listSprintItems,
  listSprintResults,
  listSprints,
  moveIssueToSpace,
  rankIssue,
  removeFromSprint,
  searchIssues,
  startSprint,
  TixError,
  updateIssue,
  updateSettings,
  updateSprint,
  type TixDb,
} from "@tix/core";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AppOptions {
  db: TixDb;
  /** Folder with the built web app (packages/web/dist); served at / when present. */
  webDist?: string;
  logger?: boolean;
}

// Route parameters arrive as text; these turn them into what services expect.
type Params = { key: string; id: string };
const toId = (value: string | undefined, name = "id") => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new TixError(`${name} must be a positive whole number`);
  return n;
};
const optionalId = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : value === "null" ? null : toId(value);

export function buildApp({ db, webDist, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  // Only answer requests addressed to this machine. Blocks DNS rebinding:
  // a website whose domain points at 127.0.0.1 still sends its own Host name.
  app.addHook("onRequest", async (request, reply) => {
    const host = (request.headers.host ?? "").replace(/:\d+$/, "");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      return reply.code(403).send({ error: "Tix only answers on localhost" });
    }
    // Writes must be JSON: browsers make other sites ask permission before
    // sending JSON cross-site, so a random page cannot change your data.
    // (DELETE has no body, and browsers already ask permission for it cross-site.)
    const writes = !["GET", "HEAD", "DELETE"].includes(request.method);
    if (writes && request.url.startsWith("/api/")) {
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        return reply.code(415).send({ error: "Send JSON (Content-Type: application/json)" });
      }
    }
  });

  // Rule errors become their status code with a readable message.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof TixError) return reply.code(error.status).send({ error: error.message });
    // Fastify's own errors (bad JSON, unknown content type) carry a statusCode.
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message });
    request.log.error(error);
    return reply.code(500).send({ error: "Something went wrong in Tix" });
  });

  // ---- spaces
  app.get("/api/spaces", async () => listSpaces(db));
  app.get<{ Params: Params }>("/api/spaces/:key", async (req) => getSpace(db, req.params.key));
  app.post("/api/spaces", async (req, reply) =>
    reply.code(201).send(createSpace(db, req.body as never)),
  );

  // ---- issues
  app.get<{ Querystring: Record<string, string> }>("/api/issues", async (req) =>
    listIssues(db, {
      spaceId: optionalId(req.query.spaceId) ?? undefined,
      sprintId: optionalId(req.query.sprintId),
      parentId: optionalId(req.query.parentId) ?? undefined,
    }),
  );
  app.get<{ Params: Params }>("/api/issues/:key", async (req) => getIssue(db, req.params.key));
  app.post("/api/issues", async (req, reply) =>
    reply.code(201).send(createIssue(db, req.body as never)),
  );
  app.patch<{ Params: Params }>("/api/issues/:key", async (req) =>
    updateIssue(db, req.params.key, req.body as never),
  );
  app.delete<{ Params: Params }>("/api/issues/:key", async (req, reply) => {
    deleteIssue(db, req.params.key);
    return reply.code(204).send();
  });
  app.post<{ Params: Params; Body: { spaceId: number } }>(
    "/api/issues/:key/move-space",
    async (req) => moveIssueToSpace(db, req.params.key, toId(String(req.body?.spaceId), "spaceId")),
  );
  app.post<{ Params: Params; Body: { prevKey: string | null; nextKey: string | null } }>(
    "/api/issues/:key/rank",
    async (req) =>
      rankIssue(db, req.params.key, {
        prevKey: req.body?.prevKey ?? null,
        nextKey: req.body?.nextKey ?? null,
      }),
  );
  app.get<{ Params: Params }>("/api/issues/:key/events", async (req) =>
    listEvents(db, findIssue(db, req.params.key).id),
  );
  app.get<{ Querystring: { issueId?: string } }>("/api/events", async (req) =>
    listEvents(db, toId(req.query.issueId, "issueId")),
  );
  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) =>
    searchIssues(db, req.query.q ?? ""),
  );
  app.get("/api/backlog", async () => listBacklog(db));

  // ---- sprints
  app.get("/api/sprints", async () => listSprints(db));
  app.post("/api/sprints", async (req, reply) =>
    reply.code(201).send(createSprint(db, req.body as never)),
  );
  app.patch<{ Params: Params }>("/api/sprints/:id", async (req) =>
    updateSprint(db, toId(req.params.id), req.body as never),
  );
  app.get<{ Params: Params }>("/api/sprints/:id/items", async (req) =>
    listSprintItems(db, toId(req.params.id)),
  );
  app.get<{ Params: Params }>("/api/sprints/:id/summary", async (req) =>
    getSprintSummary(db, toId(req.params.id)),
  );
  app.post<{ Params: Params; Body: { keys: string[] } }>(
    "/api/sprints/:id/add",
    async (req, reply) => {
      addToSprint(db, toId(req.params.id), req.body?.keys ?? []);
      return reply.code(204).send();
    },
  );
  app.post<{ Params: Params; Body: { keys: string[] } }>(
    "/api/sprints/:id/remove",
    async (req, reply) => {
      removeFromSprint(db, toId(req.params.id), req.body?.keys ?? []);
      return reply.code(204).send();
    },
  );
  app.post<{ Params: Params }>("/api/sprints/:id/start", async (req) =>
    startSprint(db, toId(req.params.id)),
  );
  app.post<{ Params: Params; Body: { moves: Record<string, never> } }>(
    "/api/sprints/:id/complete",
    async (req) => completeSprint(db, toId(req.params.id), req.body?.moves ?? {}),
  );
  app.get("/api/sprint-results", async () => listSprintResults(db));
  app.get("/api/velocity", async () => getVelocity(db));
  app.get<{ Querystring: { kind?: string; sprintId?: string } }>("/api/insights", async (req) =>
    getInsight(
      db,
      (req.query.kind ?? "sprint_review") as never,
      toId(req.query.sprintId, "sprintId"),
    ),
  );

  // ---- settings and local AI status
  app.get("/api/settings", async () => getSettings(db));
  app.patch("/api/settings", async (req) => updateSettings(db, req.body as never));
  app.get<{ Querystring: { url?: string } }>("/api/ollama", async (req) =>
    checkOllama(req.query.url ?? getSettings(db).ollamaUrl),
  );

  app.get("/api/health", async () => ({ ok: true }));
  app.all("/api/*", async (_req, reply) => reply.code(404).send({ error: "No such API route" }));

  // ---- the web app (production build)
  if (webDist && existsSync(join(webDist, "index.html"))) {
    app.register(fastifyStatic, { root: webDist, wildcard: false });
    // Any other page address (/backlog, /issue/FR-4) gets index.html; React Router takes it from there.
    app.setNotFoundHandler((req, reply) =>
      req.method === "GET"
        ? reply.sendFile("index.html")
        : reply.code(404).send({ error: "Not found" }),
    );
  }

  return app;
}

/**
 * Ask Ollama whether it is running and which models it has. Only loopback
 * addresses are allowed, so this route can't be used to reach other machines.
 */
export async function checkOllama(url: string): Promise<{ running: boolean; models: string[] }> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new TixError("Ollama address must be a URL like http://localhost:11434");
  }
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !/^https?:$/.test(target.protocol)
  ) {
    throw new TixError("Ollama must run on this Mac (localhost)");
  }
  try {
    const response = await fetch(new URL("/api/tags", target), {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return { running: false, models: [] };
    const body = (await response.json()) as { models?: { name: string }[] };
    return { running: true, models: (body.models ?? []).map((m) => m.name) };
  } catch {
    return { running: false, models: [] }; // not installed, not started, or wrong port
  }
}
