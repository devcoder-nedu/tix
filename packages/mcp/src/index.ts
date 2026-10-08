#!/usr/bin/env node
// Tix MCP server. The Claude desktop app starts this program and talks to it
// over stdin/stdout. stdout carries the protocol, so nothing else may print
// there: diagnostics go to stderr, which the Claude app writes to its log.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultDbPath, openDb } from "@tix/core";
import { createTixServer } from "./tools.ts";

const db = openDb();
const server = createTixServer(db);
await server.connect(new StdioServerTransport());
console.error(`Tix MCP server ready (database: ${defaultDbPath()})`);

// The Claude app closes stdin when it shuts the server down.
const shutdown = () => {
  db.$client.close();
  process.exit(0);
};
process.stdin.on("close", shutdown);
process.on("SIGTERM", shutdown);
