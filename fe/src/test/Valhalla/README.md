# Valhalla benchmark

`benchmark_valhalla.py` produces a JSON report and a Markdown report with the
following groups:

- Correctness: connectivity, valid distance/ETA, optional expected values and restrictions.
- Performance: latency, p50/p95/p99, throughput and request termination.
- Algorithm: sampled `/expansion` edges, estimated nodes and search space.
- System: host information and optional Valhalla CPU/RAM measurements.
- Build: optional PBF-to-tiles command time and output sizes.

Run a small smoke benchmark against the local Valhalla server:

```powershell
python fe/src/test/Valhalla/benchmark_valhalla.py `
  --test-file fe/src/test/Valhalla/testcase.txt `
  --url http://localhost:8002/route `
  --limit 16 `
  --warmup 1 `
  --algorithm-sample 1 `
  --concurrency 4
```

Run the complete route file with three expansion samples:

```powershell
python fe/src/test/Valhalla/benchmark_valhalla.py `
  --test-file fe/src/test/Valhalla/testcase.txt `
  --url http://localhost:8002/route `
  --warmup 4 `
  --algorithm-sample 3 `
  --concurrency 8 `
  --output-dir benchmark_results
```

For CPU and RAM metrics, pass the Valhalla process PID. On Windows, the PID
can be found with:

```powershell
(Get-Process valhalla_service).Id
```

The build section is enabled by passing the command that builds tiles:

```powershell
python fe/src/test/Valhalla/benchmark_valhalla.py `
  --build-command "valhalla_build_tiles -c valhalla.json vietnam.osm.pbf" `
  --build-cwd C:\path\to\valhalla `
  --pbf C:\path\to\vietnam.osm.pbf `
  --tile-dir C:\path\to\valhalla_tiles
```

Optional ground truth can be attached to an input line under `_benchmark`.
The metadata is removed before the request is sent to Valhalla:

```json
{"locations":[{"lat":10.7769,"lon":106.7009},{"lat":10.8231,"lon":106.6297}],"costing":"auto","units":"kilometers","_benchmark":{"expected":{"distance_km":8.4,"distance_tolerance_km":0.5,"time_seconds":900,"time_tolerance_seconds":60,"restrictions":{"has_toll":false}}}}
```

`nodes_estimate` is derived from unique endpoints in the expansion GeoJSON;
it is intentionally labelled as an estimate because Valhalla does not expose
a native node counter in the HTTP JSON response. Heuristic counters and direct
cache counters are reported as unavailable. The existing `run_with_server.py`
remains available for its original per-request output formats.
