// Every screen renders <Page>: the top bar (breadcrumb, title, search, theme,
// Create) plus a scrolling content area. Keeping the title here, instead of in
// a global header, lets each page show data-driven titles like "FR-4".

import { Moon, Plus, Search, Sun } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useCreateDialog } from "../create/CreateIssueContext";
import { useShortcut } from "../lib/useShortcut";
import { useTheme } from "../theme/ThemeProvider";

interface PageProps {
  eyebrow: ReactNode; // small line above the title: "Work", "French / Reach B1"
  title: ReactNode;
  children: ReactNode;
}

export function Page({ eyebrow, title, children }: PageProps) {
  const { theme, toggle } = useTheme();
  const createDialog = useCreateDialog();
  const searchRef = useRef<HTMLInputElement>(null);
  useShortcut("/", () => searchRef.current?.focus());

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-8 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ink-muted">{eyebrow}</div>
          <h1 className="truncate text-xl font-semibold">{title}</h1>
        </div>

        <label className="flex w-64 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-ink-muted focus-within:border-accent">
          <Search size={16} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search all spaces"
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-xs">/</kbd>
        </label>

        <button
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-2"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          onClick={() => createDialog.open()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink hover:opacity-90"
        >
          <Plus size={18} /> Create
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-5">{children}</main>
    </div>
  );
}
