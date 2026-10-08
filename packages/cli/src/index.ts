#!/usr/bin/env node
// The `tix` command. Each subcommand parses its arguments, calls a core
// service and prints the result; every rule lives in @tix/core, so the CLI,
// the server and the MCP server can never disagree.

import {
  archiveSpace,
  createIssue,
  createSpace,
  deleteSpace,
  findSpaceByKey,
  getIssue,
  listEvents,
  listIssues,
  listSpaces,
  moveIssueToSpace,
  openDb,
  restoreSpace,
  defaultDbPath,
  TixError,
  updateIssue,
  type Issue,
  type TixDb,
} from "@tix/core";
import { startServer, WEB_DIST } from "@tix/server";
import { Command, InvalidArgumentError } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";
import { dim, issueDetail, issueTable, spaceTable, STATUS_LABEL } from "./format.ts";

/** The spaces from the design doc, with the mockups' colours. */
const DEFAULT_SPACES = [
  {
    key: "JOB",
    name: "My Job",
    color: "#64748b",
    description: "Work tasks beside everything else",
  },
  { key: "FR", name: "French", color: "#3b74d6", description: "Reach B1 and pass the DELF exam" },
  { key: "GCP", name: "GCP", color: "#2a9d68", description: "" },
  { key: "DSAI", name: "DSAI", color: "#8b5cd6", description: "" },
  { key: "AWS", name: "AWS", color: "#e08a1e", description: "" },
  { key: "CODE", name: "Coding", color: "#d6466f", description: "" },
];

/** Open the database, run one command, always close it; rule errors become a clean message. */
function run(action: (db: TixDb) => void) {
  const db = openDb();
  try {
    action(db);
  } catch (error) {
    if (!(error instanceof TixError)) throw error; // a real bug: keep the stack trace
    console.error(styleText("red", `Error: ${error.message}`));
    process.exitCode = 1;
  } finally {
    db.$client.close();
  }
}

/** "in progress", "in-progress", "progress" and "In_Progress" all mean in_progress. */
function parseStatus(value: string): Issue["status"] {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, Issue["status"]> = {
    todo: "todo",
    to_do: "todo",
    in_progress: "in_progress",
    progress: "in_progress",
    in_review: "in_review",
    review: "in_review",
    done: "done",
  };
  const status = aliases[v];
  if (!status) throw new InvalidArgumentError("use todo, in-progress, review or done");
  return status;
}

const parsePoints = (value: string) => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new InvalidArgumentError("points must be a whole number");
  return n as never; // core checks it is 1, 2, 3, 5, 8 or 13
};
const collect = (value: string, previous: string[]) => [...previous, value];

const program = new Command()
  .name("tix")
  .description("Personal Jira style tracker")
  .version("0.0.0")
  .addHelpText("after", dim(`\nDatabase: ${defaultDbPath()} (set TIX_DB to use another file)`));

// ---- spaces

const space = program.command("space").description("Manage spaces");

space
  .command("add")
  .description("Add a space, e.g. tix space add FR French")
  .argument("<key>", "short uppercase key, e.g. FR")
  .argument("<name...>", "display name")
  .option("--color <hex>", "colour like #3b74d6", "#64748b")
  .option("--description <text>", "goal or note", "")
  .action((key: string, name: string[], opts: { color: string; description: string }) =>
    run((db) => {
      const created = createSpace(db, { key, name: name.join(" "), ...opts });
      console.log(`Added space ${created.key} (${created.name})`);
    }),
  );

space
  .command("list")
  .description("List spaces with open counts")
  .option("--archived", "list archived spaces instead")
  .action((opts: { archived?: boolean }) =>
    run((db) => console.log(spaceTable(listSpaces(db, { archived: !!opts.archived })))),
  );

space
  .command("archive")
  .description("Hide a space; keeps its issues and history (needs no open issues)")
  .argument("<key>")
  .action((key: string) =>
    run((db) => {
      const archived = archiveSpace(db, key);
      console.log(
        `Archived ${archived.key} (${archived.name}). Undo with: tix space restore ${archived.key}`,
      );
    }),
  );

space
  .command("restore")
  .description("Bring back an archived space")
  .argument("<key>")
  .action((key: string) =>
    run((db) => {
      const restored = restoreSpace(db, key);
      console.log(`Restored ${restored.key} (${restored.name})`);
    }),
  );

space
  .command("delete")
  .description("Delete a space for good (only one that never had issues)")
  .argument("<key>")
  .action((key: string) =>
    run((db) => {
      const target = findSpaceByKey(db, key);
      deleteSpace(db, key);
      console.log(`Deleted ${target.key} (${target.name})`);
    }),
  );

// ---- issues

program
  .command("create")
  .description("Create an issue and print its key")
  .requiredOption("-s, --space <key>", "space key, e.g. CODE")
  .requiredOption("-t, --title <text>", "summary")
  .option("--type <type>", "epic, story, task, bug, spike or subtask", "story")
  .option("-p, --parent <key>", "epic for a story, story for a subtask")
  .option("--points <n>", "1, 2, 3, 5, 8 or 13", parsePoints)
  .option("-d, --description <text>", "description or user story")
  .option("-c, --criterion <text>", "acceptance criterion (repeat for more)", collect, [])
  .option("--priority <level>", "low, medium or high", "medium")
  .action(
    (opts: {
      space: string;
      title: string;
      type: Issue["type"];
      parent?: string;
      points?: never;
      description?: string;
      criterion: string[];
      priority: Issue["priority"];
    }) =>
      run((db) => {
        const issue = createIssue(
          db,
          {
            spaceId: findSpaceByKey(db, opts.space).id,
            type: opts.type,
            parentId: opts.parent ? getIssue(db, opts.parent).id : null,
            title: opts.title,
            description: opts.description,
            acceptanceCriteria: opts.criterion,
            points: opts.points ?? null,
            priority: opts.priority,
          },
          { source: "from the CLI" },
        );
        // Only the key on stdout, so scripts can capture it: KEY=$(tix create ...)
        console.log(issue.key);
      }),
  );

program
  .command("list")
  .description("List open issues (add --all for done ones too)")
  .option("-s, --space <key>", "only this space")
  .option("--status <status>", "only this status", parseStatus)
  .option("--type <type>", "only this type, e.g. bug or epic")
  .option("-a, --all", "include done issues")
  .action(
    (opts: { space?: string; status?: Issue["status"]; type?: Issue["type"]; all?: boolean }) =>
      run((db) => {
        const spaceId = opts.space ? findSpaceByKey(db, opts.space).id : undefined;
        const list = listIssues(db, { spaceId }).filter(
          (i) =>
            (opts.type ? i.type === opts.type : i.type !== "epic") &&
            (opts.status ? i.status === opts.status : opts.all || i.status !== "done"),
        );
        console.log(issueTable(list));
      }),
  );

program
  .command("move")
  .description("Change status (tix move FR-4 done) or space (tix move FR-4 --space GCP)")
  .argument("<key>", "issue key")
  .argument("[status]", "todo, in-progress, review or done", parseStatus)
  .option("--space <key>", "move to another space (new key, old one kept as alias)")
  .action((key: string, status: Issue["status"] | undefined, opts: { space?: string }) =>
    run((db) => {
      if (!status && !opts.space) throw new TixError("Give a status or --space");
      let issue = getIssue(db, key);
      if (status) issue = updateIssue(db, issue.key, { status });
      if (opts.space) issue = moveIssueToSpace(db, issue.key, findSpaceByKey(db, opts.space).id);
      const where = opts.space ? ` in ${issue.key.split("-")[0]}` : "";
      console.log(`${issue.key} ${dim("->")} ${STATUS_LABEL[issue.status]}${where}`);
    }),
  );

program
  .command("show")
  .description("Show one issue with criteria, subtasks and activity")
  .argument("<key>", "issue key (old keys work too)")
  .action((key: string) =>
    run((db) => {
      const issue = getIssue(db, key);
      const spaceName = listSpaces(db).find((s) => s.id === issue.spaceId)?.name ?? "";
      const all = listIssues(db, { spaceId: issue.spaceId });
      console.log(
        issueDetail(issue, {
          space: spaceName,
          parent: all.find((i) => i.id === issue.parentId) ?? null,
          children: all.filter((i) => i.parentId === issue.id),
          events: listEvents(db, issue.id),
        }),
      );
    }),
  );

// ---- app

program
  .command("start")
  .description("Start Tix at http://localhost:4000 and open it in the browser")
  .option("--no-open", "start the server without opening the browser")
  .action(async (opts: { open: boolean }) => {
    if (!existsSync(join(WEB_DIST, "index.html"))) {
      console.error(
        styleText("red", "The web app is not built yet. Run this once in the repo: pnpm build"),
      );
      process.exitCode = 1;
      return;
    }
    const port = Number(process.env.TIX_PORT ?? 4000);
    const url = `http://localhost:${port}`;
    try {
      const server = await startServer({ port, logger: false });
      console.log(`Tix is running at ${url}  ${dim("(Ctrl+C to stop)")}`);
      const stop = () => void server.close().then(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    } catch (error) {
      // Port taken: most likely Tix is already running, so just open it.
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      console.log(`Port ${port} is in use; Tix is probably already running at ${url}`);
    }
    // macOS's own `open` command opens a URL in the default browser.
    if (opts.open) spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  });

// ---- setup

program
  .command("seed")
  .description("Add the default spaces: JOB, FR, GCP, DSAI, AWS, CODE (skips ones that exist)")
  .action(() =>
    run((db) => {
      const existing = new Set(listSpaces(db).map((s) => s.key));
      for (const s of DEFAULT_SPACES) {
        if (existing.has(s.key)) {
          console.log(dim(`${s.key} already exists`));
          continue;
        }
        createSpace(db, s);
        console.log(`Added ${s.key} (${s.name})`);
      }
    }),
  );

program.parse();
