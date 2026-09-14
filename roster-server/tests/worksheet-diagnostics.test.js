import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createHmac } from 'node:crypto';
import { mountWorksheetDiagnostics, diagnosticIdentity, createDiagnosticsStore } from '../worksheet-diagnostics.js';
import { signToken, verifyToken } from '../token.js';
const servers = [];
beforeEach(() => { vi.stubEnv('ROSTER_TOKEN_SECRET', 'diagnostic-test-secret'); vi.stubEnv('ROSTER_TEACHER_SECRET', 'teacher-test-secret'); });
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => { s.closeAllConnections(); s.close(r); }))); vi.unstubAllEnvs(); });
const report = (extra = {}) => ({ deviceId: 'a'.repeat(24), reportId: 'b'.repeat(24), worksheet: 'WS-U1L1', build: 'test-build', observedAt: Date.now(), outcome: 'loaded', fields: 40, downloaded: 37, saved: 37, restored: 37, matched: 37, edited: 0, filled: 37, ...extra });
function expired(sid, ago = 1000) { const p = Buffer.from(JSON.stringify({ sid, exp: Date.now() - ago })).toString('base64url'); return p + '.' + createHmac('sha256', process.env.ROSTER_TOKEN_SECRET).update(p).digest('base64url'); }
async function boot(store = { put: vi.fn(), list: vi.fn().mockResolvedValue({ rows: [], truncated: false }) }) {
  const db = { findByStudentId: async sid => ({ data: sid === 'missing' ? null : { student_id: sid, login_username: sid + '_login', real_name: 'Test Student', section: sid === 'other' ? 'PeriodE' : 'PeriodB', role: sid === 'teacher' ? 'teacher' : 'student', status: 'active' } }), getRoleByStudentId: async sid => sid === 'teacher' ? 'teacher' : 'student' };
  const app = express(); app.use(express.json()); mountWorksheetDiagnostics(app, { db, store });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); servers.push(server);
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, token = signToken('student')) => fetch(base + '/student/worksheet-diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  const get = (token = signToken('teacher'), section = '') => fetch(base + '/teacher/worksheet-diagnostics?section=' + section, { headers: { Authorization: 'Bearer ' + token } });
  return { post, get, store };
}
describe('diagnostic-only authentication', () => {
  it('accepts expired authentic sessions only for reporting; normal auth still rejects them', () => { const t = expired('student'); expect(diagnosticIdentity(t)).toEqual({ studentId: 'student', expired: true }); expect(verifyToken(t)).toBeNull(); });
  it('rejects forged, malformed and over-30-day expired tokens', () => { expect(diagnosticIdentity(signToken('student') + 'x')).toBeNull(); expect(diagnosticIdentity('bad')).toBeNull(); expect(diagnosticIdentity(expired('student', 31 * 86400000))).toBeNull(); });
});
describe('diagnostic routes', () => {
  it('derives identity and section and strips answers, credentials and forged labels', async () => {
    const b = await boot(); const r = await b.post(report({ answer: 'NEVER STORE', password: 'SECRET', token: 'SECRET', realName: 'FORGED', section: 'PeriodE', mode: 'teacher-preview' }));
    expect(r.status).toBe(200); expect(b.store.put.mock.calls[0][0]).toMatchObject({ studentId: 'student', section: 'PeriodB', mode: 'student' }); expect(JSON.stringify(b.store.put.mock.calls[0][0])).not.toMatch(/NEVER STORE|SECRET|FORGED/); expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('blocks cross-student writes', async () => { const b = await boot(); expect((await b.post(report({ studentId: 'other' }))).status).toBe(403); expect(b.store.put).not.toHaveBeenCalled(); });
  it('separates teacher previews and denies expired teacher impersonation', async () => { const b = await boot(); expect((await b.post(report({ studentId: 'other' }), signToken('teacher'))).status).toBe(200); expect(b.store.put.mock.calls[0][0]).toMatchObject({ studentId: 'other', mode: 'teacher-preview', section: 'PeriodE' }); expect((await b.post(report({ studentId: 'other' }), expired('teacher'))).status).toBe(403); });
  it('labels expired student reports', async () => { const b = await boot(); expect((await b.post(report({ outcome: 'auth', httpStatus: 401 }), expired('student'))).status).toBe(200); expect(b.store.put.mock.calls[0][0]).toMatchObject({ session: 'expired', outcome: 'auth', httpStatus: 401 }); });
  it('rejects unauthenticated, missing-account, malformed and stale reports', async () => { const b = await boot(); for (const [body, token, status] of [[report(), 'bad', 401], [report(), signToken('missing'), 403], [report({ saved: -1 }), signToken('student'), 400], [report({ observedAt: Date.now() - 8 * 86400000 }), signToken('student'), 400], [report({ worksheet: '../escape' }), signToken('student'), 400]]) expect((await b.post(body, token)).status).toBe(status); });
  it('permits only current teacher sessions to read, with section filtering', async () => { const b = await boot(); expect((await b.get('bad')).status).toBe(401); expect((await b.get(signToken('student'))).status).toBe(401); expect((await b.get(expired('teacher'))).status).toBe(401); expect((await b.get(signToken('teacher'), 'PeriodB')).status).toBe(200); expect(b.store.list).toHaveBeenCalledWith('PeriodB'); });
  it('reports storage failures honestly', async () => { const b = await boot({ put: vi.fn().mockRejectedValue(new Error('down')), list: vi.fn().mockRejectedValue(new Error('down')) }); expect((await b.post(report())).status).toBe(503); expect((await b.get()).status).toBe(503); });
  it('throttles runaway reports', async () => { const b = await boot(); for (let i = 0; i < 30; i++) expect((await b.post(report())).status).toBe(200); expect((await b.post(report())).status).toBe(429); });
});
describe('private durable summary storage', () => {
  function bootStore() {
    const files = new Map(); const bucket = { download: vi.fn(async p => files.has(p) ? { data: { text: async () => files.get(p) } } : { error: { statusCode: '404' } }), upload: vi.fn(async (p, text) => { files.set(p, text); return {}; }), list: vi.fn(async () => ({ data: [] })), remove: vi.fn(async () => ({})) };
    return { files, bucket, store: createDiagnosticsStore({ from: () => bucket }) };
  }
  const row = () => ({ ...report(), studentId: 'student', section: 'PeriodB', mode: 'student', receivedAt: Date.now() });
  it('keeps failure details after recovery and rejects stale overwrites', async () => { const b = bootStore(), r = row(); await b.store.put({ ...r, outcome: 'auth' }); await b.store.put({ ...r, observedAt: r.observedAt + 1 }); await b.store.put({ ...r, observedAt: r.observedAt - 1, outcome: 'network' }); const saved = JSON.parse([...b.files.values()][0]); expect(saved.outcome).toBe('loaded'); expect(saved.lastFailure.outcome).toBe('auth'); expect(b.bucket.upload).toHaveBeenCalledTimes(2); });
  it('keeps browsers and teacher previews separate', async () => { const b = bootStore(), r = row(); await b.store.put(r); await b.store.put({ ...r, mode: 'teacher-preview' }); await b.store.put({ ...r, deviceId: 'c'.repeat(24) }); expect(b.files.size).toBe(3); });
  it('survives recreation of the server store', async () => { const b = bootStore(); await b.store.put(row()); const p = [...b.files.keys()][0]; b.bucket.list.mockResolvedValue({ data: [{ id: 'id', name: p.split('/')[1], updated_at: new Date().toISOString() }] }); const fresh = createDiagnosticsStore({ from: () => b.bucket }); expect((await fresh.list('PeriodB')).rows[0].saved).toBe(37); });
  it('purges expired objects and never shows them', async () => { const b = bootStore(); b.bucket.list.mockResolvedValue({ data: [{ id: 'old', name: 'old.json', updated_at: new Date(Date.now() - 8 * 86400000).toISOString() }] }); expect((await b.store.list('PeriodB')).rows).toEqual([]); expect(b.bucket.remove).toHaveBeenCalledWith(['PeriodB/old.json']); });
});
