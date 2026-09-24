# Kubernetes deployment

This folder deploys the application core into the `webgis` namespace:

- `frontend`: static Vite application served by Nginx.
- `controller`: Go authentication API and protected API gateway.
- `auth-migrate`: database migration Job.

The dedicated authentication database is rendered separately from
`db/kustomization.yaml`. `argocd/webgis-auth-db.yaml` defines its independent
Argo CD Application while the existing WebGIS Application continues to sync
the `deployment/` core.

The map workers are in `workers.yaml` but intentionally are **not** part of
`kustomization.yaml`. Their Docker data is not automatically copied into a
Kubernetes PVC. Import or rebuild that data first, then configure and apply the
worker manifest separately.

## 1. Build and publish images

Replace `REGISTRY`, `TAG`, then set exactly the same image names in
`controller.yaml` and `frontend.yaml`.

```powershell
docker build -f be/Dockerfile -t REGISTRY/webgis/controller:TAG .
docker build -f fe/Dockerfile -t REGISTRY/webgis/frontend:TAG .
docker push REGISTRY/webgis/controller:TAG
docker push REGISTRY/webgis/frontend:TAG
```

The controller is written in Go. For local development, install Go 1.25 or
newer, restart the terminal so `go` is in `PATH`, then run `npm start`.

For Docker Desktop's local Kubernetes, images already built locally can be used
without `docker push` when the manifest contains the same tag and
`imagePullPolicy: IfNotPresent`.

## 2. Create secrets outside Git

Generate an Ed25519 key pair and random values, then copy
`secret.example.yaml` to `secret.yaml`, replace every placeholder, and do not
commit it. `DATABASE_URL` must use the same password as `POSTGRES_PASSWORD`.
Use URL-safe random values for the database password so no URL escaping is
needed in `DATABASE_URL`.

```powershell
go run ./be/cmd/keygen -out-dir deployment/.secrets
Copy-Item deployment/secret.example.yaml deployment/secret.yaml
kubectl apply -f deployment/namespace.yaml
kubectl apply -f deployment/secret.yaml
```

The controller requires `AUTH_JWT_PRIVATE_KEY`,
`AUTH_JWT_PUBLIC_KEY`, and `AUTH_REFRESH_TOKEN_PEPPER`; it deliberately will
not start with ephemeral JWT keys in production.

## 3. Deploy the core

For GitOps deployments, keep the existing WebGIS Application pointed at this
directory and apply `argocd/webgis-auth-db.yaml` once to create the independent
database Application. The migration Job waits for `auth-postgres`, runs the SQL
migrations, then the sync wave updates the controller. The CI workflow
publishes the controller image (which contains the SQL migrations) and updates
both controller and migration Job image tags when backend files change.

For a manual first-time deployment, apply the resources and wait for Postgres
before rerunning the migration Job:

```powershell
kubectl apply -f deployment/namespace.yaml
kubectl apply -k deployment/db
kubectl -n webgis rollout status statefulset/auth-postgres
kubectl apply -k deployment
kubectl -n webgis delete job auth-migrate --ignore-not-found
kubectl -n webgis apply -f deployment/migration-job.yaml
kubectl -n webgis wait --for=condition=complete job/auth-migrate --timeout=180s
kubectl -n webgis rollout status deployment/controller
kubectl -n webgis rollout status deployment/frontend
```

The migration Job is included in the core `kustomization.yaml` and has an init
container that waits up to ten minutes for the independently managed database.

## 4. Ingress and local access

Install the pinned ingress-nginx controller once per Kubernetes cluster:

```powershell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=300s
```

For Docker Desktop local testing, apply the normal manifests first, then the
local overlay. It routes `http://webgis.localhost` through ingress-nginx and
disables secure cookies only for this HTTP-only local environment.

```powershell
kubectl apply -k deployment
kubectl apply -k deployment/overlays/local
kubectl -n webgis rollout restart deployment/controller
kubectl -n webgis rollout status deployment/controller
```

Open `http://webgis.localhost`. Modern browsers resolve `*.localhost` to the
local machine. If yours does not, add `127.0.0.1 webgis.localhost` to the
Windows hosts file. No port-forward is required while ingress-nginx is running.

For production, retain the base `ingress.yaml`, replace
`webgis.example.com` with the real domain, configure TLS/cert-manager, set
`APP_ORIGINS` to its HTTPS origin, and keep `AUTH_SECURE_COOKIES` set to `true`.

For a local smoke test without Ingress:

```powershell
kubectl -n webgis port-forward service/frontend 8088:80
kubectl -n webgis port-forward service/controller 3001:3001
```

Open `http://localhost:8088`. The Frontend Nginx proxies `/auth` and `/api`
to the in-cluster Controller, so map catalog and tile requests keep the same
path as production. Directly exposing Controller or workers via
`LoadBalancer`/`NodePort` is not the intended production design.

## 5. Migrate map workers from Docker

The current Docker data was measured as approximately 393 MB for Tile Server,
2.9 GB for the shared Valhalla/Nominatim map directory, and 10 GB for the
Nominatim PostGIS database. The manifests use 5 Gi, 10 Gi, and 30 Gi PVCs
respectively. They are intentionally outside `kustomization.yaml`.

Build and publish the locally-built Nominatim image with the same release tag
as the controller and frontend:

```powershell
docker build -f ../Nominatim/Dockerfile -t ghcr.io/nvlhuongnoi2005/webgis/nominatim:26.9 ../Nominatim
docker push ghcr.io/nvlhuongnoi2005/webgis/nominatim:26.9
```

Create a non-committed database secret. `POSTGRES_PASSWORD` and the password in
`NOMINATIM_DATABASE_DSN` must be exactly the same value.

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$nominatimDbPassword = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

kubectl -n webgis create secret generic nominatim-db-credentials `
  --from-literal=POSTGRES_USER=nominatim `
  --from-literal=POSTGRES_PASSWORD=$nominatimDbPassword `
  --from-literal=NOMINATIM_DATABASE_DSN="pgsql:dbname=nominatim;host=nominatim-db;port=5432;user=nominatim;password=$nominatimDbPassword" `
  --dry-run=client -o yaml | kubectl apply -f -
```

Create the PVCs and target Nominatim database, then wait for it:

```powershell
kubectl -n webgis apply -f deployment/worker-storage.yaml
kubectl -n webgis rollout status statefulset/nominatim-db --timeout=300s
kubectl -n webgis exec nominatim-db-0 -- createdb -U nominatim nominatim
kubectl -n webgis apply -f deployment/worker-importer.yaml
kubectl -n webgis wait --for=condition=Ready pod/import-tile-data pod/import-map-data pod/import-nominatim-project --timeout=180s
```

The following transfers stream from the currently running Docker containers to
the PVCs; they do not create a second local copy. Keep the source containers
running until each command succeeds.

```powershell
cmd.exe /d /s /c "docker cp tile-server:/tile-server/data - | kubectl -n webgis exec -i import-tile-data -- tar -C /target --strip-components=1 -xf -"
cmd.exe /d /s /c "docker cp valhalla:/custom_files - | kubectl -n webgis exec -i import-map-data -- tar -C /target --strip-components=1 -xf -"
cmd.exe /d /s /c "docker cp nominatim-nominatim-1:/nominatim-project - | kubectl -n webgis exec -i import-nominatim-project -- tar -C /target --strip-components=1 -xf -"
cmd.exe /d /s /c "docker exec nominatim-db-1 pg_dump -U nominatim -Fc nominatim | kubectl -n webgis exec -i nominatim-db-0 -- pg_restore -U nominatim -d nominatim --no-owner"
```

Verify the imported database before starting its API. Then remove the temporary
importer pods and launch the three workers with private network policies:

```powershell
kubectl -n webgis exec nominatim-db-0 -- psql -U nominatim -d nominatim -c "SELECT count(*) FROM placex;"
# Only needed when the old source database was also used for WebGIS auth.
kubectl -n webgis exec nominatim-db-0 -- psql -U nominatim -d nominatim -c "DROP TABLE IF EXISTS auth_event_checkpoints, auth_events, refresh_token_history, user_quotas, sessions, users; DROP FUNCTION IF EXISTS set_auth_updated_at();"
kubectl -n webgis delete -f deployment/worker-importer.yaml
kubectl -n webgis apply -f deployment/worker-networkpolicy.yaml
kubectl -n webgis apply -f deployment/workers.yaml
kubectl -n webgis rollout status deployment/tile-server --timeout=300s
kubectl -n webgis rollout status deployment/valhalla --timeout=600s
kubectl -n webgis rollout status deployment/nominatim --timeout=300s
```

All worker Services are `ClusterIP`; clients cannot call them directly. The
Controller proxies map tiles, public Nominatim search requests, and authenticated routing requests to Valhalla at
`valhalla:8002`. Tile and Nominatim need their own authenticated controller
routes before they are exposed from the frontend in production.

## Operations

```powershell
kubectl -n webgis get pods,svc,pvc,ingress
kubectl -n webgis logs deployment/controller --tail=100
kubectl -n webgis logs job/auth-migrate
kubectl -n webgis describe pod -l app.kubernetes.io/name=controller
```

The auth database is deliberately separate from Nominatim's database. It avoids
coupling account data to an imported geocoding dataset and lets the controller
reach it through the private `auth-postgres` ClusterIP service.
