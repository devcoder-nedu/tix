// Small pieces that appear on nearly every screen: the type badge (S, T, B...),
// point bubble, status pill, space dot with key, and epic chip. Built once so
// every screen looks the same and a design change happens in one place.

import { Zap } from "lucide-react";
import type { IssueType, Points, Status } from "../api/types";
import { STATUS_LABEL, TYPE_LABEL } from "../api/types";

const TYPE_STYLE: Record<IssueType, { letter: string; className: string }> = {
  story: { letter: "S", className: "bg-type-story" },
  task: { letter: "T", className: "bg-type-task" },
  bug: { letter: "B", className: "bg-type-bug" },
  spike: { letter: "Sp", className: "bg-type-spike" },
  subtask: { letter: "st", className: "bg-type-subtask" },
  epic: { letter: "", className: "bg-type-epic" },
};

export function TypeBadge({ type }: { type: IssueType }) {
  const { letter, className } = TYPE_STYLE[type];
  return (
    <span
      title={TYPE_LABEL[type]}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${className}`}
    >
      {type === "epic" ? <Zap size={12} fill="currentColor" /> : letter}
    </span>
  );
}

/** Grey bubble with the points; a dashed "?" when the issue still needs an estimate. */
export function PointsBubble({ points }: { points: Points | null }) {
  if (points === null) {
    return (
      <span
        title="Unestimated"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-warn text-xs font-semibold text-warn"
      >
        ?
      </span>
    );
  }
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-semibold">
      {points}
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-chip text-ink",
  in_progress: "bg-info-soft text-info",
  in_review: "bg-info-soft text-info",
  done: "bg-success-soft text-success",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SpaceDot({ color, className = "size-2" }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}

/** "● FR-4": the space colour dot followed by the key in monospace. */
export function IssueKey({ issueKey, color }: { issueKey: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-sm text-ink-muted">
      <SpaceDot color={color} />
      {issueKey}
    </span>
  );
}

/** "⚡ Reach B1": which epic an issue belongs to. */
export function EpicChip({ title }: { title: string }) {
  return (
    <span className="inline-flex max-w-48 items-center gap-1 rounded bg-chip px-2 py-0.5 text-xs font-semibold">
      <Zap size={12} className="shrink-0" />
      <span className="truncate">{title}</span>
    </span>
  );
}

export function ViaClaudeTag() {
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-xs whitespace-nowrap text-ink-muted">
      via Claude
    </span>
  );
}
