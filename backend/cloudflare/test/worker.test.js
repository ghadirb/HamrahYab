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

function authenticatedDb({ consent = true, pending = 0 } = {}) {
  const statements = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT s.id AS session_id")) {
            return { session_id: "session-123", device_id: "device-target-123", account_id: "requester-123" };
          }
          if (sql.includes("SELECT account_a_id, account_b_id")) {
            return { account_a_id: "requester-123", account_b_id: "owner-456" };
          }
          if (sql.includes("SELECT id FROM sharing_consents")) return consent ? { id: "consent-1" } : null;
          if (sql.includes("SELECT id FROM devices")) return { id: "device-owner-456" };
          if (sql.includes("SELECT COUNT(*) AS total")) return { total: pending };
          return null;
        },
        async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; },
        async all() { return { results: [] }; }
      };
      return statement;
    }
  };
  return { DB, statements };
}

test("location request creation requires an active explicit consent", async () => {
  const { DB } = authenticatedDb({ consent: false });
  const response = await worker.fetch(
    new Request("https://example.test/v1/connections/connection-123456/location-requests", {
      method: "POST",
      headers: { authorization: "Bearer " + "x".repeat(40) }
    }),
    { DB }
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "consent_required");
});

test("location request creation is limited and expires within five minutes", async () => {
  const { DB, statements } = authenticatedDb({ consent: true, pending: 0 });
  const response = await worker.fetch(
    new Request("https://example.test/v1/connections/connection-123456/location-requests", {
      method: "POST",
      headers: { authorization: "Bearer " + "x".repeat(40) }
    }),
    { DB }
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "pending");
  assert.ok(body.requestId);
  assert.ok(body.expiresAtMs > Date.now());
  assert.ok(body.expiresAtMs <= Date.now() + 5 * 60 * 1000 + 100);
  assert.ok(statements.some((entry) => entry.sql.includes("INSERT INTO location_requests")));
});

function responseDb({ connected = true, consent = true } = {}) {
  const writes = [];
  const DB = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT s.id AS session_id")) {
            return { session_id: "session-123", device_id: "device-target-123", account_id: "owner-456" };
          }
          if (sql.includes("SELECT requester_account_id FROM location_requests")) {
            return { requester_account_id: "requester-123" };
          }
          if (sql.includes("SELECT id FROM family_connections")) return connected ? { id: "connection-1" } : null;
          if (sql.includes("SELECT id FROM sharing_consents")) return consent ? { id: "consent-1" } : null;
          return null;
        },
        async run() { writes.push(sql); return { meta: { changes: 1 } }; },
        async all() { return { results: [] }; }
      };
      return statement;
    }
  };
  return { DB, writes };
}

test("approval is rejected after the family connection is revoked", async () => {
  const { DB, writes } = responseDb({ connected: false, consent: true });
  const response = await worker.fetch(
    new Request("https://example.test/v1/location-requests/request-123456/respond", {
      method: "POST",
      headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }),
    { DB }
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "connection_revoked");
  assert.equal(writes.some((sql) => sql.includes("UPDATE location_requests SET status")), false);
});

test("approval is rejected after location consent is revoked", async () => {
  const { DB, writes } = responseDb({ connected: true, consent: false });
  const response = await worker.fetch(
    new Request("https://example.test/v1/location-requests/request-123456/respond", {
      method: "POST",
      headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }),
    { DB }
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "consent_required");
  assert.equal(writes.some((sql) => sql.includes("UPDATE location_requests SET status")), false);
});
