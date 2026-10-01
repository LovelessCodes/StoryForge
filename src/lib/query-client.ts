import { QueryCache, QueryClient } from "@tanstack/react-query";

import { notify } from "@/components/ui/toast";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Queries opt in to surfaced errors; otherwise failures stay quiet
      // (offline network calls are expected for this app).
      const title = query.meta?.errorTitle as string | undefined;
      if (title) notify(`query-error:${title}`, { type: "error", title: `${title}: ${error}` });
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
