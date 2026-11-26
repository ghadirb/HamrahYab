import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function request(path, method = "GET", headers = {}) {
  return new Request(`https://example.test${path}`, { method, headers });
}

test("health endpoint is public and does not require D1", async () => {
  const response = await worker.fetch(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "hamrahyab-api", version: 1 });
});

test("unknown paths return a structured 404", async () => {
  const response = await worker.fetch(request("/unknown"), {});
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "not_found");
});

test("protected routes reject missing credentials", async () => {
  const response = await worker.fetch(request("/v1/me"), { DB: {} });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

test("protected routes reject malformed bearer credentials", async () => {
  const response = await worker.fetch(request("/v1/me", "GET", { authorization: "Bearer short" }), { DB: {} });
  assert.equal(response.status, 401);
});

test("preflight is answered without exposing permissive CORS", async () => {
  const response = await worker.fetch(request("/v1/me", "OPTIONS"), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("unsupported methods are rejected", async () => {
  const response = await worker.fetch(new Request("https://example.test/v1/me", { method: "DELETE" }), { DB: {} });
  assert.equal(response.status, 405);
});
