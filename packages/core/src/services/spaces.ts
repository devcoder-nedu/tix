import { asc, eq, isNull } from "drizzle-orm";
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

export function listSpaces(conn: Conn): SpaceSummary[] {
  const list = conn
    .select()
    .from(spaces)
    .where(eq(spaces.archived, false))
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

export function createSpace(conn: Conn, input: NewSpaceInput): Space {
  const values = parse(newSpaceInput, input);
  const taken = conn.select({ id: spaces.id }).from(spaces).where(eq(spaces.key, values.key)).get();
  if (taken) throw new TixError(`Space ${values.key} already exists`, 409);
  return conn.insert(spaces).values(values).returning().get();
}

/** Archived spaces drop out of lists but keep their issues and keys. */
export function archiveSpace(conn: Conn, key: string): Space {
  const space = findSpaceByKey(conn, key);
  return conn
    .update(spaces)
    .set({ archived: true })
    .where(eq(spaces.id, space.id))
    .returning()
    .get();
}
