#!/usr/bin/env python3
"""Benchmark Valhalla route requests and optional graph/build diagnostics."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
import platform
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TEST_FILE = SCRIPT_DIR / "testcase.txt"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR.parents[2] / "benchmark_results"
THREAD_STATE = threading.local()


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    body: dict[str, Any]
    expected: dict[str, Any]


def parse_args() -> argparse.Namespace:
    default_concurrency = max(1, min(32, os.cpu_count() or 1))
    parser = argparse.ArgumentParser(
        description="Run correctness, performance, algorithm, system and build benchmarks for Valhalla."
    )
    parser.add_argument("--test-file", type=Path, default=DEFAULT_TEST_FILE)
    parser.add_argument("--url", default="http://localhost:8002/route")
    parser.add_argument("--expansion-url")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--concurrency", type=int, default=default_concurrency)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--algorithm-sample",
        type=int,
        default=1,
        help="Number of route cases to send to /expansion; 0 disables expansion sampling.",
    )
    parser.add_argument(
        "--server-pid",
        type=int,
        default=int(os.environ["VALHALLA_PID"]) if os.environ.get("VALHALLA_PID") else None,
        help="Valhalla process PID for CPU/RAM measurements.",
    )
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="Additional HTTP header, repeatable: 'Name: value'.",
    )
    parser.add_argument(
        "--build-command",
        help="Optional command for PBF -> tiles. It is timed before route requests.",
    )
    parser.add_argument("--build-cwd", type=Path)
    parser.add_argument("--build-timeout", type=float, default=3600.0)
    parser.add_argument("--pbf", type=Path, help="Optional PBF file to measure.")
    parser.add_argument("--tile-dir", type=Path, help="Optional Valhalla tile directory to measure.")
    args = parser.parse_args()

    if args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    if args.timeout <= 0 or args.build_timeout <= 0:
        parser.error("timeouts must be greater than 0")
    if args.warmup < 0 or args.repeat < 1 or args.algorithm_sample < 0:
        parser.error("--warmup and --algorithm-sample must be non-negative; --repeat must be at least 1")

    return args


def get_session() -> requests.Session:
    session = getattr(THREAD_STATE, "session", None)
    if session is None:
        session = requests.Session()
        THREAD_STATE.session = session
    return session


def parse_headers(values: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for value in values:
        if ":" not in value:
            raise ValueError(f"Invalid header {value!r}; expected 'Name: value'")
        name, header_value = value.split(":", 1)
        headers[name.strip()] = header_value.strip()
    return headers


def load_cases(path: Path, limit: int | None, repeat: int) -> list[BenchmarkCase]:
    cases: list[BenchmarkCase] = []
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue

            raw = json.loads(line)
            if not isinstance(raw, dict):
                raise ValueError(f"Line {line_number} is not a JSON object")

            metadata = raw.pop("_benchmark", None)
            if metadata is None:
                metadata = raw.pop("benchmark", {})
            if not isinstance(metadata, dict):
                raise ValueError(f"Line {line_number} benchmark metadata must be an object")

            expected = metadata.get("expected", metadata)
            if not isinstance(expected, dict):
                raise ValueError(f"Line {line_number} expected metadata must be an object")

            for repetition in range(repeat):
                case_id = f"line-{line_number:04d}"
                if repeat > 1:
                    case_id += f"-repeat-{repetition + 1:03d}"
                body = dict(raw)
                body.setdefault("id", case_id)
                cases.append(BenchmarkCase(case_id, body, expected))

                if limit is not None and len(cases) >= limit:
                    return cases

    if not cases:
        raise ValueError(f"No benchmark cases found in {path}")
    return cases


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def latency_stats(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"count": 0}
    return {
        "count": len(values),
        "min_seconds": min(values),
        "mean_seconds": sum(values) / len(values),
        "p50_seconds": percentile(values, 50),
        "p95_seconds": percentile(values, 95),
        "p99_seconds": percentile(values, 99),
        "max_seconds": max(values),
    }


def number_stats(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"count": 0}
    return {
        "count": len(values),
        "min": min(values),
        "mean": sum(values) / len(values),
        "p50": percentile(values, 50),
        "p95": percentile(values, 95),
        "p99": percentile(values, 99),
        "max": max(values),
    }


def request_json(
    url: str,
    case: BenchmarkCase,
    headers: dict[str, str],
    timeout: float,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    request_body = body if body is not None else case.body
    result: dict[str, Any] = {
        "case_id": case.case_id,
        "expected": case.expected,
        "status_code": None,
        "elapsed_seconds": None,
        "payload": None,
        "error": None,
        "timed_out": False,
    }

    try:
        response = get_session().post(
            url,
            json=request_body,
            headers=headers,
            timeout=timeout,
        )
        result["status_code"] = response.status_code
        try:
            result["payload"] = response.json()
        except ValueError:
            result["error"] = "invalid_json_response"

        if not 200 <= response.status_code < 300:
            payload = result["payload"]
            if isinstance(payload, dict) and payload.get("error"):
                result["error"] = str(payload["error"])
            else:
                result["error"] = f"http_{response.status_code}"
    except requests.Timeout:
        result["error"] = "timeout"
        result["timed_out"] = True
    except requests.RequestException as error:
        result["error"] = f"request_error:{type(error).__name__}"
    except Exception as error:  # Keep one malformed case from stopping the run.
        result["error"] = f"unexpected_error:{type(error).__name__}"
    finally:
        result["elapsed_seconds"] = time.perf_counter() - started

    return result


def run_batch(
    cases: list[BenchmarkCase],
    url: str,
    headers: dict[str, str],
    timeout: float,
    concurrency: int,
) -> tuple[list[dict[str, Any]], float]:
    if not cases:
        return [], 0.0

    started = time.perf_counter()
    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(request_json, url, case, headers, timeout) for case in cases]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    return results, time.perf_counter() - started


def trip_data(result: dict[str, Any]) -> tuple[dict[str, Any] | None, list[Any]]:
    payload = result.get("payload")
    if not isinstance(payload, dict):
        return None, []
    trip = payload.get("trip")
    if not isinstance(trip, dict):
        return None, []
    legs = trip.get("legs")
    return trip, legs if isinstance(legs, list) else []


def expected_value(expected: dict[str, Any], key: str) -> Any:
    if key in expected:
        return expected[key]
    summary = expected.get("summary")
    if isinstance(summary, dict):
        return summary.get(key)
    return None


def evaluate_correctness(results: list[dict[str, Any]]) -> dict[str, Any]:
    connectivity_pass = 0
    distance_valid = 0
    eta_valid = 0
    expected_distance_checks = 0
    expected_distance_pass = 0
    expected_eta_checks = 0
    expected_eta_pass = 0
    restriction_checks = 0
    restriction_pass = 0
    failures: list[dict[str, Any]] = []

    for result in results:
        trip, legs = trip_data(result)
        summary = trip.get("summary", {}) if trip else {}
        if not isinstance(summary, dict):
            summary = {}

        connected = (
            result.get("status_code") == 200
            and isinstance(trip, dict)
            and bool(legs)
            and trip.get("status") in (None, 0)
        )
        if connected:
            connectivity_pass += 1

        distance = summary.get("length")
        eta = summary.get("time")
        distance_ok = isinstance(distance, (int, float)) and math.isfinite(distance) and distance >= 0
        eta_ok = isinstance(eta, (int, float)) and math.isfinite(eta) and eta >= 0
        distance_valid += int(distance_ok)
        eta_valid += int(eta_ok)

        expected = result.get("expected", {})
        expected_distance = expected_value(expected, "distance_km")
        expected_eta = expected_value(expected, "time_seconds")
        if expected_distance is not None and distance_ok:
            expected_distance_checks += 1
            tolerance = expected.get("distance_tolerance_km", 0.05)
            passed = abs(float(distance) - float(expected_distance)) <= float(tolerance)
            expected_distance_pass += int(passed)
            if not passed:
                failures.append({"case_id": result["case_id"], "check": "distance", "actual": distance, "expected": expected_distance})
        if expected_eta is not None and eta_ok:
            expected_eta_checks += 1
            tolerance = expected.get("time_tolerance_seconds", 5.0)
            passed = abs(float(eta) - float(expected_eta)) <= float(tolerance)
            expected_eta_pass += int(passed)
            if not passed:
                failures.append({"case_id": result["case_id"], "check": "eta", "actual": eta, "expected": expected_eta})

        restrictions = expected.get("restrictions", {})
        if isinstance(restrictions, dict):
            for key, expected_value_for_key in restrictions.items():
                actual = summary.get(key)
                if actual is None:
                    continue
                restriction_checks += 1
                passed = actual == expected_value_for_key
                restriction_pass += int(passed)
                if not passed:
                    failures.append({"case_id": result["case_id"], "check": f"restriction.{key}", "actual": actual, "expected": expected_value_for_key})

        if not connected or not distance_ok or not eta_ok or result.get("error"):
            failures.append({
                "case_id": result["case_id"],
                "check": "route_validity",
                "status_code": result.get("status_code"),
                "error": result.get("error"),
            })

    total = len(results)
    return {
        "requests": total,
        "connectivity": {"passed": connectivity_pass, "failed": total - connectivity_pass},
        "distance_valid": {"passed": distance_valid, "failed": total - distance_valid},
        "eta_valid": {"passed": eta_valid, "failed": total - eta_valid},
        "expected_distance": {"checked": expected_distance_checks, "passed": expected_distance_pass},
        "expected_eta": {"checked": expected_eta_checks, "passed": expected_eta_pass},
        "restrictions": (
            {"status": "checked", "checked": restriction_checks, "passed": restriction_pass}
            if restriction_checks
            else {"status": "not_checked", "reason": "Add per-case _benchmark.restrictions expectations."}
        ),
        "failures": failures[:50],
    }


def derive_endpoint(route_url: str, endpoint: str) -> str:
    parsed = urlsplit(route_url)
    path = parsed.path.rstrip("/")
    if path.endswith("/route"):
        path = path[: -len("/route")]
    return urlunsplit((parsed.scheme, parsed.netloc, f"{path}/{endpoint}", "", ""))


def run_expansion_sample(
    cases: list[BenchmarkCase],
    expansion_url: str,
    headers: dict[str, str],
    timeout: float,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for case in cases:
        body = dict(case.body)
        body["action"] = "route"
        result = request_json(expansion_url, case, headers, timeout, body)
        payload = result.get("payload")
        features = payload.get("features", []) if isinstance(payload, dict) else []
        if not isinstance(features, list):
            features = []

        nodes: set[tuple[float, float]] = set()
        for feature in features:
            geometry = feature.get("geometry") if isinstance(feature, dict) else None
            coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
            if isinstance(coordinates, list) and len(coordinates) >= 2:
                for point in (coordinates[0], coordinates[-1]):
                    if isinstance(point, list) and len(point) >= 2:
                        nodes.add((round(float(point[0]), 6), round(float(point[1]), 6)))

        records.append({
            "case_id": case.case_id,
            "elapsed_seconds": result["elapsed_seconds"],
            "error": result["error"],
            "edges": len(features),
            "nodes_estimate": len(nodes),
            "search_space": len(features),
        })
    return records


def read_process_sample(pid: int | None) -> dict[str, float] | None:
    if pid is None:
        return None

    try:
        import psutil  # type: ignore[import-not-found]

        process = psutil.Process(pid)
        cpu = process.cpu_times()
        return {"cpu_seconds": cpu.user + cpu.system, "rss_bytes": float(process.memory_info().rss)}
    except ImportError:
        pass
    except Exception:
        return None

    if os.name == "nt":
        command = (
            "$p=Get-Process -Id %d -ErrorAction Stop; "
            "Write-Output (\"$($p.CPU)|$($p.WorkingSet64)\")" % pid
        )
        try:
            completed = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
                capture_output=True,
                text=True,
                timeout=5,
                check=True,
            )
            cpu, rss = completed.stdout.strip().split("|", 1)
            return {"cpu_seconds": float(cpu), "rss_bytes": float(rss)}
        except (OSError, subprocess.SubprocessError, ValueError):
            return None

    stat_path = Path(f"/proc/{pid}/stat")
    try:
        stat_fields = stat_path.read_text(encoding="utf-8").rsplit(")", 1)[1].split()
        ticks = float(os.sysconf("SC_CLK_TCK"))
        cpu_seconds = (float(stat_fields[11]) + float(stat_fields[12])) / ticks
        rss_pages = float(stat_fields[20])
        return {"cpu_seconds": cpu_seconds, "rss_bytes": rss_pages * os.sysconf("SC_PAGE_SIZE")}
    except (OSError, IndexError, ValueError):
        return None


def system_metrics(
    pid: int | None,
    before: dict[str, float] | None,
    after: dict[str, float] | None,
    elapsed_seconds: float,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "platform": platform.platform(),
        "cpu_count": os.cpu_count(),
        "server_pid": pid,
    }
    if before is None or after is None or elapsed_seconds <= 0:
        metrics["server_process"] = {
            "status": "unavailable",
            "reason": "Pass --server-pid and expose process metrics to collect CPU/RAM.",
        }
        return metrics

    cpu_seconds = max(0.0, after["cpu_seconds"] - before["cpu_seconds"])
    metrics["server_process"] = {
        "status": "measured",
        "cpu_seconds": cpu_seconds,
        "cpu_percent_one_core": cpu_seconds / elapsed_seconds * 100,
        "cpu_percent_machine": cpu_seconds / elapsed_seconds / max(1, os.cpu_count() or 1) * 100,
        "rss_before_bytes": before["rss_bytes"],
        "rss_after_bytes": after["rss_bytes"],
        "rss_peak_observed_bytes": max(before["rss_bytes"], after["rss_bytes"]),
    }
    return metrics


def file_size(path: Path | None) -> int | None:
    if path is None or not path.exists():
        return None
    if path.is_file():
        return path.stat().st_size
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def file_count(path: Path | None) -> int | None:
    if path is None or not path.exists():
        return None
    if path.is_file():
        return 1
    return sum(1 for item in path.rglob("*") if item.is_file())


def run_build(args: argparse.Namespace) -> dict[str, Any]:
    if not args.build_command:
        return {
            "status": "skipped",
            "reason": "Pass --build-command to measure PBF -> tiles.",
            "pbf_size_bytes": file_size(args.pbf),
            "tile_size_bytes": file_size(args.tile_dir),
            "tile_file_count": file_count(args.tile_dir),
        }

    started = time.perf_counter()
    try:
        completed = subprocess.run(
            args.build_command,
            cwd=args.build_cwd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=args.build_timeout,
        )
        status = "passed" if completed.returncode == 0 else "failed"
        result: dict[str, Any] = {
            "status": status,
            "exit_code": completed.returncode,
            "build_time_seconds": time.perf_counter() - started,
            "stdout_tail": completed.stdout[-2000:],
            "stderr_tail": completed.stderr[-2000:],
        }
    except subprocess.TimeoutExpired:
        result = {
            "status": "timeout",
            "exit_code": None,
            "build_time_seconds": time.perf_counter() - started,
        }

    result["pbf_size_bytes"] = file_size(args.pbf)
    result["tile_size_bytes"] = file_size(args.tile_dir)
    result["tile_file_count"] = file_count(args.tile_dir)
    if result["pbf_size_bytes"] and result["tile_size_bytes"]:
        result["tile_to_pbf_ratio"] = result["tile_size_bytes"] / result["pbf_size_bytes"]
    return result


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    headers = parse_headers(args.header)
    cases = load_cases(args.test_file, args.limit, args.repeat)
    build = run_build(args)

    warmup_cases = cases[: min(args.warmup, len(cases))]
    warmup_results, warmup_wall_time = run_batch(
        warmup_cases,
        args.url,
        headers,
        args.timeout,
        args.concurrency,
    )
    warmup_latencies = [record["elapsed_seconds"] for record in warmup_results if record["elapsed_seconds"] is not None]

    process_before = read_process_sample(args.server_pid)
    route_results, route_wall_time = run_batch(
        cases,
        args.url,
        headers,
        args.timeout,
        args.concurrency,
    )
    process_after = read_process_sample(args.server_pid)

    route_latencies = [record["elapsed_seconds"] for record in route_results if record["elapsed_seconds"] is not None]
    successful_latencies = [
        record["elapsed_seconds"]
        for record in route_results
        if record["elapsed_seconds"] is not None and record["error"] is None and record["status_code"] == 200
    ]
    status_counts: dict[str, int] = {}
    for record in route_results:
        status = str(record["status_code"]) if record["status_code"] is not None else "no_response"
        status_counts[status] = status_counts.get(status, 0) + 1

    expansion_url = args.expansion_url or derive_endpoint(args.url, "expansion")
    algorithm_cases = cases[: min(args.algorithm_sample, len(cases))]
    expansion_records = run_expansion_sample(algorithm_cases, expansion_url, headers, args.timeout)
    expansion_success = [record for record in expansion_records if record["error"] is None]

    performance = {
        "requests": len(route_results),
        "concurrency": args.concurrency,
        "wall_time_seconds": route_wall_time,
        "requests_per_second": len(route_results) / route_wall_time if route_wall_time else None,
        "latency_seconds": latency_stats(route_latencies),
        "successful_latency_seconds": latency_stats(successful_latencies),
        "http_status_counts": status_counts,
        "termination": {
            "completed": len(route_results),
            "timed_out": sum(int(record["timed_out"]) for record in route_results),
            "all_requests_terminated": len(route_results) == len(cases),
        },
    }
    cache = {
        "warmup_requests": len(warmup_results),
        "warmup_wall_time_seconds": warmup_wall_time,
        "warmup_latency_seconds": latency_stats(warmup_latencies),
        "observation": "Warmup latency is a proxy for cache effects; Valhalla cache counters are not exposed here.",
    }

    if expansion_success:
        algorithm: dict[str, Any] = {
            "status": "measured",
            "sample_count": len(expansion_success),
            "expansion_latency_seconds": latency_stats([record["elapsed_seconds"] for record in expansion_success]),
            "edges_expanded": number_stats([record["edges"] for record in expansion_success]),
            "nodes_estimate": number_stats([record["nodes_estimate"] for record in expansion_success]),
            "search_space": number_stats([record["search_space"] for record in expansion_success]),
            "heuristic": {
                "status": "unavailable",
                "reason": "Valhalla HTTP JSON does not expose heuristic counters.",
            },
        }
    else:
        algorithm = {
            "status": "unavailable",
            "sample_count": 0,
            "reason": "No expansion sample completed successfully.",
            "heuristic": {"status": "unavailable"},
        }

    return {
        "metadata": {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "test_file": str(args.test_file),
            "route_url": args.url,
            "expansion_url": expansion_url,
            "cases": len(cases),
            "warmup": len(warmup_results),
            "repeat": args.repeat,
            "timeout_seconds": args.timeout,
        },
        "correctness": evaluate_correctness(route_results),
        "performance": performance,
        "algorithm": algorithm,
        "system": system_metrics(args.server_pid, process_before, process_after, route_wall_time),
        "cache": cache,
        "build": build,
    }


def markdown_value(value: Any) -> str:
    if value is None:
        return "unavailable"
    if isinstance(value, float):
        return f"{value:.6f}"
    return str(value)


def render_markdown(report: dict[str, Any]) -> str:
    metadata = report["metadata"]
    correctness = report["correctness"]
    performance = report["performance"]
    algorithm = report["algorithm"]
    system = report["system"]
    build = report["build"]
    latency = performance["latency_seconds"]

    lines = [
        "# Valhalla Benchmark",
        "",
        f"Generated: `{metadata['generated_at']}`  ",
        f"Cases: `{metadata['cases']}`  ",
        f"Route endpoint: `{metadata['route_url']}`",
        "",
        "## Correctness",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Connectivity passed | {correctness['connectivity']['passed']} / {correctness['requests']} |",
        f"| Distance valid | {correctness['distance_valid']['passed']} / {correctness['requests']} |",
        f"| ETA valid | {correctness['eta_valid']['passed']} / {correctness['requests']} |",
        f"| Expected distance checks | {correctness['expected_distance']['passed']} / {correctness['expected_distance']['checked']} |",
        f"| Expected ETA checks | {correctness['expected_eta']['passed']} / {correctness['expected_eta']['checked']} |",
        f"| Restrictions | {correctness['restrictions']['status']} |",
        "",
        "## Performance",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Wall time | {markdown_value(performance['wall_time_seconds'])} s |",
        f"| Requests/sec | {markdown_value(performance['requests_per_second'])} |",
        f"| Latency p50 | {markdown_value(latency.get('p50_seconds'))} s |",
        f"| Latency p95 | {markdown_value(latency.get('p95_seconds'))} s |",
        f"| Latency p99 | {markdown_value(latency.get('p99_seconds'))} s |",
        f"| Termination | {performance['termination']['completed']} completed, {performance['termination']['timed_out']} timed out |",
        "",
        "## Algorithm",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Status | {algorithm['status']} |",
        f"| Expansion samples | {algorithm.get('sample_count', 0)} |",
        f"| Edges expanded mean | {markdown_value(algorithm.get('edges_expanded', {}).get('mean') if isinstance(algorithm.get('edges_expanded'), dict) else None)} |",
        f"| Nodes estimate mean | {markdown_value(algorithm.get('nodes_estimate', {}).get('mean') if isinstance(algorithm.get('nodes_estimate'), dict) else None)} |",
        f"| Search space mean | {markdown_value(algorithm.get('search_space', {}).get('mean') if isinstance(algorithm.get('search_space'), dict) else None)} |",
        f"| Heuristic | {algorithm.get('heuristic', {}).get('status', 'unavailable')} |",
        "",
        "## System",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Host | {system['platform']} |",
        f"| CPU count | {system['cpu_count']} |",
        f"| Server process | {system['server_process']['status']} |",
        f"| Server CPU | {markdown_value(system['server_process'].get('cpu_percent_one_core'))}% of one core |",
        f"| Server RSS after | {markdown_value(system['server_process'].get('rss_after_bytes'))} bytes |",
        "",
        "## Cache",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Warmup requests | {report['cache']['warmup_requests']} |",
        f"| Warmup latency p50 | {markdown_value(report['cache']['warmup_latency_seconds'].get('p50_seconds'))} s |",
        "| Direct cache counters | unavailable |",
        "",
        "## Build",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        f"| Status | {build['status']} |",
        f"| Build time | {markdown_value(build.get('build_time_seconds'))} s |",
        f"| PBF size | {markdown_value(build.get('pbf_size_bytes'))} bytes |",
        f"| Tile size | {markdown_value(build.get('tile_size_bytes'))} bytes |",
        f"| Tile files | {markdown_value(build.get('tile_file_count'))} |",
        "",
        "## Notes",
        "",
        "- `nodes_estimate` counts unique endpoints in expansion GeoJSON features; it is not a native Valhalla node counter.",
        "- `heuristic` and direct cache counters are marked unavailable because the HTTP API does not expose them.",
        "- Add `_benchmark.expected` and `_benchmark.restrictions` to testcase lines for ground-truth correctness checks.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    try:
        report = build_report(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Benchmark failed: {error}")
        return 2

    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = args.output_dir / f"valhalla_benchmark_{stamp}.json"
    markdown_path = args.output_dir / f"valhalla_benchmark_{stamp}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")

    print(f"JSON report: {json_path}")
    print(f"Markdown report: {markdown_path}")
    print(json.dumps({
        "requests": report["performance"]["requests"],
        "p50_seconds": report["performance"]["latency_seconds"].get("p50_seconds"),
        "p95_seconds": report["performance"]["latency_seconds"].get("p95_seconds"),
        "p99_seconds": report["performance"]["latency_seconds"].get("p99_seconds"),
        "requests_per_second": report["performance"]["requests_per_second"],
        "algorithm_status": report["algorithm"]["status"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
