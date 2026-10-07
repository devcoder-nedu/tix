import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useIssues, useSpaces, useSprints, useUpdateIssue } from "../../api/queries";
import { STATUSES, type Issue, type Status } from "../../api/types";
import { Pill } from "../../components/Pill";
import { SpaceDot } from "../../components/IssueBits";
import { primaryButton, secondaryButton } from "../../components/formStyles";
import { Page } from "../../layout/Page";
import { daysBetween, formatRange, today } from "../../lib/dates";
import { BoardCard, DraggingCard } from "./BoardCard";
import { BoardColumn } from "./BoardColumn";
import { CompleteSprintDialog } from "./CompleteSprintDialog";

const MAX_SPACE_PILLS = 5;

const sumPoints = (issues: Issue[]) => issues.reduce((sum, i) => sum + (i.points ?? 0), 0);

function daysLeftLabel(endDate: string): string {
  const days = daysBetween(today(), endDate);
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "last day";
  return `ended ${-days} ${days === -1 ? "day" : "days"} ago`;
}

/** The bar under the sprint name: done, in review, in progress, then to do. */
function SprintProgress({ issues }: { issues: Issue[] }) {
  const total = sumPoints(issues) || 1; // avoid dividing by zero in an empty sprint
  const segments: [Status, string][] = [
    ["done", "bg-success"],
    ["in_review", "bg-info"],
    ["in_progress", "bg-info/40"],
  ];
  return (
    <div className="flex h-2 w-80 overflow-hidden rounded-full bg-chip">
      {segments.map(([status, color]) => (
        <div
          key={status}
          className={color}
          style={{
            width: `${(sumPoints(issues.filter((i) => i.status === status)) / total) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

export function BoardPage() {
  const { data: sprints = [], isPending: sprintsLoading } = useSprints();
  const sprint = sprints.find((s) => s.state === "active");
  const { data: sprintIssues = [] } = useIssues({ sprintId: sprint?.id ?? -1 });
  const { data: spaces = [] } = useSpaces();
  const update = useUpdateIssue();

  const [params, setParams] = useSearchParams();
  const spaceFilter = params.get("space");
  const [showAllPills, setShowAllPills] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const navigate = useNavigate();

  // A small distance before a drag starts, so a plain click still opens the card.
  // Keyboard: Space picks up and drops (Enter is kept for opening the card).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  if (sprintsLoading) {
    return (
      <Page eyebrow="My sprint" title="Current sprint">
        <p className="text-ink-muted">Loading...</p>
      </Page>
    );
  }
  if (!sprint) {
    return (
      <Page eyebrow="My sprint" title="Current sprint">
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-ink-muted">
          No sprint is running.{" "}
          <Link to="/plan" className="text-accent underline">
            Plan the next one
          </Link>
        </div>
      </Page>
    );
  }

  // Subtasks travel with their story and epics are never in a sprint, so the
  // board shows only story-level issues.
  const issues = sprintIssues.filter((i) => i.type !== "subtask" && i.type !== "epic");
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const epicTitle = new Map(spaces.flatMap((s) => s.epics.map((e) => [e.id, e.title] as const)));
  const sprintSpaces = spaces.filter((s) => issues.some((i) => i.spaceId === s.id));
  const visible = spaceFilter
    ? issues.filter((i) => spaceById.get(i.spaceId)?.key === spaceFilter)
    : issues;
  const pills = showAllPills ? sprintSpaces : sprintSpaces.slice(0, MAX_SPACE_PILLS);
  const hiddenPills = sprintSpaces.length - pills.length;

  const setSpace = (key: string | null) =>
    setParams(
      (p) => {
        if (key) p.set("space", key);
        else p.delete("space");
        return p;
      },
      { replace: true },
    );

  const onDragStart = ({ active }: DragStartEvent) => setDraggingKey(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingKey(null);
    const issue = issues.find((i) => i.key === active.id);
    const status = over?.id as Status | undefined;
    if (!issue || !status || issue.status === status) return;
    // A status change: the API logs it in issue_events and sets completedAt for Done.
    update.mutate({ key: issue.key, patch: { status } });
  };

  const cardProps = (issue: Issue) => ({
    issue,
    spaceColor: spaceById.get(issue.spaceId)?.color ?? "#999",
    epicTitle: issue.parentId ? (epicTitle.get(issue.parentId) ?? null) : null,
  });
  const dragging = issues.find((i) => i.key === draggingKey);
  const donePoints = sumPoints(issues.filter((i) => i.status === "done"));

  return (
    <Page eyebrow="My sprint" title={sprint.name}>
      <div className="mb-4 flex items-start gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-semibold">{sprint.name} · pulls from every space</span>
            <span className="text-sm text-ink-muted">
              {formatRange(sprint.startDate, sprint.endDate)} · {daysLeftLabel(sprint.endDate)}
            </span>
          </div>
          {sprint.goal && <p className="text-sm text-ink-muted">Goal: {sprint.goal}</p>}
          <div className="mt-2 flex items-center gap-3">
            <SprintProgress issues={issues} />
            <span className="text-sm text-ink-muted">
              <b className="text-ink">{donePoints}</b> of {sumPoints(issues)} points done
            </span>
          </div>
        </div>
        <button onClick={() => setCompleting(true)} className={secondaryButton}>
          Complete sprint
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill active={spaceFilter === null} onClick={() => setSpace(null)}>
          All spaces
        </Pill>
        {pills.map((s) => (
          <Pill key={s.id} active={spaceFilter === s.key} onClick={() => setSpace(s.key)}>
            <span className="flex items-center gap-2">
              <SpaceDot color={s.color} />
              {s.name}
            </span>
          </Pill>
        ))}
        {hiddenPills > 0 && (
          <button
            onClick={() => setShowAllPills(true)}
            className="rounded-full border border-dashed border-line px-4 py-1.5 text-sm text-ink-muted hover:text-ink"
          >
            +{hiddenPills} more
          </button>
        )}
      </div>

      {update.error && (
        <p role="alert" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {update.error.message}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin} // the column under the pointer wins
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingKey(null)}
      >
        <div className="grid grid-cols-4 items-start gap-4">
          {STATUSES.map((status) => {
            const column = visible.filter((i) => i.status === status);
            return (
              <BoardColumn
                key={status}
                status={status}
                count={column.length}
                points={sumPoints(column)}
              >
                {column.map((issue) => (
                  <BoardCard key={issue.key} {...cardProps(issue)} />
                ))}
              </BoardColumn>
            );
          })}
        </div>
        {/* Renders above everything, so the dragged card is never clipped by its column. */}
        <DragOverlay>{dragging && <DraggingCard {...cardProps(dragging)} />}</DragOverlay>
      </DndContext>

      {issues.length === 0 && (
        <p className="mt-4 text-center text-ink-muted">
          This sprint is empty.{" "}
          <Link to="/plan" className={`${primaryButton} ml-2 inline-block`}>
            Add issues
          </Link>
        </p>
      )}
      {completing && (
        <CompleteSprintDialog
          sprint={sprint}
          onClose={() => setCompleting(false)}
          // Next step after completing is planning: go straight there.
          onCompleted={() => navigate("/plan")}
        />
      )}
    </Page>
  );
}
