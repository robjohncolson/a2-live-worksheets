// roster_config.js — sets window.ROSTER_SERVICE_URL for every client.
//
// Resolution order (first non-empty wins):
//   0. window.A2_CONFIG.ROSTER_SERVICE_URL, when supplied.
//   1. Anything that ran before this script and pre-set window.ROSTER_SERVICE_URL.
//   2. localStorage['a2_roster_service_url_override'] — explicit teacher-local
//      backend override (set by the dropdown in teacher-roster-console.html
//      and teacher-dashboard.html, or by hand:
//        localStorage.setItem('a2_roster_service_url_override', 'http://...')
//      Clear with localStorage.removeItem('a2_roster_service_url_override').
//   3. AUTO-DETECT: if the page is being served from a real localhost dev
//      server (hostname is localhost / 127.x AND the URL has a port — so
//      file:// and jsdom about:blank are skipped), default to a sibling
//      roster-server on http://localhost:8091. This is the convention the
//      local dev workflow uses; override step (2) for any other port.
//   4. The committed production URL.
window.ROSTER_SERVICE_URL = (window.A2_CONFIG && window.A2_CONFIG.ROSTER_SERVICE_URL)
  || window.ROSTER_SERVICE_URL
  || (function () {
    try { return localStorage.getItem('a2_roster_service_url_override') || null; }
    catch (_) { return null; }
  })()
  || (function () {
    // Auto-detect localhost dev. Requires both a localhost hostname AND a
    // non-empty port — protects jsdom (file:// → empty port) and any
    // unusual hosting where 'localhost' might map to a prod backend.
    try {
      if (typeof location === 'undefined') return null;
      if (!location.port) return null;
      var h = location.hostname || '';
      if (h === 'localhost' || h === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(h)) {
        return 'http://localhost:8091';
      }
    } catch (_) {}
    return null;
  })()
  || 'https://a2-live-worksheets-production.up.railway.app';
