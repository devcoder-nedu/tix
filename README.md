# Tix

A personal, Jira style tracker that runs only on your Mac. Every area of life (work, languages,
certifications, side projects) lives in one place as a **space**, and all of them share **one
sprint** with story points and a realistic capacity.

No accounts, no cloud, no paid APIs.

## Status

| Part                              | State                               |
| --------------------------------- | ----------------------------------- |
| Front end: all ten screens        | Working (`packages/web`)            |
| Core services and SQLite database | Working, tested (`packages/core`)   |
| HTTP server                       | Working, tested (`packages/server`) |
| `tix` CLI, including `tix start`  | Working, tested (`packages/cli`)    |
| Ollama status and settings        | Working (live check)                |
| MCP server for an AI assistant    | Working, tested (`packages/mcp`)    |
| Local AI insights through Ollama  | Planned                             |

The front end was built first against an in-browser fake, then switched to the real server by
changing one line (see [The API contract](#the-api-contract)).

## Getting started

Requirements: **Node.js 24 LTS** and **pnpm** (the repo pins its pnpm version in `package.json`).

```sh
pnpm install
pnpm build          # once: builds the web app the server serves
tix start           # after installing the command (below): opens http://localhost:4000
```

For development, run the API server and Vite together:

```sh
pnpm dev
```

Then open http://localhost:5173. Vite reloads the page on every save and forwards `/api` to the
server on port 4000. `node --watch` restarts the server when its code changes. Data lives in
`~/.tix/tix.db`; set `TIX_DB` to work on a scratch copy.

### Scripts

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Start the Vite dev server with instant reload           |
| `pnpm build`        | Type check, then build the app into `packages/web/dist` |
| `pnpm typecheck`    | Run TypeScript over every package                       |
| `pnpm lint`         | Run ESLint over the repo                                |
| `pnpm format`       | Format every file with Prettier                         |
| `pnpm format:check` | Check formatting without changing files                 |
| `pnpm test`         | Run every package's tests (Vitest)                      |
| `pnpm db:generate`  | After editing `schema.ts`: write the next SQL migration |

Run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` before committing.

### The `tix` command

Make `tix` available in any terminal (once):

```sh
pnpm add --global link:$PWD/packages/cli   # run from the repo root
```

This links the `tix` command into pnpm's global bin folder. It is a link to the source, so
edits apply without reinstalling. Undo with `pnpm remove --global @tix/cli`.

Then:

```sh
tix seed                                    # add JOB, FR, GCP, DSAI, AWS, CODE
tix create --space CODE --title "Build Tix board"            # prints CODE-1
tix create -s FR -t "Book the DELF exam" --points 1 -c "Date chosen" -c "Fee paid"
tix list                                    # open issues (--space FR, --status done, --all)
tix move CODE-1 in-progress                 # todo, in-progress, review, done
tix move FR-1 --space GCP                   # new key GCP-n; FR-1 keeps working
tix show CODE-1                             # criteria, subtasks, activity
tix space add CERT Certifications --color "#1aa3a3"
tix space archive CERT                      # hide it; issues and history stay (needs no open issues)
tix space restore CERT                      # bring it back (tix space list --archived shows them)
tix space delete CERT                       # for good, only if it never had issues
tix --help                                  # every command and option
```

Data lives in `~/.tix/tix.db`. Set `TIX_DB=/some/other.db` to use another file, which is how
the tests avoid touching your real data.

## Tech stack

| Concern         | Choice                                  | Why                                                                                    |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Language        | TypeScript 6 (strict)                   | Catches mistakes before they run; 6.0 is the newest version typescript-eslint supports |
| Workspace       | pnpm workspaces                         | One repo, many packages that can each be extended alone                                |
| Build and dev   | Vite 8                                  | Fast dev server with instant reload; production builds                                 |
| UI              | React 19                                |                                                                                        |
| Styling         | Tailwind CSS 4 with CSS variable tokens | Light and dark themes from one set of colour roles                                     |
| Data fetching   | TanStack Query 5                        | Caching, loading and error states, refresh after changes, optimistic updates           |
| Routing         | React Router 8                          | One URL per screen, filters kept in the URL                                            |
| Drag and drop   | dnd kit                                 | Backlog ranking and board columns, with keyboard support                               |
| Ordering        | fractional-indexing                     | Moving an issue rewrites only that issue's rank                                        |
| Charts          | Recharts 3                              | The velocity chart                                                                     |
| Icons and fonts | lucide-react, IBM Plex Sans and Mono    | Bundled locally; nothing loads from a CDN                                              |
| Quality         | ESLint 10, Prettier 3                   | Consistent, reviewable code                                                            |

Back end:

| Concern    | Choice                      | Why                                                         |
| ---------- | --------------------------- | ----------------------------------------------------------- |
| Database   | SQLite (better-sqlite3)     | One local file, fast, nothing to install or run             |
| Schema     | Drizzle ORM and drizzle-kit | Typed queries; migrations generated from `schema.ts`        |
| Validation | zod 4                       | Every input from outside is checked once, with clear errors |
| HTTP       | Fastify 5                   | The API for the web app; also serves the built app          |
| CLI        | Commander 15                | Argument parsing and help for `tix`                         |
| Assistant  | MCP SDK                     | Lets an AI assistant app call Tix tools over stdio          |
| Tests      | Vitest 5                    | Fast tests for every package                                |

Node 24 runs the TypeScript files directly (type stripping), so the back end has no build step.
Planned: Ollama for local AI insights.

## Architecture

### Target

One Node process owns the database. The UI, the CLI and the MCP server all go through the same
core code, so every rule (keys, sprint rollover, validation) lives in exactly one place.

```
Browser (React UI) ──> HTTP API (Fastify) ──┐
Terminal (tix CLI) ─────────────────────────┼──> Core services ──> SQLite (~/.tix/tix.db)
AI assistant (MCP server, stdio) ───────────┘          └──────────> Ollama (localhost:11434)
```

All of it is built except the Ollama insights.

Inside the web app, dependencies point one way:

```
Screens ──> queries.ts (TanStack Query hooks) ──> client.ts (TixApi) ──> httpApi.ts ──> /api
```

Screens never call the API directly; they use hooks. Hooks only know the `TixApi` interface.
Only `client.ts` knows which implementation is in use.

### Security

Tix has no logins, so the server protects itself in three ways: it listens on 127.0.0.1 only
(never reachable from other devices), answers only requests whose `Host` is localhost (blocks
DNS rebinding), and accepts writes only as JSON (other websites cannot send that without the
browser asking first). The Ollama check only reaches localhost.

## Repository layout

```
tix/
  package.json              workspace scripts and shared dev tools
  pnpm-workspace.yaml       every folder in packages/ is a package
  tsconfig.base.json        strict TypeScript rules shared by all packages
  eslint.config.js          lint rules for the whole repo
  packages/
    core/                   all rules and the database: no HTTP, no UI
      drizzle/              SQL migrations written by drizzle-kit
      src/
        schema.ts           the seven tables and the rules the database enforces
        db.ts               openDb(): WAL, foreign keys, migrations on start
        validation.ts       zod checks for everything arriving from outside
        services/           spaces, issues, sprints, settings (each with tests)
    server/                 Fastify: one route per core service, serves the built web app
    cli/                    the tix command
    mcp/                    MCP server: nine tools for an AI assistant app
  skill/
    SKILL.md                instructions that teach the assistant to write good stories
    web/                    the React app
      index.html            sets the theme before React loads (no flash)
      src/
        main.tsx            entry: fonts, global CSS, render <App />
        App.tsx             providers: query cache, theme, router
        router.tsx          URL -> screen
        index.css           theme tokens (light and dark) and Tailwind setup
        api/
          types.ts          domain types, mirroring the seven database tables
          client.ts         TixApi: the contract every screen relies on
          httpApi.ts        TixApi over HTTP: one fetch per server route
          errors.ts         ApiError, carrying the server's status and message
          queries.ts        TanStack Query hooks: reads, changes, optimistic updates
        components/         shared pieces: badges, pills, form styles, click to edit text
        create/             the Create issue dialog, openable from anywhere
        layout/             sidebar, top bar (Page), app frame
        lib/                date helpers, keyboard shortcut hook
        theme/              ThemeProvider
        pages/
          backlog/          Backlog with drag to rank
          board/            Current sprint board and Complete sprint dialog
          issue/            Issue detail
          plan/             Plan next sprint
          spaces/           All spaces, Space detail, New space
          sprints/          Past sprints and the velocity chart
```

## Connecting an AI assistant (MCP)

`packages/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server. A desktop
assistant app that supports MCP starts it as a local program and talks to it over stdin and
stdout, so nothing leaves the Mac.

| Tool            | What it does                                                        |
| --------------- | ------------------------------------------------------------------- |
| `list_spaces`   | Spaces with keys, epics and open counts                             |
| `search_issues` | Text and filters: space, status, sprint (or backlog), type          |
| `get_issue`     | One issue with criteria, children and history                       |
| `create_issues` | Create approved drafts, all or none                                 |
| `update_issue`  | Change fields                                                       |
| `move_issue`    | Change status or sprint                                             |
| `split_issue`   | Split a big story; keep the original or close it without its points |
| `get_sprint`    | A sprint with points by space, capacity and velocity                |
| `plan_sprint`   | Add or remove issues in the next sprint                             |

There is no delete tool on purpose: deleting stays a manual action in the app. Everything the
assistant creates or changes is recorded as the assistant's work and tagged in the app.

Register it in the assistant app's MCP configuration (`mcpServers`), then restart the app:

```json
{
  "mcpServers": {
    "tix": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/tix/packages/mcp/src/index.ts"]
    }
  }
}
```

Use absolute paths, including for `node` (`which node` prints it). Apps started from the Dock
do not read your shell profile, so a plain `node` is often not found there.

`skill/SKILL.md` teaches the assistant the house rules: show drafts and create only after a yes,
pick the space from context and never invent one, user story format with 2 to 5 testable
criteria, the estimation guide (split anything over 8), and planning near velocity.

## Domain model

Seven tables cover version 1. Epics, stories, tasks, bugs, spikes and subtasks all live in one
`issues` table with a `type` and a `parent_id`.

| Table           | Holds                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `spaces`        | Key (`FR`), name, colour, goal, and `next_number`, which hands out issue numbers |
| `issues`        | Every issue: type, parent, title, criteria, status, points, rank, sprint         |
| `sprints`       | Number, goal, length (1 or 2 weeks), dates, capacity, state                      |
| `sprint_issues` | Sprint history: points at start and the outcome of each issue                    |
| `issue_events`  | The activity log: every status, sprint, points and space change                  |
| `insights`      | Saved write ups from the local model                                             |
| `settings`      | Theme, Ollama URL and model, default capacity, insight toggles                   |

### Rules

- **Hierarchy:** Space › Epic › Story, Task, Bug or Spike › Subtask. A story level issue's parent
  is an epic (or none); a subtask's parent is a story level issue in the same space.
- **Keys** come from the space's counter (`FR-15` follows `FR-14`) and are never reused, even
  after delete. Moving an issue to another space gives it a new key and keeps the old one as an
  alias; its subtasks move with it.
- **Points** are 1, 2, 3, 5, 8, 13 or empty. Epics and subtasks never carry points.
- **Statuses:** To do, In progress, In review, Done. Every change writes an `issue_events` row.
- **Delete** is soft (hidden, restorable for 30 days). An epic with open issues cannot be deleted.
- **Space names are unique**, ignoring case, archived spaces included ("French" and "french"
  clash). Keys are unique too and can never change.
- **Spaces are archived, not deleted.** Archiving hides a space from the sidebar and pickers and
  keeps its issues, keys and history; it needs no open story level issues first, and an archived
  space takes no new issues. A space can be deleted for good only if it never handed out a key,
  because then nothing (no issue, alias or past sprint) can refer to it.
- **Backlog** is every open story level issue with no sprint, in rank order.

### Sprint lifecycle

1. **Plan:** one planned sprint at a time. Pull issues from any space. Capacity is a guide: Tix
   warns when you go over but never blocks.
2. **Start:** allowed only when no other sprint is active. Records `points_at_start` for each
   issue, which freezes the commitment.
3. **Run:** move cards across the board.
4. **Complete:** done issues get outcome `done`. Each unfinished issue goes to the next sprint
   (`carried_over`, the sprint is created if needed) or the backlog (`returned`). Status and
   ticked criteria are kept.
5. **Review:** Past sprints shows committed against done, the split by space and the saved review.

From that history Tix derives, with no extra columns:

- **Slip count:** `carried_over` plus `returned` rows. Two or more shows "slipped N sprints".
- **"was in Sprint N":** when the latest outcome was `returned`.
- **Velocity:** average done points over the last three completed sprints.

## How the front end is built

### The API contract

`api/client.ts` defines `TixApi`, the list of every operation a screen can ask for. The screens
were built against an in-browser fake; switching to the real server was this one line:

```ts
export const api: TixApi = httpApi;
```

`httpApi.ts` turns the server's `{ "error": "..." }` replies into `ApiError`, so screens show the
same messages the CLI prints. `web/src/api/types.ts` mirrors core's types by hand for now;
sharing them directly is a planned cleanup.

### Data fetching and caching

All reads and writes go through hooks in `api/queries.ts`. Each read is cached under a key such
as `["spaces"]`, so components asking for the same data share one request. After a change, the
affected keys are invalidated and every screen showing that data refetches. Sprint operations
touch almost every screen, so they invalidate everything; only queries on screen refetch.

**Optimistic updates** apply a change to the cache before the save finishes, and roll it back
if the save fails. They are used for ranking, status moves and issue edits. Besides feeling
instant, this prevents lost updates: two quick edits to an issue's criteria build on each other
instead of the second overwriting the first.

### Theming

`index.css` defines colours as roles (`--surface`, `--ink-muted`, `--accent`) with a light value
and a dark value. Tailwind's `@theme inline` turns each role into utilities like `bg-surface`.
Switching theme only flips `data-theme` on `<html>`, so no component knows which theme is on.
A small script in `index.html` applies the saved theme before anything paints, so the page never
flashes the wrong one.

Chart colours are fixed series tokens (`--series-1`, `--series-2`), checked for colour blind
separation and contrast against the card in both themes.

### State in the URL

Filters, view switches and the selected sprint live in the query string (`/backlog?group=epic`,
`/spaces?new`, `/sprints?sprint=3`). A refresh keeps them, Back undoes them, and any link can
open a specific view, which is how the sidebar's "New space" opens a dialog on another page.

### Drag and drop

- **Backlog** uses sortable lists. Each group has its own drag context, so an issue can only be
  reordered within its own group. On drop, the API receives the keys of the new neighbours and
  computes a rank between them with fractional indexing; no other issue changes.
- **Board** uses draggable cards and droppable columns whose ids are the statuses, so a drop gives
  the new status directly. Cards open with a click or Enter and pick up with Space. They are not
  `<a>` links, because a link would still follow its address after a drag.

### Dialogs

Create issue, New space and Complete sprint use the browser's `<dialog>` element with
`showModal()`, which provides Escape to close, focus kept inside and an inert page behind, with
no extra library.

### Search and keyboard

The top bar search is a combobox: type a key (`fr-1`), an old key from before a move, or words
from a title, then use the arrow keys and Enter. Exact keys rank first, then key prefixes, then
title matches. `c` opens Create issue and `/` focuses search. Single key shortcuts are ignored
while typing in a field.

### Local AI status

The sidebar and the Insights settings screen ask Ollama (`/api/tags`) whether it is running and
which models it has, through the server's `/api/ollama` route. "Local AI ready" means Ollama answers and has the chosen model.

## Extending Tix

**Add a screen:** create it under `src/pages/<area>/`, render it inside `<Page eyebrow title>`,
and add its route in `router.tsx`.

**Add an API operation:**

1. Write the service in `packages/core/src/services/`, throwing `TixError` for rule violations,
   and test it there.
2. Add a route in `packages/server/src/app.ts` and a test in `app.test.ts`.
3. Add the method to `TixApi` (`web/src/api/client.ts`) and `httpApi.ts`, and any types to
   `web/src/api/types.ts`.
4. Add a hook in `web/src/api/queries.ts` and invalidate whatever the change affects.

**Change the schema:** edit `schema.ts`, run `pnpm db:generate`, commit the new file in
`packages/core/drizzle`. Every database upgrades itself the next time it is opened.

**Conventions:** colours only through theme tokens; shared UI in `components/`; one job per file;
derive values instead of storing them in state where possible; comments explain why, not what.

## Roadmap

| Phase  | Scope                                                                    | State   |
| ------ | ------------------------------------------------------------------------ | ------- |
| 1      | Core services, SQLite schema and migrations, CLI                         | Done    |
| 2      | HTTP API; Backlog, Issue detail, Create, All spaces, Space detail        | Done    |
| 3      | Sprints: Board, Plan next sprint, Complete sprint                        | Done    |
| 4      | Past sprints, velocity chart, slip tags, activity log                    | Done    |
| 5      | MCP server so an AI assistant can draft and create stories               | Done    |
| 6      | Local AI insights through Ollama: sprint review, check in, planning hint | Planned |
| Finish | `tix backup`, start at login                                             | Planned |

## Notes

- The production bundle is about 870 KB, most of it Recharts. It loads from local disk, so this
  does not matter yet; lazy loading the Past sprints route would split it out if needed.
