# Location and consent domain foundation

This increment adds pure Kotlin domain rules. It does not start location tracking,
request Android permissions, transmit coordinates, or create a background service.

## Location metadata

Every observation carries WGS84 coordinates, provider-reported horizontal accuracy,
the provider measurement timestamp (not app receipt time), provider label, and a
mock-location marker.

LocationQualityPolicy classifies an observation as USABLE, STALE, INACCURATE,
INVALID, MOCKED, or FUTURE_TIMESTAMP.

Initial MVP defaults:
- Maximum age for a fresh observation: 2 minutes.
- Maximum horizontal accuracy: 100 meters.
- Allowed clock skew into the future: 2 minutes.

These are conservative initial defaults, not a guarantee of real-world accuracy.
The UI and API must distinguish a usable fresh observation from an old last-known
observation. Never relabel stale coordinates as live.

## Consent model

SharingConsent records the owner, recipient, explicit scopes, grant time, optional
expiry, and optional revocation time.

A scope is allowed only when the owner and recipient match, the requested scope was
granted, consent has not expired or been revoked, and the grant is not dated in the
future.

Product-level consent is independent of Android runtime permissions. Both checks
must pass before a device location can be accessed or shared.

## Next implementation boundary

The next layer should persist consent and last-known location locally, then add
permission-aware one-shot location acquisition. Network synchronization and push
delivery should follow a documented backend contract and authentication model.
