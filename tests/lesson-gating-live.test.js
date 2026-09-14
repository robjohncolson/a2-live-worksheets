// lesson-gating-live.test.js — the LIVE-CODE differential harness for the lesson
// gate. Where lesson-gating.test.js model-checks a faithful MODEL of the gate,
// THIS file extracts the REAL functions from the Desk HTML
// (_isLessonComplete / _prevTopicInSequence / _prevSummerTopic / _isLessonUnlocked),
// executes them with stubbed globals, and runs the SAME invariants — so a drift
// between the shipping code and the model would FAIL here. (Layer A does this for
// the grade engine; this closes the rigor gap noted in GRADE_SIMULATION_FINDINGS.md.)
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

// Brace-match extractor (same shape as desk-lesson-gate.test.js's fnBody).
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

// Instantiate the REAL gate functions with stubbed globals. A mutable `state`
// object is read by the stubs so tests can vary the sequence / access mode.
function loadLiveGate() {
  const names = ['_isLessonComplete', '_prevTopicInSequence', '_prevSummerTopic', '_isLessonUnlocked'];
  const src = names.map((n) => fnBody(DESK, n)).join('\n\n');

  const state = { seq: [], summerSchedule: null, isTeacher: false, override: false };
  // Every lesson HAS a worksheet + a Blooket, and there are NO synced cws/blooket
  // scores — so _isLessonComplete is driven purely by `marks` (= our completed set).
  const getRegistryEntry = () => ({ urls: { worksheet: 'w', blooket: 'b' } });
  const _getCwsForTopic = () => null;
  const _blooketScoreFor = () => null;
  const _deskIsTeacher = () => state.isTeacher;
  const _isTopicLessonUnlocked = () => state.override;
  const _orderedPeriodTopics = () => state.seq;
  const windowStub = {};
  Object.defineProperty(windowStub, '_summerSchedule', { get: () => state.summerSchedule });

  const factory = new Function(
    'getRegistryEntry', '_getCwsForTopic', '_blooketScoreFor', 'DESK_WORKSHEET_DONE_THRESHOLD',
    '_deskIsTeacher', '_isTopicLessonUnlocked', '_orderedPeriodTopics', 'window',
    src + '\nreturn { _isLessonComplete, _prevTopicInSequence, _prevSummerTopic, _isLessonUnlocked };',
  );
  const fns = factory(
    getRegistryEntry, _getCwsForTopic, _blooketScoreFor, 60,
    _deskIsTeacher, _isTopicLessonUnlocked, _orderedPeriodTopics, windowStub,
  );
  return { fns, state };
}

// A completed topic = its worksheet + Blooket marks both carry a timestamp
// (exactly what _isLessonComplete reads).
function marksFor(set) {
  const m = {};
  for (const t of set) { m[t + '|worksheet'] = { ts: 1 }; m[t + '|blooket'] = { ts: 1 }; }
  return m;
}

const SEQ = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6'];

const guard = DESK ? describe : describe.skip;

guard('lesson gate (LIVE real Desk functions)', () => {
  const { fns, state } = loadLiveGate();

  function unlocked(topic, completedSet, seq = SEQ) {
    state.seq = seq;
    const prev = fns._prevTopicInSequence(topic);
    return fns._isLessonUnlocked(topic, null, prev, '2026-09-20', marksFor(completedSet), true);
  }

  // Reachable completion states under the REAL gate: complete(t) only if unlocked.
  function reachableStates(seq) {
    state.seq = seq;
    const seen = new Map();
    const order = [];
    const key = (set) => seq.filter((t) => set.has(t)).join(',');
    function visit(set) {
      const k = key(set);
      if (seen.has(k)) return;
      seen.set(k, set); order.push(set);
      for (const t of seq) {
        if (set.has(t)) continue;
        if (unlocked(t, set, seq)) { const nx = new Set(set); nx.add(t); visit(nx); }
      }
    }
    visit(new Set());
    return order;
  }

  function isPrefix(set, seq) {
    let gap = false;
    for (const t of seq) { if (set.has(t)) { if (gap) return false; } else gap = true; }
    return true;
  }

  it('00: the four gate functions extracted + instantiated', () => {
    expect(typeof fns._isLessonComplete).toBe('function');
    expect(typeof fns._isLessonUnlocked).toBe('function');
    expect(typeof fns._prevTopicInSequence).toBe('function');
    expect(typeof fns._prevSummerTopic).toBe('function');
  });

  it('01: REAL gate — all completion orders are reachable', () => {
    expect(reachableStates(SEQ)).toHaveLength(2 ** SEQ.length);
  });

  it('02: REAL gate — unlocked set is always a prefix (no gapped unlock)', () => {
    for (const set of reachableStates(SEQ)) {
      const u = new Set(SEQ.filter((t) => unlocked(t, set)));
      expect(isPrefix(u, SEQ)).toBe(true);
    }
  });

  it('03: REAL gate — no deadlock; full sequence reachable', () => {
    const states = reachableStates(SEQ);
    for (const set of states) {
      if (set.size === SEQ.length) continue;
      expect(SEQ.some((t) => !set.has(t) && unlocked(t, set))).toBe(true);
    }
    expect(states.some((s) => s.size === SEQ.length)).toBe(true);
  });

  it('04: REAL gate — missing predecessor never blocks access', () => {
    state.seq = SEQ;
    for (let i = 1; i < SEQ.length; i++) {
      expect(fns._prevTopicInSequence(SEQ[i])).toBe(SEQ[i - 1]);
      expect(unlocked(SEQ[i], new Set(SEQ.filter((t) => t !== SEQ[i - 1])))).toBe(true);
      expect(unlocked(SEQ[i], new Set([SEQ[i - 1]]))).toBe(true);
    }
  });

  it('05: REAL gate — monotonic: completing more never re-locks an unlocked lesson', () => {
    for (const set of reachableStates(SEQ)) {
      const before = SEQ.filter((t) => unlocked(t, set));
      for (const add of SEQ) {
        if (set.has(add)) continue;
        const bigger = new Set(set); bigger.add(add);
        for (const t of before) expect(unlocked(t, bigger)).toBe(true);
      }
    }
  });

  it('06: REAL gate — cross-portion combined-topic bridge (summer parts ⇒ fall combined)', () => {
    const fall = ['1.1', '1.2+1.3', '1.4+1.5'];
    state.seq = fall;
    expect(fns._prevTopicInSequence('1.4+1.5')).toBe('1.2+1.3');
    expect(unlocked('1.4+1.5', new Set(['1.2', '1.3']), fall)).toBe(true);   // both parts done
    expect(unlocked('1.4+1.5', new Set(['1.2']), fall)).toBe(true);          // only one part
  });

  it('07: REAL gate — access modes (signed-out / teacher / override) open any lesson', () => {
    state.seq = SEQ;
    const prev = fns._prevTopicInSequence('1.3');
    const noMarks = marksFor(new Set());
    expect(fns._isLessonUnlocked('1.3', null, prev, '2026-09-20', noMarks, false)).toBe(true); // signed-out
    state.isTeacher = true;
    expect(fns._isLessonUnlocked('1.3', null, prev, '2026-09-20', noMarks, true)).toBe(true);
    state.isTeacher = false;
    state.override = true;
    expect(fns._isLessonUnlocked('1.3', null, prev, '2026-09-20', noMarks, true)).toBe(true);
    state.override = false;
    expect(fns._isLessonUnlocked('1.3', null, prev, '2026-09-20', noMarks, true)).toBe(true); // no override needed
  });

  it('08: REAL _prevSummerTopic reads window._summerSchedule order', () => {
    state.summerSchedule = { lessons: [{ topic: '1.1' }, { topic: '1.2' }, { topic: '1.3' }] };
    expect(fns._prevSummerTopic('1.2')).toBe('1.1');
    expect(fns._prevSummerTopic('1.1')).toBe(null);   // first → null
    expect(fns._prevSummerTopic('9.9')).toBe(null);   // unknown → null
  });
});
