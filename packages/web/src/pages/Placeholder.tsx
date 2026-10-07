import type { ReactNode } from "react";
import { Link } from "react-router";
import { Page } from "../layout/Page";

// Temporary screens: each one is replaced by the real screen in its build step.
function Placeholder({
  eyebrow,
  title,
  step,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  step: string;
}) {
  return (
    <Page eyebrow={eyebrow} title={title}>
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-ink-muted">
        This screen is built in the <span className="font-medium text-ink">{step}</span> step.
      </div>
    </Page>
  );
}

export const PastSprintsPage = () => (
  <Placeholder eyebrow="My sprint" title="Past sprints" step="Past sprints" />
);
export const InsightsSettingsPage = () => (
  <Placeholder eyebrow="Settings" title="Insights" step="Local AI insights" />
);

export function NotFoundPage() {
  return (
    <Page eyebrow="Tix" title="Page not found">
      <p className="text-ink-muted">
        Nothing lives at this address.{" "}
        <Link to="/" className="text-accent underline">
          Go to the current sprint
        </Link>
      </p>
    </Page>
  );
}
