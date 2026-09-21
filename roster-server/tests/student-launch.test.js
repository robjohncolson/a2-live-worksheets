import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../server.js';
import { createDb } from '../db.js';
import { namesMatch } from '../names-match.js';
import { STARTING_PASSWORD } from '../starting-password.js';
import { signToken } from '../token.js';
import { decryptPassword } from '../crypto.js';
import { resetPasswords } from '../../scripts/teacher-reset-passwords.mjs';

it('takes the starting password from the environment with the documented default', async () => {
  try {
    vi.stubEnv('ROSTER_STARTING_PASSWORD', '');
    vi.resetModules();
    expect((await import('../starting-password.js')).STARTING_PASSWORD).toBe('password');
    vi.stubEnv('ROSTER_STARTING_PASSWORD', 'classroom-test-start');
    vi.resetModules();
    expect((await import('../starting-password.js')).STARTING_PASSWORD).toBe('classroom-test-start');
  } finally {
    vi.unstubAllEnvs();
  }
});

describe('name matching (fictional examples)', () => {
  it.each([
    ["De'Andre Marsh", "Marsh, De'Andre", true],
    ['Lucia Fernandez', 'Fernandez Ortega, Lucia', true],
    ['Jos\u00e9 N\u00fa\u00f1ez', 'Nunez, Jose', true],
    ['Maria Torres', 'Torres Medina, Maria', true],
    ['Maria Torres', 'Tavares, Maria', false],
    ['Carlos Ramos', 'Ramos Ramos, Hector', false],
    ['Lucia Fernandes', 'Fernandez Ortega, Lucia', true],
    ['Lucia Fernadez', 'Fernandez Ortega, Lucia', true],
    ['Lucia Fernanddez', 'Fernandez Ortega, Lucia', true],
    ['L A nln', '', false],
    ['Anne-Marie Q Stone', 'Stone Anne Marie nln', true],
    ['Alex North Stone', 'Alex North River', false],
    ['Alex North Stone', 'North River Stone', true],
    ['Maria Torres', 'Mario Torres', true],
    ['Lena Torres', 'Lina Torres', false],
    ['Lucia Fernandez', 'Lucia Fxxnandez', false],
  ])('%s / %s => %s', (a, b, expected) => {
    expect(namesMatch(a, b)).toBe(expected);
    expect(namesMatch(b, a)).toBe(expected);
  });
});

describe('student launch HTTP contract', () => {
  let server, base, rows, db, token;
  const teacherHeaders = { 'x-teacher-secret': 'launch-test-secret' };
  const claim = { realName: 'Lucia Fernandez', section: 'PeriodC', username: 'pear_otter', pin: '1234' };
  async function request(path, body = {}, headers = {}, method = 'POST') {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  beforeEach(async () => {
    vi.stubEnv('ROSTER_TOKEN_SECRET', 'launch-test-token-secret');
    vi.stubEnv('ROSTER_TEACHER_SECRET', 'launch-test-secret');
    vi.stubEnv('ROSTER_PW_ENC_KEY', 'a'.repeat(64));
    vi.stubEnv('OPEN_SIGNUP_SECTIONS', 'PeriodC:C;PeriodD:D;PeriodG:G');
    rows = [{ student_id: 'student-1', real_name: 'Fernandez Ortega, Lucia',
      login_username: 'apple_otter', section: 'PeriodD', status: 'active', role: 'student',
      must_change_password: true, password_hash: await bcrypt.hash(STARTING_PASSWORD, 4) }];
    db = {
      listRoster: vi.fn(async section => ({ data: rows.filter(row => !section || row.section === section) })),
      findByStudentId: vi.fn(async id => ({ data: rows.find(row => row.student_id === id) })),
      findByUsername: vi.fn(async name => ({ data: rows.find(row => row.login_username === name) })),
      getRoleByStudentId: vi.fn(async id => rows.find(row => row.student_id === id)?.role || 'student'),
      getSpriteHueByStudentId: vi.fn(async () => null),
      insertRoster: vi.fn(async input => ({ data: { student_id: 'new-student', login_username: input.loginUsername } })),
      updatePassword: vi.fn(async input => {
        const row = rows.find(row => row.student_id === input.studentId);
        if (input.expectedPasswordHash !== undefined && row.password_hash !== input.expectedPasswordHash) return { data: null };
        Object.assign(row, { password_hash: input.passwordHash, password_cipher: input.passwordCipher,
          must_change_password: input.mustChangePassword ?? false });
        return { data: { student_id: row.student_id } };
      }),
    };
    const app = createApp(db);
    // A future feature write is covered without another route-specific guard.
    app.post('/future-work', (_req, res) => res.json({ ok: true }));
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    token = signToken('student-1', rows[0].password_hash);
  });
  afterEach(async () => {
    await new Promise(resolve => server.close(resolve));
    vi.unstubAllEnvs();
  });

  it('hands off across sections without inserting and only discloses the starting password while required', async () => {
    let result = await request('/roster/claim', claim);
    expect(result).toEqual({ status: 409, body: { ok: false, error: 'account-exists',
      username: 'apple_otter', section: 'PeriodD', mustChangePassword: true, startingPassword: STARTING_PASSWORD } });
    rows[0].must_change_password = false;
    result = await request('/roster/claim', claim);
    expect(result.body).not.toHaveProperty('startingPassword');
    expect(db.insertRoster).not.toHaveBeenCalled();
  });
  it('returns no identity for ties and chooses the most shared tokens otherwise', async () => {
    rows.push({ ...rows[0], student_id: 'student-2', login_username: 'plum_owl' });
    expect((await request('/roster/claim', claim)).body).toEqual({ ok: false, error: 'account-exists', ambiguous: true });
    rows[1].real_name = 'Lucia Fernandez Rivera';
    expect((await request('/roster/claim', { ...claim, realName: 'Lucia Fernandez Rivera' })).body.username).toBe('plum_owl');
  });
  it.each(['archived', 'closed'])('ignores %s accounts', async state => {
    if (state === 'archived') rows[0].status = state;
    else rows[0].section = 'Closed';
    expect((await request('/roster/claim', claim)).status).toBe(200);
  });
  it('fails closed when the duplicate lookup fails', async () => {
    db.listRoster.mockResolvedValue({ error: true });
    expect((await request('/roster/claim', claim)).status).toBe(500);
    expect(db.insertRoster).not.toHaveBeenCalled();
  });
  it('keeps rate limiting before duplicate lookup', async () => {
    // Each new app captures the configured limit.
    vi.stubEnv('SIGNUP_CLAIM_MAX', '1');
    await new Promise(resolve => server.close(resolve));
    server = http.createServer(createApp(db));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    expect((await request('/roster/claim', claim)).status).toBe(409);
    expect((await request('/roster/claim', claim)).status).toBe(429);
    expect(db.listRoster).toHaveBeenCalledTimes(1);
  });
  it('requires teacher auth and a nonempty reset selector', async () => {
    expect((await request('/roster/reset-passwords', { section: 'PeriodD' })).status).toBe(401);
    for (const body of [{}, { section: '' }, { studentIds: [] }, { studentIds: [''] }]) {
      expect((await request('/roster/reset-passwords', body, teacherHeaders)).status).toBe(400);
    }
  });
  it('resets only active students, storing hash/cipher and forcing a change', async () => {
    rows.push({ ...rows[0], student_id: 'teacher-1', role: 'teacher' },
      { ...rows[0], student_id: 'archived-1', status: 'archived' });
    rows[0].must_change_password = false;
    expect(await request('/roster/reset-passwords', { section: 'PeriodD' }, teacherHeaders))
      .toEqual({ status: 200, body: { ok: true, updated: 1 } });
    expect(await bcrypt.compare(STARTING_PASSWORD, rows[0].password_hash)).toBe(true);
    expect(decryptPassword(rows[0].password_cipher)).toBe(STARTING_PASSWORD);
    expect(rows[0].must_change_password).toBe(true);
    expect(db.updatePassword).toHaveBeenCalledTimes(1);
  });
  it('accepts teacher token auth and student IDs but always uses the starting password', async () => {
    rows.push({ ...rows[0], student_id: 'teacher-1', role: 'teacher', must_change_password: false });
    expect((await request('/roster/reset-passwords', { studentIds: ['student-1'], password: 'custom-reset' },
      { Authorization: `Bearer ${signToken('teacher-1', rows[0].password_hash)}` })).body.updated).toBe(1);
    expect(await bcrypt.compare(STARTING_PASSWORD, rows[0].password_hash)).toBe(true);
  });
  it.each([
    ['POST', '/ledger/record'], ['POST', '/ledger/frq-appeal'], ['POST', '/commits'],
    ['POST', '/roster/reroll'], ['PUT', '/flashcards/state'], ['POST', '/student-keys/register'],
    ['POST', '/student/worksheet-diagnostics'], ['POST', '/remediation/complete'],
    ['PUT', '/student/section'], ['POST', '/student/nudge'], ['POST', '/future-work'],
  ])('blocks %s %s before writes', async (method, path) => {
    expect(await request(path, { token }, {}, method)).toEqual({ status: 403,
      body: { ok: false, error: 'password change required' } });
  });
  it('checks Bearer and query tokens and cannot be bypassed by a second identity', async () => {
    expect((await request('/future-work', {}, { Authorization: `Bearer ${token}` })).status).toBe(403);
    expect((await request('/future-work', {}, { Authorization: token })).status).toBe(403);
    expect((await request('/future-work?token=' + encodeURIComponent(token))).status).toBe(403);
    rows.push({ ...rows[0], student_id: 'student-2', must_change_password: false });
    expect((await request('/future-work', { token }, { Authorization: `Bearer ${signToken('student-2', rows[0].password_hash)}` })).status).toBe(403);
  });
  it('keeps verify/resolve/reads open and unlocks writes after a password change', async () => {
    expect((await request('/health', {}, {}, 'GET')).status).toBe(200);
    expect((await request('/roster/resolve', { token })).status).toBe(200);
    expect((await request('/roster/verify', { username: 'apple_otter', password: STARTING_PASSWORD })).body.mustChangePassword).toBe(true);
    expect((await request('/roster/change-password', { token, newPassword: STARTING_PASSWORD.toUpperCase() })).status).toBe(400);
    expect((await request('/roster/change-password', { token, newPassword: 'abc' })).status).toBe(400);
    const changed = await request('/roster/change-password', { token, newPassword: 'new-secret-123' });
    expect(changed.status).toBe(200);
    expect((await request('/future-work', { token })).status).toBe(401);
    token = changed.body.token;
    expect(rows[0].must_change_password).toBe(false);
    expect((await request('/future-work', { token })).status).toBe(200);
    await request('/roster/reset-passwords', { studentIds: ['student-1'] }, teacherHeaders);
    expect((await request('/future-work', { token })).status).toBe(401);
    expect((await request('/roster/change-password', { token, newPassword: 'stolen-session' })).status).toBe(401);
    const fresh = await request('/roster/verify', { username: 'apple_otter', password: STARTING_PASSWORD });
    token = fresh.body.token;
    expect((await request('/future-work', { token })).status).toBe(403);
    const owner = await request('/roster/change-password', { token, newPassword: 'owner-secret' });
    expect(owner.status).toBe(200);
    expect((await request('/future-work', { token: owner.body.token })).status).toBe(200);
  });
  it.each(['reset', 'owner change'])('rejects an in-flight password change overtaken by %s', async action => {
    const hash = bcrypt.hash.bind(bcrypt);
    let resume;
    let entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { resume = resolve; });
    const spy = vi.spyOn(bcrypt, 'hash').mockImplementationOnce(async (...args) => {
      entered();
      await blocked;
      return hash(...args);
    });
    try {
      const stale = request('/roster/change-password', { token, newPassword: 'stale-password' });
      await waiting;
      const winner = action === 'reset'
        ? await request('/roster/reset-passwords', { studentIds: ['student-1'] }, teacherHeaders)
        : await request('/roster/change-password', { token, newPassword: 'owner-password' });
      expect(winner.status).toBe(200);
      const winningHash = rows[0].password_hash;
      resume();
      expect(await stale).toEqual({ status: 401, body: { ok: false, error: 'session expired' } });
      expect(rows[0].password_hash).toBe(winningHash);
      expect(rows[0].must_change_password).toBe(action === 'reset');
    } finally { resume(); spy.mockRestore(); }
  });
  it('rejects legacy tokens for writes and password changes while keeping reads open', async () => {
    const legacy = signToken('student-1');
    expect(await request('/future-work', { token: legacy })).toEqual({ status: 401,
      body: { ok: false, error: 'session expired' } });
    expect((await request('/roster/change-password', { token: legacy, newPassword: 'new-secret' })).status).toBe(401);
    expect(db.updatePassword).not.toHaveBeenCalled();
    expect((await request('/roster/resolve', { token: legacy })).status).toBe(200);
    const verified = await request('/roster/verify', { username: 'apple_otter', password: STARTING_PASSWORD });
    const payload = JSON.parse(Buffer.from(verified.body.token.split('.')[0], 'base64url').toString('utf8'));
    expect(payload.pwv).toBe(createHash('sha256').update(rows[0].password_hash).digest('hex').slice(0, 12));
  });
  it('fails closed on a password-status database error', async () => {
    db.findByStudentId.mockResolvedValue({ error: true });
    expect((await request('/future-work', { token })).status).toBe(503);
  });
});

it('selects password status and writes the reset flag through the real DB wrapper', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() };
  for (const method of ['select', 'eq', 'update']) query[method].mockReturnValue(query);
  const db = createDb({ from: () => query });
  await db.findByStudentId('student-1');
  expect(query.select.mock.calls[0][0]).toContain('must_change_password');
  expect(query.select.mock.calls[0][0]).toContain('password_hash');
  await db.updatePassword({ studentId: 'student-1', passwordHash: 'hash', passwordCipher: 'cipher', mustChangePassword: true });
  expect(query.update.mock.calls[0][0]).toEqual({ password_hash: 'hash', password_cipher: 'cipher', must_change_password: true });
  await db.updatePassword({ studentId: 'student-1', passwordHash: 'new-hash' });
  expect(query.update.mock.calls[1][0].must_change_password).toBe(false);
  await db.updatePassword({ studentId: 'student-1', passwordHash: 'next-hash', expectedPasswordHash: 'new-hash' });
  expect(query.eq).toHaveBeenCalledWith('password_hash', 'new-hash');
  expect(query.maybeSingle).toHaveBeenCalled();
});

describe('reset CLI', () => {
  it('dry-runs without network or secrets and prints only counts', async () => {
    const fetch = vi.fn();
    const log = vi.fn();
    await resetPasswords(['--all', '--dry-run'], { fetch, log });
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Sections selected: 3; updated: 0');
  });
  it('loads three open sections, honors URL/secret flags and prints counts only', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true,
      sections: ['PeriodC', 'PeriodD', 'PeriodG'].map(value => ({ value })) }) })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, updated: 2 }) });
    const log = vi.fn();
    await resetPasswords(['--all', '--url', 'http://localhost:9999///', '--secret', 'test-secret'], { fetch, log });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:9999/roster/open-sections');
    expect(fetch.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body)))
      .toEqual(['PeriodC', 'PeriodD', 'PeriodG'].map(section => ({ section })));
    expect(fetch.mock.calls[1][1].headers['x-teacher-secret']).toBe('test-secret');
    expect(log.mock.calls).toEqual([['Updated: 2'], ['Updated: 2'], ['Updated: 2'], ['Total updated: 6']]);
  });
  it('supports a single student and refuses invalid selectors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, updated: 1 }) });
    await resetPasswords(['--student-id', 'student-1', '--secret', 'test-secret'], { fetch, log: vi.fn() });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ studentIds: ['student-1'] });
    await expect(resetPasswords(['--all', '--section', 'PeriodC'])).rejects.toThrow('selector');
    await expect(resetPasswords(['--section'])).rejects.toThrow('options');
    await expect(resetPasswords(['--all', '--password', 'custom-reset'])).rejects.toThrow('options');
  });
});
