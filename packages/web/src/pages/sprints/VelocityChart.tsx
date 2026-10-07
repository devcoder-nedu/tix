import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SprintResult } from "../../api/types";

// Series colours come from theme tokens (validated in both themes); text uses
// ink tokens, never the series colour.
const SERIES = [
  { key: "committed", label: "Committed", color: "var(--series-1)" },
  { key: "done", label: "Done", color: "var(--series-2)" },
] as const;

const tick = { fill: "var(--ink-muted)", fontSize: 12 };

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: unknown; value?: unknown }[];
}

/** Hover card: the sprint and both exact numbers. */
function ChartTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const value = (key: string) => payload.find((p) => p.dataKey === key)?.value;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md">
      <div className="mb-1 font-semibold">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="text-ink-muted">{s.label}</span>
          <span className="ml-auto pl-4 font-semibold">{String(value(s.key) ?? 0)} pts</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  results: SprintResult[];
  average: number | null;
}

const MAX_SPRINTS = 8;

export function VelocityChart({ results, average }: Props) {
  const data = results.slice(-MAX_SPRINTS).map((r) => ({
    name: `S${r.number}`,
    committed: r.committed,
    done: r.done,
  }));

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Velocity</h2>
        {average !== null && (
          <span className="text-sm text-ink-muted">
            avg <b className="text-ink">{average}</b> pts
          </span>
        )}
      </div>

      <div className="h-44" role="img" aria-label="Committed and done points per sprint">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={2}
            barCategoryGap="28%"
            margin={{ top: 8, right: 0, bottom: 0, left: -12 }}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]} // rounded data end, flat on the baseline
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Two series always get a legend, so colour is never the only way to tell them apart. */}
      <div className="mt-2 flex gap-4 text-sm text-ink-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
