// Teacher workspace: presentation over the existing teacher-authorized endpoints.
// Nothing here marks work complete, changes a grade, or marks a message read on open.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var students = [], state = 'idle', active = 'class', studentTab = 'overview';
  var student = null, studentRequest = 0, returnFocus = null;
  var itemLabels = {}, worksheetPaths = {}, recentRows = [];

  function node(tag, text, className) {
    var el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, action) {
    var el = node('button', text, 'workspace-button'); el.type = 'button';
    el.addEventListener('click', action); return el;
  }
  function name(stub) {
    var span = node('span'); span.innerHTML = window.studentNameHtml(stub); return span;
  }
  function when(value) {
    var date = new Date(value);
    return value && !isNaN(date.getTime()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unavailable';
  }
  function label(row) {
    return itemLabels[row.itemId] || row.itemId || 'Saved work';
  }
  function status(row) {
    if (row.pendingGrading || (row.pendingGrading == null && row.source === 'frq' && row.score == null && row.response != null && String(row.response).trim())) return 'Awaiting grading';
    return row.score == null ? 'Saved' : 'Graded';
  }
  function missing(stub) {
    if (stub.savedWork && !stub.savedWork.available) return [];
    var out = [], seen = {};
    var quarters = (stub.gradebook && stub.gradebook.quarters) || {};
    Object.keys(quarters).forEach(function (q) {
      var quarter = quarters[q];
      (quarter.columns || []).forEach(function (col) {
        // Unknown dates are not evidence that work is overdue. Zero is a real grade.
        if (col.due !== true || !quarter.cells || quarter.cells[col.key] != null || seen[col.key]) return;
        seen[col.key] = true; out.push(col);
      });
    });
    return out;
  }
  function matches(stub) {
    var search = $('workspace-search').value.trim().toLowerCase();
    return !search || [stub.realName, stub.username, stub.section].join(' ').toLowerCase().indexOf(search) >= 0;
  }
  function selectView(view) {
    active = ['class', 'attention', 'recent', 'recovery'].indexOf(view) >= 0 ? view : 'class';
    document.querySelectorAll('[data-workspace-view]').forEach(function (el) { el.hidden = el.dataset.workspaceView !== active; });
    document.querySelectorAll('[data-workspace-tab]').forEach(function (el) { el.setAttribute('aria-pressed', String(el.dataset.workspaceTab === active)); });
  }
  function message(host, text) { host.appendChild(node('p', text, 'workspace-empty')); }
  function row(host, stub, text, detail) {
    var item = node('div', null, 'workspace-row');
    item.appendChild(name(stub));
    item.appendChild(node('span', text));
    if (detail) item.appendChild(node('span', detail, 'dim'));
    host.appendChild(item); return item;
  }
  function render() {
    var roster = $('workspace-roster'), attention = $('workspace-attention-list'), feed = $('workspace-feed');
    [roster, attention, feed].forEach(function (el) { el.textContent = ''; });
    if (state !== 'ready') {
      $('workspace-count').textContent = '';
      document.querySelector('[data-workspace-tab=attention]').textContent = 'Needs attention';
      var text = state === 'loading' ? 'Loading class data…' : state === 'failed' ? 'Class data unavailable. Load class data to retry.' : 'Sign in as a teacher through the Desk, then load class data.';
      [roster, attention, feed].forEach(function (el) { message(el, text); }); return;
    }
    var visible = students.filter(matches);
    $('workspace-count').textContent = visible.length + ' students';
    var events = [], attentionCount = 0, unavailable = 0;
    visible.forEach(function (s) {
      var work = s.savedWork;
      var gaps = missing(s);
      var last = work && work.recent && work.recent[0];
      var summary = !work || !work.available ? 'Saved-work summary unavailable' : last ? label(last) : 'No saved submissions yet';
      var item = row(roster, s, summary, last ? 'Last saved ' + when(last.recordedAt) : (s.section || 'No period'));
      if (gaps.length) item.appendChild(node('span', gaps.length + ' due items without a grade', 'workspace-tag'));
      function flag(text, detail) { row(attention, s, text, detail); attentionCount++; }
      if (!work || !work.available) { unavailable++; flag('Saved-work data unavailable', 'Retry before interpreting missing work.'); }
      else {
        if (work.pendingGrading) flag(work.pendingGrading + ' response(s) awaiting grading', 'The answers are saved.');
        (work.recent || []).forEach(function (r) { events.push({ student: s, work: r }); });
      }
      if (gaps.length) flag(gaps.length + ' due items without a grade', gaps.slice(0, 3).map(function (c) { return c.title; }).join(' · '));
      if (!s.schoologyUid) flag('Schoology account needs linking', 'Open Account to check the connection.');
    });
    events.sort(function (a, b) { return String(b.work.recordedAt || '').localeCompare(String(a.work.recordedAt || '')); });
    events.slice(0, 100).forEach(function (event) {
      row(feed, event.student, label(event.work) + ' · ' + status(event.work), when(event.work.recordedAt));
    });
    if (!visible.length) [roster, attention, feed].forEach(function (el) { message(el, 'No students match this filter.'); });
    else {
      if (!attentionCount) message(attention, 'No grading or account flags in the loaded class data. Check messages and browser reports below.');
      if (!events.length) message(feed, unavailable ? 'Recent work is unavailable for some students. Try loading again.' : 'No saved submissions yet.');
    }
    var attentionTab = document.querySelector('[data-workspace-tab=attention]');
    attentionTab.textContent = 'Needs attention' + (attentionCount ? ' (' + attentionCount + ')' : '');
  }

  function selectStudentTab(tab) {
    studentTab = tab;
    document.querySelectorAll('[data-student-tab]').forEach(function (el) { el.setAttribute('aria-pressed', String(el.dataset.studentTab === tab)); });
    document.querySelectorAll('[data-student-pane]').forEach(function (el) { el.hidden = el.dataset.studentPane !== tab; });
  }
  function worksheet(row) {
    var path = worksheetPaths[row.itemId];
    if (!path) return;
    selectStudentTab('worksheet');
    var host = $('workspace-worksheet'); host.textContent = '';
    host.appendChild(node('p', 'Saved worksheet · read-only. This shows answers on the server; unsynced edits on a student device may differ.', 'dim'));
    // Worksheets only enable their read-only path for a verified teacher session.
    var who = window.rosterClient && window.rosterClient.current && window.rosterClient.current();
    if (!who || who.role !== 'teacher') {
      message(host, 'Sign in as a teacher in the Desk to open the worksheet. You can still read saved responses under Recent work.'); return;
    }
    var frame = node('iframe'); frame.title = 'Saved worksheet for ' + (student.realName || student.username);
    frame.src = path + '?viewAsUserId=' + encodeURIComponent(student.studentId);
    frame.className = 'workspace-worksheet-frame'; host.appendChild(frame);
  }
  function renderRecent(payload) {
    var host = $('tsc-recent-list'); host.textContent = '';
    recentRows = payload && payload.ok && Array.isArray(payload.submissions) ? payload.submissions : [];
    if (!payload || !payload.ok) { message(host, 'Saved submissions unavailable. Close and reopen this student to retry.'); return; }
    if (!recentRows.length) { message(host, 'No saved submissions yet. Offline work may still be on the student’s device.'); return; }
    recentRows.forEach(function (r) {
      var li = node('li', null, 'workspace-saved-item');
      li.appendChild(node('strong', label(r)));
      li.appendChild(node('div', when(r.recordedAt) + ' · ' + status(r), 'dim'));
      if (r.response != null) {
        var details = node('details'); details.appendChild(node('summary', 'Read saved response'));
        details.appendChild(node('pre', typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)));
        li.appendChild(details);
      }
      if (worksheetPaths[r.itemId]) li.appendChild(button('Open saved worksheet', function () { worksheet(r); }));
      host.appendChild(li);
    });
    var picker = $('workspace-worksheet'); picker.textContent = '';
    message(picker, 'Choose a worksheet from recent saved work. Opening it does not show unsynced edits from a student’s computer.');
    var seen = {};
    recentRows.forEach(function (r) {
      var path = worksheetPaths[r.itemId];
      if (!path || seen[path]) return;
      seen[path] = true; picker.appendChild(button(label(r).split(' · ')[0], function () { worksheet(r); }));
    });
    if (!Object.keys(seen).length) message(picker, 'No worksheet among the most recent 100 submissions. View the student app to choose an older lesson.');
  }
  function evidenceText(value) {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  function clearEvidence() {
    var host = $('workspace-evidence');
    host.querySelectorAll('canvas').forEach(function (canvas) {
      var chart = window.chartInstances && window.chartInstances[canvas.id];
      if (chart) { chart.destroy(); delete window.chartInstances[canvas.id]; }
    });
    host.textContent = '';
  }
  function evidenceQuestion(host, question, index) {
    if (!question || !question.prompt) {
      message(host, 'Question text unavailable for this item. The saved answer below still counts in the diagnostic.');
      return;
    }
    host.appendChild(node('h4', 'Question'));
    host.appendChild(node('p', question.prompt, 'workspace-question'));
    var a = question.attachments || {};
    if (a.table) {
      var table = node('table');
      a.table.forEach(function (cells, i) {
        var tr = node('tr'); cells.forEach(function (cell) { tr.appendChild(node(i ? 'td' : 'th', cell)); }); table.appendChild(tr);
      }); host.appendChild(table);
    }
    (a.choices || []).forEach(function (choice) { host.appendChild(node('p', choice.key + '. ' + choice.value, 'workspace-choice')); });
    if (a.image && /^assets\/[a-zA-Z0-9_./-]+$/.test(a.image)) {
      var img = node('img'); img.src = 'https://robjohncolson.github.io/curriculum_render/' + a.image;
      img.alt = a.imageAlt || 'Question diagram'; host.appendChild(img);
    }
    var charts = a.chartType ? [a] : (a.charts || []);
    charts.forEach(function (chart, c) {
      var wrap = node('div', null, 'workspace-evidence-chart');
      var id = 'skill-chart-' + studentRequest + '-' + index + '-' + c;
      if (chart.title) wrap.appendChild(node('p', chart.title));
      var canvas = node('canvas'); canvas.id = id; wrap.appendChild(canvas); host.appendChild(wrap);
      // Render after the card is attached, without interpolating response HTML.
      setTimeout(function () {
        if (!canvas.isConnected) return;
        try {
          if (!window.renderChartNow) throw new Error('Chart renderer unavailable');
          window.renderChartNow(chart, id);
        } catch (_) { message(wrap, 'Chart unavailable. Chart data: ' + evidenceText(chart)); }
      }, 0);
    });
    if (a.description) host.appendChild(node('p', a.description));
    if (question.context) {
      var context = node('details'); context.appendChild(node('summary', 'Lesson context'));
      context.appendChild(node('pre', question.context)); host.appendChild(context);
    }
  }
  async function loadSkillEvidence(skill) {
    clearEvidence();
    var host = $('workspace-evidence'), request = studentRequest;
    selectStudentTab('evidence');
    host.appendChild(node('h3', window.teacherSkillLabel(skill) + ' (Skill ' + skill + ')'));
    var loading = node('p', 'Loading questions and saved answers...'); host.appendChild(loading);
    try {
      var res = await fetch(window.svcUrl() + '/teacher/student/' + encodeURIComponent(student.studentId) + '/recent?skill=' + encodeURIComponent(skill), { headers: window.teacherAuthHeaders() });
      var payload = await res.json();
      if (request !== studentRequest) return;
      if (!res.ok || !payload.ok || payload.skill !== skill || !Array.isArray(payload.submissions)) throw new Error('Evidence unavailable');
      loading.remove();
      var summary = payload.summary;
      message(host, summary.observations + ' graded answers; ' + summary.correct + ' counted correct. ' + (payload.flagged ? 'Currently flagged for review.' : 'Not currently flagged.'));
      message(host, 'Every counted attempt is shown below, oldest first, including correct answers and retries. A small number of correct answers can still leave a tentative flag. This estimate does not change the grade.');
      message(host, 'Questions use the current course text; historical wording may differ. FRQ answers count as correct for this estimate at ' + Math.round(payload.frqThreshold * 100) + '% credit or above.');
      if (!payload.submissions.length) message(host, 'No graded answers currently contribute to this skill. Reload class data if its flag has changed.');
      payload.submissions.forEach(function (r, index) {
        var card = node('article', null, 'workspace-saved-item');
        card.appendChild(node('h3', label(r) === r.itemId ? label(r) : label(r) + ' | ' + r.itemId));
        card.appendChild(node('p', when(r.recordedAt) + ' | Attempt ' + (r.attempt || 1) + ' | ' + (r.correct ? 'Counted correct' : 'Counted incorrect'), r.correct ? 'skill-result-correct' : 'skill-result-incorrect'));
        evidenceQuestion(card, r.question, index);
        card.appendChild(node('h4', 'Student answer'));
        card.appendChild(node('pre', r.response == null ? 'No answer stored' : evidenceText(r.response)));
        if (r.source === 'frq' && r.score != null) card.appendChild(node('p', 'Saved FRQ score: ' + Math.round(Number(r.score) * 100) + '%'));
        if (r.expectedAnswer != null) card.appendChild(node('p', 'Answer key: ' + evidenceText(r.expectedAnswer)));
        if (r.question && /^u\d+_lesson[\d-]+_live\.html$/.test(r.question.worksheet || '')) {
          worksheetPaths[r.itemId] = r.question.worksheet;
          card.appendChild(button('Open saved worksheet', function () { worksheet(r); }));
        }
        host.appendChild(card);
      });
    } catch (_) {
      if (request !== studentRequest) return;
      loading.textContent = 'Could not load skill evidence. Your student data has not changed.';
      host.appendChild(button('Retry evidence', function () { loadSkillEvidence(skill); }));
    }
  }

  function renderAccount(stub) {
    var host = $('workspace-account'); host.textContent = '';
    host.appendChild(node('p', 'Username: ' + (stub.username || 'Unavailable')));
    host.appendChild(node('p', 'Period: ' + (stub.section || 'Not assigned')));
    var currentLink = node('p', 'Schoology link: ' + (stub.schoologyUid || 'Not linked or not loaded')); host.appendChild(currentLink);
    var linkForm = node('form');
    var linkLabel = node('label', 'Schoology user ID (not the school student ID)');
    var linkInput = node('input'); linkInput.type = 'text'; linkInput.inputMode = 'numeric';
    linkInput.value = stub.schoologyUid || ''; linkInput.required = true; linkInput.pattern = '[0-9]+';
    linkLabel.appendChild(linkInput); linkForm.appendChild(linkLabel);
    var saveLink = node('button', 'Save Schoology link', 'workspace-button'); saveLink.type = 'submit'; linkForm.appendChild(saveLink);
    var linkStatus = node('p'); linkStatus.setAttribute('role', 'status'); linkForm.appendChild(linkStatus);
    linkForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var value = linkInput.value.trim();
      if (!/^\d+$/.test(value)) { linkStatus.textContent = 'Enter the numeric Schoology user ID.'; return; }
      var request = studentRequest; saveLink.disabled = true;
      try {
        var res = await fetch(window.svcUrl() + '/roster/' + encodeURIComponent(stub.studentId) + '/schoology-uid', {
          method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, window.teacherAuthHeaders()),
          body: JSON.stringify({ schoologyUid: value })
        });
        var data = await res.json();
        if (request !== studentRequest) return;
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        stub.schoologyUid = value; currentLink.textContent = 'Schoology link: ' + value;
        linkStatus.textContent = 'Schoology link saved.'; render();
      } catch (error) { if (request === studentRequest) linkStatus.textContent = 'Link not saved: ' + error.message; }
      finally { if (request === studentRequest) saveLink.disabled = false; }
    });
    host.appendChild(linkForm);
    var recover = button('Reveal current sign-in password', async function () {
      recover.disabled = true;
      var request = studentRequest;
      var result = node('p', 'Loading…'); host.appendChild(result);
      try {
        var res = await fetch(window.svcUrl() + '/roster/list', { headers: window.teacherAuthHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        if (request !== studentRequest) return;
        var match = (data.students || []).filter(function (s) { return s.studentId === stub.studentId; })[0];
        if (!data.ok || !match) throw new Error('Student unavailable');
        result.textContent = match.currentPassword ? 'Current password: ' + match.currentPassword : 'No recoverable password available.';
        result.appendChild(button('Hide', function () { result.remove(); recover.disabled = false; }));
      } catch (error) { if (request === studentRequest) { result.textContent = 'Could not load account: ' + error.message; recover.disabled = false; } }
    });
    host.appendChild(recover);
    host.appendChild(node('p', 'Only reveal this on your own screen. Closing the student panel hides it.', 'dim'));
    host.appendChild(button('Roster and enrollment tools', function () { closeTscDrawer(); selectView('recovery'); openTool('teacher-roster-console.html', 'Roster and enrollment'); }));
  }
  function openStudent(stub, skill) {
    returnFocus = document.activeElement;
    studentRequest++;
    clearEvidence();
    document.querySelector('[data-student-tab=evidence]').disabled = !skill;
    student = students.filter(function (s) { return s.studentId === stub.studentId; })[0] || stub;
    selectStudentTab('overview');
    var host = $('workspace-student-overview'); host.textContent = '';
    var gaps = missing(student);
    message(host, !student.gradebook || (student.savedWork && !student.savedWork.available) ? 'Missing-work details unavailable. Load class data to check.' : gaps.length ? 'Due items without a grade: ' + gaps.map(function (c) { return c.title; }).join(' · ') : 'No missing-grade flags in the loaded class data.');
    message(host, 'Suggested next step: ' + (gaps[0] ? gaps[0].title : 'Open recent work or the student app to choose a task.'));
    renderAccount(student);
    $('workspace-worksheet').textContent = 'Loading saved work…';
    $('tsc-recent-list').textContent = 'Loading saved work…';
    var pane = document.querySelector('.tsc-drawer-panel'); pane.setAttribute('aria-modal', 'true');
    document.querySelector('.tsc-drawer-close').focus();
    if (skill) loadSkillEvidence(skill);
  }
  function closeStudent() {
    studentRequest++; student = null; recentRows = [];
    clearEvidence();
    $('workspace-account').textContent = ''; $('workspace-worksheet').textContent = '';
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function openTool(path, title) {
    var host = $('workspace-tool'); host.textContent = '';
    host.appendChild(button('Close ' + title, function () { host.textContent = ''; }));
    var frame = node('iframe'); frame.title = title; frame.src = path; frame.className = 'workspace-tool-frame'; host.appendChild(frame);
  }

  function install() {
    document.body.classList.add('teacher-workspace');
    var main = document.querySelector('.main');
    var back = button('Back to Desk', function () {
      if (window.parent !== window) window.parent.postMessage({ type: 'teacher-workspace', action: 'close' }, location.origin);
      else location.href = 'desk.html';
    });
    document.querySelector('.page-header').prepend(back);
    var toolbar = node('div', null, 'workspace-toolbar');
    toolbar.innerHTML = '<label>Find a student<input id="workspace-search" type="search" placeholder="Name or username"></label>' +
      '<label>Period<select id="workspace-period"><option value="">All periods</option><option value="PeriodC">Period C</option><option value="PeriodD">Period D</option><option value="PeriodG">Period G</option></select></label><span id="workspace-count" class="dim"></span>';
    main.prepend(toolbar);
    var nav = node('nav', null, 'workspace-nav'); nav.setAttribute('aria-label', 'Teacher workspace');
    [['class', 'Class'], ['attention', 'Needs attention'], ['recent', 'Recent work'], ['recovery', 'More tools & recovery']].forEach(function (entry) {
      var b = button(entry[1], function () { selectView(entry[0]); }); b.dataset.workspaceTab = entry[0]; nav.appendChild(b);
    });
    toolbar.after(nav);
    var panes = {};
    ['class', 'attention', 'recent', 'recovery'].forEach(function (key) {
      var pane = node('div', null, 'workspace-pane'); pane.dataset.workspaceView = key; main.appendChild(pane); panes[key] = pane;
    });
    panes.class.innerHTML = '<section class="section"><h2>Class</h2><div id="workspace-roster"></div></section><details id="workspace-class-details"><summary>Grades, pacing, and class detail</summary></details>';
    panes.attention.innerHTML = '<section class="section"><h2>Needs attention</h2><p class="dim">Flags are based on saved data. A due item without a grade may be unsubmitted or awaiting grading; it does not assign a zero.</p><div id="workspace-attention-list"></div></section>';
    panes.recent.innerHTML = '<section class="section"><h2>Recent work</h2><p class="dim">Last saved work, newest first · up to eight items per student. Offline work appears after it syncs. This is not live activity tracking.</p><div id="workspace-feed"></div></section>';
    panes.recovery.innerHTML = '<section class="section"><h2>Tools & recovery</h2><div id="workspace-tool-buttons" class="workspace-nav"></div><div id="workspace-tool"></div></section>';
    var connection = $('workspace-connection');
    var settings = node('details', null, 'workspace-settings'); settings.appendChild(node('summary', 'Connection settings'));
    connection.querySelectorAll('.row-2').forEach(function (el) { settings.appendChild(el); });
    connection.querySelector('h2').remove(); connection.prepend(settings); nav.after(connection);
    panes.attention.appendChild($('inbox-strip'));
    // Keep unread messages visible even while the teacher is on the Class tab.
    var unreadNote = node('span', '', 'workspace-unread'); unreadNote.setAttribute('role', 'status'); nav.appendChild(unreadNote);
    function unreadChanged() {
      var badge = $('inbox-unread');
      unreadNote.textContent = badge.hidden ? '' : badge.textContent + ' student message(s)';
    }
    new MutationObserver(unreadChanged).observe($('inbox-unread'), { childList: true, attributes: true, subtree: true });
    unreadChanged();
    panes.attention.appendChild($('worksheet-diagnostics-section'));
    // Keep established tools and their event handlers intact while making them secondary.
    Array.from(main.children).filter(function (el) { return el.classList.contains('section') && el !== connection; }).forEach(function (el) {
      var title = (el.querySelector('h2') || {}).textContent || '';
      if (/Backup|Manage Students|Reward|Remediation|Makeup|Quarter Close/.test(title)) panes.recovery.appendChild(el);
      else $('workspace-class-details').appendChild(el);
    });
    var tools = $('workspace-tool-buttons');
    tools.appendChild(button('Roster & enrollment', function () { openTool('teacher-roster-console.html', 'Roster and enrollment'); }));
    tools.appendChild(button('Verify receipt (paste)', function () { openTool('https://robjohncolson.github.io/curriculum_render/verify.html', 'Verify receipt'); }));
    if (window.parent !== window) {
      tools.appendChild(button('Verify receipt (scan)', function () { window.parent.postMessage({ type: 'teacher-workspace', action: 'scan' }, location.origin); }));
      tools.appendChild(button('Grade check-in', function () { window.parent.postMessage({ type: 'teacher-workspace', action: 'checkin' }, location.origin); }));
    }
    var section = $('section-filter'), period = $('workspace-period');
    section.closest('.form-row').hidden = true;
    period.value = section.value;
    period.addEventListener('change', function () { section.value = period.value; $('load-btn').click(); });
    $('workspace-search').addEventListener('input', render);
    window.addEventListener('storage', function (event) {
      if (event.key !== 'a2_roster.v1') return;
      closeTscDrawer(); students = []; state = 'idle'; render();
      if (window.parent !== window) window.parent.postMessage({ type: 'teacher-workspace', action: 'close' }, location.origin);
      // A different teacher or expired session must not inherit the previous view.
      $('inbox-list').textContent = ''; $('worksheet-diagnostics-rows').textContent = '';
    });

    var body = document.querySelector('.tsc-drawer-body');
    var tabs = node('nav', null, 'workspace-nav'); tabs.setAttribute('aria-label', 'Student details');
    [['overview', 'Overview'], ['recent', 'Recent work'], ['evidence', 'Skill evidence'], ['worksheet', 'Worksheet'], ['account', 'Account'], ['messages', 'Messages']].forEach(function (entry) {
      var b = button(entry[1], function () { selectStudentTab(entry[0]); }); b.dataset.studentTab = entry[0]; tabs.appendChild(b);
    });
    body.prepend(tabs);
    var overview = node('div'); overview.id = 'workspace-student-overview'; overview.dataset.studentPane = 'overview'; tabs.after(overview);
    ['grade', 'reconcile', 'recent', 'nudges'].forEach(function (key) {
      $('tsc-section-' + key).dataset.studentPane = key === 'recent' ? 'recent' : key === 'nudges' ? 'messages' : 'overview';
    });
    ['worksheet', 'account', 'evidence'].forEach(function (key) { var el = node('section'); el.id = 'workspace-' + key; el.dataset.studentPane = key; body.appendChild(el); });
    $('tsc-action-nudge').addEventListener('click', function () { selectStudentTab('messages'); });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !$('tsc-drawer').classList.contains('tsc-open') || $('tsc-remediation-modal').classList.contains('tsc-modal-open')) return;
      var focusable = Array.from(document.querySelectorAll('.tsc-drawer-panel button, .tsc-drawer-panel input, .tsc-drawer-panel textarea, .tsc-drawer-panel select, .tsc-drawer-panel summary')).filter(function (el) { return !el.disabled && !el.closest('[hidden]') && el.getClientRects().length; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    selectView(new URLSearchParams(location.search).get('view'));
    render();
    if (Object.keys(window.teacherAuthHeaders()).length) $('load-btn').click();
    else settings.open = true;
    // Metadata is public. Load labels separately so it never blocks a class load.
    fetch('data/work-manifest.json').then(function (res) { if (!res.ok) throw new Error(); return res.json(); }).then(function (manifest) {
      (manifest.units || []).forEach(function (unit) { (unit.lessons || []).forEach(function (lesson) { (lesson.activities || []).forEach(function (activity) {
        (activity.itemIds || []).forEach(function (id) {
          itemLabels[id] = 'Lesson ' + lesson.lesson + ' · ' + activity.activity;
          var match = /^WS-U(\d+)L(\d+(?:-\d+)?)-/.exec(id);
          if (match) worksheetPaths[id] = 'u' + match[1] + '_lesson' + match[2] + '_live.html';
        });
      }); }); });
      render();
      if (student && recentRows.length && studentTab !== 'worksheet') renderRecent({ ok: true, submissions: recentRows });
    }).catch(function () {});
  }
  window.teacherWorkspace = {
    loading: function () { state = 'loading'; $('workspace-period').disabled = true; render(); },
    failed: function () { state = 'failed'; students = []; $('workspace-period').disabled = false; render(); },
    loaded: function (payload) {
      $('workspace-period').disabled = false;
      state = payload && payload.ok ? 'ready' : 'failed'; students = payload && payload.students || [];
      students = students.slice().sort(function (a, b) { return String(a.realName || a.username).localeCompare(String(b.realName || b.username)); });
      students.forEach(function (s) {
        var select = $('workspace-period');
        if (s.section && !Array.from(select.options).some(function (o) { return o.value === s.section; })) { var option = node('option', s.section); option.value = s.section; select.appendChild(option); }
      });
      render();
    },
    openStudent: openStudent, closeStudent: closeStudent, recent: renderRecent, selectView: selectView
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
