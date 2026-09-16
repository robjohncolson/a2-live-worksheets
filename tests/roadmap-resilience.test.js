import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

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

describe('A2 roadmap cache behavior', () => {
  it.each([true, false])('retains C/D/G pacing during a registry refresh (offline=%s)', async offline => {
    const saved = { lessons: {
      '1.1': { published: true, urls: { check: 'check.html?lesson=1-1' },
        ced2026: { status: 'core', newTopic: '1.1', newUnit: 1, newLabel: 'Saved function lesson' } },
      '1.2': { published: false, urls: {},
        ced2026: { status: 'core', newTopic: '1.2', newUnit: 1, newLabel: 'Planned transformations' } },
    } };
    const fresh = { lessons: { '1.1': { ced2026: {
      status: 'core', newTopic: '1.1', newUnit: 1, newLabel: 'Updated function lesson',
    } } }, calendar: [{ date: '2026-09-16', C: null, D: '1.1', G: '1.1' }] };
    const storage = new Map([['a2-test-roadmap', JSON.stringify({ ts: 1, data: saved })]]);
    const pacing = [[2026, 8, 16, 'noclass', { t: '1.1', u: 1 }, { t: '1.1', u: 1 }]];
    const status = vi.fn(), render = vi.fn();
    const fetch = vi.fn(async () => {
      if (offline) throw new Error('offline');
      return fresh;
    });
    const sandbox = createContext({
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      REGISTRY: { lessons: {} }, BAKED_REGISTRY: { lessons: {} }, S: pacing,
      cYear: 'SY26-27', _a2PacingSignature: 'loaded',
      ROADMAP_REGISTRY_CACHE_KEY: 'a2-test-roadmap', ROADMAP_CACHE_MAX_AGE_MS: 10,
      ROADMAP_FETCH_TIMEOUT_MS: 5500,
      _wireRoadmapNetworkStatus: vi.fn(), _setRoadmapStatus: status,
      _roadmapFetchJsonRetry: fetch, rCal: render, rProg: vi.fn(),
      maybeForcePasswordChange: vi.fn(), renderDoNow: vi.fn(),
    });
    runInContext(['_readRoadmapCache', '_writeRoadmapCache', '_mergeRegistryData', 'loadRegistry']
      .map(name => fnBody(html, name)).join('\n'), sandbox,
      { filename: pathToFileURL(resolve(REPO_ROOT, 'desk.html')).href });
    expect(sandbox._readRoadmapCache('a2-test-roadmap', 10).stale).toBe(true);
    await sandbox.loadRegistry();
    expect(sandbox.S).toBe(pacing);
    expect(sandbox.REGISTRY.lessons['1.1'].urls.check).toBe('check.html?lesson=1-1');
    expect(sandbox.REGISTRY.lessons['1.2']).toMatchObject({ published: false, urls: {} });
    expect(sandbox.REGISTRY.lessons['1.1'].ced2026.newLabel).toBe(
      offline ? 'Saved function lesson' : 'Updated function lesson');
    expect(status).toHaveBeenCalledWith(offline ? 'cached' : '', offline ? 'Using the last saved roadmap.' : '');
    expect(fetch).toHaveBeenCalledWith('roadmap-data.json', { cache: 'no-store' }, 5500, 2);
    expect(render).toHaveBeenCalledTimes(2);
    if (offline) expect(JSON.parse(storage.get('a2-test-roadmap')).data).toEqual(saved);
    else expect(JSON.parse(storage.get('a2-test-roadmap')).data).toEqual(fresh);
    storage.set('a2-test-roadmap', '{broken');
    expect(sandbox._readRoadmapCache('a2-test-roadmap', 10)).toBeNull();
  });

  it('aborts a stalled fetch and clears its deadline without mutating caller options', async () => {
    let expire;
    const clear = vi.fn();
    const fetch = vi.fn(async (_url, options) => {
      expire();
      expect(options.signal.aborted).toBe(true);
      throw new Error('aborted');
    });
    const sandbox = createContext({ AbortController, fetch, ROADMAP_FETCH_TIMEOUT_MS: 5500,
      setTimeout: callback => { expire = callback; return 1; }, clearTimeout: clear });
    runInContext(fnBody(html, '_roadmapFetch'), sandbox,
      { filename: pathToFileURL(resolve(REPO_ROOT, 'desk.html')).href });
    const options = { headers: { Authorization: 'Bearer fixture' } };
    await expect(sandbox._roadmapFetch('https://roster.test/lessons', options)).rejects.toThrow('aborted');
    expect(options).toEqual({ headers: { Authorization: 'Bearer fixture' } });
    expect(clear).toHaveBeenCalledWith(1);
  });
});
