// The summary routes through the real createApp stack: the phone route is mounted
// before the app-wide 8 MB JSON parser, so auth answers first and parser errors
// stay short; the teacher route sits behind the password gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';

const TOKEN = 'class-log-app-token-0123456789abcdef';
let listener, base;

async function start() {
  const app = createApp({ getRoleByStudentId: async () => 'student' });
  listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  base = 'http://127.0.0.1:' + listener.address().port;
}
async function post(text, headers = {}) {
  const response = await fetch(base + '/class-log/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  return { status: response.status, text: await response.text() };
}
beforeEach(() => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('CORS_ORIGINS', ''); });
afterEach(async () => {
  if (listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); listener = null; }
  vi.unstubAllEnvs();
});

const junk = '{not json';
const big = JSON.stringify({ date: '2026-10-21', course: 'algebra2', section: 'C', markdown: 'x'.repeat(1.1 * 1024 * 1024) });

describe('createApp: /class-log/summaries auth before parsing', () => {
  it('503 when CLASS_LOG_TOKEN is unset, whatever the body', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', '');
    await start();
    expect((await post(junk)).status).toBe(503);
    expect((await post(big)).status).toBe(503);
  });
  it('401 with no body for junk/oversize without a valid token', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    expect(await post(junk)).toEqual({ status: 401, text: '' });
    expect(await post(big, { Authorization: 'Bearer wrong' })).toEqual({ status: 401, text: '' });
  });
  it('short JSON parser errors with a valid token, no stack', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const headers = { Authorization: 'Bearer ' + TOKEN };
    expect(await post(junk, headers)).toEqual({ status: 400, text: JSON.stringify({ ok: false, error: 'bad_json' }) });
    expect(await post(big, headers)).toEqual({ status: 413, text: JSON.stringify({ ok: false, error: 'too_large' }) });
  });
  it('GET /teacher/summaries refuses the class-log bearer', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const response = await fetch(base + '/teacher/summaries?from=2026-10-01&to=2026-10-31', { headers: { Authorization: 'Bearer ' + TOKEN } });
    expect(response.status).toBe(403);
  });
});
