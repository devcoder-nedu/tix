// One place that maps every URL from the design doc to a screen.

import { createBrowserRouter } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { BacklogPage } from "./pages/backlog/BacklogPage";
import { BoardPage } from "./pages/board/BoardPage";
import { IssueDetailPage } from "./pages/issue/IssueDetailPage";
import { PlanPage } from "./pages/plan/PlanPage";
import { SpaceDetailPage } from "./pages/spaces/SpaceDetailPage";
import { SpacesPage } from "./pages/spaces/SpacesPage";
import { InsightsSettingsPage, NotFoundPage, PastSprintsPage } from "./pages/Placeholder";

export const router = createBrowserRouter([
  {
    // AppLayout (sidebar + Create dialog) wraps every page below it.
    element: <AppLayout />,
    children: [
      { path: "/", element: <BoardPage /> },
      { path: "/plan", element: <PlanPage /> },
      { path: "/sprints", element: <PastSprintsPage /> },
      { path: "/backlog", element: <BacklogPage /> },
      { path: "/spaces", element: <SpacesPage /> },
      { path: "/spaces/:key", element: <SpaceDetailPage /> },
      { path: "/issue/:key", element: <IssueDetailPage /> },
      { path: "/settings/ai", element: <InsightsSettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
