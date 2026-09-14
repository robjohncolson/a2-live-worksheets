// @ts-check
/* receipt-verify.js — shared Ed25519 receipt/transcript verification core.
 *
 * Single source of truth for the signed-receipt crypto, used by BOTH:
 *   - verify.html         (the public verifier: paste / drag / scan-via-phone)
 *   - teacher-verify.html  (the teacher scan-to-verify + gradebook cross-check)
 *
 * Classic <script>: it defines the verification functions as GLOBALS (the names
 * verify.html already uses) AND exposes them under window.ReceiptVerify for
 * callers that prefer a namespace. Keeping the crypto in one file means the two
 * verifier pages can never drift apart on the security-critical path.
 *
 * Issuer registry: base64url raw 32-byte Ed25519 public keys. Verification
 * tries production keys by default and reports which issuer signed. For key
 * rotation, APPEND new production keys here and never remove old trusted keys;
 * see KEY_MANAGEMENT_RUNBOOK.md.
 */
(function (root) {
  'use strict';

  /** @type {Issuer[]} */
  var ISSUERS = [
    { name: 'Quiz Server', pubkey: 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4', kind: 'quiz' },
    { name: 'The Desk',    pubkey: 'DRfEbaWByfatxMq26iHrw4wxt4MIpypZlbB3GeBFSO4', kind: 'desk' },
    { name: 'Quiz Server (TEST)', pubkey: 'ysLRAoc-rg-N2VTE2IR9s6Z1QT--9X64Qg3Px-6rUow', kind: 'quiz', test: true },
    { name: 'The Desk (TEST)',    pubkey: 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc', kind: 'desk', test: true }
  ];

  /** @param {string} s @returns {Uint8Array<ArrayBuffer>} */
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** @param {ArrayBuffer | Uint8Array} buf @returns {string} lowercase hex */
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  /** @type {Map<string, Promise<CryptoKey>>} */
  var keyCache = new Map();
  /** @param {string} pubkey - base64url raw 32-byte Ed25519 public key @returns {Promise<CryptoKey>} */
  function importIssuerKey(pubkey) {
    var cached = keyCache.get(pubkey);
    if (cached) return cached;
    var p;
    try {
      p = crypto.subtle.importKey('raw', b64urlToBytes(pubkey), { name: 'Ed25519' }, false, ['verify']);
    } catch (e) {
      // Synchronous failure (malformed base64url): never cached, always retryable.
      return Promise.reject(e);
    }
    keyCache.set(pubkey, p);
    // A REJECTED import must not poison the cache: evict so the next call retries.
    // (A transient WebCrypto failure would otherwise disable this issuer for the
    // page's lifetime.) Successful imports stay cached.
    p.catch(function () { if (keyCache.get(pubkey) === p) keyCache.delete(pubkey); });
    return p;
  }

  // Test issuer keys are only honored when ?test=1 (query or hash). Browser-only.
  /** @returns {boolean} */
  function hasTestModeFlag() {
    var query = new URLSearchParams(location.search);
    var hashQuery = location.hash.includes('?')
      ? location.hash.slice(location.hash.indexOf('?') + 1)
      : location.hash.replace(/^#/, '');
    var hash = new URLSearchParams(hashQuery);
    return query.get('test') === '1' || hash.get('test') === '1';
  }

  /** @param {boolean} includeTestKeys @returns {Issuer[]} */
  function issuersForRun(includeTestKeys) {
    return ISSUERS.filter(function (issuer) { return includeTestKeys || !issuer.test; });
  }

  // Verify one compact receipt ("payloadB64url.sigB64url"). Returns
  // { ok, issuer, payload, receiptId }. ok=false means no known production
  // (or, with includeTestKeys, test) issuer signed these exact bytes.
  /**
   * @param {string} compact - "payloadB64url.sigB64url"
   * @param {{includeTestKeys?: boolean}} [options]
   * @returns {Promise<VerifyReceiptResult>}
   */
  async function verifyReceipt(compact, options) {
    options = options || {};
    var parts = compact.trim().split('.');
    if (parts.length !== 2) throw new Error('Not a receipt: expected two dot-separated parts.');
    var payloadBytes = b64urlToBytes(parts[0]);
    var sigBytes = b64urlToBytes(parts[1]);
    /** @type {Receipt} */
    var payload;
    try { payload = JSON.parse(new TextDecoder().decode(payloadBytes)); }
    catch (e) { throw new Error('Receipt payload is not valid JSON.'); }
    if (payload.v !== 1) throw new Error('Unknown receipt version: ' + payload.v);

    var issuer = null;
    var candidates = issuersForRun(!!options.includeTestKeys);
    for (var i = 0; i < candidates.length; i++) {
      // Per-candidate isolation (mirrors verifySubmissionRow): one malformed or
      // transiently-unimportable registered key must not abort the whole loop —
      // the real signer may be a LATER candidate. An all-candidates failure just
      // returns ok:false (fail closed), never a thrown error to the caller.
      try {
        var key = await importIssuerKey(candidates[i].pubkey);
        if (await crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, payloadBytes)) {
          issuer = candidates[i];
          break;
        }
      } catch (e) { /* try the next issuer key */ }
    }
    var receiptId = hex(await crypto.subtle.digest('SHA-256', payloadBytes));
    return { ok: !!issuer, issuer: issuer, payload: payload, receiptId: receiptId };
  }

  // Bind a stored ledger ROW to its signed receipt. verifyReceipt only proves "a
  // trusted issuer signed some bytes"; this proves those bytes ARE this row's
  // grade-bearing fields — so grading off the row equals grading off the signature.
  // WITHOUT this, a harvested valid receipt_compact can be re-stapled onto a row with
  // a forged score / item / id and would still pass (the signatures would be
  // decorative). This is the verify-on-ingest trust boundary for the UNTRUSTED
  // transports (P2P gossip / QR). Returns Promise<boolean>.
  //
  // includeTestKeys is FORCED false: never honor test issuer keys on the ingest path
  // (an app deep-link `?test=1` is attacker-influenceable, and a leaked test key would
  // otherwise verify). The server builds a row's columns and its receipt payload from
  // the same data, so a legitimate row always matches — only forged rows are rejected.
  /**
   * @param {LedgerRow} row - loose row from an untrusted transport (gossip / QR)
   * @returns {Promise<boolean>}
   */
  async function verifyLedgerRow(row) {
    if (!row || !row.receipt_compact) return false;
    var r;
    try { r = await verifyReceipt(row.receipt_compact, { includeTestKeys: false }); }
    catch (e) { return false; }
    if (!r || !r.ok) return false;
    // Cast to the grade-lane payload shape; the String(p.t) check below stays the runtime gate.
    var p = /** @type {LedgerReceiptPayload} */ (r.payload || {});
    // Domain separation (OFFLINE_GRADING_MESH_SPEC §0.1a): a GRADE row must carry a
    // grade-type payload. Every grade receipt ever minted is t:'ledger' (a teacher FRQ
    // grade is t:'ledger' with src:'frq'); without this check, any trusted-issuer
    // receipt of another type (review / epoch / commit) — or a future student
    // submission — could be dressed up as a grade row.
    if (String(p.t) !== 'ledger') return false;
    // Content address: the row id MUST be SHA-256(signed payload). Blocks replaying one
    // signature under many ids (G-Set bloat) and pinning a signature to a foreign id.
    if (String(row.receipt_id) !== String(r.receiptId)) return false;
    // Grade-bearing fields must equal the signed payload (src / i / sc).
    if (String(row.source) !== String(p.src)) return false;
    if (String(row.item_id) !== String(p.i)) return false;
    if (p.sc == null) {
      // Ungraded: the row must not claim a score the signature doesn't carry.
      if (row.score != null && row.score !== '') return false;
    } else if (Number(row.score) !== Number(p.sc)) {
      return false;
    }
    // Attribution: a row that names a student must name the SIGNED student.
    var rowSid = (row.student_id != null) ? row.student_id : row.sid;
    if (rowSid != null && String(rowSid) !== String(p.sid)) return false;
    // Attempt is grade-affecting: latestPerItem picks the HIGHEST attempt per item, so an
    // unbound attempt lets a student resurrect an older signed score under a forged higher
    // attempt (the score stays bound, but "latest attempt wins" is defeated). Bind it;
    // default-1 on both sides for receipts minted before `a` existed.
    var rowA = (row.attempt == null) ? 1 : Number(row.attempt);
    var sigA = (p.a == null) ? 1 : Number(p.a);
    if (!Number.isFinite(rowA) || !Number.isFinite(sigA) || rowA !== sigA) return false;
    return true;
  }

  /** @param {string} s @returns {Promise<string>} lowercase sha256 hex */
  async function sha256HexText(s) {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  }

  // ── Student trust set (OFFLINE_GRADING_MESH_SPEC §0.1) ─────────────────────
  // A SECOND, fully separate registry: student keys sign SUBMISSIONS (raw work),
  // never grades. The two trust sets are never merged — §0.1c — so a student key
  // can never validate a grade row and an issuer key can never validate a
  // submission's key→sid binding. Entries: { pubkey, sid, revoked }.
  /** @type {StudentKeyEntry[]} */
  var STUDENT_KEYS = [];

  // Register/refresh the student trust set (typically the server's /student-keys
  // list). Disjointness is ASSERTED here: a pubkey that already appears in the
  // issuer registry is refused (and counted), never added — §0.1c.
  /**
   * @param {Array<{pubkey?: unknown, sid?: unknown, revoked?: unknown}>} list - untrusted (server /student-keys response)
   * @returns {{added: number, updated: number, conflicts: number}}
   */
  function registerStudentKeys(list) {
    var added = 0, updated = 0, conflicts = 0;
    (Array.isArray(list) ? list : []).forEach(function (k) {
      if (!k || typeof k.pubkey !== 'string' || !k.pubkey || k.sid == null) return;
      var inIssuers = ISSUERS.some(function (i) { return i.pubkey === k.pubkey; });
      if (inIssuers) { conflicts += 1; return; }
      var entry = { pubkey: k.pubkey, sid: String(k.sid), revoked: !!k.revoked };
      var idx = -1;
      for (var i = 0; i < STUDENT_KEYS.length; i++) if (STUDENT_KEYS[i].pubkey === k.pubkey) { idx = i; break; }
      if (idx >= 0) {
        // One-sid-per-pubkey: a re-register may flip `revoked` (revocation
        // propagates) but NEVER re-binds the key to a different student.
        if (STUDENT_KEYS[idx].sid !== entry.sid) { conflicts += 1; return; }
        // Revocation is terminal on this registry: never un-revoke from a refresh.
        STUDENT_KEYS[idx].revoked = STUDENT_KEYS[idx].revoked || entry.revoked;
        updated += 1;
      } else {
        STUDENT_KEYS.push(entry);
        added += 1;
      }
    });
    return { added: added, updated: updated, conflicts: conflicts };
  }

  // The mirror guard for issuer registration: refuse any pubkey already bound to
  // a student. Client boot code (Desk/mobile) should add issuer keys through this
  // instead of pushing into ISSUERS directly.
  /**
   * @param {unknown[]} pubkeys - untrusted candidate keys
   * @param {{name?: string, kind?: string}} [meta]
   * @returns {{added: number, conflicts: number}}
   */
  function registerIssuerKeys(pubkeys, meta) {
    meta = meta || {};
    var added = 0, conflicts = 0;
    (Array.isArray(pubkeys) ? pubkeys : []).forEach(function (pk) {
      if (typeof pk !== 'string' || !pk) return;
      var isStudent = STUDENT_KEYS.some(function (k) { return k.pubkey === pk; });
      if (isStudent) { conflicts += 1; return; }
      var have = ISSUERS.some(function (i) { return i.pubkey === pk; });
      if (have) return;
      ISSUERS.push({ name: meta.name || 'Roster', pubkey: pk, kind: meta.kind || 'roster' });
      added += 1;
    });
    return { added: added, conflicts: conflicts };
  }

  // stringifyResponse — MUST byte-match receipt-sign.js / roster-server receipts.js
  // so the submission's `ah` binds the same bytes everywhere.
  /** @param {unknown} value @returns {string} */
  function stringifyResponse(value) {
    if (typeof value === 'string') return value;
    var s;
    try { s = JSON.stringify(value); } catch (e) { s = undefined; }
    return (s === undefined) ? String(value) : s;
  }

  // Bind a stored SUBMISSION row to its student-signed receipt. This is the
  // submissions-lane twin of verifyLedgerRow, verified ONLY against the student
  // trust set (§0.1b) — the two lanes share no keys. Checks:
  //   - Ed25519 signature by a NON-REVOKED registered student key
  //   - payload.t === 'submission' AND the payload carries NO grade fields (sc/g)
  //     — a submission structurally cannot be a grade
  //   - content address: row.receipt_id === sha256(signed payload)
  //   - field binding: src / i match the row
  //   - response binding: payload.ah === sha256(stringifyResponse(row.response)).slice(16)
  //     (the response is the cargo — without this a peer could swap the answer
  //     text under a valid signature)
  //   - attribution (the impersonation gate, §0.2): the row MUST name a student,
  //     the payload sid must equal it, and BOTH must equal the sid the signing
  //     key is REGISTERED to — never the payload's own claim.
  /**
   * @param {SubmissionRow} row - loose row from an untrusted transport (gossip / QR)
   * @returns {Promise<boolean>}
   */
  async function verifySubmissionRow(row) {
    if (!row || !row.receipt_compact) return false;
    if (row.student_id == null || row.student_id === '') return false;
    var parts, payloadBytes, sigBytes, p;
    try {
      parts = String(row.receipt_compact).trim().split('.');
      if (parts.length !== 2) return false;
      payloadBytes = b64urlToBytes(parts[0]);
      sigBytes = b64urlToBytes(parts[1]);
      // Cast to the submission-lane payload shape; String(p.t) below stays the runtime gate.
      p = /** @type {SubmissionReceiptPayload} */ (JSON.parse(new TextDecoder().decode(payloadBytes)));
    } catch (e) { return false; }
    if (!p || p.v !== 1) return false;
    if (String(p.t) !== 'submission') return false;
    // §0.1b: grade fields present at ALL (even null) → structurally not a submission.
    if ('sc' in p || 'g' in p) return false;

    var signer = null;
    for (var i = 0; i < STUDENT_KEYS.length; i++) {
      var cand = STUDENT_KEYS[i];
      if (cand.revoked) continue;
      try {
        var key = await importIssuerKey(cand.pubkey);
        if (await crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, payloadBytes)) { signer = cand; break; }
      } catch (e) { /* try the next key */ }
    }
    if (!signer) return false;

    var receiptId = hex(await crypto.subtle.digest('SHA-256', payloadBytes));
    if (String(row.receipt_id) !== receiptId) return false;
    if (String(row.source) !== String(p.src)) return false;
    if (String(row.item_id) !== String(p.i)) return false;
    var ah = (await sha256HexText(stringifyResponse(row.response))).slice(0, 16);
    if (String(p.ah) !== ah) return false;
    if (String(row.student_id) !== String(p.sid)) return false;
    if (String(p.sid) !== signer.sid) return false;
    return true;
  }

  // Pull the verifiable token out of whatever a QR scan / paste produced:
  //   - a full verify URL ( …/verify.html#r=<compact>  or  #commit=<deep> )
  //   - a bare compact receipt ( payload.sig )
  // Returns { kind:'receipt'|'commit', value } or null if unrecognized.
  /**
   * @param {unknown} text - raw scan / paste text
   * @returns {{kind: 'receipt'|'commit', value: string} | null}
   */
  function parseVerifyTarget(text) {
    if (!text) return null;
    var str = String(text).trim();
    var hashIdx = str.indexOf('#');
    if (hashIdx >= 0) {
      var hash = str.slice(hashIdx + 1);
      var rm = hash.match(/(?:^|&)r=([^&]+)/);
      if (rm) { try { return { kind: 'receipt', value: decodeURIComponent(rm[1]) }; } catch (e) { return { kind: 'receipt', value: rm[1] }; } }
      var cm = hash.match(/(?:^|&)commit=([^&]+)/);
      if (cm) { try { return { kind: 'commit', value: decodeURIComponent(cm[1]) }; } catch (e) { return { kind: 'commit', value: cm[1] }; } }
    }
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) return { kind: 'receipt', value: str };
    return null;
  }

  var api = {
    ISSUERS: ISSUERS,
    STUDENT_KEYS: STUDENT_KEYS,
    b64urlToBytes: b64urlToBytes,
    hex: hex,
    importIssuerKey: importIssuerKey,
    hasTestModeFlag: hasTestModeFlag,
    issuersForRun: issuersForRun,
    verifyReceipt: verifyReceipt,
    verifyLedgerRow: verifyLedgerRow,
    registerStudentKeys: registerStudentKeys,
    registerIssuerKeys: registerIssuerKeys,
    verifySubmissionRow: verifySubmissionRow,
    sha256HexText: sha256HexText,
    parseVerifyTarget: parseVerifyTarget
  };

  // Namespace for new callers...
  root.ReceiptVerify = api;
  // ...and the bare globals verify.html's inline code already references.
  root.ISSUERS = ISSUERS;
  root.b64urlToBytes = b64urlToBytes;
  root.hex = hex;
  root.importIssuerKey = importIssuerKey;
  root.hasTestModeFlag = hasTestModeFlag;
  root.issuersForRun = issuersForRun;
  root.verifyReceipt = verifyReceipt;
  root.verifyLedgerRow = verifyLedgerRow;
  root.sha256HexText = sha256HexText;
  root.parseVerifyTarget = parseVerifyTarget;
})(typeof window !== 'undefined' ? window : this);
