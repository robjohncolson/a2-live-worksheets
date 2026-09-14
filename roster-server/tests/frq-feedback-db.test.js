import { describe, expect, it } from 'vitest';
import { createLedgerDb } from '../ledger-db.js';
import { createFrqDb, FRQ_STUDENT_ID } from './fixtures/pg-frq.js';

describe('feedback-only ledger update', () => {
  it.each([null, { feedback: 'old' }])('writes only frq_result and binds the complete prior row (%j)', async (priorResult) => {
    const calls = [];
    const query = {
      update(value) { calls.push(['update', value]); return this; },
      eq(...args) { calls.push(['eq', ...args]); return this; },
      is(...args) { calls.push(['is', ...args]); return this; },
      async select() { return { data: [{ ledger_id: 'row', score: '0.500' }] }; },
    };
    const db = createLedgerDb({ from(table) { expect(table).toBe('item_ledger'); return query; } });
    const existing = { ledger_id: 'row', score: '0.500', response: 'Saved answer', frq_result: priorResult };
    const result = { score: existing.score, provider: 'ai-backfill', matched: [], missing: ['Context'] };
    await db.updateFrqFeedback(existing, result);
    expect(calls).toEqual([
      ['update', { frq_result: result }],
      ['eq', 'ledger_id', 'row'], ['eq', 'source', 'frq'],
      ['eq', 'response', JSON.stringify('Saved answer')], ['eq', 'score', '0.500'],
      priorResult === null ? ['is', 'frq_result', null] : ['eq', 'frq_result', JSON.stringify(priorResult)],
    ]);
  });
  it('preserves score and receipt bytes through actual SQL updates and refuses a changed response', async () => {
    const pg = await createFrqDb();
    try {
      await pg.query(`insert into item_ledger (student_id, source, item_id, response, score)
        values ($1, 'frq', 'WS-U1L1-reflect1', $2::jsonb, 0.5)`,
      [FRQ_STUDENT_ID, JSON.stringify('Saved answer')]);
      const read = async () => (await pg.query('select *, score::text as score_bytes from item_ledger')).rows[0];
      const original = await read();
      const client = {
        from() {
          const params = [];
          const filters = [];
          let assignments;
          const bind = value => { params.push(value); return `$${params.length}`; };
          return {
            update(value) {
              assignments = Object.entries(value).map(([key, val]) => `${key} = ${bind(JSON.stringify(val))}::jsonb`);
              return this;
            },
            eq(key, value) { filters.push(`${key} = ${bind(value)}`); return this; },
            is(key) { filters.push(`${key} is null`); return this; },
            async select() {
              const result = await pg.query(`update item_ledger set ${assignments.join(', ')}
                where ${filters.join(' and ')} returning ledger_id, score`, params);
              return { data: result.rows };
            },
          };
        },
      };
      const db = createLedgerDb(client);
      for (const graderScore of [0, 1]) {
        const existing = await read();
        const saved = await db.updateFrqFeedback(existing, {
          score: existing.score, provider: 'ai-backfill', missing: ['Context'], graderScore,
        });
        expect(saved.data).toHaveLength(1);
        const after = await read();
        const { frq_result: beforeResult, ...beforeFields } = original;
        const { frq_result: afterResult, ...afterFields } = after;
        expect(afterFields).toEqual(beforeFields);
      }
      const stale = await read();
      await pg.query('update item_ledger set response = $1::jsonb', [JSON.stringify('Changed answer')]);
      expect((await db.updateFrqFeedback(stale, { missing: [] })).data).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 60000);
});
