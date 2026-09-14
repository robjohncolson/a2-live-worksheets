// Teacher-only operational summaries, independent of grade loading and teacher previews.
(function () {
  'use strict';
  window.installWorksheetDiagnosticsPanel = function (options) {
    var $ = function (id) { return document.getElementById(id); };
    var rows = [], section = '', loaded = false, truncated = false, busy = false, unavailable = false;
    var labels = { auth: 'Sign-in rejected', network: 'Connection/server failure', timeout: 'Answer download timed out', 'invalid-response': 'Invalid server response', 'no-identity': 'No sign-in', 'stale-session': 'Account changed during loading', config: 'Client configuration unavailable', 'client-error': 'Worksheet did not finish loading', empty: 'Server confirmed no saved answers', loaded: 'Answers downloaded' };
    function render() {
      var body = $('worksheet-diagnostics-rows');
      body.textContent = '';
      var query = $('worksheet-diagnostics-search').value.trim().toLowerCase();
      var previews = $('worksheet-diagnostics-previews').checked;
      var studentId = $('worksheet-diagnostics-student').value;
      var visible = rows.filter(function (r) {
        return (!studentId || r.studentId === studentId) && (previews || r.mode === 'student') && (!query || ((r.realName || '') + ' ' + (r.username || '')).toLowerCase().indexOf(query) >= 0);
      });
      visible.forEach(function (r) {
        var tr = document.createElement('tr');
        function cell(text) { var td = document.createElement('td'); td.textContent = text; td.style.padding = '8px'; tr.appendChild(td); }
        cell((r.realName || r.username || 'Unknown student') + ' (' + (r.username || '') + ') / browser ' + String(r.deviceId || '').slice(0, 6));
        if (window.studentNameHtml) tr.firstChild.innerHTML = window.studentNameHtml(r) + ' / browser ' + String(r.deviceId || '').slice(0, 6).replace(/[^a-z0-9-]/gi, '');
        cell(r.worksheet + (r.mode === 'teacher-preview' ? ' / TEACHER PREVIEW' : ' / student'));
        var summary = (labels[r.outcome] || 'Unknown result') + (r.httpStatus ? ' (HTTP ' + r.httpStatus + ')' : '');
        summary += '. Downloaded: ' + r.downloaded + '; matching fields: ' + r.saved + '; showing saved: ' + r.matched + '; restored: ' + r.restored + '; edited: ' + r.edited + '; filled: ' + r.filled + '/' + r.fields + '.';
        if (r.downloaded > r.saved) summary += ' Some downloaded answers have no matching worksheet field.';
        if (r.outcome === 'loaded' && r.matched < r.saved && !r.edited) summary += ' Check display: some saved answers are not showing.';
        if (r.online === false) summary += ' Browser reported offline.';
        if (r.session === 'expired') summary += ' Session expired.';
        if (r.lastFailure && (r.outcome === 'loaded' || r.outcome === 'empty')) summary += ' Recovered after ' + (labels[r.lastFailure.outcome] || r.lastFailure.outcome) + '.';
        cell(summary);
        cell(new Date(r.observedAt).toLocaleString() + ' / ' + r.build + (r.receivedAt - r.observedAt > 60000 ? ' (uploaded later)' : ''));
        body.appendChild(tr);
      });
      $('worksheet-diagnostics-meta').textContent = loaded
        ? visible.length + ' report(s) shown for ' + (section || 'all sections') + (truncated ? '; showing the most recent reports only.' : '.') + (!visible.length ? ' No matching browser reports yet; opening a worksheet on an updated student browser sends one automatically.' : '')
        : 'Waiting for reports.';
    }
    async function load(manual) {
      if (busy || (!manual && unavailable)) return;
      var headers = options.headers();
      if (!Object.keys(headers).length) return;
      var requestedSection = $('section-filter') ? $('section-filter').value.trim() : '';
      busy = true;
      if (manual) unavailable = false;
      $('worksheet-diagnostics-meta').textContent = 'Loading browser reports...';
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout;
      try {
        var data = await Promise.race([
          (async function () {
            var res = await fetch(options.url() + '/teacher/worksheet-diagnostics' + (requestedSection ? '?section=' + encodeURIComponent(requestedSection) : ''), { headers: headers, signal: controller ? controller.signal : undefined });
            if (res.status === 401 || res.status === 503) unavailable = true;
            if (!res.ok) throw new Error('unavailable');
            return res.json();
          })(),
          new Promise(function (_, reject) { timeout = setTimeout(function () { if (controller) controller.abort(); reject(new Error('timeout')); }, 20000); })
        ]);
        if (!data.ok || !Array.isArray(data.rows)) throw new Error('invalid');
        rows = data.rows; section = requestedSection; truncated = !!data.truncated; loaded = true;
        render();
      } catch (_) {
        $('worksheet-diagnostics-meta').textContent = 'Browser reports unavailable. Existing rows may be out of date; use Refresh reports to retry.';
      } finally { clearTimeout(timeout); busy = false; }
    }
    var rosterBusy = false;
    async function loadStudents() {
      var headers = options.headers();
      if (rosterBusy || !Object.keys(headers).length) return;
      rosterBusy = true;
      var status = $('worksheet-diagnostics-roster-status');
      status.textContent = 'Loading student names...';
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout;
      try {
        var data = await Promise.race([
          (async function () {
            var res = await fetch(options.url() + '/roster/list', { headers: headers, signal: controller ? controller.signal : undefined });
            if (!res.ok) throw new Error('unavailable');
            return res.json();
          })(),
          new Promise(function (_, reject) { timeout = setTimeout(function () { if (controller) controller.abort(); reject(new Error('timeout')); }, 20000); })
        ]);
        if (!data.ok || !Array.isArray(data.students)) throw new Error('invalid');
        // Retain only picker fields; the roster response also contains password-recovery data.
        var students = data.students.filter(function (s) { return s.studentId && s.status !== 'archived'; }).map(function (s) {
          return { id: String(s.studentId), name: String(s.realName || s.username || 'Unnamed student'), username: String(s.username || ''), section: String(s.section || '') };
        });
        students.sort(function (a, b) { return a.name.localeCompare(b.name) || a.username.localeCompare(b.username); });
        var select = $('worksheet-diagnostics-student');
        var selected = select.value;
        select.textContent = '';
        var all = document.createElement('option'); all.value = ''; all.textContent = 'All students'; select.appendChild(all);
        students.forEach(function (s) {
          var option = document.createElement('option'); option.value = s.id;
          option.textContent = s.name + (s.section ? ' (' + s.section + ')' : '') + (s.username ? ' / ' + s.username : '');
          select.appendChild(option);
        });
        select.value = students.some(function (s) { return s.id === selected; }) ? selected : '';
        status.textContent = '';
        render();
      } catch (_) {
        status.textContent = 'Student names unavailable; use Refresh reports to retry.';
      } finally { clearTimeout(timeout); rosterBusy = false; }
    }
    $('worksheet-diagnostics-refresh').addEventListener('click', function () { load(true); loadStudents(); });
    $('worksheet-diagnostics-student').addEventListener('change', render);
    $('worksheet-diagnostics-search').addEventListener('input', render);
    $('worksheet-diagnostics-previews').addEventListener('change', render);
    $('load-btn').addEventListener('click', function () { load(true); loadStudents(); });
    function start() {
      load(false);
      loadStudents();
      setInterval(function () { if (!document.hidden) load(false); }, 60000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  };
})();
