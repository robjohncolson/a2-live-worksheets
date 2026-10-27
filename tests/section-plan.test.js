// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { adoptReviewedContinuity, compileSectionPlan, mergeDecisionJournal } from '../roster-server/section-plan.js';
import { combinePlanInputs, legacyReviewDecisions, parsePlanArgs, runPlanCommand } from '../scripts/plan-next-class.mjs';

const id = number => String(number).padStart(12, '0');
const date = '2026-10-27';
const entry = { date, section: 'C', lesson: '1-3',
  observerCard: { title: 'Examples 3 and 5', mode: 'other', minutes: 90, frame: null, body: 'Example 3 and Example 5: compare intervals and endpoints.' },
  teacherBrief: { title: 'Step functions, then quiz', ixl: ['RVD: evaluate a step function.'], lastClass: 'Monday handoff pending confirmation.', today: ['Finish the assigned examples, then quiz.'] } };

function tree() {
  const node = (n, type, source, after = [], teaching) => ({ id: id(n), type, source, front: `Question ${n}?`, back: `Answer ${n}.`, order: n, after, minute: type === 'step' ? 4 : null, ...(teaching ? { teaching } : {}) });
  return { lesson: '1-3', nodes: [
    node(1, 'frame', 'objectives.essentialQuestion'), node(2, 'anchor', 'quizFocus.what', [id(1)]),
    node(3, 'anchor', 'quizFocus.answer', [id(1)]), node(4, 'anchor', 'quizFocus.needs[0]', [id(2)]),
    node(5, 'anchor', 'quizFocus.needs[1]', [id(2)]), node(6, 'anchor', 'objectives.language.words.interval', [id(1)]),
    node(7, 'anchor', 'objectives.language.words.piece', [id(1)]), node(8, 'anchor', 'dok3.task', [id(1)]),
    node(9, 'anchor', 'ixl.RVD', [id(1)]), node(10, 'step', 'examples[n=3]', [id(1)]), node(11, 'step', 'examples[n=5]', [id(10)]),
    node(12, 'cue', 'examples[n=3].teacherPrompts.q0.part0', [id(10)], { promptKey: 'ex3-q0' }),
    node(13, 'cue', 'examples[n=3].teacherPrompts.q0.part1', [id(12)], { promptKey: 'ex3-q0' }),
    node(14, 'cue', 'examples[n=3].teacherPrompts.q1', [id(10)], { promptKey: 'ex3-q1' }),
    node(15, 'cue', 'examples[n=5].teacherPrompts.q0.part0', [id(11)], { promptKey: 'ex5-q0' }),
    node(16, 'cue', 'examples[n=5].teacherPrompts.q0.part1', [id(15)], { promptKey: 'ex5-q0' }),
    node(17, 'cue', 'examples[n=5].teacherPrompts.q0.part2', [id(16)], { promptKey: 'ex5-q0' }),
  ] };
}

const source = { sourceDate: '2026-10-26', recordedAt: '2026-10-26T18:00:00Z', model: 'saved-summary', transcriptPath: 'private/recording.txt',
  landed: ['Example 3 final piece was not completed.'], questions: ['Why is the left endpoint open?'], nextPrep: [] };
const commitments = [
  { id: 'promise-a', text: 'Return to the endpoint question before the quiz.', status: 'open', sourceDate: '2026-09-20', kind: 'promise', version: 1 },
  { id: 'promise-b', text: 'Bring the parking-cost table.', status: 'open', sourceDate: '2026-10-20', kind: 'prep', version: 1 },
  { id: 'promise-c', text: 'Check the range examples.', status: 'open', sourceDate: '2026-10-22', kind: 'promise', version: 1 },
];
const input = () => ({ schemaVersion: 1, date, course: 'algebra2', section: 'C', lessonInputs: { entry, trees: { '1-3': tree() }, knownNodeIds: [] }, source, commitments, decisions: [] });

describe('one deterministic section plan', () => {
  it('derives one paired package, keeps durable actions atomic and preserves all six TE parts', () => {
    const raw = input();
    const plan = compileSectionPlan(raw);
    expect(plan.deck.items).toHaveLength(14);
    expect(plan.deck.items.filter(item => !item.node).map(item => item.back)).toEqual([...commitments].reverse().map(item => item.text));
    expect(plan.deck.items.filter(item => [12, 13, 14, 15, 16, 17].map(id).includes(item.node))).toHaveLength(6);
    expect(plan.deck.items.filter(item => item.node).every(item => item.id === item.node)).toBe(true);
    expect(plan.routine).toEqual(entry.observerCard);
    expect(plan.source).toMatchObject({ transcriptPath: source.transcriptPath, model: source.model });
    expect(plan.card.body).toContain('2026-09-20');
    expect(plan.card.body).toContain('not completed');
    expect(plan.card.body.startsWith('## IXL drills')).toBe(true);
    const fronts = plan.deck.items.filter(item => !item.node).map(item => item.front);
    expect(new Set(fronts).size).toBe(fronts.length);
    expect(raw).toEqual(input());
  });

  it('ignores property order and audit clocks but changes identity and streak when content is corrected', () => {
    const base = compileSectionPlan(input());
    const reordered = Object.fromEntries(Object.entries(input()).reverse());
    reordered.commitments = commitments.map(item => ({ ...item, updatedAt: '2030-01-01T00:00:00Z' }));
    expect(compileSectionPlan(reordered).revision).toBe(base.revision);
    const changed = input();
    changed.commitments = commitments.map((item, i) => i ? item : { ...item, text: 'Return to the endpoint question after the quiz.' });
    const corrected = compileSectionPlan(changed);
    expect(corrected.revision).not.toBe(base.revision);
    expect(corrected.deck.items.find(item => item.back.includes('after the quiz')).id).not.toBe(base.deck.items.find(item => item.back.includes('before the quiz')).id);
    expect(compileSectionPlan(base.inputs)).toEqual(base);
  });

  it('persists explicit overrides across later source revisions and makes journal replay idempotent', () => {
    const decision = { id: 'teacher-001', at: '2026-10-26T20:00:00Z', set: { 'teacherBrief.today': ['Finish Example 5; postpone the quiz.'], 'source.landed': ['Example 3 final piece still needs work.'] } };
    const raw = { ...input(), decisions: mergeDecisionJournal([decision], [{ ...decision, at: '2026-10-26T21:00:00Z' }]) };
    expect(raw.decisions).toHaveLength(1);
    raw.source = { ...source, recordedAt: '2026-10-26T22:00:00Z', landed: ['Automatic revision claims completion.'] };
    const plan = compileSectionPlan(raw);
    expect(plan.card.body).toContain('postpone the quiz');
    expect(plan.card.body).toContain('still needs work');
    expect(plan.card.body).not.toContain('claims completion');
    expect(() => mergeDecisionJournal([decision], [{ ...decision, set: { 'teacherBrief.today': ['Something else.'] } }])).toThrow(/already recorded/);
    expect(() => mergeDecisionJournal([], [{ id: 'bad', set: { section: 'D' } }])).toThrow(/unsupported/);
  });

  it('never relabels old reviewed or explicitly corrected facts as a later class recording', () => {
    const raw = input();
    raw.date = '2026-10-29';
    raw.lessonInputs = { ...raw.lessonInputs, entry: { ...entry, date: raw.date, continuity: {
      sourceDate: source.sourceDate, sourceRecordedAt: source.recordedAt, landed: ['Reviewed old-class account.'], promises: [], nextPrep: [], questions: [],
    } } };
    raw.commitments = [];
    const adopted = adoptReviewedContinuity(raw, [], source);
    const oldPlan = compileSectionPlan({ ...adopted.inputs, decisions: mergeDecisionJournal(adopted.inputs.decisions, [{ id: 'explicit-facts',
      set: { 'source.landed': ['Teacher corrected the old-class account.'], 'teacherBrief.today': ['Keep the explicit quiz plan.'] } }]) });
    const sameDate = compileSectionPlan({ ...oldPlan.inputs, source: { ...source, recordedAt: '2026-10-26T23:59:00Z', landed: ['AI tries to replace corrected account.'] } });
    expect(sameDate.card.body).toContain('Teacher corrected the old-class account.');
    const later = compileSectionPlan({ ...oldPlan.inputs, source: { ...source, sourceDate: '2026-10-27', recordedAt: '2026-10-27T20:00:00Z', landed: ['The later class reached Example 5.'] } });
    expect(later.card.body).toContain('The later class reached Example 5.');
    expect(later.card.body).not.toContain('old-class account');
    expect(later.card.body).toContain('Keep the explicit quiz plan.');
    expect(later.inputs.decisions.every(decision => decision.sourceBinding.sourceDate === '2026-10-26')).toBe(true);
  });

  it('removes done/cancelled work, keeps deferred work out until due and does not expire old open promises', () => {
    const raw = input();
    raw.commitments = [
      commitments[0], { ...commitments[1], status: 'done' }, { ...commitments[2], status: 'cancelled' },
      { id: 'later', text: 'Bring the new packet.', status: 'deferred', sourceDate: '2026-10-20', deferredUntil: '2026-10-29' },
      { id: 'due', text: 'Check the old homework.', status: 'deferred', sourceDate: '2026-10-20', deferredUntil: date },
    ];
    const plan = compileSectionPlan(raw);
    const daily = plan.deck.items.filter(item => !item.node).map(item => item.back).join('\n');
    expect(daily).toContain(commitments[0].text);
    expect(daily).toContain('Check the old homework.');
    expect(daily).not.toContain(commitments[1].text);
    expect(daily).not.toContain('Bring the new packet.');
    expect(plan.commitments).toHaveLength(5);
    const anotherDate = { ...raw, commitments: raw.commitments.map(item => item.id === 'later' ? { ...item, deferredUntil: '2026-10-30' } : item) };
    expect(compileSectionPlan(anotherDate).revision).not.toBe(plan.revision);
  });

  it('keeps an explicit last-class correction visible after a later automatic summary revision', () => {
    const raw = input();
    raw.commitments = [];
    raw.decisions = [{ id: 'correct-last-class', set: { 'teacherBrief.lastClass': 'We finished Example 3 only; Example 5 is still pending.', 'teacherBrief.next': 'Quiz next class.' } }];
    raw.source = { ...source, recordedAt: '2026-10-26T23:00:00Z', landed: ['Example 5 completed according to revised AI summary.'] };
    const plan = compileSectionPlan(raw);
    expect(plan.card.body).toContain('## Last class\nWe finished Example 3 only; Example 5 is still pending.');
    expect(plan.card.body).not.toContain('according to revised AI');
    expect(plan.card.body).toContain('Quiz next class.');
    expect(plan.deck.items.find(item => !item.node).back).toContain('Example 5 is still pending.');
  });

  it('removes a stale authored recap when a valid latest source has no usable landed statements', () => {
    const raw = input();
    raw.source = { ...source, landed: [], questions: [] };
    expect(compileSectionPlan(raw).card.body).not.toContain('Monday handoff pending confirmation.');
    raw.privacyNames = ['Quinton'];
    raw.source.landed = ['Quinton scored 60 on the quiz.'];
    expect(compileSectionPlan(raw).card.body).not.toContain('Monday handoff pending confirmation.');
    raw.decisions = [{ id: 'explicit-recap', set: { 'teacherBrief.lastClass': 'Teacher confirmed the lesson remains unfinished.' } }];
    expect(compileSectionPlan(raw).card.body).toContain('Teacher confirmed the lesson remains unfinished.');
  });

  it('prioritizes explicit deadlines and recent promises without closing older open work', () => {
    const raw = input();
    raw.commitments = [...commitments,
      { id: 'due-now', text: 'Check the makeup deadline today.', status: 'open', dueDate: date, sourceDate: '2026-09-21' },
      { id: 'newest', text: 'Continue the last piece from yesterday.', status: 'open', sourceDate: '2026-10-26' },
    ];
    const plan = compileSectionPlan(raw);
    expect(plan.deck.items.filter(item => !item.node).map(item => item.back)).toEqual([
      'Check the makeup deadline today.', 'Continue the last piece from yesterday.', commitments[2].text,
    ]);
    expect(plan.commitments.find(item => item.id === 'promise-a').status).toBe('open');
    expect(plan.card.body).not.toContain(commitments[0].text);
    expect(plan.card.body).toContain('More context and open commitments are saved');
  });

  it('keeps a large historical backlog out of the concise card while preserving every commitment', () => {
    const raw = input();
    const historical = Array.from({ length: 24 }, (_, index) => ({ id: `history-${index}`,
      text: `Older follow-up ${index}: check the previously promised review material.`, status: 'open', sourceDate: '2026-09-01', kind: 'promise' }));
    raw.commitments = [...historical, ...commitments];
    const plan = compileSectionPlan(raw);
    const daily = plan.deck.items.filter(item => !item.node).map(item => item.back);
    expect((plan.card.body.match(/## Follow-up/g) || []).length).toBe(3);
    expect(daily.every(line => plan.card.body.includes(line))).toBe(true);
    expect(plan.card.body).not.toContain('Older follow-up');
    expect(plan.commitments).toHaveLength(27);
    expect(plan.commitments.filter(item => item.id.startsWith('history-')).every(item => item.status === 'open')).toBe(true);
    expect(plan.card.body.startsWith('## IXL drills')).toBe(true);
    expect(plan.card.body).toContain('## Today\n1. Finish the assigned examples, then quiz.');
    expect(plan.card.body.length).toBeLessThan(1000);
  });

  it('rejects mixed scope and invalid assets without generating half a package', () => {
    expect(() => compileSectionPlan({ ...input(), section: 'D' })).toThrow(/entry does not match/);
    expect(() => compileSectionPlan({ ...input(), source: { ...source, section: 'D' } })).toThrow(/source section/);
    expect(() => compileSectionPlan({ ...input(), commitments: [{ ...commitments[0], section: 'D' }] })).toThrow(/commitment section/);
    const missing = input(); missing.lessonInputs.trees = {};
    expect(() => compileSectionPlan(missing)).toThrow(/no lesson tree/);
    expect(() => compileSectionPlan({ ...input(), source: { ...source, sourceDate: date } })).toThrow(/precede/);
  });

  it('uses phone UTF-16 limits without clipping qualifiers or losing saved source evidence', () => {
    const raw = input();
    raw.commitments = [{ ...commitments[0], text: '\u{1F4D0}'.repeat(161) + ' not completed.' }];
    const plan = compileSectionPlan(raw);
    expect(plan.commitments[0].text).toContain('not completed');
    expect(plan.deck.items.filter(item => !item.node).some(item => item.back.includes('\u{1F4D0}'))).toBe(false);
    expect(plan.deck.items.every(item => item.front.length <= 240 && item.back.length <= 320)).toBe(true);
    expect(plan.card.body.length).toBeLessThanOrEqual(2000);
  });

  it('sanitizes rendered and saved projection text without retaining the trusted roster', () => {
    const raw = input();
    raw.privacyNames = ['Doe, Quinton'];
    raw.source = { ...source, landed: ['Quinton asked about the endpoint.', 'Quinton scored 60 on the quiz.',
      'Quinton: 60% on the quiz.', "Quinton's IXL result was 60%.", 'Whole-class IXL recovery requires 80%.'] };
    raw.commitments = [{ ...commitments[0], text: 'Show Quinton the domain boundary.' }];
    raw.decisions = [{ id: 'privacy-edit', set: { 'teacherBrief.today': ['Ask Quinton about endpoints.'] } }];
    const plan = compileSectionPlan(raw);
    expect(JSON.stringify(plan)).not.toContain('Quinton');
    expect(JSON.stringify(plan)).not.toContain('privacyNames');
    expect(JSON.stringify(plan)).not.toContain('scored 60');
    expect(JSON.stringify(plan)).not.toContain('60%');
    expect(plan.source.landed).toEqual(['a student asked about the endpoint.', 'Whole-class IXL recovery requires 80%.']);
    expect(raw.source.landed[0]).toContain('Quinton');
  });
});

const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'section-plan-'));
  folders.push(root);
  for (const folder of ['content/a2/lesson-trees', 'data', 'roster-local/class-summaries']) mkdirSync(resolve(root, folder), { recursive: true });
  writeFileSync(resolve(root, 'data/a2-school-year.json'), readFileSync(new URL('../data/a2-school-year.json', import.meta.url)));
  writeFileSync(resolve(root, 'content/a2/day-log.json'), JSON.stringify({ entries: [entry, { ...entry, section: 'D', date: '2026-10-28' }, { ...entry, section: 'G' }] }));
  writeFileSync(resolve(root, 'content/a2/lesson-trees/1-3.json'), JSON.stringify(tree()));
  writeFileSync(resolve(root, 'roster-local/class-summaries/index.json'), JSON.stringify([{ ...source, date: source.sourceDate, section: 'C', course: 'algebra2' }]));
  return root;
}

function fakeService({ failPublish = false } = {}) {
  const plans = new Map();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    const response = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (parsed.pathname === '/teacher/commitments') return response(200, { version: 2, commitments });
    if (parsed.pathname === '/teacher/mastery') return response(200, { rows: [{ nodeId: id(6), p: 0.95 }] });
    if (options.method === 'PUT') {
      if (failPublish) return response(409, { error: 'private error should not be copied' });
      const compiled = JSON.parse(options.body).plans.map(row => compileSectionPlan(row.inputs));
      for (const plan of compiled) plans.set(`${plan.date}|${plan.section}`, plan);
      return response(200, { written: compiled.length, unchanged: 0, plans: compiled, scopes: compiled.map(plan => ({ course: plan.course, section: plan.section, version: 2 })) });
    }
    return response(200, { plans: [...plans.values()].filter(plan => plan.date === parsed.searchParams.get('date') && plan.section === parsed.searchParams.get('section')) });
  };
  return { fetchImpl, calls, plans };
}

describe('durable conversation and atomic publication CLI', () => {
  it('adopts only a matching reviewed handoff and keeps later explicit decisions last', () => {
    const authored = { ...entry, continuity: { sourceDate: source.sourceDate, sourceRecordedAt: source.recordedAt,
      landed: ['Teacher reviewed: final piece still pending.'], promises: ['Review the final piece.'], nextPrep: [], questions: [] } };
    const adopted = legacyReviewDecisions(authored, source);
    expect(adopted).toHaveLength(1);
    expect(legacyReviewDecisions(authored, { ...source, recordedAt: 'new' })).toEqual([]);
    const saved = { inputs: { ...input(), decisions: [{ id: 'new-explicit', set: { 'source.landed': ['Teacher later confirmed completion.'] } }] } };
    const combined = combinePlanInputs({ target: { date, course: 'algebra2', section: 'C' }, entry: authored,
      trees: { '1-3': tree() }, source, saved, commitments: [] });
    expect(compileSectionPlan(combined.inputs).card.body).toContain('Teacher later confirmed completion.');
  });

  it('adopts reviewed promises durably without reopening statuses or superseding other recordings', () => {
    const raw = input();
    raw.lessonInputs = { ...raw.lessonInputs, entry: { ...entry, continuity: { sourceDate: source.sourceDate,
      sourceRecordedAt: source.recordedAt, landed: ['Reviewed account.'], promises: ['Reviewed promise.'], nextPrep: [] } } };
    const original = [
      { id: 'raw-current', kind: 'promise', text: 'Raw automatic promise.', status: 'open', version: 2,
        sourceDate: source.sourceDate, source: { date: source.sourceDate, recordedAt: source.recordedAt } },
      { id: 'old-recording', kind: 'promise', text: 'Older open promise.', status: 'open', version: 3,
        sourceDate: '2026-09-20', source: { date: '2026-09-20', recordedAt: 'old' } },
      { id: 'closed', kind: 'prep', text: 'Resolved preparation.', status: 'done', version: 4,
        sourceDate: source.sourceDate, source: { date: source.sourceDate, recordedAt: source.recordedAt } },
    ];
    const adopted = adoptReviewedContinuity(raw, original, source);
    expect(adopted.commitments.find(item => item.id === 'raw-current')).toMatchObject({ status: 'cancelled', version: 3 });
    expect(adopted.commitments.find(item => item.id === 'old-recording')).toEqual(original[1]);
    expect(adopted.commitments.find(item => item.id === 'closed')).toEqual(original[2]);
    expect(adopted.commitments.find(item => item.text === 'Reviewed promise.')).toMatchObject({ status: 'open', version: 1 });
    expect(adoptReviewedContinuity(adopted.inputs, adopted.commitments, source)).toEqual(adopted);
    expect(adoptReviewedContinuity(raw, original, { ...source, recordedAt: 'different' })).toEqual({ inputs: raw, commitments: original });
    expect(adoptReviewedContinuity(raw, original, { ...source, recordedAt: '2026-10-26T18:00:00+00:00' })).toEqual(adopted);
    expect(original[0].status).toBe('open');
  });
  it('loads section context, persists explicit decisions once, and keeps them after a summary refresh', async () => {
    const root = fixture();
    const service = fakeService();
    const args = parsePlanArgs(['context', '--root', root, '--date', date, '--section', 'C', '--server', 'http://fixture', '--secret', 'fixture']);
    const context = await runPlanCommand(args, service);
    expect(context.contexts[0].inputs.commitments[0].sourceDate).toBe('2026-09-20');
    expect(context.contexts[0].inputs.lessonInputs.knownNodeIds).toEqual([id(6)]);
    const decision = resolve(root, 'decision.json');
    writeFileSync(decision, JSON.stringify({ id: 'conversation-1', set: { 'teacherBrief.today': ['Use W67 first; quiz next class.'] } }));
    const decide = { ...args, command: 'decide', decision };
    const first = await runPlanCommand(decide, service);
    const again = await runPlanCommand(decide, service);
    expect(again.plans[0].revision).toBe(first.plans[0].revision);
    expect(again.plans[0].inputs.decisions).toHaveLength(1);
    writeFileSync(resolve(root, 'roster-local/class-summaries/index.json'), JSON.stringify([{ ...source, date: source.sourceDate, section: 'C', course: 'algebra2', recordedAt: '2026-10-26T23:00:00Z', landed: ['Example 5 still needs practice.'] }]));
    const revised = await runPlanCommand({ ...args, command: 'compile' }, service);
    expect(revised.plans[0].card.body).toContain('quiz next class');
    expect(revised.plans[0].card.body).toContain('still needs practice');
    expect(service.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
  });

  it('publishes every selected card/deck together in one CAS request and replays exact saved inputs', async () => {
    const root = fixture();
    const service = fakeService();
    const args = parsePlanArgs(['publish', '--root', root, '--date', date, '--per-section', '--server', 'http://fixture', '--secret', 'fixture']);
    const first = await runPlanCommand(args, service);
    expect(first.plans.map(plan => `${plan.date} ${plan.section}`)).toEqual(['2026-10-27 C', '2026-10-28 D', '2026-10-27 G']);
    let puts = service.calls.filter(call => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toBe('/teacher/plans');
    expect(puts[0].body.plans.every(row => row.expectedRevision === null && row.expectedScopeVersion === 2)).toBe(true);
    await runPlanCommand(args, service);
    puts = service.calls.filter(call => call.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[1].body.plans.map(row => row.expectedRevision)).toEqual(first.plans.map(plan => plan.revision));
    expect(puts[1].body.plans.map(row => compileSectionPlan(row.inputs).revision)).toEqual(first.plans.map(plan => plan.revision));
    expect(service.calls.some(call => ['/teacher/cards', '/teacher/decks'].includes(call.path))).toBe(false);
  });

  it('sends nothing when one section cannot compile, and leaves saved output intact after a server conflict', async () => {
    const root = fixture();
    const service = fakeService();
    const args = parsePlanArgs(['publish', '--root', root, '--date', date, '--per-section', '--server', 'http://fixture', '--secret', 'fixture']);
    const daylog = resolve(root, 'content/a2/day-log.json');
    const saved = readFileSync(daylog, 'utf8');
    const log = JSON.parse(saved); log.entries[1].lesson = '9-9';
    writeFileSync(daylog, JSON.stringify(log));
    await expect(runPlanCommand(args, service)).rejects.toThrow(/no lesson tree/);
    expect(service.calls.some(call => call.method === 'PUT')).toBe(false);
    writeFileSync(daylog, saved);
    await runPlanCommand({ ...args, command: 'compile', section: 'C' }, service);
    const artifact = resolve(root, 'roster-local/class-plans/2026-10-27-C.json');
    const before = readFileSync(artifact, 'utf8');
    await expect(runPlanCommand({ ...args, section: 'C' }, fakeService({ failPublish: true }))).rejects.toThrow(/HTTP 409/);
    expect(readFileSync(artifact, 'utf8')).toBe(before);
  });

  it('ready-only skips unauthored placeholders explicitly but still rejects malformed authored input atomically', async () => {
    const root = fixture();
    const service = fakeService();
    const args = parsePlanArgs(['publish', '--root', root, '--date', date, '--per-section', '--ready-only', '--server', 'http://fixture', '--secret', 'fixture']);
    const path = resolve(root, 'content/a2/day-log.json');
    const log = JSON.parse(readFileSync(path, 'utf8'));
    log.entries[0] = { date, section: 'C', lesson: '1-5' };
    writeFileSync(path, JSON.stringify(log));
    const result = await runPlanCommand(args, service);
    expect(result.plans.map(plan => plan.section)).toEqual(['D', 'G']);
    expect(result.skipped).toEqual([{ date, section: 'C', reason: expect.stringContaining('curriculum placeholder left unpublished') }]);
    expect(service.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    await expect(runPlanCommand({ ...args, readyOnly: false }, service)).rejects.toThrow(/authored observerCard/);
    const before = service.calls.filter(call => call.method === 'PUT').length;
    log.entries[0].observerCard = {};
    writeFileSync(path, JSON.stringify(log));
    await expect(runPlanCommand(args, service)).rejects.toThrow(/required/);
    expect(service.calls.filter(call => call.method === 'PUT')).toHaveLength(before);
    expect(() => parsePlanArgs(['context', '--section', 'C', '--ready-only'])).toThrow(/only for compile or publish/);
  });

  it('flags pending local edits against a changed remote revision and preserves command scope', () => {
    const decision = { id: 'pending', set: { 'teacherBrief.today': ['Explicit correction.'] } };
    const combined = combinePlanInputs({ target: { date, course: 'algebra2', section: 'C' }, entry, trees: { '1-3': tree() }, source,
      saved: { expectedRevision: 'old', inputs: { ...input(), decisions: [decision] } }, remote: { revision: 'new', inputs: input() }, commitments });
    expect(combined.conflict).toBe(true);
    expect(() => parsePlanArgs(['publish', '--section', 'C', '--offline'])).toThrow(/requires the server/);
    expect(() => parsePlanArgs(['decide', '--per-section', '--decision', 'x.json'])).toThrow(/needs --section/);
    const nightly = readFileSync(new URL('../tools/nightly_tomorrow.ps1', import.meta.url), 'utf8');
    expect(nightly).toContain("'publish', '--per-section'");
    expect(nightly).not.toContain('push-observer-cards.mjs');
    expect(nightly).not.toContain('draft-card-decks.mjs');
  });
});
