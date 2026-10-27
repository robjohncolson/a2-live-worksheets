import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createClassPlanStore, createClassPlanCoordinator, mountClassPlans, mountTeacherPlans, commitmentsFromSummary } from '../class-plans.js';
import { mountClassSummaries } from '../class-summaries.js';
import { mountTeacherCards } from '../observer-cards.js';
import { mountTeacherDecks } from '../card-decks.js';
import { compileSectionPlan } from '../section-plan.js';

const token = 'plan-phone-token-0123456789abcdef';
const phone = { Authorization: `Bearer ${token}` };
const teacher = { 'x-teacher-secret': 'plan-teacher' };
const date = '2026-10-27';
let pg, store, coordinator, server, base, privacyFailure, compilerFailure;
const migration = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

// Only the RPCs and two read queries used by this module; the RPCs are real SQL.
function client() {
  return {
    async rpc(name, args) {
      const values = Object.values(args);
      const types = name === 'apply_class_plan_changes' ? ['jsonb'] : name === 'class_plans_for_date' ? ['date'] : ['text', 'text'];
      try {
        const result = await pg.query(`select a2.${name}(${types.map((type, i) => `$${i + 1}::${type}`).join(',')}) as value`,
          values.map((value, i) => types[i] === 'jsonb' ? JSON.stringify(value) : value));
        return { data: result.rows[0].value, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      const where = [], values = [];
      let columns = '*', order = '', range = '', single = false;
      const query = {
        select(value) { columns = value; return query; },
        eq(column, value) { values.push(value); where.push(`${column}=$${values.length}`); return query; },
        order(column) { order = ` order by ${column}`; return query; },
        range(from, to) { range = ` limit ${to - from + 1} offset ${from}`; return query; },
        maybeSingle() { single = true; return query; },
        async then(resolve, reject) {
          try {
            if (table === 'roster' && privacyFailure) throw new Error('roster temporarily unavailable');
            const result = await pg.query(`select ${columns} from a2.${table}${where.length ? ` where ${where.join(' and ')}` : ''}${order}${range}`, values);
            return resolve({ data: single ? result.rows[0] || null : result.rows, error: null });
          } catch (error) { return resolve({ data: null, error }); }
        },
      };
      return query;
    },
  };
}

function inputs(section = 'C', day = date) {
  return { schemaVersion: 1, date: day, course: 'algebra2', section, source: null, decisions: [], commitments: [],
    lessonInputs: { entry: { date: day, section, lesson: '1-3',
      observerCard: { title: 'Piecewise practice', mode: 'pairs', minutes: 10, body: 'Discuss the interval.', frame: null },
      teacherBrief: { title: 'Piecewise practice', ixl: ['RVD - Graph piecewise functions'],
        lastClass: 'Previous stopping point not confirmed.', today: ['Continue the packet.'] } },
    trees: {}, fallbackItems: Array.from({ length: 8 }, (_, n) => ({ id: `anchor-${String(n).padStart(3, '0')}`,
      type: 'anchor', front: `Rule ${n}?`, back: `Answer ${n}.`, order: n + 1, after: [], minute: null })) } };
}

const request = (input = inputs(), expectedRevision = null, expectedScopeVersion = 0) => ({ inputs: input, expectedRevision, expectedScopeVersion });
const summary = (over = {}) => ({ date: '2026-10-26', course: 'algebra2', section: 'C', model: 'test',
  markdown: '## Landed\nFinished piece A.\n## Promises\nBring the worked example.',
  landed: ['Finished piece A.'], studentQuestions: [], promises: ['Bring the worked example.'],
  nextPrep: ['Finish piece B.'], ...over });
async function call(method, path, body, headers = teacher) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.text();
  return { status: response.status, body: value ? JSON.parse(value) : null };
}
const publish = plans => call('PUT', '/teacher/plans', { plans });
const getPlan = async (day = date, headers = phone) => (await call('GET', `/class-log/plans?date=${day}`, undefined, headers)).body.plans[0];
const scope = async () => (await call('GET', '/class-log/commitments?course=algebra2&section=C', undefined, phone)).body;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2; set search_path to a2;');
  for (const file of ['0041_observer_cards.sql', '0042_observer_cards_unique.sql', '0043_class_summaries.sql', '0046_card_decks.sql', '0048_class_plans.sql']) {
    await pg.exec(migration(file));
  }
  await pg.exec(migration('0048_class_plans.sql'));
  await pg.exec('create table a2.roster(student_id text primary key,real_name text);');
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'plan-teacher');
  await pg.exec('truncate a2.class_plan_scopes cascade; truncate a2.observer_cards cascade; truncate a2.class_summaries; truncate a2.roster;');
  await pg.query('insert into a2.roster values($1,$2)', ['student-one', 'Student, Jordan']);
  privacyFailure = false; compilerFailure = false;
  store = createClassPlanStore(client());
  coordinator = createClassPlanCoordinator({ store, now: () => new Date('2026-10-26T22:00:00Z'),
    compiler: input => { if (compilerFailure) throw new Error('invalid new source'); return compileSectionPlan(input); } });
  const app = express();
  mountClassPlans(app, { coordinator, env: { CLASS_LOG_TOKEN: token } });
  mountClassSummaries(app, { coordinator, store: {}, env: { CLASS_LOG_TOKEN: token }, now: () => new Date('2026-10-26T22:00:00Z') });
  mountTeacherPlans(app, { coordinator, db: {} });
  mountTeacherCards(app, { db: {}, store: {
    async findCard(day, course, section) {
      return (await pg.query('select * from a2.observer_cards where date=$1 and course=$2 and section=$3', [day, course, section])).rows[0];
    },
    async updateCard(id, fields) { await pg.query('update a2.observer_cards set body=$1 where id=$2', [fields.body, id]); },
  } });
  mountTeacherDecks(app, { db: {}, store: {
    async putDecks(decks) { for (const deck of decks) await pg.query('update a2.card_decks set model=$1 where card_id=$2', [deck.model, deck.card_id]); },
    async deleteDeck(id) { await pg.query('delete from a2.card_decks where card_id=$1', [id]); },
  } });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs(); });

describe('atomic class plans', () => {
  it('publishes one complete revision and preserves card identity, outcomes, and package history', async () => {
    const first = await publish([request()]);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ written: 1, unchanged: 0 });
    const a = await getPlan();
    expect(a.card.id).toBe(a.deck.cardId);
    expect(a).toMatchObject({ date, section: 'C', course: 'algebra2', scopeVersion: 1 });
    expect(a.card).toMatchObject({ date, section: 'C', course: 'algebra2' });
    expect(a.deck).toMatchObject({ date, section: 'C', course: 'algebra2' });
    expect(a.routine.body).toBe('Discuss the interval.');
    expect(a).not.toHaveProperty('inputs');
    await pg.query('insert into a2.observer_card_outcomes(card_id,date,section,ran) values($1,$2,$3,true)', [a.card.id, date, 'C']);
    const edited = inputs(); edited.lessonInputs.entry.teacherBrief.title = 'A clearer plan';
    expect((await publish([request(edited, a.revision, 1)])).status).toBe(200);
    const b = await getPlan();
    expect(b.card.id).toBe(a.card.id);
    expect(b.revision).not.toBe(a.revision);
    expect(b.scopeVersion).toBe(2);
    expect((await pg.query('select count(*)::int n from a2.class_plan_packages')).rows[0].n).toBe(2);
    expect((await pg.query('select count(*)::int n from a2.observer_card_outcomes')).rows[0].n).toBe(1);
    await expect(pg.exec("update a2.class_plan_packages set package='{}'::jsonb")).rejects.toThrow(/immutable/);
    const authoring = await call('GET', `/teacher/plans?date=${date}&course=algebra2&section=C`);
    expect(authoring.body.plans[0].inputs.lessonInputs.entry.teacherBrief.title).toBe('A clearer plan');
  });

  it('retries the exact publication idempotently and rejects stale different edits', async () => {
    const original = request();
    expect((await publish([original])).status).toBe(200);
    const before = await getPlan();
    expect((await publish([original])).status).toBe(200);
    expect(await getPlan()).toEqual(before);
    const freshRetry = await publish([request(inputs(), before.revision, before.scopeVersion)]);
    expect(freshRetry.body).toMatchObject({ written: 0, unchanged: 1 });
    const stale = inputs(); stale.lessonInputs.entry.teacherBrief.title = 'Stale edit';
    expect(await publish([request(stale)])).toMatchObject({ status: 409, body: { error: 'scope_conflict' } });
    expect((await getPlan()).card.title).toBe(before.card.title);
  });

  it('serializes racing publications with a scope compare-and-set', async () => {
    const one = inputs(), two = inputs();
    one.lessonInputs.entry.teacherBrief.title = 'One'; two.lessonInputs.entry.teacherBrief.title = 'Two';
    const results = await Promise.all([publish([request(one)]), publish([request(two)])]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await pg.query('select count(*)::int n from a2.class_plan_packages')).rows[0].n).toBe(1);
  });

  it('rolls back every scope in an RPC batch when a later compare-and-set fails', async () => {
    const changes = ['C', 'D'].map((section, index) => {
      const compiled = compileSectionPlan(inputs(section));
      return { course: 'algebra2', section, expectedScopeVersion: index ? 99 : 0, operationId: `batch-test-${section}`, requestHash: section,
        plans: [{ date, expectedRevision: null, revision: compiled.revision, inputs: compiled.inputs,
          card: compiled.card, deck: { ...compiled.deck, contentHash: 'test' }, package: compiled }] };
    });
    await expect(store.apply(changes)).rejects.toMatchObject({ status: 409, code: 'scope_conflict' });
    expect((await pg.query('select count(*)::int n from a2.observer_cards')).rows[0].n).toBe(0);
    expect((await pg.query('select count(*)::int n from a2.class_plan_heads')).rows[0].n).toBe(0);
  });
});

describe('source continuity and persistent commitments', () => {
  it('updates future plans with summary evidence while preserving past plans and teacher decisions', async () => {
    const future = inputs(); future.decisions = [{ id: 'teacher-title', set: { 'teacherBrief.title': 'My chosen sequence' } }];
    expect((await publish([request(future), request(inputs('C', '2026-10-25'))])).status).toBe(200);
    const past = await getPlan('2026-10-25');
    expect((await call('POST', '/class-log/summaries', summary(), phone)).status).toBe(200);
    const next = await getPlan();
    expect(next.card.title).toBe('My chosen sequence');
    expect(next.source.sourceDate).toBe('2026-10-26');
    expect(next.card.body).toContain('Finished piece A.');
    expect(next.commitments.map(c => c.text)).toContain('Bring the worked example.');
    expect(await getPlan('2026-10-25')).toEqual({ ...past, scopeVersion: next.scopeVersion });
  });

  it('marks a promise done atomically with rebuilt cards and decks, and guards replay and stale operations', async () => {
    await publish([request()]);
    await call('POST', '/class-log/summaries', summary(), phone);
    const before = await getPlan(), state = await scope();
    const promise = state.commitments.find(c => c.kind === 'promise');
    const action = { course: 'algebra2', section: 'C', id: promise.id, status: 'done', expectedVersion: promise.version, operationId: 'phone-operation-0001' };
    const saved = await call('POST', '/class-log/commitments/status', action, phone);
    expect(saved.status).toBe(200);
    expect(saved.body.commitments.find(c => c.id === promise.id)).toMatchObject({ status: 'done', version: 2 });
    const after = await getPlan();
    expect(after.revision).not.toBe(before.revision);
    expect(after.card.body).not.toContain('Bring the worked example.');
    expect(after.deck.items.some(i => i.back.includes('Bring the worked example.'))).toBe(false);
    expect((await call('POST', '/class-log/commitments/status', action, phone)).body.replayed).toBe(true);
    expect(await getPlan()).toEqual(after);
    expect((await call('POST', '/class-log/commitments/status', { ...action, status: 'open' }, phone)).status).toBe(409);
    expect((await call('POST', '/class-log/commitments/status', { ...action, status: 'cancelled', operationId: 'phone-operation-0002' }, phone)).status).toBe(409);
    await call('POST', '/class-log/summaries', summary({ date: '2026-10-27', promises: [], nextPrep: [] }), phone);
    expect((await scope()).commitments.find(c => c.id === promise.id).status).toBe('done');
  });

  it('saves source evidence durably when compilation is unavailable, then retries without replacing the prior package early', async () => {
    await publish([request()]);
    const before = await getPlan();
    privacyFailure = true;
    const accepted = await call('POST', '/class-log/summaries', summary({ landed: ['Jordan finished piece A.'] }), phone);
    expect(accepted).toMatchObject({ status: 200, body: { ok: true, planRefreshPending: true } });
    expect((await pg.query('select count(*)::int n from a2.class_summaries')).rows[0].n).toBe(1);
    expect((await getPlan()).revision).toBe(before.revision);
    expect((await store.snapshot('algebra2', 'C')).pendingSummary).not.toBeNull();
    privacyFailure = false;
    const after = await getPlan();
    expect(after.revision).not.toBe(before.revision);
    expect(JSON.stringify(after)).not.toContain('Jordan');
    expect((await store.snapshot('algebra2', 'C')).pendingSummary).toBeNull();
  });

  it('does not resurrect a completed promise or replace recent evidence with an older arriving summary', async () => {
    await publish([request()]);
    await call('POST', '/class-log/summaries', summary(), phone);
    const current = await getPlan();
    await call('POST', '/class-log/summaries', summary({ date: '2026-10-24', landed: ['Older work.'], promises: ['Earlier promise.'] }), phone);
    const after = await getPlan();
    expect(after.source.sourceDate).toBe(current.source.sourceDate);
    expect(after.source.landed).toEqual(current.source.landed);
    expect((await scope()).commitments.some(c => c.text === 'Earlier promise.')).toBe(true);
    expect(commitmentsFromSummary(summary({ markdown: '_Recording unusable: no usable audio._' }))).toEqual([]);
  });

  it('bootstraps existing summaries without resetting reviewed statuses on migration rerun', async () => {
    await call('POST', '/class-log/summaries', summary(), phone);
    const state = await scope();
    const promise = state.commitments.find(c => c.kind === 'promise');
    await call('POST', '/teacher/commitments/status', { course: 'algebra2', section: 'C', id: promise.id,
      status: 'cancelled', expectedVersion: promise.version, operationId: 'teacher-operation-0001' });
    await pg.exec(migration('0048_class_plans.sql'));
    expect((await scope()).commitments.find(c => c.id === promise.id).status).toBe('cancelled');
    expect((await scope()).commitments).toHaveLength(2);
  });
});

describe('plan route boundaries', () => {
  it('keeps teacher writes private and validates date/scope/version inputs', async () => {
    expect((await call('PUT', '/teacher/plans', { plans: [request()] }, phone)).status).toBe(403);
    expect((await call('GET', `/class-log/plans?date=${date}`, undefined, {})).status).toBe(401);
    expect((await call('GET', '/class-log/plans?date=2026-02-30', undefined, phone)).status).toBe(400);
    expect((await publish([{ inputs: inputs(), expectedRevision: null }])).status).toBe(400);
    expect((await call('GET', '/class-log/commitments?course=algebra2&section=C', undefined, phone)).body)
      .toMatchObject({ version: 0, commitments: [] });
  });

  it('keeps saving summaries through the original store before the plan migration is installed', async () => {
    const accepted = [];
    const app = express();
    mountClassSummaries(app, { env: { CLASS_LOG_TOKEN: token }, store: { async upsertSummary(row) { accepted.push(row); } },
      coordinator: { async ingestSummary() { throw { code: 'PGRST202', message: 'RPC is not installed' }; } } });
    const listener = await new Promise(resolve => { const ready = app.listen(0, '127.0.0.1', () => resolve(ready)); });
    try {
      const response = await fetch(`http://127.0.0.1:${listener.address().port}/class-log/summaries`, {
        method: 'POST', headers: { ...phone, 'Content-Type': 'application/json' }, body: JSON.stringify(summary()),
      });
      expect(response.status).toBe(200);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].markdown).toContain('Finished piece A.');
    } finally { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }
  });
});

describe('durable evidence and legacy isolation', () => {
  it('retains immutable raw summary revisions even without any plan', async () => {
    await call('POST', '/class-log/summaries', summary(), phone);
    await call('POST', '/class-log/summaries', summary({ markdown: 'Corrected raw evidence.', landed: ['Corrected stopping point.'] }), phone);
    const revisions = (await pg.query('select revision,summary from a2.class_summary_revisions order by created_at')).rows;
    expect(revisions).toHaveLength(2);
    expect(revisions.map(row => row.summary.markdown)).toContain('Corrected raw evidence.');
    expect(revisions.map(row => row.revision)).toContain((await store.snapshot('algebra2', 'C')).latestSummary.revision);
    await expect(pg.exec("update a2.class_summary_revisions set summary='{}'::jsonb")).rejects.toThrow(/immutable/);
    await expect(pg.exec('delete from a2.class_summary_revisions')).rejects.toThrow(/immutable/);
  });

  it('guards packaged card/deck mutations at the database boundary while keeping other scopes writable', async () => {
    await publish([request()]);
    const before = await getPlan();
    await expect(pg.query('update a2.observer_cards set body=$1 where id=$2', ['Torn card', before.card.id])).rejects.toThrow('atomic_plan_required');
    await expect(pg.query('update a2.card_decks set model=$1 where card_id=$2', ['Torn deck', before.card.id])).rejects.toThrow('atomic_plan_required');
    await expect(pg.query('delete from a2.card_decks where card_id=$1', [before.card.id])).rejects.toThrow('atomic_plan_required');
    await expect(pg.query('delete from a2.observer_cards where id=$1', [before.card.id])).rejects.toThrow('atomic_plan_required');
    const { id: ignoredId, updatedAt: ignoredTime, ...legacyCard } = before.card;
    expect(await call('PUT', '/teacher/cards', [{ ...legacyCard, body: 'Torn old-route card' }]))
      .toMatchObject({ status: 409, body: { error: 'atomic_plan_required' } });
    expect(await call('PUT', '/teacher/decks', { decks: [{ cardId: before.card.id, model: 'legacy-edit', items: before.deck.items }] }))
      .toMatchObject({ status: 409, body: { error: 'atomic_plan_required' } });
    expect(await call('DELETE', `/teacher/decks?cardId=${before.card.id}`))
      .toMatchObject({ status: 409, body: { error: 'atomic_plan_required' } });
    await pg.exec("insert into a2.observer_cards(date,course,section,title,mode,minutes,body) values('2026-10-28','algebra2','D','Legacy','pairs',10,'Still writable')");
    await pg.exec("update a2.observer_cards set body='Edited' where section='D'");
    const edited = inputs(); edited.lessonInputs.entry.teacherBrief.title = 'Atomic edit still succeeds';
    expect((await publish([request(edited, before.revision, before.scopeVersion)])).status).toBe(200);
    expect((await getPlan()).card.title).toBe('Atomic edit still succeeds');
    await expect(pg.query('update a2.observer_cards set body=$1 where id=$2', ['Flag must be reset', before.card.id])).rejects.toThrow('atomic_plan_required');
  });

  it('rolls back a failed rebuild of an existing plan including its legacy rows', async () => {
    await publish([request()]);
    const before = await getPlan();
    const compiled = compileSectionPlan(inputs());
    const bad = { course: 'algebra2', section: 'C', expectedScopeVersion: before.scopeVersion,
      operationId: 'failed-existing-publish', requestHash: 'failure', plans: [{ date, expectedRevision: before.revision,
        revision: 'a'.repeat(64), inputs: compiled.inputs, card: { ...compiled.card, title: 'Must roll back' },
        deck: { ...compiled.deck, items: null, contentHash: 'bad' }, package: compiled }] };
    await expect(store.apply([bad])).rejects.toBeDefined();
    expect(await getPlan()).toEqual(before);
    expect((await pg.query('select title from a2.observer_cards where id=$1', [before.card.id])).rows[0].title).toBe(before.card.title);
    expect((await pg.query('select items from a2.card_decks where card_id=$1', [before.card.id])).rows[0].items).toEqual(before.deck.items);
  });

  it('requires a deferral date and updates today after a same-day summary without replacing its prior evidence', async () => {
    await call('POST', '/class-log/summaries', summary({ date: '2026-10-25' }), phone);
    await publish([request(inputs('C', '2026-10-26'), null, (await scope()).version)]);
    await call('POST', '/class-log/summaries', summary({ landed: ['Today is complete.'] }), phone);
    const before = await getPlan('2026-10-26');
    const promise = (await scope()).commitments.find(row => row.kind === 'promise');
    const action = { course: 'algebra2', section: 'C', id: promise.id, status: 'deferred', expectedVersion: promise.version,
      operationId: 'defer-current-promise' };
    expect((await call('POST', '/class-log/commitments/status', action, phone)).status).toBe(400);
    expect((await call('POST', '/class-log/commitments/status', { ...action, deferredUntil: '2026-10-29' }, phone)).status).toBe(200);
    const after = await getPlan('2026-10-26');
    expect(after.revision).not.toBe(before.revision);
    expect(after.source.sourceDate).toBe('2026-10-25');
    expect(after.card.body).not.toContain(promise.text);
  });

  it('screens teacher authoring projections against the trusted current roster', async () => {
    const value = inputs(); value.lessonInputs.entry.teacherBrief.lastClass = 'Jordan finished the interval.';
    value.privacyNames = [];
    const saved = await publish([request(value)]);
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain('Jordan');
    const retrieved = await call('GET', `/teacher/plans?date=${date}`);
    expect(JSON.stringify(retrieved.body)).not.toContain('Jordan');
    expect((await store.snapshot('algebra2', 'C')).plans[0].inputs.lessonInputs.entry.teacherBrief.lastClass).toContain('Jordan');
  });

  it('adopts a reviewed recording once and updates other future plans in the same scope', async () => {
    await call('POST', '/class-log/summaries', summary(), phone);
    const initial = await scope();
    await publish([request(inputs('C', '2026-10-28'), null, initial.version)]);
    const snapshot = await store.snapshot('algebra2', 'C');
    const value = inputs(); value.lessonInputs.entry.continuity = {
      sourceDate: snapshot.latestSummary.date, sourceRecordedAt: snapshot.latestSummary.recordedAt,
      promises: ['Bring the reviewed graph.'], nextPrep: ['Finish piece B.'], landed: ['Reviewed stopping point.'],
    };
    expect((await publish([request(value, null, snapshot.version)])).status).toBe(200);
    const state = await scope();
    expect(state.commitments.find(row => row.text === 'Bring the worked example.').status).toBe('cancelled');
    expect(state.commitments.find(row => row.text === 'Bring the reviewed graph.').status).toBe('open');
    expect((await getPlan()).source.landed).toEqual(['Reviewed stopping point.']);
    expect((await getPlan('2026-10-28')).card.body).toContain('Bring the reviewed graph.');
    expect((await getPlan('2026-10-28')).card.body).not.toContain('Bring the worked example.');
  });

  it('keeps dated usable evidence and teacher corrections when a later recording is unusable', async () => {
    await call('POST', '/class-log/summaries', summary({ date: '2026-10-25' }), phone);
    const value = inputs(); value.decisions = [{ id: 'review-previous-source', set: { 'source.landed': ['Reviewed piece A.'] } }];
    await publish([request(value, null, (await scope()).version)]);
    const before = await getPlan();
    for (const markdown of ['The recording was unusable.', 'Transcript quality: poor', '---\nquality: poor\n---']) {
      expect((await call('POST', '/class-log/summaries', summary({ markdown, promises: ['Unreliable promise.'] }), phone)).status).toBe(200);
      expect(commitmentsFromSummary(summary({ markdown }))).toEqual([]);
    }
    const after = await getPlan();
    expect(after.source).toEqual(before.source);
    expect((await scope()).commitments.some(row => row.text === 'Unreliable promise.')).toBe(false);
    expect((await scope()).refreshPending).toBe(false);
    const promise = (await scope()).commitments.find(row => row.kind === 'promise');
    expect((await call('POST', '/class-log/commitments/status', { course: 'algebra2', section: 'C', id: promise.id,
      status: 'done', expectedVersion: promise.version, operationId: 'done-after-bad-recording' }, phone)).status).toBe(200);
  });

  it('keeps factual corrections bound to their recorded class while preserving future teaching directions', async () => {
    await call('POST', '/class-log/summaries', summary({ date: '2026-10-25' }), phone);
    const value = inputs(); value.decisions = [{ id: 'correct-recording-and-next-steps', set: {
      'source.landed': ['Corrected October25 result.'], 'teacherBrief.lastClass': 'Corrected October25 result.',
      'teacherBrief.today': ['Use the revised practice sequence.'],
    } }];
    await publish([request(value, null, (await scope()).version)]);
    expect((await store.snapshot('algebra2', 'C')).plans[0].inputs.decisions[0].sourceBinding.sourceDate).toBe('2026-10-25');
    await call('POST', '/class-log/summaries', summary({ landed: ['Confirmed October26 result.'] }), phone);
    const after = await getPlan();
    expect(after.source.sourceDate).toBe('2026-10-26');
    expect(after.source.landed).toEqual(['Confirmed October26 result.']);
    expect(after.card.body).not.toContain('Corrected October25 result.');
    expect(after.card.body).toContain('Use the revised practice sequence.');
  });
});
