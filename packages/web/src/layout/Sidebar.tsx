import {
  CalendarDays,
  ChartColumn,
  Columns3,
  LayoutGrid,
  List,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useOllamaStatus, useSettings, useSpaces } from "../api/queries";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium ${
    isActive ? "bg-nav-active text-ink" : "text-ink hover:bg-nav-active/60"
  }`;

function NavItem({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    // "end" on "/" so Current sprint is not highlighted on every page.
    <NavLink to={to} end={to === "/"} className={navClass}>
      <Icon size={18} strokeWidth={1.75} />
      {children}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 mb-2 px-3 text-xs font-semibold tracking-wider text-ink-muted uppercase">
      {children}
    </div>
  );
}

export function Sidebar() {
  const { data: spaces } = useSpaces();
  const { data: settings } = useSettings();
  const { data: ollama } = useOllamaStatus(settings?.ollamaUrl);
  // Ready means Ollama answers AND has the chosen model; running without it is not enough.
  const aiReady = !!ollama?.running && !!settings && ollama.models.includes(settings.ollamaModel);
  const aiLabel = aiReady
    ? "Local AI ready"
    : ollama?.running
      ? "Model not pulled"
      : "Local AI off";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar px-4 py-5">
      <Link to="/" className="flex items-center gap-3 px-1">
        <span className="flex size-9 items-center justify-center rounded-lg bg-ink font-mono text-sm font-semibold text-canvas">
          tx
        </span>
        <span>
          <span className="block leading-tight font-semibold">Tix</span>
          <span className="block text-sm leading-tight text-ink-muted">Everything I'm doing</span>
        </span>
      </Link>

      <nav className="mt-2 flex-1 overflow-y-auto">
        <SectionLabel>My sprint</SectionLabel>
        <NavItem to="/" icon={Columns3}>
          Current sprint
        </NavItem>
        <NavItem to="/plan" icon={CalendarDays}>
          Plan next sprint
        </NavItem>
        <NavItem to="/sprints" icon={ChartColumn}>
          Past sprints
        </NavItem>

        <SectionLabel>Work</SectionLabel>
        <NavItem to="/backlog" icon={List}>
          Backlog
        </NavItem>
        <NavItem to="/spaces" icon={LayoutGrid}>
          All spaces
        </NavItem>

        <SectionLabel>Spaces</SectionLabel>
        {spaces?.map((space) => (
          <NavLink key={space.id} to={`/spaces/${space.key}`} className={navClass}>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: space.color }} />
            <span className="flex-1 truncate">{space.name}</span>
            <span className="text-sm font-normal text-ink-muted">{space.openCount}</span>
          </NavLink>
        ))}
        <Link
          to="/spaces?new"
          className="flex items-center gap-3 px-3 py-2 text-[15px] text-ink-muted hover:text-ink"
        >
          <Plus size={18} strokeWidth={1.75} />
          New space
        </Link>
      </nav>

      {/* Live Ollama status; the assistant connection arrives with the MCP server. */}
      <Link
        to="/settings/ai"
        className="mt-4 block space-y-1 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-ink-muted hover:border-ink-faint"
      >
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${aiReady ? "bg-success" : "bg-ink-faint"}`} />{" "}
          {aiLabel}
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-ink-faint" /> Claude not connected
        </div>
      </Link>
    </aside>
  );
}
