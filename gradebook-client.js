// @ts-check
// gradebook-client.js — Algebra 2 gradebook ledger feeder client
// Repo root sibling of roster-client.js and roster_config.js.
// Loaded AFTER roster_config.js + roster-client.js.
// Pure browser JS: no build, no imports, no Supabase, no secrets.
// Reads window.ROSTER_SERVICE_URL and window.rosterClient.token() at call time.
//
// Implements FROZEN CONTRACT 3 (GRADEBOOK_PHASE1_BUILD.md):
//   window.gradebookClient.record({ source, itemId, unit, topic, skill, response, score, attempt })
//   → { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'server'|'auth'|'bad-args'|'read-only' }
//
// OFFLINE_MODE_SPEC §4.A (additive): when a write is captured into
// window.OfflineQueue, the result carries `queued:true` — offline pack →
// { ok:true, queued:true }; an intermittent network failure → { ok:false,
// reason:'network', queued:true }. The `reason` whitelist is unchanged, so
// callers that switch on `reason` keep working.
//
// Decision L-D: fire-and-forget, no-ops without identity, NEVER throws/blocks the caller.
// Decision L-C: No proctor header is ever sent — proctored evidence tier is server-gated only.

(function () {
  'use strict';

  // A failed read is not an empty worksheet. Keep recovery visible and bounded.
  var _priorFailed = false;
  var _priorRetryTimer = null;
  var _priorRetries = 0;
  var _priorRecovering = false;

  function _priorNotice(message) {
    if (typeof window.hydratePriorAnswers !== 'function' || !document.body) return;
    var box = document.getElementById('gb-answer-recovery');
    if (!message) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'gb-answer-recovery';
      box.setAttribute('role', 'status');
      box.style.cssText = 'padding:12px;margin:12px;border:1px solid #a66b00;background:#fff4d6;color:#322500;';
      var label = document.createElement('span');
      box.appendChild(label);
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry loading saved answers';
      retry.style.marginLeft = '12px';
      retry.addEventListener('click', function () { _priorRetries = 0; _recoverPrior(); });
      box.appendChild(retry);
      document.body.insertBefore(box, document.body.firstChild);
    }
    box.firstChild.textContent = message;
  }

  function _unavailablePrior(outcome, status) {
    var result = new Map();
    result.loadFailed = true;
    result.loadOutcome = outcome || 'network';
    result.httpStatus = status || null;
    return result;
  }

  function _priorReadFailed(auth) {
    _priorFailed = true;
    _priorNotice(auth
      ? 'Sign in again from the Desk, then retry loading your saved answers. Your saved work has not been cleared.'
      : 'Saved answers could not be loaded. Blank boxes do not mean your work is missing. You can keep working or retry.');
    if (!auth && !_priorRetryTimer && _priorRetries < 3 && typeof window.hydratePriorAnswers === 'function') {
      var delay = [2000, 5000, 15000][_priorRetries++];
      _priorRetryTimer = setTimeout(function () { _priorRetryTimer = null; _recoverPrior(); }, delay);
    }
    if (auth && _priorRetryTimer) { clearTimeout(_priorRetryTimer); _priorRetryTimer = null; }
  }

  async function _recoverPrior() {
    if (!_priorFailed || _priorRecovering || typeof window.hydratePriorAnswers !== 'function') return;
    _priorRecovering = true;
    if (_priorRetryTimer) { clearTimeout(_priorRetryTimer); _priorRetryTimer = null; }
    try { await window.hydratePriorAnswers(); } finally { _priorRecovering = false; }
  }

  // A deliberately cleared answer is an edit too, not a target for restoration.
  if (typeof document !== 'undefined') document.addEventListener('input', function (event) {
    var target = event.target;
    if (target && target.matches && target.matches('.blank, textarea')) target.dataset.gbEdited = '1';
  }, true);
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', _recoverPrior);
    window.addEventListener('focus', _recoverPrior);
    window.addEventListener('roster-session-changed', function () {
      _priorRetries = 0;
      _recoverPrior();
    });
  }

  // ── No-identity nudge (defense-in-depth backstop) ───────────────────────────
  // Worksheets normally gate behind the sign-in wall, but that wall FAILS OPEN
  // (roster-client unavailable, teacher-role bypass, or sign-out mid-session).
  // If a real recording attempt is ever dropped for no-identity, the student
  // MUST see it — a silently dropped write is lost work with no warning (this is
  // what made a worksheet's score "disappear"). Fires at most ONCE per page;
  // never throws, never blocks — record()'s return contract is unchanged.
  var _parkedNudgeShown = false;
  function _showParkedNudge(rows) {
    try {
      if (!rows.length || _parkedNudgeShown) return;
      console.warn('gradebook-client: parked answers', rows.map(function (row) { return window.OfflineQueue.keyOf(row); }));
      if (typeof document === 'undefined' || !document.body) return;
      _parkedNudgeShown = true;
      if (document.getElementById('gb-parked-nudge')) return;
      var bar = document.createElement('div');
      bar.id = 'gb-parked-nudge';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#b00020;color:#fff;'
        + 'font-family:Geneva,Verdana,sans-serif;font-size:13px;padding:10px 14px;display:flex;'
        + 'align-items:center;gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      bar.textContent = rows.length + ' answer(s) could not be saved to your grade after repeated server errors \u2014 tell your teacher.';
      document.body.appendChild(bar);
    } catch (_) { /* Reporting must never interrupt replay or destroy the saved work. */ }
  }
  var _noIdentityNudgeShown = false;
  // kind 'expired' (2026-09-09): the session token was rejected (401/403) and the answer
  // was CAPTURED on this device — it saves after the next sign-in. 'expired-lost': token
  // rejected and NOTHING was captured (no offline queue on this page). Default: not signed in.
  function _showNoIdentityNudge(kind) {
    try {
      if (_noIdentityNudgeShown) return;
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('gb-no-identity-nudge')) return;
      _noIdentityNudgeShown = true;

      var bar = document.createElement('div');
      bar.id = 'gb-no-identity-nudge';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;'
        + 'background:#b00020;color:#fff;font-family:Geneva,Verdana,sans-serif;'
        + 'font-size:13px;padding:10px 14px;display:flex;align-items:center;'
        + 'gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';

      var msg = document.createElement('span');
      msg.textContent = kind === 'expired'
        ? '⚠️ Your sign-in session expired — your answers are being kept on this device and will be saved to your grade when you sign in again.'
        : kind === 'expired-lost'
          ? '⚠️ Your sign-in session expired — your answers are NOT being saved to your grade. Sign in again, then redo this work.'
          : '⚠️ You are not signed in — your answers are NOT being saved to your grade.';
      bar.appendChild(msg);

      var link = document.createElement('a');
      link.href = 'desk.html';
      link.textContent = (kind === 'expired' || kind === 'expired-lost') ? 'Open the Desk and sign in again' : 'Open the Desk to sign in';
      link.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;white-space:nowrap;';
      bar.appendChild(link);

      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'background:transparent;border:0;color:#fff;font-size:18px;'
        + 'line-height:1;cursor:pointer;padding:0 4px;';
      x.onclick = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
      bar.appendChild(x);

      document.body.appendChild(bar);
    } catch (_) { /* nudge is best-effort; never block or throw from record() */ }
  }

  // ── Receipt capture (RECEIPTS_BUILD.md / receipt-system-spec v1.1) ──────────
  // Stores signed receipts from /ledger/record responses in localStorage
  // 'desk_receipts_v1': newest-first array of {id, compact, src, i, sc, ts},
  // capped at 500. Shared-origin: the Desk's "My Receipts" view reads this key.
  // Best-effort — must never break record()'s fire-and-forget contract.
  var RECEIPTS_KEY = 'desk_receipts_v1';
  var RECEIPTS_CAP = 500;
  function _captureReceipt(receipt, source, itemId, score) {
    try {
      if (!receipt || !receipt.receiptId || !receipt.compact) return;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]'); } catch (_) { list = []; }
      if (!Array.isArray(list)) list = [];
      var id = receipt.receiptId;
      list = list.filter(function (row) { return !row || row.id !== id; });
      list.unshift({
        id: id,
        compact: receipt.compact,
        src: source,
        i: itemId,
        sc: (typeof score === 'number') ? score : undefined,
        ts: Date.now()
      });
      if (list.length > RECEIPTS_CAP) list.length = RECEIPTS_CAP;
      localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list));
    } catch (_) { /* receipts are best-effort; never block or throw from record() */ }
  }

  // ── Offline capture (OFFLINE_MODE_SPEC §4.A) ────────────────────────────────
  // gradebook-client is the GRADE-bearing write path. When there is no server
  // (a baked OFFLINE_MODE pack, or an intermittent fetch failure) the record is
  // captured into window.OfflineQueue instead of dropped, then flushed later by
  // syncOfflineQueue() (auto on 'online', or by the teacher importing the export).
  // Everything degrades gracefully if offline-queue.js isn't loaded on the page.
  function _token() {
    try {
      if (window.rosterClient && typeof window.rosterClient.token === 'function') {
        return window.rosterClient.token();
      }
    } catch (_) { /* treat as no identity */ }
    return null;
  }

  function _studentId() {
    try {
      if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
        return window.rosterClient.studentId();
      }
    } catch (_) { /* treat as no identity */ }
    return null;
  }

  function _hasQueue() {
    return !!(window.OfflineQueue && typeof window.OfflineQueue.enqueue === 'function');
  }

  function _isOfflineMode() {
    try {
      return !!(window.OfflineQueue && typeof window.OfflineQueue.isOffline === 'function' && window.OfflineQueue.isOffline());
    } catch (_) { return false; }
  }

  var _transportSequence = 0;
  var _latestStartedSequence = {};
  var _successfulSequence = {};
  var _sendChains = {};
  function _recordKey(opts) {
    var attempt = opts && opts.attempt != null ? opts.attempt : 1;
    return String(opts && opts.source) + '|' + String(opts && opts.itemId) + '|' + String(attempt);
  }
  function _stampRecord(opts) {
    var stamped = {};
    for (var key in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, key)) stamped[key] = opts[key];
    }
    var now = Date.now();
    _transportSequence = Math.max(_transportSequence + 1, now);
    stamped.transportSequence = _transportSequence;
    _latestStartedSequence[_recordKey(stamped)] = stamped.transportSequence;
    return stamped;
  }
  function _isSuperseded(opts) {
    var sequence = opts && opts.transportSequence;
    if (typeof sequence !== 'number') return false;
    var key = _recordKey(opts);
    return (_latestStartedSequence[key] || 0) > sequence
      || (_successfulSequence[key] || 0) > sequence;
  }

  function _enqueueOffline(opts) {
    if (!_hasQueue()) return Promise.resolve(false);
    if (_isSuperseded(opts)) return Promise.resolve(false);
    var sid = _studentId();
    try {
      // Cast: _hasQueue() above guarantees enqueue exists; tsc can't see across the call.
      return Promise.resolve(/** @type {any} */ (window.OfflineQueue).enqueue({
        source: opts.source, itemId: opts.itemId, response: opts.response,
        score: opts.score, attempt: opts.attempt,
        unit: opts.unit, topic: opts.topic, skill: opts.skill,
        requestGrade: opts.requestGrade,
        transportSequence: opts.transportSequence,
        studentId: sid || undefined, kind: opts.kind || 'record'
      })).then(function (stored) {
        return !!stored && !_isSuperseded(opts)
          && (!stored.transportSequence || stored.transportSequence >= opts.transportSequence);
      }, function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }

  function _supersedeOffline(opts) {
    var queue = window.OfflineQueue;
    if (!queue || typeof queue.supersede !== 'function') return Promise.resolve(false);
    try { return Promise.resolve(queue.supersede(opts)).catch(function () { return false; }); }
    catch (_) { return Promise.resolve(false); }
  }

  // Raw POST to /ledger/record. NEVER throws; NEVER enqueues (so it is safe to
  // call from a drain without re-queuing). Returns { ok, reason?, ledgerId? }.
  /** @param {RecordOpts} opts @returns {Promise<RecordResult>} */
  async function _postRecord(opts) {
    try {
      var token = _token();
      if (!token) return { ok: false, reason: 'no-identity' };
      var baseUrl = window.ROSTER_SERVICE_URL || null;
      if (!baseUrl) {
        console.warn('gradebook-client: ROSTER_SERVICE_URL is not configured');
        return { ok: false, reason: 'network' };
      }

      var body = {
        token:    token,
        source:   opts.source,
        itemId:   opts.itemId,
        unit:     opts.unit,
        topic:    opts.topic,
        skill:    opts.skill,
        response: opts.response,
        score:    opts.score,
        attempt:  opts.attempt,
        requestGrade: opts.requestGrade
      };

      var bodyJson = JSON.stringify(body);
      var fetchOpts = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    bodyJson
      };
      // Unload keepalive has a small browser quota. Fifteen thousand UTF-16
      // code units is at most 60 KB of UTF-8, so only bounded best-effort flushes
      // opt in; larger answers use the durable outbox/reconnect path.
      if (opts.keepalive === true && bodyJson.length <= 15000) fetchOpts.keepalive = true;
      var res = await fetch(baseUrl + '/ledger/record', fetchOpts);

      var data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (data && data.ok) {
        _captureReceipt(data.receipt, opts.source, opts.itemId, opts.score);
        var out = { ok: true, ledgerId: data.ledgerId, receipt: data.receipt || null };
        if (Object.prototype.hasOwnProperty.call(data, 'clientScoreIgnored')) out.clientScoreIgnored = data.clientScoreIgnored;
        if (Object.prototype.hasOwnProperty.call(data, 'status')) out.status = data.status;
        if (Object.prototype.hasOwnProperty.call(data, 'responseVersion')) out.responseVersion = data.responseVersion;
        return out;
      }
      if (res && (res.status === 401 || res.status === 403)) { console.warn('gradebook-client: auth failed', data); return { ok: false, reason: 'auth', status: res.status }; }
      // Queue on the authenticated FRQ body contract, not a hard-coded status.
      // This covers today's 429/503 responses and future retryable statuses.
      if (opts.source === 'frq' && opts.requestGrade === true && data && data.retryable === true) {
        return { ok: false, reason: 'network', retryable: true, status: res.status };
      }
      if (res && !res.ok) { console.warn('gradebook-client: server error', data); return { ok: false, reason: 'server', status: res.status }; }
      console.warn('gradebook-client: server returned ok:false', data);
      return { ok: false, reason: 'server' };
    } catch (err) {
      // fetch rejection / JSON error → treat as offline-ish (queueable)
      return { ok: false, reason: 'network' };
    }
  }

  // Serialize network sends per source/item/attempt. Sequences are still
  // stamped when record() starts, so newer intent wins in the outbox while the
  // wire order guarantees an older POST cannot finish after a newer POST.
  function _sendRecord(opts) {
    var key = _recordKey(opts);
    var previous = _sendChains[key] || Promise.resolve();
    var run = previous.catch(function () {}).then(function () { return _postRecord(opts); });
    _sendChains[key] = run.then(function () {}, function () {});
    return run.then(function (value) {
      if (_sendChains[key]) delete _sendChains[key];
      return value;
    }, function (err) {
      if (_sendChains[key]) delete _sendChains[key];
      throw err;
    });
  }

  var _offlineDrainTimer = null;
  var _offlineDrainInFlight = false;
  var _offlineDrainRerun = false;
  var _offlineDrainBackoffMs = 30000;
  function _canDrainOnline() {
    try { return !_isOfflineMode() && (!window.navigator || window.navigator.onLine !== false); }
    catch (_) { return false; }
  }
  // 2026-09-09: a token the server already rejected (401/403) will reject every replay —
  // don't spend N POSTs per keystroke re-learning that. Cleared by a successful send or a
  // sign-in (storage event); a genuinely new token always differs from the failed one.
  var _lastAuthFailToken = null;
  function _scheduleOfflineDrain(delayMs) {
    // Coalesce reconnect/sign-in events while a batch is awaiting the network.
    if (_offlineDrainInFlight) { _offlineDrainRerun = true; return; }
    if (_offlineDrainTimer || !_canDrainOnline() || !_hasQueue()) return;
    if (_lastAuthFailToken && _token() === _lastAuthFailToken) return;
    _offlineDrainTimer = window.setTimeout(async function () {
      _offlineDrainTimer = null;
      if (!_canDrainOnline()) return;
      _offlineDrainInFlight = true;
      var retryDelay = null;
      try {
        // Release-gate fix (2026-09-10): a parked answer must be announced on EVERY page load,
        // not only on the page where the 12th failure landed — these early returns skip
        // syncOfflineQueue (where the banner normally fires), so raise it here too.
        var isParked = function (row) { return row.serverFailures >= 12; };
        var rows = await window.OfflineQueue.all();
        if (!rows || !rows.some(function (row) { return !isParked(row); })) { _showParkedNudge((rows || []).filter(isParked)); _offlineDrainBackoffMs = 30000; return; }
        await window.gradebookClient.syncOfflineQueue();
        rows = await window.OfflineQueue.all();
        if (!rows || !rows.some(function (row) { return !isParked(row); })) { _showParkedNudge((rows || []).filter(isParked)); _offlineDrainBackoffMs = 30000; return; }
        _offlineDrainBackoffMs = Math.min(3600000, Math.max(30000, _offlineDrainBackoffMs * 2));
        retryDelay = _offlineDrainBackoffMs;
      } catch (_) {
        _offlineDrainBackoffMs = Math.min(3600000, Math.max(30000, _offlineDrainBackoffMs * 2));
        retryDelay = _offlineDrainBackoffMs;
      } finally {
        _offlineDrainInFlight = false;
        if (_offlineDrainRerun) {
          _offlineDrainRerun = false;
          _scheduleOfflineDrain(0);
        } else if (retryDelay !== null) {
          _scheduleOfflineDrain(retryDelay);
        }
      }
    }, Math.max(0, delayMs || 0));
  }

  window.gradebookClient = {

    // Fire-and-forget ledger write.
    // NEVER throws. NEVER rejects. NEVER blocks the caller.
    // Returns a Promise that always resolves to { ok, ... }.
    /** @param {RecordOpts} opts @returns {Promise<RecordResult>} */
    record: async function (opts) {
      try {
        // --- Validate required args BEFORE touching anything ---
        var source   = opts && opts.source;
        var itemId   = opts && opts.itemId;
        var response = opts && opts.response;

        if (!source || !itemId || response === undefined) {
          return { ok: false, reason: 'bad-args' };
        }

        // Stamp before any storage or network I/O. The key-local sequence is the
        // durable ordering boundary for overlapping saves.
        opts = _stampRecord(opts);

        // --- View-as / read-only: never capture or send (defense-in-depth) ---
        // The worksheet view-as module also neuters record(), but the Desk path
        // and any future caller rely on this guard so an impersonating teacher's
        // actions are never queued/attributed to the student. (OFFLINE_MODE_SPEC §4.A)
        if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) {
          return { ok: false, reason: 'read-only' };
        }

        // Future writes also nudge an ownership-gated drain. A queued older row
        // for this key is skipped because _latestStartedSequence already moved.
        _scheduleOfflineDrain(0);

        // --- Offline pack: capture locally, skip the network entirely ---
        if (_isOfflineMode()) {
          // Identity FIRST (Codex P4 blocker): an unattributed capture would sit
          // in the queue and later be POSTed by syncOfflineQueue() under whatever
          // token is current at drain time — cross-student attribution on a
          // shared device. No token or no studentId → no-op, like the online path.
          if (!_token() || !_studentId()) {
            _showNoIdentityNudge();
            return { ok: false, reason: 'no-identity' };
          }
          // queued:true must be HONEST: if the capture itself fails (quota, a
          // broken queue), saying "queued" would hide a LOST grade behind a
          // "Saved offline" toast. Report the failure so the caller surfaces it.
          if (await _enqueueOffline(opts)) {
            _scheduleOfflineDrain(30000);
            return { ok: true, queued: true, ledgerId: null };
          }
          return { ok: false, reason: 'network' };
        }

        // --- Online path: must have identity to attribute the write ---
        if (!_token()) {
          _showNoIdentityNudge(); // surface the dropped write (never silent)
          return { ok: false, reason: 'no-identity' };
        }

        var r = await _sendRecord(opts);
        if (r.ok) {
          var key = _recordKey(opts);
          _successfulSequence[key] = Math.max(_successfulSequence[key] || 0, opts.transportSequence);
          await _supersedeOffline(opts);
          _scheduleOfflineDrain(0);
          return r;
        }

        // HTTP status is internal drain metadata; preserve the public record result shape.
        delete r.status;

        // Reachability failure → capture for later instead of dropping the grade.
        // reason stays 'network' (the frozen whitelist); the additive `queued`
        // flag signals the write was captured locally — only when it actually was.
        // Attribution gate here too: a queued record must carry its owner's
        // studentId (the token alone is drain-time state, not ownership).
        // 2026-09-09: an expired session (401 → 'auth') is captured too — the row carries the
        // owner's studentId and the ownership-gated drain replays it once they sign in again.
        if ((r.reason === 'network' || r.reason === 'auth') && _hasQueue() && _studentId()) {
          if (await _enqueueOffline(opts)) {
            if (r.reason === 'auth') { _lastAuthFailToken = _token(); _showNoIdentityNudge('expired'); }
            _scheduleOfflineDrain(30000);
            return { ok: false, reason: r.reason, queued: true };
          }
          return r;
        }
        if (r.reason === 'no-identity') _showNoIdentityNudge();
        if (r.reason === 'auth') _showNoIdentityNudge('expired-lost');   // nothing was captured on this page
        return r;

      } catch (err) {
        console.warn('gradebook-client: record failed —', err && err.message);
        return { ok: false, reason: 'network' };
      }
    },

    // Authoritative FRQ ticket ingress. This deliberately delegates to record()
    // so identity checks, OfflineQueue capture/replay, and latest-wins dedup all
    // remain on the single established transport path.
    requestFrqGrade: async function (opts) {
      return window.gradebookClient.record({
        source: 'frq',
        itemId: opts && opts.itemId,
        response: opts && opts.response,
        requestGrade: true,
        keepalive: !!(opts && opts.keepalive)
      });
    },

    // ── OFFLINE_MODE_SPEC §4.A — flush queued work to the server ────────────────
    // Replays each queued record via the raw POST; the queue deletes only the
    // ones that land. Auto-runs on 'online'; also callable from the export page.
    // NEVER throws; resolves to { sent, failed }.
    syncOfflineQueue: async function () {
      try {
        if (!window.OfflineQueue || typeof window.OfflineQueue.drain !== 'function') return { sent: 0, failed: 0 };
        var result = await window.OfflineQueue.drain(function (rec) {
          // Drain-time OWNERSHIP gate (P4): _postRecord attributes by the CURRENT
          // session token, so draining a record the signed-in student does not
          // OWN — another student's capture, or a legacy record with no owner —
          // would attribute their work to whoever is signed in now on a shared
          // device (and the queue would then delete it as sent). Refusing with
          // ok:false leaves it queued for the owner's next session, or the
          // teacher export/import path which attributes explicitly.
          var r = /** @type {RecordOpts & {studentId?: string}} */ (rec);
          var sid = _studentId();
          if (!r || !r.studentId || !sid || String(r.studentId) !== String(sid)) {
            return { ok: false, reason: 'no-identity' };
          }
          if (_isSuperseded(r)) return { ok: true, superseded: true };
          return _sendRecord(r).then(function (result) {
            if (result && result.reason === 'auth') _lastAuthFailToken = _token();
            if (result && result.ok) _lastAuthFailToken = null;
            if (result && result.ok && typeof r.transportSequence === 'number') {
              var key = _recordKey(r);
              _successfulSequence[key] = Math.max(_successfulSequence[key] || 0, r.transportSequence);
            }
            return result;
          });
        });
        if (typeof window.OfflineQueue.parked === 'function') _showParkedNudge(await window.OfflineQueue.parked());
        return result;
      } catch (_) {
        return { sent: 0, failed: 0 };
      }
    },

    // ── PERSISTENT_ANSWERS_BUILD.md §4 — fetchPrior(prefix) ─────────────────
    // Read-only self-fetch of this student's prior ledger rows for the given
    // itemId prefix (e.g. 'WS-U4L1-2'). Returns a Map<itemId, {response,score,source}>.
    //
    // NEVER throws. NEVER rejects. Always resolves to a Map (possibly empty).
    // loadFailed:true distinguishes unavailable history from a confirmed empty ledger;
    // repair callers must not re-upload local work based on an unavailable history.
    // No-ops without identity or without a sane prefix. The server enforces
    // self-only access — the client adds a token+sid so the server can verify.
    fetchPrior: async function (prefix, options) {
      try {
        if (!prefix || typeof prefix !== 'string') return _unavailablePrior();
        // Mirror the server's strict-prefix charset: no underscore (it is a
        // SQL LIKE wildcard server-side). Real item_ids use [A-Za-z0-9-] only.
        if (!/^[A-Za-z0-9\-]+$/.test(prefix)) return _unavailablePrior();

        var token = null;
        var sid = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            token = window.rosterClient.token();
          }
          // Teacher "view as student": a worksheet opened from the Desk under
          // view-as sets window.__VIEW_AS_STUDENT_ID__ so EVERY prior-answer read
          // targets THAT student instead of the signed-in teacher. The teacher's
          // own token rides along in the Authorization header — the server allows
          // a verified teacher to read any student's ledger (read-only). Falls
          // back to the signed-in student's own id for the normal student flow.
          if (typeof window !== 'undefined' && window.__VIEW_AS_STUDENT_ID__) {
            sid = window.__VIEW_AS_STUDENT_ID__;
          } else if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
            sid = window.rosterClient.studentId();
          }
        } catch (_) {
          return _unavailablePrior();
        }
        if (!token || !sid) { _priorReadFailed(true); return _unavailablePrior('no-identity'); }

        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) { _priorReadFailed(false); return _unavailablePrior('config'); }

        // Token goes in the Authorization header, NOT the query string —
        // query strings leak into access logs / Referer / browser history.
        var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid)
                + '?prefix=' + encodeURIComponent(prefix);

        // Bound both the connection and response-body wait.
        var timeout;
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var result;
        try {
          result = await Promise.race([
            (async function () {
              var res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token },
                signal: controller ? controller.signal : undefined
              });
              return { res: res, data: res && res.ok ? await res.json() : null };
            })(),
            new Promise(function (_, reject) {
              timeout = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('Answer load timed out'));
              }, 10000);
            })
          ]);
        } finally { clearTimeout(timeout); }
        // An old session's response must never populate a new student's page.
        var currentSid = window.__VIEW_AS_STUDENT_ID__ || window.rosterClient.studentId();
        if (sid !== currentSid || token !== window.rosterClient.token()) {
          _priorReadFailed(false);
          return _unavailablePrior('stale-session');
        }
        var res = result.res;
        var data = result.data;
        if (!res || !res.ok || !data || !data.ok || !Array.isArray(data.rows)) {
          _priorReadFailed(!!res && (res.status === 401 || res.status === 403));
          return _unavailablePrior(res && (res.status === 401 || res.status === 403) ? 'auth' : res && res.ok ? 'invalid-response' : 'network', res && res.status);
        }
        // A background repair read does not put answers into the form. Only the
        // visible restoration may dismiss its warning and cancel its retries.
        if (options && options.restore) {
          _priorFailed = false;
          _priorRetries = 0;
          if (_priorRetryTimer) { clearTimeout(_priorRetryTimer); _priorRetryTimer = null; }
          _priorNotice(null);
        }

        // Dedupe: rows are newest-first; first occurrence per item_id wins.
        var out = new Map();
        for (var i = 0; i < data.rows.length; i++) {
          var r = data.rows[i];
          if (!r || !r.item_id) continue;
          if (out.has(r.item_id)) continue;
          var entry = { response: r.response, score: r.score, source: r.source };
          // W2.6 (2026-09-09): stored grader feedback + when the grade was applied, so the
          // worksheet can explain an overnight auto-grade instead of just colouring the box.
          if (r.frq_result && typeof r.frq_result === 'object') {
            entry.result = {
              score: r.frq_result.score,
              feedback: typeof r.frq_result.feedback === 'string' ? r.frq_result.feedback : '',
              provider: typeof r.frq_result.provider === 'string' ? r.frq_result.provider : null
            };
          }
          if (r.graded_at) entry.gradedAt = r.graded_at;
          out.set(r.item_id, entry);
        }
        return out;
      } catch (err) {
        _priorReadFailed(false);
        return _unavailablePrior(err && (err.name === 'AbortError' || err.message === 'Answer load timed out') ? 'timeout' : 'network');
      }
    },

    // ── WALLET_BUILD.md Task B — fetchReceipts() ────────────────────────────
    // Read-only self-fetch of this student's DURABLE signed receipts (persisted
    // server-side, migration 0018). Returns an array of {id, compact, src, i,
    // sc, ts} for rows that carry a receipt_compact, newest first. The Wallet
    // merges this with the local desk_receipts_v1 cache (deduped by id) so the
    // receipt history survives a browser-storage wipe or a device switch.
    //
    // NEVER throws. NEVER rejects. Resolves to [] on any failure (offline,
    // signed-out, pre-migration server with no receipt columns).
    fetchReceipts: async function () {
      try {
        var token = null;
        var sid = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            token = window.rosterClient.token();
          }
          if (window.rosterClient && typeof window.rosterClient.studentId === 'function') {
            sid = window.rosterClient.studentId();
          }
        } catch (_) {
          return [];
        }
        if (!token || !sid) return [];

        var baseUrl = window.ROSTER_SERVICE_URL || null;
        if (!baseUrl) return [];

        var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid);
        var res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) return [];
        var data = await res.json();
        if (!data || !data.ok || !Array.isArray(data.rows)) return [];

        var out = [];
        for (var i = 0; i < data.rows.length; i++) {
          var r = data.rows[i];
          if (!r || !r.receipt_compact) continue;
          out.push({
            id: r.receipt_id || null,
            compact: r.receipt_compact,
            src: r.source,
            i: r.item_id,
            sc: (typeof r.score === 'number') ? r.score : undefined,
            ts: r.recorded_at ? Date.parse(r.recorded_at) : undefined
          });
        }
        return out;
      } catch (_) {
        return [];
      }
    }

  };

  // Drain after initial identity hydration, on reconnect, on future writes, and
  // periodically while queued rows remain online. Backoff is bounded at one
  // hour so a browser that never goes offline still recovers after a 429/503.
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () {
        _offlineDrainBackoffMs = 30000;
        _scheduleOfflineDrain(0);
      });
      // 2026-09-09: a sign-in in another tab (shared roster session key) replays captured
      // writes promptly instead of waiting out the backoff — a 401-captured row needs the
      // NEW token, which only exists after that sign-in. Clears a pending long-backoff timer.
      window.addEventListener('storage', function (e) {
        try {
          if (!e || e.key !== 'a2_roster.v1') return;
          if (_offlineDrainTimer) { window.clearTimeout(_offlineDrainTimer); _offlineDrainTimer = null; }
          _lastAuthFailToken = null;
          _offlineDrainBackoffMs = 30000;
          _scheduleOfflineDrain(500);
        } catch (_) { /* best-effort */ }
      });
      _scheduleOfflineDrain(0);
    }
  } catch (_) { /* best-effort */ }

})();
