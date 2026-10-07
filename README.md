# Tix

A personal, Jira style tracker that runs only on your Mac. Every area of life (work, languages,
certifications, side projects) lives in one place as a **space**, and all of them share **one
sprint** with story points and a realistic capacity.

No accounts, no cloud, no paid APIs.

## Status

| Part                              | State                     |
| --------------------------------- | ------------------------- |
| Front end: every tracker screen   | Working, on a fake API    |
| Insights settings screen          | Placeholder               |
| Core services and SQLite database | Planned (`packages/core`) |
| HTTP server, `tix` CLI            | Planned                   |
| MCP server for an AI assistant    | Planned                   |
| Local AI insights through Ollama  | Planned                   |

The front end was built first against an in-browser fake that implements the same contract the
real server will. Swapping in the server changes one line (see [The API contract](#the-api-contract)).

## Getting started

Requirements: **Node.js 24 LTS** and **pnpm** (the repo pins its pnpm version in `package.json`).

```sh
pnpm install
pnpm dev
```

Open the address Vite prints (usually http://localhost:5173). The app starts with demo data:
eight spaces, three completed sprints of history, a running Sprint 4 and a planned Sprint 5.
Changes are saved in the browser's localStorage. To start over, run this in the browser console:

```js
tixReset();
```

### Scripts

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Start the Vite dev server with instant reload           |
| `pnpm build`        | Type check, then build the app into `packages/web/dist` |
| `pnpm typecheck`    | Run TypeScript over every package                       |
| `pnpm lint`         | Run ESLint over the repo                                |
| `pnpm format`       | Format every file with Prettier                         |
| `pnpm format:check` | Check formatting without changing files                 |

Run `pnpm typecheck && pnpm lint && pnpm format:check` before committing.

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

Planned for the back end: SQLite through better-sqlite3 and Drizzle ORM, Fastify, zod, Commander,
the MCP SDK, Vitest and Ollama.

## Architecture

### Target

One Node process owns the database. The UI, the CLI and the MCP server all go through the same
core code, so every rule (keys, sprint rollover, validation) lives in exactly one place.

```
Browser (React UI) ──> HTTP API (Fastify) ──┐
Terminal (tix CLI) ─────────────────────────┼──> Core services ──> SQLite (~/.tix/tix.db)
AI assistant (MCP server, stdio) ───────────┘          └──────────> Ollama (localhost:11434)
```

### Today

```
Screens ──> queries.ts (TanStack Query hooks) ──> client.ts (TixApi) ──> fake/fakeApi.ts ──> localStorage
```

Dependencies point one way. Screens never call the API directly; they use hooks. Hooks only know
the `TixApi` interface. Only `client.ts` knows which implementation is in use.

## Repository layout

```
tix/
  package.json              workspace scripts and shared dev tools
  pnpm-workspace.yaml       every folder in packages/ is a package
  tsconfig.base.json        strict TypeScript rules shared by all packages
  eslint.config.js          lint rules for the whole repo
  packages/
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
          errors.ts         ApiError, with the HTTP status the server will use
          queries.ts        TanStack Query hooks: reads, changes, optimistic updates
          fake/
            seed.ts         demo data, dates relative to today
            db.ts           the tables in memory, saved to localStorage
            fakeApi.ts      TixApi implemented in the browser, with the real rules
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

`api/client.ts` defines `TixApi`, the list of every operation a screen can ask for. The fake in
`api/fake/` implements it today and applies the same rules the core services will. When the
server exists, an HTTP client implements the same interface and replaces this line:

```ts
export const api: TixApi = fakeApi;
```

The fake waits 120 ms per call so loading states show during development, and returns copies so
a screen can never change the data without going through the rules.

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

### Keyboard

`c` opens Create issue and `/` focuses search. Single key shortcuts are ignored while typing in
a field.

## Extending Tix

**Add a screen:** create it under `src/pages/<area>/`, render it inside `<Page eyebrow title>`,
and add its route in `router.tsx`.

**Add an API operation:**

1. Add any new types to `api/types.ts`.
2. Add the method to `TixApi` in `api/client.ts`.
3. Implement it in `api/fake/fakeApi.ts`, throwing `ApiError` for rule violations.
4. Add a hook in `api/queries.ts` and invalidate whatever the change affects.

**Conventions:** colours only through theme tokens; shared UI in `components/`; one job per file;
derive values instead of storing them in state where possible; comments explain why, not what.

## Roadmap

| Phase  | Scope                                                                    | State   |
| ------ | ------------------------------------------------------------------------ | ------- |
| 1      | Core services, SQLite schema and migrations, CLI                         | Planned |
| 2      | HTTP API; Backlog, Issue detail, Create, All spaces, Space detail        | UI done |
| 3      | Sprints: Board, Plan next sprint, Complete sprint                        | UI done |
| 4      | Past sprints, velocity chart, slip tags, activity log                    | UI done |
| 5      | MCP server so an AI assistant can draft and create stories               | Planned |
| 6      | Local AI insights through Ollama: sprint review, check in, planning hint | Planned |
| Finish | `tix backup`, start at login                                             | Planned |

## Notes

- The production bundle is about 870 KB, most of it Recharts. It loads from local disk, so this
  does not matter yet; lazy loading the Past sprints route would split it out if needed.
- Demo dates are relative to today, so Sprint 4 always looks like it started four days ago.
