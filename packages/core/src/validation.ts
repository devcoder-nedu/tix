// Input shapes, checked once at the door. Anything arriving from the UI, the
// CLI or the MCP server passes through parse() before a service uses it, so
// the services can trust types and only check rules that need the database.

import { z } from "zod";
import { TixError } from "./errors.ts";
import { ACTORS, ISSUE_TYPES, POINTS, PRIORITIES, STATUSES } from "./schema.ts";

const id = z.number().int().positive();
const title = z.string().trim().min(1, "Summary is required").max(300);
const points = z.literal(POINTS, { error: "Points must be 1, 2, 3, 5, 8 or 13" }).nullable();
const criterion = z.object({ text: z.string().trim().min(1), done: z.boolean() });

export const newSpaceInput = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key must be 2 to 10 letters or digits, starting with a letter"),
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must look like #3b74d6"),
  description: z.string().trim().max(500).default(""),
});

export const newIssueInput = z.object({
  spaceId: id,
  type: z.enum(ISSUE_TYPES),
  parentId: id.nullable().default(null),
  title,
  description: z.string().trim().default(""),
  // One criterion per entry; blank lines from a textarea are dropped.
  acceptanceCriteria: z
    .array(z.string())
    .default([])
    .transform((lines) => lines.map((t) => t.trim()).filter(Boolean)),
  points: points.default(null),
  priority: z.enum(PRIORITIES).default("medium"),
  sprintId: id.nullable().default(null),
  createdBy: z.enum(ACTORS).default("me"),
});

export const issuePatchInput = z
  .object({
    title,
    description: z.string().trim(),
    acceptanceCriteria: z.array(criterion),
    status: z.enum(STATUSES),
    points,
    priority: z.enum(PRIORITIES),
    labels: z.array(z.string().trim().min(1)),
    parentId: id.nullable(),
    sprintId: id.nullable(),
  })
  .partial() // every field optional: send only what changed
  .strict(); // but nothing unknown: a typo like "statsu" is an error, not ignored

export type NewSpaceInput = z.input<typeof newSpaceInput>;
export type NewIssueInput = z.input<typeof newIssueInput>;
export type IssuePatch = z.input<typeof issuePatchInput>;

/** Validate input against a schema; on failure throw a TixError naming the field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const field = issue.path.join(".");
  // Our own messages name the field already ("Summary is required"); zod's
  // generic ones ("Invalid input: expected string") need it added.
  const generic = /^(Invalid|Too |Unrecognized|Expected)/.test(issue.message);
  throw new TixError(generic && field ? `${field}: ${issue.message}` : issue.message);
}
