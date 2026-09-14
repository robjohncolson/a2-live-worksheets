// @ts-check
// receipt-sign.js — on-device Ed25519 receipt SIGNING (ANDROID Phase 4 §3B).
// The verify side already exists (receipt-verify.js); this is the issuing side, so
// the TEACHER DEVICE can generate a key and sign receipts that the existing server
// verifier (snapshot-verify.js verifyCompact) and every client (receipt-verify.js)
// accept — once the device pubkey is in the issuer trust set (Phase 4 §2).
//
// It reproduces roster-server/receipts.js::signPayload EXACTLY:
//   canonical = JSON of the payload with sorted keys, undefined dropped
//   bytes     = utf8(canonical)
//   receiptId = sha256(bytes) hex
//   sig       = Ed25519(bytes)
//   compact   = b64url(bytes) + "." + b64url(sig)
// Verified cross-stack in tests/receipt-sign-interop.test.js (JS signs → Node verifies).
//
// The key is generated WebCrypto-Ed25519 in the WebView; at rest the exported
// private JWK is stored hardware-WRAPPED + biometric-gated by the native
// secure-store plugin (Phase 4 §3B, "Ed25519 hardware-wrapped"). Pure crypto here;
// storage is the plugin's job.
//
// window.ReceiptSign (all crypto methods are async):
//   .canonicalize(payload)              -> canonical string (sync, matches server)
//   .generateKey()                      -> { publicKeyX, privateKey, privateJwk }
//   .exportPrivateJwk(privateKey)       -> jwk
//   .importPrivateKey(jwk)              -> CryptoKey
//   .publicKeyXFromPrivate(privateKey)  -> base64url x
//   .signPayload(privateKey, payload)   -> { receiptId, compact, canonical }

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function subtle() {
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.subtle) throw new Error('WebCrypto SubtleCrypto unavailable');
    return c.subtle;
  }

  /** @param {string} str @returns {Uint8Array} */
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    return bytes;
  }

  /** @param {Uint8Array | ArrayBuffer} bytes @returns {string} base64url, no padding */
  function bytesToB64url(bytes) {
    var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    var bin = '';
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    var b64 = (typeof btoa !== 'undefined') ? btoa(bin)
      : (typeof Buffer !== 'undefined') ? Buffer.from(arr).toString('base64')
      : (function () { throw new Error('no base64 encoder'); })();
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** @param {Uint8Array | ArrayBuffer} bytes @returns {string} lowercase hex */
  function hex(bytes) {
    var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    var out = '';
    for (var i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
    return out;
  }

  // EXACTLY roster-server/receipts.js::canonicalize — sorted keys, undefined dropped.
  /** @param {Record<string, unknown>} payload @returns {string} */
  function canonicalize(payload) {
    var sorted = /** @type {Record<string, unknown>} */ ({});
    Object.keys(payload).sort().forEach(function (k) {
      if (payload[k] !== undefined) sorted[k] = payload[k];
    });
    return JSON.stringify(sorted);
  }

  /** @returns {Promise<{publicKeyX: string | undefined, privateKey: CryptoKey, privateJwk: JsonWebKey}>} */
  function generateKey() {
    return subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
      .then(function (/** @type {CryptoKeyPair} */ pair) {
        return Promise.all([
          subtle().exportKey('jwk', pair.publicKey),
          subtle().exportKey('jwk', pair.privateKey)
        ]).then(function (jwks) {
          return { publicKeyX: jwks[0].x, privateKey: pair.privateKey, privateJwk: jwks[1] };
        });
      });
  }

  /** @param {CryptoKey} privateKey @returns {Promise<JsonWebKey>} */
  function exportPrivateJwk(privateKey) {
    return subtle().exportKey('jwk', privateKey);
  }

  /** @param {JsonWebKey} jwk @returns {Promise<CryptoKey>} */
  function importPrivateKey(jwk) {
    return subtle().importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
  }

  /** @param {CryptoKey} privateKey @returns {Promise<string | undefined>} base64url x */
  function publicKeyXFromPrivate(privateKey) {
    // Re-derive the public JWK x from the (extractable) private JWK.
    return exportPrivateJwk(privateKey).then(function (jwk) { return jwk.x; });
  }

  /**
   * Sign a canonicalized payload. The compact form is what every verifier parses.
   * @param {CryptoKey} privateKey
   * @param {Record<string, unknown>} payload
   * @returns {Promise<{receiptId: string, compact: string, canonical: string}>}
   */
  function signPayload(privateKey, payload) {
    var canonical = canonicalize(payload);
    var bytes = utf8(canonical);
    return Promise.all([
      subtle().sign({ name: 'Ed25519' }, privateKey, bytes),
      subtle().digest('SHA-256', bytes)
    ]).then(function (out) {
      var sig = new Uint8Array(out[0]);
      var receiptId = hex(out[1]);
      var compact = bytesToB64url(bytes) + '.' + bytesToB64url(sig);
      return { receiptId: receiptId, compact: compact, canonical: canonical };
    });
  }

  // EXACTLY roster-server/receipts.js::stringifyResponse.
  /** @param {unknown} value @returns {string} */
  function stringifyResponse(value) {
    if (typeof value === 'string') return value;
    var s = JSON.stringify(value);
    return s === undefined ? String(value) : s;
  }

  /** @param {string} str @returns {Promise<string>} */
  function sha256HexStr(str) {
    return subtle().digest('SHA-256', utf8(str)).then(function (buf) { return hex(buf); });
  }

  // answerHash matches snapshot-verify.js: sha256(stringifyResponse(response)).slice(0,16).
  /** @param {unknown} response @returns {Promise<string>} */
  function answerHash(response) {
    return sha256HexStr(stringifyResponse(response)).then(function (h) { return h.slice(0, 16); });
  }

  /** @returns {string} 8 hex chars */
  function randomNonce() {
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    var bytes = new Uint8Array(4);
    c.getRandomValues(bytes);
    return hex(bytes);
  }

  // Build + sign a ledger receipt matching receipts.js::issueLedgerReceipt's payload
  // ({v:1,t:'ledger',sid,u?,src,i,a,e,ah,ts,n,sc?,g?,sub?,kv?}). A teacher FRQ grade is
  // an 'frq' receipt with the student's response (for `ah`) + a score + an incremented
  // attempt (latest-wins supersedes). The signed record then passes verifyRecord.
  // fields: { sid, u?, src, i, a(attempt), e(evidenceTier), response, sc?, g?, ts?, n?,
  //           sub?, kv? }
  //   sub — the offline-grading-mesh submission this grade covers = that submission's
  //         receipt_id (§0.7: makes SubmissionStore suppress the graded submission).
  //   kv  — the answer-key version this grade was scored against (§0.10 provenance).
  //   ts/n — pass explicit deterministic values (derived from the submission) so
  //          re-grading the SAME submission yields a byte-identical receipt → dedups (§0.8).
  /**
   * @param {CryptoKey} privateKey - the device's Ed25519 signing key
   * @param {LedgerGradeFields} fields
   * @returns {Promise<{receiptId: string, compact: string, payload: LedgerReceiptPayload}>}
   */
  function signLedgerReceipt(privateKey, fields) {
    fields = fields || /** @type {any} */ ({});
    return answerHash(fields.response).then(function (ah) {
      /** @type {LedgerReceiptPayload} */
      var payload = {
        v: 1, t: 'ledger', sid: fields.sid, src: fields.src, i: fields.i,
        a: (fields.a == null ? 1 : fields.a), e: fields.e || 'practice', ah: ah,
        ts: (fields.ts != null ? fields.ts : Date.now()),
        n: (fields.n != null ? fields.n : randomNonce())
      };
      if (fields.u !== undefined) payload.u = fields.u;
      if (fields.sc !== undefined && fields.sc !== null) payload.sc = Number(fields.sc);
      if (fields.g !== undefined) payload.g = fields.g;
      if (fields.sub !== undefined && fields.sub !== null) payload.sub = String(fields.sub);
      if (fields.kv !== undefined && fields.kv !== null) payload.kv = String(fields.kv);
      return signPayload(privateKey, payload).then(function (r) {
        return { receiptId: r.receiptId, compact: r.compact, payload: payload };
      });
    });
  }

  root.ReceiptSign = {
    canonicalize: canonicalize,
    generateKey: generateKey,
    exportPrivateJwk: exportPrivateJwk,
    importPrivateKey: importPrivateKey,
    publicKeyXFromPrivate: publicKeyXFromPrivate,
    signPayload: signPayload,
    stringifyResponse: stringifyResponse,
    answerHash: answerHash,
    signLedgerReceipt: signLedgerReceipt,
    _bytesToB64url: bytesToB64url
  };

})();
