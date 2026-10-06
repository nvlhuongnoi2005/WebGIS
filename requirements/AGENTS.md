# Project Context for Agents

Read this file before `requirements/feature.md`. This document describes the
current repository and integration points. `feature.md` is the source of truth
for the feature to implement; do not treat this file as an additional feature
specification.

## Project overview

This repository is a WebGIS application for viewing maps, drawing and sharing
GeoJSON, geocoding, nearby-place search, routing, account management, billing,
and administration.

The current topic is extending the platform with administrator-managed GIS data
and map resources. The existing map stack already has a Tile Server, MapLibre,
PostgreSQL, Nominatim, Valhalla, Kubernetes manifests, and initial centralized
role permissions. Read the feature specification for the exact requested
behavior and acceptance criteria.

## Repository layout

```text
be/                         Go controller/authentication service
be/migrations/              PostgreSQL schema migrations
fe/src/                     React + TypeScript application
fe/src/admin/               Administrator console screens
fe/src/features/map/        Map UI and panels
fe/src/tools/map/           MapLibre style and tile-catalog handling
deployment/                 Kubernetes and Argo CD manifests
deployment/core/            Controller, frontend, ingress, config
deployment/workers/         Valhalla, Nominatim, Tile Server-related workers
deployment/workers/tile-server/
                            Tile Server deployment, PVC, operations
.github/workflows/ci.yaml   Build, test, and container publishing workflow
```

## Backend architecture

- The backend is a single Go module in `be/`, package `main`.
- `be/server.go` owns the HTTP router, server initialization, generic account
  and administration handlers, and upstream proxies. Add only route
  registration or small coordination logic there; put a new feature's handlers
  in focused Go files.
- Existing feature boundaries provide the preferred pattern:
  - `be/spatial_search.go`: nearby-place search.
  - `be/geojson_shares.go`: GeoJSON sharing lifecycle.
  - `be/poi_sync.go`: background/data synchronization behavior.
- `be/types.go` contains shared domain structs such as `Claims`, `User`, and
  session types.
- `be/repository.go` owns the `pgx` pool and shared database helpers.
- `be/config.go` loads all environment-based configuration into `Config`.
- `be/openapi.go` is the manually maintained OpenAPI document.

### Authentication and authorization

- Authentication uses JWT claims defined in `be/types.go` and validated by
  `Server.authenticate` in `be/server.go`.
- Role/scope permission evaluation is centralized in `be/authorization.go`.
- `Server.requireAdmin` protects existing administration endpoints.
- The frontend's role checks only control navigation and appearance. Backend
  authorization is the security boundary.

### Database and migrations

- PostgreSQL is accessed with `pgx` via `Repository`.
- The current schema is in `be/migrations/001_auth.sql`; it includes users,
  sessions, quotas, GeoJSON sharing, POI search data, and `admin_audit_logs`.
- Before adding a second migration, inspect `Repository.Migrate`: it currently
  looks up `001_auth.sql` directly, so migration discovery/execution must be
  updated if the feature introduces additional SQL files.

### Tile and upstream proxy behavior

- `Config.TileServerURL` is the internal Tile Server base URL.
- `Server.tileProxy` in `be/server.go` forwards Tile Server responses.
- The current router exposes `/api/tile-catalog` and `/api/tiles/...` through
  that proxy. Treat this as an existing integration point, not proof that the
  current access-control behavior is suitable for new resources.
- Nominatim and Valhalla are separate upstream services. Their databases and
  data volumes are not the controller's general application data store.

## Frontend architecture

- The frontend is React, TypeScript, Vite, Material UI, and MapLibre.
- `fe/src/App.tsx` contains pathname-based routing and the admin route guard.
- `fe/src/features/auth/` holds the authenticated user state and authenticated
  fetch helpers.
- `fe/src/features/map/MapView.tsx` is the main map screen.
- `fe/src/tools/map/MapStyleTool.ts` builds MapLibre styles and normalizes the
  current Tile Server catalog.
- `fe/src/hooks/useBaseMapStyle.ts` applies base-map and overlay style changes.
- `fe/src/features/map/components/TileServerBaseMapPanel.tsx` displays the
  available base maps and overlays.

### Existing admin console

- Admin screens are in `fe/src/admin/`.
- `AdminShell.tsx` owns the navigation shell.
- `adminNavigation.ts` defines recognized admin sections and their paths.
- `AdminDashboard.tsx` chooses the screen for the active section.
- `AdminOverviewPage.tsx`, `AdminUsersPage.tsx`, `AdminBillingPage.tsx`, and
  `AdminAuditPage.tsx` are existing examples to follow.
- Admin API clients currently live mostly in
  `fe/src/features/billing/billingApi.ts`; new GIS-specific API code should be
  placed in a dedicated module rather than further coupling it to billing.
- Text must be added to both `fe/src/i18n/locales/vi.json` and
  `fe/src/i18n/locales/en.json`.

## Deployment context

- The controller and frontend images are built by `.github/workflows/ci.yaml`.
  The workflow publishes mutable `:dev` tags when the relevant source paths
  change.
- `deployment/core/controller.yaml` deploys the Go controller.
- Tile Server has its own Argo CD application and manifests under
  `deployment/workers/tile-server/`.
- `deployment/workers/tile-server/tile-server.yaml` mounts `tile-data` at
  `/tile-server/data` read-only.
- `deployment/workers/tile-server/storage.yaml` currently defines `tile-data`
  as a `ReadWriteOnce` PVC. Any shared build/serve storage design must account
  for this existing limitation and a safe data migration.
- `deployment/workers/tile-server/operations/` contains manual, data-mutating
  import and dataset-role operations. It is intentionally not part of the
  normal kustomization.
- Existing core/worker network policies should be reviewed whenever a new
  service, worker, volume, or upstream call is introduced.

## Working conventions

- Preserve unrelated work in the repository; the worktree may be dirty.
- Follow the existing feature-file layout rather than creating a second backend
  service without a clear need.
- Keep heavyweight or long-running work out of HTTP request handlers.
- Validate input at API boundaries, especially user-supplied identifiers and
  filesystem/object paths.
- Update backend behavior, OpenAPI, frontend client code, translations,
  deployment manifests, and tests together when a change crosses those layers.
- Run relevant Go tests and the frontend build before handing work back.
