import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:8080";
const proxyTarget = `${baseUrl}/proxy?url=${encodeURIComponent("https://api.alternative.me/fng/?limit=1")}`;
const proxyErrors = new Rate("proxy_errors");
const proxyLatency = new Trend("proxy_latency", true);

export const options = {
  scenarios: {
    health: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: "health",
    },
    proxy: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: "proxy",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<750", "p(99)<1500"],
    proxy_errors: ["rate<0.10"],
    proxy_latency: ["p(95)<1000"],
  },
};

export function health() {
  const response = http.get(`${baseUrl}/health`);
  check(response, { "health is 200": (r) => r.status === 200 });
  sleep(0.1);
}

export function proxy() {
  const started = Date.now();
  const response = http.get(proxyTarget);
  proxyLatency.add(Date.now() - started);
  const ok = check(response, {
    "proxy returns success or controlled upstream response": (r) =>
      [200, 429, 503].includes(r.status),
  });
  proxyErrors.add(!ok);
  sleep(0.2);
}
