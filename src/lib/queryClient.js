// ─────────────────────────────────────────────────────────────────────────────
// QueryClient — TanStack React Query client configuration
// ─────────────────────────────────────────────────────────────────────────────
// Configures the global React Query client with sensible defaults:
//   - staleTime: 5 minutes (data considered fresh for 5 min before refetch)
//   - gcTime: 30 minutes (garbage collection of inactive queries)
//   - refetchOnWindowFocus: false (prevents refetch when tab regains focus)
//   - retry: 1 (one retry on failed queries)
//
// Used across the app for data fetching with caching, background refetching,
// and optimistic updates.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
