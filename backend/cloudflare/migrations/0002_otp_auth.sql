-- OTP challenge lifecycle. Phone numbers are stored only after successful verification.
CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY NOT NULL,
    phone_e164 TEXT NOT NULL CHECK (length(phone_e164) = 13 AND phone_e164 GLOB '+989[0-9]*'),
    request_ip_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'consumed', 'locked', 'expired')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    verified_at_ms INTEGER,
    CHECK (expires_at_ms > created_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_time ON otp_challenges(phone_e164, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_otp_ip_time ON otp_challenges(request_ip_hash, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_otp_active ON otp_challenges(id, status, expires_at_ms);

ALTER TABLE accounts ADD COLUMN phone_e164 TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_phone ON accounts(phone_e164) WHERE phone_e164 IS NOT NULL;
