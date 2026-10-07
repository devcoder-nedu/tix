// Text that shows as plain text and turns into an input when clicked, like
// Jira's title and description. Enter (Cmd+Enter when multiline) or clicking
// away saves; Escape cancels.

import { useState, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  required?: boolean; // an empty value is rejected (the title) instead of saved
  placeholder?: string;
  className?: string; // typography, shared by the text and the input
  label: string; // for screen readers, since there is no visible <label>
}

export function EditableText({
  value,
  onSave,
  multiline = false,
  required = false,
  placeholder = "Add text",
  className = "",
  label,
}: Props) {
  // `draft` is only used while editing; the rest of the time `value` is shown,
  // so the text always reflects the latest saved data.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const finish = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === value.trim() || (required && !next)) return; // unchanged or invalid: no save
    onSave(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(null); // cancel: throw the draft away
    }
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      finish();
    }
  };

  const fieldClass = `w-full rounded-lg border border-accent bg-surface px-2 py-1 -mx-2 -my-1 outline-none ring-2 ring-accent/20 ${className}`;

  if (editing) {
    return multiline ? (
      <textarea
        autoFocus
        aria-label={label}
        className={`${fieldClass} min-h-28 resize-y`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
      />
    ) : (
      <input
        autoFocus
        aria-label={label}
        className={fieldClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setDraft(value)}
      className={`-mx-2 -my-1 block w-full rounded-lg px-2 py-1 text-left whitespace-pre-wrap hover:bg-surface-2 ${className} ${
        value ? "" : "text-ink-faint"
      }`}
    >
      {value || placeholder}
    </button>
  );
}
