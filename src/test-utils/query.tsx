/**
 * TanStack Query helpers for tests.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

/**
 * No retries, and no garbage collection timers (they would keep Jest running after the
 * tests finish).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export function createQueryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Renders a query or mutation hook inside a fresh test client. */
export async function renderWithClient<T>(useHook: () => T) {
  const client = createTestQueryClient();
  const view = await renderHook(useHook, { wrapper: createQueryWrapper(client) });
  return { ...view, client };
}

/**
 * Runs a mutation hook once with `variables` and returns the query keys its success
 * invalidated, in call order.
 */
export async function invalidatedBy<TVariables>(
  useMutationHook: () => MutationHookResult<TVariables>,
  variables: TVariables,
): Promise<QueryKey[]> {
  const client = createTestQueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const { result } = await renderHook(useMutationHook, {
    wrapper: createQueryWrapper(client),
  });
  await act(async () => {
    await result.current.mutateAsync(variables);
  });
  // TanStack notifies observers on a later tick: wait for it inside act.
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey as QueryKey);
}

interface MutationHookResult<TVariables> {
  mutateAsync: (variables: TVariables) => Promise<unknown>;
  isSuccess: boolean;
}

/** A row for `it.each`: the keys a mutation hook must invalidate for some variables. */
export function mutationCase<TVariables>(
  name: string,
  useMutationHook: () => MutationHookResult<TVariables>,
  variables: TVariables,
  expected: readonly QueryKey[],
) {
  return { name, invalidated: () => invalidatedBy(useMutationHook, variables), expected };
}
