// @ts-check
// ledger-store.js — durable local replica of the student's OWN signed ledger.
// ANDROID_PHASE2_LEDGER_MERGE_SPEC §1.B. Pure browser JS (no build, no imports);
// loaded as a <script> alongside receipt-verify.js + grade-engine.bundle.js.
//
// This is the device's content-addressed G-Set: a grow-only set of signed
// item_ledger rows keyed by `receipt_id` (the hash of the signed payload), so
// merges are union/dedup/idempotent and converge regardless of order or transport
// (the exact structure Phase 3 will gossip P2P). The student device pulls its own
// rows from GET /ledger/student, keeps them locally, and OFFLINE re-derives its
// grade by feeding the stored rows to window.GradeEngine.computeGrade.
//
// window.LedgerStore:
//   .keyOf(row)                identity: receipt_id, else "source|itemId|attempt"
//   .mergeRow(list, row)       pure: union/dedup, keep newer signed-ts on collision
//   .mergeAll(list, rows)      pure: fold mergeRow over rows
//   .put(row) / .putAll(rows)  durable write (IndexedDB, in-memory fallback)
//   .all() -> Promise<row[]>   durable read
//   .clear() -> Promise        durable clear
//   .pull(client, opts)        GET /ledger/student/:sid -> merge in (online-only)
//   .verifyAll(opts)           Ed25519-verify each receipt -> {verified, ...counts}

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  var DB_NAME = 'a2_ledger_v1';
  var STORE = 'rows';

  // ── Pure helpers ────────────────────────────────────────────────────────────

  /** @param {LedgerRow | null | undefined} row @returns {number} attempt, defaulted to 1 (matches the verifiers) */
  function attemptOf(row) {
    return (row && row.attempt != null) ? row.attempt : 1;
  }

  // Content address first: receipt_id uniquely identifies a signed record, so two
  // devices that saw the same record dedup perfectly. Pre-0018 rows (no receipt)
  // fall back to the logical "source|item|attempt" key so they still dedup.
  /** @param {LedgerRow | null | undefined} row @returns {string} G-Set identity key */
  function keyOf(row) {
    if (row && row.receipt_id) return 'r:' + String(row.receipt_id);
    return 'k:' + String(row && row.source) + '|' + String(row && row.item_id) + '|' + String(attemptOf(row));
  }

  // Signed timestamp for tie-breaking when two rows share a logical key but differ
  // (e.g. a re-submission re-graded). Prefer the receipt payload's `ts`, then the
  // row's recorded_at, then 0. (Within a single receipt_id rows are identical, so
  // this only matters for the fallback key path.)
  /** @param {LedgerRow | null | undefined} row @returns {number} signed timestamp (ms), 0 when unknown */
  function tsOf(row) {
    if (!row) return 0;
    if (typeof row.ts === 'number' && isFinite(row.ts)) return row.ts;
    if (row.recorded_at) {
      var t = Date.parse(row.recorded_at);
      if (isFinite(t)) return t;
    }
    return 0;
  }

  /** @param {LedgerRow} prev @param {LedgerRow} next @returns {LedgerRow} */
  function pickNewer(prev, next) {
    return tsOf(next) >= tsOf(prev) ? next : prev;
  }

  // Pure: union a row into a list, deduped by keyOf. On a receipt_id collision the
  // records are byte-identical so either wins; on a fallback-key collision keep the
  // newer signed-ts. (Latest-WINS for grading happens later in computeGrade's
  // latestPerItem; the store keeps the full G-Set.)
  /** @param {LedgerRow[]} list @param {LedgerRow} row @returns {LedgerRow[]} */
  function mergeRow(list, row) {
    var out = Array.isArray(list) ? list.slice() : [];
    var k = keyOf(row);
    for (var i = 0; i < out.length; i++) {
      if (keyOf(out[i]) === k) { out[i] = pickNewer(out[i], row); return out; }
    }
    out.push(row);
    return out;
  }

  /** @param {LedgerRow[]} list @param {LedgerRow[]} rows @returns {LedgerRow[]} */
  function mergeAll(list, rows) {
    var out = Array.isArray(list) ? list.slice() : [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) out = mergeRow(out, rows[i]);
    return out;
  }

  // ── Storage adapter: IndexedDB, with an in-memory fallback (jsdom/file://) ─────

  /**
   * Minimal async KV surface both storage backends implement.
   * @typedef {Object} RowStore
   * @property {(k: string) => Promise<LedgerRow | null>} get
   * @property {(k: string, v: LedgerRow) => Promise<void>} put
   * @property {() => Promise<LedgerRow[]>} getAll
   * @property {() => Promise<void>} clear
   */

  /** @returns {RowStore} */
  function makeMemStore() {
    var map = new Map();
    return {
      get: function (k) { return Promise.resolve(map.has(k) ? map.get(k) : null); },
      put: function (k, v) { map.set(k, v); return Promise.resolve(); },
      getAll: function () { return Promise.resolve(Array.from(map.values())); },
      clear: function () { map.clear(); return Promise.resolve(); }
    };
  }

  /** @returns {RowStore | null} null when indexedDB is unavailable (store() falls back to memory) */
  function makeIdbStore() {
    var idb = (typeof root.indexedDB !== 'undefined') ? root.indexedDB : null;
    if (!idb) return null;

    /** @returns {Promise<IDBDatabase>} */
    function open() {
      return new Promise(function (resolve, reject) {
        var req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: '_k' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    /**
     * @param {IDBTransactionMode} mode
     * @param {(s: IDBObjectStore) => {_result?: any}} fn - runs inside the tx; stashes any read on the returned box
     * @returns {Promise<any>} resolves with box._result once the tx completes
     */
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, mode);
          var s = t.objectStore(STORE);
          var box = fn(s);
          t.oncomplete = function () { resolve(box && box._result !== undefined ? box._result : undefined); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      });
    }

    return {
      get: function (k) {
        return tx('readonly', function (s) { var box = /** @type {{_result?: any}} */ ({}); var r = s.get(k); r.onsuccess = function () { box._result = r.result ? r.result.v : null; }; return box; });
      },
      put: function (k, v) { return tx('readwrite', function (s) { s.put({ _k: k, v: v }); return {}; }); },
      getAll: function () {
        return tx('readonly', function (s) { var box = /** @type {{_result?: any}} */ ({}); var r = s.getAll(); r.onsuccess = function () { box._result = (r.result || []).map(function (row) { return row.v; }); }; return box; });
      },
      clear: function () { return tx('readwrite', function (s) { s.clear(); return {}; }); }
    };
  }

  /** @type {RowStore | null} */
  var _store = null;
  function store() {
    if (!_store) _store = makeIdbStore() || makeMemStore();
    return _store;
  }

  // ── Durable API ───────────────────────────────────────────────────────────

  // Compare-and-merge: never let an older write clobber a newer stored record.
  /**
   * @param {LedgerRow | null | undefined} row
   * @returns {Promise<LedgerRow | null>} the stored record (the newer of existing vs incoming)
   */
  function put(row) {
    if (!row) return Promise.resolve(null);
    var s = store();
    var k = keyOf(row);
    return s.get(k).then(function (existing) {
      var merged = existing ? pickNewer(existing, row) : row;
      return s.put(k, merged).then(function () { return merged; });
    });
  }

  /** @param {LedgerRow[] | null | undefined} rows @returns {Promise<number>} rows processed (not rows added) */
  function putAll(rows) {
    if (!Array.isArray(rows) || !rows.length) return Promise.resolve(0);
    var chain = Promise.resolve();
    var n = 0;
    rows.forEach(function (row) {
      chain = chain.then(function () { return put(row).then(function () { n += 1; }); });
    });
    return chain.then(function () { return n; });
  }

  /** @returns {Promise<LedgerRow[]>} */
  function all() { return store().getAll(); }
  /** @returns {Promise<void>} */
  function clear() { return store().clear(); }

  // Pull the student's own signed rows and merge them in. Online-only: any thrown
  // fetch (offline / unreachable) is swallowed and the local replica is left as-is.
  // `client` is window.rosterClient (has .current()/.token()); opts.fetchImpl and
  // opts.serverUrl override for tests.
  /**
   * @param {{current?: () => any, token?: () => any} | null | undefined} client - window.rosterClient (or a stub)
   * @param {{fetchImpl?: typeof fetch, serverUrl?: string, studentId?: string, token?: string}} [opts]
   * @returns {Promise<{added: number, offline: boolean, total?: number, reason?: string}>}
   */
  function pull(client, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!fetchImpl) return Promise.resolve({ added: 0, offline: true });

    var sid = opts.studentId;
    var token = opts.token;
    if ((!sid || !token) && client && typeof client.current === 'function') {
      var cur = client.current() || {};
      sid = sid || cur.studentId || cur.student_id || cur.sid;
      token = token || (typeof client.token === 'function' ? client.token() : cur.token);
    }
    if (!sid || !token) return Promise.resolve({ added: 0, offline: false, reason: 'no-identity' });

    var base = opts.serverUrl || root.RAILWAY_ROSTER_URL || root.ROSTER_SERVER_URL || '';
    var url = base.replace(/\/$/, '') + '/ledger/student/' + encodeURIComponent(sid) +
      '?token=' + encodeURIComponent(token);

    return Promise.resolve()
      .then(function () { return fetchImpl(url); })
      .then(function (res) {
        if (!res || !res.ok) return { added: 0, offline: false, reason: 'http-' + (res && res.status) };
        return res.json().then(function (body) {
          var rows = (body && Array.isArray(body.rows)) ? body.rows : [];
          return all().then(function (before) {
            var beforeN = before.length;
            return putAll(rows).then(function () {
              return all().then(function (after) {
                return { added: after.length - beforeN, total: after.length, offline: false };
              });
            });
          });
        });
      })
      .catch(function () { return { added: 0, offline: true }; });
  }

  // Verify every stored row's signed receipt with receipt-verify.js (Ed25519).
  // Returns counts: verified (a known issuer signed it), unverified (no receipt to
  // check), tampered (a receipt present but NO known issuer signs those bytes).
  // Per-row results are attached on the returned `rows` (additive: row._verify).
  /**
   * @param {{receiptVerify?: {verifyReceipt: (compact: string, opts?: {includeTestKeys?: boolean}) => (VerifyReceiptResult | Promise<VerifyReceiptResult>)}, includeTestKeys?: boolean}} [opts]
   * @returns {Promise<{verified: number, unverified: number, tampered: number, total: number, rows: LedgerRow[], available: boolean}>}
   */
  function verifyAll(opts) {
    opts = opts || {};
    var RV = opts.receiptVerify || root.ReceiptVerify;
    if (!RV || typeof RV.verifyReceipt !== 'function') {
      return all().then(function (rows) {
        return { verified: 0, unverified: rows.length, tampered: 0, total: rows.length, rows: rows, available: false };
      });
    }
    var verifyOpts = { includeTestKeys: !!opts.includeTestKeys };
    return all().then(function (rows) {
      var verified = 0, unverified = 0, tampered = 0;
      var chain = Promise.resolve();
      rows.forEach(function (row) {
        chain = chain.then(function () {
          var compact = row && row.receipt_compact;
          if (!compact) { unverified += 1; row._verify = { state: 'unverified' }; return; }
          return Promise.resolve()
            .then(function () { return RV.verifyReceipt(compact, verifyOpts); })
            .then(function (r) {
              if (r && r.ok) { verified += 1; row._verify = { state: 'verified', issuer: r.issuer && r.issuer.name }; }
              else { tampered += 1; row._verify = { state: 'tampered' }; }
            })
            .catch(function () { tampered += 1; row._verify = { state: 'tampered' }; });
        });
      });
      return chain.then(function () {
        return { verified: verified, unverified: unverified, tampered: tampered, total: rows.length, rows: rows, available: true };
      });
    });
  }

  root.LedgerStore = {
    keyOf: keyOf,
    tsOf: tsOf,
    mergeRow: mergeRow,
    mergeAll: mergeAll,
    put: put,
    putAll: putAll,
    all: all,
    clear: clear,
    pull: pull,
    verifyAll: verifyAll,
    _DB_NAME: DB_NAME
  };

})();
