// roster-prefill.js — auto-populate worksheet student-info from the Desk's
// roster sign-in (rosterClient). Loaded AFTER roster-client.js (the existing
// dependency for gradebook-client.js, already wired by DN2b). Pure browser
// JS; no build; never throws / blocks the worksheet.
//
// Behavior:
//   - If rosterClient.current() returns a session, populate (and lock)
//     #worksheetName / #worksheetPeriod / #worksheetUsername with realName
//     / section / username. Also write back to localStorage['worksheet-user']
//     so the worksheet's existing save/restore logic stays coherent. A small
//     green banner appears above the student-info section saying who is
//     signed in (read-only — the student "signs out" via the Desk).
//   - If not signed in: do nothing. The worksheet's legacy worksheet-user
//     localStorage flow continues to apply unchanged.
//   - Missing inputs are silent no-ops (the one bespoke worksheet —
//     u3_lesson6-7 — only has #worksheetUsername; it gets just that filled).

(function () {
  'use strict';

  var BANNER_ID = 'roster-prefill-banner';
  var TINT      = '#eef7ee';        // matches Desk visited-link green hue
  var BORDER    = '#c9e3cc';

  function safeCurrent() {
    try {
      if (window.rosterClient && typeof window.rosterClient.current === 'function') {
        return window.rosterClient.current();
      }
    } catch (_) {}
    return null;
  }

  function findStudentInfoHost(els) {
    // The student-info container is the nearest common ancestor of the
    // three (or fewer) populated inputs. Walk up from any present input
    // until we find a parent with class="student-info"; fall back to the
    // first input's parent if that class isn't found.
    for (var i = 0; i < els.length; i++) {
      var n = els[i];
      while (n && n.parentNode) {
        if (n.className && /\bstudent-info\b/.test(n.className)) return n;
        n = n.parentNode;
      }
    }
    for (var j = 0; j < els.length; j++) {
      if (els[j] && els[j].parentNode) return els[j].parentNode;
    }
    return null;
  }

  function renderBanner(host, who) {
    if (!host) return;
    if (document.getElementById(BANNER_ID)) return;  // idempotent
    var b = document.createElement('div');
    b.id = BANNER_ID;
    b.style.cssText = [
      'background:' + TINT,
      'border:1px solid ' + BORDER,
      'border-left:4px solid #1f8b3b',
      'border-radius:6px',
      'padding:8px 12px',
      'margin:0 0 10px 0',
      'font-size:0.9rem',
      'color:#1b4d1b',
    ].join(';');
    var name = who.realName || who.username || '';
    var section = who.section || '';
    var uname = who.username || '';
    b.innerHTML =
      '✓ <strong>Signed in via the Desk</strong> as ' +
      escapeHtml(name) +
      (section ? ' &middot; Period <strong>' + escapeHtml(section) + '</strong>' : '') +
      (uname && uname !== name ? ' &middot; <code>' + escapeHtml(uname) + '</code>' : '') +
      ' <span style="color:#5a5045;font-size:0.82rem">(sign out from the Desk’s Student menu)</span>';
    host.parentNode.insertBefore(b, host);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function lockInput(el, value, who) {
    if (!el) return;
    el.value = value || '';
    el.readOnly = true;
    el.style.background = TINT;
    el.style.color = '#1b4d1b';
    el.style.cursor = 'not-allowed';
    el.title = 'Signed in via the Desk as ' +
      (who.realName || who.username || '') +
      '. Sign out from the Desk’s Student menu to change.';
  }

  function writeBackLegacyStore(who) {
    // The worksheets' existing worksheet-user localStorage flow expects
    // { name, klass, username }. Keep it in sync so the worksheet's
    // save/restore code path stays coherent if rosterClient signs out
    // mid-session (we don't actively clear it — the next sign-in will
    // overwrite). Wrapped in try/catch (private-mode / blocked storage).
    try {
      var payload = {
        name:     who.realName || '',
        klass:    who.section  || '',
        username: who.username || '',
      };
      localStorage.setItem('worksheet-user', JSON.stringify(payload));
    } catch (_) {}
  }

  function applyPrefill() {
    // View-as: a teacher previewing a student's worksheet (?viewAsUserId=<sid>)
    // must NOT have their OWN identity prefilled or a green "signed in as
    // <teacher>" banner rendered — the view-as read-only module owns identity
    // display (it shows the STUDENT). Bail. Two independent signals so this is
    // race-safe: __WS_READ_ONLY__ is set synchronously by the module at parse
    // time (before this setTimeout(0) fires), and the URL+role check stands on
    // its own even if the module never ran.
    try {
      if (window.__WS_READ_ONLY__) return;
      var params = new URLSearchParams(window.location.search);
      var pre = safeCurrent();
      if (params.get('viewAsUserId') && pre && pre.role === 'teacher') return;
    } catch (_) {}

    var who = safeCurrent();
    if (!who) return;

    var n = document.getElementById('worksheetName');
    var p = document.getElementById('worksheetPeriod');
    var u = document.getElementById('worksheetUsername');
    if (!n && !p && !u) return;  // worksheet doesn't have the standard form

    lockInput(n, who.realName, who);
    lockInput(p, who.section,  who);
    lockInput(u, who.username, who);

    writeBackLegacyStore(who);

    var host = findStudentInfoHost([n, p, u].filter(Boolean));
    renderBanner(host, who);
  }

  // Run after the worksheet's own DOMContentLoaded init (which restores
  // any saved worksheet-user value) — defer one microtask so we override
  // last. Safe to call multiple times (renderBanner is idempotent;
  // lockInput is value-replacement; writeBackLegacyStore is a write-only
  // sync).
  function schedule() { setTimeout(applyPrefill, 0); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
