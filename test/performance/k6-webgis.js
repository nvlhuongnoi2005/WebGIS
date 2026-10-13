import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const baseUrl = (__ENV.BASE_URL || "http://127.0.0.1").replace(/\/+$/, "");
const workload = (__ENV.WORKLOAD || "public").toLowerCase();
const accessToken = __ENV.WEBGIS_ACCESS_TOKEN || "";
const tilePath = __ENV.TILE_PATH || "/api/tile-catalog";
const virtualUsers = positiveIntegerEnv("VUS", 25);
const thinkTimeSeconds = nonNegativeNumberEnv("THINK_TIME_SECONDS", 0.3);

const authenticatedWorkloads = ["search", "route", "mixed"];
const validWorkloads = ["public", "search", "route", "mixed"];

if (!validWorkloads.includes(workload)) {
  throw new Error(`WORKLOAD must be one of: ${validWorkloads.join(", ")}.`);
}

if (authenticatedWorkloads.includes(workload) && !accessToken) {
  throw new Error(`WORKLOAD=${workload} requires WEBGIS_ACCESS_TOKEN.`);
}

if (!tilePath.startsWith("/api/")) {
  throw new Error("TILE_PATH must be a Controller path beginning with /api/.");
}

export const options = {
  stages: [
    { duration: __ENV.RAMP_UP || "1m", target: virtualUsers },
    { duration: __ENV.DURATION || "5m", target: virtualUsers },
    { duration: __ENV.RAMP_DOWN || "30s", target: 0 },
  ],
  thresholds: {
    checks: ["rate>0.99"],
    webgis_request_errors: ["rate<0.01"],
    "webgis_response_duration_ms{service:health}": ["p(95)<500"],
    "webgis_response_duration_ms{service:tile}": ["p(95)<1500"],
    "webgis_response_duration_ms{service:suggestions}": ["p(95)<1500"],
    "webgis_response_duration_ms{service:nominatim}": ["p(95)<3000"],
    "webgis_response_duration_ms{service:route}": ["p(95)<4000"],
  },
};

const requestErrors = new Rate("webgis_request_errors");
const responseDuration = new Trend("webgis_response_duration_ms", true);

export default function () {
  switch (workload) {
    case "public":
      Math.random() < 0.5 ? health() : tile();
      break;
    case "search":
      Math.random() < 0.6 ? suggestions() : nominatim();
      break;
    case "route":
      route();
      break;
    case "mixed":
      mixedRequest();
      break;
  }

  sleep(thinkTimeSeconds);
}

function mixedRequest() {
  const choice = Math.random();
  if (choice < 0.4) return tile();
  if (choice < 0.65) return suggestions();
  if (choice < 0.85) return nominatim();
  return route();
}

function health() {
  send("health", () => http.get(`${baseUrl}/health`, requestParameters("health")));
}

function tile() {
  send("tile", () => http.get(`${baseUrl}${tilePath}`, requestParameters("tile")));
}

function suggestions() {
  send("suggestions", () =>
    http.get(`${baseUrl}/api/suggestions?q=ha%20noi`, authenticatedRequestParameters("suggestions"))
  );
}

function nominatim() {
  const query =
    "/api/nominatim/search?q=ha%20noi&format=jsonv2&addressdetails=1&namedetails=1" +
    "&extratags=1&polygon_geojson=1&limit=6&accept-language=vi%2Cen";
  send("nominatim", () => http.get(`${baseUrl}${query}`, authenticatedRequestParameters("nominatim")));
}

function route() {
  const payload = JSON.stringify({
    locations: [
      { lat: 21.0285, lon: 105.8542 },
      { lat: 21.0368, lon: 105.8342 },
    ],
    costing: "auto",
    units: "kilometers",
    language: "vi-VN",
    directions_type: "instructions",
    shape_format: "polyline6",
  });
  send("route", () =>
    http.post(`${baseUrl}/api/gateway/route`, payload, {
      ...authenticatedRequestParameters("route"),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
  );
}

function send(service, request) {
  const response = request();
  const success = check(
    response,
    {
      "returns a successful HTTP status": (result) => result.status >= 200 && result.status < 300,
    },
    { service }
  );
  requestErrors.add(!success, { service });
  responseDuration.add(response.timings.duration, { service });
}

function requestParameters(service) {
  return { tags: { service }, timeout: __ENV.HTTP_TIMEOUT || "30s" };
}

function authenticatedRequestParameters(service) {
  return {
    ...requestParameters(service),
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

function positiveIntegerEnv(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeNumberEnv(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
