import {
  POINTS,
  PRIORITIES,
  STATUSES,
  STATUS_LABEL,
  type Issue,
  type IssuePatch,
  type Priority,
  type Sprint,
  type SpaceSummary,
  type Status,
} from "../../api/types";
import { inputClass, labelClass } from "../../components/formStyles";

interface Props {
  issue: Issue;
  spaces: SpaceSummary[];
  parentOptions: Issue[]; // epics for a story, stories/tasks for a subtask
  sprints: Sprint[];
  onPatch: (patch: IssuePatch) => void;
  onMoveSpace: (spaceId: number) => void;
}

/** The right-hand panel of fields. Every change is saved straight away. */
export function FieldsPanel({
  issue,
  spaces,
  parentOptions,
  sprints,
  onPatch,
  onMoveSpace,
}: Props) {
  // Same rule as the Create form: epics and subtasks have no points or sprint.
  const container = issue.type === "epic" || issue.type === "subtask";
  // Show open sprints, plus the issue's own sprint even if it is completed.
  const sprintOptions = sprints.filter((s) => s.state !== "completed" || s.id === issue.sprintId);

  return (
    <div className="space-y-5">
      <label className="block">
        <span className={labelClass}>Status</span>
        <select
          className={inputClass}
          value={issue.status}
          onChange={(e) => onPatch({ status: e.target.value as Status })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>Space</span>
        {/* Only story-level issues move; a subtask follows its parent and an
            epic's issues are moved one by one. */}
        <select
          className={inputClass}
          value={issue.spaceId}
          disabled={container}
          title={container ? "Epics and subtasks cannot move between spaces" : undefined}
          onChange={(e) => onMoveSpace(Number(e.target.value))}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {issue.type !== "epic" && (
        <label className="block">
          <span className={labelClass}>{issue.type === "subtask" ? "Parent" : "Epic"}</span>
          <select
            className={inputClass}
            value={issue.parentId ?? ""}
            onChange={(e) => onPatch({ parentId: e.target.value ? Number(e.target.value) : null })}
          >
            {issue.type !== "subtask" && <option value="">None</option>}
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {issue.type === "subtask" ? `${p.key} ${p.title}` : p.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {!container && (
        <div>
          <span className={labelClass}>Story points</span>
          <div className="flex flex-wrap gap-2">
            {POINTS.map((p) => {
              const selected = issue.points === p;
              return (
                <button
                  key={p}
                  aria-pressed={selected}
                  // Clicking the selected value again clears the estimate.
                  onClick={() => onPatch({ points: selected ? null : p })}
                  className={`size-11 rounded-lg border font-semibold ${
                    selected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line bg-surface hover:bg-surface-2"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!container && (
        <label className="block">
          <span className={labelClass}>Sprint</span>
          <select
            className={inputClass}
            value={issue.sprintId ?? ""}
            onChange={(e) => onPatch({ sprintId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Not planned</option>
            {sprintOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (
                {s.state === "active" ? "current" : s.state === "planned" ? "next" : "completed"})
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className={labelClass}>Priority</span>
        <select
          className={`${inputClass} capitalize`}
          value={issue.priority}
          onChange={(e) => onPatch({ priority: e.target.value as Priority })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
