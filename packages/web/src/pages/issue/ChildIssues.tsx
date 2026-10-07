import { Plus } from "lucide-react";
import { Link } from "react-router";
import type { Issue } from "../../api/types";
import { IssueKey, PointsBubble, StatusPill, TypeBadge } from "../../components/IssueBits";
import { secondaryButton } from "../../components/formStyles";

interface Props {
  title: string; // "Subtasks" or "Issues in this epic"
  items: Issue[];
  spaceColor: string;
  showPoints: boolean;
  onAdd: () => void;
  addLabel: string;
}

/** Subtasks of a story, or the stories and tasks of an epic. */
export function ChildIssues({ title, items, spaceColor, showPoints, onAdd, addLabel }: Props) {
  const done = items.filter((c) => c.status === "done").length;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-muted">
          {title} · {done} of {items.length} done
        </h3>
        <button
          onClick={onAdd}
          className={`${secondaryButton} flex items-center gap-1.5 px-3! py-1.5! text-sm`}
        >
          <Plus size={16} /> {addLabel}
        </button>
      </div>
      {items.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((child) => (
            <li
              key={child.id}
              className="flex items-center gap-3 border-t border-line px-3 py-2.5 first:border-t-0"
            >
              <TypeBadge type={child.type} />
              <IssueKey issueKey={child.key} color={spaceColor} />
              <Link to={`/issue/${child.key}`} className="min-w-0 flex-1 truncate hover:underline">
                {child.title}
              </Link>
              <StatusPill status={child.status} />
              {showPoints && <PointsBubble points={child.points} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
