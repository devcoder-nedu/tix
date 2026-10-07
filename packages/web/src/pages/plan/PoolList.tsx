import { Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { BacklogItem, SpaceSummary } from "../../api/types";
import {
  IssueKey,
  PointsBubble,
  SpaceDot,
  TypeBadge,
  ViaClaudeTag,
} from "../../components/IssueBits";
import { Pill } from "../../components/Pill";

interface Props {
  items: BacklogItem[];
  spaces: SpaceSummary[];
  onAdd: (key: string) => void;
  adding: boolean;
  canAdd: boolean; // false when there is no planned sprint to add to
}

const MAX_PILLS = 3;

/** Left side of Plan: every backlog issue, grouped by space, each with a + button. */
export function PoolList({ items, spaces, onAdd, adding, canAdd }: Props) {
  const [spaceKey, setSpaceKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const withItems = spaces.filter((s) => items.some((i) => i.spaceId === s.id));
  const pills = showAll ? withItems : withItems.slice(0, MAX_PILLS);
  const shown = withItems.filter((s) => spaceKey === null || s.key === spaceKey);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Pick from any space</h2>
        <Pill active={spaceKey === null} onClick={() => setSpaceKey(null)}>
          All
        </Pill>
        {pills.map((s) => (
          <Pill key={s.id} active={spaceKey === s.key} onClick={() => setSpaceKey(s.key)}>
            <span className="flex items-center gap-2">
              <SpaceDot color={s.color} />
              {s.name}
            </span>
          </Pill>
        ))}
        {!showAll && withItems.length > MAX_PILLS && (
          <Pill active={false} onClick={() => setShowAll(true)}>
            More
          </Pill>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {shown.map((space) => {
          const group = items.filter((i) => i.spaceId === space.id);
          return (
            <section key={space.id} className="border-t border-line first:border-t-0">
              <header className="flex items-center gap-2 bg-surface-2/60 px-3 py-2 text-sm">
                <SpaceDot color={space.color} />
                <span className="font-semibold">{space.name}</span>
                <span className="ml-auto text-ink-muted">{group.length} ready</span>
              </header>
              <ul>
                {group.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-t border-line px-3 py-2"
                  >
                    <TypeBadge type={item.type} />
                    <span className="w-20 shrink-0">
                      <IssueKey issueKey={item.key} color={space.color} />
                    </span>
                    <Link
                      to={`/issue/${item.key}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {item.title}
                    </Link>
                    {item.slipCount >= 2 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warn">
                        <TriangleAlert size={12} /> slipped {item.slipCount} sprints
                      </span>
                    ) : item.lastReturnedSprint !== null ? (
                      <span className="rounded border border-line px-1.5 py-0.5 text-xs whitespace-nowrap text-ink-muted">
                        was in Sprint {item.lastReturnedSprint}
                      </span>
                    ) : null}
                    {item.createdBy === "claude" && <ViaClaudeTag />}
                    <PointsBubble points={item.points} />
                    <button
                      onClick={() => onAdd(item.key)}
                      disabled={adding || !canAdd}
                      aria-label={`Add ${item.key} to the sprint`}
                      className="flex size-8 items-center justify-center rounded-lg border border-line hover:bg-surface-2 disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {items.length === 0 && <p className="p-6 text-ink-muted">The backlog is empty.</p>}
      </div>
    </div>
  );
}
