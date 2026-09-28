# Tile platform

This directory is the source for the `webgis-tile-server` Argo CD Application.
It owns the Tile Server workload, its internal Service, ingress NetworkPolicy,
and the `tile-data` PVC. Keep it in the `webgis` namespace so the controller
can use `http://tile-server:8080` without a configuration change.

`operations/` contains data-changing, one-off manifests and is intentionally
excluded from `kustomization.yaml`. Run an importer or converter against the
PVC, run `assign-dataset-roles.yaml` if needed, then restart or let Tile Server
refresh its catalog. A future converter Job, CronJob, or worker belongs under
this directory too; it must mount `tile-data` read-write while Tile Server
keeps its mount read-only.
