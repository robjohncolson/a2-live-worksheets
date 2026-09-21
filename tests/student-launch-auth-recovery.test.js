import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = path => readFileSync(path, 'utf8');
const session = { studentId: 'fictional-1', username: 'peach_owl', token: 'old-token', role: 'student' };
const work = { source: 'worksheet', itemId: 'WS-test-1', response: 'saved answer', score: 1 };
const response = (status, error) => new Response(JSON.stringify({ ok: false, error }), { status });

function setup(page) {
  const html = read(page + '.html');
  const w = new JSDOM(html, { url: 'https://desk.test', runScripts: 'outside-only' }).window;
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.eval(read('roster-client.js'));
  w.localStorage.setItem('a2_roster.v1', JSON.stringify(session));
  w.eval(read('offline-queue.js'));
  w.eval(read('gradebook-client.js'));
  const indent = page === 'desk' ? '' : '  ';
  function load(name) {
    const start = html.indexOf(indent + 'function ' + name + '(');
    w.eval(html.slice(start, html.indexOf('\n' + indent + '}', start) + indent.length + 2));
  }
  if (page === 'desk') {
    w.getStudentEmail = () => '';
    for (const name of ['a2BlockPasswordBackground', 'openPwChangeModal', 'closePwChangeModal', 'openSignInModal']) load(name);
    const start = html.indexOf("window.addEventListener('a2:password-change-required'");
    w.eval(html.slice(start, html.indexOf('\n\n', start)));
  } else {
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    load('openMobilePasswordChange');
    load('refreshIdentity');
    load('openNameFinder');
    load('_nfEnsureOverlay');
    w._fetchPeriodRoster = async () => [{ username: 'peach_owl' }];
    w._nfRenderDial = vi.fn();
    w._nfKeydown = vi.fn();
    w.document.getElementById('signin-btn').onclick = () => w.openNameFinder();
    const start = html.indexOf("  window.addEventListener('a2:password-change-required'");
    w.eval(html.slice(start, html.indexOf("  window.addEventListener('storage'", start)));
  }
  return w;
}

describe.each(['desk', 'mobile-home'])('%s work authentication recovery', page => {
  it.each([401, 403])('routes a real %s work rejection to sign-in/password dialog and preserves work', async status => {
    const w = setup(page);
    try {
      w.fetch = vi.fn(async () => response(status, status === 401 ? 'session expired' : 'password change required'));
      expect(await w.gradebookClient.record(work)).toMatchObject({ ok: false, reason: 'auth', queued: true });
      expect(w.fetch.mock.calls[0][0]).toBe('https://roster.test/ledger/record');
      expect(await w.OfflineQueue.all()).toMatchObject([{ ...work, studentId: session.studentId }]);
      if (status === 401) {
        expect(w.rosterClient.current()).toBeNull();
        const overlay = page === 'desk' ? 'signin-overlay' : 'namefinder-overlay';
        expect(w.document.getElementById(overlay).style.display).toBe(page === 'desk' ? 'block' : 'flex');
      } else {
        expect(w.rosterClient.current().mustChangePassword).toBe(true);
        if (page === 'desk') expect(w.document.getElementById('pwchange-overlay').style.display).toBe('flex');
        else expect(w.document.getElementById('mobile-password-change').open).toBe(true);
      }
    } finally { w.close(); }
  });

  it.each([401, 403])('also handles %s during queue replay without deleting work', async status => {
    const w = setup(page);
    try {
      await w.OfflineQueue.enqueue({ ...work, studentId: session.studentId });
      w.fetch = vi.fn(async () => response(status, status === 401 ? 'session expired' : 'password change required'));
      const result = await w.gradebookClient.syncOfflineQueue();
      expect(result.sent).toBe(0);
      expect(await w.OfflineQueue.all()).toHaveLength(1);
      if (status === 401) expect(w.rosterClient.current()).toBeNull();
      else expect(w.rosterClient.current().mustChangePassword).toBe(true);
    } finally { w.close(); }
  });

  it.each(['sign-in', 'password change'])('drains retained work after a fresh same-tab %s', async action => {
    const w = setup(page);
    try {
      w.fetch = vi.fn(async () => action === 'sign-in'
        ? response(401, 'session expired') : response(403, 'password change required'));
      await w.gradebookClient.record(work);
      w.fetch = vi.fn(async (url, options) => {
        if (url.endsWith('/roster/verify') || url.endsWith('/roster/change-password')) {
          return new Response(JSON.stringify({ ok: true, ...session, token: 'fresh-token' }));
        }
        expect(JSON.parse(options.body).token).toBe('fresh-token');
        return new Response(JSON.stringify({ ok: true, ledgerId: 'saved' }));
      });
      if (action === 'sign-in') await w.rosterClient.signIn('peach_owl', 'fictional-password');
      else await w.rosterClient.changePassword('fictional-password');
      await vi.waitFor(async () => expect(await w.OfflineQueue.all()).toHaveLength(0));
      expect(w.fetch.mock.calls.some(([url]) => url.endsWith('/ledger/record'))).toBe(true);
    } finally { w.close(); }
  });

  it('ignores an old in-flight rejection after another token is stored', async () => {
    const w = setup(page);
    try {
      let finish;
      w.fetch = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const pending = w.gradebookClient.record(work);
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      w.localStorage.setItem('a2_roster.v1', JSON.stringify({ ...session, token: 'new-token' }));
      finish(response(401, 'session expired'));
      await pending;
      expect(w.rosterClient.token()).toBe('new-token');
      expect(await w.OfflineQueue.all()).toMatchObject([{ studentId: session.studentId }]);
    } finally { w.close(); }
  });
});
