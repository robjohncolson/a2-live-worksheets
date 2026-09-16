// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const desk = readFileSync(resolve(import.meta.dirname, '../desk.html'), 'utf8');
const profile = readFileSync(resolve(import.meta.dirname, '../a2-desk.js'), 'utf8');
function functionSource(source, name) {
  const start = source.indexOf('async function ' + name + '(');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Missing function ' + name);
}
const source = functionSource(desk, '_reconcileRosterSection');
const student = { studentId: 'c-student', username: 'mango_fox', section: 'PeriodX', role: 'student' };
function harness({ who = student, rosters = {}, period = 'C', fetchRoster, viewAs = null } = {}) {
  let identity = who && { ...who }, token = 'token-1';
  const client = {
    current: () => identity && { ...identity }, token: () => token,
    updateSection: vi.fn(section => { identity.section = section; return true; })
  };
  const window = { rosterClient: client };
  const setP = vi.fn();
  const fetch = vi.fn(fetchRoster || (async section => rosters[section] || []));
  const fn = new Function('window', '_fetchSectionRoster', 'setP', 'cP', '_viewAsContext', 'return (' + source + ');')(window, fetch, setP, period, () => viewAs);
  return { fn, window, client, setP, fetch, switchTo: (who, nextToken = 'token-2') => { identity = who; token = nextToken; } };
}

describe('A2 Desk section reconciliation', () => {
  it('boots after the real A2 cP initialization', () => {
    const boot = desk.indexOf("cP=/^[BCDEG]$/.test(pp || '')?pp:'C';");
    expect(boot).toBeGreaterThan(0);
    expect(desk.indexOf('_reconcileRosterSection().catch(')).toBeGreaterThan(boot);
  });

  it.each(['C', 'PeriodC', 'D', 'PeriodD', 'G', 'PeriodG'])('finds a moved student in %s', async section => {
    const h = harness({ who: { ...student, username: 'MANGO_FOX' }, rosters: { [section]: [student] }, period: 'B' });
    expect(await h.fn()).toBe(section.slice(-1));
    expect(h.client.updateSection).toHaveBeenCalledWith(section.slice(-1));
    expect(h.setP).toHaveBeenCalledWith(section.slice(-1));
    expect(h.fetch).toHaveBeenCalledWith(section, { fresh: true });
  });

  it.each(['C', 'PeriodC'])('preserves an equivalent cached section %s', async section => {
    const h = harness({ who: { ...student, section }, rosters: { PeriodC: [student] } });
    expect(await h.fn()).toBeNull();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
  });

  it('repairs the calendar even when the cached section already matches', async () => {
    const h = harness({ who: { ...student, section: 'PeriodG' }, rosters: { G: [student] } });
    await h.fn();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).toHaveBeenCalledWith('G');
  });

  it('updates the session without repainting an already correct calendar', async () => {
    const h = harness({ rosters: { C: [student] } });
    expect(await h.fn()).toBe('C');
    expect(h.setP).not.toHaveBeenCalled();
  });

  it.each([null, { ...student, role: 'teacher' }])('leaves signed-out and teacher sessions alone', async who => {
    const h = harness({ who });
    expect(await h.fn()).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
    expect(h.client.current()).toEqual(who);
  });

  it.each(['student', 'teacher'])('skips a %s session with view-as context even without the read-only flag', async role => {
    const who = { ...student, role };
    const h = harness({ who, viewAs: { studentId: 'viewed-student', readOnly: true }, rosters: { G: [student] } });
    expect(await h.fn()).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
    expect(h.client.current()).toEqual(who);
  });

  it('leaves read-only views alone', async () => {
    const h = harness(); h.window.__WS_READ_ONLY__ = true;
    expect(await h.fn()).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([{}, { C: [student], G: [student] }])('ignores misses and ambiguous rows', async rosters => {
    const h = harness({ rosters });
    expect(await h.fn()).toBeNull();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
  });

  it('fails silently offline', async () => {
    const h = harness({ fetchRoster: async () => { throw new Error('offline'); } });
    expect(await h.fn()).toBeNull();
    expect(h.setP).not.toHaveBeenCalled();
  });

  it.each(['switch', 'signout', 'credentials', 'profile'])('discards pending results after %s', async action => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = harness({ fetchRoster: async section => { await pending; return section === 'G' ? [student] : []; } });
    const result = h.fn();
    if (action === 'switch') h.switchTo({ ...student, studentId: 'other', username: 'other' });
    if (action === 'signout') h.switchTo(null);
    if (action === 'credentials') h.switchTo({ ...student });
    if (action === 'profile') h.window._a2SectionChangeVersion = 1;
    release();
    expect(await result).toBeNull();
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
  });
});

describe('Desk roadmap calendar ownership', () => {
  const start = desk.indexOf('function _mergeRegistryData(');
  const end = desk.indexOf('async function loadRegistry(', start);
  const merge = desk.slice(start, end);

  it.each(['', 'loaded-pacing'])('uses the roadmap until A2 pacing owns the calendar (%s)', signature => {
    const existing = [[2026, 8, 3, { t: '1.1' }]];
    const fresh = {
      lessons: { '1.1': { title: 'Key Features of Functions' } },
      calendar: [{ date: '2026-08-18', B: '1.1', E: '1.1' }]
    };
    const apply = new Function('REGISTRY', 'S', 'cYear', '_a2PacingSignature', 'd', 'NC', 'fresh',
      merge + '\n_mergeRegistryData(fresh); return S;');
    const calendar = apply({ lessons: {} }, existing, 'SY26-27', signature,
      (topic, title, unit) => ({ t: topic, title, unit }), null, fresh);
    if (signature) {
      expect(calendar).toBe(existing);
    } else {
      expect(calendar).toEqual([[2026, 7, 18,
        { t: '1.1', title: 'Key Features of Functions', unit: 1 },
        { t: '1.1', title: 'Key Features of Functions', unit: 1 }]]);
    }
  });
});

describe('A2 profile section persistence', () => {
  function profileHarness() {
    let identity = { ...student };
    let release;
    const request = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const client = { current: () => identity, token: () => identity?.studentId,
      updateSection: vi.fn(section => { identity = { ...identity, section }; }) };
    const close = vi.fn(), changed = vi.fn(), setP = vi.fn();
    const elements = { 'a2-profile-form': {}, 'a2-profile-message': {}, 'a2-profile': { close } };
    const document = { getElementById: id => elements[id] };
    const window = {};
    const start = profile.indexOf("  document.getElementById('a2-profile-form').onsubmit");
    const end = profile.indexOf("  ['focus'", start);
    new Function('window', 'document', 'rosterClient', 'A2Client', 'readonly', 'setP', profile.slice(start, end))(
      window, document, client, { request, changed }, () => false, setP);
    return { client, window, close, changed, setP, request,
      submit: () => elements['a2-profile-form'].onsubmit({ preventDefault() {}, target: { querySelector: () => ({ value: 'G' }) } }),
      release: () => release({ ok: true }), switchUser: () => { identity = { ...student, studentId: 'other' }; } };
  }
  it('uses the shared section writer and updates the calendar after PUT', async () => {
    const h = profileHarness(); const result = h.submit();
    expect(h.window._a2SectionChangeVersion).toBe(1);
    expect(h.request).toHaveBeenCalledWith('/student/section', { section: 'G' }, 'PUT');
    h.release(); await result;
    expect(h.client.updateSection).toHaveBeenCalledWith('G');
    expect(h.setP).toHaveBeenCalledWith('G');
    expect(h.changed).toHaveBeenCalledOnce();
  });
  it('does not apply a pending profile response to another student', async () => {
    const h = profileHarness(); const result = h.submit();
    h.switchUser(); h.release(); await result;
    expect(h.client.updateSection).not.toHaveBeenCalled();
    expect(h.setP).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
  });
});
