import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Issue } from "../../api/types";
import {
  IssueKey,
  PointsBubble,
  StatusPill,
  TypeBadge,
  ViaClaudeTag,
} from "../../components/IssueBits";

/** The "└" connector that shows a row belongs to the one above it. */
function Elbow({ depth }: { depth: number }) {
  return (
    <span className="flex shrink-0" style={{ paddingLeft: `${(depth - 1) * 1.75}rem` }}>
      <span className="mb-2 ml-1 h-3 w-3 rounded-bl border-b border-l border-line" />
    </span>
  );
}

function IssueRow({ issue, depth, color }: { issue: Issue; depth: number; color: string }) {
  return (
    <li className="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <Elbow depth={depth} />
      <TypeBadge type={issue.type} />
      <span className="w-20 shrink-0">
        <IssueKey issueKey={issue.key} color={color} />
      </span>
      <Link to={`/issue/${issue.key}`} className="min-w-0 flex-1 truncate hover:underline">
        {issue.title}
      </Link>
      {issue.createdBy === "claude" && <ViaClaudeTag />}
      <StatusPill status={issue.status} />
      {/* Subtasks never carry points, so keep the column empty for alignment. */}
      {issue.type === "subtask" ? <span className="w-6" /> : <PointsBubble points={issue.points} />}
    </li>
  );
}

interface Props {
  epic: Issue | null; // null = the "No epic" group
  items: Issue[]; // stories, tasks, bugs, spikes under this epic
  subtasksOf: (id: number) => Issue[];
  color: string;
}

export function EpicSection({ epic, items, subtasksOf, color }: Props) {
  const [open, setOpen] = useState(true);
  const done = items.filter((i) => i.status === "done").length;
  const points = items.reduce((sum, i) => sum + (i.points ?? 0), 0);
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <section className="border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 bg-surface-2/60 px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="text-ink-muted hover:text-ink"
        >
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {epic ? (
          <>
            <TypeBadge type="epic" />
            <IssueKey issueKey={epic.key} color={color} />
            <Link
              to={`/issue/${epic.key}`}
              className="min-w-0 flex-1 truncate font-semibold hover:underline"
            >
              {epic.title}
            </Link>
          </>
        ) : (
          <span className="flex-1 font-semibold text-ink-muted">No epic</span>
        )}
        <span className="text-sm whitespace-nowrap text-ink-muted">
          {done} of {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-chip">
          <div
            className="h-full rounded-full"
            style={{ width: `${percent}%`, backgroundColor: color }}
          />
        </div>
        <span className="w-14 text-right text-sm text-ink-muted">{points} pts</span>
      </div>

      {open && (
        <ul>
          {items.map((item) => (
            // One story row followed by its subtask rows.
            <IssueTreeBranch
              key={item.id}
              item={item}
              subtasks={subtasksOf(item.id)}
              color={color}
            />
          ))}
          {items.length === 0 && (
            <li className="border-t border-line px-4 py-3 pl-14 text-sm text-ink-muted">
              No issues yet
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function IssueTreeBranch({
  item,
  subtasks,
  color,
}: {
  item: Issue;
  subtasks: Issue[];
  color: string;
}) {
  return (
    <>
      <IssueRow issue={item} depth={1} color={color} />
      {subtasks.map((sub) => (
        <IssueRow key={sub.id} issue={sub} depth={2} color={color} />
      ))}
    </>
  );
}
