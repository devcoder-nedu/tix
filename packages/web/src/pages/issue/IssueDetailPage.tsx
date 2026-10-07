import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/errors";
import {
  useDeleteIssue,
  useEvents,
  useIssue,
  useIssues,
  useSpaces,
  useSprints,
  useMoveIssueToSpace,
  useUpdateIssue,
} from "../../api/queries";
import type { IssuePatch } from "../../api/types";
import { EditableText } from "../../components/EditableText";
import { EpicChip, IssueKey, TypeBadge, ViaClaudeTag } from "../../components/IssueBits";
import { secondaryButton } from "../../components/formStyles";
import { useCreateDialog } from "../../create/CreateIssueContext";
import { Page } from "../../layout/Page";
import { ActivityLog } from "./ActivityLog";
import { ChildIssues } from "./ChildIssues";
import { CriteriaList } from "./CriteriaList";
import { FieldsPanel } from "./FieldsPanel";

export function IssueDetailPage() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const createDialog = useCreateDialog();

  const { data: issue, isPending, error } = useIssue(key);
  const { data: spaces = [] } = useSpaces();
  const { data: sprints = [] } = useSprints();
  // These wait for the issue: until it loads there is no id or space to ask about.
  const { data: spaceIssues = [] } = useIssues({ spaceId: issue?.spaceId ?? -1 });
  const { data: events = [] } = useEvents(issue?.id);
  const update = useUpdateIssue();
  const move = useMoveIssueToSpace();
  const remove = useDeleteIssue();

  if (isPending) {
    return (
      <Page eyebrow="Issue" title={key.toUpperCase()}>
        <p className="text-ink-muted">Loading...</p>
      </Page>
    );
  }
  if (error || !issue) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page eyebrow="Issue" title={key.toUpperCase()}>
        <p className="text-ink-muted">
          {notFound
            ? `There is no issue ${key.toUpperCase()}.`
            : `Could not load: ${error?.message}`}{" "}
          <Link to="/backlog" className="text-accent underline">
            Back to the backlog
          </Link>
        </p>
      </Page>
    );
  }
  // An old key (kept as an alias after a move) redirects to the current one.
  if (issue.key !== key.toUpperCase()) return <Navigate to={`/issue/${issue.key}`} replace />;

  const space = spaces.find((s) => s.id === issue.spaceId);
  const parent = spaceIssues.find((i) => i.id === issue.parentId);
  const children = spaceIssues.filter((i) => i.parentId === issue.id);
  const parentOptions = spaceIssues.filter((i) => {
    if (issue.type === "subtask") return ["story", "task", "bug", "spike"].includes(i.type);
    return i.type === "epic" && (i.status !== "done" || i.id === issue.parentId);
  });
  const color = space?.color ?? "#999";

  const patch = (changes: IssuePatch) => update.mutate({ key: issue.key, patch: changes });

  const onMoveSpace = (spaceId: number) => {
    const target = spaces.find((s) => s.id === spaceId);
    if (!target) return;
    const ok = window.confirm(
      `Move ${issue.key} to ${target.name}? It gets a new ${target.key} key (the old key keeps working) and leaves its epic.`,
    );
    // Go to the new key straight away so the URL is not left on the alias.
    if (ok) {
      move.mutate(
        { key: issue.key, spaceId },
        { onSuccess: (moved) => navigate(`/issue/${moved.key}`, { replace: true }) },
      );
    }
  };

  const onDelete = () => {
    // A native confirm is enough for v1: the delete is soft and restorable for 30 days.
    if (!window.confirm(`Delete ${issue.key}? It stays restorable for 30 days.`)) return;
    remove.mutate(issue.key, { onSuccess: () => navigate("/backlog") });
  };

  const isEpic = issue.type === "epic";
  const canHaveChildren = issue.type !== "subtask";

  return (
    <Page
      eyebrow={
        <>
          <Link to={`/spaces/${space?.key}`} className="hover:underline">
            {space?.name}
          </Link>
          {parent && (
            <>
              {" / "}
              <Link to={`/issue/${parent.key}`} className="hover:underline">
                {parent.title}
              </Link>
            </>
          )}
        </>
      }
      title={issue.key}
    >
      <div className="flex items-start gap-10">
        <div className="max-w-3xl min-w-0 flex-1 space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-ink-muted">
              <TypeBadge type={issue.type} />
              <IssueKey issueKey={issue.key} color={color} />
              {parent && (
                <>
                  <span>in</span>
                  <Link to={`/issue/${parent.key}`}>
                    <EpicChip title={parent.title} />
                  </Link>
                </>
              )}
              {issue.createdBy === "claude" && <ViaClaudeTag />}
            </div>
            <EditableText
              label="summary"
              value={issue.title}
              required
              onSave={(title) => patch({ title })}
              className="text-3xl font-semibold"
            />
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink-muted">
              {issue.type === "story" ? "User story" : "Description"}
            </h3>
            <EditableText
              label="description"
              multiline
              value={issue.description}
              placeholder={
                issue.type === "story" ? "As a ..., I want ..., so that ..." : "Add a description"
              }
              onSave={(description) => patch({ description })}
              className="text-[17px] leading-relaxed"
            />
          </div>

          {!isEpic && (
            <CriteriaList
              criteria={issue.acceptanceCriteria}
              onChange={(acceptanceCriteria) => patch({ acceptanceCriteria })}
            />
          )}

          {canHaveChildren && (
            <ChildIssues
              title={isEpic ? "Issues in this epic" : "Subtasks"}
              items={children}
              spaceColor={color}
              showPoints={isEpic}
              addLabel={isEpic ? "Add story" : "Add subtask"}
              onAdd={() =>
                createDialog.open({
                  spaceId: issue.spaceId,
                  type: isEpic ? "story" : "subtask",
                  parentId: issue.id,
                })
              }
            />
          )}

          <ActivityLog events={events} sprints={sprints} spaceName={space?.name ?? ""} />
        </div>

        <aside className="sticky top-0 flex w-72 shrink-0 flex-col gap-6">
          <FieldsPanel
            issue={issue}
            spaces={spaces}
            parentOptions={parentOptions}
            sprints={sprints}
            onPatch={patch}
            onMoveSpace={onMoveSpace}
          />

          {(update.error ?? move.error) && (
            <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              {(update.error ?? move.error)?.message}
            </p>
          )}

          <div className="space-y-2">
            {issue.status === "done" ? (
              <button
                onClick={() => patch({ status: "todo" })}
                className={`${secondaryButton} w-full`}
              >
                Reopen
              </button>
            ) : (
              <button
                onClick={() => patch({ status: "done" })}
                className="w-full rounded-lg bg-success px-4 py-3 font-semibold text-white hover:opacity-90 dark:text-canvas"
              >
                Mark as done
              </button>
            )}
            <div className="flex gap-2">
              {issue.sprintId !== null && (
                <button
                  onClick={() => patch({ sprintId: null })}
                  className={`${secondaryButton} flex-1`}
                >
                  Move to backlog
                </button>
              )}
              <button
                onClick={onDelete}
                disabled={remove.isPending}
                className="flex-1 rounded-lg border border-danger/50 px-4 py-2.5 font-medium text-danger hover:bg-danger/10"
              >
                Delete
              </button>
            </div>
            {remove.error && <p className="text-sm text-danger">{remove.error.message}</p>}
          </div>
        </aside>
      </div>
    </Page>
  );
}
