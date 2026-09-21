import { describe, expect, it, afterEach, vi } from 'vitest';
import { importTeacherScores } from '../teacher-score-import.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { districtItemsFromLedger } from '../district-ledger.js';
import { createApp } from '../server.js';

afterEach(() => vi.unstubAllEnvs());

function fixture() {
  vi.stubEnv('ROSTER_TEACHER_SECRET', 'fixture-import-key');
  const rows = new Map();
  let writes = 0;
  const db = { listRoster: async () => ({ data: [
    { student_id: 'a', section: 'C', real_name: 'Fixture One', login_username: 'fixture1', status: 'active' },
    { student_id: 'b', section: 'PeriodC', real_name: 'Fixture Two', login_username: 'fixture2', status: 'active' },
    { student_id: 'other', section: 'D' },
  ] }) };
  const ledgerDb = {
    getLedgerByStudent: async studentId => ({ data: [...rows.values()].filter(row => row.student_id === studentId) }),
    insertLedgerRow: async row => {
      writes++;
      const key = `${row.studentId}|${row.source}|${row.itemId}|${row.attempt}`;
      const stored = { ledger_id: key, student_id: row.studentId, source: row.source,
        item_id: row.itemId, attempt: row.attempt, score: row.score, response: row.response,
        recorded_at: row.recordedAt };
      rows.set(key, stored);
      return { data: stored };
    },
  };
  async function request(body, secret = 'fixture-import-key') {
    let status = 200;
    let result;
    const res = { status(code) { status = code; return this; }, json(value) { result = value; return this; } };
    await importTeacherScores({ headers: { 'x-teacher-secret': secret }, body }, res, { db, ledgerDb, config: PHASE3_CONFIG });
    return { status, body: result };
  }
  return { rows, request, db, ledgerDb, writes: () => writes };
}

const engagement = { source: 'daily-engagement', section: 'PeriodC', date: '2026-09-21',
  scores: [{ studentId: 'a', score: 9.5 }, { studentId: 'b', score: null }] };

describe('teacher score imports', () => {
  it('is mounted on the live app', async () => {
    const f = fixture();
    const app = createApp(f.db, f.ledgerDb);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await fetch(`http://127.0.0.1:${server.address().port}/teacher/score-import`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-teacher-secret': 'fixture-import-key' },
        body: JSON.stringify(engagement),
      });
      expect(result.status).toBe(200);
      expect((await result.json()).written).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('requires teacher authentication before looking up the roster', async () => {
    const f = fixture();
    f.db.listRoster = () => { throw new Error('must not run'); };
    expect((await f.request(engagement, 'wrong')).status).toBe(401);
    expect(f.writes()).toBe(0);
  });

  it('upserts raw points, leaves absences without items, and preserves every row on a second commit', async () => {
    const f = fixture();
    expect((await f.request(engagement)).status).toBe(200);
    const first = JSON.stringify([...f.rows]);
    expect((await f.request(engagement)).status).toBe(200);
    expect(JSON.stringify([...f.rows])).toBe(first);
    expect(f.writes()).toBe(1);
    // PostgreSQL jsonb does not preserve the insertion order of object keys.
    const stored = [...f.rows.values()][0];
    stored.response = { maxPoints: 10, dueDate: '2026-09-21', assignedDate: '2026-09-21' };
    await f.request(engagement);
    expect(f.writes()).toBe(1);
    const items = districtItemsFromLedger([...f.rows.values()], {}, 'C', { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-11-06' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemId: '2026-09-21-PeriodC', source: 'daily-engagement', points: 9.5, maxPoints: 10, quarter: 'Q1' });
    await f.request({ ...engagement, scores: [{ studentId: 'a', score: 0 }] });
    expect([...f.rows.values()][0].score).toBe(0);
    expect(f.rows.size).toBe(1);
    await f.request({ ...engagement, scores: [{ studentId: 'a', score: null }] });
    expect(districtItemsFromLedger([...f.rows.values()], {}, 'C', { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-09-21' })).toEqual([]);
  });

  it('replaces the quarter bonus snapshot, including removed awards, without duplicate rows', async () => {
    const f = fixture();
    const body = { source: 'bonus', section: 'C', quarter: 'Q1', scores: [{ student: 'Fixture One', score: 10 }] };
    expect((await f.request(body)).status).toBe(200);
    const first = JSON.stringify([...f.rows]);
    await f.request(body);
    expect(JSON.stringify([...f.rows])).toBe(first);
    expect(f.writes()).toBe(2);
    const row = [...f.rows.values()][0];
    expect(row).toMatchObject({ source: 'bonus', item_id: 'BONUS-Q1', score: 10 });
    expect(districtItemsFromLedger([row], {}, 'C', { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-11-06' })[0])
      .toMatchObject({ quarter: 'Q1', points: 10, maxPoints: 0, extraCredit: true });
    await f.request({ ...body, scores: [] });
    expect([...f.rows.values()].map(row => row.score)).toEqual([0, 0]);
    expect(f.rows.size).toBe(2);
  });

  it.each([
    { date: '2026-02-30' }, { source: 'quiz' }, { section: 'X' },
    { scores: [{ studentId: 'a', score: 11 }] },
    { scores: [{ studentId: 'a', score: 2 }, { studentId: 'other', score: 2 }] },
    { scores: [{ studentId: 'a', score: 2 }, { studentId: 'a', score: 3 }] },
    { scores: [{ studentId: 'a', score: '9' }] }, { scores: [null] },
  ])('rejects malformed batches before writing: %j', async changes => {
    const f = fixture();
    expect((await f.request({ ...engagement, ...changes })).status).toBe(400);
    expect(f.writes()).toBe(0);
  });

  it('does not expose private database errors', async () => {
    const f = fixture();
    f.db.listRoster = async () => { throw new Error('private fixture'); };
    const result = await f.request(engagement);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result)).not.toContain('private fixture');
  });
});
