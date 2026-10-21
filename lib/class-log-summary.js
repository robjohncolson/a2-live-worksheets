// Recording fold in the teacher day panel (school/class-log/POLISH4_SPEC.md, WP-F F3).
//
// For the selected section-day the Desk shows what the Class Log phone summarised
// from the recording: Landed · Student questions · Promises · Next prep, then
// "model · recorded HH:MM" (New York time the summary reached the server). Data:
// GET /teacher/summaries?from=<date>&to=<date>, fetched once per date and kept in
// memory (a failed fetch is not kept, so the next panel open tries again).
// No row for the section: "No recording summary". Fetch failure or no teacher
// token: "Recording summary unavailable"; nothing else on the panel changes.
// view() is pure and exported (module.exports in tests, window.ClassLogSummary in
// the browser); fill() is the only DOM code and runs when desk.html calls it.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClassLogSummary = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var LISTS = [['landed', 'Landed'], ['studentQuestions', 'Student questions'], ['promises', 'Promises'], ['nextPrep', 'Next prep']];
  var NONE = 'No recording summary', UNAVAILABLE = 'Recording summary unavailable';

  // ISO timestamp -> 'HH:MM' on the New York wall clock, or null.
  function clock(iso) {
    var stamp = Date.parse(iso || '');
    if (!Number.isFinite(stamp)) return null;
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(stamp)).forEach(function (p) { parts[p.type] = p.value; });
    return parts.hour + ':' + parts.minute;
  }

  // The row for one section from a GET /teacher/summaries body (Algebra 2 only).
  function pick(body, date, section) {
    var rows = (body && body.summaries) || [];
    return rows.filter(function (r) { return r && r.date === date && r.section === section && r.course === 'algebra2'; })[0] || null;
  }

  // Row -> {message} or {lists: [{label, items}], footer}. Empty lists are left out.
  function view(row) {
    if (!row) return { message: NONE };
    var lists = [];
    LISTS.forEach(function (pair) {
      var items = (Array.isArray(row[pair[0]]) ? row[pair[0]] : []).filter(function (s) { return typeof s === 'string' && s.trim(); });
      if (items.length) lists.push({ label: pair[1], items: items });
    });
    var at = clock(row.recordedAt);
    var footer = [row.model, at ? 'recorded ' + at : null].filter(Boolean).join(' · ');
    return { lists: lists, footer: footer };
  }

  function render(doc, host, v) {
    while (host.lastChild && host.lastChild !== host.firstChild) host.removeChild(host.lastChild); // keep <summary>
    var line = function (text, cls) {
      var p = doc.createElement('p'); p.className = cls; p.textContent = text; host.appendChild(p);
    };
    if (v.message) { line(v.message, 'a2-week-muted'); return; }
    v.lists.forEach(function (list) {
      line(list.label, 'a2-rec-label');
      var ul = doc.createElement('ul'); ul.className = 'a2-rec-list';
      list.items.forEach(function (item) { var li = doc.createElement('li'); li.textContent = item; ul.appendChild(li); });
      host.appendChild(ul);
    });
    if (!v.lists.length) line('The summary has no items.', 'a2-week-muted');
    if (v.footer) line(v.footer, 'a2-week-muted');
  }

  var cache = {};
  function teacherToken(win) {
    try {
      var rc = win.rosterClient, who = rc && rc.current && rc.current();
      return who && who.role === 'teacher' && typeof rc.token === 'function' ? rc.token() : null;
    } catch (_) { return null; }
  }
  function load(win, date) {
    if (cache[date]) return cache[date];
    var token = teacherToken(win), base = win.ROSTER_SERVICE_URL;
    if (!token || !base) return Promise.reject(new Error('no teacher token'));
    var pending = win.fetch(base + '/teacher/summaries?from=' + date + '&to=' + date, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (body) {
        // A malformed envelope is a failure: it must not be cached as an empty day.
        if (!body || !Array.isArray(body.summaries)) throw new Error('bad body');
        return body;
      });
    cache[date] = pending;
    pending.catch(function () { if (cache[date] === pending) delete cache[date]; });
    return pending;
  }

  // Fill a <details> fold (its first child is the <summary>) for one section-day.
  function fill(win, fold, date, section) {
    var doc = win.document;
    render(doc, fold, { message: 'Loading…' });
    return load(win, date)
      .then(function (body) { render(doc, fold, view(pick(body, date, section))); })
      .catch(function () { render(doc, fold, { message: UNAVAILABLE }); });
  }

  return { LISTS: LISTS, NONE: NONE, UNAVAILABLE: UNAVAILABLE, clock: clock, pick: pick, view: view, render: render, fill: fill,
    _reset: function () { cache = {}; } };
});
