import crypto from 'node:crypto';

let issuer = {
  enabled: false,
  privateKey: null,
  pubkey: null
};
let persistFailures = 0;
const DEFAULT_REVIEW_GRANT_PUBKEY = 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4';

function stringifyResponse(value) {
  if (typeof value === 'string') return value;
  const stringified = JSON.stringify(value);
  return stringified === undefined ? String(value) : stringified;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalize(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    if (payload[key] !== undefined) sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function signPayload(privateKey, payload) {
  const canonical = canonicalize(payload);
  const bytes = Buffer.from(canonical, 'utf8');
  const receiptId = crypto.createHash('sha256').update(bytes).digest('hex');
  const signature = crypto.sign(null, bytes, privateKey);
  return {
    canonical,
    receiptId,
    sig: b64url(signature),
    compact: `${b64url(bytes)}.${b64url(signature)}`
  };
}

function reviewGrantPublicKey() {
  const x = process.env.REVIEW_GRANT_PUBKEY || DEFAULT_REVIEW_GRANT_PUBKEY;
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x },
    format: 'jwk'
  });
}

export function verifyReviewGrant(compact) {
  if (typeof compact !== 'string') return null;

  try {
    const parts = compact.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const bytes = Buffer.from(parts[0], 'base64url');
    const sig = Buffer.from(parts[1], 'base64url');
    const rawPayload = bytes.toString('utf8');
    const payload = JSON.parse(rawPayload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (canonicalize(payload) !== rawPayload) return null;

    const ok = crypto.verify(null, bytes, reviewGrantPublicKey(), sig);
    return ok ? payload : null;
  } catch (_) {
    return null;
  }
}

function gradingProvenance(source, itemId) {
  const src = String(source || '');
  const id = String(itemId || '');
  if (src === 'curriculum_quiz' || src === 'pc' || src === 'worksheet') return 'key';
  if (src === 'ai' || src === 'ai-graded' || src === 'quiz_review' || src === 'quiz_exception') return 'ai';
  if (src === 'self-graded' || src === 'frq' || /DESK_DONE/i.test(id)) return 'self';
  return undefined;
}

function createPrivateKey(privateKeyB64) {
  return crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
}

export function initReceipts() {
  const privateKeyB64 = process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  persistFailures = 0;

  if (!privateKeyB64) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.log('Signed receipts disabled: RECEIPT_ISSUER_PRIVATE_KEY unset');
    return issuer;
  }

  try {
    const privateKey = createPrivateKey(privateKeyB64);
    const publicKey = crypto.createPublicKey(privateKey);
    issuer = {
      enabled: true,
      privateKey,
      pubkey: publicKey.export({ format: 'jwk' }).x
    };
    console.log('Signed receipts enabled: Ed25519 issuer loaded');
  } catch (err) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.error('Signed receipts disabled: failed to load issuer key:', err.message);
  }

  return issuer;
}

// Issuer-key history (ANDROID_PHASE4_TEACHER_KEY_SPEC §2): verification trusts a SET
// of pubkeys — the current signer plus any retired/additional ones from env
// RETIRED_ISSUER_PUBKEYS (comma-separated base64url Ed25519 `x`). Signing always uses
// the current key; this only widens VERIFICATION so a rotated or added key never
// invalidates already-signed receipts. Used by /receipts/issuer (client trust set)
// and verify-ledger / snapshot verification.
function parseRetiredPubkeys() {
  const raw = process.env.RETIRED_ISSUER_PUBKEYS;
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Persisted trust set (migration 0026 trusted_issuers): device keys a teacher
// registered via POST /receipts/trusted-issuers — seeded at boot, refreshed on add.
// Held as a plain in-process cache so getTrustedIssuerPubkeys stays sync + DB-free.
let extraTrusted = [];
export function setPersistedTrustedPubkeys(list) {
  extraTrusted = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x) : [];
}

export function getTrustedIssuerPubkeys() {
  const out = [];
  if (issuer.enabled && issuer.pubkey) out.push(issuer.pubkey);
  for (const k of parseRetiredPubkeys()) if (!out.includes(k)) out.push(k);
  for (const k of extraTrusted) if (!out.includes(k)) out.push(k);
  return out;
}

// Validate an Ed25519 public-key `x` (base64url, 32-byte raw → 43 chars). True only
// if it round-trips into a real Ed25519 public key — so a garbage/forged value
// never enters the trust set.
export function isValidIssuerPubkey(x) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(x)) return false;
  try {
    crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
    return true;
  } catch (_) {
    return false;
  }
}

export function getReceiptIssuer() {
  if (!issuer.enabled) return { enabled: false };
  return {
    enabled: true,
    name: 'The A2 Desk',
    alg: 'Ed25519',
    v: 1,
    pubkey: issuer.pubkey,                 // current signer (back-compat)
    pubkeys: getTrustedIssuerPubkeys()     // full trust set (current + retired)
  };
}

export function recordReceiptPersistFailure() {
  persistFailures += 1;
}

export function getReceiptHealth() {
  const info = getReceiptIssuer();
  return {
    enabled: !!info.enabled,
    pubkey: info.pubkey,
    persistFailures
  };
}

export function issueLedgerReceipt({
  studentId,
  username,
  source,
  itemId,
  score,
  attempt,
  evidenceTier,
  response,
  gradingProvenance: provenanceOverride,
  ts = Date.now(),
  nonce,   // §0.8: pass a deterministic nonce (from the submission) so a re-mint of the
           // SAME grade is byte-identical → dedups. Default random (unchanged behavior).
  sub,     // §0.7: the offline-grading-mesh submission this grade covers (its receipt_id).
  kv       // §0.10: the answer-key version this was scored against.
}) {
  if (!issuer.enabled) return null;
  if (!studentId || !source || !itemId) return null;

  try {
    const valueString = stringifyResponse(response);
    const payload = {
      v: 1,
      t: 'ledger',
      sid: studentId,
      u: username || undefined,
      src: source,
      i: itemId,
      a: attempt,
      e: evidenceTier,
      ah: crypto.createHash('sha256').update(valueString, 'utf8').digest('hex').slice(0, 16),
      ts,
      n: (nonce !== undefined && nonce !== null) ? String(nonce) : crypto.randomBytes(4).toString('hex')
    };

    if (score !== undefined && score !== null) payload.sc = Number(score);
    const g = provenanceOverride || gradingProvenance(source, itemId);
    if (g) payload.g = g;
    if (sub !== undefined && sub !== null) payload.sub = String(sub);
    if (kv !== undefined && kv !== null) payload.kv = String(kv);

    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Ledger receipt issuance failed:', err.message);
    return null;
  }
}

export function issueTranscriptReceipt({
  sid,
  u,
  asOf,
  asOfDateNY,
  cnt,
  root,
  g,
  gq,
  gradeHash,
  cfgHash,
  artHash,
  codeHash
}) {
  if (!issuer.enabled) return null;
  if (!sid || !asOf || !asOfDateNY || !root || !gq || !gradeHash || !cfgHash || !artHash || !codeHash) {
    return null;
  }

  try {
    const payload = {
      v: 1,
      t: 'transcript',
      sid,
      u: u || undefined,
      asOf,
      asOfDateNY,
      cnt,
      root,
      g,
      gq,
      gradeHash,
      cfgHash,
      artHash,
      codeHash,
      iss: 'desk',
      ts: asOf,
      n: crypto.randomBytes(4).toString('hex')
    };

    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Transcript receipt issuance failed:', err.message);
    return null;
  }
}

// A "commit" in the progress ledger: a signed manifest over a QR-sized chunk of
// receipts, chained to the previous commit via `prev` (its root). The chain of
// roots is the proto-git history. Genesis commit has no `prev` (omitted).
export function issueCommitReceipt({ sid, u, seq, prev, root, cnt, from, to, asOf = Date.now() }) {
  if (!issuer.enabled) return null;
  if (!sid || !root || !seq) return null;
  try {
    const payload = {
      v: 1,
      t: 'commit',
      sid,
      u: u || undefined,
      seq,
      prev: prev || undefined,
      root,
      cnt,
      from,
      to,
      iss: 'desk',
      ts: asOf,
      n: crypto.randomBytes(4).toString('hex')
    };
    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Commit receipt issuance failed:', err.message);
    return null;
  }
}

// An "epoch": a signed, class-level seal over every student's commit-chain `head`
// for one snapshot day, chained day-over-day via `prev` (yesterday's epoch root).
// The chain of epoch roots is the *whole class's* daily-sealed history — the
// off-Supabase durability anchor. Not persisted to Supabase; lives in the git
// mirror (GRADE_LEDGER_DURABILITY_SPEC.md). Genesis epoch omits `prev`.
export function issueEpochReceipt({ asOf = Date.now(), asOfDateNY, cnt, root, prev }) {
  if (!issuer.enabled) return null;
  if (!asOfDateNY || !root) return null;
  try {
    const payload = {
      v: 1,
      t: 'epoch',
      iss: 'desk',
      d: asOfDateNY,
      cnt,
      root,
      prev: prev || undefined,
      ts: asOf,
      n: crypto.randomBytes(4).toString('hex')
    };
    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Epoch receipt issuance failed:', err.message);
    return null;
  }
}

// A "review": a teacher marking one work item (item_ledger row, by ledger_id) SEEN,
// optionally with a comment bound by hash (`ch`, like `ah`) so a tampered stored comment
// is detectable while the payload stays small. `rh` (v2) binds the hash of the student
// response the teacher was LOOKING AT when they reviewed — worksheets are revisable
// (the ledger upsert keeps the same ledger_id), so without `rh` a comment drafted about
// an old answer silently attaches to a new one. Signed so reviews ride the same
// durability rails as grades (snapshot/verify/restore). See NIGHTLY_REVIEW_V2_SPEC.md §0.5.
export function issueReviewReceipt({ ledgerId, studentId, teacher, seenAt = Date.now(), comment, responseHash }) {
  if (!issuer.enabled || !ledgerId || !studentId) return null;
  try {
    const payload = {
      v: 1,
      t: 'review',
      iss: 'desk',
      lid: ledgerId,
      sid: studentId,
      by: teacher || undefined,
      ts: seenAt,
      ch: comment ? crypto.createHash('sha256').update(stringifyResponse(comment), 'utf8').digest('hex').slice(0, 16) : undefined,
      rh: responseHash || undefined,
      n: crypto.randomBytes(4).toString('hex')
    };
    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Review receipt issuance failed:', err.message);
    return null;
  }
}



function isMissingTrustedIssuers(error) {
  const code = error && error.code;
  const msg = (error && error.message) || '';
  return code === '42P01' || code === 'PGRST205'
    || /relation .*trusted_issuers.* does not exist/i.test(msg)
    || /could not find the table/i.test(msg);
}

export function mountReceipts(app, { db, requireTeacher } = {}) {
  app.get('/receipts/issuer', (_req, res) => {
    res.json(getReceiptIssuer());
  });

  // Seed the persisted trust set at boot (best-effort; silent pre-migration-0026).
  if (db && typeof db.listTrustedIssuers === 'function') {
    Promise.resolve().then(async () => {
      try {
        const { data, error } = await db.listTrustedIssuers();
        if (!error && Array.isArray(data)) setPersistedTrustedPubkeys(data.map((r) => r.pubkey).filter(Boolean));
      } catch (_) { /* table absent → no persisted keys yet */ }
    });
  }

  // POST /receipts/trusted-issuers — teacher-gated. Register a device's Ed25519
  // PUBLIC key into the issuer trust set (Phase 4 §3B) so receipts that device signs
  // verify everywhere. Persisted (survives restart) + reaches all clients via GET
  // /receipts/issuer. Body: { pubkey (base64url x), label? }.
  app.post('/receipts/trusted-issuers', async (req, res) => {
    if (typeof requireTeacher !== 'function' || !(await requireTeacher(req, db))) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    const pubkey = req.body && req.body.pubkey;
    const label = (req.body && typeof req.body.label === 'string') ? req.body.label.slice(0, 100) : null;
    if (!isValidIssuerPubkey(pubkey)) return res.status(400).json({ ok: false, error: 'invalid Ed25519 pubkey' });
    if (!db || typeof db.addTrustedIssuer !== 'function') {
      return res.status(503).json({ ok: false, error: 'trusted_issuers not provisioned (run migration 0026)' });
    }
    // Domain separation (OFFLINE_GRADING_MESH_SPEC §0.1c): a STUDENT key can never
    // be promoted into the GRADES trust set — the two sets stay disjoint. Best-effort
    // (pre-0027 the table is absent and the guard is moot).
    try {
      if (typeof db.findStudentKey === 'function') {
        const sk = await db.findStudentKey(pubkey);
        if (sk && sk.data) return res.status(409).json({ ok: false, error: 'pubkey is a student key' });
      }
    } catch (_) { /* student_keys not provisioned — nothing to collide with */ }
    try {
      const { error } = await db.addTrustedIssuer({ pubkey, label });
      if (error) {
        if (isMissingTrustedIssuers(error)) return res.status(503).json({ ok: false, error: 'trusted_issuers not provisioned (run migration 0026)' });
        throw error;
      }
      // Refresh the in-process cache so the new key is trusted immediately.
      const { data } = await db.listTrustedIssuers();
      if (Array.isArray(data)) setPersistedTrustedPubkeys(data.map((r) => r.pubkey).filter(Boolean));
      return res.json({ ok: true, pubkeys: getTrustedIssuerPubkeys() });
    } catch (e) {
      console.error('POST /receipts/trusted-issuers error:', e);
      return res.status(500).json({ ok: false, error: 'could not register issuer' });
    }
  });

  // POST /receipts/trusted-issuers/revoke — teacher-gated. Revoke a device key
  // (lost/stolen phone) and evict it from the LIVE trust set IMMEDIATELY — not just
  // at the next restart — by re-listing + refreshing the cache (security review fix).
  app.post('/receipts/trusted-issuers/revoke', async (req, res) => {
    if (typeof requireTeacher !== 'function' || !(await requireTeacher(req, db))) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    const pubkey = req.body && req.body.pubkey;
    if (typeof pubkey !== 'string' || !pubkey) return res.status(400).json({ ok: false, error: 'pubkey required' });
    if (!db || typeof db.revokeTrustedIssuer !== 'function') {
      return res.status(503).json({ ok: false, error: 'trusted_issuers not provisioned (run migration 0026)' });
    }
    try {
      const { error } = await db.revokeTrustedIssuer({ pubkey });
      if (error) {
        if (isMissingTrustedIssuers(error)) return res.status(503).json({ ok: false, error: 'trusted_issuers not provisioned (run migration 0026)' });
        throw error;
      }
      const { data } = await db.listTrustedIssuers();
      if (Array.isArray(data)) setPersistedTrustedPubkeys(data.map((r) => r.pubkey).filter(Boolean));
      return res.json({ ok: true, pubkeys: getTrustedIssuerPubkeys() });
    } catch (e) {
      console.error('POST /receipts/trusted-issuers/revoke error:', e);
      return res.status(500).json({ ok: false, error: 'could not revoke issuer' });
    }
  });
}

export const receiptInternals = {
  canonicalize,
  createPrivateKey,
  signPayload,
  // Exposed so the snapshot verifier reproduces the exact answer-hash bytes the
  // issuer signed (`ah`), without re-implementing it — keeps the two in lockstep.
  stringifyResponse
};
