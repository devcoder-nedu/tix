import type { ReactNode } from "react";

/** Rounded toggle button used for filters and view switches (filled when active). */
export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
        active
          ? "border-ink bg-ink text-canvas"
          : "border-line bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
