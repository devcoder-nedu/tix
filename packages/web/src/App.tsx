import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { router } from "./router";
import { ThemeProvider } from "./theme/ThemeProvider";

// One cache for the whole app. Data is local, so a short staleTime is plenty
// and avoids refetching on every focus change.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});

// Providers wrap the app from the outside in: data cache, then theme (which
// reads settings from the cache), then the router that picks the page.
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
