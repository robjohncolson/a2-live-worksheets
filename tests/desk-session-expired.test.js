// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
// Like desk-view-as.test.js, execute the real functions with unrelated services stubbed.
function fn(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  let depth = 0;
  for (let i = html.indexOf('{', match.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced function: ' + name);
}
function boot(fetchMock, viewAs = false) {
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    url: 'https://desk.test/', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.localStorage.setItem('a2_roster.v1', JSON.stringify({ token: 'expired', studentId: 'owner' }));
  for (const key of ['a2_desk_marks:owner', 'a2_desk_latch:owner', 'a2_grade_cache_v1:owner']) {
    w.localStorage.setItem(key, JSON.stringify({ completed: ['1.1'], grade: 88 }));
  }
  w.rosterClient = {
    token: () => JSON.parse(w.localStorage.getItem('a2_roster.v1')).token,
    current: () => ({ username: 'owner', studentId: 'owner' }),
    signIn: vi.fn(async () => {
      w.localStorage.setItem('a2_roster.v1', JSON.stringify({ token: 'renewed', studentId: 'owner' }));
      return { ok: true };
    })
  };
  Object.assign(w, {
    fetch: fetchMock, _expiredSignInShown: false, _gradeLoadState: 'loading', _gradeLoadError: null,
    _gradeLastRenderedState: 'loading', _gradeQuartersCache: null, _signinWallActive: false,
    _coachPanelOpen: () => false, _phase2ReDeriveGrade: async () => null, _loadGradeCache: () => null,
    _viewAsContext: () => viewAs ? { studentId: 'other' } : null,
    _deskAccessGranted: () => true, getStudentEmail: () => 'owner',
    registerStudent() {}, updateStudentMenu() {}, showDialog() {}, closeNameFinder() {},
    MacSFX: { play() {} }, gradebookClient: { syncOfflineQueue: vi.fn(async () => ({ sent: 1, failed: 0, remaining: 0 })) }
  });
  for (const name of ['renderDoNowGrades', 'openSignInModal', 'closeSignInModal', 'submitSignIn', '_nfSubmitPassword']) w.eval(fn(name));
  return w;
}
const response = status => vi.fn(async () => ({ ok: false, status }));
const snapshot = w => Object.fromEntries(Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)]));

describe('Desk rejected stored session', () => {
  it.each([401, 403])('live %s opens a dismissible modal once without changing saved evidence', async status => {
    const w = boot(response(status));
    try {
      const before = snapshot(w);
      await w.renderDoNowGrades('https://roster.test', 'expired');
      expect(w.fetch.mock.calls[0][0]).toContain('/grade?token=expired');
      expect(w.document.getElementById('signin-overlay').style.display).toBe('block');
      expect(w.document.getElementById('signin-error').textContent).toBe('Your sign-in expired — sign in again. Your work on this device is saved and will sync.');
      expect(snapshot(w)).toEqual(before);
      w.closeSignInModal();
      await w.renderDoNowGrades('https://roster.test', 'expired');
      expect(w.document.getElementById('signin-overlay').style.display).toBe('none');
      expect(snapshot(w)).toEqual(before);
    } finally { w.close(); }
  });
  it.each(['throw', '503', 'malformed', 'null'])('%s does not open a sign-in modal', async kind => {
    const fetchMock = vi.fn(async () => {
      if (kind === 'throw') throw new Error('unreachable');
      if (kind === 'null') return null;
      return kind === '503' ? {ok:false,status:503} : {ok:true,status:200,json:async()=>{throw Error('bad JSON');}};
    });
    const w = boot(fetchMock);
    try {
      const before=snapshot(w); await w.renderDoNowGrades('https://roster.test', 'expired');
      expect(w.document.getElementById('signin-overlay').style.display).toBe('none'); expect(snapshot(w)).toEqual(before);
    } finally {w.close();}
  });
  it.each(['context', 'flag'])('view-as %s does not prompt', async mode => {
    const w=boot(response(401),mode==='context');
    if(mode==='flag')w.__VIEW_AS_STUDENT_ID__='other';
    try {await w.renderDoNowGrades('https://roster.test','expired');expect(w.document.getElementById('signin-overlay').style.display).toBe('none');}
    finally {w.close();}
  });
  it('an old-token response cannot interrupt a newly signed-in session or erase typed credentials', async () => {
    const w=boot(response(401));
    try {
      await w.renderDoNowGrades('https://roster.test','previous-token');
      expect(w.document.getElementById('signin-overlay').style.display).toBe('none');
      w.openSignInModal(); w.document.getElementById('signin-password').value='typing';
      await w.renderDoNowGrades('https://roster.test','expired');
      expect(w.document.getElementById('signin-password').value).toBe('typing');
    } finally {w.close();}
  });
  it.each(['submitSignIn', '_nfSubmitPassword'])('%s replays the queue after storing the new session', async name => {
    const w=boot(response(401));
    try {
      w.document.getElementById('signin-username').value='owner';
      w.document.getElementById('signin-password').value='password';
      w._nfPicked={username:'owner'};
      const input=w.document.createElement('input');input.id='nf-pw';input.value='password';w.document.body.appendChild(input);
      w.gradebookClient.syncOfflineQueue.mockImplementation(async () => {expect(w.rosterClient.token()).toBe('renewed');throw Error('transient replay failure');});
      await w[name]();
      expect(w.gradebookClient.syncOfflineQueue).toHaveBeenCalledTimes(1);
    } finally {w.close();}
  });
});
