// TanStack Query hooks: the only way screens read or change data.
// Each query is cached under a key; after a change we "invalidate" the keys it
// affects, and every screen showing that data refetches automatically.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IssueFilter } from "./client";
import type {
  BacklogItem,
  Insight,
  Issue,
  IssuePatch,
  NewIssue,
  RankPosition,
  Settings,
  Rollover,
  Space,
  SprintInput,
} from "./types";

export const queryKeys = {
  spaces: ["spaces"] as const,
  space: (key: string) => ["spaces", key] as const,
  issues: (filter: IssueFilter = {}) => ["issues", filter] as const,
  issue: (key: string) => ["issue", key] as const,
  events: (issueId: number) => ["events", issueId] as const,
  backlog: ["backlog"] as const,
  sprintItems: (sprintId: number) => ["sprintItems", sprintId] as const,
  velocity: ["velocity"] as const,
  sprintSummary: (id: number) => ["sprintSummary", id] as const,
  sprintResults: ["sprintResults"] as const,
  insight: (kind: string, sprintId: number) => ["insight", kind, sprintId] as const,
  sprints: ["sprints"] as const,
  settings: ["settings"] as const,
};

// ---- Reads

export const useSpaces = () => useQuery({ queryKey: queryKeys.spaces, queryFn: api.listSpaces });

export const useSpace = (key: string) =>
  useQuery({ queryKey: queryKeys.space(key), queryFn: () => api.getSpace(key) });

export const useIssues = (filter: IssueFilter = {}) =>
  useQuery({ queryKey: queryKeys.issues(filter), queryFn: () => api.listIssues(filter) });

// Keys are case-insensitive in URLs (/issue/fr-4), so normalise them here: the
// cache entry must match the one useUpdateIssue writes to, which uses "FR-4".
export const useIssue = (key: string) => {
  const upper = key.toUpperCase();
  return useQuery({ queryKey: queryKeys.issue(upper), queryFn: () => api.getIssue(upper) });
};

export const useEvents = (issueId: number | undefined) =>
  useQuery({
    queryKey: queryKeys.events(issueId ?? 0),
    queryFn: () => api.listEvents(issueId!),
    enabled: issueId !== undefined, // wait until the issue has loaded
  });

export const useBacklog = () => useQuery({ queryKey: queryKeys.backlog, queryFn: api.listBacklog });

export const useSprints = () => useQuery({ queryKey: queryKeys.sprints, queryFn: api.listSprints });

export const useSprintItems = (sprintId: number | undefined) =>
  useQuery({
    queryKey: queryKeys.sprintItems(sprintId ?? 0),
    queryFn: () => api.listSprintItems(sprintId!),
    enabled: sprintId !== undefined,
  });

export const useVelocity = () =>
  useQuery({ queryKey: queryKeys.velocity, queryFn: api.getVelocity });

export const useSprintSummary = (id: number) =>
  useQuery({ queryKey: queryKeys.sprintSummary(id), queryFn: () => api.getSprintSummary(id) });

export const useSprintResults = () =>
  useQuery({ queryKey: queryKeys.sprintResults, queryFn: api.listSprintResults });

export const useInsight = (kind: Insight["kind"], sprintId: number) =>
  useQuery({
    queryKey: queryKeys.insight(kind, sprintId),
    queryFn: () => api.getInsight(kind, sprintId),
  });

export const useSettings = () =>
  useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings });

// ---- Changes

/** Issue changes touch counts, lists and the activity log, so refresh all of them. */
function useInvalidateIssues() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["issues"] }),
      client.invalidateQueries({ queryKey: ["issue"] }),
      client.invalidateQueries({ queryKey: ["events"] }),
      client.invalidateQueries({ queryKey: queryKeys.backlog }),
      client.invalidateQueries({ queryKey: queryKeys.spaces }),
    ]);
}

export function useCreateIssue() {
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: (input: NewIssue) => api.createIssue(input),
    onSuccess: invalidate,
  });
}

/**
 * Optimistic: the cached issue changes at once. Besides feeling instant, this
 * prevents lost updates: ticking two criteria quickly builds the second change
 * from data that already includes the first, not from the stale server copy.
 */
export function useUpdateIssue() {
  const client = useQueryClient();
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: IssuePatch }) => api.updateIssue(key, patch),
    onMutate: async ({ key, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.issue(key) });
      await client.cancelQueries({ queryKey: ["issues"] });
      // Snapshot everything we are about to change, so a failed save can undo it.
      const previous = client.getQueryData<Issue>(queryKeys.issue(key));
      const previousLists = client.getQueriesData<Issue[]>({ queryKey: ["issues"] });

      if (previous) client.setQueryData(queryKeys.issue(key), { ...previous, ...patch });
      // Also patch every cached issue list (the board reads one), so a dragged
      // card stays in its new column instead of snapping back until the refetch.
      client.setQueriesData<Issue[]>({ queryKey: ["issues"] }, (list) =>
        list?.map((i) => (i.key === key ? { ...i, ...patch } : i)),
      );
      return { previous, previousLists };
    },
    onError: (_error, { key }, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issue(key), context.previous);
      for (const [queryKey, list] of context?.previousLists ?? []) {
        client.setQueryData(queryKey, list);
      }
    },
    onSettled: invalidate,
  });
}

export function useMoveIssueToSpace() {
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: ({ key, spaceId }: { key: string; spaceId: number }) =>
      api.moveIssueToSpace(key, spaceId),
    onSuccess: invalidate,
  });
}

export function useDeleteIssue() {
  const invalidate = useInvalidateIssues();
  return useMutation({ mutationFn: (key: string) => api.deleteIssue(key), onSuccess: invalidate });
}

export function useCreateSpace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<Space, "key" | "name" | "color" | "description">) =>
      api.createSpace(input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.spaces }),
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.updateSettings(patch),
    // Put the saved settings straight into the cache: no refetch needed.
    onSuccess: (settings) => client.setQueryData(queryKeys.settings, settings),
  });
}

/** Move `key` so it sits between its new neighbours, the same way the API will. */
function moveInList(list: BacklogItem[], key: string, { prevKey, nextKey }: RankPosition) {
  const moved = list.find((i) => i.key === key);
  if (!moved) return list;
  const rest = list.filter((i) => i.key !== key);
  const index = nextKey
    ? rest.findIndex((i) => i.key === nextKey)
    : rest.findIndex((i) => i.key === prevKey) + 1;
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

/**
 * Drag to rank, with an optimistic update: the row moves in the cache at once,
 * then the save runs. If the save fails, the old order is put back.
 */
export function useRankIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, position }: { key: string; position: RankPosition }) =>
      api.rankIssue(key, position),
    onMutate: async ({ key, position }) => {
      // Stop an in-flight refetch from overwriting the optimistic order.
      await client.cancelQueries({ queryKey: queryKeys.backlog });
      const previous = client.getQueryData<BacklogItem[]>(queryKeys.backlog);
      if (previous) client.setQueryData(queryKeys.backlog, moveInList(previous, key, position));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(queryKeys.backlog, context.previous);
    },
    // Success or failure, re-read the real order from the API.
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.backlog }),
  });
}

// ---- Sprints

/**
 * Sprint changes touch almost every screen (backlog, board, counts, velocity),
 * so refresh everything. Only queries on screen refetch; the rest are marked stale.
 */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

export function useCreateSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({ mutationFn: (input: SprintInput) => api.createSprint(input), onSuccess });
}

export function useUpdateSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<SprintInput> }) =>
      api.updateSprint(id, patch),
    onSuccess,
  });
}

export function useAddToSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({
    mutationFn: ({ sprintId, keys }: { sprintId: number; keys: string[] }) =>
      api.addToSprint(sprintId, keys),
    onSuccess,
  });
}

export function useRemoveFromSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({
    mutationFn: ({ sprintId, keys }: { sprintId: number; keys: string[] }) =>
      api.removeFromSprint(sprintId, keys),
    onSuccess,
  });
}

export function useStartSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({ mutationFn: (id: number) => api.startSprint(id), onSuccess });
}

export function useCompleteSprint() {
  const onSuccess = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, moves }: { id: number; moves: Record<string, Rollover> }) =>
      api.completeSprint(id, moves),
    onSuccess,
  });
}
