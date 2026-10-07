import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import type { BacklogItem } from "../../api/types";
import {
  EpicChip,
  IssueKey,
  PointsBubble,
  TypeBadge,
  ViaClaudeTag,
} from "../../components/IssueBits";

interface Props {
  item: BacklogItem;
  spaceColor: string;
  showEpic: boolean;
}

export function BacklogRow({ item, spaceColor, showEpic }: Props) {
  // useSortable wires this row into the group's drag and drop. The handle gets
  // the listeners, so clicking the title still opens the issue.
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-3 border-t border-line bg-surface px-3 py-2.5 ${
        isDragging ? "relative z-10 shadow-lg" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${item.key} to change its rank`}
        className="cursor-grab touch-none text-ink-faint hover:text-ink-muted active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      <TypeBadge type={item.type} />
      <span className="w-20 shrink-0">
        <IssueKey issueKey={item.key} color={spaceColor} />
      </span>
      <Link to={`/issue/${item.key}`} className="min-w-0 flex-1 truncate hover:underline">
        {item.title}
      </Link>

      {/* Tags from sprint history: "slipped" wins over "was in", as in the mockups. */}
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
      {showEpic && item.epic && <EpicChip title={item.epic.title} />}
      <PointsBubble points={item.points} />
    </li>
  );
}
