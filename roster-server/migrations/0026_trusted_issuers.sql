-- 0026_trusted_issuers: persisted issuer-key trust set (ANDROID Phase 4 §3B).
--
-- USER-RUN (run on the shared Supabase, like 0011/0013/0014/0015/0016/0018/0025 --
-- never auto-run). Additive + idempotent.
--
-- A teacher DEVICE generates its own Ed25519 key (hardware-wrapped, biometric-gated)
-- and registers its PUBLIC key here via POST /receipts/trusted-issuers, so receipts
-- that device signs verify everywhere. getTrustedIssuerPubkeys() merges these rows
-- into the trust set (with the current signer + RETIRED_ISSUER_PUBKEYS env), and
-- GET /receipts/issuer advertises the full set to every client.
--
-- Until this migration runs, POST /receipts/trusted-issuers returns 503 and the
-- trust set falls back to the current key + the RETIRED_ISSUER_PUBKEYS env (so the
-- env path keeps working as a manual fallback).

create table if not exists trusted_issuers (
  pubkey     text primary key,   -- base64url Ed25519 public-key x (43 chars)
  label      text,               -- human note, e.g. "Teacher Pixel 8"
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Service-role (the server) bypasses RLS; no anon access. Mirrors 0025.
alter table trusted_issuers enable row level security;
