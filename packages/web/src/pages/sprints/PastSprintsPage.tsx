import { Link, useSearchParams } from "react-router";
import { useSpaces, useSprintResults, useSprints, useVelocity } from "../../api/queries";
import { Page } from "../../layout/Page";
import { formatRange } from "../../lib/dates";
import { SprintDetail } from "./SprintDetail";
import { VelocityChart } from "./VelocityChart";

export function PastSprintsPage() {
  const { data: sprints = [], isPending } = useSprints();
  const { data: results = [] } = useSprintResults();
  const { data: velocity } = useVelocity();
  const { data: spaces = [] } = useSpaces();

  // Newest first in the list; the selected sprint lives in the URL (?sprint=3).
  const completed = sprints
    .filter((s) => s.state === "completed")
    .sort((a, b) => b.number - a.number);
  const [params, setParams] = useSearchParams();
  const selectedNumber = Number(params.get("sprint")) || completed[0]?.number;
  const selected = completed.find((s) => s.number === selectedNumber) ?? completed[0];
  const resultOf = (id: number) => results.find((r) => r.sprintId === id);

  if (isPending) {
    return (
      <Page eyebrow="My sprint" title="Past sprints">
        <p className="text-ink-muted">Loading...</p>
      </Page>
    );
  }
  if (!selected) {
    return (
      <Page eyebrow="My sprint" title="Past sprints">
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-ink-muted">
          No completed sprints yet. Finish one from the{" "}
          <Link to="/" className="text-accent underline">
            board
          </Link>
          .
        </div>
      </Page>
    );
  }

  return (
    <Page eyebrow="My sprint" title="Past sprints">
      <div className="flex items-start gap-6">
        <div className="w-80 shrink-0 space-y-3">
          <VelocityChart results={results} average={velocity?.average ?? null} />
          <ul className="space-y-3">
            {completed.map((sprint) => {
              const r = resultOf(sprint.id);
              const percent = r && r.committed ? Math.round((r.done / r.committed) * 100) : 0;
              const active = sprint.id === selected.id;
              return (
                <li key={sprint.id}>
                  <button
                    onClick={() => setParams({ sprint: String(sprint.number) }, { replace: true })}
                    aria-current={active}
                    className={`w-full rounded-xl border bg-surface px-4 py-3 text-left hover:border-ink-faint ${
                      active ? "border-accent ring-1 ring-accent" : "border-line"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">{sprint.name}</span>
                      <span className="text-sm text-ink-muted">
                        <b className="text-ink">{r?.done ?? 0}</b> of {r?.committed ?? 0} pts
                      </span>
                    </div>
                    <div className="text-sm text-ink-muted">
                      {formatRange(sprint.startDate, sprint.endDate)} · {percent}% of commitment
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <SprintDetail key={selected.id} sprint={selected} spaces={spaces} />
      </div>
    </Page>
  );
}
