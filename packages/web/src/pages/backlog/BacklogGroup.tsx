import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRankIssue } from "../../api/queries";
import type { BacklogItem } from "../../api/types";
import { SpaceDot } from "../../components/IssueBits";
import { BacklogRow } from "./BacklogRow";

export interface Group {
  id: string;
  title: string;
  subtitle: string; // the space or epic key
  color: string;
  items: BacklogItem[];
}

interface Props {
  group: Group;
  collapsed: boolean;
  onToggle: () => void;
  colorOf: (spaceId: number) => string;
  showEpic: boolean;
}

export function BacklogGroup({ group, collapsed, onToggle, colorOf, showEpic }: Props) {
  const rank = useRankIssue();

  // Pointer for mouse and touch; Keyboard so a row can be moved with Space + arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Each group has its own DndContext, so a row can only be dropped inside its
  // own group: dragging into another space would mean changing space, not rank.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = group.items.findIndex((i) => i.key === active.id);
    const to = group.items.findIndex((i) => i.key === over.id);
    const reordered = arrayMove(group.items, from, to);
    // Tell the API which issues now sit directly above and below the moved one.
    rank.mutate({
      key: String(active.id),
      position: {
        prevKey: reordered[to - 1]?.key ?? null,
        nextKey: reordered[to + 1]?.key ?? null,
      },
    });
  };

  const points = group.items.reduce((sum, i) => sum + (i.points ?? 0), 0);

  return (
    <section className="border-t border-line first:border-t-0">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 bg-surface-2/60 px-3 py-2.5 text-left hover:bg-surface-2"
      >
        {collapsed ? (
          <ChevronRight size={16} className="text-ink-muted" />
        ) : (
          <ChevronDown size={16} className="text-ink-muted" />
        )}
        <SpaceDot color={group.color} className="size-2.5" />
        <span className="font-semibold">{group.title}</span>
        <span className="font-mono text-sm text-ink-muted">{group.subtitle}</span>
        <span className="ml-auto text-sm text-ink-muted">
          {group.items.length} {group.items.length === 1 ? "issue" : "issues"} · {points} pts
        </span>
      </button>

      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={group.items.map((i) => i.key)}
            strategy={verticalListSortingStrategy}
          >
            <ul>
              {group.items.map((item) => (
                <BacklogRow
                  key={item.key}
                  item={item}
                  spaceColor={colorOf(item.spaceId)}
                  showEpic={showEpic}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
