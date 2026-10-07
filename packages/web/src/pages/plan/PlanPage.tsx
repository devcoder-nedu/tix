import { useNavigate } from "react-router";
import {
  useAddToSprint,
  useBacklog,
  useCreateSprint,
  useRemoveFromSprint,
  useSettings,
  useSpaces,
  useSprintItems,
  useSprints,
  useStartSprint,
  useUpdateSprint,
  useVelocity,
} from "../../api/queries";
import { primaryButton } from "../../components/formStyles";
import { Page } from "../../layout/Page";
import { addDays, today } from "../../lib/dates";
import { PoolList } from "./PoolList";
import { SprintPanel } from "./SprintPanel";

export function PlanPage() {
  const navigate = useNavigate();
  const { data: sprints = [] } = useSprints();
  const { data: backlog = [] } = useBacklog();
  const { data: spaces = [] } = useSpaces();
  const { data: velocity } = useVelocity();
  const { data: settings } = useSettings();

  const planned = sprints.find((s) => s.state === "planned");
  const active = sprints.find((s) => s.state === "active");
  const { data: sprintItems = [] } = useSprintItems(planned?.id);

  const create = useCreateSprint();
  const update = useUpdateSprint();
  const add = useAddToSprint();
  const remove = useRemoveFromSprint();
  const start = useStartSprint();
  const busy = add.isPending || remove.isPending || start.isPending;
  const error = create.error ?? update.error ?? add.error ?? remove.error ?? start.error;

  const createNext = () => {
    // Sensible defaults: the day after the running sprint ends, 2 weeks,
    // capacity from velocity (or the settings default before there is any).
    create.mutate({
      goal: "",
      lengthWeeks: 2,
      startDate: active ? addDays(active.endDate, 1) : today(),
      capacity: velocity?.average ?? settings?.capacityDefault ?? 20,
    });
  };

  return (
    <Page eyebrow="My sprint" title="Plan next sprint">
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {error.message}
        </p>
      )}
      <div className="flex items-start gap-6">
        <PoolList
          items={backlog}
          spaces={spaces}
          adding={busy}
          canAdd={!!planned}
          onAdd={(key) => planned && add.mutate({ sprintId: planned.id, keys: [key] })}
        />

        {planned ? (
          <SprintPanel
            sprint={planned}
            items={sprintItems}
            spaces={spaces}
            velocity={velocity}
            activeSprint={active}
            busy={busy}
            onUpdate={(patch) => update.mutate({ id: planned.id, patch })}
            onRemove={(key) => remove.mutate({ sprintId: planned.id, keys: [key] })}
            onStart={() => start.mutate(planned.id, { onSuccess: () => navigate("/") })}
          />
        ) : (
          <aside className="flex w-[26rem] shrink-0 flex-col items-start gap-3 rounded-2xl border border-dashed border-line p-6">
            <h2 className="text-xl font-semibold">No sprint planned</h2>
            <p className="text-ink-muted">
              Create the next sprint, then add issues from any space with the + buttons.
            </p>
            <button onClick={createNext} disabled={create.isPending} className={primaryButton}>
              Create the next sprint
            </button>
          </aside>
        )}
      </div>
    </Page>
  );
}
