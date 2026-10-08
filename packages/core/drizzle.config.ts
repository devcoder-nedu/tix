// Read by `pnpm db:generate` (drizzle-kit): compare schema.ts with the last
// migration and write the SQL for whatever changed into ./drizzle.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
