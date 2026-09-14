// snapshot-verify.js — pure, zero-trust verification of an apstats-ledger-snapshot/v1
// document (the off-Supabase mirror). Recomputes EVERYTHING and checks it against the
// issuer's public key:
//   - every receipt signature (canonical + Ed25519)
//   - that each signed receipt actually binds the record it accompanies (sid/item/
//     source/score, and the answer-hash for primitive responses) — catches a snapshot
//     whose grade data was edited under an otherwise-valid receipt
//   - each student's commit-chain `head` and transcript root (recomputed)
//   - the epoch anchor: root over the RE-DERIVED heads + its signature
//
// Used by tools/verify-ledger.mjs and the test suite. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import { buildCommits } from './commits.js';
import { receiptInternals } from './receipts.js';
import { receiptRootOf, epochRoot } from './admin-snapshot.js';

const { canonicalize, stringifyResponse } = receiptInternals;

function publicKeyFromX(x) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

export { publicKeyFromX };

// Verify one compact receipt's canonical form + Ed25519 signature. Returns the
// decoded payload on success, else null (bad/forged/non-canonical). Accepts a single
// public key OR an array of trusted keys (issuer-key history, Phase 4 §2) — verifies
// if ANY trusted key signed these exact bytes.
export function verifyCompact(compact, pubKeyOrKeys) {
  try {
    const [pB64, sB64] = String(compact).split('.');
    if (!pB64 || !sB64) return null;
    const bytes = Buffer.from(pB64, 'base64url');
    const sig = Buffer.from(sB64, 'base64url');
    const raw = bytes.toString('utf8');
    const payload = JSON.parse(raw);
    if (canonicalize(payload) !== raw) return null; // reject non-canonical (malleable) bytes
    const keys = Array.isArray(pubKeyOrKeys) ? pubKeyOrKeys : [pubKeyOrKeys];
    for (const k of keys) {
      if (k && crypto.verify(null, bytes, k, sig)) return payload;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function answerHash(response) {
  return crypto.createHash('sha256').update(stringifyResponse(response), 'utf8').digest('hex').slice(0, 16);
}

function numEq(a, b) {
  const na = (a === undefined || a === null) ? null : Number(a);
  const nb = (b === undefined || b === null) ? null : Number(b);
  if (na === null && nb === null) return true;
  return na === nb;
}

// Verify ONE snapshot/import record against the issuer key: the receipt signature
// AND that the signed payload actually binds this record (owner/item/source/score,
// and the answer-hash for primitive responses). The single source of truth for
// "is this record authentic + intact", reused by verifySnapshot and admin-restore.
// Returns { ok, payload, unsigned?, breaks:[{kind,...}] }.
export function verifyRecord(rec, pubKey, sid) {
  if (!rec || !rec.receipt_compact) {
    return { ok: false, payload: null, unsigned: true, breaks: [{ kind: 'unsigned', itemId: rec && rec.itemId }] };
  }
  const payload = verifyCompact(rec.receipt_compact, pubKey);
  if (!payload) return { ok: false, payload: null, breaks: [{ kind: 'bad-signature', itemId: rec.itemId }] };

  const breaks = [];
  // Domain separation (OFFLINE_GRADING_MESH_SPEC §0.1a): a GRADE record must carry a
  // grade-type payload. Every grade receipt ever minted is t:'ledger' (teacher FRQ
  // grades are t:'ledger' with src:'frq'); without this, any trusted-issuer receipt
  // of another type could be replayed as a grade through /admin/restore. Mirrors
  // verifyReviewMark's own t check and the client verifyLedgerRow.
  if (payload.t !== 'ledger') breaks.push({ kind: 'wrong-type', itemId: rec.itemId, signed: payload.t ?? null });
  const owner = rec.studentId || sid;
  if (payload.sid !== owner) breaks.push({ kind: 'sid-mismatch', itemId: rec.itemId });
  if (payload.i !== rec.itemId) breaks.push({ kind: 'item-mismatch', itemId: rec.itemId });
  if (payload.src !== rec.source) breaks.push({ kind: 'source-mismatch', itemId: rec.itemId });
  if (!numEq(payload.sc, rec.score)) {
    breaks.push({ kind: 'score-tampered', itemId: rec.itemId, signed: payload.sc ?? null, record: rec.score ?? null });
  }
  // Attempt is grade-affecting (latestPerItem picks the highest attempt), so bind it too:
  // otherwise a tampered backup could replay a signed score under a forged attempt. Default
  // to 1 on both sides for receipts minted before `a`.
  if (!numEq(payload.a == null ? 1 : payload.a, rec.attempt == null ? 1 : rec.attempt)) {
    breaks.push({ kind: 'attempt-tampered', itemId: rec.itemId, signed: payload.a ?? null, record: rec.attempt ?? null });
  }
  // The signed `ah` binds the response. Postgres JSONB can reorder object keys vs.
  // what was signed, so only assert this for primitive responses (the common
  // worksheet/quiz case); object responses still ride the signature + score bind.
  const prim = typeof rec.response === 'string' || typeof rec.response === 'number';
  if (payload.ah && prim && payload.ah !== answerHash(rec.response)) {
    breaks.push({ kind: 'response-tampered', itemId: rec.itemId });
  }
  return { ok: breaks.length === 0, payload, breaks };
}

// Verify ONE review record against the issuer key: the t:'review' receipt signature AND
// that the signed payload binds this review (ledgerId/owner, and the comment-hash `ch` for
// a commented review). Mirrors verifyRecord. Returns { ok, payload, unsigned?, breaks }.
export function verifyReviewMark(rec, pubKey, sid) {
  if (!rec || !rec.receipt_compact) {
    return { ok: false, payload: null, unsigned: true, breaks: [{ kind: 'review-unsigned', ledgerId: rec && rec.ledgerId }] };
  }
  const payload = verifyCompact(rec.receipt_compact, pubKey);
  if (!payload) return { ok: false, payload: null, breaks: [{ kind: 'review-bad-signature', ledgerId: rec.ledgerId }] };

  const breaks = [];
  const owner = rec.studentId || sid;
  if (payload.t !== 'review') breaks.push({ kind: 'review-wrong-type', ledgerId: rec.ledgerId });
  if (payload.lid !== rec.ledgerId) breaks.push({ kind: 'review-ledger-mismatch', ledgerId: rec.ledgerId });
  if (payload.sid !== owner) breaks.push({ kind: 'review-sid-mismatch', ledgerId: rec.ledgerId });
  // `ch` binds the comment: a commented review must hash-match; an empty signed `ch`
  // with a stored comment (or vice-versa) is tampering.
  const ch = rec.comment ? answerHash(rec.comment) : undefined;
  if ((payload.ch || undefined) !== ch) breaks.push({ kind: 'review-comment-tampered', ledgerId: rec.ledgerId });
  return { ok: breaks.length === 0, payload, breaks };
}

// Verify ONE student SUBMISSION record (offline-grading mesh Phase 4, §0.1b/§0.2):
// the self-signed t:'submission' receipt AND that it binds this record, verified ONLY
// against the STUDENT trust set (NEVER the issuer/grades keys — the lanes share no
// keys). studentKeys = [{ pubkey, sid, revoked }] (from migration 0027). The
// impersonation gate: rec.studentId === payload.sid === the SIGNING key's registered
// sid. A submission structurally can't be a grade (no sc/g). Mirrors the client
// receipt-verify.js verifySubmissionRow. Returns { ok, payload, signerSid, breaks }.
export function verifySubmissionRecord(rec, studentKeys) {
  if (!rec || !rec.receipt_compact) {
    return { ok: false, payload: null, unsigned: true, breaks: [{ kind: 'sub-unsigned', itemId: rec && rec.itemId }] };
  }
  // Find the non-revoked student key that signed these exact bytes.
  let signer = null, payload = null;
  for (const k of (Array.isArray(studentKeys) ? studentKeys : [])) {
    if (!k || k.revoked || !k.pubkey) continue;
    const p = verifyCompact(rec.receipt_compact, publicKeyFromX(k.pubkey));
    if (p) { signer = k; payload = p; break; }
  }
  if (!signer) return { ok: false, payload: null, breaks: [{ kind: 'sub-bad-signature', itemId: rec.itemId }] };

  const breaks = [];
  if (payload.t !== 'submission') breaks.push({ kind: 'sub-wrong-type', itemId: rec.itemId });
  if ('sc' in payload || 'g' in payload) breaks.push({ kind: 'sub-has-grade-fields', itemId: rec.itemId });
  if (payload.sid !== rec.studentId) breaks.push({ kind: 'sub-sid-mismatch', itemId: rec.itemId });
  if (String(payload.sid) !== String(signer.sid)) breaks.push({ kind: 'sub-impersonation', itemId: rec.itemId });
  if (payload.i !== rec.itemId) breaks.push({ kind: 'sub-item-mismatch', itemId: rec.itemId });
  if (payload.src !== rec.source) breaks.push({ kind: 'sub-source-mismatch', itemId: rec.itemId });
  const prim = typeof rec.response === 'string' || typeof rec.response === 'number';
  if (payload.ah && prim && payload.ah !== answerHash(rec.response)) breaks.push({ kind: 'sub-response-tampered', itemId: rec.itemId });
  // Content address: receipt_id must be sha256 of the signed payload bytes.
  if (rec.receipt_id != null) {
    const pB64 = String(rec.receipt_compact).split('.')[0];
    const receiptId = crypto.createHash('sha256').update(Buffer.from(pB64, 'base64url')).digest('hex');
    if (String(rec.receipt_id) !== receiptId) breaks.push({ kind: 'sub-id-mismatch', itemId: rec.itemId });
  }
  return { ok: breaks.length === 0, payload, signerSid: signer.sid, breaks };
}

export function verifySnapshot(snapshot, { pubkey, pubkeys } = {}) {
  const breaks = [];
  // Trust the union of: explicit pubkeys[], explicit pubkey, and whatever the
  // snapshot embeds (issuer.pubkey + issuer.pubkeys). Issuer-key history (Phase 4
  // §2) — a receipt verifies if ANY trusted key signed it. Single-key callers
  // (legacy { pubkey }) are unchanged: the list is just [that key].
  const xs = [];
  const add = (x) => { if (x && !xs.includes(x)) xs.push(x); };
  (Array.isArray(pubkeys) ? pubkeys : []).forEach(add);
  add(pubkey);
  if (snapshot && snapshot.issuer) {
    add(snapshot.issuer.pubkey);
    (Array.isArray(snapshot.issuer.pubkeys) ? snapshot.issuer.pubkeys : []).forEach(add);
  }
  if (!xs.length) return { ok: false, error: 'no issuer pubkey (pass pubkey/pubkeys or include snapshot.issuer)', breaks: [] };
  const pubKey = xs.map(publicKeyFromX);

  let totalRecords = 0;
  let verifiedReceipts = 0;
  let unsignedRecords = 0;
  let totalReviews = 0;
  let verifiedReviews = 0;
  let unsignedReviews = 0;
  const students = [];

  for (const s of (snapshot.students || [])) {
    const sBreaks = [];
    const records = (s.bundle && s.bundle.records) || [];
    totalRecords += records.length;

    for (const rec of records) {
      if (!rec.receipt_compact) { unsignedRecords += 1; continue; }
      const vr = verifyRecord(rec, pubKey, s.studentId);
      if (vr.payload) verifiedReceipts += 1; // signature valid; binding breaks (if any) follow
      for (const b of vr.breaks) sBreaks.push(b);
    }

    // Reviews (t:'review') ride the same verification (NIGHTLY_REVIEW_SPEC §8).
    const reviews = (s.bundle && s.bundle.reviews) || [];
    totalReviews += reviews.length;
    for (const rec of reviews) {
      if (!rec.receipt_compact) { unsignedReviews += 1; continue; }
      const vr = verifyReviewMark(rec, pubKey, s.studentId);
      if (vr.payload) verifiedReviews += 1;
      for (const b of vr.breaks) sBreaks.push(b);
    }

    // Recompute the commit-chain head from the receipt-bearing records.
    const commitRows = records
      .filter((r) => r.receipt_id && r.receipt_compact)
      .map((r) => ({ id: r.receipt_id, compact: r.receipt_compact, i: r.itemId, src: r.source, sc: r.score, ts: Date.parse(r.recorded_at) || 0 }));
    const { head } = buildCommits(commitRows, { sid: s.studentId, u: s.username });
    if ((head || null) !== (s.commitsHead || null)) {
      sBreaks.push({ kind: 'head-mismatch', expected: s.commitsHead || null, recomputed: head || null });
    }
    const tRoot = receiptRootOf(records.filter((r) => r.receipt_id).map((r) => r.receipt_id));
    if ((tRoot || null) !== (s.transcriptRoot || null)) {
      sBreaks.push({ kind: 'transcript-root-mismatch', expected: s.transcriptRoot || null, recomputed: tRoot || null });
    }

    students.push({
      studentId: s.studentId,
      username: s.username,
      recordCount: records.length,
      lastActivityAt: s.lastActivityAt || null,
      head: head || null,
      verified: sBreaks.length === 0,
      breaks: sBreaks
    });
    for (const b of sBreaks) breaks.push({ studentId: s.studentId, ...b });
  }

  // Epoch anchor: recompute the root over the RE-DERIVED heads (not the snapshot's
  // claimed heads) and check it against the signed epoch — so any tampered record
  // that shifts a head also breaks the anchor.
  let epochOk = true;
  const epoch = snapshot.epoch || null;
  if (epoch) {
    const reHeads = {};
    for (const s of students) reHeads[s.studentId] = s.head || null;
    const reRoot = epochRoot(reHeads);
    if (reRoot !== epoch.root) {
      epochOk = false;
      breaks.push({ kind: 'epoch-root-mismatch', expected: epoch.root, recomputed: reRoot });
    }
    if (epoch.receipt_compact) {
      const ep = verifyCompact(epoch.receipt_compact, pubKey);
      if (!ep) { epochOk = false; breaks.push({ kind: 'epoch-bad-signature' }); }
      else if (ep.root !== epoch.root) { epochOk = false; breaks.push({ kind: 'epoch-receipt-root-mismatch' }); }
    } else {
      epochOk = false;
      breaks.push({ kind: 'epoch-unsigned' });
    }
  }

  return {
    ok: breaks.length === 0,
    totals: { students: students.length, records: totalRecords, verifiedReceipts, unsignedRecords, reviews: totalReviews, verifiedReviews, unsignedReviews },
    epochOk,
    students,
    breaks
  };
}
