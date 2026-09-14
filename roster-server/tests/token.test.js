// token.test.js — unit tests for signToken / verifyToken (D-C)
// No network, no Supabase. Uses process.env for the secret.

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac, randomBytes } from 'crypto';
import { signToken, verifyToken } from '../token.js';

let testSecret;

beforeEach(() => {
  testSecret = randomBytes(24).toString('hex');
  process.env.ROSTER_TOKEN_SECRET = testSecret;
});

// Helper: build a raw token with a custom exp (bypass signToken's 30-day offset)
function buildRawToken(sid, exp, secret) {
  const header = Buffer.from(JSON.stringify({ sid, exp }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sig = createHmac('sha256', secret)
    .update(header)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${header}.${sig}`;
}

describe('signToken / verifyToken', () => {
  it('round-trips: sign then verify returns the same studentId', () => {
    const studentId = 'student-uuid-1234';
    const token = signToken(studentId);
    const result = verifyToken(token);
    expect(result).toBe(studentId);
  });

  it('round-trips with a uuid-shaped studentId', () => {
    const studentId = '550e8400-e29b-41d4-a716-446655440000';
    const token = signToken(studentId);
    expect(verifyToken(token)).toBe(studentId);
  });

  it('tampered payload returns null', () => {
    const token = signToken('student-123');
    const [, sig] = token.split('.');

    // Tamper: base64url-encode a different payload
    const fakePayload = Buffer.from(JSON.stringify({ sid: 'attacker-id', exp: Date.now() + 9999999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const tamperedToken = `${fakePayload}.${sig}`;
    expect(verifyToken(tamperedToken)).toBeNull();
  });

  it('tampered signature returns null', () => {
    const token = signToken('student-456');
    const [header] = token.split('.');
    const tamperedToken = `${header}.invalidsignature`;
    expect(verifyToken(tamperedToken)).toBeNull();
  });

  it('expired token returns null', () => {
    const expiredToken = buildRawToken('old-student', Date.now() - 1000, testSecret);
    expect(verifyToken(expiredToken)).toBeNull();
  });

  it('wrong secret returns null', () => {
    const token = signToken('student-789');
    process.env.ROSTER_TOKEN_SECRET = randomBytes(24).toString('hex');
    expect(verifyToken(token)).toBeNull();
  });

  it('null token returns null', () => {
    expect(verifyToken(null)).toBeNull();
  });

  it('undefined token returns null', () => {
    expect(verifyToken(undefined)).toBeNull();
  });

  it('empty string token returns null', () => {
    expect(verifyToken('')).toBeNull();
  });

  it('malformed token (no dot) returns null', () => {
    expect(verifyToken('nodothere')).toBeNull();
  });

  it('throws if ROSTER_TOKEN_SECRET is missing when signing', () => {
    delete process.env.ROSTER_TOKEN_SECRET;
    expect(() => signToken('some-id')).toThrow();
  });
});
