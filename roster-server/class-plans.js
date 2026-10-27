// One persisted revision contains the card, rehearsal deck, and commitment
// snapshot. Legacy card/deck rows are updated in the same database transaction.
import express from 'express';
import { createHash } from 'node:crypto';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { CARD_COURSES, isIsoDate, validateCard } from './observer-card-rules.js';
import { validateItems, deckContentHash } from './deck-rules.js';
import { compileSectionPlan, planHash, sanitizePlanInput, adoptReviewedContinuity, bindDecisionSources } from './section-plan.js';

export const COMMITMENT_STATUSES = ['open', 'done', 'deferred', 'cancelled'];
const PAGE = 500;
const copy = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const text = value => typeof value === 'string' ? value.trim() : '';
const integer = value => Number.isSafeInteger(value) && value >= 0;

export class PlanError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function planScope(value) {
  const course = text(value?.course);
  const section = text(value?.section).toUpperCase();
  if (!CARD_COURSES.includes(course) || !/^[A-Z0-9_-]{1,16}$/.test(section)) throw new PlanError(400, 'invalid_scope');
  return { course, section };
}

export function validateStatusChange(body) {
  const scope = planScope(body);
  const id = text(body?.id), operationId = text(body?.operationId);
  if (!id || id.length > 128 || !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) throw new PlanError(400, 'invalid_operation');
  if (!COMMITMENT_STATUSES.includes(body.status) || !integer(body.expectedVersion) || body.expectedVersion < 1) {
    throw new PlanError(400, 'invalid_commitment_status');
  }
  const deferredUntil = body.deferredUntil ?? null;
  if (body.status === 'deferred' ? !isIsoDate(deferredUntil) : deferredUntil !== null) throw new PlanError(400, 'invalid_deferred_until');
  return { ...scope, id, operationId, status: body.status, expectedVersion: body.expectedVersion, deferredUntil };
}

export function validatePlanPut(body) {
  if (!Array.isArray(body?.plans) || !body.plans.length || body.plans.length > 20) throw new PlanError(400, 'invalid_plans');
  const seen = new Set();
  return body.plans.map(request => {
    const inputs = request?.inputs;
    const scope = planScope(inputs);
    if (!isIsoDate(inputs?.date) || !inputs.lessonInputs || typeof inputs.lessonInputs !== 'object') throw new PlanError(400, 'invalid_plan_inputs');
    if (!own(request, 'expectedRevision') || (request.expectedRevision !== null && !/^[a-f0-9]{32,64}$/.test(request.expectedRevision))) {
      throw new PlanError(400, 'expected_revision_required');
    }
    if (!integer(request.expectedScopeVersion)) throw new PlanError(400, 'expected_scope_version_required');
    const key = `${inputs.date}|${scope.course}|${scope.section}`;
    if (seen.has(key)) throw new PlanError(400, 'duplicate_plan');
    seen.add(key);
    return { ...request, inputs: { ...copy(inputs), ...scope } };
  });
}

export function schemaUnavailable(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}

function databaseError(error) {
  if (error instanceof PlanError) return error;
  if (error?.code === 'P0001' && /^(scope_conflict|plan_conflict|commitment_conflict|operation_conflict)/.test(error.message || '')) {
    return new PlanError(409, error.message.split(':')[0]);
  }
  if (error?.code === 'P0002' && error.message === 'commitment_not_found') return new PlanError(404, 'commitment_not_found');
  return error;
}

export function createClassPlanStore(client = createServiceClient()) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async snapshot(course, section) {
      return check(await client.rpc('class_plan_snapshot', { p_course: course, p_section: section }));
    },
    async listDate(date) {
      return check(await client.rpc('class_plans_for_date', { p_date: date })) || [];
    },
    async operation(course, section, operationId) {
      return check(await client.from('class_plan_operations').select('request_hash,result')
        .eq('course', course).eq('section', section).eq('operation_id', operationId).maybeSingle());
    },
    async apply(changes) {
      try { return check(await client.rpc('apply_class_plan_changes', { p_changes: changes })); }
      catch (error) { throw databaseError(error); }
    },
    async privacyNames() {
      const names = [];
      for (let start = 0; ; start += PAGE) {
        const rows = check(await client.from('roster').select('real_name').order('student_id').range(start, start + PAGE - 1)) || [];
        for (const row of rows) if (text(row.real_name)) names.push(row.real_name);
        if (rows.length < PAGE) return names;
      }
    },
  };
}

function todayInSchool(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
}

function summaryUsable(summary) {
  return summary && !/(?:recording|transcript)(?: was| is)? (?:unusable|unintelligible)|unusable recording|no usable (?:audio|recording)|(?:^|\n)\s*(?:transcriptQuality|quality|Transcript quality):\s*["']?poor\b/i.test(summary.markdown || '');
}

function summarySource(summary, date) {
  if (!summaryUsable(summary) || summary.date >= date) return null;
  return { sourceDate: summary.date, recordedAt: summary.recordedAt, landed: summary.landed || [],
    revision: summary.revision || null,
    questions: summary.studentQuestions || [], nextPrep: summary.nextPrep || [],
    transcriptPath: summary.transcriptPath || null, summaryPath: summary.summaryPath || null };
}

export function commitmentsFromSummary(summary) {
  if (!summaryUsable(summary)) return [];
  const out = [], seen = new Set();
  for (const [key, kind] of [['promises', 'promise'], ['nextPrep', 'prep']]) {
    for (const raw of summary[key] || []) {
      if (typeof raw !== 'string') continue;
      const value = raw.replace(/\s+/g, ' ').trim();
      if (!value || /^(?:none|n\/a|no (?:promises|next prep|follow.up)(?: recorded)?)[.!]?$/i.test(value)) continue;
      const id = createHash('md5').update(`${summary.course}|${summary.section}|${kind}|${value.toLowerCase()}`).digest('hex');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, course: summary.course, section: summary.section, kind, text: value, status: 'open',
        source: { date: summary.date, recordedAt: summary.recordedAt, revision: summary.revision || null, kind }, sourceDate: summary.date,
        dueDate: null, deferredUntil: null, version: 1 });
    }
  }
  return out;
}

function mergeCommitments(existing, incoming) {
  const byId = new Map(existing.map(row => [row.id, row]));
  // A repeated promise keeps its first provenance and its reviewed status.
  for (const row of incoming) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => (a.sourceDate || '').localeCompare(b.sourceDate || '') || a.id.localeCompare(b.id));
}

function changedCommitments(rows, change) {
  const before = rows.find(row => row.id === change.id);
  if (!before) throw new PlanError(404, 'commitment_not_found');
  if (before.version !== change.expectedVersion) throw new PlanError(409, 'commitment_conflict');
  if (before.status === change.status && (before.deferredUntil ?? null) === change.deferredUntil) return rows;
  return rows.map(row => row.id === change.id
    ? { ...row, status: change.status, deferredUntil: change.deferredUntil, version: row.version + 1 }
    : row);
}

function safeCommitments(rows, names) {
  return sanitizePlanInput({ commitments: rows }, names).commitments;
}

function phonePlan(plan) {
  const { inputs, effective, decisions, ...published } = plan;
  return published;
}

function compileStored(compiler, inputs, commitments, summary, names, expectedRevision) {
  const rawInputs = { ...copy(inputs), commitments: copy(commitments) };
  delete rawInputs.privacyNames;
  rawInputs.decisions = bindDecisionSources(rawInputs.decisions || [], rawInputs.source || summarySource(summary, inputs.date));
  // Keep the last usable, explicitly dated evidence when a later recording is
  // unusable. Saved teacher corrections still refer to that original evidence.
  if (summaryUsable(summary) && summary.date < inputs.date) rawInputs.source = summarySource(summary, inputs.date);
  const compiled = compiler({ ...rawInputs, privacyNames: names });
  if (!/^[a-f0-9]{32,64}$/.test(compiled.revision || '')) throw new PlanError(400, 'invalid_compiled_revision');
  const { id, updatedAt, ...rawCard } = compiled.card || {};
  const card = validateCard({ ...rawCard, date: inputs.date, course: inputs.course, section: inputs.section });
  if (card.body.length > 2000) throw new PlanError(400, 'card_too_long_for_phone');
  const items = validateItems(compiled.deck?.items);
  const model = compiled.deck?.model || 'section-plan-v1';
  const deck = { ...compiled.deck, items, model, date: inputs.date, course: inputs.course, section: inputs.section };
  const bundle = { schemaVersion: 1, date: inputs.date, course: inputs.course, section: inputs.section,
    revision: compiled.revision, card, deck, routine: compiled.routine || null,
    source: compiled.source || null, commitments: compiled.commitments || [] };
  return { date: inputs.date, expectedRevision, revision: compiled.revision, inputs: rawInputs,
    card, deck: { ...deck, contentHash: deckContentHash(items, model) }, package: bundle };
}

function resultBody(results, teacher = true) {
  return { ok: true, written: results.reduce((n, result) => n + result.written, 0),
    unchanged: results.reduce((n, result) => n + result.unchanged, 0),
    plans: results.flatMap(result => result.plans).map(plan => teacher ? plan : phonePlan(plan)),
    scopes: results.map(({ course, section, version }) => ({ course, section, version })) };
}

export function createClassPlanCoordinator({ store = createClassPlanStore(), compiler = compileSectionPlan, now = () => new Date() } = {}) {
  const currentPlans = snapshot => snapshot.plans.filter(plan => plan.date >= todayInSchool(now));
  const prepareExisting = (snapshot, commitments, summary, names, onlyAfterSummary = true) => currentPlans(snapshot)
    .filter(plan => !onlyAfterSummary || !summary || summary.date < plan.date)
    .map(plan => compileStored(compiler, plan.inputs, commitments,
      summary?.date < plan.date ? summary : null, names, plan.revision));

  async function replay(scope, operationId, requestHash) {
    const previous = await store.operation(scope.course, scope.section, operationId);
    if (!previous) return null;
    if (previous.request_hash !== requestHash) throw new PlanError(409, 'operation_conflict');
    return previous.result;
  }

  async function retryPending(course, section) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await store.snapshot(course, section);
      if (!snapshot.pendingSummary) return;
      const names = await store.privacyNames();
      const summary = snapshot.pendingSummary;
      const plans = prepareExisting(snapshot, snapshot.commitments, summary, names);
      const hash = planHash({ version: snapshot.version, summaryHash: snapshot.pendingSummaryHash });
      try {
        await store.apply([{ course, section, expectedScopeVersion: snapshot.version, operationId: `pending-${hash}`, requestHash: hash,
          commitments: snapshot.commitments, latestSummary: summary, latestSummaryHash: snapshot.pendingSummaryHash,
          clearPending: true, plans }]);
        return;
      } catch (error) { if (error.code !== 'scope_conflict' || attempt === 2) throw error; }
    }
  }

  return {
    async plans(date, filters = {}, teacher = false) {
      let plans = await store.listDate(date);
      const scopes = new Map(plans.map(plan => [`${plan.course}|${plan.section}`, plan]));
      for (const scope of scopes.values()) {
        try { await retryPending(scope.course, scope.section); } catch { /* serve the prior coherent package */ }
      }
      if (scopes.size) plans = await store.listDate(date);
      const names = teacher ? await store.privacyNames() : [];
      return plans.filter(plan => (!filters.course || plan.course === filters.course) && (!filters.section || plan.section === filters.section))
        .map(plan => teacher ? { ...plan, inputs: sanitizePlanInput(plan.inputs, names) } : phonePlan(plan));
    },

    async commitments(scope) {
      try { await retryPending(scope.course, scope.section); } catch { /* a status read does not discard recorded evidence */ }
      const [snapshot, names] = await Promise.all([store.snapshot(scope.course, scope.section), store.privacyNames()]);
      return { ...scope, version: snapshot.version, commitments: safeCommitments(snapshot.commitments, names),
        refreshPending: !!snapshot.pendingSummary };
    },

    async publish(requests) {
      const names = await store.privacyNames();
      const groups = new Map();
      for (const request of requests) {
        const scope = planScope(request.inputs), key = `${scope.course}|${scope.section}`;
        if (!groups.has(key)) groups.set(key, { scope, requests: [] });
        groups.get(key).requests.push(request);
      }
      const changes = [];
      for (const { scope, requests: scoped } of groups.values()) {
        const requestHash = planHash(scoped), operationId = `publish-${requestHash}`;
        const previous = await replay(scope, operationId, requestHash);
        if (previous) {
          changes.push({ ...scope, operationId, requestHash, expectedScopeVersion: 0, plans: [] });
          continue;
        }
        const snapshot = await store.snapshot(scope.course, scope.section);
        if (snapshot.pendingSummary) throw new PlanError(409, 'summary_refresh_pending');
        for (const request of scoped) {
          if (request.expectedScopeVersion !== snapshot.version) throw new PlanError(409, 'scope_conflict');
          const current = snapshot.plans.find(plan => plan.date === request.inputs.date);
          if ((current?.revision ?? null) !== request.expectedRevision) throw new PlanError(409, 'plan_conflict');
        }
        let commitments = snapshot.commitments;
        const reviewed = scoped.map(request => {
          const adopted = adoptReviewedContinuity(request.inputs, commitments, snapshot.latestSummary);
          commitments = adopted.commitments;
          return { ...request, inputs: adopted.inputs };
        });
        const plans = reviewed.map(request => compileStored(compiler, request.inputs, commitments,
          snapshot.latestSummary, names, request.expectedRevision));
        if (planHash(commitments) !== planHash(snapshot.commitments)) {
          const requestedDates = new Set(plans.map(plan => plan.date));
          plans.push(...prepareExisting(snapshot, commitments, snapshot.latestSummary, names, false)
            .filter(plan => !requestedDates.has(plan.date)));
        }
        changes.push({ ...scope, operationId, requestHash, expectedScopeVersion: snapshot.version, commitments, plans });
      }
      const result = resultBody(await store.apply(changes));
      result.plans = result.plans.map(plan => ({ ...plan, inputs: sanitizePlanInput(plan.inputs, names) }));
      return result;
    },

    async status(change) {
      const requestHash = planHash(change);
      for (let attempt = 0; attempt < 3; attempt++) {
        const names = await store.privacyNames();
        const previous = await replay(change, change.operationId, requestHash);
        if (previous) return { course: change.course, section: change.section, version: previous.version,
          commitments: safeCommitments(previous.commitments, names), replayed: true };
        const snapshot = await store.snapshot(change.course, change.section);
        const commitments = changedCommitments(snapshot.commitments, change);
        const summary = snapshot.pendingSummary || snapshot.latestSummary;
        const plans = prepareExisting(snapshot, commitments, summary, names, false);
        try {
          const [result] = await store.apply([{ course: change.course, section: change.section,
            expectedScopeVersion: snapshot.version, operationId: change.operationId, requestHash, statusChange: change,
            commitments, plans, ...(snapshot.pendingSummary ? { latestSummary: summary,
              latestSummaryHash: snapshot.pendingSummaryHash, clearPending: true } : {}) }]);
          return { course: change.course, section: change.section, version: result.version,
            commitments: safeCommitments(result.commitments, names) };
        } catch (error) { if (error.code !== 'scope_conflict' || attempt === 2) throw error; }
      }
    },

    async ingestSummary(row) {
      const scope = planScope(row);
      const summary = { date: row.date, ...scope, model: row.model, recordedAt: row.recorded_at, markdown: row.markdown,
        landed: row.landed, promises: row.promises, studentQuestions: row.student_questions, nextPrep: row.next_prep,
        transcriptPath: row.transcript_path, summaryPath: row.summary_path };
      const { recordedAt, ...content } = summary;
      const summaryHash = planHash(content), operationId = `summary-${summaryHash}`;
      summary.revision = summaryHash;
      for (let attempt = 0; attempt < 3; attempt++) {
        const previous = await replay(scope, operationId, summaryHash);
        if (previous) return { ok: true, replayed: true };
        const snapshot = await store.snapshot(scope.course, scope.section);
        const commitments = mergeCommitments(snapshot.commitments, commitmentsFromSummary(summary));
        const currentSource = snapshot.pendingSummary || snapshot.latestSummary;
        const latest = !currentSource || summary.date >= currentSource.date ? summary : currentSource;
        const latestHash = latest === summary ? summaryHash : snapshot.pendingSummaryHash || snapshot.latestSummaryHash;
        let plans, pending = false;
        try { plans = prepareExisting(snapshot, commitments, latest, await store.privacyNames()); }
        catch { plans = []; pending = true; }
        const sourceChange = pending ? { pendingSummary: latest, pendingSummaryHash: latestHash }
          : { latestSummary: latest, latestSummaryHash: latestHash, clearPending: true };
        try {
          await store.apply([{ ...scope, expectedScopeVersion: snapshot.version, operationId, requestHash: summaryHash,
            summary: { ...row, ...scope }, summaryRevision: summaryHash, commitments, plans, ...sourceChange }]);
          return { ok: true, planRefreshPending: pending };
        } catch (error) { if (error.code !== 'scope_conflict' || attempt === 2) throw error; }
      }
    },
  };
}

const coordinators = new WeakMap();
export function classPlanCoordinatorFor(app, options = {}) {
  if (options.coordinator) return options.coordinator;
  if (!coordinators.has(app)) coordinators.set(app, createClassPlanCoordinator(options));
  return coordinators.get(app);
}

function replyError(res, error) {
  const mapped = databaseError(error);
  if (mapped instanceof PlanError) return res.status(mapped.status).json({ error: mapped.code });
  return res.status(503).json({ error: 'Class plan service unavailable' });
}

function parserErrors(error, _req, res, next) {
  if (!error?.type) return next(error);
  res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: error.type === 'entity.too.large' ? 'too_large' : 'bad_json' });
}

function mountPlanRoutes(app, prefix, auth, options, teacher) {
  const coordinator = () => classPlanCoordinatorFor(app, options);
  const json = express.json({ limit: '2mb' });
  app.get(`${prefix}/plans`, auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!isIsoDate(req.query.date)) throw new PlanError(400, 'invalid_date');
      const filters = {};
      if (req.query.course !== undefined && !CARD_COURSES.includes(req.query.course)) throw new PlanError(400, 'invalid_course');
      if (req.query.course) filters.course = req.query.course;
      if (req.query.section) filters.section = planScope({ course: req.query.course || 'algebra2', section: req.query.section }).section;
      res.json({ date: req.query.date, plans: await coordinator().plans(req.query.date, filters, teacher) });
    } catch (error) { replyError(res, error); }
  });
  app.get(`${prefix}/commitments`, auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await coordinator().commitments(planScope(req.query))); }
    catch (error) { replyError(res, error); }
  });
  app.post(`${prefix}/commitments/status`, auth, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await coordinator().status(validateStatusChange(req.body))); }
    catch (error) { replyError(res, error); }
  }, parserErrors);
  if (!teacher) return;
  app.put(`${prefix}/plans`, auth, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await coordinator().publish(validatePlanPut(req.body))); }
    catch (error) { replyError(res, error); }
  }, parserErrors);
}

export function mountClassPlans(app, options = {}) {
  const auth = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const verdict = checkClassLogToken(req, options.env || process.env);
    if (verdict === 'ok') return next();
    res.status(verdict === 'unconfigured' ? 503 : 401).end();
  };
  mountPlanRoutes(app, '/class-log', auth, options, false);
}

export function mountTeacherPlans(app, options = {}) {
  const auth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let accepted = false;
    try { accepted = await requireTeacher(req, options.db); } catch { /* deny */ }
    if (!accepted) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };
  mountPlanRoutes(app, '/teacher', auth, options, true);
}
