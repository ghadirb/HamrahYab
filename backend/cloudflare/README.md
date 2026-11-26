# Cloudflare backend foundation

This directory defines the first deployable backend boundary for HamrahYab. It intentionally does **not** contain production credentials, a hard-coded API key, or a live deployment.

## Target architecture

- Cloudflare Worker: HTTPS API edge and request validation.
- Cloudflare D1: relational metadata store (SQLite-compatible).
- Cloudflare Queues or a provider adapter: asynchronous notification delivery, added only after a provider is selected and tested.
- Optional Durable Objects: only if later measurements show a need for realtime coordination; not required for the MVP.

The Android application must communicate only with the documented API contract. It must never contain a Cloudflare API token, D1 credential, service-role secret, or provider secret.

## Initial setup (when ready to deploy)

1. Create a Cloudflare account and a dedicated Worker for HamrahYab.
2. Create a D1 database in the intended region.
3. Bind the database as `DB` in the Worker environment.
4. Apply migrations in order using Wrangler.
5. Configure a production API hostname and restrict CORS to the actual Android/web origins (native Android requests do not need permissive wildcard CORS).
6. Add secrets through `wrangler secret put` or the Cloudflare dashboard. Never commit secrets to Git.
7. Deploy to a staging environment first; run API, authorization, rate-limit, and retention tests before production.

Example commands (database and Worker names are placeholders):

```bash
npx wrangler d1 create hamrahyab-staging
npx wrangler d1 migrations apply hamrahyab-staging --remote
npx wrangler deploy --env staging
```

## Security requirements before any real user data

- Account authentication must be provided by a verified identity flow; do not treat a device ID or pairing code as authentication.
- Store only hashes of bearer/refresh tokens and pairing codes.
- Use short-lived, single-use pairing codes; enforce attempt limits and expiry on the server.
- Authorize every operation against account ownership, active connection, scope-specific consent, and request expiry.
- Make revocation effective immediately at the API authorization layer.
- Do not accept client-supplied account ownership as proof of identity.
- Apply per-account, per-device, and per-IP rate limits.
- Validate coordinates, accuracy, timestamps, and payload sizes; reject implausible/future timestamps.
- Never return a location to a requester unless the owner has an active matching consent.
- Use TLS; avoid logging coordinates, tokens, pairing codes, phone numbers, or other sensitive payloads.
- Define and enforce location retention and deletion before storing production location data.
- Push messages contain opaque event IDs only, never coordinates or other location data.
- A push notification is a wake-up hint, not authorization. The receiving app must fetch the request over authenticated HTTPS and show the user an explicit action.

## Current status

This is a foundation and migration only. No Cloudflare resource has been created, no Worker is deployed, and no remote location sharing is operational yet. Provider selection (including Iranian SMS and push delivery) remains a validation task.
