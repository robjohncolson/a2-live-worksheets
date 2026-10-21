// POLISH3 routes through the real createApp stack: the phone routes
// (GET /class-log/schedule, POST /class-log/health) are mounted before the
// app-wide 8 MB JSON parser, so auth answers first and parser errors stay short;
// the teacher routes sit behind the password gate and refuse the phone bearer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';

const TOKEN = 'class-log-app-token-0123456789abcdef';
let listener, base;

async function start() {
  const app = createApp({ getRoleByStudentId: async () => 'student' });
  listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  base = 'http://127.0.0.1:' + listener.address().port;
}
async function request(method, path, { text, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  return { status: response.status, text: await response.text() };
}
beforeEach(() => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('CORS_ORIGINS', ''); });
afterEach(async () => {
  if (listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); listener = null; }
  vi.unstubAllEnvs();
});

const junk = '{not json';
const big = JSON.stringify({ device: 's24', pad: 'x'.repeat(9 * 1024) });

describe('createApp: /class-log/health auth before parsing', () => {
  it('503 when CLASS_LOG_TOKEN is unset, whatever the body', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', '');
    await start();
    expect((await request('POST', '/class-log/health', { text: junk })).status).toBe(503);
    expect((await request('POST', '/class-log/health', { text: big })).status).toBe(503);
    expect((await request('GET', '/class-log/schedule?from=2026-10-21&to=2026-10-31')).status).toBe(503);
  });
  it('401 with no body without a valid token', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    expect(await request('POST', '/class-log/health', { text: junk })).toEqual({ status: 401, text: '' });
    expect(await request('POST', '/class-log/health', { text: big, headers: { Authorization: 'Bearer wrong' } })).toEqual({ status: 401, text: '' });
    expect(await request('GET', '/class-log/schedule?from=2026-10-21&to=2026-10-31')).toEqual({ status: 401, text: '' });
  });
  it('short JSON parser errors with a valid token: the 8 KB route parser wins over the global 8 MB one', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const headers = { Authorization: 'Bearer ' + TOKEN };
    expect(await request('POST', '/class-log/health', { text: junk, headers })).toEqual({ status: 400, text: JSON.stringify({ ok: false, error: 'bad_json' }) });
    expect(await request('POST', '/class-log/health', { text: big, headers })).toEqual({ status: 413, text: JSON.stringify({ ok: false, error: 'too_large' }) });
    expect((await request('GET', '/class-log/schedule?from=2026-10-21&to=2026-12-31', { headers })).status).toBe(400);
  });
  it('teacher routes refuse the class-log bearer', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const headers = { Authorization: 'Bearer ' + TOKEN };
    expect((await request('GET', '/teacher/health', { headers })).status).toBe(403);
    expect((await request('GET', '/teacher/cards?date=2026-10-21', { headers })).status).toBe(403);
    expect((await request('PUT', '/teacher/schedule-overrides', { text: JSON.stringify({ daysOff: ['2026-10-26'] }), headers })).status).toBe(403);
    expect((await request('DELETE', '/teacher/schedule-overrides?date=2026-10-26', { headers })).status).toBe(403);
  });
});

describe('createApp: teacher routes and the app-wide parser', () => {
  // Decision (README "Class Log schedule overrides"): like PUT /teacher/cards, the
  // teacher routes sit after the app-wide 8 MB parser because the password gate needs
  // the parsed body, so a malformed body is answered by that parser before
  // requireTeacher, with the sanitized app-level error, never a stack.
  it('unauthenticated malformed JSON gets 400 bad_json from the global parser, no stack', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    for (const path of ['/teacher/schedule-overrides', '/teacher/cards']) {
      expect(await request('PUT', path, { text: junk })).toEqual({ status: 400, text: JSON.stringify({ ok: false, error: 'bad_json' }) });
    }
  });
  it('a body over 8 MB gets 413 too_large, no stack', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const huge = JSON.stringify({ daysOff: [], pad: 'x'.repeat(8 * 1024 * 1024 + 10) });
    expect(await request('PUT', '/teacher/schedule-overrides', { text: huge })).toEqual({ status: 413, text: JSON.stringify({ ok: false, error: 'too_large' }) });
  });
  it('a well-formed body without teacher auth still gets 403', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    expect((await request('PUT', '/teacher/schedule-overrides', { text: JSON.stringify({ daysOff: ['2026-10-26'] }) })).status).toBe(403);
  });
});
