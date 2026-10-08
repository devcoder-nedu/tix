import { Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useArchivedSpaces, useRestoreSpace, useSpaces } from "../../api/queries";
import type { SpaceSummary } from "../../api/types";
import { SpaceDot } from "../../components/IssueBits";
import { Pill } from "../../components/Pill";
import { Page } from "../../layout/Page";
import { NewSpaceDialog } from "./NewSpaceDialog";

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-chip"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-sm leading-tight text-ink-muted">
      <div className="font-semibold text-ink">{value}</div>
      {label}
    </div>
  );
}

const MAX_EPIC_CHIPS = 3;

function SpaceCard({ space }: { space: SpaceSummary }) {
  const shown = space.epics.slice(0, MAX_EPIC_CHIPS);
  const hidden = space.epics.length - shown.length;
  return (
    <Link
      to={`/spaces/${space.key}`}
      className="flex flex-col gap-4 rounded-xl border border-t-4 border-line bg-surface p-5 hover:shadow-md"
      style={{ borderTopColor: space.color }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-lg font-semibold">{space.name}</span>
        <span className="font-mono text-sm text-ink-muted">{space.key}</span>
      </div>
      <div className="flex gap-6">
        <Stat value={space.epicCount} label="epics" />
        <Stat value={space.openCount} label="open" />
        <Stat value={space.doneThisMonth} label="done this month" />
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar percent={space.percentDone} color={space.color} />
        <span className="text-sm text-ink-muted">{space.percentDone}% done</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <span key={e.id} className="rounded bg-chip px-2 py-0.5 text-sm">
            {e.title}
          </span>
        ))}
        {hidden > 0 && <span className="rounded bg-chip px-2 py-0.5 text-sm">+{hidden}</span>}
      </div>
    </Link>
  );
}

function SpaceListRow({ space }: { space: SpaceSummary }) {
  return (
    <Link
      to={`/spaces/${space.key}`}
      className="flex items-center gap-4 border-t border-line px-4 py-3 first:border-t-0 hover:bg-surface-2"
    >
      <SpaceDot color={space.color} className="size-2.5" />
      <span className="w-48 truncate font-semibold">{space.name}</span>
      <span className="w-16 font-mono text-sm text-ink-muted">{space.key}</span>
      <span className="w-24 text-sm text-ink-muted">{space.epicCount} epics</span>
      <span className="w-24 text-sm text-ink-muted">{space.openCount} open</span>
      <ProgressBar percent={space.percentDone} color={space.color} />
      <span className="w-20 text-right text-sm text-ink-muted">{space.percentDone}% done</span>
    </Link>
  );
}

/** Archived spaces, folded away at the bottom; each can be opened or restored. */
function ArchivedSpaces() {
  const { data: archived = [] } = useArchivedSpaces();
  const restore = useRestoreSpace();
  if (archived.length === 0) return null;
  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm font-semibold text-ink-muted hover:text-ink">
        Archived spaces ({archived.length})
      </summary>
      <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {archived.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-4 border-t border-line px-4 py-3 first:border-t-0"
          >
            <SpaceDot color={s.color} className="size-2.5" />
            <Link to={`/spaces/${s.key}`} className="flex-1 truncate hover:underline">
              {s.name} <span className="font-mono text-sm text-ink-muted">{s.key}</span>
            </Link>
            <button
              onClick={() => restore.mutate(s.key)}
              disabled={restore.isPending}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
      {restore.error && <p className="mt-2 text-sm text-danger">{restore.error.message}</p>}
    </details>
  );
}

export function SpacesPage() {
  const { data: spaces = [], isPending } = useSpaces();
  const navigate = useNavigate();
  // View and the New space dialog live in the URL, so the sidebar's
  // "New space" link (/spaces?new) can open the dialog from anywhere.
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "list" ? "list" : "grid";
  const creating = params.has("new");

  const update = (change: (p: URLSearchParams) => void) =>
    setParams(
      (p) => {
        change(p);
        return p;
      },
      { replace: true },
    );

  const openCount = spaces.reduce((sum, s) => sum + s.openCount, 0);

  return (
    <Page eyebrow="Work" title="All spaces">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-ink-muted">
          {spaces.length} spaces · {openCount} open issues · spaces hold the work, your sprint lives
          on its own
        </p>
        <div className="flex gap-2">
          <Pill active={view === "grid"} onClick={() => update((p) => p.delete("view"))}>
            Grid
          </Pill>
          <Pill active={view === "list"} onClick={() => update((p) => p.set("view", "list"))}>
            List
          </Pill>
        </div>
      </div>

      {isPending ? (
        <p className="text-ink-muted">Loading...</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
          {spaces.map((s) => (
            <SpaceCard key={s.id} space={s} />
          ))}
          <button
            onClick={() => update((p) => p.set("new", ""))}
            className="flex min-h-48 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-ink-muted hover:border-ink-faint hover:text-ink"
          >
            <Plus size={20} />
            <span className="font-semibold text-ink">New space</span>
            <span className="text-sm">Pick a name, key and colour</span>
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {spaces.map((s) => (
            <SpaceListRow key={s.id} space={s} />
          ))}
          <button
            onClick={() => update((p) => p.set("new", ""))}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Plus size={16} /> New space
          </button>
        </div>
      )}

      <ArchivedSpaces />

      {creating && (
        <NewSpaceDialog
          onClose={() => update((p) => p.delete("new"))}
          onCreated={(space) => navigate(`/spaces/${space.key}`)}
        />
      )}
    </Page>
  );
}
