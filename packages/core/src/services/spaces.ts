import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Conn } from "../db.ts";
import { TixError } from "../errors.ts";
import { issues, spaces } from "../schema.ts";
import { newSpaceInput, parse, type NewSpaceInput } from "../validation.ts";

export type Space = typeof spaces.$inferSelect;

/** A space plus the numbers its card and sidebar row show. */
export interface SpaceSummary extends Space {
  openCount: number;
  epicCount: number;
  epics: { id: number; key: string; title: string }[];
  doneThisMonth: number;
  percentDone: number;
}

function summarise(conn: Conn, list: Space[]): SpaceSummary[] {
  // One query for the issues of every listed space, grouped in memory below,
  // instead of one query per space.
  const rows = conn
    .select({
      id: issues.id,
      key: issues.key,
      title: issues.title,
      spaceId: issues.spaceId,
      type: issues.type,
      status: issues.status,
      completedAt: issues.completedAt,
    })
    .from(issues)
    .where(isNull(issues.deletedAt))
    .orderBy(asc(issues.rank))
    .all();
  const month = new Date().toISOString().slice(0, 7); // "2026-10"

  return list.map((space) => {
    const own = rows.filter((r) => r.spaceId === space.id);
    const epics = own.filter((r) => r.type === "epic");
    const work = own.filter((r) => r.type !== "epic");
    const done = work.filter((r) => r.status === "done");
    return {
      ...space,
      openCount: work.length - done.length,
      epicCount: epics.length,
      epics: epics.map(({ id, key, title }) => ({ id, key, title })),
      doneThisMonth: done.filter((r) => r.completedAt?.startsWith(month)).length,
      percentDone: work.length ? Math.round((done.length / work.length) * 100) : 0,
    };
  });
}

export function listSpaces(conn: Conn, { archived = false } = {}): SpaceSummary[] {
  const list = conn
    .select()
    .from(spaces)
    .where(eq(spaces.archived, archived))
    .orderBy(asc(spaces.id))
    .all();
  return summarise(conn, list);
}

export function findSpaceByKey(conn: Conn, key: string): Space {
  const space = conn.select().from(spaces).where(eq(spaces.key, key.trim().toUpperCase())).get();
  if (!space) throw new TixError(`No space with key ${key}`, 404);
  return space;
}

export function getSpace(conn: Conn, key: string): SpaceSummary {
  return summarise(conn, [findSpaceByKey(conn, key)])[0]!;
}

/** Another space with this name, ignoring case; archived ones included. */
function spaceNamed(conn: Conn, name: string) {
  return conn
    .select()
    .from(spaces)
    .where(sql`lower(${spaces.name}) = lower(${name})`)
    .get();
}

export function createSpace(conn: Conn, input: NewSpaceInput): Space {
  const values = parse(newSpaceInput, input);
  return conn.transaction((tx) => {
    const taken = tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.key, values.key)).get();
    if (taken) throw new TixError(`Space ${values.key} already exists`, 409);
    const twin = spaceNamed(tx, values.name);
    if (twin) {
      throw new TixError(
        twin.archived
          ? `An archived space is already named ${twin.name} (${twin.key}); restore it instead`
          : `A space named ${twin.name} already exists (${twin.key})`,
        409,
      );
    }
    return tx.insert(spaces).values(values).returning().get();
  });
}

/** Open story-level work in a space (epics are containers and never block). */
function openIssueKeys(conn: Conn, spaceId: number): string[] {
  return conn
    .select({ key: issues.key })
    .from(issues)
    .where(
      and(
        eq(issues.spaceId, spaceId),
        isNull(issues.deletedAt),
        ne(issues.status, "done"),
        ne(issues.type, "epic"),
      ),
    )
    .orderBy(asc(issues.rank))
    .all()
    .map((r) => r.key);
}

/**
 * Hide a space from lists and pickers, keeping its issues, keys and history.
 * Blocked while it has open issues: finish, move or delete them first.
 */
export function archiveSpace(conn: Conn, key: string): Space {
  return conn.transaction((tx) => {
    const space = findSpaceByKey(tx, key);
    if (space.archived) return space;
    const open = openIssueKeys(tx, space.id);
    if (open.length) {
      const shown =
        open.slice(0, 5).join(", ") + (open.length > 5 ? ` and ${open.length - 5} more` : "");
      throw new TixError(
        `${space.name} still has ${open.length} open ${open.length === 1 ? "issue" : "issues"} (${shown}). Finish, move or delete ${open.length === 1 ? "it" : "them"} first.`,
        409,
      );
    }
    return tx
      .update(spaces)
      .set({ archived: true })
      .where(eq(spaces.id, space.id))
      .returning()
      .get();
  });
}

export function restoreSpace(conn: Conn, key: string): Space {
  const space = findSpaceByKey(conn, key);
  return conn
    .update(spaces)
    .set({ archived: false })
    .where(eq(spaces.id, space.id))
    .returning()
    .get();
}

/**
 * Remove a space for good. Only allowed if it never handed out a key: then
 * nothing (no issue, alias or sprint history) can refer to it.
 */
export function deleteSpace(conn: Conn, key: string): void {
  conn.transaction((tx) => {
    const space = findSpaceByKey(tx, key);
    if (space.nextNumber > 1) {
      throw new TixError(
        `${space.name} has had issues (up to ${space.key}-${space.nextNumber - 1}), so its history must stay. Archive it instead.`,
        409,
      );
    }
    tx.delete(spaces).where(eq(spaces.id, space.id)).run();
  });
}
