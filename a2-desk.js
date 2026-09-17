(function () {
  'use strict';
  let lessons = [], generation = 0;
  let lessonStatuses = new Map(), statusSession = null;
  // The year plan (data/a2-lesson-targets.json) gives the calendar its planned windows
  // and assessment days for lessons that are not published yet. Loaded once; the
  // server's pacing overlay (from /lessons) can override a planned lesson's dates.
  let yearPlan, pacingOverlay = {}, dayLogLoaded = false;
  // The day log (content/a2/day-log.json) is what landed in class; it decorates the
  // calendar and lesson panels and never changes a due date.
  async function loadDayLog() {
    if (dayLogLoaded) return;
    dayLogLoaded = true;
    try {
      const log = await (await fetch('content/a2/day-log.json', { cache: 'no-store' })).json();
      if (typeof applyA2DayLog === 'function') applyA2DayLog(log);
    } catch (_) { /* the log is optional */ }
  }
  async function loadYearPlan() {
    if (yearPlan !== undefined) return yearPlan;
    try { const plan = await (await fetch('data/a2-lesson-targets.json')).json(); yearPlan = plan && Array.isArray(plan.lessons) ? plan : null; }
    catch (_) { yearPlan = null; }
    return yearPlan;
  }
  function node(tag, text, parent) { const result = document.createElement(tag); result.textContent = text; parent.append(result); return result; }
  function readonly() { return window.__WS_READ_ONLY__ || typeof _viewAsContext === 'function' && _viewAsContext(); }
  function sessionKey() {
    const identity = window.rosterClient?.current();
    return identity ? JSON.stringify([identity.studentId, identity.username, identity.section, window.rosterClient?.token()]) : null;
  }
  function getStatus(topic) {
    if (readonly() || !statusSession || statusSession !== sessionKey()) return undefined;
    return lessonStatuses.get(String(topic).replace('.', '-'));
  }
  function paintDueLine() {
    const message = document.getElementById('donow-msg');
    if (!message) return;
    message.querySelector('[data-a2-due]')?.remove();
    const identity = window.rosterClient?.current();
    if (!identity || readonly() || identity.mustChangePassword) return;
    if (document.getElementById('donow-card')?.classList.contains('donow-signin')) return;
    const section = String(identity.section || '').replace(/^Period/i, '');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const start = typeof SCHEDULE_DEFS !== 'undefined' && SCHEDULE_DEFS['SY26-27']?.range?.start;
    if (start) {
      const startDay = start[0] + '-' + String(start[1] + 1).padStart(2, '0') + '-' + String(start[2]).padStart(2, '0');
      if (today < startDay) return;
    }
    // Pacing assigns consecutive windows, ending on each section's due date.
    const current = lessons.filter(lesson => lesson.sections?.[section] >= today)
      .sort((a, b) => a.sections[section].localeCompare(b.sections[section]))[0];
    if (!current) return;
    const line = node('span', '\nCurrent lesson: ' + current.key + ' · ' + current.title + ' (due ' + current.sections[section] + ')', message);
    line.dataset.a2Due = '';
  }
  function scores(host, status) {
    status.tryIts.scores.forEach(item => {
      const line = node('div', 'Try-It ' + item.n + ': ' + (item.score == null ? 'unscored' : item.score + '/2') + ' ', host);
      if (item.score == null) return;
      const button = node('button', item.rescoreRequested ? 'Rescore requested' : 'Request rescore', line);
      button.disabled = item.rescoreRequested || !!readonly();
      button.onclick = async () => {
        button.disabled = true;
        try { await A2Client.request('/ledger/rescore', { itemId: item.itemId }); A2Client.changed(); }
        catch (error) { button.textContent = error.message; button.disabled = false; }
      };
    });
  }
  async function refresh() {
    const version = ++generation;
    const session = sessionKey();
    const gradeHost = document.getElementById('a2-gradebook-scores');
    const readOnly = !!readonly();
    if (!readOnly) {
      if (session !== statusSession) {
        lessonStatuses = new Map();
        statusSession = null;
        if (gradeHost) gradeHost.textContent = '';
      }
      paintDueLine();
    }
    const identity = window.rosterClient?.current();
    try {
      if (!lessons.length) {
        const published = await (await fetch('content/a2/lessons.json')).json();
        if (Array.isArray(published)) lessons = published;
      }
      try {
        const live = await A2Client.request('/lessons');
        if (Array.isArray(live.lessons) && live.lessons.length) lessons = live.lessons;
        if (live.pacing && typeof live.pacing === 'object') pacingOverlay = live.pacing;
      } catch (_) { /* Published model remains readable offline. */ }
      const plan = await loadYearPlan();
      await loadDayLog();
      if (version !== generation || session !== sessionKey()) return;
      // Lesson metadata and calendar windows are also needed in read-only views.
      if (typeof applyA2Pacing === 'function') { try { applyA2Pacing(lessons, plan ? { ...plan, overlay: pacingOverlay } : undefined); } catch (_) { /* calendar is optional */ } }
      if (readOnly || readonly()) return;
      paintDueLine();
      const statuses = identity ? await Promise.all(lessons.map(lesson => A2Client.request('/lesson-status/' + lesson.key))) : [];
      if (version !== generation || session !== sessionKey() || readonly()) return;
      lessonStatuses = new Map(lessons.map((lesson, i) => [lesson.key, statuses[i]]));
      statusSession = session;
      if (gradeHost) {
        gradeHost.textContent = '';
        lessons.forEach((lesson, i) => {
          if (!statuses[i]) return;
          node('h3', lesson.key + ' Try-Its', gradeHost);
          scores(gradeHost, statuses[i]);
        });
      }
      // Repaint scores even when the pacing dates did not change.
      if (typeof rCal === 'function') rCal();
      if (identity && window.ROSTER_SERVICE_URL && typeof renderDoNowGrades === 'function') {
        await renderDoNowGrades(window.ROSTER_SERVICE_URL, rosterClient.token());
        if (version !== generation || session !== sessionKey() || readonly()) return;
        if (document.getElementById('my-gradebook-overlay')?.style.display === 'block') {
          _activeGradebook = _gradeGradebookCache;
          renderMyGradebook(_firstGradebookQuarter(_activeGradebook));
        }
      }
    } catch (error) {
      if (version !== generation || session !== sessionKey() || readOnly || readonly()) return;
      lessonStatuses = new Map();
      statusSession = null;
      if (gradeHost) gradeHost.textContent = 'Lesson scores unavailable: ' + error.message;
      if (typeof rCal === 'function') rCal();
    }
  }
  window.A2Desk = { refresh, getStatus, paintDueLine,
    getLesson: topic => lessons.find(item => item.key === String(topic).replace('.', '-')) };
  window.openA2Profile = function () {
    if (readonly() || !rosterClient.current() || localStorage.getItem('a2_user_role') === 'teacher' || rosterClient.current().role === 'teacher') return;
    const dialog = document.getElementById('a2-profile');
    dialog.querySelector('select').value = String(rosterClient.current().section).replace(/^Period/i, '');
    dialog.showModal();
  };
  document.getElementById('a2-profile-form').onsubmit = async event => {
    event.preventDefault();
    if (readonly()) return;
    const identity = rosterClient.current();
    if (!identity) return;
    const token = rosterClient.token();
    const section = event.target.querySelector('select').value;
    const message = document.getElementById('a2-profile-message');
    // Invalidate a boot reconcile before the PUT, even if that request fails.
    const version = window._a2SectionChangeVersion = (window._a2SectionChangeVersion || 0) + 1;
    const stillCurrent = () => {
      const current = rosterClient.current();
      return current && current.studentId === identity.studentId
        && current.username === identity.username && rosterClient.token() === token
        && window._a2SectionChangeVersion === version && !readonly();
    };
    try {
      await A2Client.request('/student/section', { section }, 'PUT');
      if (!stillCurrent()) return;
      rosterClient.updateSection(section);
      if (typeof setP === 'function') setP(section);
      document.getElementById('a2-profile').close(); A2Client.changed();
    } catch (error) { if (stillCurrent()) message.textContent = error.message; }
  };
  ['focus','roster-session-changed','a2-lesson-changed'].forEach(event => window.addEventListener(event, refresh));
  window.addEventListener('storage', event => { if (['a2_lesson_changed','a2_roster.v1'].includes(event.key)) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refresh();
})();
