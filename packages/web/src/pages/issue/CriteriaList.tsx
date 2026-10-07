import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Criterion } from "../../api/types";

interface Props {
  criteria: Criterion[];
  onChange: (criteria: Criterion[]) => void;
}

/** The acceptance criteria checklist. Every change sends the whole new list. */
export function CriteriaList({ criteria, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const done = criteria.filter((c) => c.done).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onChange([...criteria, { text, done: false }]);
    setDraft("");
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink-muted">
        Acceptance criteria · {done} of {criteria.length}
      </h3>
      <ul className="space-y-1">
        {criteria.map((c, index) => (
          // Criteria have no ids, so the position is the key. Fine here: the list
          // is short and items are only appended or removed, never reordered.
          <li key={index} className="group flex items-start gap-3 rounded-lg px-1 py-1">
            <input
              type="checkbox"
              checked={c.done}
              aria-label={c.text}
              className="mt-1 size-4 shrink-0 accent-success"
              onChange={() =>
                onChange(criteria.map((x, i) => (i === index ? { ...x, done: !x.done } : x)))
              }
            />
            <span className={`flex-1 ${c.done ? "text-ink-muted" : ""}`}>{c.text}</span>
            <button
              onClick={() => onChange(criteria.filter((_, i) => i !== index))}
              aria-label={`Remove "${c.text}"`}
              className="text-ink-faint opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-1 flex items-center gap-3 px-1">
        <Plus size={16} className="shrink-0 text-ink-faint" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a criterion and press Enter"
          className="flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-faint"
        />
      </form>
    </section>
  );
}
