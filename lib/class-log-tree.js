// Knowledge-tree view of the Rehearsal line (school/class-log/KNOWLEDGE_TREE_SPEC.md,
// WP-1 1.5). For a deck built from a lesson tree (every item has a `node`), the line
// becomes `Deck: 12 items · 9 ready · 2 sessions · weakest: "After, whole class: ask?"`
// and under it one line per node of the LESSON (every node of its tree, not only the
// deck's), least ready first, each with a thin bar for its probability p.
//
// Data, all fetched fresh each time the panel opens (only a request already in flight
// is shared), so `ready` and the bars always move together:
//   - the deck, from GET /teacher/decks (lib/class-log-deck.js);
//   - mastery rows, GET /teacher/mastery?course=algebra2&lesson=<lesson>;
//   - the lesson tree, the static file content/a2/lesson-trees/<lesson>.json (same
//     origin as the Desk, fetched live, never precached: the nightly rebuilds it).
// `ready` and `weakest` stay scoped to the deck's items; `ready` is counted from the
// fresh mastery rows (the server's deck.ready is the fallback when mastery fails).
// Without the tree file the list falls back to the deck's items. Every string reaches
// the page through textContent, never innerHTML.
// A deck without nodes is not this module's: lib/class-log-deck.js keeps its old line.
// The pure functions are exported (module.exports in tests, window.ClassLogTree in
// the browser); fill() is the only DOM and network code.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClassLogTree = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DEVICE = 's24';       // the phone that rehearses; the server counts `ready` on it too
  var KNOWN_P = 0.9;
  var START_P = 0.2;        // a node never asked starts at the phone's P_L0
  var TREE_DIR = 'content/a2/lesson-trees/';
  var plural = function (n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); };
  var count = function (value) { return Number.isInteger(value) && value >= 0 ? value : 0; };
  // p is a float4 on the server: 0.90 comes back as 0.8999999762.
  var isKnown = function (p) { return typeof p === 'number' && p + 1e-6 >= KNOWN_P; };

  function isTreeDeck(deck) {
    var items = deck && Array.isArray(deck.items) ? deck.items : [];
    return items.length > 0 && items.every(function (item) { return item && typeof item.node === 'string'; });
  }

  function lessonsOf(deck) {
    var seen = [];
    (deck.items || []).forEach(function (item) { if (item.lesson && seen.indexOf(item.lesson) < 0) seen.push(item.lesson); });
    return seen;
  }

  // This device's rows by node id (Object.create(null): node ids come from the phone).
  function rowsByNode(rows) {
    var byNode = Object.create(null);
    (rows || []).forEach(function (row) { if (row && row.device === DEVICE && typeof row.p === 'number') byNode[row.nodeId] = row; });
    return byNode;
  }

  // Entries ({node, type, front}) joined with mastery, least ready first (a node never
  // asked sorts at the starting p), ties in the given order.
  function join(entries, rows) {
    var byNode = rowsByNode(rows);
    var list = entries.map(function (entry, i) {
      var row = byNode[entry.node];
      var p = row ? row.p : null;
      return { node: entry.node, type: entry.type, front: entry.front, p: p, known: isKnown(p), asked: row ? count(row.asked) : 0, i: i };
    });
    list.sort(function (a, b) {
      var pa = a.p === null ? START_P : a.p, pb = b.p === null ? START_P : b.p;
      return pa - pb || a.i - b.i;
    });
    return list;
  }

  // The deck's items joined with mastery.
  function nodes(deck, rows) {
    return join((deck.items || []).map(function (item) { return { node: item.node, type: item.type, front: item.front }; }), rows);
  }

  // Every node of the lesson trees joined with mastery; the deck's items when no tree loaded.
  function lessonNodes(trees, deck, rows) {
    var entries = [], seen = Object.create(null);
    (trees || []).forEach(function (tree) {
      ((tree && tree.nodes) || []).forEach(function (n) {
        if (!n || typeof n.id !== 'string' || seen[n.id]) return;
        seen[n.id] = true;
        entries.push({ node: n.id, type: n.type, front: String(n.front || '') });
      });
    });
    return entries.length ? join(entries, rows) : nodes(deck, rows);
  }

  // The least ready node that has been asked and is not known yet, or null.
  function weakest(list) {
    var asked = list.filter(function (n) { return n.p !== null && !n.known; });
    return asked.length ? asked[0] : null;
  }

  // Deck items known on the device, from fresh rows; the server's count without rows.
  function readyCount(deck, rows) {
    if (rows === null) return Number.isInteger(deck.ready) ? deck.ready : null;
    return nodes(deck, rows).filter(function (n) { return n.known; }).length;
  }

  // Deck + its node list -> the one-line text. `ready` null is left out, never a false 0.
  function line(deck, list, ready) {
    var r = deck.results || {};
    var parts = ['Deck: ' + plural((deck.items || []).length, 'item')];
    if (ready === undefined) ready = deck.ready;
    if (Number.isInteger(ready)) parts.push(ready + ' ready');
    parts.push(plural(count(r.sessions), 'session'));
    var weak = weakest(list || []);
    if (weak && typeof weak.front === 'string' && weak.front.trim()) parts.push('weakest: "' + weak.front.trim() + '"');
    return parts.join(' · ');
  }

  // One line per node: a thin bar (plain CSS) and "45% · front" ("new" when never asked).
  function renderList(doc, host, list) {
    var ul = doc.createElement('ul'); ul.className = 'a2-tree-list';
    ul.style.listStyle = 'none'; ul.style.margin = '4px 0 0'; ul.style.padding = '0';
    list.forEach(function (n) {
      var li = doc.createElement('li'); li.className = 'a2-tree-node' + (n.known ? ' known' : '');
      li.style.fontSize = '12px'; li.style.margin = '2px 0';
      var track = doc.createElement('span'); track.className = 'a2-tree-bar';
      track.style.display = 'inline-block'; track.style.width = '48px'; track.style.height = '4px';
      track.style.marginRight = '6px'; track.style.verticalAlign = 'middle'; track.style.background = 'rgba(127,127,127,0.25)';
      var fill = doc.createElement('span');
      fill.style.display = 'block'; fill.style.height = '100%';
      fill.style.width = Math.round((n.p === null ? 0 : n.p) * 100) + '%';
      fill.style.background = n.known ? '#2e7d32' : '#c77700';
      track.appendChild(fill); li.appendChild(track);
      var label = doc.createElement('span');
      label.textContent = (n.p === null ? 'new' : Math.round(n.p * 100) + '%') + ' · ' + n.front;
      li.appendChild(label);
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  // Only a request already in flight is shared; a settled one is forgotten, so the
  // next panel open fetches again.
  var inFlight = {};
  function shared(key, start) {
    if (inFlight[key]) return inFlight[key];
    var pending = start();
    inFlight[key] = pending;
    var forget = function () { if (inFlight[key] === pending) delete inFlight[key]; };
    pending.then(forget, forget);
    return pending;
  }
  function teacherToken(win) {
    try {
      var rc = win.rosterClient, who = rc && rc.current && rc.current();
      return who && who.role === 'teacher' && typeof rc.token === 'function' ? rc.token() : null;
    } catch (_) { return null; }
  }
  function loadMastery(win, lesson) {
    return shared('mastery|' + lesson, function () {
      var token = teacherToken(win), base = win.ROSTER_SERVICE_URL;
      if (!token || !base) return Promise.reject(new Error('no teacher token'));
      return win.fetch(base + '/teacher/mastery?course=algebra2&lesson=' + encodeURIComponent(lesson), { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (body) { if (!body || !Array.isArray(body.rows)) throw new Error('bad body'); return body.rows; });
    });
  }
  function loadTree(win, lesson) {
    return shared('tree|' + lesson, function () {
      return win.fetch(TREE_DIR + encodeURIComponent(lesson) + '.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (tree) { if (!tree || !Array.isArray(tree.nodes)) throw new Error('bad tree'); return tree; });
    });
  }

  // Render the tree line and the lesson's node list for a tree deck into host.
  // `render(doc, host, text)` is the deck module's (label + line). A failed mastery
  // fetch shows every node "new" with the server's ready; a failed tree fetch lists
  // the deck's items.
  function fill(win, host, deck, render) {
    var doc = win.document;
    var lessons = lessonsOf(deck);
    var mastery = Promise.all(lessons.map(function (lesson) { return loadMastery(win, lesson); }))
      .then(function (lists) { return [].concat.apply([], lists); }, function () { return null; });
    var trees = Promise.all(lessons.map(function (lesson) { return loadTree(win, lesson).catch(function () { return null; }); }));
    return Promise.all([mastery, trees]).then(function (both) {
      var rows = both[0], loaded = both[1].filter(Boolean);
      render(doc, host, line(deck, nodes(deck, rows || []), readyCount(deck, rows)));
      renderList(doc, host, lessonNodes(loaded, deck, rows || []));
    });
  }

  return { DEVICE: DEVICE, TREE_DIR: TREE_DIR, isKnown: isKnown, isTreeDeck: isTreeDeck, nodes: nodes, lessonNodes: lessonNodes,
    weakest: weakest, readyCount: readyCount, line: line, renderList: renderList, fill: fill, _reset: function () { inFlight = {}; } };
});
