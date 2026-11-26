# Connection and remote location request domain

This increment defines local, pure-Kotlin state models only. It does not add account
authentication, network calls, push delivery, or remote location capture.

## Connection invitation

- An invitation is created by an authenticated account and may be bound to a specific
  invitee or remain claimable by the recipient of a one-time invite code.
- The recipient must explicitly accept or decline.
- The inviter may revoke a pending invitation.
- Invitations expire and cannot be accepted after expiry.
- A successful invitation is not itself location permission. The server must also
  check the relevant `SharingConsent` scope for every protected operation.
- Production invite codes must be random, single-use, short-lived, rate-limited, and
  stored server-side as a hash. Do not use sequential IDs or expose database IDs as codes.

## Remote location request

- A request targets one registered device belonging to another account.
- Only the target account may approve or deny it.
- The requester may cancel while it is pending.
- Requests have a mandatory expiry and become unusable after it.
- Approval is only permission to attempt a one-shot capture; the Android app must
  still check runtime location permission, system Location state, connectivity,
  app/device state, and current product consent.
- Approval does not guarantee a fresh fix or successful delivery.
- No repeated polling or indefinite location session is implied by this model.

## Device identity

- `deviceId` represents an app installation generated with a cryptographically
  random identifier. It must not be an IMEI, serial number, MAC address, or other
  hardware identifier.
- A user may register multiple installations. Revoking a device must invalidate
  its server credentials and pending requests.

## Backend responsibilities not implemented here

The future API must enforce authentication, account/device ownership, connection
state, consent scope, request expiry, replay protection, rate limits, and audit events.
The client-side models are not a security boundary: clients may be modified, so all
authorization must be revalidated by the backend.

## Current limitation

These classes model valid state transitions for tests and UI logic. They do not
contact another device and do not enable tracking. A backend and a notification
provider must be selected and tested for reliable operation in Iran before remote
requests can work end-to-end.
