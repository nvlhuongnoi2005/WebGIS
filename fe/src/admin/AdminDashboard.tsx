import { AdminAuditPage } from "./AdminAuditPage";
import { AdminBillingPage } from "./AdminBillingPage";
import { AdminOverviewPage } from "./AdminOverviewPage";
import { AdminShell } from "./AdminShell";
import { AdminUsersPage } from "./AdminUsersPage";
import { sectionFromPath } from "./adminNavigation";

export default function AdminDashboard() {
  const section = sectionFromPath(window.location.pathname);
  const page = section === "overview" ? <AdminOverviewPage />
    : section === "billing" ? <AdminBillingPage />
      : section === "users" ? <AdminUsersPage />
        : <AdminAuditPage />;

  return <AdminShell section={section}>{page}</AdminShell>;
}
