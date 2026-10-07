import type { ReactNode } from "react";
import { STATUS_LABEL, type IssueEvent, type Sprint, type Status } from "../../api/types";
import { formatTimestamp } from "../../lib/dates";

interface Props {
  events: IssueEvent[];
  sprints: Sprint[];
  spaceName: string;
}

/** Turn one issue_events row into a readable line. */
function describe(e: IssueEvent, sprints: Sprint[], spaceName: string): ReactNode {
  const sprintName = (id: string | null) =>
    sprints.find((s) => String(s.id) === id)?.name ?? "a sprint";

  switch (e.kind) {
    case "created":
      return (
        <>
          Created in <b>{spaceName}</b> {e.toValue}
        </>
      );
    case "status":
      return (
        <>
          Moved to <b>{STATUS_LABEL[e.toValue as Status] ?? e.toValue}</b>
        </>
      );
    case "sprint":
      return e.toValue === null ? (
        <>
          Moved to <b>Backlog</b>
        </>
      ) : (
        <>
          Added to <b>{sprintName(e.toValue)}</b>
        </>
      );
    case "points":
      return e.toValue === null ? (
        "Estimate cleared"
      ) : (
        <>
          Points set to <b>{e.toValue}</b>
        </>
      );
    case "space":
      return (
        <>
          Moved from <b>{e.fromValue}</b> to <b>{e.toValue}</b>
        </>
      );
    default:
      return `Updated ${e.toValue ?? ""}`;
  }
}

export function ActivityLog({ events, sprints, spaceName }: Props) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-sm font-semibold text-ink-muted">Activity</h3>
      <ul className="space-y-1.5 text-sm text-ink-muted">
        {events.map((e) => (
          <li key={e.id}>
            {formatTimestamp(e.at)} · {describe(e, sprints, spaceName)}
            {e.actor === "claude" && <span className="ml-1 text-ink-faint">(Claude)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
