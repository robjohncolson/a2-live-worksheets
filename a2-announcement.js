(function () {
  'use strict';
  const cacheKey = 'a2_announcement';
  let latest = null;
  let requestNumber = 0;
  let observedWeek = monday();

  function monday(now = new Date()) {
    const schoolTz = window.GradeEngine.PHASE3_CONFIG.schoolTz;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: schoolTz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = type => parts.find(value => value.type === type).value;
    const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.toISOString().slice(0, 10);
  }

  function render(value) {
    latest = value && value.weekOf === monday() && typeof value.text === 'string' && value.text.trim() ? value : null;
    document.querySelectorAll('[data-a2-announcement]').forEach(chip => {
      chip.hidden = !latest;
      chip.textContent = latest ? 'This week · ' + latest.text : '';
    });
  }

  function cached() {
    try { return JSON.parse(localStorage.getItem(cacheKey)); } catch { return null; }
  }

  async function refresh() {
    const number = ++requestNumber;
    render(null);
    if (navigator.onLine === false) { render(cached()); return; }
    try {
      if (!window.ROSTER_SERVICE_URL) return;
      const response = await fetch(window.ROSTER_SERVICE_URL.replace(/\/$/, '') + '/announcement', { cache: 'no-store' });
      if (!response.ok) throw new Error('Announcement unavailable');
      const value = await response.json();
      if (number !== requestNumber) return;
      render(value);
      try {
        if (latest) localStorage.setItem(cacheKey, JSON.stringify(latest));
        else localStorage.removeItem(cacheKey);
      } catch { /* Storage may be disabled; the online chip still works. */ }
    } catch { if (number === requestNumber) render(null); }
  }

  function mountEditor(host, request) {
    const form = document.createElement('form');
    form.className = 'a2-announcement-editor';
    form.innerHTML = '<label for="announcement-text">This week (students see this)</label>'
      + '<small id="announcement-hint">Student-facing info only — no staff names, no PD, no private data.</small>'
      + '<textarea id="announcement-text" maxlength="280" aria-describedby="announcement-hint announcement-count"></textarea>'
      + '<output id="announcement-count" for="announcement-text">0/280</output>'
      + '<label for="announcement-week"> Week to save </label><select id="announcement-week">'
      + '<option value="current">Current Monday</option><option value="next">Next Monday</option></select>'
      + '<button type="submit">Save announcement</button><p role="status" aria-live="polite"></p>';
    host.append(form);
    const input = form.querySelector('textarea');
    const count = form.querySelector('output');
    const week = form.querySelector('select');
    const status = form.querySelector('[role=status]');
    const save = form.querySelector('button');
    const drafts = { current: latest?.text || '', next: '' };
    let selected = 'current';
    input.value = drafts.current;
    input.oninput = () => { count.textContent = input.value.length + '/280'; };
    input.oninput();
    week.onchange = () => {
      drafts[selected] = input.value;
      selected = week.value;
      input.value = drafts[selected]; input.oninput(); status.textContent = '';
    };
    form.onsubmit = async event => {
      event.preventDefault(); save.disabled = true;
      const date = new Date(monday() + 'T00:00:00Z');
      if (week.value === 'next') date.setUTCDate(date.getUTCDate() + 7);
      const weekOf = date.toISOString().slice(0, 10);
      try {
        await request('/teacher/announcement', { text: input.value, weekOf }, 'PUT');
        status.textContent = 'Announcement saved for ' + weekOf;
        await refresh();
      } catch (error) { status.textContent = error.message; }
      finally { save.disabled = false; }
    };
    return form;
  }

  window.A2Announcement = { monday, refresh, mountEditor };
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if (event.key === cacheKey) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // Expire an open tab's chip even if the device stays offline over midnight.
  setInterval(() => {
    const week = monday();
    if (observedWeek === week) return;
    observedWeek = week;
    refresh();
  }, 1000);
  refresh();
})();
