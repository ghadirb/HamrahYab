# Local storage and one-shot location capture

This increment adds local persistence and a foreground, user-initiated location request.

## Local persistence
- Room database: `hamrahyab-local.db`.
- Latest location is stored as a single replaceable record.
- Sharing consents are stored by owner/recipient pair, including scope names,
  grant time, optional expiry, and revocation time.
- No coordinates or consent records are sent to a server in this increment.

## Location request behavior
- The user taps the explicit "دریافت موقعیت فعلی" action.
- The app requests Android fine and coarse location permission at runtime.
- The app uses Android LocationManager GPS and network providers.
- It waits for a location up to 20 seconds and then removes location listeners.
- There is no background location permission, foreground service, periodic polling,
  boot receiver, or hidden tracking.
- If the system returns a last-known position, its measurement timestamp is retained.
  The app must classify old measurements as stale and must not label them live.

## Battery and privacy limits
A one-shot request avoids continuous GPS operation, but a fresh fix can still take
time and consume power, especially indoors or with GPS/network unavailable. The app
cannot guarantee zero battery use. Android permission is necessary but does not by
itself grant product-level consent to share the location with another account.

## Current scope
This is a local-device milestone only. It does not yet implement account sign-in,
device pairing, remote location requests, push notifications, geofences, SOS delivery,
or lost-device recovery after app removal/reset. Those require a backend and additional
user-visible consent flows.
