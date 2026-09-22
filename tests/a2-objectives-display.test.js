// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootDesk } from './journeys/harness.js';

const objectives = JSON.parse(readFileSync('content/a2/lesson-objectives.json', 'utf8')).lessons['1-1'];
const lessons = [
  { key: '1-1', title: 'Functions', sections: { C: '2026-09-24', D: '2026-09-18', G: '2026-09-25' } },
  { key: '1-3', title: 'Next lesson (no objectives authored)', sections: { C: '2026-10-01', D: '2026-09-25', G: '2026-10-02' } },
];

describe('Desk observer objectives', () => {
  it('shows authored text, follows section pills and live pacing, and expands accessibly', async () => {
    const desk = await bootDesk({ now: '2026-09-21T16:00:00Z' });
    try {
      const { window } = desk;
      await desk.waitFor(() => window.A2_OBJECTIVES?.['1-1']);
      window.applyA2Pacing(lessons);
      window.setP('C');
      const strip = window.document.getElementById('a2-objectives');
      expect(strip.hidden).toBe(false);
      expect(strip.getAttribute('role')).toBe('region');
      expect(strip.getAttribute('aria-label')).toBe("Today's objectives");
      expect(strip.textContent).toContain(objectives.mathObjectives[0]);
      expect(strip.textContent).toContain(objectives.languageObjective);
      expect(strip.textContent).toContain('(HSF.IF.B.4, HSF.IF.B.6)');
      expect(strip.title).toContain(objectives.essentialQuestion);
      window.A2_OBJECTIVES['1-1'] = { ...objectives, mathObjectives: ['First objective', 'Second objective'] };
      window.renderA2Objectives();
      expect(window.document.getElementById('a2-objectives-math').textContent)
        .toBe('First objective · Second objective (HSF.IF.B.4, HSF.IF.B.6)');
      const toggle = window.document.getElementById('a2-objectives-toggle');
      toggle.focus();
      expect(window.document.activeElement).toBe(toggle);
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(window.document.getElementById('a2-objectives-question').hidden).toBe(false);
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      window.document.getElementById('btn-e').click();
      expect(strip.hidden).toBe(true);
      expect(window.document.documentElement.style.getPropertyValue('--a2-objectives-height')).toBe('0px');
      window.document.getElementById('btn-b').click();
      expect(strip.hidden).toBe(false);
      const currentIdentity = window.rosterClient.current;
      window.rosterClient.current = () => ({ role: 'student', section: 'PeriodD' });
      window.renderA2Objectives();
      expect(strip.hidden).toBe(true);
      window.rosterClient.current = () => ({ role: 'teacher', section: 'D' });
      window.renderA2Objectives();
      expect(strip.hidden).toBe(false);
      window.rosterClient.current = currentIdentity;
      window.applyA2Pacing([lessons[1]]);
      expect(strip.hidden).toBe(true);
    } finally { desk.close(); }
  });

  it('lists the whole week for all three sections when the teacher expands the strip', async () => {
    const desk = await bootDesk({ now: '2026-09-22T16:00:00Z' });
    try {
      const { window } = desk;
      await desk.waitFor(() => window.A2_OBJECTIVES?.['1-1']);
      window.applyA2Pacing(lessons);
      window.setP('C');
      const currentIdentity = window.rosterClient.current;
      window.rosterClient.current = () => ({ role: 'teacher', section: 'C' });
      window.renderA2Objectives();
      const week = window.document.getElementById('a2-objectives-week');
      expect(week.hidden).toBe(true);
      window.document.getElementById('a2-objectives-toggle').click();
      expect(week.hidden).toBe(false);
      expect(week.textContent).toContain('This week: Sep 21 – Sep 25');
      expect(week.textContent).toContain('Section C');
      expect(week.textContent).toContain('Section D');
      expect(week.textContent).toContain('Section G');
      expect(week.textContent).toContain('1-1 Functions');
      expect(week.textContent).toContain(objectives.mathObjectives[0]);
      expect(week.textContent).toContain('Tue: 1-1');
      // D finished 1-1 on Sep 18; its week is the next lesson, which has no authored entry.
      expect(week.textContent).toContain('1-3 Next lesson');
      expect(week.textContent).toContain('Objectives not yet authored');
      window.rosterClient.current = () => ({ role: 'student', section: 'PeriodC' });
      window.renderA2WeekObjectives();
      expect(week.hidden).toBe(true);
      window.rosterClient.current = currentIdentity;
    } finally { desk.close(); }
  });

  it.each([[1366, 768], [1920, 1080]])('reserves the measured strip height for dialogs at %sx%s', async (width, height) => {
    const desk = await bootDesk({ now: '2026-09-21T16:00:00Z' });
    try {
      const { window } = desk;
      await desk.waitFor(() => window.A2_OBJECTIVES?.['1-1']);
      Object.defineProperty(window, 'innerWidth', { value: width });
      Object.defineProperty(window, 'innerHeight', { value: height });
      window.applyA2Pacing(lessons);
      window.setP('C');
      const strip = window.document.getElementById('a2-objectives');
      // jsdom has no layout: exercise the actual measured-height reservation with a browser-sized fixture.
      strip.getBoundingClientRect = () => ({ height: 112 });
      window.dispatchEvent(new window.Event('resize'));
      expect(window.document.documentElement.style.getPropertyValue('--a2-objectives-height')).toBe('112px');
      const app = window.document.querySelector('.app-window');
      app.style.transform = 'none';
      app.style.top = '90px';
      app.getBoundingClientRect = () => ({ top: parseFloat(app.style.top), height: 400 });
      window.sizeA2Objectives();
      expect(app.style.top).toBe('90px');
      app.style.top = height + 'px';
      window.sizeA2Objectives();
      expect(app.style.top).toBe((height - 112 - 400) + 'px');
      strip.getBoundingClientRect = () => ({ height: 200 });
      window.sizeA2Objectives();
      expect(app.style.top).toBe((height - 200 - 400) + 'px');
      app.style.top = '-50px';
      window.sizeA2Objectives();
      expect(app.style.top).toBe('20px');
      const rules = [...window.document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
      const reservation = rules.find(rule => rule.selectorText?.includes('body.a2-objectives-visible :is(.dialog-overlay'));
      expect(reservation.style.getPropertyValue('padding-bottom')).toBe('var(--a2-objectives-height)');
      for (const id of ['bf-overlay', 'signin-overlay']) {
        const overlay = window.document.getElementById(id);
        overlay.style.display = 'block';
        expect(overlay.matches(reservation.selectorText)).toBe(true);
        expect(Number(window.getComputedStyle(strip).zIndex)).toBeGreaterThan(Number(window.getComputedStyle(overlay).zIndex));
      }
    } finally { desk.close(); }
  });

  it('precaches objectives and excludes the strip from mobile and print', () => {
    expect(readFileSync('sw.js', 'utf8')).toContain("'content/a2/lesson-objectives.json'");
    expect(readFileSync('mobile-home.html', 'utf8')).not.toContain('id="a2-objectives"');
    expect(readFileSync('desk.html', 'utf8')).toContain('@media print { #a2-objectives { display: none !important; }');
  });
});
