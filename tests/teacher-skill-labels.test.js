// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../teacher-dashboard.html', import.meta.url), 'utf8');

describe('teacher skill explanations', () => {
  it('uses readable names for all reported codes in both displays and preserves student actions', () => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/' });
    const w = dom.window;
    const codes = ['2.B', '2.C', '1.A', '2.D', '3.A', '4.B', '1.C', '2.A', '4.A'];
    const heatmap = Object.fromEntries(codes.map(code => [code, { weak: 1, total: 1, pctWeak: 100 }]));
    const s = { studentId: 'student-1', realName: 'Example Student', username: 'example', weakSkills: codes,
      skills: Object.fromEntries(codes.map(code => [code, { observations: 1, correct: 1 }])) };
    w.renderHeatmap({ heatmap }); w.renderTriage({ heatmap, students: [s] });
    for (const code of codes) {
      const label = w.teacherSkillLabel(code);
      expect(label).not.toContain('Unlabeled');
      expect(w.document.getElementById('heatmap-grid').textContent).toContain(label);
      expect(w.document.getElementById('triage-list').textContent).toContain(label);
    }
    expect(w.teacherSkillLabel('2.B')).toBe('Make graphs and tables');
    expect(w.teacherSkillLabel('1.C')).toBe('Plan how to collect and represent data');
    const first = w.document.querySelector('.triage-row');
    expect(first.textContent).toContain('1 graded answer; 1 counted correct');
    expect(first.textContent).toContain('limited evidence');
    expect(first.textContent).toContain('students with graded evidence');
    const open = []; w.openTscDrawer = stub => open.push(stub);
    first.querySelector('.student-name').click();
    expect(open[0].studentId).toBe('student-1');
    dom.window.close();
  });
  it('keeps unknown codes safe and explicit, and does not invent evidence', () => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/' });
    const w = dom.window;
    const code = '<img src=x onerror=alert(1)>';
    w.renderTriage({ heatmap: { [code]: { weak: 1, total: 2, pctWeak: 50 } }, students: [
      { studentId: 's', realName: '<script>bad</script>', weakSkills: [code] }
    ] });
    const list = w.document.getElementById('triage-list');
    expect(list.textContent).toContain('Unlabeled skill');
    expect(list.textContent).toContain('Evidence count unavailable');
    expect(list.querySelector('img, script')).toBeNull();
    w.renderTriage({ heatmap: {}, students: [] });
    expect(w.document.getElementById('triage-empty').textContent).toContain('No graded skill evidence');
    dom.window.close();
  });
});
