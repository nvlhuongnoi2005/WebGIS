import { AdminAuditPage } from "./AdminAuditPage";
import { AdminBillingPage } from "./AdminBillingPage";
import { AdminOverviewPage } from "./AdminOverviewPage";
import { AdminShell } from "./AdminShell";
import { AdminUsersPage } from "./AdminUsersPage";
import { AdminDataPage } from "./AdminDataPage";
import { AdminJobsPage } from "./AdminJobsPage";
import { AdminMapsPage } from "./AdminMapsPage";
import { AdminTilesetsPage } from "./AdminTilesetsPage";
import { sectionFromPath } from "./adminNavigation";

export default function AdminDashboard() {
  const section = sectionFromPath(window.location.pathname);
  const page =
    section === "overview" ? (
      <AdminOverviewPage />
    ) : section === "billing" ? (
      <AdminBillingPage />
    ) : section === "users" ? (
      <AdminUsersPage />
    ) : section === "data" ? (
      <AdminDataPage />
    ) : section === "tilesets" ? (
      <AdminTilesetsPage />
    ) : section === "maps" ? (
      <AdminMapsPage />
    ) : section === "jobs" ? (
      <AdminJobsPage />
    ) : (
      <AdminAuditPage />
    );

  return <AdminShell section={section}>{page}</AdminShell>;
}
