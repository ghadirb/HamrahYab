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
  const response = await worker.fetch(new Request("https://example.test/v1/me", { method: "PATCH" }), { DB: {} });
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
  const requestInsert = statements.find((entry) => entry.sql.includes("INSERT INTO location_requests"))?.sql || "";
  assert.match(requestInsert, /SELECT \?, \?, \?, \?, 'pending'/);
  assert.match(requestInsert, /family_connections c WHERE c.id = \? AND c.status = 'active'/);
  assert.match(requestInsert, /sharing_consents sc WHERE sc.owner_account_id = \?/);
  assert.match(requestInsert, /SELECT COUNT\(\*\) FROM location_requests/);
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
          if (sql.includes("SELECT requester_account_id FROM location_requests") || sql.includes("SELECT requester_account_id, owner_account_id, responded_at_ms FROM location_requests")) {
            return { requester_account_id: "requester-123", owner_account_id: "owner-456", responded_at_ms: Date.now() - 5_000 };
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

function revocationDb({ consentScope = "request_location" } = {}) {
  const batches = [];
  const statements = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT s.id AS session_id")) return { session_id: "s1", device_id: "d1", account_id: "owner-456" };
          if (sql.includes("SELECT account_a_id, account_b_id")) return { account_a_id: "requester-123", account_b_id: "owner-456" };
          if (sql.includes("SELECT recipient_account_id, scope FROM sharing_consents")) return { recipient_account_id: "requester-123", scope: consentScope };
          return null;
        },
        async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(items) {
      batches.push(items.map(item => ({ sql: item.sql, values: item.values })));
      return items.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, batches, statements };
}

test("connection revocation cancels pending and approved location requests atomically", async () => {
  const { DB, batches } = revocationDb();
  const response = await worker.fetch(new Request("https://example.test/v1/connections/connection-123456", {
    method: "DELETE", headers: { authorization: "Bearer " + "x".repeat(40) }
  }), { DB });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "revoked");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
  assert.match(batches[0][0].sql, /UPDATE family_connections SET status = 'revoked'/);
  assert.match(batches[0][1].sql, /UPDATE location_requests SET status = 'cancelled'/);
  assert.match(batches[0][2].sql, /UPDATE sharing_consents SET revoked_at_ms/);
});

test("consent revocation cancels open location requests in the same D1 batch", async () => {
  const { DB, batches } = revocationDb({ consentScope: "request_location" });
  const response = await worker.fetch(new Request("https://example.test/v1/consents/consent-123456", {
    method: "DELETE", headers: { authorization: "Bearer " + "x".repeat(40) }
  }), { DB });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "revoked");
  assert.equal(batches.length, 1);
  assert.match(batches[0][0].sql, /UPDATE sharing_consents SET revoked_at_ms/);
  assert.match(batches[0][1].sql, /UPDATE location_requests SET status = 'cancelled'/);
});

test("last-location query rechecks active connection and consent in the read statement", async () => {
  const { DB } = authenticatedDb({ consent: true });
  const statements = [];
  const originalPrepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    const originalFirst = statement.first.bind(statement);
    statement.first = async () => {
      statements.push(sql);
      if (sql.includes("SELECT l.latitude")) return null;
      return originalFirst();
    };
    return statement;
  };
  const response = await worker.fetch(new Request("https://example.test/v1/connections/connection-123456/last-location", {
    method: "GET", headers: { authorization: "Bearer " + "x".repeat(40) }
  }), { DB });
  assert.equal(response.status, 200);
  const read = statements.find(sql => sql.includes("SELECT l.latitude"));
  assert.match(read, /family_connections c WHERE c.id = \? AND c.status = 'active'/);
  assert.match(read, /sharing_consents sc WHERE sc.owner_account_id = \?/);
  assert.ok(read.includes('l.captured_at_ms >= sc.granted_at_ms'));
});

test("consent grant replaces prior active grant and is tied to an active connection", async () => {
  const { DB, batches } = revocationDb();
  const response = await worker.fetch(new Request("https://example.test/v1/connections/connection-123456/consents", {
    method: "PUT",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ scope: "request_location", expiresAtMs: Date.now() + 60_000 })
  }), { DB });
  assert.equal(response.status, 201);
  assert.equal(batches.length, 1);
  assert.match(batches[0][0].sql, /UPDATE sharing_consents SET revoked_at_ms/);
  assert.match(batches[0][1].sql, /INSERT INTO sharing_consents/);
  assert.match(batches[0][1].sql, /family_connections c WHERE c.id = \?/);
});

test("location upload is rejected after connection revocation", async () => {
  const { DB, writes } = responseDb({ connected: false, consent: true });
  const response = await worker.fetch(new Request("https://example.test/v1/location-requests/request-123456/location", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ latitude: 35.7, longitude: 51.4, accuracyMeters: 12, capturedAtMs: Date.now(), source: "gps" })
  }), { DB });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "connection_revoked");
  assert.equal(writes.some(sql => sql.includes("INSERT INTO latest_location_fixes")), false);
});

test("location upload is rejected after consent revocation", async () => {
  const { DB, writes } = responseDb({ connected: true, consent: false });
  const response = await worker.fetch(new Request("https://example.test/v1/location-requests/request-123456/location", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ latitude: 35.7, longitude: 51.4, accuracyMeters: 12, capturedAtMs: Date.now(), source: "gps" })
  }), { DB });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "consent_required");
  assert.equal(writes.some(sql => sql.includes("INSERT INTO latest_location_fixes")), false);
});

test("location captured before request approval is rejected", async () => {
  const { DB, writes } = responseDb({ connected: true, consent: true });
  const response = await worker.fetch(new Request("https://example.test/v1/location-requests/request-123456/location", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ latitude: 35.7, longitude: 51.4, accuracyMeters: 12, capturedAtMs: Date.now() - 10_000, source: "gps" })
  }), { DB });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "location_captured_before_approval");
  assert.equal(writes.some(sql => sql.includes("INSERT INTO latest_location_fixes")), false);
});

function invitationDb({ invitation = true, existing = null, recent = 0, inviter = "account-z" } = {}) {
  const statements = [];
  const batches = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("SELECT s.id AS session_id")) return { session_id: "session-1", device_id: "device-1", account_id: "account-a" };
          if (sql.includes("SELECT COUNT(*) AS total FROM connection_invitations")) return { total: recent };
          if (sql.includes("SELECT id, inviter_account_id FROM connection_invitations")) return invitation ? { id: "invite-1", inviter_account_id: inviter } : null;
          if (sql.includes("SELECT id, status FROM family_connections")) return existing;
          if (sql.includes("SELECT id FROM family_connections")) return { id: "connection-1" };
          return null;
        },
        async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(items) {
      batches.push(items.map(item => ({ sql: item.sql, values: item.values })));
      return items.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, statements, batches };
}

test("invitation creation returns a high-entropy one-time code and stores only its hash", async () => {
  const { DB, statements } = invitationDb();
  const response = await worker.fetch(new Request("https://example.test/v1/invitations", {
    method: "POST", headers: { authorization: "Bearer " + "x".repeat(40) }
  }), { DB });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.code, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(body.expiresAtMs > Date.now());
  const insert = statements.find(item => item.sql.includes("INSERT INTO connection_invitations"));
  assert.ok(insert);
  assert.equal(insert.values[2].length, 64);
  assert.notEqual(insert.values[2], body.code);
  assert.ok(insert.sql.includes("SELECT COUNT(*) FROM connection_invitations"));
});

test("invitation creation enforces a per-account daily issuance cap", async () => {
  const { DB, statements } = invitationDb({ recent: 10 });
  const response = await worker.fetch(new Request("https://example.test/v1/invitations", {
    method: "POST", headers: { authorization: "Bearer " + "x".repeat(40) }
  }), { DB });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, "invitation_limit_reached");
  assert.equal(statements.some(item => item.sql.includes("INSERT INTO connection_invitations")), false);
});

test("invitation acceptance creates a canonical active connection", async () => {
  const { DB, batches } = invitationDb();
  const response = await worker.fetch(new Request("https://example.test/v1/invitations/accept", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ code: "A".repeat(43) })
  }), { DB });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "active");
  assert.equal(body.connectionId, "connection-1");
  assert.equal(batches.length, 1);
  assert.match(batches[0][0].sql, /UPDATE connection_invitations SET status = 'accepted'/);
  assert.match(batches[0][1].sql, /INSERT INTO family_connections/);
  assert.match(batches[0][1].sql, /ON CONFLICT\(account_a_id, account_b_id\) DO UPDATE/);
  assert.deepEqual(batches[0][1].values.slice(1, 3), ["account-a", "account-z"]);
});

test("an account cannot accept its own invitation", async () => {
  const { DB, batches } = invitationDb({ inviter: "account-a" });
  const response = await worker.fetch(new Request("https://example.test/v1/invitations/accept", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ code: "A".repeat(43) })
  }), { DB });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "self_invitation");
  assert.equal(batches.length, 0);
});

test("invitation acceptance rejects an already active connection", async () => {
  const { DB, batches } = invitationDb({ existing: { id: "existing-connection", status: "active" } });
  const response = await worker.fetch(new Request("https://example.test/v1/invitations/accept", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ code: "A".repeat(43) })
  }), { DB });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "already_connected");
  assert.equal(batches.length, 0);
});

test("invitation acceptance reactivates a revoked canonical connection", async () => {
  const { DB, batches } = invitationDb({ existing: { id: "old-connection", status: "revoked" } });
  const response = await worker.fetch(new Request("https://example.test/v1/invitations/accept", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ code: "A".repeat(43) })
  }), { DB });
  assert.equal(response.status, 201);
  assert.equal(batches.length, 1);
  assert.match(batches[0][1].sql, /DO UPDATE SET status = 'active'/);
  assert.match(batches[0][1].sql, /revoked_at_ms = NULL/);
});

test("location upload atomically rechecks target device and approval timestamp", async () => {
  const { DB, writes } = responseDb({ connected: true, consent: true });
  const response = await worker.fetch(new Request("https://example.test/v1/location-requests/request-123456/location", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ latitude: 35.7, longitude: 51.4, accuracyMeters: 12, capturedAtMs: Date.now(), source: "gps" })
  }), { DB });
  assert.equal(response.status, 201);
  const insert = writes.find(sql => sql.includes("INSERT INTO latest_location_fixes")) || "";
  assert.ok(insert.includes("AND ? >= lr.responded_at_ms"));
  assert.ok(insert.includes("FROM devices d WHERE d.id = ? AND d.account_id = ? AND d.revoked_at_ms IS NULL"));
});

test("invitation decline consumes the one-time code without creating a connection", async () => {
  const { DB, statements, batches } = invitationDb();
  const response = await worker.fetch(new Request("https://example.test/v1/invitations/decline", {
    method: "POST",
    headers: { authorization: "Bearer " + "x".repeat(40), "content-type": "application/json" },
    body: JSON.stringify({ code: "A".repeat(43) })
  }), { DB });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "declined");
  const update = statements.find(item => item.sql.includes("UPDATE connection_invitations SET status = 'declined'"));
  assert.ok(update);
  assert.equal(batches.length, 0);
});
