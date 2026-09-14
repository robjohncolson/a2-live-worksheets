// trusted-issuers.test.js — persisted issuer trust set + register endpoint
// (ANDROID Phase 4 §3B). A teacher registers a DEVICE pubkey; it persists, seeds the
// trust-set cache, and a receipt that device signs then verifies everywhere.

import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import http from 'http';
import express from 'express';
import crypto from 'node:crypto';
import {
  mountReceipts, getTrustedIssuerPubkeys, setPersistedTrustedPubkeys,
  isValidIssuerPubkey, initReceipts, receiptInternals,
} from '../receipts.js';
import { verifyRecord, publicKeyFromX } from '../snapshot-verify.js';

function makeDeviceKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { privateKey, x: publicKey.export({ format: 'jwk' }).x };
}

const savedRetired = process.env.RETIRED_ISSUER_PUBKEYS;

beforeEach(() => {
  delete process.env.RETIRED_ISSUER_PUBKEYS;
  initReceipts();                 // reset issuer state to env (likely disabled in tests)
  setPersistedTrustedPubkeys([]); // reset the cache
});
afterAll(() => {
  if (savedRetired === undefined) delete process.env.RETIRED_ISSUER_PUBKEYS; else process.env.RETIRED_ISSUER_PUBKEYS = savedRetired;
  setPersistedTrustedPubkeys([]);
});

describe('isValidIssuerPubkey', () => {
  it('accepts a real Ed25519 x', () => {
    expect(isValidIssuerPubkey(makeDeviceKey().x)).toBe(true);
  });
  it('rejects junk / wrong length / wrong charset / non-string', () => {
    expect(isValidIssuerPubkey('not-a-key')).toBe(false);          // too short
    expect(isValidIssuerPubkey(null)).toBe(false);                  // non-string
    expect(isValidIssuerPubkey('A'.repeat(44))).toBe(false);        // wrong length
    expect(isValidIssuerPubkey('A'.repeat(42) + '!')).toBe(false);  // bad char (43 chars, '!' not base64url)
    // NOTE: any 43-char base64url decodes to 32 bytes → structurally valid Ed25519 x
    // (Node doesn't check curve membership; a non-point key just can't verify anything).
  });
});

describe('setPersistedTrustedPubkeys / getTrustedIssuerPubkeys', () => {
  it('merges persisted keys into the trust set, deduped', () => {
    setPersistedTrustedPubkeys(['k1', 'k2', 'k1']);
    const set = getTrustedIssuerPubkeys();
    expect(set).toContain('k1');
    expect(set).toContain('k2');
    expect(set.filter((k) => k === 'k1')).toHaveLength(1);
  });
  it('ignores non-strings', () => {
    setPersistedTrustedPubkeys(['k1', null, 42, '']);
    expect(getTrustedIssuerPubkeys()).toEqual(['k1']);
  });
});

describe('POST /receipts/trusted-issuers', () => {
  let server, baseUrl, store;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    store = [];
    const db = {
      addTrustedIssuer: async ({ pubkey, label }) => { store.push({ pubkey, label, revoked: false }); return { data: { pubkey }, error: null }; },
      listTrustedIssuers: async () => ({ data: store.filter((s) => !s.revoked).map((s) => ({ pubkey: s.pubkey })), error: null }),
      revokeTrustedIssuer: async ({ pubkey }) => { store.forEach((s) => { if (s.pubkey === pubkey) s.revoked = true; }); return { data: { pubkey }, error: null }; },
    };
    const requireTeacher = (req) => Promise.resolve(req.headers['x-teacher-secret'] === 'ok');
    mountReceipts(app, { db, requireTeacher });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  async function post(body, headers = {}) {
    const res = await fetch(`${baseUrl}/receipts/trusted-issuers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  it('401 without teacher auth', async () => {
    expect((await post({ pubkey: makeDeviceKey().x })).status).toBe(401);
  });
  it('400 on an invalid pubkey', async () => {
    expect((await post({ pubkey: 'garbage' }, { 'x-teacher-secret': 'ok' })).status).toBe(400);
  });
  it('200 registers a device key + returns the trust set, cache refreshed', async () => {
    const dev = makeDeviceKey();
    const res = await post({ pubkey: dev.x, label: 'Pixel 8' }, { 'x-teacher-secret': 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pubkeys).toContain(dev.x);
    expect(getTrustedIssuerPubkeys()).toContain(dev.x);          // in-process cache updated
    expect(store.map((s) => s.pubkey)).toContain(dev.x);          // persisted
  });

  async function postRevoke(body, headers = {}) {
    const res = await fetch(`${baseUrl}/receipts/trusted-issuers/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  it('revoke evicts the key from the LIVE trust set immediately (review fix)', async () => {
    const dev = makeDeviceKey();
    await post({ pubkey: dev.x }, { 'x-teacher-secret': 'ok' });
    expect(getTrustedIssuerPubkeys()).toContain(dev.x);
    const res = await postRevoke({ pubkey: dev.x }, { 'x-teacher-secret': 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.pubkeys).not.toContain(dev.x);              // gone from the returned set
    expect(getTrustedIssuerPubkeys()).not.toContain(dev.x);     // gone from the live cache (no restart needed)
  });

  it('revoke is teacher-gated', async () => {
    expect((await postRevoke({ pubkey: makeDeviceKey().x })).status).toBe(401);
  });
});

describe('503 when trusted_issuers is unprovisioned', () => {
  let server, baseUrl;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    mountReceipts(app, { db: {}, requireTeacher: () => Promise.resolve(true) }); // db has no DAO
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('returns 503 (run migration 0026)', async () => {
    const res = await fetch(`${baseUrl}/receipts/trusted-issuers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pubkey: makeDeviceKey().x }),
    });
    expect(res.status).toBe(503);
  });
});

describe('end-to-end: a registered device key verifies receipts', () => {
  it('a device-signed receipt passes verifyRecord once the pubkey is in the trust set', () => {
    const dev = makeDeviceKey();
    const { receiptId, compact } = receiptInternals.signPayload(dev.privateKey, { v: 1, t: 'ledger', sid: 'stu-1', src: 'frq', i: 'WS-U1L1-reflect1', sc: 1 });
    const rec = { studentId: 'stu-1', itemId: 'WS-U1L1-reflect1', source: 'frq', score: 1, receipt_id: receiptId, receipt_compact: compact };

    // Before registration: not trusted.
    expect(verifyRecord(rec, getTrustedIssuerPubkeys().map(publicKeyFromX), 'stu-1').ok).toBe(false);
    // Register the device pubkey → now trusted.
    setPersistedTrustedPubkeys([dev.x]);
    expect(verifyRecord(rec, getTrustedIssuerPubkeys().map(publicKeyFromX), 'stu-1').ok).toBe(true);
  });
});
