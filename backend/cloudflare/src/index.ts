export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  ALLOWED_ORIGIN?: string;
}

type Session = { accountId: string; deviceId: string };
type Json = Record<string, unknown>;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

const error = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

function cors(request: Request, env: Env): Headers {
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key" });
  const origin = request.headers.get("Origin");
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function randomId(): string { return crypto.randomUUID(); }
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function body(request: Request): Promise<Json | null> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
  catch { return null; }
}
function str(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}
async function authenticate(request: Request, env: Env): Promise<Session | null> {
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(header);
  if (!match) return null;
  const hash = await sha256(match[1]);
  const row = await env.DB.prepare(`
    SELECT d.account_id AS accountId, d.id AS deviceId
    FROM device_sessions s JOIN devices d ON d.id=s.device_id
    JOIN accounts a ON a.id=d.account_id
    WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>?
      AND d.revoked_at_ms IS NULL AND a.status='active'
    LIMIT 1
  `).bind(hash, Date.now()).first<Session>();
  return row || null;
}
async function activeConnection(env: Env, a: string, b: string): Promise<boolean> {
  return !!await env.DB.prepare(`SELECT id FROM family_connections WHERE status='active'
    AND ((account_a_id=? AND account_b_id=?) OR (account_a_id=? AND account_b_id=?)) LIMIT 1`)
    .bind(a,b,b,a).first();
}
async function hasConsent(env: Env, owner: string, recipient: string, scope: string): Promise<boolean> {
  return !!await env.DB.prepare(`SELECT id FROM sharing_consents WHERE owner_account_id=? AND recipient_account_id=?
    AND scope=? AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms>?) LIMIT 1`)
    .bind(owner,recipient,scope,Date.now()).first();
}
async function audit(env: Env, actor: string, type: string, subject: string): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_events(id,actor_account_id,event_type,subject_id,created_at_ms) VALUES(?,?,?,?,?)")
    .bind(randomId(),actor,type,subject,Date.now()).run();
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "hamrahyab-api", environment: env.ENVIRONMENT || "unknown" });
  if (!url.pathname.startsWith("/v1/")) return error("not_found","مسیر پیدا نشد",404);
  const session = await authenticate(request, env);
  if (!session) return error("unauthorized","نیاز به ورود معتبر است",401);

  if (request.method === "GET" && url.pathname === "/v1/me") {
    return json({ accountId: session.accountId, deviceId: session.deviceId });
  }

  if (request.method === "POST" && url.pathname === "/v1/invitations") {
    const input = await body(request);
    const ttl = 10 * 60 * 1000;
    const code = randomCode();
    const id = randomId();
    await env.DB.prepare(`INSERT INTO connection_invitations(id,inviter_account_id,code_hash,status,created_at_ms,expires_at_ms)
      VALUES(?,?,?,'pending',?,?)`).bind(id,session.accountId,await sha256(code),Date.now(),Date.now()+ttl).run();
    await audit(env,session.accountId,"invitation.created",id);
    return json({ invitationId:id, code, expiresAtMs:Date.now()+ttl },201);
  }

  if (request.method === "POST" && url.pathname === "/v1/invitations/accept") {
    const input = await body(request);
    const code = str(input?.code,128);
    if (!code) return error("invalid_request","کد دعوت معتبر نیست",400);
    const invitation = await env.DB.prepare(`SELECT id,inviter_account_id AS inviter FROM connection_invitations
      WHERE code_hash=? AND status='pending' AND expires_at_ms>? LIMIT 1`).bind(await sha256(code),Date.now()).first<{id:string;inviter:string}>();
    if (!invitation) return error("invalid_invitation","دعوت پیدا نشد یا منقضی شده است",404);
    if (invitation.inviter === session.accountId) return error("self_connection","اتصال به حساب خودتان مجاز نیست",409);
    const id = randomId(), now = Date.now();
    const [update, connection] = await env.DB.batch([
      env.DB.prepare("UPDATE connection_invitations SET invitee_account_id=?,status='accepted',responded_at_ms=? WHERE id=? AND status='pending' AND expires_at_ms>?")
        .bind(session.accountId,now,invitation.id,now),
      env.DB.prepare("INSERT INTO family_connections(id,account_a_id,account_b_id,status,created_at_ms) VALUES(?,?,?,'active',?)")
        .bind(id,invitation.inviter,session.accountId,now)
    ]);
    if ((update.meta.changes || 0) !== 1) return error("invitation_race","دعوت هم‌زمان تغییر کرده است؛ دوباره تلاش کنید",409);
    await audit(env,session.accountId,"connection.accepted",id);
    return json({ connectionId:id,status:"active", sharingConsentRequired:true },201);
  }

  if (request.method === "POST" && url.pathname === "/v1/location-requests") {
    const input = await body(request);
    const owner = str(input?.ownerAccountId,128);
    const device = str(input?.targetDeviceId,128);
    if (!owner || !device || owner === session.accountId) return error("invalid_request","مشخصات درخواست کامل نیست",400);
    if (!await activeConnection(env,session.accountId,owner)) return error("forbidden","اتصال فعالی وجود ندارد",403);
    if (!await hasConsent(env,owner,session.accountId,"request_location")) return error("consent_required","صاحب دستگاه اجازه درخواست موقعیت را نداده است",403);
    const target = await env.DB.prepare("SELECT id FROM devices WHERE id=? AND account_id=? AND revoked_at_ms IS NULL")
      .bind(device,owner).first();
    if (!target) return error("device_not_found","دستگاه مقصد پیدا نشد",404);
    const id=randomId(), now=Date.now(), expires=now+2*60*1000;
    await env.DB.prepare(`INSERT INTO location_requests(id,requester_account_id,owner_account_id,target_device_id,status,created_at_ms,expires_at_ms)
      VALUES(?,?,?,?,'pending',?,?)`).bind(id,session.accountId,owner,device,now,expires).run();
    await audit(env,session.accountId,"location_request.created",id);
    return json({ requestId:id,status:"pending",expiresAtMs:expires },201);
  }

  if (request.method === "GET" && url.pathname === "/v1/location-requests/inbox") {
    const rows=await env.DB.prepare(`SELECT id AS requestId,requester_account_id AS requesterAccountId,created_at_ms AS createdAtMs,expires_at_ms AS expiresAtMs
      FROM location_requests WHERE owner_account_id=? AND target_device_id=? AND status='pending' AND expires_at_ms>? ORDER BY created_at_ms DESC LIMIT 30`)
      .bind(session.accountId,session.deviceId,Date.now()).all();
    return json({ requests:rows.results });
  }

  const respond = /^\/v1\/location-requests\/([0-9a-f-]+)\/respond$/.exec(url.pathname);
  if (request.method === "POST" && respond) {
    const input=await body(request), decision=str(input?.decision,16);
    if (decision!=="approve" && decision!=="deny") return error("invalid_request","پاسخ باید approve یا deny باشد",400);
    const now=Date.now();
    const result=await env.DB.prepare(`UPDATE location_requests SET status=?,responded_at_ms=?
      WHERE id=? AND owner_account_id=? AND target_device_id=? AND status='pending' AND expires_at_ms>?`)
      .bind(decision==="approve"?"approved":"denied",now,respond[1],session.accountId,session.deviceId,now).run();
    if ((result.meta.changes||0)!==1) return error("request_unavailable","درخواست وجود ندارد یا منقضی شده است",404);
    await audit(env,session.accountId,"location_request."+decision,respond[1]);
    return json({ requestId:respond[1],status:decision==="approve"?"approved":"denied" });
  }

  const sendLocation = /^\/v1\/location-requests\/([0-9a-f-]+)\/location$/.exec(url.pathname);
  if (request.method === "POST" && sendLocation) {
    const input=await body(request);
    const lat=input?.latitude, lon=input?.longitude, accuracy=input?.accuracyMeters, captured=input?.capturedAtMs;
    if (typeof lat!=="number" || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        typeof lon!=="number" || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
        typeof accuracy!=="number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000 ||
        typeof captured!=="number" || !Number.isSafeInteger(captured) || captured > Date.now()+60000 || captured < Date.now()-10*60*1000) {
      return error("invalid_location","داده موقعیت یا زمان ثبت معتبر نیست",400);
    }
    const req=await env.DB.prepare(`SELECT requester_account_id AS requester,owner_account_id AS owner,target_device_id AS device
      FROM location_requests WHERE id=? AND owner_account_id=? AND target_device_id=? AND status='approved' AND expires_at_ms>?`)
      .bind(sendLocation[1],session.accountId,session.deviceId,Date.now()).first<{requester:string;owner:string;device:string}>();
    if (!req || !await hasConsent(env,req.owner,req.requester,"request_location")) return error("forbidden","درخواست یا رضایت معتبر نیست",403);
    const source=str(input?.source,16);
    if (!source || !["gps","network","fused","unknown"].includes(source)) return error("invalid_location","منبع موقعیت معتبر نیست",400);
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO latest_location_fixes(device_id,latitude,longitude,accuracy_m,captured_at_ms,received_at_ms,source)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,
        accuracy_m=excluded.accuracy_m,captured_at_ms=excluded.captured_at_ms,received_at_ms=excluded.received_at_ms,source=excluded.source
        WHERE excluded.captured_at_ms >= latest_location_fixes.captured_at_ms`)
        .bind(session.deviceId,lat,lon,accuracy,captured,now,source),
      env.DB.prepare("UPDATE location_requests SET status='fulfilled',fulfilled_at_ms=? WHERE id=? AND status='approved'")
        .bind(now,sendLocation[1])
    ]);
    await audit(env,session.accountId,"location_request.fulfilled",sendLocation[1]);
    return json({ requestId:sendLocation[1],status:"fulfilled" });
  }

  const last = /^\/v1\/connections\/([0-9a-f-]+)\/last-location$/.exec(url.pathname);
  if (request.method === "GET" && last) {
    const connection=await env.DB.prepare("SELECT account_a_id AS a,account_b_id AS b FROM family_connections WHERE id=? AND status='active'")
      .bind(last[1]).first<{a:string;b:string}>();
    if (!connection || (connection.a!==session.accountId && connection.b!==session.accountId)) return error("forbidden","اتصال مجاز نیست",403);
    const owner=connection.a===session.accountId?connection.b:connection.a;
    if (!await hasConsent(env,owner,session.accountId,"view_last_location")) return error("consent_required","اجازه مشاهده آخرین موقعیت فعال نیست",403);
    const row=await env.DB.prepare(`SELECT latitude,longitude,accuracy_m AS accuracyMeters,captured_at_ms AS capturedAtMs,source
      FROM latest_location_fixes WHERE device_id IN (SELECT id FROM devices WHERE account_id=? AND revoked_at_ms IS NULL)
      ORDER BY captured_at_ms DESC LIMIT 1`).bind(owner).first();
    if (!row) return error("location_unavailable","موقعیت ثبت‌شده‌ای وجود ندارد",404);
    return json({ location:row });
  }

  return error("not_found","مسیر پیدا نشد",404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers=cors(request,env);
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers});
    try {
      const response=await handle(request,env);
      headers.forEach((v,k)=>response.headers.set(k,v));
      return response;
    } catch {
      return error("internal_error","خطای داخلی سرور؛ شناسه درخواست را برای پشتیبانی نگه دارید",500);
    }
  }
};
