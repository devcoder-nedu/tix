import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useArchiveSpace, useDeleteSpace, useRestoreSpace } from "../../api/queries";
import type { SpaceSummary } from "../../api/types";
import { secondaryButton } from "../../components/formStyles";

/** Archive or delete an active space; restore an archived one. */
export function SpaceActions({ space }: { space: SpaceSummary }) {
  const navigate = useNavigate();
  const archive = useArchiveSpace();
  const restore = useRestoreSpace();
  const remove = useDeleteSpace();
  const error = archive.error ?? restore.error ?? remove.error;
  // Same rule as the server: only a space that never handed out a key can go for good.
  const canDelete = space.nextNumber === 1;

  const onArchive = () => {
    if (
      !window.confirm(
        `Archive ${space.name}? It leaves the sidebar and pickers; its issues and history stay, and you can restore it any time.`,
      )
    )
      return;
    archive.mutate(space.key, { onSuccess: () => navigate("/spaces") });
  };
  const onDelete = () => {
    if (
      !window.confirm(
        `Delete ${space.name} (${space.key}) for good? It has never had issues, so nothing else is lost.`,
      )
    )
      return;
    remove.mutate(space.key, { onSuccess: () => navigate("/spaces", { replace: true }) });
  };

  if (space.archived) {
    return (
      <div className="mb-5 flex items-center gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Archive size={18} className="text-ink-muted" />
        <p className="flex-1">
          <b>This space is archived.</b>{" "}
          <span className="text-ink-muted">
            It is hidden from the sidebar and pickers; nothing was deleted.
          </span>
        </p>
        <button
          onClick={() => restore.mutate(space.key)}
          disabled={restore.isPending}
          className={`${secondaryButton} flex items-center gap-2`}
        >
          <ArchiveRestore size={16} /> Restore
        </button>
        {error && <p className="text-sm text-danger">{error.message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={onArchive}
          disabled={archive.isPending}
          className={`${secondaryButton} flex items-center gap-2`}
          title="Hide this space; keeps its issues and history"
        >
          <Archive size={16} /> Archive
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            disabled={remove.isPending}
            className="flex items-center gap-2 rounded-lg border border-danger/50 px-4 py-2.5 font-medium text-danger hover:bg-danger/10"
            title="Only possible because this space has never had issues"
          >
            <Trash2 size={16} /> Delete
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-md text-right text-sm text-warn">
          {error.message}
        </p>
      )}
    </div>
  );
}
