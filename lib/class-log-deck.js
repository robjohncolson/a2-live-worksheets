// Rehearsal line in the teacher day panel, under the Recording fold
// (school/class-log/REHEARSAL_SPEC.md, WP-1 1.4).
//
// For the selected section-day the Desk shows the card's rehearsal deck and how
// the teacher is doing on it: `Deck: 11 items · 3 sessions · 4 again (trap: "2f(x)
// is horizontal")` (the parenthesis is the item missed most often, left out when
// nothing was missed), or `No deck`. Data: GET /teacher/decks?date=<date>, fetched
// once per date and kept in memory (a failed fetch is not kept, so the next panel
// open tries again). The section's own deck wins over a course-wide one. Fetch
// failure or no teacher token: "Deck unavailable"; nothing else on the panel changes.
// line() is pure and exported (module.exports in tests, window.ClassLogDeck in the
// browser); fill() is the only DOM code and runs when desk.html calls it.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClassLogDeck = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var LABEL = 'Rehearsal', NONE = 'No deck', UNAVAILABLE = 'Deck unavailable';
  var plural = function (n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); };
  var count = function (value) { return Number.isInteger(value) && value >= 0 ? value : 0; };

  // The Algebra 2 deck for one section from a GET /teacher/decks body: the
  // section's own card first, then the course-wide card (section null).
  function pick(body, section) {
    var decks = ((body && body.decks) || []).filter(function (d) { return d && d.course === 'algebra2'; });
    return decks.filter(function (d) { return d.section === section; })[0]
      || decks.filter(function (d) { return d.section === null || d.section === undefined; })[0] || null;
  }

  // Deck -> the one-line text.
  function line(deck) {
    if (!deck) return NONE;
    var items = Array.isArray(deck.items) ? deck.items.length : 0;
    var r = deck.results || {};
    var text = 'Deck: ' + plural(items, 'item') + ' · ' + plural(count(r.sessions), 'session') + ' · ' + count(r.again) + ' again';
    var top = Array.isArray(deck.missed) ? deck.missed[0] : null;
    if (top && typeof top.front === 'string' && top.front.trim()) text += ' (' + (top.type || 'item') + ': "' + top.front.trim() + '")';
    return text;
  }

  function render(doc, host, text) {
    while (host.lastChild) host.removeChild(host.lastChild);
    var label = doc.createElement('p'); label.className = 'a2-rec-label'; label.textContent = LABEL; host.appendChild(label);
    var p = doc.createElement('p'); p.className = 'a2-week-muted'; p.textContent = text; host.appendChild(p);
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
    var pending = win.fetch(base + '/teacher/decks?date=' + date, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (body) {
        // A malformed envelope is a failure: it must not be cached as a day without decks.
        if (!body || !Array.isArray(body.decks)) throw new Error('bad body');
        return body;
      });
    cache[date] = pending;
    pending.catch(function () { if (cache[date] === pending) delete cache[date]; });
    return pending;
  }

  // Fill a host element (emptied first) with the Rehearsal line for one section-day.
  function fill(win, host, date, section) {
    var doc = win.document;
    render(doc, host, 'Loading…');
    return load(win, date)
      .then(function (body) { render(doc, host, line(pick(body, section))); })
      .catch(function () { render(doc, host, UNAVAILABLE); });
  }

  return { LABEL: LABEL, NONE: NONE, UNAVAILABLE: UNAVAILABLE, pick: pick, line: line, render: render, fill: fill,
    _reset: function () { cache = {}; } };
});
