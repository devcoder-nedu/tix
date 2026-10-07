// Lets any part of the app (top bar button, "c" shortcut, later "Add subtask")
// open the one Create issue dialog, without passing callbacks through every layer.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Issue } from "../api/types";
import { useShortcut } from "../lib/useShortcut";
import { CreateIssueDialog, type CreateDefaults } from "./CreateIssueDialog";

interface CreateIssueContextValue {
  open: (defaults?: CreateDefaults) => void;
}

const CreateIssueContext = createContext<CreateIssueContextValue | null>(null);

export function CreateIssueProvider({ children }: { children: ReactNode }) {
  // `id` changes on every open, and is used as the dialog's React key, so each
  // open starts with a fresh, empty form instead of the last one's leftovers.
  const [dialog, setDialog] = useState<{ id: number; defaults: CreateDefaults } | null>(null);
  const [lastSpaceId, setLastSpaceId] = useState<number>();
  const [created, setCreated] = useState<Issue | null>(null);

  const open = (defaults: CreateDefaults = {}) => setDialog({ id: Date.now(), defaults });
  useShortcut("c", () => {
    if (!dialog) open();
  });

  // Hide the "Created" toast after a few seconds.
  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => setCreated(null), 5000);
    return () => clearTimeout(timer);
  }, [created]);

  return (
    <CreateIssueContext value={{ open }}>
      {children}
      {dialog && (
        <CreateIssueDialog
          key={dialog.id}
          // Remember the last space used: creating several items for one space is common.
          defaults={{ spaceId: lastSpaceId, ...dialog.defaults }}
          onClose={() => setDialog(null)}
          onCreated={(issue) => {
            setLastSpaceId(issue.spaceId);
            setCreated(issue);
          }}
        />
      )}
      {created && (
        <div
          role="status"
          className="fixed right-6 bottom-6 z-40 flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg"
        >
          <span>
            Created <span className="font-mono font-semibold">{created.key}</span>
          </span>
          <Link
            to={`/issue/${created.key}`}
            onClick={() => setCreated(null)}
            className="font-semibold text-accent hover:underline"
          >
            Open
          </Link>
        </div>
      )}
    </CreateIssueContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export function useCreateDialog() {
  const value = useContext(CreateIssueContext);
  if (!value) throw new Error("useCreateDialog must be used inside <CreateIssueProvider>");
  return value;
}
