# GIS data management

The GIS flow is deliberately divided into three parts:

1. **Raw data**: upload, list, download, and delete source files. The raw store
   accepts any extension (including `.bpf`, `.shp`, and `.zip`) and does not run
   GDAL during upload.
2. **Conversion**: an administrator explicitly prepares a raw version for
   conversion. The GDAL worker uses `ogrinfo` to validate the real payload and,
   after it is ready, uses `ogr2ogr` to build MBTiles. Files without a GDAL
   driver remain stored raw if inspection fails.
3. **Publish and access**: a ready MBTiles version is referenced by a managed
   style and publication. Only users granted `map:read` can refresh the map
   catalog, load its style, or fetch its tiles.

`controller migrate` applies the GIS schema after `001_auth.sql`. The raw
upload store is selected by `GIS_RAW_STORAGE_DRIVER`: use `filesystem` only for
local development; production must configure the `s3` adapter with a private
Ceph RGW bucket and supply its credentials through `webgis-secrets`.

Apply `deployment/workers/gis-storage.yaml` after binding its RWX claims to a
CephFS StorageClass, then apply `deployment/workers/gdal-worker.yaml`. The
worker image is built from `be/GDAL.Dockerfile` and runs:

```text
/controller gdal-worker
```

It claims `processing_jobs` with a short PostgreSQL lease, runs `ogrinfo` and
`ogr2ogr`, and writes only inside its workspace until a version is ready. It
then promotes artifacts to `gis-published-data` as:

```text
tilesets/<tileset UUID>/v<version>/data.mbtiles
```

Tile Server mounts this claim read-only at `/tile-server/data/gis`. Before
publishing in a real cluster, verify that the installed Tile Server version
discovers nested MBTiles files and exposes the dataset name used by the
controller (`tileset version UUID`). If it requires a catalog refresh or a
different data layout, configure that operation in the Tile Server deployment
without making the Tile Server public.

The controller keeps legacy `/api/tiles` basemap compatibility. Private GIS
layers use only `/api/maps/{publication}/...` routes, which authenticate every
style, TileJSON, and tile request and verify both publication membership and
ACL. A browser reload fetches `/api/maps/catalog` again, so ACL grants and
published versions are reflected immediately.
