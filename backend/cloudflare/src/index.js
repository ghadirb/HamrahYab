const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TTL_MAX_MS = 5 * 60 * 1000;
const LOCATION_MAX_AGE_MS = 10 * 60 * 1000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function fail(status, code, message, requestId) {
  return json({ error: { code, message, requestId } }, status);
}
function nowMs() { return Date.now(); }
function validId(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{12,80}$/.test(value); }
function validNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function parseBearer(request) {
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(value);
  return match ? match[1] : null;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("payload_too_large");
  try { return JSON.parse(raw); } catch { throw new Error("invalid_json"); }
}
function errorResponse(error, requestId) {
  if (error.message === "payload_too_large") return fail(413, "payload_too_large", "حجم درخواست بیش از حد مجاز است", requestId);
  if (error.message === "invalid_json") return fail(400, "invalid_json", "ساختار درخواست معتبر نیست", requestId);
  return fail(500, "internal_error", "خطای داخلی سرور", requestId);
}
async function authenticate(request, env) {
  const token = parseBearer(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, d.id AS device_id, d.account_id
    FROM device_sessions s
    JOIN devices d ON d.id = s.device_id
    JOIN accounts a ON a.id = d.account_id
    WHERE s.token_hash = ? AND s.revoked_at_ms IS NULL AND s.expires_at_ms > ?
      AND d.revoked_at_ms IS NULL AND a.status = 'active'
    LIMIT 1
  `).bind(tokenHash, nowMs()).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE devices SET last_seen_at_ms = ? WHERE id = ?")
    .bind(nowMs(), row.device_id).run();
  return row;
}
async function hasConsent(env, ownerId, recipientId, scope, now) {
  const row = await env.DB.prepare(`
    SELECT id FROM sharing_consents
    WHERE owner_account_id = ? AND recipient_account_id = ? AND scope = ?
      AND revoked_at_ms IS NULL AND granted_at_ms <= ?
      AND (expires_at_ms IS NULL OR expires_at_ms > ?)
    ORDER BY granted_at_ms DESC LIMIT 1
  `).bind(ownerId, recipientId, scope, now, now).first();
  return Boolean(row);
}
async function isConnected(env, left, right) {
  const row = await env.DB.prepare(`
    SELECT id FROM family_connections
    WHERE status = 'active'
      AND ((account_a_id = ? AND account_b_id = ?) OR (account_a_id = ? AND account_b_id = ?))
    LIMIT 1
  `).bind(left, right, right, left).first();
  return row;
}
async function route(request, env, actor, requestId, url) {
  const path = url.pathname;
  const method = request.method;
  if (method === "GET" && path === "/v1/me") {
    return json({ accountId: actor.account_id, deviceId: actor.device_id });
  }
  if (method === "GET" && path === "/v1/location-requests/inbox") {
    const rows = await env.DB.prepare(`
      SELECT id, requester_account_id AS requesterAccountId, created_at_ms AS createdAtMs, expires_at_ms AS expiresAtMs
      FROM location_requests
      WHERE owner_account_id = ? AND target_device_id = ? AND status = 'pending' AND expires_at_ms > ?
        AND EXISTS (
          SELECT 1 FROM family_connections c
          WHERE c.status = 'active'
            AND ((c.account_a_id = location_requests.requester_account_id AND c.account_b_id = location_requests.owner_account_id)
              OR (c.account_b_id = location_requests.requester_account_id AND c.account_a_id = location_requests.owner_account_id))
        )
        AND EXISTS (
          SELECT 1 FROM sharing_consents sc
          WHERE sc.owner_account_id = location_requests.owner_account_id
            AND sc.recipient_account_id = location_requests.requester_account_id
            AND sc.scope = 'request_location' AND sc.revoked_at_ms IS NULL
            AND sc.granted_at_ms <= ? AND (sc.expires_at_ms IS NULL OR sc.expires_at_ms > ?)
        )
      ORDER BY created_at_ms ASC LIMIT 50
    `).bind(actor.account_id, actor.device_id, nowMs(), nowMs(), nowMs()).all();
    return json({ requests: rows.results || [] });
  }
  const createRequestMatch = path.match(/^\/v1\/connections\/([A-Za-z0-9_-]{12,80})\/location-requests$/);
  if (method === "POST" && createRequestMatch) {
    const connection = await env.DB.prepare(`
      SELECT account_a_id, account_b_id FROM family_connections
      WHERE id = ? AND status = 'active'
        AND (account_a_id = ? OR account_b_id = ?) LIMIT 1
    `).bind(createRequestMatch[1], actor.account_id, actor.account_id).first();
    if (!connection) return fail(404, "connection_not_found", "ارتباط فعال پیدا نشد", requestId);
    const ownerId = connection.account_a_id === actor.account_id ? connection.account_b_id : connection.account_a_id;
    const now = nowMs();
    if (!await hasConsent(env, ownerId, actor.account_id, "request_location", now)) {
      return fail(403, "consent_required", "صاحب دستگاه اجازه درخواست موقعیت را فعال نکرده است", requestId);
    }
    const target = await env.DB.prepare(`
      SELECT id FROM devices WHERE account_id = ? AND revoked_at_ms IS NULL
      ORDER BY COALESCE(last_seen_at_ms, created_at_ms) DESC LIMIT 1
    `).bind(ownerId).first();
    if (!target) return fail(409, "no_active_device", "برای این حساب دستگاه فعالی ثبت نشده است", requestId);
    const pendingCount = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM location_requests
      WHERE requester_account_id = ? AND owner_account_id = ?
        AND status IN ('pending', 'approved') AND expires_at_ms > ?
    `).bind(actor.account_id, ownerId, now).first();
    if ((pendingCount?.total || 0) >= 5) {
      return fail(429, "too_many_pending_requests", "تعداد درخواست‌های باز بیش از حد مجاز است", requestId);
    }
    const id = crypto.randomUUID();
    const expiresAt = now + REQUEST_TTL_MAX_MS;
    await env.DB.prepare(`
      INSERT INTO location_requests
        (id, requester_account_id, owner_account_id, target_device_id, status, created_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).bind(id, actor.account_id, ownerId, target.id, now, expiresAt).run();
    await env.DB.prepare(`
      INSERT INTO audit_events (id, actor_account_id, event_type, subject_id, created_at_ms)
      VALUES (?, ?, 'location_request_created', ?, ?)
    `).bind(crypto.randomUUID(), actor.account_id, id, now).run();
    return json({ requestId: id, status: "pending", expiresAtMs: expiresAt }, 201);
  }
  const connectionRevokeMatch = path.match(/^\/v1\/connections\/([A-Za-z0-9_-]{12,80})$/);
  if (method === "DELETE" && connectionRevokeMatch) {
    const c = await env.DB.prepare("SELECT account_a_id, account_b_id FROM family_connections WHERE id = ? AND status = 'active' AND (account_a_id = ? OR account_b_id = ?) LIMIT 1").bind(connectionRevokeMatch[1], actor.account_id, actor.account_id).first();
    if (!c) return fail(404, "connection_not_found", "ارتباط فعال پیدا نشد", requestId);
    const other = c.account_a_id === actor.account_id ? c.account_b_id : c.account_a_id;
    const now = nowMs();
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE family_connections SET status = 'revoked', revoked_at_ms = ? WHERE id = ? AND status = 'active' AND (account_a_id = ? OR account_b_id = ?)").bind(now, connectionRevokeMatch[1], actor.account_id, actor.account_id),
      env.DB.prepare("UPDATE location_requests SET status = 'cancelled' WHERE status IN ('pending', 'approved') AND ((requester_account_id = ? AND owner_account_id = ?) OR (requester_account_id = ? AND owner_account_id = ?))").bind(actor.account_id, other, other, actor.account_id)
    ]);
    if (!result?.[0]?.meta?.changes) return fail(409, "connection_unavailable", "ارتباط پیش از لغو تغییر کرده است", requestId);
    return json({ connectionId: connectionRevokeMatch[1], status: "revoked" });
  }
  const consentGrantMatch = path.match(/^\/v1\/connections\/([A-Za-z0-9_-]{12,80})\/consents$/);
  if (method === "PUT" && consentGrantMatch) {
    const body = await readJson(request);
    const scopes = ["request_location", "view_last_location", "live_sharing", "emergency_location", "manage_geofences", "receive_sos"];
    if (!scopes.includes(body?.scope)) return fail(400, "invalid_scope", "دامنه رضایت معتبر نیست", requestId);
    const now = nowMs();
    const expiresAt = body.expiresAtMs === undefined || body.expiresAtMs === null ? null : body.expiresAtMs;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 365 * 24 * 60 * 60 * 1000)) return fail(400, "invalid_expiry", "زمان انقضای رضایت معتبر نیست", requestId);
    const c = await env.DB.prepare("SELECT account_a_id, account_b_id FROM family_connections WHERE id = ? AND status = 'active' AND (account_a_id = ? OR account_b_id = ?) LIMIT 1").bind(consentGrantMatch[1], actor.account_id, actor.account_id).first();
    if (!c) return fail(404, "connection_not_found", "ارتباط فعال پیدا نشد", requestId);
    const recipient = c.account_a_id === actor.account_id ? c.account_b_id : c.account_a_id;
    const consentId = crypto.randomUUID();
    const result = await env.DB.prepare("INSERT INTO sharing_consents (id, owner_account_id, recipient_account_id, scope, granted_at_ms, expires_at_ms) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM family_connections c WHERE c.id = ? AND c.status = 'active' AND ((c.account_a_id = ? AND c.account_b_id = ?) OR (c.account_b_id = ? AND c.account_a_id = ?)))").bind(consentId, actor.account_id, recipient, body.scope, now, expiresAt, consentGrantMatch[1], actor.account_id, recipient, actor.account_id, recipient).run();
    if (!result.meta?.changes) return fail(409, "connection_unavailable", "ارتباط پیش از ثبت رضایت تغییر کرده است", requestId);
    await env.DB.prepare("INSERT INTO audit_events (id, actor_account_id, event_type, subject_id, created_at_ms) VALUES (?, ?, 'consent_granted', ?, ?)").bind(crypto.randomUUID(), actor.account_id, consentId, now).run();
    return json({ consentId, connectionId: consentGrantMatch[1], scope: body.scope, expiresAtMs: expiresAt }, 201);
  }
  const consentRevokeMatch = path.match(/^\/v1\/consents\/([A-Za-z0-9_-]{12,80})$/);
  if (method === "DELETE" && consentRevokeMatch) {
    const consent = await env.DB.prepare("SELECT recipient_account_id, scope FROM sharing_consents WHERE id = ? AND owner_account_id = ? AND revoked_at_ms IS NULL LIMIT 1").bind(consentRevokeMatch[1], actor.account_id).first();
    if (!consent) return fail(404, "consent_not_found", "رضایت فعال پیدا نشد", requestId);
    const now = nowMs();
    const revoke = env.DB.prepare("UPDATE sharing_consents SET revoked_at_ms = ? WHERE id = ? AND owner_account_id = ? AND revoked_at_ms IS NULL").bind(now, consentRevokeMatch[1], actor.account_id);
    if (consent.scope === "request_location") {
      const results = await env.DB.batch([
        revoke,
        env.DB.prepare("UPDATE location_requests SET status = 'cancelled' WHERE requester_account_id = ? AND owner_account_id = ? AND status IN ('pending', 'approved') AND EXISTS (SELECT 1 FROM sharing_consents sc WHERE sc.id = ? AND sc.revoked_at_ms = ?)").bind(consent.recipient_account_id, actor.account_id, consentRevokeMatch[1], now)
      ]);
      if (!results?.[0]?.meta?.changes) return fail(409, "consent_unavailable", "رضایت پیش از لغو تغییر کرده است", requestId);
    } else {
      const result = await revoke.run();
      if (!result.meta?.changes) return fail(409, "consent_unavailable", "رضایت پیش از لغو تغییر کرده است", requestId);
    }
    await env.DB.prepare("INSERT INTO audit_events (id, actor_account_id, event_type, subject_id, created_at_ms) VALUES (?, ?, 'consent_revoked', ?, ?)").bind(crypto.randomUUID(), actor.account_id, consentRevokeMatch[1], now).run();
    return json({ consentId: consentRevokeMatch[1], status: "revoked" });
  }
  const responseMatch = path.match(/^\/v1\/location-requests\/([A-Za-z0-9_-]{12,80})\/respond$/);
  if (method === "POST" && responseMatch) {
    const body = await readJson(request);
    if (body?.decision !== "approve" && body?.decision !== "deny") {
      return fail(400, "invalid_decision", "تصمیم باید approve یا deny باشد", requestId);
    }
    const now = nowMs();
    const requestRow = await env.DB.prepare(`
      SELECT requester_account_id FROM location_requests
      WHERE id = ? AND owner_account_id = ? AND target_device_id = ?
        AND status = 'pending' AND expires_at_ms > ?
      LIMIT 1
    `).bind(responseMatch[1], actor.account_id, actor.device_id, now).first();
    if (!requestRow) return fail(409, "request_unavailable", "درخواست منقضی یا قبلاً پاسخ داده شده است", requestId);
    if (body.decision === "approve") {
      if (!await isConnected(env, requestRow.requester_account_id, actor.account_id)) {
        return fail(403, "connection_revoked", "ارتباط این درخواست دیگر فعال نیست", requestId);
      }
      if (!await hasConsent(env, actor.account_id, requestRow.requester_account_id, "request_location", now)) {
        return fail(403, "consent_required", "اجازه درخواست موقعیت لغو شده است", requestId);
      }
    }
    const status = body.decision === "approve" ? "approved" : "denied";
    const result = await env.DB.prepare(`
      UPDATE location_requests SET status = ?, responded_at_ms = ?
      WHERE id = ? AND owner_account_id = ? AND target_device_id = ?
        AND status = 'pending' AND expires_at_ms > ?
        AND (
          ? = 'denied' OR (
            EXISTS (
              SELECT 1 FROM family_connections c
              WHERE c.status = 'active'
                AND ((c.account_a_id = location_requests.requester_account_id AND c.account_b_id = location_requests.owner_account_id)
                  OR (c.account_b_id = location_requests.requester_account_id AND c.account_a_id = location_requests.owner_account_id))
            )
            AND EXISTS (
              SELECT 1 FROM sharing_consents sc
              WHERE sc.owner_account_id = location_requests.owner_account_id
                AND sc.recipient_account_id = location_requests.requester_account_id
                AND sc.scope = 'request_location' AND sc.revoked_at_ms IS NULL
                AND sc.granted_at_ms <= ? AND (sc.expires_at_ms IS NULL OR sc.expires_at_ms > ?)
            )
          )
        )
    `).bind(status, now, responseMatch[1], actor.account_id, actor.device_id, now, status, now, now).run();
    if (!result.meta?.changes) return fail(409, "request_unavailable", "درخواست منقضی یا قبلاً پاسخ داده شده است", requestId);
    await env.DB.prepare(`
      INSERT INTO audit_events (id, actor_account_id, event_type, subject_id, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), actor.account_id, `location_request_${status}`, responseMatch[1], now).run();
    return json({ requestId: responseMatch[1], status });
  }
  const locationMatch = path.match(/^\/v1\/location-requests\/([A-Za-z0-9_-]{12,80})\/location$/);
  if (method === "POST" && locationMatch) {
    const body = await readJson(request);
    const now = nowMs();
    if (!validNumber(body?.latitude) || body.latitude < -90 || body.latitude > 90 ||
        !validNumber(body?.longitude) || body.longitude < -180 || body.longitude > 180 ||
        !validNumber(body?.accuracyMeters) || body.accuracyMeters < 0 || body.accuracyMeters > 100000 ||
        !Number.isSafeInteger(body?.capturedAtMs) || body.capturedAtMs < 0 ||
        body.capturedAtMs > now + 60_000 || body.capturedAtMs < now - LOCATION_MAX_AGE_MS ||
        !["gps", "network", "fused", "unknown"].includes(body?.source)) {
      return fail(400, "invalid_location", "اطلاعات موقعیت معتبر یا به‌روز نیست", requestId);
    }
    const pending = await env.DB.prepare(`
      SELECT requester_account_id, owner_account_id FROM location_requests
      WHERE id = ? AND owner_account_id = ? AND target_device_id = ?
        AND status = 'approved' AND expires_at_ms > ?
    `).bind(locationMatch[1], actor.account_id, actor.device_id, now).first();
    if (!pending) return fail(403, "consent_required", "درخواست تأییدشده و معتبری برای ارسال موقعیت وجود ندارد", requestId);
    if (!await isConnected(env, pending.requester_account_id, actor.account_id)) {
      return fail(403, "connection_revoked", "ارتباط پیش از ارسال موقعیت لغو شده است", requestId);
    }
    if (!await hasConsent(env, actor.account_id, pending.requester_account_id, "request_location", now)) {
      return fail(403, "consent_required", "اجازه فعال برای ارسال موقعیت وجود ندارد", requestId);
    }
    const stored = await env.DB.prepare(`
      INSERT INTO latest_location_fixes (device_id, latitude, longitude, accuracy_m, captured_at_ms, received_at_ms, source)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM family_connections c
        WHERE c.status = 'active'
          AND ((c.account_a_id = ? AND c.account_b_id = ?) OR (c.account_b_id = ? AND c.account_a_id = ?))
      )
      AND EXISTS (
        SELECT 1 FROM sharing_consents sc
        WHERE sc.owner_account_id = ? AND sc.recipient_account_id = ?
          AND sc.scope = 'request_location' AND sc.revoked_at_ms IS NULL
          AND sc.granted_at_ms <= ? AND (sc.expires_at_ms IS NULL OR sc.expires_at_ms > ?)
      )
      AND EXISTS (
        SELECT 1 FROM location_requests lr
        WHERE lr.id = ? AND lr.owner_account_id = ? AND lr.requester_account_id = ?
          AND lr.target_device_id = ? AND lr.status = 'approved' AND lr.expires_at_ms > ?
      )
      ON CONFLICT(device_id) DO UPDATE SET
        latitude = excluded.latitude, longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m, captured_at_ms = excluded.captured_at_ms,
        received_at_ms = excluded.received_at_ms, source = excluded.source
      WHERE excluded.captured_at_ms >= latest_location_fixes.captured_at_ms
    `).bind(
      actor.device_id, body.latitude, body.longitude, body.accuracyMeters, body.capturedAtMs, now, body.source,
      pending.requester_account_id, actor.account_id, actor.account_id, pending.requester_account_id,
      actor.account_id, pending.requester_account_id, now, now,
      locationMatch[1], actor.account_id, pending.requester_account_id, actor.device_id, now
    ).run();
    if (!stored.meta?.changes) {
      return fail(403, "authorization_changed", "اجازه یا ارتباط پیش از ثبت موقعیت تغییر کرده است", requestId);
    }
    await env.DB.prepare("UPDATE location_requests SET status = 'fulfilled', fulfilled_at_ms = ? WHERE id = ? AND status = 'approved'")
      .bind(now, locationMatch[1]).run();
    await env.DB.prepare("INSERT INTO audit_events (id, actor_account_id, event_type, subject_id, created_at_ms) VALUES (?, ?, 'location_uploaded', ?, ?)")
      .bind(crypto.randomUUID(), actor.account_id, locationMatch[1], now).run();
    return json({ requestId: locationMatch[1], accepted: true }, 201);
  }
  const lastMatch = path.match(/^\/v1\/connections\/([A-Za-z0-9_-]{12,80})\/last-location$/);
  if (method === "GET" && lastMatch) {
    const connection = await env.DB.prepare(`
      SELECT account_a_id, account_b_id FROM family_connections
      WHERE id = ? AND status = 'active'
        AND (account_a_id = ? OR account_b_id = ?) LIMIT 1
    `).bind(lastMatch[1], actor.account_id, actor.account_id).first();
    if (!connection) return fail(404, "connection_not_found", "ارتباط فعال پیدا نشد", requestId);
    const ownerId = connection.account_a_id === actor.account_id ? connection.account_b_id : connection.account_a_id;
    const now = nowMs();
    if (!await hasConsent(env, ownerId, actor.account_id, "view_last_location", now)) {
      return fail(403, "consent_required", "اجازه مشاهده آخرین موقعیت فعال نیست", requestId);
    }
    const fix = await env.DB.prepare(`
      SELECT l.latitude, l.longitude, l.accuracy_m AS accuracyMeters,
             l.captured_at_ms AS capturedAtMs, l.received_at_ms AS receivedAtMs, l.source
      FROM latest_location_fixes l JOIN devices d ON d.id = l.device_id
      WHERE d.account_id = ? AND d.revoked_at_ms IS NULL
        AND EXISTS (SELECT 1 FROM family_connections c WHERE c.id = ? AND c.status = 'active' AND ((c.account_a_id = ? AND c.account_b_id = ?) OR (c.account_b_id = ? AND c.account_a_id = ?)))
        AND EXISTS (SELECT 1 FROM sharing_consents sc WHERE sc.owner_account_id = ? AND sc.recipient_account_id = ? AND sc.scope = 'view_last_location' AND sc.revoked_at_ms IS NULL AND sc.granted_at_ms <= ? AND (sc.expires_at_ms IS NULL OR sc.expires_at_ms > ?))
      ORDER BY l.captured_at_ms DESC LIMIT 1
    `).bind(ownerId, lastMatch[1], actor.account_id, ownerId, ownerId, actor.account_id, ownerId, actor.account_id, now, now).first();
    if (!fix) return json({ location: null });
    return json({ location: { ...fix, isFresh: now - fix.capturedAtMs <= LOCATION_MAX_AGE_MS } });
  }
  return fail(404, "not_found", "مسیر مورد نظر پیدا نشد", requestId);
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-max-age": "600" } });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", service: "hamrahyab-api", version: 1 });
    }
    if (!url.pathname.startsWith("/v1/")) return fail(404, "not_found", "مسیر مورد نظر پیدا نشد", requestId);
    if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
      return json({ error: { code: "method_not_allowed", message: "روش درخواست پشتیبانی نمی‌شود", requestId } }, 405, { allow: "GET, POST, PUT, DELETE, OPTIONS" });
    }
    if (!env.DB) return fail(503, "service_unavailable", "پایگاه داده آماده نیست", requestId);
    try {
      const actor = await authenticate(request, env);
      if (!actor) return fail(401, "unauthorized", "نشست معتبر نیست", requestId);
      return await route(request, env, actor, requestId, url);
    } catch (error) {
      return errorResponse(error, requestId);
    }
  }
};
