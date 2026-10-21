// Class Log health strip for the Desk (school/class-log/POLISH3_SPEC.md, WP-H H2).
//
// One line at the top of the Desk for a signed-in teacher:
//   Class Log · seen 12 min ago · 84 % · Waiting for D 11:20 · 0 queued
// red when the phone has been silent for more than 90 minutes during today's
// school hours, when it reports failures in the last 24 h, or when the latest
// block that ended today has no recording of that section ending after the block
// started (judged only from a ping sent after that block ended). Data: GET /teacher/health and GET /teacher/schedule-overrides
// (server overrides and days off for today) over the weekly bell table below.
// The rules are pure and exported (module.exports in tests, window.ClassLogHealth
// in the browser); mount() is the only DOM code and runs only when the page has
// a #class-log-health element.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClassLogHealth = api;
  if (root && root.document && typeof root.document.getElementById === 'function') {
    var start = function () { api.mount(root); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Weekly bell table (weekday 1-5 -> [start, end]), copied from the phone's
  // school/class-log/schedule.lehs-sy2627.json. Date changes come from the server.
  var WEEKLY = {
    B: { 1: ['08:55', '09:50'], 2: ['09:55', '11:00'], 4: ['09:55', '11:00'], 5: ['08:55', '09:50'] },
    E: { 1: ['13:15', '14:30'], 3: ['11:16', '13:25'], 5: ['13:15', '14:30'] },
    C: { 1: ['09:55', '10:55'], 2: ['11:05', '13:14'], 4: ['11:05', '13:14'] },
    D: { 1: ['11:00', '13:09'], 3: ['13:29', '14:30'], 5: ['11:00', '13:11'] },
    G: { 2: ['13:20', '14:30'], 3: ['10:32', '11:12'], 4: ['13:20', '14:30'], 5: ['09:55', '10:55'] }
  };
  var STALE_MINUTES = 90, BEFORE_FIRST = 60, AFTER_LAST = 30, BLOCK_GRACE = 15;
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function toMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function weekday(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }

  // A Date -> {date: 'YYYY-MM-DD', minutes} on the New York wall clock.
  function nyParts(when) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(when).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + '-' + parts.month + '-' + parts.day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  // Today's blocks: weekly table, then server overrides (cancelled or new times),
  // nothing on a day off. Sorted by start.
  function blocksForDate(date, schedule) {
    schedule = schedule || {};
    if ((schedule.daysOff || []).indexOf(date) !== -1) return [];
    var weekly = schedule.weekly || WEEKLY, byDay = weekday(date), blocks = {};
    Object.keys(weekly).forEach(function (section) {
      var times = weekly[section][byDay];
      if (times) blocks[section] = { section: section, start: times[0], end: times[1] };
    });
    (schedule.overrides || []).forEach(function (o) {
      if (!o || o.date !== date) return;
      if (o.cancelled) delete blocks[o.section];
      else if (o.start && o.end) blocks[o.section] = { section: o.section, start: o.start, end: o.end };
    });
    return Object.keys(blocks).map(function (k) { return blocks[k]; })
      .sort(function (a, b) { return toMinutes(a.start) - toMinutes(b.start); });
  }

  // {red, reasons[]} for one device row from GET /teacher/health.
  function verdict(device, now, blocks) {
    var reasons = [];
    if (!device) return { red: false, reasons: reasons };
    var payload = device.payload || {};
    var nowMin = now.minutes;
    if (blocks.length) {
      var open = toMinutes(blocks[0].start) - BEFORE_FIRST, close = toMinutes(blocks[blocks.length - 1].end) + AFTER_LAST;
      if (nowMin >= open && nowMin <= close && Number(device.ageMinutes) > STALE_MINUTES) reasons.push('no ping for ' + device.ageMinutes + ' min');
    }
    if (Number(payload.failures24h) > 0) reasons.push(payload.failures24h + ' failure(s) in 24 h');
    var ended = blocks.filter(function (b) { return toMinutes(b.end) + BLOCK_GRACE <= nowMin; });
    var last = ended[ended.length - 1];
    if (last) {
      var stamp = Date.parse(payload.at || device.receivedAt || '');
      var ping = Number.isFinite(stamp) ? nyParts(new Date(stamp)) : null;
      // Only a ping sent after the block ended can say whether it was recorded.
      if (ping && ping.date === now.date && ping.minutes >= toMinutes(last.end)) {
        var lr = payload.lastRecording;
        // The recording must be this block's: same section, ending inside or after it.
        var recorded = !!lr && lr.date === now.date && lr.section === last.section
          && toMinutes(lr.end) !== null && toMinutes(lr.end) > toMinutes(last.start);
        if (!recorded) reasons.push('no recording for ' + last.section + ' ' + last.start);
      }
    }
    return { red: reasons.length > 0, reasons: reasons };
  }

  function ago(minutes) {
    var m = Number(minutes);
    if (!Number.isFinite(m)) return 'not seen';
    if (m < 60) return 'seen ' + m + ' min ago';
    if (m < 24 * 60) return 'seen ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago';
    return 'seen ' + Math.floor(m / (24 * 60)) + ' d ago';
  }

  function text(device, now) {
    if (!device) return 'Class Log · no health ping yet';
    var p = device.payload || {}, parts = ['Class Log', ago(device.ageMinutes)];
    if (p.battery && Number.isFinite(Number(p.battery.pct))) parts.push(Number(p.battery.pct) + ' %' + (p.battery.charging ? ' charging' : ''));
    var nb = p.nextBlock;
    if (/record/i.test(p.mode || '')) parts.push('Recording');
    else if (nb && nb.section && nb.start) parts.push('Waiting for ' + nb.section + ' ' + (nb.date && nb.date !== now.date ? DAYS[weekday(nb.date)] + ' ' : '') + nb.start);
    else parts.push(p.mode || 'Idle');
    var q = p.queues || {}, queued = 0;
    Object.keys(q).forEach(function (k) { if (Number.isFinite(Number(q[k]))) queued += Number(q[k]); });
    parts.push(queued + ' queued');
    if (Number(p.failures24h) > 0) parts.push(p.failures24h + ' failed (24 h)');
    return parts.join(' · ');
  }

  // Browser glue: a teacher sees the strip; everyone else never fetches.
  function mount(win) {
    var el = win.document.getElementById('class-log-health');
    if (!el) return;
    var last = 0;
    function teacherToken() {
      try {
        var rc = win.rosterClient, who = rc && rc.current && rc.current();
        return who && who.role === 'teacher' && typeof rc.token === 'function' ? rc.token() : null;
      } catch (_) { return null; }
    }
    async function refresh() {
      var token = teacherToken(), base = win.ROSTER_SERVICE_URL;
      if (!token || !base) { el.hidden = true; return; }
      if (Date.now() - last < 5 * 60 * 1000) return;
      last = Date.now();
      var get = function (path) {
        return win.fetch(base + path, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      };
      try {
        var now = nyParts(new Date());
        var health = await get('/teacher/health');
        // No silent fallback to the weekly table: a schedule error hides the strip.
        var schedule = await get('/teacher/schedule-overrides?from=' + now.date + '&to=' + now.date);
        var devices = (health && health.devices) || [];
        var device = devices.filter(function (d) { return d.device === 's24'; })[0] || devices[0] || null;
        var v = verdict(device, now, blocksForDate(now.date, schedule));
        el.textContent = text(device, now);
        el.title = v.reasons.join('; ');
        el.classList.toggle('is-red', v.red);
        el.hidden = false;
      } catch (_) { el.hidden = true; } // 503 before the migrations, offline, signed out
    }
    refresh();
    win.setInterval(refresh, 60 * 1000);
  }

  return { WEEKLY: WEEKLY, toMinutes: toMinutes, nyParts: nyParts, blocksForDate: blocksForDate, verdict: verdict, text: text, mount: mount };
});
