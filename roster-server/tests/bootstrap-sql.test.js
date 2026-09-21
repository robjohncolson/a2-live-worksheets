import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildBootstrapSql } from '../../scripts/build-bootstrap-sql.mjs';

it('matches regeneration and safely bootstraps a populated isolated schema twice', async () => {
  const sql = readFileSync(new URL('../../deploy/supabase_a2_bootstrap.sql', import.meta.url), 'utf8');
  expect(sql).toBe(buildBootstrapSql());
  const pg = new PGlite();
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE sentinel(value text); INSERT INTO sentinel VALUES (\'untouched\');');
    await pg.exec(sql);
    await pg.exec(`INSERT INTO a2.roster(student_id, real_name, section, login_username, password_hash)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Test', 'PeriodC', 'test_student', 'hash');
      INSERT INTO a2.item_ledger(student_id,source,item_id,score)
      VALUES ('00000000-0000-4000-8000-000000000001','lesson-check','CHECK-1-1',1);`);
    await pg.exec(sql);
    const tables = await pg.query("SELECT tablename FROM pg_tables WHERE schemaname = 'a2' ORDER BY tablename");
    expect(tables.rows.map(row => row.tablename)).toEqual([
      '_bootstrap_migrations', 'a2_lesson_pacing', 'a2_rescore_requests', 'a2_tryit_assignments', 'announcements',
      'flashcard_state', 'item_ledger', 'lesson_unlock', 'nudges_log', 'quarter_grade_snapshot',
      'remediation_assignment', 'review_marks', 'roster', 'roster_alias', 'schoology_assignment',
      'schoology_grade_sync', 'schoology_sync_log', 'student_keys', 'submission_archive', 'trusted_issuers',
    ]);
    expect((await pg.query('SELECT count(*)::int AS n FROM a2._bootstrap_migrations')).rows[0].n).toBe(25);
    expect((await pg.query('SELECT score FROM a2.item_ledger')).rows[0].score).toBe('1');
    // A REST-like caller search path must not change RPC table resolution.
    await pg.exec('SET search_path TO pg_catalog');
    await pg.query("SELECT * FROM a2.record_frq_draft($1, 'FRQ-test', 'unit', 'A sufficiently long response for testing', now())", ['00000000-0000-4000-8000-000000000001']);
    const functions = await pg.query("SELECT proname, proconfig FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid WHERE nspname='a2'");
    expect(functions.rows).toHaveLength(7);
    for (const fn of functions.rows) expect(fn.proconfig).toContain('search_path=a2');
    expect((await pg.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows).toEqual([{ tablename: 'sentinel' }]);
    expect((await pg.query('SELECT relrowsecurity FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname=\'a2\' AND relkind=\'r\'')).rows.every(row => row.relrowsecurity)).toBe(true);
  } finally { await pg.close(); }
}, 30000);
