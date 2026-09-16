(function () {
  'use strict';
  let lessons = [], generation = 0;
  function node(tag, text, parent) { const result = document.createElement(tag); result.textContent = text; parent.append(result); return result; }
  function readonly() { return window.__WS_READ_ONLY__ || typeof _viewAsContext === 'function' && _viewAsContext(); }
  function paintChips(host, status) {
    A2Client.chips(status).forEach(text => node('span', text, host).className = 'a2-lesson-chip');
  }
  // IXL Group Jam supporting skills: prerequisite skills first, then on-level.
  // Links only; a jam produces no ledger row and never touches the grade.
  function skills(host, lesson) {
    const list = Array.isArray(lesson.supportingSkills) ? lesson.supportingSkills.filter(item => item && item.url && item.name) : [];
    if (!list.length) return;
    const row = node('p', 'IXL skills: ', host); row.className = 'a2-skills';
    list.forEach((item, i) => {
      if (i) node('span', ' · ', row);
      const link = node('a', item.name + (item.level === 'prereq' ? ' (prerequisite)' : ''), row);
      link.href = item.url; link.target = '_blank'; link.rel = 'noopener'; link.dataset.level = item.level || 'core';
    });
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
    if (readonly()) return;
    const version = ++generation;
    const identity = window.rosterClient?.current();
    const host = document.getElementById('a2-lessons');
    if (!host) return;
    try {
      if (!lessons.length) {
        const published = await (await fetch('content/a2/lessons.json')).json();
        if (Array.isArray(published)) lessons = published;
      }
      try { const live = (await A2Client.request('/lessons')).lessons; if (Array.isArray(live) && live.length) lessons = live; } catch (_) { /* Published model remains readable offline. */ }
      // Feed the two-week windows to the Desk calendar (no-op when nothing changed).
      if (typeof applyA2Pacing === 'function') { try { applyA2Pacing(lessons); } catch (_) { /* calendar is optional */ } }
      const statuses = identity ? await Promise.all(lessons.map(lesson => A2Client.request('/lesson-status/' + lesson.key))) : [];
      if (version !== generation) return;
      host.textContent = '';
      const todayHost = document.getElementById('a2-today'); todayHost.textContent = '';
      const gradeHost = document.getElementById('a2-gradebook-scores'); gradeHost.textContent = '';
      const section = String(identity?.section || '').replace(/^Period/i, '');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      // Lessons run about two weeks; a section's date is the last meeting day of
      // that window (the due date). The current lesson is the first one not yet past.
      const current = lessons.find(lesson => lesson.sections?.[section] && lesson.sections[section] >= today);
      lessons.forEach((lesson, i) => {
        const tile = node('article', '', host); tile.className = 'a2-lesson-tile'; tile.dataset.lesson = lesson.key;
        node('h3', lesson.key + ' · ' + lesson.title, tile);
        const link = node('a', 'Open lesson check', tile); link.href = 'check.html?lesson=' + lesson.key;
        const deck = node('button', 'Flashcards', tile); deck.disabled = !identity;
        deck.onclick = () => openBlooketFlashcards(null, lesson.key.replace('-', '.'));
        skills(tile, lesson);
        const status = statuses[i];
        if (status) { paintChips(tile, status); const detail = node('details', '', tile); node('summary', lesson.tryIts.length + ' Try-It scores', detail); scores(detail, status);
          node('h3', lesson.key + ' Try-Its', gradeHost); scores(gradeHost, status); }
        else node('p', 'Sign in on the Desk to view your scores.', tile);
        if (lesson === current) {
          node('strong', 'Current lesson: ' + lesson.key + ' · ' + lesson.title + ' (due ' + lesson.sections[section] + ')', todayHost);
          if (lesson.onenoteUrl) { const notes = node('a', ' OneNote lesson notes', todayHost); notes.href = lesson.onenoteUrl; notes.target = '_blank'; notes.rel = 'noopener'; }
          skills(todayHost, lesson);
          if (status) paintChips(todayHost, status);
        }
      });
      if (identity && window.ROSTER_SERVICE_URL && typeof renderDoNowGrades === 'function') {
        await renderDoNowGrades(window.ROSTER_SERVICE_URL, rosterClient.token());
        if (document.getElementById('my-gradebook-overlay').style.display === 'block') {
          _activeGradebook = _gradeGradebookCache;
          renderMyGradebook(_firstGradebookQuarter(_activeGradebook));
        }
      }
    } catch (error) {
      if (version !== generation) return;
      host.textContent = 'Lesson scores unavailable: ' + error.message;
      document.getElementById('a2-gradebook-scores').textContent = '';
      document.getElementById('a2-today').textContent = '';
    }
  }
  window.A2Desk = { refresh, getLesson: topic => lessons.find(item => item.key === String(topic).replace('.', '-')) };
  window.openA2Profile = function () {
    if (readonly() || !rosterClient.current()) return;
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
