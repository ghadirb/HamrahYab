-- HamrahYab initial D1 schema.
-- No phone number, raw bearer token, or raw location history is stored by default.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    platform TEXT NOT NULL DEFAULT 'android' CHECK (platform = 'android'),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    last_seen_at_ms INTEGER,
    revoked_at_ms INTEGER,
    push_provider TEXT,
    push_token_ciphertext TEXT,
    CHECK (last_seen_at_ms IS NULL OR last_seen_at_ms >= created_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id, revoked_at_ms);

-- Only token hashes are persisted. Raw credentials are returned once at issuance.
CREATE TABLE IF NOT EXISTS device_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    revoked_at_ms INTEGER,
    CHECK (expires_at_ms > created_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON device_sessions(device_id, revoked_at_ms);

CREATE TABLE IF NOT EXISTS connection_invitations (
    id TEXT PRIMARY KEY NOT NULL,
    inviter_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    invitee_account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    responded_at_ms INTEGER,
    CHECK (expires_at_ms > created_at_ms),
    CHECK (invitee_account_id IS NULL OR invitee_account_id <> inviter_account_id)
);
CREATE INDEX IF NOT EXISTS idx_invitations_inviter ON connection_invitations(inviter_account_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_invitee ON connection_invitations(invitee_account_id, status);

CREATE TABLE IF NOT EXISTS family_connections (
    id TEXT PRIMARY KEY NOT NULL,
    account_a_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    account_b_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    created_at_ms INTEGER NOT NULL,
    revoked_at_ms INTEGER,
    CHECK (account_a_id <> account_b_id),
    UNIQUE (account_a_id, account_b_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_a ON family_connections(account_a_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_b ON family_connections(account_b_id, status);

CREATE TABLE IF NOT EXISTS sharing_consents (
    id TEXT PRIMARY KEY NOT NULL,
    owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    recipient_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN (
        'request_location', 'view_last_location', 'live_sharing',
        'emergency_location', 'manage_geofences', 'receive_sos'
    )),
    granted_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    revoked_at_ms INTEGER,
    CHECK (owner_account_id <> recipient_account_id),
    CHECK (expires_at_ms IS NULL OR expires_at_ms > granted_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_consents_lookup
    ON sharing_consents(owner_account_id, recipient_account_id, scope, revoked_at_ms, expires_at_ms);

CREATE TABLE IF NOT EXISTS location_requests (
    id TEXT PRIMARY KEY NOT NULL,
    requester_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'expired', 'fulfilled')),
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    responded_at_ms INTEGER,
    fulfilled_at_ms INTEGER,
    CHECK (requester_account_id <> owner_account_id),
    CHECK (expires_at_ms > created_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_location_requests_owner
    ON location_requests(owner_account_id, status, expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_location_requests_requester
    ON location_requests(requester_account_id, created_at_ms);

-- Latest approved fix only in the MVP. A future opt-in history table needs
-- a separately reviewed retention policy and explicit product consent.
CREATE TABLE IF NOT EXISTS latest_location_fixes (
    device_id TEXT PRIMARY KEY NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m REAL NOT NULL CHECK (accuracy_m >= 0 AND accuracy_m <= 100000),
    captured_at_ms INTEGER NOT NULL CHECK (captured_at_ms >= 0),
    received_at_ms INTEGER NOT NULL CHECK (received_at_ms >= captured_at_ms),
    source TEXT NOT NULL CHECK (source IN ('gps', 'network', 'fused', 'unknown'))
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    actor_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    subject_id TEXT,
    created_at_ms INTEGER NOT NULL,
    -- Do not put coordinates, credentials, or raw request bodies in metadata.
    safe_metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_events(actor_account_id, created_at_ms);
