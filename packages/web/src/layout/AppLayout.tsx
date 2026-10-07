import { Outlet } from "react-router";
import { CreateIssueProvider } from "../create/CreateIssueContext";
import { Sidebar } from "./Sidebar";

/** The frame shared by every route: sidebar on the left, the current page on the right. */
export function AppLayout() {
  return (
    <CreateIssueProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        {/* <Outlet /> is where React Router renders the page matching the URL. */}
        <Outlet />
      </div>
    </CreateIssueProvider>
  );
}
