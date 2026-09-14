(function () {
  'use strict';
  let lessons = [], generation = 0;
  function node(tag, text, parent) { const result = document.createElement(tag); result.textContent = text; parent.append(result); return result; }
  function readonly() { return window.__WS_READ_ONLY__ || typeof _viewAsContext === 'function' && _viewAsContext(); }
  function paintChips(host, status) {
    A2Client.chips(status).forEach(text => node('span', text, host).className = 'a2-lesson-chip');
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
      try { lessons = (await A2Client.request('/lessons')).lessons; } catch (_) { /* Published model remains readable offline. */ }
      const statuses = identity ? await Promise.all(lessons.map(lesson => A2Client.request('/lesson-status/' + lesson.key))) : [];
      if (version !== generation) return;
      host.textContent = '';
      const todayHost = document.getElementById('a2-today'); todayHost.textContent = '';
      const gradeHost = document.getElementById('a2-gradebook-scores'); gradeHost.textContent = '';
      const section = String(identity?.section || '').replace(/^Period/i, '');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      lessons.forEach((lesson, i) => {
        const tile = node('article', '', host); tile.className = 'a2-lesson-tile'; tile.dataset.lesson = lesson.key;
        node('h3', lesson.key + ' · ' + lesson.title, tile);
        const link = node('a', 'Open lesson check', tile); link.href = 'check.html?lesson=' + lesson.key;
        const deck = node('button', 'Flashcards', tile); deck.disabled = !identity;
        deck.onclick = () => openBlooketFlashcards(null, lesson.key.replace('-', '.'));
        const status = statuses[i];
        if (status) { paintChips(tile, status); const detail = node('details', '', tile); node('summary', 'Five Try-It scores', detail); scores(detail, status);
          node('h3', lesson.key + ' Try-Its', gradeHost); scores(gradeHost, status); }
        else node('p', 'Sign in on the Desk to view your scores.', tile);
        if (lesson.sections?.[section] === today) {
          node('strong', 'Today: ' + lesson.key + ' · ' + lesson.title, todayHost);
          if (lesson.onenoteUrl) { const notes = node('a', ' OneNote lesson notes', todayHost); notes.href = lesson.onenoteUrl; notes.target = '_blank'; notes.rel = 'noopener'; }
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
    const section = event.target.querySelector('select').value;
    const message = document.getElementById('a2-profile-message');
    try {
      await A2Client.request('/student/section', { section }, 'PUT');
      const session = JSON.parse(localStorage.getItem('a2_roster.v1')); session.section = section;
      localStorage.setItem('a2_roster.v1', JSON.stringify(session));
      document.getElementById('a2-profile').close(); A2Client.changed();
    } catch (error) { message.textContent = error.message; }
  };
  ['focus','roster-session-changed','a2-lesson-changed'].forEach(event => window.addEventListener(event, refresh));
  window.addEventListener('storage', event => { if (['a2_lesson_changed','a2_roster.v1'].includes(event.key)) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refresh();
})();
