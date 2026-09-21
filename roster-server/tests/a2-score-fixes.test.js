import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { initReceipts, issueLedgerReceipt } from '../receipts.js';
import { saveTeacherScore, serializeStudent, receiptMatchesRow } from '../a2-score-write.js';
import { createLedgerDb } from '../ledger-db.js';
import { createA2Store } from '../a2-lessons.js';
import { districtItemsFromLedger } from '../district-ledger.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { PGlite } from '@electric-sql/pglite';

beforeEach(() => {
  const keys = generateKeyPairSync('ed25519');
  vi.stubEnv('RECEIPT_ISSUER_PRIVATE_KEY', keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  initReceipts();
});
afterEach(() => { vi.unstubAllEnvs(); initReceipts(); });

function fixture() {
  let row;
  const db = {
    insertLedgerRow: vi.fn(async input => {
      row = { ledger_id: 'fixture-row', student_id: input.studentId, source: input.source,
        item_id: input.itemId, score: input.score, response: input.response, attempt: input.attempt,
        recorded_at: input.recordedAt, receipt_id: input.receiptId, receipt_compact: input.receiptCompact };
      return { data: row };
    }),
    updateLedgerReceipt: vi.fn(async (_id, receipt) => {
      row.receipt_id = receipt.receiptId;
      row.receipt_compact = receipt.receiptCompact;
      return {};
    }),
  };
  const input = { studentId: 'fixture-student', source: 'try-it', itemId: 'TI-1-1-1',
    score: 8, attempt: 1, evidenceTier: 'practice',
    response: { requestId: 'first', assignedDate: '2026-09-21', dueDate: '2026-09-25', maxPoints: 10 } };
  const save = (score, ts, response = {}) => serializeStudent(db, input.studentId, () =>
    saveTeacherScore(db, row, { ...input, score, response: { ...input.response, ...response } }, ts));
  return { db, input, save, row: () => row };
}

it('rejects a delayed older save and leaves its newer score and receipt byte-identical', async () => {
  const f = fixture();
  await f.save(8, 0);
  await f.save(10, 1, { requestId: 'newer' });
  const before = JSON.stringify(f.row());
  await expect(f.save(0, 1, { requestId: 'older' })).rejects.toMatchObject({ status: 409, current: { score: 10, version: 2 } });
  expect(JSON.stringify(f.row())).toBe(before);
  expect(receiptMatchesRow(f.row())).toBe(true);
  expect(f.db.insertLedgerRow).toHaveBeenCalledTimes(2);
});

it('retries the same request and unchanged scores without modifying the academic row', async () => {
  const f = fixture();
  await f.save(8, 0);
  const before = JSON.stringify(f.row());
  expect((await f.save(0, 0)).duplicate).toBe(true);
  expect((await f.save(8, 1, { requestId: 'unchanged' })).unchanged).toBe(true);
  const previous = JSON.parse(before);
  expect(f.row()).toMatchObject({ score: previous.score, recorded_at: previous.recorded_at, receipt_compact: previous.receipt_compact });
  expect(f.row().response.version).toBe(2);
  expect(receiptMatchesRow(f.row())).toBe(true);
  expect(f.db.insertLedgerRow).toHaveBeenCalledTimes(2);
  expect(f.db.updateLedgerReceipt).toHaveBeenCalledTimes(1);
});

it('repairs an old receipt left by an earlier partial rescore, including a failed repair retry', async () => {
  const f = fixture();
  await f.save(8, 0);
  f.row().receipt_compact = issueLedgerReceipt({ ...f.input, score: 0 }).compact;
  f.db.updateLedgerReceipt.mockResolvedValueOnce({ error: new Error('fixture failure') });
  await expect(f.save(8, 0)).rejects.toThrow('fixture failure');
  await f.save(8, 0);
  expect(receiptMatchesRow(f.row())).toBe(true);
  expect(f.db.insertLedgerRow).toHaveBeenCalledTimes(1);
});

it('serializes shared writers through the complete atomic score and receipt step', async () => {
  const f = fixture();
  await Promise.allSettled([f.save(8, 0), f.save(10, 1, { requestId: 'import' }), f.save(0, 1, { requestId: 'late' })]);
  expect(f.row().score).toBe(10);
  expect(receiptMatchesRow(f.row())).toBe(true);
});

it('includes receipt columns in the same production upsert as the score', async () => {
  const single = vi.fn(async () => ({ data: {} }));
  const upsert = vi.fn(() => ({ select: () => ({ single }) }));
  const db = createLedgerDb({ from: () => ({ upsert }) });
  await db.insertLedgerRow({ studentId: 'fixture', source: 'quiz', itemId: 'QZ-1-1', score: 18,
    response: {}, receiptId: 'receipt', receiptCompact: 'compact' });
  expect(upsert.mock.calls[0][0][0]).toMatchObject({ score: 18, receipt_id: 'receipt', receipt_compact: 'compact' });
});

it('keeps a receipt valid and an unchanged row byte-identical after a jsonb round trip', async () => {
  const pg = new PGlite();
  try {
    const f = fixture();
    await f.save(8, 0);
    const result = await pg.query('select $1::jsonb as response', [JSON.stringify(f.row().response)]);
    f.row().response = result.rows[0].response;
    expect(receiptMatchesRow(f.row())).toBe(true);
    const before = JSON.stringify(f.row());
    await f.save(8, 1, { requestId: 'same-score' });
    expect(f.row().receipt_compact).toBe(JSON.parse(before).receipt_compact);
    expect(f.row().response.version).toBe(2);
    expect(receiptMatchesRow(f.row())).toBe(true);
    expect(f.db.updateLedgerReceipt).toHaveBeenCalledTimes(1);
  } finally { await pg.close(); }
});

it('keeps reads available without 0040 and gives writes an explicit migration error', async () => {
  const error = { code: 'PGRST205', message: "Could not find table a2.a2_tryit_assignments" };
  const store = createA2Store({ from: () => ({ select: async () => ({ error }), upsert: async () => ({ error }) }) });
  expect(await store.getAssignments()).toEqual({});
  await expect(store.assignTryIts('1-1', 'C', '2026-09-21')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('0040') });
  const f = fixture();
  f.db.insertLedgerRow.mockResolvedValue({ error: { code: '23514', message: 'violates item_ledger_source_check' } });
  await expect(f.save(8, 0)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('0040') });
});

it.each(['2026-09-22T00:30:00Z', '2026-11-07T03:30:00Z'])('counts an evening score on its New York date: %s', recorded_at => {
  const date = recorded_at.startsWith('2026-09') ? '2026-09-21' : '2026-11-06';
  const row = { source: 'daily-engagement', item_id: date + '-PeriodC', score: 8, recorded_at };
  const cfg = { ...PHASE3_CONFIG, useDistrictFormula: true, today: date };
  expect(districtItemsFromLedger([row], {}, 'C', cfg)[0]).toMatchObject({ points: 8, dueDate: date, assignedDate: date });
});

it('keeps September work protected after pacing and collection metadata change', () => {
  const row = { source: 'try-it', item_id: 'TI-1-1-1', score: 0, recorded_at: '2026-09-25T12:00:00Z',
    response: { assignedDate: '2026-09-18', dueDate: '2026-09-18' } };
  const schedule = { '1-1': { periods: { C: '2026-10-01' }, assignedDates: { C: '2026-09-25' },
    items: [{ itemId: row.item_id, source: row.source }] } };
  const items = districtItemsFromLedger([row], schedule, 'C', { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-10-02' });
  expect(items[0]).toMatchObject({ extraCredit: true, maxPoints: 0, provisional: false, dueDate: '2026-09-18' });
});

it('protects an unscored September assignment after the lesson moves to October', () => {
  const schedule = { '1-1': { periods: { C: '2026-10-01' }, assignedDates: { C: '2026-09-18' },
    items: [{ itemId: 'TI-1-1-1', source: 'try-it' }] } };
  expect(districtItemsFromLedger([], schedule, 'C', { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-10-02' })[0])
    .toMatchObject({ extraCredit: true, provisional: false, dueDate: '2026-09-18' });
});

it('signs the stored score and names 0040 when the old trigger prevents a correction', async () => {
  const f = fixture();
  await f.save(8, 0);
  const original = f.db.insertLedgerRow.getMockImplementation();
  f.db.insertLedgerRow.mockImplementation(input => original({ ...input, score: Math.max(input.score, 8) }));
  await expect(f.save(7, 1, { requestId: 'lower' })).rejects.toMatchObject({ status: 503,
    message: expect.stringContaining('0040'), current: { score: 8 } });
  expect(receiptMatchesRow(f.row())).toBe(true);
});

it('advances an unchanged save so a stale device cannot overwrite it', async () => {
  const f = fixture();
  await f.save(8, 0);
  await f.save(8, 1, { requestId: 'unchanged' });
  const before = JSON.stringify(f.row());
  await expect(f.save(0, 1, { requestId: 'stale' })).rejects.toMatchObject({ status: 409 });
  expect(JSON.stringify(f.row())).toBe(before);
  expect((await f.save(8, 1, { requestId: 'unchanged' })).duplicate).toBe(true);
});
