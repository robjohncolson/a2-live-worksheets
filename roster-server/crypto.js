// crypto.js — reversible password storage for teacher login-recovery (TR1).
// AES-256-GCM, Node crypto only. NEVER throws — a crypto failure must never
// break the live auth path or a teacher roster view.
//
// Security posture (ROSTER_TEACHER_TOOLS_SPEC.md §3, signed off 2026-05-19):
//   - The key lives ONLY in process.env.ROSTER_PW_ENC_KEY (Railway env).
//     It is never in git, never in any client file, never sent to a browser.
//   - bcrypt password_hash remains the sole authentication path. This cipher
//     is read ONLY by the teacher-gated GET /roster/list.
//   - A DB dump WITHOUT the Railway key reveals no passwords.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const VERSION = 'v1';

// Resolve the 32-byte key, or null if crypto is disabled (env var absent).
// 64 hex chars → raw bytes (openssl rand -hex 32). Anything else → sha256(str).
function resolveKey() {
  const raw = process.env.ROSTER_PW_ENC_KEY;
  if (!raw) return null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

// True when a key is configured (diagnostics/tests).
export function cryptoEnabled() {
  return resolveKey() !== null;
}

// plain → "v1:b64(iv):b64(tag):b64(ct)", or null when disabled / empty / on any error.
export function encryptPassword(plain) {
  return encryptValue(plain, resolveKey());
}

function encryptValue(plain, key) {
  if (plain == null || plain === '') return null;

  try {
    if (!key) return null;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ct.toString('base64')
    ].join(':');
  } catch {
    return null;
  }
}

// "v1:..." blob → plain, or null for anything not decryptable (no throw).
export function decryptPassword(blob) {
  return decryptValue(blob, resolveKey());
}

function decryptValue(blob, key) {
  if (!blob || typeof blob !== 'string') return null;

  try {
    if (!key) return null;

    const parts = blob.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) return null;

    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

