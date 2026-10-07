import { Gauge, X } from "lucide-react";
import type { BacklogItem, SpaceSummary, Sprint, SprintInput, Velocity } from "../../api/types";
import { IssueKey, PointsBubble, SpaceDot, TypeBadge } from "../../components/IssueBits";
import { Pill } from "../../components/Pill";
import { inputClass, labelClass, primaryButton } from "../../components/formStyles";
import { formatRange } from "../../lib/dates";

interface Props {
  sprint: Sprint;
  items: BacklogItem[];
  spaces: SpaceSummary[];
  velocity: Velocity | undefined;
  activeSprint: Sprint | undefined;
  onUpdate: (patch: Partial<SprintInput>) => void;
  onRemove: (key: string) => void;
  onStart: () => void;
  busy: boolean;
}

/** Plain numbers from Tix. The phrased version from the local model arrives in Phase 6. */
function PlanningNumbers({
  velocity,
  items,
}: {
  velocity: Velocity | undefined;
  items: BacklogItem[];
}) {
  const carried = items.filter((i) => i.carriedOver).length;
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
      <Gauge size={18} className="mt-0.5 shrink-0 text-ink-muted" />
      <p>
        {velocity?.average != null ? (
          <>
            Velocity <b>{velocity.average} pts</b>, the average done over the last{" "}
            {velocity.recent.length} {velocity.recent.length === 1 ? "sprint" : "sprints"}.
          </>
        ) : (
          <>
            No velocity yet. A first sprint of about 20 points for 2 weeks (10 for 1) is a safe
            start.
          </>
        )}
        {carried > 0 && (
          <>
            {" "}
            {carried} carried over {carried === 1 ? "item" : "items"} below.
          </>
        )}
      </p>
    </div>
  );
}

/** Points per space as coloured segments, out of the capacity (or the total if it is bigger). */
function CapacityBar({
  items,
  spaces,
  capacity,
}: {
  items: BacklogItem[];
  spaces: SpaceSummary[];
  capacity: number;
}) {
  const bySpace = spaces
    .map((s) => ({
      space: s,
      points: items.filter((i) => i.spaceId === s.id).reduce((n, i) => n + (i.points ?? 0), 0),
    }))
    .filter((x) => x.points > 0);
  const total = bySpace.reduce((n, x) => n + x.points, 0);
  const scale = Math.max(capacity, total, 1);
  const over = total > capacity;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-semibold">Capacity</span>
        <span className={`text-sm ${over ? "font-semibold text-warn" : "text-ink-muted"}`}>
          <b className={over ? "" : "text-ink"}>{total}</b> of {capacity} pts ·{" "}
          {over ? `${total - capacity} over` : `${capacity - total} left`}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-chip">
        {bySpace.map(({ space, points }) => (
          <div
            key={space.id}
            style={{ width: `${(points / scale) * 100}%`, backgroundColor: space.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
        {bySpace.map(({ space, points }) => (
          <span key={space.id} className="flex items-center gap-1.5">
            <SpaceDot color={space.color} /> {space.name} {points}
          </span>
        ))}
      </div>
      {/* The design doc: capacity is a guide, Tix warns but never blocks. */}
      {over && (
        <p className="mt-1 text-sm text-warn">
          Over capacity. You can still start; it is only a guide.
        </p>
      )}
    </div>
  );
}

export function SprintPanel(props: Props) {
  const { sprint, items, spaces, velocity, activeSprint, onUpdate, onRemove, onStart, busy } =
    props;
  const colorOf = (spaceId: number) => spaces.find((s) => s.id === spaceId)?.color ?? "#999";

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col gap-4 rounded-2xl border border-accent/60 bg-canvas p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{sprint.name}</h2>
        <span className="text-sm text-ink-muted">
          {formatRange(sprint.startDate, sprint.endDate)} · {sprint.lengthWeeks}{" "}
          {sprint.lengthWeeks === 1 ? "week" : "weeks"}
        </span>
      </div>

      <PlanningNumbers velocity={velocity} items={items} />

      <div className="grid grid-cols-[1fr_auto_5.5rem] items-end gap-3">
        <label>
          <span className={labelClass}>Start</span>
          <input
            type="date"
            className={inputClass}
            value={sprint.startDate}
            onChange={(e) => e.target.value && onUpdate({ startDate: e.target.value })}
          />
        </label>
        <div>
          <span className={labelClass}>Length</span>
          <div className="flex gap-1.5 py-1">
            <Pill active={sprint.lengthWeeks === 1} onClick={() => onUpdate({ lengthWeeks: 1 })}>
              1 wk
            </Pill>
            <Pill active={sprint.lengthWeeks === 2} onClick={() => onUpdate({ lengthWeeks: 2 })}>
              2 wk
            </Pill>
          </div>
        </div>
        <label>
          <span className={labelClass}>Capacity</span>
          {/* Uncontrolled: the browser keeps the text while typing; save when leaving the field.
              The key remounts it when the saved value changes elsewhere. */}
          <input
            key={`cap-${sprint.capacity}`}
            type="number"
            min={0}
            className={inputClass}
            defaultValue={sprint.capacity}
            onBlur={(e) => {
              const capacity = Number(e.target.value);
              if (Number.isInteger(capacity) && capacity >= 0 && capacity !== sprint.capacity) {
                onUpdate({ capacity });
              }
            }}
          />
        </label>
      </div>

      <label>
        <span className={labelClass}>Sprint goal</span>
        <input
          key={`goal-${sprint.goal}`}
          className={inputClass}
          defaultValue={sprint.goal}
          placeholder="What makes this sprint a success?"
          onBlur={(e) =>
            e.target.value.trim() !== sprint.goal && onUpdate({ goal: e.target.value })
          }
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <CapacityBar items={items} spaces={spaces} capacity={sprint.capacity} />

      <ul className="max-h-80 overflow-y-auto rounded-xl border border-line bg-surface">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2.5 border-t border-line px-3 py-2 first:border-t-0"
          >
            <TypeBadge type={item.type} />
            <IssueKey issueKey={item.key} color={colorOf(item.spaceId)} />
            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
            {item.carriedOver && (
              <span className="rounded border border-warn/60 px-1.5 py-0.5 text-xs whitespace-nowrap text-warn">
                carried over
              </span>
            )}
            <PointsBubble points={item.points} />
            <button
              onClick={() => onRemove(item.key)}
              disabled={busy}
              aria-label={`Remove ${item.key} from the sprint`}
              className="text-ink-faint hover:text-ink disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="p-4 text-sm text-ink-muted">Use + on the left to add issues.</li>
        )}
      </ul>

      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-ink-muted">
          {activeSprint ? `Starts when ${activeSprint.name} is completed` : "Ready when you are"}
        </span>
        <button
          onClick={onStart}
          disabled={busy || !!activeSprint || items.length === 0}
          className={primaryButton}
        >
          Start {sprint.name}
        </button>
      </div>
    </aside>
  );
}
