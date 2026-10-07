// Shared class strings for form controls, so every input, select and button
// in the app has the same height, border and focus ring.

export const labelClass = "mb-1.5 block text-sm font-semibold text-ink-muted";

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-ink outline-none " +
  "placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButton =
  "rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:opacity-90 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "rounded-lg border border-line bg-surface px-4 py-2.5 font-medium text-ink hover:bg-surface-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";
