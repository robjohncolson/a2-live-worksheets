import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

describe('roadmap network resilience', () => {
  it('bounds fetches with AbortController and a shared timeout', () => {
    expect(html).toContain('const ROADMAP_FETCH_TIMEOUT_MS = 5500');
    const body = fnBody(html, '_roadmapFetch');
    expect(body).toMatch(/AbortController/);
    expect(body).toMatch(/setTimeout/);
    expect(body).toMatch(/controller\.abort/);
    expect(body).toMatch(/clearTimeout/);
  });

  it('loadRegistry uses saved data before live refresh and reports fallback state', () => {
    const body = fnBody(html, 'loadRegistry');
    expect(body).toMatch(/_readRoadmapCache\(ROADMAP_REGISTRY_CACHE_KEY/);
    expect(body).toMatch(/_mergeRegistryData\(saved\.data\)/);
    expect(body).toMatch(/_roadmapFetchJsonRetry\('roadmap-data\.json'/);
    expect(body).toMatch(/_writeRoadmapCache\(ROADMAP_REGISTRY_CACHE_KEY/);
    expect(body).toMatch(/Using the last saved roadmap/);
  });

  it('year and section changes cannot invoke the retired direct database overlay', () => {
    expect(html).not.toContain('loadSupabaseOverlay');
    expect(html).not.toContain('A2_ROADMAP_OVERLAY');
    expect(fnBody(html, 'loadYear')).toContain('rCal();rProg();');
    expect(fnBody(html, 'setP')).toContain('rCal();rProg();');
  });

  it('shows a compact network status region near the calendar', () => {
    expect(html).toMatch(/id="roadmap-status"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(html).toMatch(/#roadmap-status\[data-net="offline"\]/);
    expect(fnBody(html, '_wireRoadmapNetworkStatus')).toMatch(/addEventListener\('offline'/);
  });
});

describe('roadmap UI clarity and performance', () => {
  it('resource panels render a conditional suggested work order', () => {
    const coach = fnBody(html, '_lessonCoachHtml');
    expect(coach).toMatch(/Suggested work order/);
    expect(coach).toMatch(/Preview the idea/);
    expect(coach).toMatch(/Work the follow-along/);
    expect(coach).toMatch(/Check understanding/);
    expect(coach).toMatch(/Repair misses with flashcards/);
    expect(fnBody(html, 'showResourcePanel')).toMatch(/_lessonCoachHtml\(inf, ids, regEntry\)/);
  });

  it('rCal batches DOM work through a document fragment', () => {
    const body = fnBody(html, 'rCal');
    expect(body).toMatch(/document\.createDocumentFragment\(\)/);
    expect(body).toMatch(/_frag\.appendChild\(_qb\)/);
    expect(body).toMatch(/_frag\.appendChild\(r\)/);
    expect(body).toMatch(/g\.replaceChildren\(_frag\)/);
  });

  it('live roster fetches keep the raw-fetch fallback for isolated tests', () => {
    expect(fnBody(html, 'renderDoNow')).toMatch(/typeof _roadmapFetch === 'function'[\s\S]*fetch\(baseUrl \+ __va\.endpoint/);
    expect(fnBody(html, 'renderDoNowGrades')).toMatch(/typeof _roadmapFetch === 'function'[\s\S]*fetch\(baseUrl \+ __va\.endpoint/);
  });
});
