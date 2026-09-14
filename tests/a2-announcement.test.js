// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PHASE3_CONFIG } from '../roster-server/grade-config.js';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
let dom, win, doc;
const current = { text: 'Bring your packet.', weekOf: '2026-09-07', updatedAt: '2026-09-13T12:00:00Z' };
beforeEach(() => {
  dom = new JSDOM('<span data-a2-announcement hidden></span><main></main>', { url: 'https://desk.test', runScripts: 'outside-only' });
  win = dom.window; doc = win.document;
  const DateClass = win.Date;
  win.Date = class extends DateClass { constructor(...args) { super(...(args.length ? args : ['2026-09-14T03:59:59Z'])); } };
  win.GradeEngine = { PHASE3_CONFIG };
  win.ROSTER_SERVICE_URL = 'https://roster.test';
  win.fetch = vi.fn(async () => ({ ok: true, json: async () => current }));
});
afterEach(() => dom.window.close());
async function boot() { win.eval(read('a2-announcement.js')); await win.A2Announcement.refresh(); }
const chip = () => doc.querySelector('[data-a2-announcement]');

it('renders the public chip as plain text and caches its week', async () => {
  await boot();
  expect(chip().hidden).toBe(false); expect(chip().textContent).toBe('This week · Bring your packet.');
  expect(JSON.parse(win.localStorage.getItem('a2_announcement'))).toEqual(current);
  expect(win.fetch).toHaveBeenCalledWith('https://roster.test/announcement', { cache: 'no-store' });
});
it('hides and clears cached text when GET returns null', async () => {
  win.localStorage.setItem('a2_announcement', JSON.stringify(current));
  win.fetch.mockResolvedValue({ ok: true, json: async () => ({ text: null }) });
  await boot(); expect(chip().hidden).toBe(true); expect(chip().textContent).toBe('');
  expect(win.localStorage.getItem('a2_announcement')).toBeNull();
});
it('hides on online fetch errors even with a current cached note', async () => {
  win.localStorage.setItem('a2_announcement', JSON.stringify(current));
  win.fetch.mockRejectedValue(new Error('network'));
  await boot(); expect(chip().hidden).toBe(true);
});
it.each(['2026-08-31', '2026-09-14', undefined])('never displays an offline cache from another/missing week %j', async weekOf => {
  Object.defineProperty(win.navigator, 'onLine', { value: false });
  win.localStorage.setItem('a2_announcement', JSON.stringify({ ...current, weekOf }));
  await boot(); expect(chip().hidden).toBe(true); expect(win.fetch).not.toHaveBeenCalled();
});
it('displays current-week cache offline and expires it on Monday in school tz', async () => {
  Object.defineProperty(win.navigator, 'onLine', { value: false });
  win.localStorage.setItem('a2_announcement', JSON.stringify(current));
  await boot(); expect(chip().hidden).toBe(false);
  const DateClass = win.Date;
  win.Date = class extends DateClass { constructor(...args) { super(...(args.length ? args : ['2026-09-14T04:00:00Z'])); } };
  await win.A2Announcement.refresh(); expect(chip().hidden).toBe(true);
});
it('reads the configured timezone and handles a year boundary', async () => {
  await boot();
  expect(win.A2Announcement.monday(new Date('2027-01-04T04:59:59Z'))).toBe('2026-12-28');
  expect(win.A2Announcement.monday(new Date('2027-01-04T05:00:00Z'))).toBe('2027-01-04');
  win.GradeEngine = { PHASE3_CONFIG: { schoolTz: 'Pacific/Honolulu' } };
  expect(win.A2Announcement.monday(new Date('2027-01-04T05:00:00Z'))).toBe('2026-12-28');
});
it('shows the editor hint, live counter and sends only text/weekOf for either Monday', async () => {
  await boot(); win.eval(read('a2-client.js'));
  win.rosterClient = { token: () => 'teacher-token' };
  const form = win.A2Announcement.mountEditor(doc.querySelector('main'), (path, body, method) => win.A2Client.request(path, body, method, 'teacher-key'));
  expect(form.textContent).toContain('This week (students see this)');
  expect(form.textContent).toContain('Student-facing info only — no staff names, no PD, no private data.');
  const input = form.querySelector('textarea'); input.value = 'Quiz Friday'; input.dispatchEvent(new win.Event('input'));
  expect(form.querySelector('output').textContent).toBe('11/280'); expect(input.maxLength).toBe(280);
  await form.onsubmit({ preventDefault() {} });
  let call = win.fetch.mock.calls.find(call => call[1].method === 'PUT');
  expect(call[0]).toBe('https://roster.test/teacher/announcement');
  expect(JSON.parse(call[1].body)).toEqual({ text: 'Quiz Friday', weekOf: '2026-09-07' });
  expect(call[1].headers).toMatchObject({ Authorization: 'Bearer teacher-token', 'x-teacher-secret': 'teacher-key' });
  win.fetch.mockClear();
  const select = form.querySelector('select'); select.value = 'next'; select.dispatchEvent(new win.Event('change'));
  input.value = 'Bring a pencil';
  await form.onsubmit({ preventDefault() {} });
  call = win.fetch.mock.calls.find(call => call[1].method === 'PUT');
  expect(JSON.parse(call[1].body)).toEqual({ text: 'Bring a pencil', weekOf: '2026-09-14' });
});
it('keeps editor errors visible and allows a blank save to delete', async () => {
  await boot();
  const request = vi.fn().mockRejectedValue(new Error('Email addresses are not allowed'));
  const form = win.A2Announcement.mountEditor(doc.querySelector('main'), request);
  form.querySelector('textarea').value = '';
  await form.onsubmit({ preventDefault() {} });
  expect(request).toHaveBeenCalledWith('/teacher/announcement', { text: '', weekOf: '2026-09-07' }, 'PUT');
  expect(form.querySelector('[role=status]').textContent).toContain('Email addresses are not allowed');
  expect(form.querySelector('button').disabled).toBe(false);
});
it('wires the Desk Do Now chip and the actual Pacing page to the shared UI', async () => {
  const desk = new JSDOM(read('desk.html'));
  expect(desk.window.document.querySelector('#donow-card [data-a2-announcement]')).not.toBeNull();
  desk.window.close(); dom.window.close();
  dom = new JSDOM(read('teacher-tryits.html'), { url: 'https://desk.test/teacher-tryits.html?mode=pacing', runScripts: 'outside-only' });
  win = dom.window; doc = win.document;
  win.A2Client = { request: vi.fn(async () => ({ lessons: [] })) };
  win.A2Announcement = { mountEditor: vi.fn() };
  win.eval([...doc.scripts].find(script => script.textContent.includes('async function pacing()')).textContent);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(win.A2Announcement.mountEditor).toHaveBeenCalledWith(doc.getElementById('grid'), expect.any(Function));
  expect(doc.querySelector('[data-a2-announcement]')).not.toBeNull();
  for (const source of ['grade-engine.bundle.js', 'a2-announcement.js']) expect(doc.querySelector('script[src="' + source + '"]')).not.toBeNull();
});
