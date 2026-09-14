// @ts-check
// ledger-seal.js — on-device DAILY EPOCH sealing (ANDROID Phase 4 §4 step 5).
// The teacher device, after grading + signing receipts, computes each student's
// commit `head` and seals the day with a signed epoch anchor — byte-compatible with
// the server so verifySnapshot accepts it. Lets the class run with NO server in the
// loop (the epoch is the O(1)/day seal over all heads).
//
// Ports the head + epoch math from roster-server/commits.js + admin-snapshot.js
// EXACTLY (parity-pinned in tests/ledger-seal-parity.test.js):
//   head(student)  = commitRoot of the LAST commit (commits.js buildCommits) —
//                    ordering by ts,id; sessions split on >25min gap; chunks of 8;
//                    commitRoot(ids) = sha256hex(ids.sorted.join('\n')).
//   epochRoot(heads) = sha256hex( sorted "sid:head|-" lines join '\n' ).
//   epoch receipt    = sign({v:1,t:'epoch',iss:'desk',d,cnt,root,ts,n[,prev]}).
//
// Signing is delegated to window.ReceiptSign (Ed25519). window.LedgerSeal:
//   .commitRoot(ids)               -> Promise<hex>
//   .buildHead(rows)               -> Promise<hex|null>   rows: [{id, ts}]
//   .epochRoot(heads)              -> Promise<hex>        heads: {sid: head|null}
//   .sealEpoch({heads, asOfDateNY, prev?, privateKey, ...}) -> Promise<{root,compact,epoch}>

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var SESSION_GAP_MS = 25 * 60 * 1000; // commits.js
  var MAX_PER_COMMIT = 8;              // commits.js

  function subtle() {
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.subtle) throw new Error('WebCrypto SubtleCrypto unavailable');
    return c.subtle;
  }
  /** @param {string} str @returns {Uint8Array} */
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var b = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
    return b;
  }
  /** @param {Uint8Array | ArrayBuffer} buf @returns {string} lowercase hex */
  function hex(buf) {
    var arr = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
    return out;
  }
  /** @param {string} str @returns {Promise<string>} */
  function sha256Hex(str) {
    return subtle().digest('SHA-256', utf8(str)).then(hex);
  }

  // commits.js commitRoot — order-independent root over a chunk's ids.
  /** @param {string[]} ids @returns {Promise<string>} sha256 hex */
  function commitRoot(ids) {
    return sha256Hex(ids.slice().sort().join('\n'));
  }

  // commits.js buildCommits, reduced to just the HEAD (root of the last commit).
  // The head depends only on the ids of the final non-duplicate chunk, so we
  // replicate the ordering + session/chunk split and root each chunk in order.
  /** @param {Array<{id: string, ts: number}>} rows @returns {Promise<string | null>} head hex, or null if no commits */
  function buildHead(rows) {
    var ordered = (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
      return (a.ts - b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    // Session-split, then chunk each session at MAX_PER_COMMIT (chunks never span sessions).
    var sessions = [], buf = [], lastTs = null;
    function flush() { if (buf.length) { sessions.push(buf); buf = []; } }
    for (var k = 0; k < ordered.length; k++) {
      var rrow = ordered[k];
      if (lastTs !== null && (rrow.ts - lastTs) > SESSION_GAP_MS) flush();
      buf.push(rrow); lastTs = rrow.ts;
    }
    flush();
    var chunks = [];
    for (var s = 0; s < sessions.length; s++) {
      var sess = sessions[s];
      for (var i = 0; i < sess.length; i += MAX_PER_COMMIT) {
        chunks.push(sess.slice(i, i + MAX_PER_COMMIT).map(function (c) { return c.id; }));
      }
    }
    // Root each chunk in order, skipping any with duplicate ids (commits.js line 65);
    // head = the last surviving root, or null if no commits.
    var head = null;
    var chain = Promise.resolve();
    chunks.forEach(function (ids) {
      chain = chain.then(function () {
        var seen = {}, dup = false;
        for (var j = 0; j < ids.length; j++) { if (seen[ids[j]]) { dup = true; break; } seen[ids[j]] = 1; }
        if (dup) return;
        return commitRoot(ids).then(function (rt) { head = rt; });
      });
    });
    return chain.then(function () { return head; });
  }

  // admin-snapshot.js epochRoot — sorted "sid:head|-" lines, sha256.
  /** @param {Record<string, string | null>} heads @returns {Promise<string>} sha256 hex */
  function epochRoot(heads) {
    var keys = Object.keys(heads || {}).sort();
    var lines = keys.map(function (sid) { return sid + ':' + (heads[sid] || '-'); });
    return sha256Hex(lines.join('\n'));
  }

  /** @returns {string} 8 hex chars */
  function randomNonce() {
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    var b = new Uint8Array(4);
    c.getRandomValues(b);
    return hex(b);
  }

  // Seal the day: epochRoot over heads, then sign the epoch receipt with the device
  // key via ReceiptSign. opts: { heads, asOfDateNY, prev?, privateKey, now?, nonce?, signImpl? }.
  /**
   * @param {{heads?: Record<string, string | null>, asOfDateNY?: string, prev?: string | null, privateKey?: CryptoKey, now?: number, nonce?: string, signImpl?: (key: any, payload: Record<string, unknown>) => Promise<{compact: string, receiptId: string}>}} opts
   * @returns {Promise<{root: string, compact: string, receiptId: string, epoch: {asOfDateNY: string, d: string, cnt: number, heads: Record<string, string | null>, root: string, prev: string | null, receipt_compact: string}}>}
   */
  function sealEpoch(opts) {
    opts = opts || {};
    var heads = opts.heads || {};
    var sign = opts.signImpl || (root.ReceiptSign && root.ReceiptSign.signPayload);
    if (typeof sign !== 'function') return Promise.reject(new Error('ReceiptSign.signPayload unavailable'));
    // Refuse to seal without a date: canonicalize DROPS undefined keys, so a missing
    // asOfDateNY would silently sign an epoch receipt with no `d` field at all.
    if (typeof opts.asOfDateNY !== 'string' || !opts.asOfDateNY) {
      return Promise.reject(new Error('sealEpoch: asOfDateNY (NY calendar date) is required'));
    }
    return epochRoot(heads).then(function (rootHex) {
      /** @type {EpochReceiptPayload} */
      var payload = {
        v: 1, t: 'epoch', iss: 'desk', d: /** @type {string} */ (opts.asOfDateNY),
        cnt: Object.keys(heads).length, root: rootHex,
        ts: (opts.now != null ? opts.now : Date.now()),
        n: (opts.nonce != null ? opts.nonce : randomNonce())
      };
      if (opts.prev) payload.prev = opts.prev;
      return sign(opts.privateKey, payload).then(function (r) {
        return {
          root: rootHex, compact: r.compact, receiptId: r.receiptId,
          epoch: {
            asOfDateNY: opts.asOfDateNY, d: opts.asOfDateNY, cnt: payload.cnt,
            heads: heads, root: rootHex, prev: opts.prev || null, receipt_compact: r.compact
          }
        };
      });
    });
  }

  root.LedgerSeal = {
    commitRoot: commitRoot,
    buildHead: buildHead,
    epochRoot: epochRoot,
    sealEpoch: sealEpoch
  };

})();
