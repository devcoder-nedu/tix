import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useBacklog, useSpaces } from "../../api/queries";
import type { BacklogItem, SpaceSummary } from "../../api/types";
import { primaryButton } from "../../components/formStyles";
import { Pill } from "../../components/Pill";
import { Page } from "../../layout/Page";
import { BacklogGroup, type Group } from "./BacklogGroup";

type GroupBy = "space" | "epic" | "none";

/** Split the visible items into groups, in a stable order (space order, then epic). */
function buildGroups(items: BacklogItem[], groupBy: GroupBy, spaces: SpaceSummary[]): Group[] {
  if (groupBy === "none") {
    return [{ id: "all", title: "All issues", subtitle: "", color: "transparent", items }];
  }
  if (groupBy === "space") {
    return spaces
      .map((s) => ({
        id: s.key,
        title: s.name,
        subtitle: s.key,
        color: s.color,
        items: items.filter((i) => i.spaceId === s.id),
      }))
      .filter((g) => g.items.length > 0);
  }
  // By epic: one group per epic, in space order, and a final "No epic" group.
  const groups: Group[] = [];
  for (const space of spaces) {
    for (const epic of space.epics) {
      const epicItems = items.filter((i) => i.parentId === epic.id);
      if (epicItems.length) {
        groups.push({
          id: epic.key,
          title: epic.title,
          subtitle: epic.key,
          color: space.color,
          items: epicItems,
        });
      }
    }
  }
  const loose = items.filter((i) => i.parentId === null);
  if (loose.length) {
    groups.push({ id: "none", title: "No epic", subtitle: "", color: "transparent", items: loose });
  }
  return groups;
}

export function BacklogPage() {
  const { data: backlog, isPending, error } = useBacklog();
  const { data: spaces = [] } = useSpaces();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filters live in the URL: refresh keeps them, Back undoes them, links can share them.
  const [params, setParams] = useSearchParams();
  const groupBy = (params.get("group") as GroupBy | null) ?? "space";
  const bugsOnly = params.has("bugs");
  const unestimated = params.has("unestimated");
  const byClaude = params.has("claude");

  const setParam = (name: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(name);
        else p.set(name, value);
        return p;
      },
      { replace: true }, // don't add a history entry for every click
    );
  const toggle = (name: string, on: boolean) => setParam(name, on ? null : "");

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = backlog ?? [];
  const visible = all.filter(
    (i) =>
      (!bugsOnly || i.type === "bug") &&
      (!unestimated || i.points === null) &&
      (!byClaude || i.createdBy === "claude"),
  );
  const groups = buildGroups(visible, groupBy, spaces);
  const colorOf = (spaceId: number) => spaces.find((s) => s.id === spaceId)?.color ?? "#999";

  const spaceCount = new Set(all.map((i) => i.spaceId)).size;
  const needPoints = all.filter((i) => i.points === null).length;

  return (
    <Page eyebrow="Work" title="Backlog">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-ink-muted">Group by</span>
        <Pill active={groupBy === "space"} onClick={() => setParam("group", null)}>
          Space
        </Pill>
        <Pill active={groupBy === "epic"} onClick={() => setParam("group", "epic")}>
          Epic
        </Pill>
        <Pill active={groupBy === "none"} onClick={() => setParam("group", "none")}>
          None
        </Pill>
        <span className="mx-2 h-6 w-px bg-line" />
        <Pill active={bugsOnly} onClick={() => toggle("bugs", bugsOnly)}>
          Bugs only
        </Pill>
        <Pill active={unestimated} onClick={() => toggle("unestimated", unestimated)}>
          Unestimated
        </Pill>
        <Pill active={byClaude} onClick={() => toggle("claude", byClaude)}>
          Created by Claude
        </Pill>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
          <span className="font-semibold">Backlog</span>
          <span className="flex-1 text-sm text-ink-muted">
            Everything not in a sprint · {all.length} issues in {spaceCount} spaces
            {needPoints > 0 && (
              <span className="font-semibold text-warn"> · {needPoints} need points</span>
            )}
          </span>
          <Link to="/plan" className={primaryButton}>
            Plan next sprint
          </Link>
        </div>

        {isPending ? (
          <p className="p-6 text-ink-muted">Loading backlog...</p>
        ) : error ? (
          <p className="p-6 text-danger">Could not load the backlog: {error.message}</p>
        ) : groups.length === 0 ? (
          <p className="p-6 text-ink-muted">
            {all.length === 0 ? "The backlog is empty." : "No issues match these filters."}
          </p>
        ) : (
          groups.map((group) => (
            <BacklogGroup
              key={group.id}
              group={group}
              collapsed={collapsed.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              colorOf={colorOf}
              showEpic={groupBy !== "epic"}
            />
          ))
        )}
      </div>
    </Page>
  );
}
