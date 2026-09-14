// Counts and loading outcomes only. No answers, passwords, tokens, or device fingerprints.
(function () {
  'use strict';
  var BUILD = '2026-09-11-n9je'; // scripts/bump-build.mjs stamps the running client version.
  var KEY = 'a2_worksheet_diagnostics.v1';
  var DEVICE_KEY = 'a2_worksheet_diagnostic_device.v1';
  var pending = [];
  var busy = false;
  var timer = null;
  var retries = 0;
  var began = false;
  function id() {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var device = id();
  try {
    var stored = localStorage.getItem(DEVICE_KEY);
    if (/^[a-f0-9]{24}$/.test(stored || '')) device = stored;
    else localStorage.setItem(DEVICE_KEY, device);
    var saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) pending = saved.slice(-20).filter(function (r) { return r && r.observedAt > Date.now() - 7 * 86400000; });
  } catch (_) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch (_) {} }
  function owner() {
    try { return window.rosterClient && window.rosterClient.studentId(); } catch (_) { return null; }
  }
  function schedule() {
    if (timer || retries >= 3) return;
    timer = setTimeout(function () { timer = null; flush(); }, [5000, 30000, 120000][retries++]);
  }
  async function flush() {
    if (busy || !pending.length || !window.ROSTER_SERVICE_URL) return;
    var sid = owner();
    var token = window.rosterClient && window.rosterClient.token();
    if (!sid || !token) return;
    busy = true;
    try {
      for (var i = 0; i < pending.length;) {
        var row = pending[i];
        if (row.ownerId !== sid) { i++; continue; }
        if (row.observedAt < Date.now() - 7 * 86400000) { pending.splice(i, 1); persist(); continue; }
        if (owner() !== sid || window.rosterClient.token() !== token) break;
        var payload = {};
        ['studentId', 'deviceId', 'reportId', 'worksheet', 'build', 'observedAt', 'outcome', 'httpStatus', 'online', 'serviceWorker', 'fields', 'downloaded', 'saved', 'restored', 'matched', 'edited', 'filled'].forEach(function (key) { payload[key] = row[key]; });
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timeout;
        var res;
        try {
          res = await Promise.race([
            (async function () {
              var response = await fetch(window.ROSTER_SERVICE_URL + '/student/worksheet-diagnostics', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(payload), signal: controller ? controller.signal : undefined
              });
              return { response: response, ack: response.ok ? await response.json() : null };
            })(),
            new Promise(function (_, reject) { timeout = setTimeout(function () {
              if (controller) controller.abort();
              reject(new Error('timeout'));
            }, 8000); })
          ]);
        } finally { clearTimeout(timeout); }
        var ack = res.ack;
        res = res.response;
        if ((res.ok && ack && ack.ok === true) || res.status === 400 || res.status === 403) {
          // Invalid/obsolete reports must not block later usable reports.
          pending = pending.filter(function (entry) { return entry.reportId !== row.reportId; }); persist();
          i = 0;
        } else {
          if (res.status !== 401) schedule();
          break;
        }
      }
    } catch (_) { schedule(); }
    finally { busy = false; }
  }
  function begin(prefix) {
    began = true;
    var run = { ownerId: owner(), studentId: window.__VIEW_AS_STUDENT_ID__ || owner(), worksheet: prefix };
    run.watchdog = setTimeout(function () { finish(run, null); }, 20000);
    return run;
  }
  function finish(run, prior) {
    try {
      if (!run) return;
      if (run.watchdog) { clearTimeout(run.watchdog); run.watchdog = null; }
      if (!run.ownerId || !run.studentId) return;
      var row = { ownerId: run.ownerId, studentId: run.studentId, deviceId: device, reportId: id(),
        worksheet: run.worksheet, build: BUILD, observedAt: Date.now(),
        outcome: !prior ? 'client-error' : prior.loadFailed ? (prior.loadOutcome || 'network') : prior.size ? 'loaded' : 'empty',
        httpStatus: prior && prior.httpStatus || null, online: navigator.onLine !== false,
        serviceWorker: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        fields: 0, downloaded: 0, saved: 0, restored: 0, matched: 0, edited: 0, filled: 0 };
      if (prior && !prior.loadFailed) prior.forEach(function (entry, item) {
        if (item.indexOf(run.worksheet + '-') === 0 && entry && entry.response !== null && entry.response !== undefined) row.downloaded++;
      });
      document.querySelectorAll('.blank[data-question-id], textarea[id]').forEach(function (field) {
        row.fields++;
        var item = field.dataset.questionId || run.worksheet + '-' + field.id;
        var entry = prior && prior.get(item);
        if (field.value && field.value.trim()) row.filled++;
        if (field.dataset.gbEdited === '1') row.edited++;
        if (entry && entry.response !== null && entry.response !== undefined) {
          row.saved++;
          if (field.value === String(entry.response)) {
            row.matched++;
            if (field.dataset.restored === '1') row.restored++;
          }
        }
      });
      pending.push(row);
      pending = pending.slice(-20);
      persist();
      flush();
    } catch (_) { /* Diagnostics can never interrupt the worksheet. */ }
  }
  window.worksheetDiagnostics = { begin: begin, finish: finish };
  function retry() { retries = 0; if (timer) clearTimeout(timer); timer = null; flush(); }
  window.addEventListener('online', retry);
  window.addEventListener('focus', retry);
  window.addEventListener('roster-session-changed', retry);
  window.addEventListener('storage', function (e) { if (e.key === 'a2_roster.v1') retry(); });
  document.addEventListener('DOMContentLoaded', function () {
    // If worksheet code failed before it could invoke hydration, still report that failure.
    setTimeout(function () {
      if (began) return;
      var match = location.pathname.match(/u(\d+)_lesson([\d-]+)_live\.html$/);
      if (match) finish(begin('WS-U' + match[1] + 'L' + match[2]), null);
    }, 20000);
    flush();
  });
})();
