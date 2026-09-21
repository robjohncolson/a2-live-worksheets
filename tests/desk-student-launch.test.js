import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { Script } from 'node:vm';

const html = readFileSync('desk.html', 'utf8');
const client = readFileSync('roster-client.js', 'utf8');
const session = { studentId: 'fictional-1', username: 'peach_owl', token: 'test-token', role: 'student' };
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  return (html.slice(start - 6, start) === 'async ' ? 'async ' : '') + html.slice(start, html.indexOf('\n}', start) + 2);
}
function desk(fetch = vi.fn()) {
  const dom = new JSDOM(html, { url: 'https://desk.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = fetch;
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.eval(client);
  w.localStorage.setItem('a2_roster.v1', JSON.stringify(session));
  return w;
}
const response = (status, body) => new Response(JSON.stringify(body), { status });

describe('WI-B roster response contract', () => {
  it.each([
    { username: 'peach_owl', section: 'PeriodC', mustChangePassword: true, startingPassword: 'starter' },
    { username: 'peach_owl', section: 'PeriodD', mustChangePassword: false },
    { ambiguous: true }
  ])('surfaces duplicate-account details without replacing or persisting credentials: %j', async details => {
    const w = desk(vi.fn().mockResolvedValue(response(409, { ok: false, error: 'account-exists', ...details })));
    const before = w.localStorage.getItem('a2_roster.v1');
    const result = await w.rosterClient.claim({ realName: 'Fictional Person', pin: '1234' });
    expect(result).toMatchObject({ ok: false, code: 'account-exists', ...details });
    expect(w.localStorage.getItem('a2_roster.v1')).toBe(before);
    w.close();
  });

  it('observes later 403 writes, persists the gate, and leaves the response readable', async () => {
    const w = desk(vi.fn().mockResolvedValue(response(403, { ok: false, error: 'password change required' })));
    const required = vi.fn();
    w.addEventListener('a2:password-change-required', required);
    const result = await w.rosterClient.changePassword('new-secret');
    expect(result).toMatchObject({ error: 'password change required' });
    expect(required).toHaveBeenCalledOnce();
    expect(w.rosterClient.current().mustChangePassword).toBe(true);
    w.close();
  });

  it('ignores password errors from other services', async () => {
    const w = desk(vi.fn().mockResolvedValue(response(403, { error: 'password change required' })));
    await w.fetch('https://roster.test.evil.test/ledger/record');
    expect(w.rosterClient.current().mustChangePassword).toBe(false);
    w.close();
  });

  it('rejects short and case-insensitive starting passwords and clears the gate only after success', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { ok: true, ...session, mustChangePassword: true }))
      .mockResolvedValueOnce(response(400, { ok: false, error: 'Try again' }))
      .mockResolvedValueOnce(response(200, { ok: true, token: 'fresh-token' }));
    const w = desk(fetch);
    await w.rosterClient.signIn('peach_owl', 'CustomStarter');
    expect(await w.rosterClient.changePassword('short')).toMatchObject({ ok: false });
    expect(await w.rosterClient.changePassword('CUSTOMSTARTER')).toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await w.rosterClient.changePassword('new-secret')).toMatchObject({ ok: false });
    expect(w.rosterClient.current().mustChangePassword).toBe(true);
    expect(await w.rosterClient.changePassword('new-secret')).toMatchObject({ ok: true });
    expect(w.rosterClient.current().mustChangePassword).toBe(false);
    expect(w.rosterClient.token()).toBe('fresh-token');
    expect(w.localStorage.getItem('a2_roster.v1')).not.toMatch(/CustomStarter|new-secret/);
    w.close();
  });
});

describe('WI-B Desk surfaces', () => {
  it.each([
    { username: '<peach_owl>', startingPassword: '<starter>' },
    { username: 'peach_owl' },
    { ambiguous: true }
  ])('hands signup off with safe text and one prefilled sign-in action: %j', result => {
    const w = desk();
    w._switchToSignIn = vi.fn();
    w.eval(source('showAccountExists'));
    w.showAccountExists(result);
    const host = w.document.getElementById('signup-handoff');
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(host.querySelector('starter')).toBeNull();
    if (result.ambiguous) expect(host.textContent).toContain("Use 'Find my name on the class list' to sign in.");
    else if (result.startingPassword) expect(host.textContent).toContain('Your starting password is <starter>.');
    else expect(host.textContent).toContain('Ask your teacher to reset your password.');
    host.querySelector('button').click();
    expect(w._switchToSignIn).toHaveBeenCalledOnce();
    expect(w.document.getElementById('signin-username').value).toBe(result.username || '');
    expect(w.document.getElementById('signup-handoff')).toBeNull();
    expect(Array.from(w.document.querySelector('#signup-overlay .dialog-box').children).every(el => !el.hidden)).toBe(true);
    w.close();
  });

  it('blocks dismissal and background keyboard access until the forced password changes', () => {
    const w = desk();
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ ...session, mustChangePassword: true }));
    for (const name of ['a2BlockPasswordBackground', 'openPwChangeModal', 'closePwChangeModal']) w.eval(source(name));
    w.openPwChangeModal(true);
    expect(w.document.getElementById('pwchange-leftbtn').textContent).toBe('Sign Out');
    expect(w.document.getElementById('window-wrap').inert).toBe(true);
    w.closePwChangeModal();
    expect(w.document.getElementById('pwchange-overlay').style.display).toBe('flex');
    w.localStorage.setItem('a2_roster.v1', JSON.stringify(session));
    w.closePwChangeModal();
    expect(w.document.getElementById('pwchange-overlay').style.display).toBe('none');
    expect(w.document.getElementById('window-wrap').inert).toBe(false);
    w.close();
  });

  it('hides every grade surface and gates direct entry; teachers and the flag restore visibility', () => {
    const w = desk();
    w.showDialog = vi.fn();
    for (const name of ['a2GradesHidden', 'a2SchoologyNotice', 'a2UpdateGradeVisibility', 'openGradeHelp', 'openMyGradebook', 'openDayGrade', 'openGradeCheckin', 'exportSealedTranscript', 'printSealedSummary']) w.eval(source(name));
    w.a2UpdateGradeVisibility();
    for (const selector of ['[data-app="progress"]', '#menu-grade-help', '#donow-grades', '#donow-helper', '#grade-checkin-banner', '#my-gradebook-overlay', '#day-grade-overlay']) {
      expect(w.getComputedStyle(w.document.querySelector(selector)).display).toBe('none');
    }
    for (const name of ['openGradeHelp', 'openMyGradebook', 'openDayGrade', 'openGradeCheckin', 'exportSealedTranscript', 'printSealedSummary']) w[name]();
    expect(w.showDialog).toHaveBeenCalledTimes(6);
    expect(w.showDialog.mock.calls[0][1]).toBe('Your grade is in Schoology for now.');
    w.localStorage.removeItem('a2_roster.v1');
    expect(w.a2GradesHidden()).toBe(false);
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ ...session, role: 'teacher' }));
    w.a2UpdateGradeVisibility();
    expect(w.document.documentElement.classList.contains('a2-hide-grades')).toBe(false);
    w.localStorage.setItem('a2_roster.v1', JSON.stringify(session));
    w.A2_STUDENT_GRADES_VISIBLE = true;
    w.a2UpdateGradeVisibility();
    expect(w.document.documentElement.classList.contains('a2-hide-grades')).toBe(false);
    w.close();
  });

  it('removes exam art and countdown plumbing while counting remaining school days', () => {
    expect(html).not.toMatch(/\bAP\b|Days to Exam|Exam Day|examDate|EX_DT/);
    const w = desk();
    expect(w.document.querySelector('#desktop-icon img')).toBeNull();
    expect(w.document.querySelector('img[src="icon.svg"], link[href="icon.svg"]')).toBeNull();
    w.tdy = () => new Date(2026, 8, 20);
    w.S = [[2026, 8, 20, 'lesson'], [2026, 8, 21, 'lesson'], [2026, 8, 22, 'off'], [2027, 5, 1, 'lesson']];
    w.OFF = 'off'; w.PO = 'po'; w.MN = Array(12).fill('Month');
    w.eval(source('rCD'));
    w.rCD();
    expect(w.document.querySelector('#cd-school .num').textContent).toBe('2');
    w.close();
  });

  it('all inline scripts still parse', () => {
    const dom = new JSDOM(html);
    for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
      if (!script.type || script.type === 'text/javascript') expect(() => new Script(script.textContent)).not.toThrow();
    }
    dom.window.close();
  });
});


it('leaves global fetch untouched and expires only the matching roster session', async () => {
  const fetch = vi.fn().mockResolvedValue(response(401, { ok: false, error: 'session expired' }));
  const w = desk(fetch);
  try {
    expect(w.fetch).toBe(fetch);
    const expired = vi.fn();
    const required = vi.fn();
    w.addEventListener('a2:session-expired', expired);
    w.addEventListener('a2:password-change-required', required);
    expect(await w.rosterClient.changePassword('new-secret')).toMatchObject({ error: 'session expired' });
    expect(expired).toHaveBeenCalledOnce();
    expect(required).not.toHaveBeenCalled();
    expect(w.rosterClient.current()).toBeNull();
    expect(w.rosterClient.token()).toBeNull();
  } finally { w.close(); }
});

it('forces the Desk dialog when a required session is restored on load', () => {
  const w = desk();
  try {
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ ...session, mustChangePassword: true }));
    w.openPwChangeModal = vi.fn();
    w.eval(source('maybeForcePasswordChange'));
    expect(w.maybeForcePasswordChange()).toBe(true);
    expect(w.openPwChangeModal).toHaveBeenCalledOnce();
    expect(html).toContain('maybeForcePasswordChange(); // TR2');
  } finally { w.close(); }
});
