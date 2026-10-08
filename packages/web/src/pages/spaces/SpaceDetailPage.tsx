import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/errors";
import { useIssues, useSpace } from "../../api/queries";
import { IssueKey, PointsBubble, StatusPill, TypeBadge } from "../../components/IssueBits";
import { secondaryButton } from "../../components/formStyles";
import { Pill } from "../../components/Pill";
import { useCreateDialog } from "../../create/CreateIssueContext";
import { Page } from "../../layout/Page";
import { EpicSection } from "./EpicTree";
import { SpaceActions } from "./SpaceActions";

export function SpaceDetailPage() {
  const { key = "" } = useParams();
  const { data: space, isPending, error } = useSpace(key);
  const { data: issues = [] } = useIssues({ spaceId: space?.id ?? -1 });
  const createDialog = useCreateDialog();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "list" ? "list" : "epics";

  if (isPending) {
    return (
      <Page eyebrow="Spaces" title={key.toUpperCase()}>
        <p className="text-ink-muted">Loading...</p>
      </Page>
    );
  }
  if (error || !space) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page eyebrow="Spaces" title={key.toUpperCase()}>
        <p className="text-ink-muted">
          {notFound
            ? `There is no space ${key.toUpperCase()}.`
            : `Could not load: ${error?.message}`}{" "}
          <Link to="/spaces" className="text-accent underline">
            All spaces
          </Link>
        </p>
      </Page>
    );
  }

  // Build the tree once: epics, the issues under each, and subtasks under those.
  const epics = issues.filter((i) => i.type === "epic");
  const work = issues.filter((i) => i.type !== "epic" && i.type !== "subtask");
  const subtasksOf = (id: number) =>
    issues.filter((i) => i.type === "subtask" && i.parentId === id);
  const loose = work.filter((i) => i.parentId === null);

  const setView = (v: "epics" | "list") =>
    setParams(
      (p) => {
        if (v === "list") p.set("view", "list");
        else p.delete("view");
        return p;
      },
      { replace: true },
    );

  return (
    <Page
      eyebrow={
        <Link to="/spaces" className="hover:underline">
          Spaces
        </Link>
      }
      title={space.name}
    >
      {space.archived && <SpaceActions space={space} />}
      <div className="mb-5 flex items-center gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: space.color }}
        >
          {space.key}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate">{space.description || "No goal set"}</div>
          <div className="text-sm text-ink-muted">
            {space.epicCount} epics · {space.openCount} open issues · {space.doneThisMonth} done
            this month
          </div>
        </div>
        <Pill active={view === "epics"} onClick={() => setView("epics")}>
          Epics
        </Pill>
        <Pill active={view === "list"} onClick={() => setView("list")}>
          List
        </Pill>
        {/* An archived space takes no new issues, so it offers no New epic. */}
        {!space.archived && (
          <button
            onClick={() => createDialog.open({ spaceId: space.id, type: "epic" })}
            className={secondaryButton}
          >
            New epic
          </button>
        )}
        {!space.archived && <SpaceActions space={space} />}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {view === "epics" ? (
          <>
            {epics.map((epic) => (
              <EpicSection
                key={epic.id}
                epic={epic}
                items={work.filter((i) => i.parentId === epic.id)}
                subtasksOf={subtasksOf}
                color={space.color}
              />
            ))}
            {loose.length > 0 && (
              <EpicSection epic={null} items={loose} subtasksOf={subtasksOf} color={space.color} />
            )}
            {epics.length === 0 && loose.length === 0 && (
              <p className="p-6 text-ink-muted">
                Nothing here yet. Start with <b>New epic</b>, or press <kbd>c</kbd> to create an
                issue.
              </p>
            )}
          </>
        ) : (
          <ul>
            {work.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
              >
                <TypeBadge type={i.type} />
                <span className="w-20 shrink-0">
                  <IssueKey issueKey={i.key} color={space.color} />
                </span>
                <Link to={`/issue/${i.key}`} className="min-w-0 flex-1 truncate hover:underline">
                  {i.title}
                </Link>
                <StatusPill status={i.status} />
                <PointsBubble points={i.points} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-sm text-ink-muted">
        Hierarchy: Space › Epic › Story or Task › Subtask. Only stories and tasks carry points;
        subtasks roll up.
      </p>
    </Page>
  );
}
