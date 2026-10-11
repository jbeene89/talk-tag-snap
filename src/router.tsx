import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { initializeDocumentRestoredResults } from "./lib/native";
import { routeTree } from "./routeTree.gen";

void initializeDocumentRestoredResults();

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
