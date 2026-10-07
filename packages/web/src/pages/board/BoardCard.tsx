import { useDraggable } from "@dnd-kit/core";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import type { Issue } from "../../api/types";
import {
  EpicChip,
  IssueKey,
  PointsBubble,
  TypeBadge,
  ViaClaudeTag,
} from "../../components/IssueBits";

interface CardProps {
  issue: Issue;
  spaceColor: string;
  epicTitle: string | null;
}

/** What a card looks like. Used for the card in its column and for the copy that follows the pointer. */
export function CardBody({ issue, spaceColor, epicTitle }: CardProps) {
  const done = issue.status === "done";
  return (
    <>
      <p className={`font-semibold ${done ? "text-ink-muted line-through" : ""}`}>{issue.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {epicTitle && <EpicChip title={epicTitle} />}
        {issue.createdBy === "claude" && <ViaClaudeTag />}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <TypeBadge type={issue.type} />
        <IssueKey issueKey={issue.key} color={spaceColor} />
        <span className="ml-auto">
          <PointsBubble points={issue.points} />
        </span>
      </div>
    </>
  );
}

const cardClass = "rounded-xl border border-line bg-surface p-4 text-left shadow-sm";

/**
 * A card you can drag to another column, or click (or press Enter) to open.
 * It is not an <a> link on purpose: dnd-kit stops the click that ends a drag
 * from reaching React, but a real link would still follow its href.
 */
export function BoardCard(props: CardProps) {
  const navigate = useNavigate();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: props.issue.key });
  const open = () => navigate(`/issue/${props.issue.key}`);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") open();
    listeners?.onKeyDown?.(e); // keep dnd-kit's keyboard dragging (Space)
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={open}
      aria-label={`${props.issue.key} ${props.issue.title}. Enter to open, Space to move.`}
      className={`${cardClass} cursor-grab touch-none hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-accent ${
        isDragging ? "opacity-40" : "" // the overlay copy shows where it is going
      }`}
    >
      <CardBody {...props} />
    </div>
  );
}

/** The copy rendered in dnd-kit's DragOverlay while a card is being dragged. */
export function DraggingCard(props: CardProps) {
  return (
    <div className={`${cardClass} rotate-2 cursor-grabbing shadow-xl`}>
      <CardBody {...props} />
    </div>
  );
}
