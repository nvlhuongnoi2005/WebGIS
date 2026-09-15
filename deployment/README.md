# Kubernetes deployment

This folder deploys the application core into the `webgis` namespace:

- `frontend`: static Vite application served by Nginx.
- `controller`: Go authentication API and protected API gateway.
- `auth-postgres`: a dedicated PostGIS-backed authentication database.
- `auth-migrate`: database migration Job.

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
kubectl apply -f deployment/secret.yaml
```

The controller requires `AUTH_JWT_PRIVATE_KEY`,
`AUTH_JWT_PUBLIC_KEY`, and `AUTH_REFRESH_TOKEN_PEPPER`; it deliberately will
not start with ephemeral JWT keys in production.

## 3. Deploy the core

Create/update regular resources, wait for the database, then run the migration
once. The migration Job is omitted from the first command so it can be rerun
cleanly after a schema change.

```powershell
kubectl apply -k deployment
kubectl -n webgis rollout status statefulset/auth-postgres
kubectl -n webgis delete job auth-migrate --ignore-not-found
kubectl -n webgis apply -f deployment/migration-job.yaml
kubectl -n webgis wait --for=condition=complete job/auth-migrate --timeout=180s
kubectl -n webgis rollout status deployment/controller
kubectl -n webgis rollout status deployment/frontend
```

The migration Job is intentionally kept outside `kustomization.yaml`: it must
run only after the database is ready and should be explicitly rerun for each
schema update.

## 4. Ingress and local access

Docker Desktop Kubernetes currently has no IngressClass. Install an ingress
controller such as ingress-nginx, then replace `webgis.example.com` in
`ingress.yaml` with the actual hostname and add TLS before production.

For a local smoke test without Ingress:

```powershell
kubectl -n webgis port-forward service/frontend 8088:80
kubectl -n webgis port-forward service/controller 3001:3001
```

Open `http://localhost:8088`; the frontend needs an ingress/proxy path to call
the controller on the same origin. Directly exposing controller or workers via
`LoadBalancer`/`NodePort` is not the intended production design.

## 5. Map workers and existing Docker data

`workers.yaml` is a template for the currently running Tile Server, Valhalla,
and Nominatim containers. Before applying it:

1. Copy/import each Docker volume or bind-mounted map dataset into the matching
   PVC (`tile-data`, `valhalla-data`, `nominatim-data`, `nominatim-project`).
2. Build and push the existing local `nominatim-nominatim` image to your
   registry, then replace its placeholder image reference.
3. Confirm the Valhalla image command serves HTTP after tile data is built;
   the current Docker container starts with `build_tiles`, which is a build
   action rather than a reliable long-running serving configuration.
4. Add controller proxy routes for tile and Nominatim requests before publishing
   them. The existing frontend Vite development proxies are not a production
   gateway.

Then apply it:

```powershell
kubectl -n webgis apply -f deployment/workers.yaml
```

Keep every worker as `ClusterIP`. The controller must remove client supplied
identity headers, validate the Bearer JWT/revocation cache, authorize scope and
quota, then make the internal worker call.

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
