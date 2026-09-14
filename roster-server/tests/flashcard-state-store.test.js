import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createFlashcardStateStore } from '../flashcard-state.js';

it('runs the flashcard migration and store against Postgres with atomic revisions and roster deletion', async () => {
  const pg = new PGlite();
  const alpha = '00000000-0000-4000-8000-000000000001';
  const beta = '00000000-0000-4000-8000-000000000002';
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA a2; SET search_path TO a2;
      CREATE TABLE roster (student_id uuid PRIMARY KEY);
      INSERT INTO roster VALUES ('${alpha}'), ('${beta}');`);
    await pg.exec(readFileSync(new URL('../migrations/0036_flashcard_state.sql', import.meta.url), 'utf8'));
    // A minimal PostgREST adapter exercises the production store's query chain
    // against real SQL, including the conditional UPDATE and duplicate INSERT.
    const client = { from(table) {
      expect(table).toBe('flashcard_state');
      let operation = 'get';
      let row;
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        insert(value) { operation = 'insert'; row = value; return query; },
        update(value) { operation = 'update'; row = value; return query; },
        async maybeSingle() {
          try {
            let result;
            if (operation === 'get') result = await pg.query('SELECT state, updated_at FROM flashcard_state WHERE student_id=$1', [filters.student_id]);
            if (operation === 'insert') result = await pg.query('INSERT INTO flashcard_state (student_id,state,updated_at) VALUES ($1,$2,$3) RETURNING state,updated_at', [row.student_id, JSON.stringify(row.state), row.updated_at]);
            if (operation === 'update') result = await pg.query('UPDATE flashcard_state SET state=$1,updated_at=$2 WHERE student_id=$3 AND updated_at=$4 RETURNING state,updated_at', [JSON.stringify(row.state), row.updated_at, filters.student_id, filters.updated_at]);
            const saved = result.rows[0];
            return { data: saved ? { ...saved, updated_at: saved.updated_at.toISOString() } : null };
          } catch (error) { return { error }; }
        },
      };
      return query;
    } };
    const store = createFlashcardStateStore(client);
    expect(await store.get(alpha)).toBeNull();
    const first = await store.put(alpha, { e: [] }, null);
    expect(await store.put(alpha, { overwritten: true }, null)).toBeNull();
    const second = await store.put(alpha, { e: ['new'] }, first.updated_at);
    expect(Date.parse(second.updated_at)).toBeGreaterThan(Date.parse(first.updated_at));
    expect(await store.put(alpha, { stale: true }, first.updated_at)).toBeNull();
    expect((await store.get(alpha)).state).toEqual({ e: ['new'] });
    expect(await store.get(beta)).toBeNull();
    // Route boundary-size JSON survives the migration's jsonb representation.
    const boundary = { x: 'a'.repeat(262144 - 8) };
    expect(Buffer.byteLength(JSON.stringify(boundary))).toBe(262144);
    expect(await store.put(beta, boundary, null)).toBeTruthy();
    expect((await pg.query("SELECT relrowsecurity FROM pg_class WHERE relname='flashcard_state'")).rows[0].relrowsecurity).toBe(true);
    await pg.query('DELETE FROM roster WHERE student_id=$1', [alpha]);
    expect(await store.get(alpha)).toBeNull();
  } finally { await pg.close(); }
}, 20000);
