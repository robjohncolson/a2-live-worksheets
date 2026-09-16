// @vitest-environment node
// Retained academic submission assets and native A2 signup; no nearby transport.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HOME = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-home.html'), 'utf8');
const sections = ['C', 'D', 'G'].map(section => ({ value: section, label: 'Section ' + section }));
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });

function signup({ claim = vi.fn().mockResolvedValue({ ok: true }), openSections = sections } = {}) {
  const dom = new JSDOM('<div id="nf-content"></div>', { url: 'https://a2.example.test/mobile-home.html', runScripts: 'outside-only' });
  const w = dom.window;
  windows.push(w);
  w.rosterClient = {
    claim,
    openSections: vi.fn().mockResolvedValue(openSections),
    current: () => ({ studentId: 'a2-c', username: 'mango_fox', section: 'C' }),
  };
  w.LedgerStore = { pull: vi.fn().mockResolvedValue({}) };
  w.loadGrade = vi.fn();
  w.refreshIdentity = vi.fn();
  w.closeNameFinder = vi.fn();
  w._fcSyncPull = vi.fn();
  w.svcUrl = () => 'https://api.test';
  w.dlHide = vi.fn();
  w.setTimeout = vi.fn();
  const escape = HOME.slice(HOME.indexOf('  function _nfEsc('), HOME.indexOf('  function _nfFriendly('));
  const source = HOME.slice(HOME.indexOf('  var _SU_FRUITS'), HOME.indexOf('  function _nfKeydown('));
  w.eval('var _nfState;\n' + escape + source);
  w._nfCreate();
  return w;
}

async function flush() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

function fill(window, pin = '1234') {
  window.document.getElementById('nf-su-name').value = '  Jordan Lee  ';
  window.document.getElementById('nf-su-pin').value = pin;
}

describe('mobile academic submission assets', () => {
  it('loads the retained signing and durable submission scripts', () => {
    for (const script of ['receipt-sign.js', 'secure-key.js', 'student-key.js', 'submission-store.js', 'submission-capture.js']) {
      expect(HOME).toContain(`src="${script}"`);
    }
  });
});

describe('mobile native A2 self-signup', () => {
  it.each(['C', 'D', 'G'])('claims the selected section %s and refreshes academic data', async section => {
    const w = signup();
    await flush();
    expect(w.document.getElementById('nf-content').textContent).toContain('Create your account');
    const picker = w.document.getElementById('nf-su-period');
    expect([...picker.options].map(option => option.value)).toEqual(['C', 'D', 'G']);
    picker.value = section;
    picker.dispatchEvent(new w.Event('change'));
    const candidate = w.document.getElementById('nf-su-user').textContent;
    expect(candidate).toMatch(/^[a-z]+_[a-z]+$/);
    fill(w);
    w._nfSubmitSignup();
    await flush();
    expect(w.rosterClient.claim).toHaveBeenCalledTimes(1);
    expect(w.rosterClient.claim).toHaveBeenCalledWith({ realName: 'Jordan Lee', section, username: candidate, pin: '1234' });
    expect(w.localStorage.getItem('a2_desk_student_email')).toBe('mango_fox');
    expect(w.LedgerStore.pull).toHaveBeenCalledWith(w.rosterClient, { serverUrl: 'https://api.test' });
    expect(w.loadGrade).toHaveBeenCalledTimes(1);
    expect(w.refreshIdentity).toHaveBeenCalledTimes(1);
    expect(w.closeNameFinder).toHaveBeenCalledTimes(1);
    expect(w.document.getElementById('nf-su-ok').disabled).toBe(false);
  });

  it('renders a single open section as a label', async () => {
    const w = signup({ openSections: [sections[1]] });
    await flush();
    expect(w.document.getElementById('nf-su-period')).toBeNull();
    expect(w.document.getElementById('nf-su-period-row').textContent).toContain('Section D');
    fill(w);
    w._nfSubmitSignup();
    await flush();
    expect(w.rosterClient.claim.mock.calls[0][0].section).toBe('D');
  });

  it('retries a collision and then follows the normal signed-in flow', async () => {
    const claim = vi.fn().mockResolvedValueOnce({ ok: false, code: 'username-taken' }).mockResolvedValue({ ok: true });
    const w = signup({ claim });
    await flush();
    fill(w);
    w._nfSubmitSignup();
    await flush();
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls[1][0].username).toMatch(/^[a-z]+_[a-z]+$/);
    expect(w.loadGrade).toHaveBeenCalledTimes(1);
  });

  it('bounds collision retries and leaves the form usable without signing in', async () => {
    const claim = vi.fn().mockResolvedValue({ ok: false, code: 'username-taken', error: 'username-taken' });
    const w = signup({ claim });
    await flush();
    fill(w);
    w._nfSubmitSignup();
    await flush();
    expect(claim).toHaveBeenCalledTimes(6);
    expect(w.document.getElementById('nf-su-error').textContent).toContain('username-taken');
    expect(w.document.getElementById('nf-su-ok').disabled).toBe(false);
    expect(w.localStorage.getItem('a2_desk_student_email')).toBeNull();
    expect(w.LedgerStore.pull).not.toHaveBeenCalled();
    expect(w.loadGrade).not.toHaveBeenCalled();
  });

  it('rejects invalid PINs before claiming', async () => {
    const w = signup();
    await flush();
    fill(w, '123');
    w._nfSubmitSignup();
    expect(w.rosterClient.claim).not.toHaveBeenCalled();
    expect(w.document.getElementById('nf-su-error').textContent).toContain('4 digits');
  });

  it('reports network failure without pulling a ledger or refreshing grades', async () => {
    const w = signup({ claim: vi.fn().mockRejectedValue(new Error('offline')) });
    await flush();
    fill(w);
    w._nfSubmitSignup();
    await flush();
    expect(w.document.getElementById('nf-su-error').textContent).toBe('offline');
    expect(w.document.getElementById('nf-su-ok').disabled).toBe(false);
    expect(w.LedgerStore.pull).not.toHaveBeenCalled();
    expect(w.loadGrade).not.toHaveBeenCalled();
  });
});
