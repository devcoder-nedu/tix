// Public entry of @tix/core: the server, CLI and MCP server import from here only.
export { defaultDbPath, openDb, type Conn, type TixDb } from "./db.ts";
export { TixError } from "./errors.ts";
export * from "./schema.ts";
export * from "./services/issues.ts";
export * from "./services/spaces.ts";
export type { IssuePatch, NewIssueInput, NewSpaceInput } from "./validation.ts";
