import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { STATUS_LABEL, type Status } from "../../api/types";

interface Props {
  status: Status;
  count: number;
  points: number;
  children: ReactNode;
}

/** One status column. Its id is the status, so a drop tells us the new status directly. */
export function BoardColumn({ status, count, points, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]}, ${count} issues`}
      className={`flex min-h-48 flex-col gap-3 rounded-2xl p-3 transition-colors ${
        isOver ? "bg-info-soft" : "bg-surface-2"
      }`}
    >
      <header className="flex items-center justify-between px-1 pt-1 text-sm">
        <span className="font-bold tracking-wide text-ink-muted uppercase">
          {STATUS_LABEL[status]} {count}
        </span>
        <span className="text-ink-muted">{points} pts</span>
      </header>
      {children}
    </section>
  );
}
