#!/usr/bin/env node
// Durable conversation handoff and atomic class-plan publication.
//   node scripts/plan-next-class.mjs context --section C --date 2026-10-27
//   node scripts/plan-next-class.mjs decide --section C --date 2026-10-27 --decision edits.json
//   node scripts/plan-next-class.mjs publish --per-section [--date YYYY-MM-DD]
// An edit file is {id,at?,set:{"teacherBrief.today":["..."],...}}. IDs are
// idempotency keys. A new correction gets a new ID. Explicit overrides survive
// later summary revisions. No model is called, and no day-log fields are edited.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptReviewedContinuity, compileSectionPlan, mergeDecisionJournal, reviewedHandoffDecisions, sanitizePlanInput } from '../roster-server/section-plan.js';
import { cardLessons } from '../roster-server/lesson-deck.js';
import { isIsoDate } from '../roster-server/observer-card-rules.js';
import { rosterNameHits } from '../roster-server/deck-rules.js';
import { isKnown } from '../roster-server/node-mastery.js';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { addDays, nextClassDay } from './draft-tomorrow.mjs';
import { todayInNewYork } from './push-schedule.mjs';
import { loadTrees, loadRosterFirstNames } from './draft-card-decks.mjs';
import { loadContinuitySources, continuityFor } from './lib/class-continuity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECTIONS = ['C', 'D', 'G'];
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const optionalJson = path => existsSync(path) ? readJson(path) : null;

export function parsePlanArgs(argv) {
  const remaining = [...argv];
  const command = remaining[0] && !remaining[0].startsWith('--') ? remaining.shift() : 'context';
  if (!['context', 'compile', 'decide', 'publish'].includes(command)) throw new Error('command must be context, compile, decide or publish');
  const args = { command, offline: false, perSection: false, rebase: false };
  for (let i = 0; i < remaining.length; i++) {
    const key = remaining[i];
    if (['--offline', '--per-section', '--rebase'].includes(key)) {
      args[key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true;
      continue;
    }
    if (!['--root', '--date', '--section', '--decision', '--server', '--secret', '--out', '--device'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = remaining[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
  }
  if (args.date != null && !isIsoDate(args.date)) throw new Error('--date must be a real YYYY-MM-DD date');
  if (args.section) args.section = args.section.replace(/^period\s*/i, '').toUpperCase();
  if (args.section && !SECTIONS.includes(args.section)) throw new Error('--section must be C, D or G');
  if (!args.section && !args.perSection) throw new Error('select --section or --per-section');
  if (command === 'decide' && (!args.decision || !args.section)) throw new Error('decide needs --section and --decision FILE');
  if (args.decision && command !== 'decide') throw new Error('--decision is only for decide');
  if (args.offline && command === 'publish') throw new Error('publish requires the server');
  return args;
}

export function planTargets(year, { date, section, today = todayInNewYork() }) {
  const from = date || addDays(today, 1);
  return (section ? [section] : SECTIONS).map(selected => ({
    date: nextClassDay(year, selected, from), course: 'algebra2', section: selected,
  })).filter(target => target.date);
}

function artifactPath(root, target) {
  return resolve(root, 'roster-local/class-plans', `${target.date}-${target.section}.json`);
}

function atomicJson(path, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { flag: 'wx' });
  renameSync(temporary, path);
}

async function requestJson(server, path, secret, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(server.replace(/\/+$/, '') + path, {
    method, headers: { 'x-teacher-secret': secret, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  // Never copy a remote error body, which could contain a key or private source.
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${response.status}${response.status === 409 ? ' (plan changed; reload context before retrying)' : ''}`);
  return result;
}

function newestSource(left, right) {
  if (!left) return right;
  if (!right) return left;
  const key = source => `${source.sourceDate ?? source.date}|${source.recordedAt ?? ''}`;
  return key(left) >= key(right) ? left : right;
}

// Adopt an already reviewed day-log handoff into the durable decision journal.
// Once adopted, a newer automatic transcript cannot silently erase the review.
export function legacyReviewDecisions(entry, source) {
  return reviewedHandoffDecisions(entry, source);
}

export function combinePlanInputs({ target, entry, trees, source, saved, remote, commitments, knownNodeIds = [] }) {
  const remoteInputs = remote?.inputs;
  const savedInputs = saved?.inputs;
  const authored = entry || remoteInputs?.lessonInputs?.entry || savedInputs?.lessonInputs?.entry;
  if (!authored) throw new Error(`${target.date} ${target.section}: no authored class entry`);
  const journal = mergeDecisionJournal(remoteInputs?.decisions || [], savedInputs?.decisions || []);
  const decisions = mergeDecisionJournal(legacyReviewDecisions(authored, source), journal);
  const remoteIds = new Set((remoteInputs?.decisions || []).map(decision => decision.id));
  const pending = (savedInputs?.decisions || []).filter(decision => !remoteIds.has(decision.id));
  const conflict = Boolean(remote && pending.length && saved?.expectedRevision !== remote.revision);
  const assets = Object.keys(trees).length ? trees : remoteInputs?.lessonInputs?.trees || savedInputs?.lessonInputs?.trees || {};
  const lessons = cardLessons(authored.lesson, authored.observerCard, assets);
  const sourceInputs = remoteInputs || savedInputs || {};
  const inputs = {
    schemaVersion: 1, ...target,
    lessonInputs: { ...sourceInputs.lessonInputs, entry: authored,
      trees: Object.fromEntries(lessons.map(lesson => [lesson, assets[lesson]])), knownNodeIds },
    source: newestSource(newestSource(remoteInputs?.source, savedInputs?.source), source),
    decisions, commitments,
  };
  return { inputs, conflict };
}

export async function loadPlanContext({ root, target, offline = false, server, secret, device = 's24', fetchImpl = fetch }) {
  const dayLog = readJson(resolve(root, 'content/a2/day-log.json'));
  const entry = (dayLog.entries || []).find(row => row.date === target.date && row.section === target.section && !row.cancelled);
  const saved = optionalJson(artifactPath(root, target));
  const query = new URLSearchParams(target).toString();
  let remote = null;
  let scope = { version: saved?.expectedScopeVersion ?? 0, commitments: saved?.inputs?.commitments || [] };
  if (!offline) {
    const [plans, state] = await Promise.all([
      requestJson(server, `/teacher/plans?${query}`, secret, { fetchImpl }),
      requestJson(server, `/teacher/commitments?${new URLSearchParams({ course: target.course, section: target.section })}`, secret, { fetchImpl }),
    ]);
    remote = (plans.plans || []).find(plan => plan.date === target.date && plan.course === target.course && plan.section === target.section) || null;
    scope = state;
  }
  const summaries = loadContinuitySources(root);
  const source = continuityFor({ summaries, entry: entry || { ...target }, entries: dayLog.entries });
  const trees = loadTrees(resolve(root, 'content/a2/lesson-trees'));
  const author = entry || remote?.inputs?.lessonInputs?.entry || saved?.inputs?.lessonInputs?.entry;
  const lessons = author ? cardLessons(author.lesson, author.observerCard, trees) : [];
  let knownNodeIds = remote?.inputs?.lessonInputs?.knownNodeIds || saved?.inputs?.lessonInputs?.knownNodeIds || [];
  if (!offline && lessons.length) {
    const rows = await Promise.all(lessons.map(lesson => requestJson(server,
      `/teacher/mastery?${new URLSearchParams({ course: target.course, lesson, device })}`, secret, { fetchImpl })));
    knownNodeIds = rows.flatMap(result => (result.rows || result.nodes || []).filter(row => isKnown(row.p)).map(row => row.nodeId ?? row.node_id));
  }
  const combined = combinePlanInputs({ target, entry, trees, source, saved, remote,
    commitments: scope.commitments || [], knownNodeIds });
  const reviewed = adoptReviewedContinuity(combined.inputs, combined.inputs.commitments, combined.inputs.source);
  combined.inputs = { ...reviewed.inputs, commitments: reviewed.commitments };
  return {
    schemaVersion: 1, ...target, ...combined,
    expectedRevision: remote?.revision ?? saved?.expectedRevision ?? null,
    expectedScopeVersion: scope.version ?? 0,
    currentPlan: remote || saved?.plan || null,
    inactiveSourceDecisions: combined.inputs.decisions.filter(decision => decision.sourceBinding
      && decision.sourceBinding.sourceDate !== combined.inputs.source?.sourceDate).map(decision => decision.id),
    handoff: 'Review the saved source and open commitments. Factual corrections retain their recording date and apply to later summaries of that class only; today/IXL directives persist. Record explicit edits with a new decision ID, then compile and publish.',
  };
}

function guardNames(root, plan) {
  const names = loadRosterFirstNames(resolve(root, 'roster-local'));
  const items = [{ id: 'teacher-card', front: plan.card.title, back: plan.card.body }, ...plan.deck.items];
  if (rosterNameHits(items, names).length) throw new Error('plan contains a roster first name; remove names from the source or explicit edits');
}

export async function runPlanCommand(args, { fetchImpl = fetch } = {}) {
  const root = resolve(args.root || REPO_ROOT);
  const year = readJson(resolve(root, 'data/a2-school-year.json'));
  const targets = planTargets(year, args);
  const server = resolveUrl(args.server);
  const secret = args.secret || resolveTeacherSecret(root) || process.env.TEACHER_KEY;
  if (!args.offline && !secret) throw new Error('teacher secret is required; use --offline for saved context');
  const contexts = [];
  for (const target of targets) contexts.push(await loadPlanContext({ root, target, offline: args.offline, server, secret, device: args.device, fetchImpl }));
  if (args.command === 'context') {
    const names = loadRosterFirstNames(resolve(root, 'roster-local'));
    const result = { schemaVersion: 1, contexts: contexts.map(context => ({ ...context,
      inputs: sanitizePlanInput(context.inputs, names),
      currentPlan: context.currentPlan ? { ...context.currentPlan,
        ...(context.currentPlan.inputs ? { inputs: sanitizePlanInput(context.currentPlan.inputs, names) } : {}) } : null,
    })) };
    if (args.out) atomicJson(resolve(args.out), result);
    return result;
  }
  const addition = args.command === 'decide' ? readJson(resolve(args.decision)) : null;
  const artifacts = contexts.map(context => {
    if (context.conflict && !args.rebase) throw new Error(`${context.date} ${context.section}: saved decisions are based on an older plan; review context and use --rebase`);
    const inputs = { ...context.inputs, decisions: mergeDecisionJournal(context.inputs.decisions, addition ? [addition] : []) };
    const plan = compileSectionPlan({ ...inputs, privacyNames: loadRosterFirstNames(resolve(root, 'roster-local')) });
    guardNames(root, plan);
    return { schemaVersion: 1, expectedRevision: context.expectedRevision,
      expectedScopeVersion: context.expectedScopeVersion, inputs: plan.inputs, plan };
  });
  // Every target must compile before any publication. The server transaction then
  // checks all revisions/scopes and changes each card/deck pair together.
  let publication = null;
  if (args.command === 'publish' && artifacts.length) {
    publication = await requestJson(server, '/teacher/plans', secret, { method: 'PUT', fetchImpl,
      body: { plans: artifacts.map(({ inputs, expectedRevision, expectedScopeVersion }) => ({ inputs, expectedRevision, expectedScopeVersion })) } });
    for (const artifact of artifacts) {
      const published = publication.plans?.find(plan => plan.date === artifact.plan.date && plan.section === artifact.plan.section && plan.course === artifact.plan.course);
      if (published) { artifact.plan = published; artifact.inputs = published.inputs || artifact.inputs; artifact.expectedRevision = published.revision; }
      const scope = publication.scopes?.find(row => row.course === artifact.plan.course && row.section === artifact.plan.section);
      if (scope) artifact.expectedScopeVersion = scope.version;
    }
  }
  for (const artifact of artifacts) atomicJson(artifactPath(root, artifact.plan), artifact);
  const result = { schemaVersion: 1, plans: artifacts.map(artifact => artifact.plan), ...(publication ? { written: publication.written, unchanged: publication.unchanged } : {}) };
  if (args.out) atomicJson(resolve(args.out), result);
  return result;
}

async function main() {
  const args = parsePlanArgs(process.argv.slice(2));
  const result = await runPlanCommand(args);
  if (args.command === 'context') console.log(JSON.stringify(result, null, 2));
  else console.log(JSON.stringify({ plans: result.plans.map(plan => ({ date: plan.date, section: plan.section, revision: plan.revision, items: plan.deck.items.length })),
    ...(result.written != null ? { written: result.written, unchanged: result.unchanged } : {}) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('plan-next-class: ' + error.message); process.exitCode = 1; });
}
