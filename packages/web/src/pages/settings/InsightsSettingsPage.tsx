import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useOllamaStatus, useSettings, useUpdateSettings } from "../../api/queries";
import type { Settings } from "../../api/types";
import {
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../components/formStyles";
import { Page } from "../../layout/Page";

// The design doc's default and fallback, with what each is good for.
const RECOMMENDED = [
  { name: "qwen2.5:14b", note: "9 GB, best write ups" },
  { name: "llama3.1:8b", note: "5 GB, faster on smaller Macs" },
];

type Toggle =
  "insightSprintReview" | "insightCheckIn" | "insightPlanningHint" | "insightPatternReport";

const TOGGLES: { key: Toggle; title: string; detail: string }[] = [
  {
    key: "insightSprintReview",
    title: "Sprint review on complete",
    detail: "Write the review as soon as a sprint is completed",
  },
  {
    key: "insightCheckIn",
    title: "Mid sprint check in",
    detail: "Show the at risk banner on the board from day 4",
  },
  {
    key: "insightPlanningHint",
    title: "Planning hints",
    detail: "Suggest capacity and picks on Plan next sprint",
  },
  {
    key: "insightPatternReport",
    title: "Pattern report every 3 sprints",
    detail: "Which spaces slip, estimate accuracy, trends",
  },
];

/** An on/off switch: a button with role="switch", so screen readers announce "on" or "off". */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-chip"}`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

export function InsightsSettingsPage() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const save = useUpdateSettings();

  // A draft: edits stay local until Save, and Close throws them away.
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const current = settings ? { ...settings, ...draft } : undefined;
  const status = useOllamaStatus(current?.ollamaUrl);

  if (!current) {
    return (
      <Page eyebrow="Settings" title="Insights">
        <p className="text-ink-muted">Loading...</p>
      </Page>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const dirty = Object.keys(draft).length > 0;
  const running = status.data?.running ?? false;
  // Offer what Ollama has pulled, plus the recommended models, plus the saved one.
  const modelNames = [
    ...new Set([
      ...(status.data?.models ?? []),
      ...RECOMMENDED.map((m) => m.name),
      current.ollamaModel,
    ]),
  ];
  const noteOf = (name: string) => RECOMMENDED.find((m) => m.name === name)?.note;
  const installed = (name: string) => status.data?.models.includes(name);

  return (
    <Page eyebrow="Settings" title="Insights">
      <div className="max-w-2xl space-y-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles size={22} className="text-accent" /> Insights settings
        </h2>

        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
          <span
            className={`size-3 shrink-0 rounded-full ${status.isFetching ? "animate-pulse bg-ink-faint" : running ? "bg-success" : "bg-ink-faint"}`}
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {status.isFetching
                ? "Checking..."
                : running
                  ? "Ollama is running"
                  : "Ollama is not running"}
            </div>
            <input
              aria-label="Ollama address"
              value={current.ollamaUrl}
              onChange={(e) => set("ollamaUrl", e.target.value)}
              className="w-full bg-transparent font-mono text-sm text-ink-muted outline-none focus:text-ink"
            />
          </div>
          {/* refetch() ignores the cache: Test always asks Ollama again. */}
          <button type="button" onClick={() => status.refetch()} className={secondaryButton}>
            Test
          </button>
        </div>
        {!running && !status.isFetching && (
          <p className="-mt-3 text-sm text-ink-muted">
            Install it with <code className="font-mono">brew install ollama</code>, start it, then
            pull a model with <code className="font-mono">ollama pull {current.ollamaModel}</code>.
          </p>
        )}

        <label className="block">
          <span className={labelClass}>Model</span>
          <select
            className={inputClass}
            value={current.ollamaModel}
            onChange={(e) => set("ollamaModel", e.target.value)}
          >
            {modelNames.map((name) => (
              <option key={name} value={name}>
                {name}
                {noteOf(name) ? ` (${noteOf(name)})` : ""}
                {running && !installed(name) ? " · not pulled yet" : ""}
              </option>
            ))}
          </select>
        </label>

        <ul className="divide-y divide-line border-y border-line">
          {TOGGLES.map((t) => (
            <li key={t.key} className="flex items-center gap-4 py-4">
              <div className="flex-1">
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm text-ink-muted">{t.detail}</div>
              </div>
              <Switch checked={current[t.key]} onChange={(v) => set(t.key, v)} label={t.title} />
            </li>
          ))}
        </ul>

        <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-muted">
          Everything runs on this Mac. Numbers are calculated by Tix; the model only writes the
          words. If Ollama is off, Tix works normally without insights.
        </p>

        {save.error && <p className="text-sm text-danger">{save.error.message}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className={secondaryButton}>
            Close
          </button>
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft, { onSuccess: () => setDraft({}) })}
            className={primaryButton}
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Page>
  );
}
