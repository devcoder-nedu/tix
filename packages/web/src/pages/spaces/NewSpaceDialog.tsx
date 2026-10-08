import { Check, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useArchivedSpaces, useCreateSpace, useSpaces } from "../../api/queries";
import type { Space } from "../../api/types";
import {
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../components/formStyles";

// Colours that read well on both themes, distinct from the seeded spaces.
const COLORS = [
  "#3b74d6",
  "#2a9d68",
  "#8b5cd6",
  "#e08a1e",
  "#d6466f",
  "#1aa3a3",
  "#b8952a",
  "#64748b",
  "#c2410c",
  "#0e7490",
];

/** "Personal admin" -> "PA", "French" -> "FREN": a sensible first guess the user can change. */
function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length >= 2)
    return words
      .map((w) => w[0])
      .join("")
      .slice(0, 6);
  return (words[0] ?? "").slice(0, 4);
}

interface Props {
  onClose: () => void;
  onCreated: (space: Space) => void;
}

export function NewSpaceDialog({ onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  // null = "not typed by the user": keep following the name. Once the user
  // types a key, stop overwriting it.
  const [customKey, setCustomKey] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [description, setDescription] = useState("");
  const create = useCreateSpace();

  const key = customKey ?? suggestKey(name);

  // Tell the user while they type, rather than after they press Create.
  // The server checks again, so this is a convenience, not the rule itself.
  const { data: active = [] } = useSpaces();
  const { data: archived = [] } = useArchivedSpaces();
  const twin = [...active, ...archived].find(
    (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const keyTaken = [...active, ...archived].find((s) => s.key === key);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name, key, color, description }, { onSuccess: onCreated });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="new-space-title"
      className="m-auto w-full max-w-lg rounded-2xl border border-line bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="space-y-4 p-7">
        <div className="flex items-center justify-between">
          <h2 id="new-space-title" className="text-xl font-semibold">
            New space
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <label>
            <span className={labelClass}>Name</span>
            <input
              autoFocus
              required
              className={inputClass}
              value={name}
              placeholder="Spanish"
              aria-invalid={!!twin}
              aria-describedby={twin ? "name-taken" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Key</span>
            <input
              required
              className={`${inputClass} font-mono uppercase`}
              value={key}
              maxLength={10}
              pattern="[A-Za-z][A-Za-z0-9]{1,9}"
              title="2 to 10 letters or digits, starting with a letter"
              onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        {(twin || keyTaken) && (
          <p id="name-taken" role="alert" className="-mt-2 text-sm text-warn">
            {twin
              ? `${twin.archived ? "An archived space" : "A space"} is already named ${twin.name} (${twin.key})${twin.archived ? "; restore it from All spaces instead" : ""}.`
              : `The key ${key} is already used by ${keyTaken!.name}.`}
          </p>
        )}
        <p className="-mt-2 text-sm text-ink-muted">
          Issues will be numbered {key || "KEY"}-1, {key || "KEY"}-2... The key cannot change later.
        </p>

        <fieldset>
          <legend className={labelClass}>Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                className="flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-canvas aria-pressed:ring-2 aria-pressed:ring-ink"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={labelClass}>Goal or description</span>
          <input
            className={inputClass}
            value={description}
            placeholder="Goal: reach A2 by summer"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {create.error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {create.error.message}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !!twin || !!keyTaken}
            className={primaryButton}
          >
            {create.isPending ? "Creating..." : "Create space"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
