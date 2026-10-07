import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useInsight, useSprintSummary } from "../../api/queries";
import type { SpaceSummary, Sprint, SprintIssueResult } from "../../api/types";
import { IssueKey, PointsBubble, SpaceDot, TypeBadge } from "../../components/IssueBits";
import { secondaryButton } from "../../components/formStyles";
import { formatRange, formatTimestamp } from "../../lib/dates";

interface Props {
  sprint: Sprint;
  spaces: SpaceSummary[];
}

/** The fixed fields a sprint review has (the design doc: three short paragraphs). */
interface ReviewBody {
  achieved: string;
  notAchieved: string;
  worthNoticing: string;
}

const SHOW_FIRST = 3;

function IssueList({
  issues,
  colorOf,
  showWhere,
}: {
  issues: SprintIssueResult[];
  colorOf: (spaceId: number) => string;
  showWhere: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? issues : issues.slice(0, SHOW_FIRST);
  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-surface">
      {shown.map((issue) => (
        <li
          key={issue.id}
          className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
        >
          <TypeBadge type={issue.type} />
          <span className="w-20 shrink-0">
            <IssueKey issueKey={issue.key} color={colorOf(issue.spaceId)} />
          </span>
          <Link to={`/issue/${issue.key}`} className="min-w-0 flex-1 truncate hover:underline">
            {issue.title}
          </Link>
          {showWhere && (
            <span className="text-sm whitespace-nowrap text-warn">
              {issue.outcome === "carried_over"
                ? `Moved to Sprint ${issue.movedToSprint}`
                : "Moved to Backlog"}
            </span>
          )}
          {/* Points as committed at the start: the numbers above are built from these. */}
          <PointsBubble points={issue.pointsAtStart} />
        </li>
      ))}
      {issues.length > SHOW_FIRST && (
        <li className="border-t border-line">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-2.5 text-left text-sm text-ink-muted hover:bg-surface-2"
          >
            {expanded ? "Show fewer" : `Show ${issues.length - SHOW_FIRST} more`}
          </button>
        </li>
      )}
    </ul>
  );
}

export function SprintDetail({ sprint, spaces }: Props) {
  const { data: summary } = useSprintSummary(sprint.id);
  const { data: review } = useInsight("sprint_review", sprint.id);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const colorOf = (id: number) => spaceById.get(id)?.color ?? "#999";

  if (!summary) return <p className="text-ink-muted">Loading...</p>;

  const body = review ? (JSON.parse(review.body) as ReviewBody) : null;
  const issueCount = summary.finishedIssues.length + summary.unfinishedIssues.length;
  const doneBySpace = summary.bySpace.filter((s) => s.done > 0);

  return (
    <div className="min-w-0 flex-1 space-y-5">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-2xl font-semibold">{sprint.name}</h2>
          <span className="text-ink-muted">
            {formatRange(sprint.startDate, sprint.endDate)}
            {sprint.completedAt && ` · completed ${formatTimestamp(sprint.completedAt)}`}
          </span>
        </div>
        {sprint.goal && <p className="text-ink-muted">Goal: {sprint.goal}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-3xl font-semibold text-success">{summary.done}</div>
          <div className="text-sm text-ink-muted">points done of {summary.committed}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-3xl font-semibold">
            {summary.finishedIssues.length} of {issueCount}
          </div>
          <div className="text-sm text-ink-muted">issues finished</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          {/* Done points split by space; space colours identify spaces everywhere in Tix. */}
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {doneBySpace.map((s) => (
              <div key={s.spaceId} style={{ flex: s.done, backgroundColor: colorOf(s.spaceId) }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
            {doneBySpace.map((s) => (
              <span key={s.spaceId} className="flex items-center gap-1.5">
                <SpaceDot color={colorOf(s.spaceId)} /> {spaceById.get(s.spaceId)?.name}{" "}
                <b className="text-ink">{s.done}</b>
              </span>
            ))}
            {doneBySpace.length === 0 && "Nothing finished"}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-line bg-surface-2/50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h3 className="flex-1 font-semibold">Sprint review</h3>
          {review && (
            <span className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted">
              Local · {review.model}
            </span>
          )}
          <button
            disabled
            title="The local model arrives in Phase 6"
            className={`${secondaryButton} px-3! py-1.5! text-sm`}
          >
            Regenerate
          </button>
        </div>
        {body ? (
          <div className="grid grid-cols-3 gap-5 text-sm leading-relaxed">
            <div>
              <h4 className="mb-1 font-semibold text-success">Achieved</h4>
              <p>{body.achieved}</p>
            </div>
            <div>
              <h4 className="mb-1 font-semibold text-warn">Not achieved</h4>
              <p>{body.notAchieved}</p>
            </div>
            <div>
              <h4 className="mb-1 font-semibold text-info">Worth noticing</h4>
              <p>{body.worthNoticing}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No review saved for this sprint. Reviews are written by the local model once Ollama is
            connected; the numbers on this page are always calculated by Tix.
          </p>
        )}
      </section>

      {summary.finishedIssues.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Completed · {summary.finishedIssues.length}</h3>
          <IssueList issues={summary.finishedIssues} colorOf={colorOf} showWhere={false} />
        </section>
      )}
      {summary.unfinishedIssues.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Not finished · {summary.unfinishedIssues.length}</h3>
          <IssueList issues={summary.unfinishedIssues} colorOf={colorOf} showWhere />
        </section>
      )}
    </div>
  );
}
