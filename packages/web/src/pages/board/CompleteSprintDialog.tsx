import { useEffect, useRef, useState } from "react";
import { useCompleteSprint, useSpaces, useSprints, useSprintSummary } from "../../api/queries";
import type { Rollover, Sprint } from "../../api/types";
import { IssueKey, PointsBubble, SpaceDot, TypeBadge } from "../../components/IssueBits";
import { inputClass, labelClass, secondaryButton } from "../../components/formStyles";
import { formatRange } from "../../lib/dates";

interface Props {
  sprint: Sprint;
  onClose: () => void;
  onCompleted: () => void;
}

function Stat({
  value,
  label,
  tone = "",
}: {
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="text-sm text-ink-muted">{label}</div>
    </div>
  );
}

export function CompleteSprintDialog({ sprint, onClose, onCompleted }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: summary } = useSprintSummary(sprint.id);
  const { data: spaces = [] } = useSpaces();
  const { data: sprints = [] } = useSprints();
  const complete = useCompleteSprint();

  // One default destination plus per-issue overrides. An issue's destination is
  // derived (override ?? default), so changing the default needs no loop.
  const [defaultMove, setDefaultMove] = useState<Rollover>("next");
  const [overrides, setOverrides] = useState<Record<string, Rollover>>({});

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const planned = sprints.find((s) => s.state === "planned");
  const nextName = planned ? planned.name : `Sprint ${sprint.number + 1} (new)`;
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const unfinished = summary?.unfinishedIssues ?? [];
  const moveOf = (key: string) => overrides[key] ?? defaultMove;

  const submit = () => {
    const moves = Object.fromEntries(unfinished.map((i) => [i.key, moveOf(i.key)]));
    complete.mutate({ id: sprint.id, moves }, { onSuccess: onCompleted });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="complete-title"
      className="m-auto max-h-[90vh] w-full max-w-xl rounded-2xl border border-line bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="space-y-5 p-7">
        <div>
          <h2 id="complete-title" className="text-2xl font-semibold">
            Complete {sprint.name}
          </h2>
          <p className="text-ink-muted">{formatRange(sprint.startDate, sprint.endDate)}</p>
        </div>

        {!summary ? (
          <p className="text-ink-muted">Adding up the sprint...</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat value={summary.done} label="points completed" tone="text-success" />
              <Stat value={summary.unfinished} label="points unfinished" />
              <Stat value={`${summary.percent}%`} label="of commitment" />
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-2 font-semibold">By space</h3>
              <ul className="space-y-1.5">
                {summary.bySpace.map((row) => {
                  const space = spaceById.get(row.spaceId);
                  return (
                    <li key={row.spaceId} className="flex items-center gap-2">
                      <SpaceDot color={space?.color ?? "#999"} className="size-2.5" />
                      <span className="flex-1">{space?.name}</span>
                      <span className="text-sm text-ink-muted">
                        {row.done} of {row.committed} pts
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {unfinished.length > 0 ? (
              <>
                <div>
                  <h3 className="mb-2 font-semibold">
                    {unfinished.length} unfinished {unfinished.length === 1 ? "issue" : "issues"}
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                    {unfinished.map((issue) => (
                      <li
                        key={issue.id}
                        className="flex items-center gap-3 border-t border-line px-3 py-2 first:border-t-0"
                      >
                        <TypeBadge type={issue.type} />
                        <IssueKey
                          issueKey={issue.key}
                          color={spaceById.get(issue.spaceId)?.color ?? "#999"}
                        />
                        <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                        <PointsBubble points={issue.points} />
                        <select
                          aria-label={`Where ${issue.key} goes`}
                          className="rounded-md border border-line bg-canvas px-1.5 py-1 text-sm"
                          value={moveOf(issue.key)}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [issue.key]: e.target.value as Rollover }))
                          }
                        >
                          <option value="next">Next sprint</option>
                          <option value="backlog">Backlog</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>

                <label className="block">
                  <span className={labelClass}>Move unfinished issues to</span>
                  <select
                    className={inputClass}
                    value={defaultMove}
                    onChange={(e) => {
                      setDefaultMove(e.target.value as Rollover);
                      setOverrides({}); // the big choice applies to every issue again
                    }}
                  >
                    <option value="next">{nextName}</option>
                    <option value="backlog">Backlog</option>
                  </select>
                </label>
                <p className="-mt-3 text-sm text-ink-muted">
                  Status and ticked criteria are kept. The history records each move, which feeds
                  the slip tags.
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-success-soft px-4 py-3 text-success">
                Everything in this sprint is done.
              </p>
            )}
          </>
        )}

        {complete.error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {complete.error.message}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!summary || complete.isPending}
            className="rounded-lg bg-ink px-4 py-2.5 font-semibold text-canvas hover:opacity-90 disabled:opacity-50"
          >
            {complete.isPending ? "Completing..." : "Complete sprint"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
