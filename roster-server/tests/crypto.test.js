// crypto.test.js — AES-256-GCM password cipher (TR1).
// resolveKey() reads process.env at call time, so tests set/restore the env.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptPassword, decryptPassword, cryptoEnabled } from '../crypto.js';

const HEX_KEY = 'a'.repeat(64);              // 64 hex chars → raw 32 bytes
const HEX_KEY_2 = 'b'.repeat(64);
const PASSPHRASE = 'not-hex-just-a-passphrase';

let saved;

beforeEach(() => { saved = process.env.ROSTER_PW_ENC_KEY; });
afterEach(() => {
  if (saved === undefined) delete process.env.ROSTER_PW_ENC_KEY;
  else process.env.ROSTER_PW_ENC_KEY = saved;
});

describe('crypto round-trip', () => {
  it('hex key: encrypt → decrypt recovers the plaintext', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    const blob = encryptPassword('hunter2');
    expect(typeof blob).toBe('string');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain('hunter2');
    expect(decryptPassword(blob)).toBe('hunter2');
  });

  it('non-hex passphrase key (sha256 path) also round-trips', () => {
    process.env.ROSTER_PW_ENC_KEY = PASSPHRASE;
    const blob = encryptPassword('default-pw-1');
    expect(decryptPassword(blob)).toBe('default-pw-1');
  });

  it('two encryptions of the same password differ (random IV)', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    expect(encryptPassword('same')).not.toBe(encryptPassword('same'));
  });
});

describe('crypto failure modes return null (never throw)', () => {
  it('tampered ciphertext → null', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    const blob = encryptPassword('secret');
    const parts = blob.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64');
    expect(decryptPassword(parts.join(':'))).toBeNull();
  });

  it('wrong key → null', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    const blob = encryptPassword('secret');
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY_2;
    expect(decryptPassword(blob)).toBeNull();
  });

  it('disabled (no env): encrypt → null, decrypt → null, cryptoEnabled() false', () => {
    delete process.env.ROSTER_PW_ENC_KEY;
    expect(cryptoEnabled()).toBe(false);
    expect(encryptPassword('x')).toBeNull();
    expect(decryptPassword('v1:a:b:c')).toBeNull();
  });

  it('empty / null plaintext → null', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    expect(encryptPassword('')).toBeNull();
    expect(encryptPassword(null)).toBeNull();
    expect(encryptPassword(undefined)).toBeNull();
  });

  it('garbage / wrong-shape blobs → null', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    expect(decryptPassword(null)).toBeNull();
    expect(decryptPassword('')).toBeNull();
    expect(decryptPassword('not-a-blob')).toBeNull();
    expect(decryptPassword('v2:a:b:c')).toBeNull();   // wrong version
    expect(decryptPassword('v1:only:three')).toBeNull();
  });

  it('cryptoEnabled() reflects the env', () => {
    process.env.ROSTER_PW_ENC_KEY = HEX_KEY;
    expect(cryptoEnabled()).toBe(true);
  });
});
