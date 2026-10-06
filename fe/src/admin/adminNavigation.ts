export type AdminSection =
  "overview" | "billing" | "users" | "audit" | "data" | "tilesets" | "maps" | "jobs";

// Route helpers kept outside component modules for fast-refresh compatibility.

export function sectionFromPath(path: string): AdminSection {
  const match = path.match(/^\/admin\/(billing|users|audit|data|tilesets|maps|jobs)$/);
  return match ? (match[1] as AdminSection) : "overview";
}

export function pathFor(section: AdminSection) {
  return section === "overview" ? "/admin" : `/admin/${section}`;
}
