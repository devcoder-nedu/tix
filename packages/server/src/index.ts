// Starts the Tix server: one process that owns the database and serves both
// the API and the built web app at http://localhost:4000.

import { openDb } from "@tix/core";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";

export { buildApp, checkOllama } from "./app.ts";

/** packages/web/dist, found relative to this file so it works from any folder. */
export const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

export async function startServer({
  port = Number(process.env.TIX_PORT ?? 4000),
  logger = true,
} = {}) {
  const db = openDb();
  const app = buildApp({ db, webDist: WEB_DIST, logger });
  // 127.0.0.1 only: reachable from this Mac, never from other devices on the network.
  await app.listen({ host: "127.0.0.1", port });
  const url = `http://localhost:${port}`;
  const close = async () => {
    await app.close();
    db.$client.close();
  };
  return { url, close };
}
