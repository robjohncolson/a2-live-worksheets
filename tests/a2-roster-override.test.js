import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

it('ignores the AP Stats override and uses only the A2 override across its consumers', () => {
  const w = new JSDOM('', { url: 'https://school.test', runScripts: 'outside-only' }).window;
  try {
    const config = readFileSync('roster_config.js', 'utf8');
    w.localStorage.setItem('roster_service_url_override', 'https://stats.test');
    w.eval(config);
    expect(w.ROSTER_SERVICE_URL).not.toBe('https://stats.test');
    w.localStorage.setItem('a2_roster_service_url_override', 'https://a2.test');
    delete w.ROSTER_SERVICE_URL;
    w.eval(config);
    expect(w.ROSTER_SERVICE_URL).toBe('https://a2.test');
    for (const file of ['roster_config.js', 'teacher-roster-console.html', 'teacher-dashboard.html']) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('a2_roster_service_url_override');
      expect(source).not.toMatch(/['"]roster_service_url_override['"]/);
    }
  } finally { w.close(); }
});
