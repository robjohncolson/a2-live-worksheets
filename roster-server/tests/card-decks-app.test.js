// Card deck routes through the real createApp stack: the phone routes
// (GET /class-log/decks, POST /class-log/deck-results) are mounted before the
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
const big = JSON.stringify({ device: 's24', pad: 'x'.repeat(130 * 1024) });

describe('createApp: card deck routes', () => {
  it('503 when CLASS_LOG_TOKEN is unset, whatever the body', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', '');
    await start();
    expect((await request('GET', '/class-log/decks?date=2026-10-22')).status).toBe(503);
    expect((await request('POST', '/class-log/deck-results', { text: junk })).status).toBe(503);
    expect((await request('POST', '/class-log/deck-results', { text: big })).status).toBe(503);
  });
  it('401 with no body without a valid token', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    expect(await request('GET', '/class-log/decks?date=2026-10-22')).toEqual({ status: 401, text: '' });
    expect(await request('POST', '/class-log/deck-results', { text: junk })).toEqual({ status: 401, text: '' });
    expect(await request('POST', '/class-log/deck-results', { text: big, headers: { Authorization: 'Bearer wrong' } })).toEqual({ status: 401, text: '' });
  });
  it('short JSON parser errors with a valid token: the 128 KB route parser wins over the global one', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const headers = { Authorization: 'Bearer ' + TOKEN };
    expect(await request('POST', '/class-log/deck-results', { text: junk, headers })).toEqual({ status: 400, text: JSON.stringify({ ok: false, error: 'bad_json' }) });
    expect(await request('POST', '/class-log/deck-results', { text: big, headers })).toEqual({ status: 413, text: JSON.stringify({ ok: false, error: 'too_large' }) });
    expect((await request('GET', '/class-log/decks?date=2026-10-32', { headers })).status).toBe(400);
  });
  it('teacher routes refuse the class-log bearer', async () => {
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    await start();
    const headers = { Authorization: 'Bearer ' + TOKEN };
    expect((await request('GET', '/teacher/decks?date=2026-10-22', { headers })).status).toBe(403);
    expect((await request('PUT', '/teacher/decks', { text: JSON.stringify({ decks: [] }), headers })).status).toBe(403);
    expect((await request('DELETE', '/teacher/decks?cardId=11111111-1111-4111-8111-111111111111', { headers })).status).toBe(403);
    expect(await request('PUT', '/teacher/decks', { text: junk })).toEqual({ status: 400, text: JSON.stringify({ ok: false, error: 'bad_json' }) });
  });
});
