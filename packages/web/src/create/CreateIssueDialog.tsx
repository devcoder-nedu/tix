// The Create issue form from the mockup. Uses the browser's <dialog> element:
// showModal() gives Escape to close, focus kept inside, and the page behind
// made inert, without any extra code or library.

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCreateIssue, useIssues, useSpaces, useSprints } from "../api/queries";
import {
  POINTS,
  PRIORITIES,
  TYPE_LABEL,
  type Issue,
  type IssueType,
  type Points,
  type Priority,
} from "../api/types";
import { SpaceDot } from "../components/IssueBits";
import { inputClass, labelClass, primaryButton, secondaryButton } from "../components/formStyles";

export interface CreateDefaults {
  spaceId?: number;
  type?: IssueType;
  parentId?: number;
}

const TYPES: IssueType[] = ["story", "task", "bug", "spike", "epic", "subtask"];

// Epics and subtasks never carry points and are never planned into a sprint
// directly (a subtask goes wherever its parent goes).
const isContainer = (type: IssueType) => type === "epic" || type === "subtask";

interface Props {
  defaults: CreateDefaults;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}

export function CreateIssueDialog({ defaults, onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    spaceId: defaults.spaceId ?? 0, // 0 = not chosen; falls back to the first space below
    type: defaults.type ?? ("story" as IssueType),
    parentId: defaults.parentId ?? (null as number | null),
    title: "",
    description: "",
    criteria: "",
    points: null as Points | null,
    sprintId: null as number | null,
    priority: "medium" as Priority,
  });
  const [createAnother, setCreateAnother] = useState(false);

  const { data: spaces = [] } = useSpaces();
  const { data: sprints = [] } = useSprints();
  // Derived, not stored: until the user picks a space, use the first one.
  const spaceId = form.spaceId || spaces[0]?.id;
  const space = spaces.find((s) => s.id === spaceId);
  const { data: spaceIssues = [] } = useIssues({ spaceId });
  const create = useCreateIssue();

  useEffect(() => {
    dialogRef.current?.showModal();
    summaryRef.current?.focus();
  }, []);

  // Which issues may be the parent depends on the type (the design doc's hierarchy).
  const parentOptions = spaceIssues.filter((i) => {
    if (i.spaceId !== spaceId || i.status === "done") return false;
    if (form.type === "epic") return false;
    if (form.type === "subtask") return ["story", "task", "bug", "spike"].includes(i.type);
    return i.type === "epic";
  });
  const openSprints = sprints.filter((s) => s.state !== "completed");
  const container = isContainer(form.type);

  // Changing space or type can make other fields invalid, so fix them here,
  // in the event handler, instead of in an effect that runs after a bad render.
  const setSpace = (id: number) => setForm((f) => ({ ...f, spaceId: id, parentId: null }));
  const setType = (type: IssueType) =>
    setForm((f) => ({
      ...f,
      type,
      parentId: null,
      points: isContainer(type) ? null : f.points,
      sprintId: isContainer(type) ? null : f.sprintId,
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault(); // stop the browser's default full-page form submit
    if (!spaceId) return;
    create.mutate(
      {
        spaceId,
        type: form.type,
        parentId: form.parentId,
        title: form.title,
        description: form.description,
        acceptanceCriteria: form.criteria.split("\n"),
        points: form.points,
        sprintId: form.sprintId,
        priority: form.priority,
      },
      {
        onSuccess: (issue) => {
          onCreated(issue);
          if (!createAnother) return onClose();
          // Keep space, type and epic for the next one; clear the text.
          setForm((f) => ({ ...f, title: "", description: "", criteria: "" }));
          summaryRef.current?.focus();
        },
      },
    );
  };

  const nextKey = space ? `${space.key}-${space.nextNumber}` : "";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose} // fired by Escape and by dialog.close()
      onClick={(e) => e.target === e.currentTarget && onClose()} // click on the backdrop
      aria-labelledby="create-title"
      className="m-auto w-full max-w-2xl rounded-2xl border border-line bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="space-y-4 p-7">
        <div className="flex items-center gap-3">
          <h2 id="create-title" className="flex-1 text-xl font-semibold">
            Create issue
          </h2>
          {space && (
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              Will be <SpaceDot color={space.color} />
              <span className="font-mono">{nextKey}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className={labelClass}>Space</span>
            <select
              className={inputClass}
              value={spaceId ?? ""}
              onChange={(e) => setSpace(Number(e.target.value))}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Type</span>
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => setType(e.target.value as IssueType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>{form.type === "subtask" ? "Parent" : "Epic"}</span>
            <select
              className={inputClass}
              value={form.parentId ?? ""}
              disabled={form.type === "epic"}
              required={form.type === "subtask"}
              onChange={(e) =>
                setForm((f) => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))
              }
            >
              <option value="">{form.type === "subtask" ? "Choose a parent" : "None"}</option>
              {parentOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {form.type === "subtask" ? `${i.key} ${i.title}` : i.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>Summary</span>
          <input
            ref={summaryRef}
            className={inputClass}
            value={form.title}
            required
            maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Description</span>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={form.description}
            placeholder="As a ..., I want ..., so that ..."
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>

        {form.type !== "epic" && (
          <label className="block">
            <span className={labelClass}>Acceptance criteria (one per line)</span>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={form.criteria}
              onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
            />
          </label>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className={labelClass}>Story points</span>
            <select
              className={inputClass}
              value={form.points ?? ""}
              disabled={container}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  points: e.target.value ? (Number(e.target.value) as Points) : null,
                }))
              }
            >
              <option value="">Unestimated</option>
              {POINTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Sprint</span>
            <select
              className={inputClass}
              value={form.sprintId ?? ""}
              disabled={container}
              onChange={(e) =>
                setForm((f) => ({ ...f, sprintId: e.target.value ? Number(e.target.value) : null }))
              }
            >
              <option value="">Not planned</option>
              {openSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.state === "active" ? "current" : "next"})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Priority</span>
            <select
              className={`${inputClass} capitalize`}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        {create.error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {create.error.message}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <label className="flex flex-1 items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={createAnother}
              onChange={(e) => setCreateAnother(e.target.checked)}
            />
            Create another
          </label>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={create.isPending || !space} className={primaryButton}>
            {create.isPending ? "Creating..." : `Create ${nextKey}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
