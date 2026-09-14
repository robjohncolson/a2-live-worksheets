// lib/flashcard-sync.js — cross-device sync of the flashcard PRACTICE log through
// roster-server's per-student /flashcards/state row (Supabase).
// UMD like lib/flashcard-flags.js: window.FlashcardSync.
//
// What syncs: the per-card SRS log (a2_srs_log_<email>) plus the store's
// tombstones. Nothing here is grade evidence — the Blooket grade row is written
// by the unchanged _blooketCommit / _fcCommit path and never touches this file.
//
// Merge model: the log is the source of truth (SM-2 state is re-derived from it
// by FlashcardSrs.foldLog), so a merge is a UNION of entries keyed by
// FlashcardSrs.entryKey (roundId#seq; legacy ts#csv#qnum). Union is idempotent
// and order-independent, so two devices can never clobber each other; the PUT
// route's optimistic concurrency (baseUpdatedAt / 409 stale) only guards the
// re-pull-merge-retry loop.
//
// Wire format (kept small — the row is capped at 256 KB server-side):
//   { v: 1, email, csvs: [csv...], e: [[tuple]...], tombstones: {...}, savedAt }
//   tuple = [roundId, seq, csvIdx, qnum, correct(0/1), ts, mode, missIndex,
//            wasTimeout(0/1), latencyMs, review|null, topic, surface, nChoices,
//            stemHash|null, chosenIdx]
//   displayedPerm is analysis-only and is NOT synced.
//
// Fail-closed: invalid-state responses, 401, 413,
// 503 or network error leaves local storage untouched and marks the client
// disabled for this session. Never throws to the caller.
(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FlashcardSync = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    var DECK_ID = 'ap-stats-flashcards';
    var WIRE_VERSION = 1;
    var LOG_CAP = 2000;               // mirrors _srsAppendLog / _fcSrsAppend
    var MAX_WIRE_CHARS = 240000;      // headroom under the server's 262144 cap
    var DEFAULT_PUSH_DEBOUNCE_MS = 3000;
    var DEFAULT_PULL_THROTTLE_MS = 60000;

    function isRecord(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function num(value, fallback) {
      var n = Number(value);
      return isFinite(n) ? n : fallback;
    }

    // Same identity FlashcardSrs.foldLog uses, duplicated here so the lib has
    // no hard dependency (foldLog dedupes by this key too).
    function entryKey(entry) {
      var value = entry || {};
      if (value.roundId != null) {
        return String(value.roundId) + '#' + String(value.seq);
      }
      return String(value.ts) + '#' + String(value.csv || value.topic) + '#' + String(value.qnum);
    }

    function compareByTs(left, right) {
      var l = num(left && left.ts, 0);
      var r = num(right && right.ts, 0);
      if (l !== r) return l - r;
      return num(left && left.seq, 0) - num(right && right.seq, 0);
    }

    // Union by entryKey. Local wins on a key collision (same key ⇒ same event,
    // and the local copy may carry analysis-only fields like displayedPerm).
    // Result is ts-ordered and capped to the newest LOG_CAP entries.
    function mergeLogs(localEntries, remoteEntries) {
      var byKey = {};
      var order = [];
      var lists = [remoteEntries, localEntries];
      var i;
      var j;

      for (i = 0; i < lists.length; i += 1) {
        var list = Array.isArray(lists[i]) ? lists[i] : [];
        for (j = 0; j < list.length; j += 1) {
          if (!isRecord(list[j])) continue;
          var key = entryKey(list[j]);
          if (!Object.prototype.hasOwnProperty.call(byKey, key)) order.push(key);
          byKey[key] = list[j];
        }
      }

      var merged = [];
      for (i = 0; i < order.length; i += 1) merged.push(byKey[order[i]]);
      merged.sort(compareByTs);
      if (merged.length > LOG_CAP) merged = merged.slice(merged.length - LOG_CAP);
      return merged;
    }

    function keySet(entries) {
      var set = {};
      var list = Array.isArray(entries) ? entries : [];
      for (var i = 0; i < list.length; i += 1) {
        if (isRecord(list[i])) set[entryKey(list[i])] = true;
      }
      return set;
    }

    // True when `entries` contains a key that `against` does not.
    function hasNewEntries(entries, against) {
      var have = keySet(against);
      var list = Array.isArray(entries) ? entries : [];
      for (var i = 0; i < list.length; i += 1) {
        if (isRecord(list[i]) && !have[entryKey(list[i])]) return true;
      }
      return false;
    }

    function mergeTombstones(localTombstones, remoteTombstones) {
      var out = {};
      var sources = [remoteTombstones, localTombstones];
      for (var i = 0; i < sources.length; i += 1) {
        if (!isRecord(sources[i])) continue;
        var ids = Object.keys(sources[i]);
        for (var j = 0; j < ids.length; j += 1) out[ids[j]] = sources[i][ids[j]];
      }
      return out;
    }

    function toTuple(entry, csvIndex) {
      var csv = entry.csv == null ? null : String(entry.csv);
      var idx = -1;
      if (csv !== null) {
        idx = csvIndex.list.indexOf(csv);
        if (idx < 0) { csvIndex.list.push(csv); idx = csvIndex.list.length - 1; }
      }
      return [
        entry.roundId == null ? null : String(entry.roundId),
        num(entry.seq, 0),
        idx,
        num(entry.qnum, 0),
        entry.correct ? 1 : 0,
        num(entry.ts, 0),
        entry.mode == null ? 'full' : String(entry.mode),
        num(entry.missIndex, 0),
        entry.wasTimeout ? 1 : 0,
        num(entry.latencyMs, 0),
        entry.review == null ? null : String(entry.review),
        entry.topic == null ? null : String(entry.topic),
        entry.surface == null ? 'desk' : String(entry.surface),
        num(entry.nChoices, 0),
        entry.stemHash == null ? null : String(entry.stemHash),
        typeof entry.chosenIdx === 'number' ? entry.chosenIdx : null
      ];
    }

    function fromTuple(t, csvs) {
      if (!Array.isArray(t) || t.length < 10) return null;
      var entry = {
        roundId: t[0] == null ? null : String(t[0]),
        seq: num(t[1], 0),
        csv: (typeof t[2] === 'number' && t[2] >= 0 && t[2] < csvs.length) ? csvs[t[2]] : null,
        qnum: num(t[3], 0),
        correct: !!t[4],
        ts: num(t[5], 0),
        mode: t[6] == null ? 'full' : String(t[6]),
        missIndex: num(t[7], 0),
        wasTimeout: !!t[8],
        latencyMs: num(t[9], 0),
        topic: t[11] == null ? null : String(t[11]),
        surface: t[12] == null ? 'desk' : String(t[12]),
        nChoices: num(t[13], 0)
      };
      if (t[10] != null) entry.review = String(t[10]);
      if (t[14] != null) entry.stemHash = String(t[14]);
      if (typeof t[15] === 'number') entry.chosenIdx = t[15];
      if (entry.roundId === null) delete entry.roundId;
      return entry;
    }

    function buildWire(list, options) {
      var csvIndex = { list: [] };
      var tuples = [];
      for (var i = 0; i < list.length; i += 1) {
        if (isRecord(list[i])) tuples.push(toTuple(list[i], csvIndex));
      }
      return {
        v: WIRE_VERSION,
        email: options.email == null ? null : String(options.email),
        csvs: csvIndex.list,
        e: tuples,
        tombstones: isRecord(options.tombstones) ? options.tombstones : {},
        savedAt: num(options.now, 0)
      };
    }

    // Build the wire payload. If the whole log does not fit the cap, keep the
    // LARGEST suffix of newest entries that does (binary search on the count —
    // deterministic, so two devices holding the same newest entries transmit
    // the same set).
    function toWire(entries, opts) {
      var options = opts || {};
      var list = (Array.isArray(entries) ? entries.slice() : []).sort(compareByTs);
      var full = buildWire(list, options);
      if (JSON.stringify(full).length <= MAX_WIRE_CHARS) return full;

      var lo = 0;                 // fits (empty always fits)
      var hi = list.length;       // does not fit
      while (hi - lo > 1) {
        var mid = Math.floor((lo + hi) / 2);
        var candidate = buildWire(list.slice(list.length - mid), options);
        if (JSON.stringify(candidate).length <= MAX_WIRE_CHARS) lo = mid; else hi = mid;
      }
      return buildWire(list.slice(list.length - lo), options);
    }

    function fromWire(payload) {
      if (!isRecord(payload) || payload.v !== WIRE_VERSION || !Array.isArray(payload.e)) {
        return null;
      }
      var csvs = Array.isArray(payload.csvs) ? payload.csvs.map(String) : [];
      var entries = [];
      for (var i = 0; i < payload.e.length; i += 1) {
        var entry = fromTuple(payload.e[i], csvs);
        if (entry) entries.push(entry);
      }
      return {
        email: payload.email == null ? null : String(payload.email),
        entries: entries,
        tombstones: isRecord(payload.tombstones) ? payload.tombstones : {},
        savedAt: num(payload.savedAt, 0)
      };
    }

    // ── Client ────────────────────────────────────────────────────────────────
    // createSyncClient({
    //   fetch, baseUrl, token(), email(), storage, now(), setTimeout, clearTimeout,
    //   onLocalChanged(mergedEntries)   // called after a pull wrote new entries locally
    // })
    // The client reads/writes a2_srs_log_<email> and the tombstones inside
    // a2_fc_state_v1_<email> directly (same keys as FlashcardStore).
    function createSyncClient(deps) {
      var d = deps || {};
      var fetchImpl = d.fetch;
      var storage = d.storage;
      var nowFn = typeof d.now === 'function' ? d.now : function () { return Date.now(); };
      var setTimer = typeof d.setTimeout === 'function' ? d.setTimeout : setTimeout;
      var clearTimer = typeof d.clearTimeout === 'function' ? d.clearTimeout : clearTimeout;
      var pushDebounceMs = num(d.pushDebounceMs, DEFAULT_PUSH_DEBOUNCE_MS);
      var pullThrottleMs = num(d.pullThrottleMs, DEFAULT_PULL_THROTTLE_MS);

      // ALL of this state is scoped to one student identity (email). A sign-in
      // switch on a shared device resets it — see ensureIdentity().
      var identity = null;
      var disabled = false;          // set on any hard failure this session
      var disabledReason = null;
      var disabledToken = null;      // the token a 401 rejected (re-auth re-enables)
      var baseUpdatedAt = null;      // echo from last GET/PUT
      var lastPullAt = 0;
      var pushTimer = null;
      var inflight = null;

      function baseUrl() {
        var u = typeof d.baseUrl === 'function' ? d.baseUrl() : d.baseUrl;
        return u ? String(u).replace(/\/$/, '') : null;
      }
      function token() {
        try { return typeof d.token === 'function' ? d.token() : d.token; } catch (_) { return null; }
      }
      function email() {
        try { return typeof d.email === 'function' ? d.email() : d.email; } catch (_) { return null; }
      }
      function resetState() {
        disabled = false;
        disabledReason = null;
        disabledToken = null;
        baseUpdatedAt = null;
        lastPullAt = 0;
        inflight = null;
        if (pushTimer) { clearTimer(pushTimer); pushTimer = null; }
      }
      // Bind the client to the CURRENT email; a change of student wipes every
      // per-student field so nothing (stamp, disabled flag, pending push) leaks
      // from student A to student B on a shared device.
      function ensureIdentity() {
        var current = email();
        if (current !== identity) {
          identity = current;
          resetState();
        }
        return current;
      }
      function ready() {
        ensureIdentity();
        if (disabled && disabledReason === 'auth' && token() && token() !== disabledToken) {
          // Re-authenticated with a different token: allow again.
          disabled = false; disabledReason = null; disabledToken = null;
        }
        return !disabled && !!fetchImpl && !!storage && !!baseUrl() && !!token() && !!email();
      }
      function disable(reason) {
        disabled = true;
        disabledReason = reason || 'disabled';
        if (reason === 'auth') disabledToken = token();
      }

      function logKey(em) { return 'a2_srs_log_' + em; }
      function stateKey(em) { return 'a2_fc_state_v1_' + em; }

      function readLocalLog(em) {
        try {
          var parsed = JSON.parse(storage.getItem(logKey(em)) || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
      }
      function writeLocalLog(em, entries) {
        try { storage.setItem(logKey(em), JSON.stringify(entries)); } catch (_) {}
      }
      function readLocalTombstones(em) {
        try {
          var parsed = JSON.parse(storage.getItem(stateKey(em)) || 'null');
          return isRecord(parsed) && isRecord(parsed.tombstones) ? parsed.tombstones : {};
        } catch (_) { return {}; }
      }
      function writeLocalTombstones(em, tombstones) {
        // Only touch the tombstones field; never overwrite a corrupt/absent state
        // (FlashcardStore owns migration). Absent state → nothing to write.
        try {
          var raw = storage.getItem(stateKey(em));
          if (raw == null) return;
          var parsed = JSON.parse(raw);
          if (!isRecord(parsed)) return;
          parsed.tombstones = tombstones;
          storage.setItem(stateKey(em), JSON.stringify(parsed));
        } catch (_) {}
      }

      // Response arrived for a student who is no longer signed in → discard.
      function identityChanged(em) {
        return email() !== em;
      }

      var KEEPALIVE_MAX_CHARS = 60000;   // browsers cap keepalive bodies at ~64 KiB
      function request(method, body, tok, keepalive) {
        var url = baseUrl() + '/flashcards/state';
        var init = { method: method, headers: {} };
        if (method === 'GET') {
          init.headers.Authorization = 'Bearer ' + tok;
        } else {
          init.headers['Content-Type'] = 'application/json';
          init.body = JSON.stringify(body);
          if (keepalive && init.body.length <= KEEPALIVE_MAX_CHARS) init.keepalive = true;
        }
        return fetchImpl(url, init).then(function (res) {
          return res.json().then(function (json) {
            return { status: res.status, json: json || {} };
          }, function () {
            return { status: res.status, json: {} };
          });
        });
      }

      // Classify a non-2xx: hard failures disable the client for the session.
      function handleFailure(result) {
        var status = result && result.status;
        if (status === 400) { disable('invalid-state'); return; }
        if (status === 401) { disable('auth'); return; }
        if (status === 413) { disable('too-large'); return; }
        if (status === 503) { disable('not-provisioned'); return; }
      }

      // Pull: GET → merge remote INTO local → write local if it gained entries →
      // push if local had entries the server lacked. Resolves
      // { ok, changed, pushed } — never rejects. Every storage access uses the
      // email/token snapshotted at the start; a response that lands after a
      // sign-in switch is discarded.
      function pull(opts) {
        var options = opts || {};
        if (!ready()) return Promise.resolve({ ok: false, changed: false, reason: disabledReason || 'not-ready' });
        var t = nowFn();
        if (!options.force && lastPullAt && (t - lastPullAt) < pullThrottleMs) {
          return Promise.resolve({ ok: true, changed: false, throttled: true });
        }
        if (inflight) return inflight;
        lastPullAt = t;
        var em = email();
        var tok = token();
        // One bounded reconciliation retry: if another device writes between our
        // GET and our reconciliation PUT (409), re-GET/merge/PUT once more —
        // directly, never through pull() (which would return this same inflight
        // promise and deadlock).
        inflight = reconcile(em, tok, 1)
          .then(function (r) { inflight = null; return r; }, function () { inflight = null; return { ok: false, changed: false }; });
        return inflight;
      }

      // GET → merge remote INTO local → write local if it gained entries → push if
      // the transmissible set has entries the server lacks. Every storage access
      // uses the email/token snapshotted by the caller; a response that lands
      // after a sign-in switch is discarded. `budget` = remaining 409 retries.
      // A push result's "did the final PUT land": a retried push reports `pushed`.
      function pushedOf(pushResult) {
        if (!pushResult) return false;
        if (typeof pushResult.pushed === 'boolean') return pushResult.pushed;
        return !!pushResult.ok;
      }

      function reconcile(em, tok, budget) {
        return request('GET', null, tok).then(function (result) {
          if (identityChanged(em)) return { ok: false, changed: false, reason: 'identity-changed' };
          if (result.status !== 200 || !result.json || result.json.ok !== true) {
            handleFailure(result);
            return { ok: false, changed: false, status: result.status };
          }
          var local = readLocalLog(em);
          var localTomb = readLocalTombstones(em);
          if (!result.json.found) {
            baseUpdatedAt = null;
            if (local.length || Object.keys(localTomb).length) {
              return pushNow({ entries: local, tombstones: localTomb, email: em, token: tok, reconcileBudget: budget }, true).then(function (pushResult) {
                return { ok: true, changed: false, pushed: pushedOf(pushResult) };
              });
            }
            return { ok: true, changed: false, pushed: false };
          }
          var remote = fromWire(result.json.state);
          if (!remote) {
            // Never overwrite a row we cannot read (foreign/legacy shape).
            disable('unreadable-remote');
            return { ok: false, changed: false, reason: 'unreadable-remote' };
          }
          if (remote.email && em && remote.email !== em) {
            // Row belongs to this token's student but was written under another
            // legacy email key — do not merge across identities, and never write.
            disable('email-mismatch');
            return { ok: false, changed: false, reason: 'email-mismatch' };
          }
          baseUpdatedAt = result.json.updatedAt || null;
          var merged = mergeLogs(local, remote.entries);
          var mergedTomb = mergeTombstones(localTomb, remote.tombstones);
          var changed = hasNewEntries(remote.entries, local)
            || Object.keys(mergedTomb).length !== Object.keys(localTomb).length;
          if (changed) {
            writeLocalLog(em, merged);
            writeLocalTombstones(em, mergedTomb);
            try { if (typeof d.onLocalChanged === 'function') d.onLocalChanged(merged); } catch (_) {}
          }
          // Push only if the TRANSMISSIBLE set (after the wire cap) has keys the
          // server lacks — otherwise cap-trimmed entries would re-trigger a PUT
          // after every pull.
          var wire = toWire(merged, { email: em, tombstones: mergedTomb, now: nowFn() });
          var transmissible = fromWire(wire);
          var candidates = transmissible ? transmissible.entries : [];
          if (candidates.length < merged.length && remote.entries.length) {
            // The wire had to trim: entries older than the server's oldest were
            // trimmed on the server side too, so they are not "new" — only
            // newer-or-equal entries can justify a PUT (no cap ping-pong).
            var minRemoteTs = Infinity;
            for (var ri = 0; ri < remote.entries.length; ri += 1) {
              minRemoteTs = Math.min(minRemoteTs, num(remote.entries[ri].ts, 0));
            }
            candidates = candidates.filter(function (candidate) { return num(candidate.ts, 0) >= minRemoteTs; });
          }
          var needPush = hasNewEntries(candidates, remote.entries)
            || Object.keys(mergedTomb).length !== Object.keys(remote.tombstones).length;
          if (needPush) {
            return pushNow({ wire: wire, email: em, token: tok, reconcileBudget: budget }, true).then(function (pushResult) {
              return { ok: true, changed: changed, pushed: pushedOf(pushResult) };
            });
          }
          return { ok: true, changed: changed, pushed: false };
        }, function () {
          return { ok: false, changed: false, reason: 'network' };
        });
      }

      // Push the given (or current local) log with optimistic concurrency.
      // On 409 stale: re-pull (which merges + pushes) once. Never rejects.
      // opts: { entries?, tombstones?, wire?, email?, token?, keepalive? }
      function pushNow(payloadOpts, isRetry) {
        if (!ready()) return Promise.resolve({ ok: false, reason: disabledReason || 'not-ready' });
        var options = payloadOpts || {};
        var em = options.email || email();
        var tok = options.token || token();
        var wire = options.wire;
        if (!wire) {
          var entries = Array.isArray(options.entries) ? options.entries : readLocalLog(em);
          var tombstones = isRecord(options.tombstones) ? options.tombstones : readLocalTombstones(em);
          wire = toWire(entries, { email: em, tombstones: tombstones, now: nowFn() });
        }
        var stamp = baseUpdatedAt;
        return request('PUT', { token: tok, state: wire, baseUpdatedAt: stamp }, tok, !!options.keepalive).then(function (result) {
          if (identityChanged(em)) return { ok: false, reason: 'identity-changed' };
          if (result.status === 200 && result.json && result.json.ok === true) {
            baseUpdatedAt = result.json.updatedAt || baseUpdatedAt;
            return { ok: true };
          }
          if (result.status === 409) {
            baseUpdatedAt = (result.json && result.json.updatedAt) || baseUpdatedAt;
            if (!isRetry) {
              lastPullAt = 0;
              return pull({ force: true }).then(function (r) {
                return { ok: !!(r && r.ok), pushed: !!(r && r.pushed), retried: true };
              });
            }
            // 409 during a pull-time reconciliation PUT (another device wrote
            // between our GET and PUT): one more GET/merge/PUT, bounded by budget.
            var budget = num(options.reconcileBudget, 0);
            if (budget > 0) {
              return reconcile(em, tok, budget - 1).then(function (r) {
                return { ok: !!(r && r.ok), pushed: !!(r && r.pushed), retried: true };
              });
            }
            return { ok: false, status: 409, reason: 'stale-after-retry' };
          }
          handleFailure(result);
          return { ok: false, status: result.status };
        }, function () {
          return { ok: false, reason: 'network' };
        });
      }

      function schedulePush() {
        if (!ready()) return;
        if (pushTimer) clearTimer(pushTimer);
        pushTimer = setTimer(function () {
          pushTimer = null;
          pushNow();
        }, pushDebounceMs);
      }

      // Page-hide flush: fire the pending push immediately. keepalive is used
      // ONLY here (and only when the body is under the browser's ~64 KiB quota).
      function flush() {
        if (pushTimer) { clearTimer(pushTimer); pushTimer = null; return pushNow({ keepalive: true }); }
        return Promise.resolve({ ok: true, skipped: true });
      }

      return {
        deckId: DECK_ID,
        ready: ready,
        pull: pull,
        push: pushNow,
        schedulePush: schedulePush,
        flush: flush,
        isDisabled: function () { return disabled; },
        disabledReason: function () { return disabledReason; },
        baseUpdatedAt: function () { return baseUpdatedAt; }
      };
    }

    return {
      DECK_ID: DECK_ID,
      WIRE_VERSION: WIRE_VERSION,
      LOG_CAP: LOG_CAP,
      MAX_WIRE_CHARS: MAX_WIRE_CHARS,
      entryKey: entryKey,
      mergeLogs: mergeLogs,
      mergeTombstones: mergeTombstones,
      hasNewEntries: hasNewEntries,
      toWire: toWire,
      fromWire: fromWire,
      createSyncClient: createSyncClient
    };
  }
);
