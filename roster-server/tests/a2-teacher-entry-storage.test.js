import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createA2Store } from '../a2-lessons.js';

it('provisions section assignment identity and RLS, and permits teacher score replacement', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create role service_role; create table item_ledger (item_id text primary key, source text, score numeric);');
    await pg.exec(readFileSync(new URL('../migrations/0037_a2_ledger_sources.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(new URL('../migrations/0040_a2_teacher_entry.sql', import.meta.url), 'utf8');
    await pg.exec(migration); await pg.exec(migration);
    await pg.exec("insert into a2_tryit_assignments values ('1-1', 'C', '2026-09-21') on conflict do nothing; insert into a2_tryit_assignments values ('1-1', 'C', '2026-09-28') on conflict do nothing;");
    expect((await pg.query('select assigned_date::text from a2_tryit_assignments')).rows).toEqual([{ assigned_date: '2026-09-21' }]);
    expect((await pg.query("select relrowsecurity from pg_class where relname='a2_tryit_assignments'")).rows[0].relrowsecurity).toBe(true);
    for (const source of ['try-it', 'quiz', 'topic-assessment', 'lesson-check']) {
      await pg.query('insert into item_ledger values ($1,$1,10)', [source]);
      await pg.query('update item_ledger set score=0 where item_id=$1', [source]);
      const result = await pg.query('select score from item_ledger where item_id=$1', [source]);
      expect(Number(result.rows[0].score)).toBe(source === 'lesson-check' ? 10 : 0);
    }
  } finally { await pg.close(); }
});
it('persists the first section collection date and propagates storage failures', async () => {
  const rows = [];
  let failure = null;
  const store = createA2Store({ from: table => {
    expect(table).toBe('a2_tryit_assignments');
    return {
      select: async () => ({ data: rows, error: failure }),
      upsert: async (row, options) => {
        expect(options).toEqual({ onConflict: 'lesson,section', ignoreDuplicates: true });
        if (!rows.some(value => value.lesson === row.lesson && value.section === row.section)) rows.push(row);
        return { error: failure };
      },
    };
  } });
  expect(await store.assignTryIts('1-1', 'C', '2026-09-21')).toBe('2026-09-21');
  expect(await store.assignTryIts('1-1', 'C', '2026-09-28')).toBe('2026-09-21');
  await store.assignTryIts('1-1', 'D', '2026-09-23');
  expect(await store.getAssignments()).toEqual({ '1-1': { C: '2026-09-21', D: '2026-09-23' } });
  failure = new Error('storage unavailable');
  await expect(store.assignTryIts('1-1', 'G', '2026-09-23')).rejects.toThrow('storage unavailable');
});

it('allows configured teacher-key reads through the existing ledger endpoint', async () => {
  const { default: express } = await import('express');
  const { mountLedger } = await import('../ledger.js');
  const { vi } = await import('vitest');
  vi.stubEnv('TEACHER_KEY', 'synthetic-teacher-entry-key');
  const app = express();
  mountLedger(app, { db: { getLedgerByStudent: async () => ({ data: [] }) }, rosterDb: {}, verifyToken: () => null });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/ledger/student/synthetic';
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { 'x-teacher-secret': 'synthetic-teacher-entry-key' } })).status).toBe(200);
  } finally { await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs(); }
});
