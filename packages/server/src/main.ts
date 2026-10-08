// `pnpm dev` entry: run the server until Ctrl+C, closing the database cleanly.
import { startServer } from "./index.ts";

const server = await startServer();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)));
}
