// The nine tools Claude can call, from the design doc. Each one validates its
// input (zod, so Claude sees the allowed values), calls core services and
// returns compact JSON. Everything Claude creates or changes is recorded with
// actor "claude", so the app shows "via Claude".
//
// Deleting is left out on purpose: deleting stays a manual action in the app.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  activeSprint,
  addToSprint,
  createIssue,
  createSprint,
  findIssue,
  findSpaceByKey,
  getSettings,
  getSprintSummary,
  getVelocity,
  listEvents,
  listIssues,
  listSpaces,
  listSprintItems,
  listSprints,
  removeFromSprint,
  searchIssues,
  TixError,
  updateIssue,
  type Issue,
  type Conn,
  type Sprint,
  type TixDb,
} from "@tix/core";
import { z } from "zod";

const CLAUDE = { actor: "claude" } as const;

// ---- shared input pieces (descriptions are what Claude reads)

const points = z
  .literal([1, 2, 3, 5, 8, 13])
  .nullable()
  .describe("Story points: 1, 2, 3, 5, 8 or 13; null for unestimated. Never on epics or subtasks.");
const status = z.enum(["todo", "in_progress", "in_review", "done"]);
const sprintRef = z
  .union([z.enum(["current", "next"]), z.number().int().positive()])
  .describe('"current" (running), "next" (planned), or a sprint number');

const draft = z.object({
  space: z.string().describe("Space key, e.g. FR. Use list_spaces; never invent a space."),
  type: z.enum(["epic", "story", "task", "bug", "spike", "subtask"]).default("story"),
  title: z.string().min(1).describe("Short summary, plain words"),
  description: z.string().optional().describe('For stories: "As a ..., I want ..., so that ..."'),
  criteria: z.array(z.string()).optional().describe("2 to 5 testable acceptance criteria"),
  points: points.optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  epic: z
    .string()
    .optional()
    .describe("Epic key (FR-1) or exact epic title, for story-level issues"),
  parent: z.string().optional().describe("Parent story or task key, required for subtasks"),
  sprint: z.enum(["current", "next"]).optional().describe("Put it straight into a sprint"),
});
type Draft = z.output<typeof draft>;

// ---- helpers

/** Tool results are text; JSON keeps them exact and easy for Claude to read. */
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

/**
 * Run a tool body. Rule errors (bad points, unknown key) go back to Claude as a
 * readable error it can correct; anything else is a real bug and is thrown.
 */
function run(body: () => unknown) {
  try {
    return json(body());
  } catch (error) {
    if (!(error instanceof TixError)) throw error;
    return { isError: true, content: [{ type: "text" as const, text: error.message }] };
  }
}

function resolveSprint(db: Conn, ref: "current" | "next" | number): Sprint {
  const sprints = listSprints(db);
  const found =
    ref === "current"
      ? sprints.find((s) => s.state === "active")
      : ref === "next"
        ? sprints.find((s) => s.state === "planned")
        : sprints.find((s) => s.number === ref);
  if (!found) {
    throw new TixError(
      ref === "current"
        ? "No sprint is running"
        : ref === "next"
          ? "No sprint is planned"
          : `No Sprint ${ref}`,
      404,
    );
  }
  return found;
}

/** Only the fields Claude needs, with readable names instead of ids. */
function brief(db: Conn, list: Issue[]) {
  const spaces = new Map(listSpaces(db).map((s) => [s.id, s.key]));
  const sprints = new Map(listSprints(db).map((s) => [s.id, s.number]));
  const all = new Map(listIssues(db).map((i) => [i.id, i.key]));
  return list.map((i) => ({
    key: i.key,
    type: i.type,
    title: i.title,
    status: i.status,
    points: i.points,
    priority: i.priority,
    space: spaces.get(i.spaceId),
    parent: i.parentId ? (all.get(i.parentId) ?? null) : null,
    sprint: i.sprintId ? (sprints.get(i.sprintId) ?? null) : null,
    createdBy: i.createdBy,
  }));
}

/** Turn a draft into core's input: space key -> id, epic key or title -> id. */
function toNewIssue(db: Conn, d: Draft) {
  const space = findSpaceByKey(db, d.space);
  let parentId: number | null = null;
  if (d.type === "subtask") {
    if (!d.parent) throw new TixError(`"${d.title}": a subtask needs a parent key`);
    parentId = findIssue(db, d.parent).id;
  } else if (d.epic) {
    const ref = d.epic.trim();
    const epics = listIssues(db, { spaceId: space.id }).filter((i) => i.type === "epic");
    const match =
      epics.find((e) => e.key === ref.toUpperCase()) ??
      epics.filter((e) => e.title.toLowerCase() === ref.toLowerCase()).at(0);
    if (!match) {
      const names = epics.map((e) => `${e.key} ${e.title}`).join(", ") || "none yet";
      throw new TixError(`No epic "${ref}" in ${space.key}. Epics there: ${names}`);
    }
    parentId = match.id;
  }
  return {
    spaceId: space.id,
    type: d.type,
    parentId,
    title: d.title,
    description: d.description,
    acceptanceCriteria: d.criteria,
    points: d.points ?? null,
    priority: d.priority,
    sprintId: d.sprint ? resolveSprint(db, d.sprint).id : null,
    createdBy: "claude" as const,
  };
}

/** Sprint, its issues, points by space and velocity: what planning needs. */
function sprintView(db: Conn, sprint: Sprint) {
  const spaces = new Map(listSpaces(db).map((s) => [s.id, s.key]));
  const velocity = getVelocity(db).average;
  const base = {
    number: sprint.number,
    state: sprint.state,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    capacity: sprint.capacity,
    velocity, // average done points over the last 3 sprints; null before any
  };
  if (sprint.state === "planned") {
    const items = listSprintItems(db, sprint.id);
    const total = items.reduce((n, i) => n + (i.points ?? 0), 0);
    const bySpace: Record<string, number> = {};
    for (const i of items) {
      const key = spaces.get(i.spaceId) ?? "?";
      bySpace[key] = (bySpace[key] ?? 0) + (i.points ?? 0);
    }
    return {
      ...base,
      plannedPoints: total,
      overCapacity: total > sprint.capacity,
      unestimated: items.filter((i) => i.points === null).map((i) => i.key),
      pointsBySpace: bySpace,
      issues: brief(db, items).map((b, n) => ({ ...b, carriedOver: items[n]!.carriedOver })),
    };
  }
  const summary = getSprintSummary(db, sprint.id);
  return {
    ...base,
    committed: summary.committed,
    done: summary.done,
    open: summary.unfinished,
    pointsBySpace: Object.fromEntries(
      summary.bySpace.map((s) => [
        spaces.get(s.spaceId) ?? "?",
        { committed: s.committed, done: s.done },
      ]),
    ),
    issues: brief(db, [...summary.finishedIssues, ...summary.unfinishedIssues]),
  };
}

// ---- the server

export function createTixServer(db: TixDb): McpServer {
  const server = new McpServer({ name: "tix", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "list_spaces",
    {
      title: "List spaces",
      description: "All spaces (life areas) with their keys, epics and open issue counts.",
      annotations: readOnly,
    },
    () =>
      run(() =>
        listSpaces(db).map((s) => ({
          key: s.key,
          name: s.name,
          goal: s.description,
          openIssues: s.openCount,
          epics: s.epics.map((e) => ({ key: e.key, title: e.title })),
        })),
      ),
  );

  server.registerTool(
    "search_issues",
    {
      title: "Search issues",
      description:
        "Find issues by text (key, old key or title) and filters. Open issues only unless status is given. Up to 50 results.",
      inputSchema: {
        text: z.string().optional(),
        space: z.string().optional().describe("Space key"),
        status: status.optional(),
        sprint: z
          .union([z.enum(["current", "next", "backlog"]), z.number().int().positive()])
          .optional()
          .describe('"backlog" means not in any sprint'),
        type: z.enum(["epic", "story", "task", "bug", "spike", "subtask"]).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() => {
        let list = args.text?.trim() ? searchIssues(db, args.text, 500) : listIssues(db);
        if (args.space) {
          const spaceId = findSpaceByKey(db, args.space).id;
          list = list.filter((i) => i.spaceId === spaceId);
        }
        list = list.filter((i) => (args.status ? i.status === args.status : i.status !== "done"));
        if (args.type) list = list.filter((i) => i.type === args.type);
        if (args.sprint === "backlog") list = list.filter((i) => i.sprintId === null);
        else if (args.sprint !== undefined) {
          const id = resolveSprint(db, args.sprint).id;
          list = list.filter((i) => i.sprintId === id);
        }
        return brief(db, list.slice(0, 50));
      }),
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: "One issue in full: description, acceptance criteria, subtasks and history.",
      inputSchema: { key: z.string().describe("Issue key, e.g. FR-4 (old keys work too)") },
      annotations: readOnly,
    },
    ({ key }) =>
      run(() => {
        const issue = findIssue(db, key);
        const children = listIssues(db, { parentId: issue.id });
        return {
          ...brief(db, [issue])[0],
          description: issue.description,
          acceptanceCriteria: issue.acceptanceCriteria,
          previousKeys: issue.previousKeys,
          children: brief(db, children),
          history: listEvents(db, issue.id)
            .slice(0, 20)
            .map((e) => ({
              at: e.at,
              by: e.actor,
              kind: e.kind,
              from: e.fromValue,
              to: e.toValue,
            })),
        };
      }),
  );

  server.registerTool(
    "create_issues",
    {
      title: "Create issues",
      description:
        "Create one or more issues from approved drafts. Only call this after the user has said yes to the drafts in chat. All are created or none.",
      inputSchema: { drafts: z.array(draft).min(1).max(20) },
      annotations: writes,
    },
    ({ drafts }) =>
      run(() =>
        // One transaction: if draft 3 breaks a rule, drafts 1 and 2 are not kept.
        db.transaction((tx) =>
          drafts.map((d) => {
            const issue = createIssue(tx, toNewIssue(tx, d), { ...CLAUDE, source: "via Claude" });
            return { key: issue.key, title: issue.title };
          }),
        ),
      ),
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update issue",
      description: "Change fields of an issue. Send only the fields that change.",
      inputSchema: {
        key: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        criteria: z
          .array(z.object({ text: z.string(), done: z.boolean() }))
          .optional()
          .describe("The full new list; done marks a ticked criterion"),
        points: points.optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        epic: z
          .string()
          .nullable()
          .optional()
          .describe("Epic key, or null to remove it from its epic"),
      },
      annotations: writes,
    },
    ({ key, criteria, epic, ...fields }) =>
      run(() => {
        const issue = findIssue(db, key);
        const parentId =
          epic === undefined ? undefined : epic === null ? null : findIssue(db, epic).id;
        const updated = updateIssue(
          db,
          issue.key,
          {
            ...fields,
            ...(criteria && { acceptanceCriteria: criteria }),
            ...(parentId !== undefined && { parentId }),
          },
          CLAUDE,
        );
        return brief(db, [updated])[0];
      }),
  );

  server.registerTool(
    "move_issue",
    {
      title: "Move issue",
      description: "Change an issue's status, its sprint, or both.",
      inputSchema: {
        key: z.string(),
        status: status.optional(),
        sprint: z
          .union([z.enum(["current", "next", "backlog"]), z.number().int().positive()])
          .optional()
          .describe('"backlog" takes it out of its sprint'),
      },
      annotations: writes,
    },
    ({ key, status: newStatus, sprint }) =>
      run(() => {
        if (newStatus === undefined && sprint === undefined)
          throw new TixError("Give a status or a sprint");
        const issue = findIssue(db, key);
        const sprintId =
          sprint === undefined
            ? undefined
            : sprint === "backlog"
              ? null
              : resolveSprint(db, sprint).id;
        const updated = updateIssue(
          db,
          issue.key,
          { ...(newStatus && { status: newStatus }), ...(sprintId !== undefined && { sprintId }) },
          CLAUDE,
        );
        return brief(db, [updated])[0];
      }),
  );

  server.registerTool(
    "split_issue",
    {
      title: "Split issue",
      description:
        'Split a story that is too big (over 8 points) into new issues in the same space, epic and sprint. original "keep" leaves it open (shrink it with update_issue); "close" marks it done with no points so it does not count as finished work. Only after the user approves the split.',
      inputSchema: {
        key: z.string(),
        drafts: z
          .array(draft.omit({ space: true, epic: true, sprint: true, parent: true }))
          .min(1)
          .max(10),
        original: z.enum(["keep", "close"]).default("keep"),
      },
      annotations: writes,
    },
    ({ key, drafts, original }) =>
      run(() =>
        db.transaction((tx) => {
          const issue = findIssue(tx, key);
          if (!["story", "task", "bug", "spike"].includes(issue.type)) {
            throw new TixError("Only stories, tasks, bugs and spikes can be split");
          }
          const created = drafts.map((d) =>
            createIssue(
              tx,
              {
                spaceId: issue.spaceId,
                type: d.type === "subtask" || d.type === "epic" ? "story" : d.type,
                parentId: issue.parentId, // same epic
                title: d.title,
                description: d.description,
                acceptanceCriteria: d.criteria,
                points: d.points ?? null,
                priority: d.priority ?? issue.priority,
                sprintId: issue.sprintId, // same sprint
                createdBy: "claude",
              },
              { ...CLAUDE, source: `via Claude, split from ${issue.key}` },
            ),
          );
          if (original === "close") {
            const note = `Split into ${created.map((c) => c.key).join(", ")}.`;
            // Out of its sprint first, so its points never count as done work.
            if (issue.sprintId !== null) updateIssue(tx, issue.key, { sprintId: null }, CLAUDE);
            updateIssue(
              tx,
              issue.key,
              {
                status: "done",
                points: null,
                description: [issue.description, note].filter(Boolean).join("\n\n"),
              },
              CLAUDE,
            );
          }
          return {
            created: created.map((c) => c.key),
            original: { key: issue.key, closed: original === "close" },
          };
        }),
      ),
  );

  server.registerTool(
    "get_sprint",
    {
      title: "Get sprint",
      description:
        "A sprint with its issues, points by space, capacity and velocity (average done points over the last 3 sprints). Use velocity to keep a plan realistic.",
      inputSchema: { sprint: sprintRef.default("current") },
      annotations: readOnly,
    },
    ({ sprint }) => run(() => sprintView(db, resolveSprint(db, sprint))),
  );

  server.registerTool(
    "plan_sprint",
    {
      title: "Plan sprint",
      description:
        "Add issues to or remove them from the next (planned) sprint. Creates the next sprint with default dates and capacity if none is planned. Returns the new totals.",
      inputSchema: {
        add: z.array(z.string()).default([]).describe("Issue keys to add"),
        remove: z
          .array(z.string())
          .default([])
          .describe("Issue keys to take out (back to the backlog)"),
      },
      annotations: writes,
    },
    ({ add, remove }) =>
      run(() => {
        let sprint = listSprints(db).find((s) => s.state === "planned");
        if (!sprint) {
          const running = activeSprint(db);
          const startDate = running
            ? new Date(Date.parse(`${running.endDate}T00:00:00Z`) + 86_400_000)
                .toISOString()
                .slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          sprint = createSprint(db, {
            lengthWeeks: 2,
            startDate,
            capacity: getVelocity(db).average ?? getSettings(db).capacityDefault,
          });
        }
        if (remove.length) removeFromSprint(db, sprint.id, remove, CLAUDE);
        if (add.length) addToSprint(db, sprint.id, add, CLAUDE);
        return sprintView(db, sprint);
      }),
  );

  return server;
}
