(function () {
  'use strict';
  async function request(path, body, method, teacherSecret) {
    const token = window.rosterClient?.token();
    if (!window.ROSTER_SERVICE_URL) throw new Error('Roster service is not configured');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (teacherSecret) headers['x-teacher-secret'] = teacherSecret;
    const response = await fetch(window.ROSTER_SERVICE_URL.replace(/\/$/, '') + path, {
      method: method || (body ? 'POST' : 'GET'), headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw Object.assign(new Error(result.error || 'Request failed'), { status: response.status });
    return result;
  }
  function changed() {
    localStorage.setItem('a2_lesson_changed', String(Date.now()));
    window.dispatchEvent(new Event('a2-lesson-changed'));
  }
  function chips(status) {
    return ['Try-Its ' + status.tryIts.scored + '/' + (status.tryIts.total ?? status.tryIts.scores.length) + ' scored, ' + status.tryIts.points + ' points',
      'Lesson check ' + (status.lessonCheck == null ? 'not attempted' : Math.round(status.lessonCheck) + '%'),
      'Flashcards ' + (status.flashcardPassed ? 'passed' : 'not passed')];
  }
  window.A2Client = { request, changed, chips };
})();
