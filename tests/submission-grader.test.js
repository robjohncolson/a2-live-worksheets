// submission-grader.test.js — the teacher device's grade-from-submission core
// (OFFLINE_GRADING_MESH §3, §0.4, §0.8-0.11). Pure logic + a byte-match of the
// worksheet scorer against the SERVER's ledger.js (§0.10 one behavior) + an
// end-to-end sign→verify→suppress chain with the REAL crypto. @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';
import { scoreWorksheetAnswer as serverScoreWorksheet } from '../roster-server/ledger.js';
import { isCorrect as serverIsCorrect } from '../roster-server/scoring.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadGraderOnly() {
  const win = {};
  runInContext(readFileSync(resolve(repo, 'submission-grader.js'), 'utf8'),
    createContext({ window: win, globalThis: win, self: win, Math, String, Number, Array, Object, JSON, parseInt, isFinite, Infinity, console }));
  return win.SubmissionGrader;
}

describe('gradeableKind', () => {
  it('classifies auto vs human vs skip', () => {
    const G = loadGraderOnly();
    for (const s of ['worksheet', 'curriculum_quiz', 'pc']) expect(G.gradeableKind(s)).toBe('auto');
    expect(G.gradeableKind('frq')).toBe('human');
    for (const s of ['blooket', 'trainer', 'nope', '']) expect(G.gradeableKind(s)).toBe('skip');
  });
});

describe('worksheet scorer BYTE-MATCHES roster-server/ledger.js (§0.10)', () => {
  it('agrees with the server across exact/partial/empty/punctuation cases', () => {
    const G = loadGraderOnly();
    const cases = [
      ['means|mean', 'Means'], ['means|mean', 'the mean value'], ['means|mean', 'median'],
      ['0|zero', '0'], ['0|zero', ''], ['january', 'January!'], ['a.b/c-d', 'a.b/c-d'],
      ['x', '  X  '], ['foo|bar', 'foobar'], ['hello world', 'hello'], ['5', 'five'],
    ];
    for (const [key, resp] of cases) {
      expect(G.scoreWorksheetAnswer(key, resp), `${key} vs ${resp}`).toBe(serverScoreWorksheet(key, resp));
    }
  });
});

describe('autoScore', () => {
  let G;
  const answerKey = { 'U1-L2-Q01': { answerKey: 'D', type: 'multiple-choice' }, 'U1-PC-MCQ-A-Q05': { answerKey: 'B' } };
  const worksheetKey = { worksheetKey: { 'WS-U1L1-Q1': 'means|mean' } };
  const inputs = { answerKey, worksheetKey, isCorrect: serverIsCorrect };
  beforeAll(() => { G = loadGraderOnly(); });

  it('scores a worksheet blank against the worksheet key', () => {
    expect(G.autoScore({ source: 'worksheet', item_id: 'WS-U1L1-Q1', response: 'mean' }, inputs)).toBe(1);
    expect(G.autoScore({ source: 'worksheet', item_id: 'WS-U1L1-Q1', response: 'median' }, inputs)).toBe(0);
  });
  it('scores curriculum_quiz / pc MC against the answer key', () => {
    expect(G.autoScore({ source: 'curriculum_quiz', item_id: 'U1-L2-Q01', response: 'D' }, inputs)).toBe(1);
    expect(G.autoScore({ source: 'curriculum_quiz', item_id: 'U1-L2-Q01', response: 'A' }, inputs)).toBe(0);
    expect(G.autoScore({ source: 'pc', item_id: 'U1-PC-MCQ-A-Q05', response: 'b' }, inputs)).toBe(1);
  });
  it('returns null for FRQ, unkeyed items, and missing scorer (never fabricates a score)', () => {
    expect(G.autoScore({ source: 'frq', item_id: 'WS-U1L2-reflect1', response: 'essay' }, inputs)).toBeNull();
    expect(G.autoScore({ source: 'worksheet', item_id: 'WS-UNKNOWN', response: 'x' }, inputs)).toBeNull();
    expect(G.autoScore({ source: 'curriculum_quiz', item_id: 'U9-L9-Q99', response: 'A' }, inputs)).toBeNull();
    expect(G.autoScore({ source: 'curriculum_quiz', item_id: 'U1-L2-Q01', response: 'D' }, { answerKey, worksheetKey })).toBeNull(); // no isCorrect
  });
});

describe('deterministicReceiptFields (§0.8)', () => {
  it('derives ts/n purely from the submission (stable across calls)', () => {
    const G = loadGraderOnly();
    const sub = { receipt_id: 'abc123', recorded_at: '2026-06-30T12:00:00.000Z' };
    const a = G.deterministicReceiptFields(sub);
    const b = G.deterministicReceiptFields(sub);
    expect(a).toEqual(b);                                    // pure → identical
    expect(a.ts).toBe(Date.parse('2026-06-30T12:00:00.000Z')); // real date from the submission
    expect(a.n).toMatch(/^[0-9a-f]{8}$/);
    const c = G.deterministicReceiptFields({ receipt_id: 'different', recorded_at: '2026-06-30T12:00:00.000Z' });
    expect(c.n).not.toBe(a.n);                               // distinct submissions → distinct n
    expect(G.deterministicReceiptFields({})).toBeNull();
  });
  it('falls back to a hash-derived ts when recorded_at is missing/bad (still deterministic)', () => {
    const G = loadGraderOnly();
    const a = G.deterministicReceiptFields({ receipt_id: 'r1' });
    const b = G.deterministicReceiptFields({ receipt_id: 'r1', recorded_at: 'not-a-date' });
    expect(typeof a.ts).toBe('number');
    expect(a.ts).toBe(b.ts);                                 // same fallback for the same id
  });
});

describe('assignAttempt (§0.4/§0.9 — teacher-assigned, NEVER the student submission attempt)', () => {
  it('is always max existing GRADE attempt + 1, ignoring the forgeable submission.attempt', () => {
    const G = loadGraderOnly();
    // a student's forged submission.attempt=99 is IGNORED — the teacher assigns max([1,2])+1
    expect(G.assignAttempt({ source: 'worksheet', attempt: 99 }, [1, 2])).toBe(3);
    expect(G.assignAttempt({ source: 'frq', attempt: 99 }, [1, 2, 5])).toBe(6);
    expect(G.assignAttempt({ source: 'worksheet' }, [])).toBe(1);
  });
});

describe('buildGradeFields', () => {
  let G;
  beforeAll(() => { G = loadGraderOnly(); });
  const auto = { source: 'worksheet', item_id: 'WS-U1L1-Q1', student_id: 'stu-1', response: 'mean', attempt: 1, receipt_id: 'subR1' };

  it('carries sub + kv + deterministic ts/n for an AUTO grade; evidence is always practice', () => {
    const f = G.buildGradeFields(auto, { score: 1, keyVersion: 'kv-abc', existingAttempts: [2, 3] });
    expect(f.sid).toBe('stu-1');
    expect(f.src).toBe('worksheet');
    expect(f.sc).toBe(1);
    expect(f.a).toBe(4);                                    // teacher-assigned = max([2,3])+1, NOT submission.attempt
    expect(f.sub).toBe('subR1');                            // §0.7 suppression ref
    expect(f.kv).toBe('kv-abc');                            // §0.10
    expect(f.g).toBe('key');
    expect(f.e).toBe('practice');                           // §0.8: constant, never proctored
    const det = G.deterministicReceiptFields(auto);
    expect(f.ts).toBe(det.ts);                              // §0.8 deterministic
    expect(f.n).toBe(det.n);
  });

  it('a HUMAN (frq) grade is latest-wins (max attempt + 1), no forced deterministic ts/n', () => {
    const frq = { source: 'frq', item_id: 'WS-U1L2-reflect1', student_id: 'stu-1', response: 'my essay', receipt_id: 'subF1' };
    const f = G.buildGradeFields(frq, { score: 0.5, existingAttempts: [1, 2] });
    expect(f.a).toBe(3);
    expect(f.g).toBe('self');
    expect(f.sub).toBe('subF1');
    expect(f.ts).toBeUndefined();                           // human path leaves ts/n to the signer
  });
});

describe('planAutoGrades (§0.9 max-score-per-item + never-downgrade — the emit fix)', () => {
  let G;
  const answerKey = { 'U1-L2-Q01': { answerKey: 'D' } };
  const worksheetKey = { worksheetKey: { 'WS-U1L1-Q1': 'means|mean' } };
  const inputs = { answerKey, worksheetKey, isCorrect: serverIsCorrect };
  beforeAll(() => { G = loadGraderOnly(); });
  const S = (rid, over) => Object.assign({ source: 'worksheet', item_id: 'WS-U1L1-Q1', student_id: 'stu-1', receipt_id: rid }, over);

  it('grades ONLY the max-score submission per (sid,item) — a later wrong answer cannot win', () => {
    const subs = [
      S('a', { response: 'mean', attempt: 1 }),      // score 1
      S('b', { response: 'median', attempt: 2 }),    // score 0, LATER attempt
    ];
    const plans = G.planAutoGrades(subs, inputs, {});
    expect(plans.length).toBe(1);
    expect(plans[0].score).toBe(1);
    expect(plans[0].submission.receipt_id).toBe('a');    // the correct one, not the later wrong one
  });

  it('never-downgrades: skips a group whose max score does not beat the recorded score', () => {
    const subs = [S('c', { response: 'median', attempt: 3 })];   // score 0
    expect(G.planAutoGrades(subs, inputs, { 'stu-1|WS-U1L1-Q1': 1 })).toEqual([]);   // recorded 1 > 0 → skip
    // but a genuine upgrade IS planned
    const up = G.planAutoGrades([S('d', { response: 'mean' })], inputs, { 'stu-1|WS-U1L1-Q1': 0.5 });
    expect(up.length).toBe(1);
    expect(up[0].score).toBe(1);
  });

  it('ANTI-FARM (§0.9): a later wrong submission cannot bury an earlier correct grade', () => {
    // Simulate the emit loop across two gossip rounds. Ledger = {attempt -> score}.
    const key = 'stu-1|WS-U1L1-Q1';
    let ledger = [];   // grade rows {attempt, score}
    function emitRound(sub) {
      const recorded = {}; const attempts = ledger.map((r) => r.attempt);
      const maxScore = ledger.reduce((m, r) => Math.max(m, r.score), -Infinity);
      recorded[key] = ledger.length ? maxScore : null;
      const plans = G.planAutoGrades([sub], inputs, recorded);
      plans.forEach((p) => {
        const a = G.assignAttempt(p.submission, attempts);   // teacher-assigned = max+1
        ledger.push({ attempt: a, score: p.score });
      });
    }
    // The review's scenario: WRONG (student attempt=5) gossips first, then CORRECT (attempt=1).
    emitRound(S('wrong', { response: 'median', attempt: 5 }));   // score 0 → emitted at teacher-attempt 1
    emitRound(S('right', { response: 'mean', attempt: 1 }));     // score 1 → emitted at teacher-attempt 2
    // latestPerItem picks the HIGHEST teacher attempt → its score must be the correct 1.
    const winner = ledger.reduce((b, r) => (r.attempt > b.attempt ? r : b), ledger[0]);
    expect(winner.score).toBe(1);                                // correct answer wins, NOT buried
    // And a later WRONG resubmission can't farm it down (never-downgrade skips it).
    const before = ledger.length;
    emitRound(S('wrong2', { response: 'median', attempt: 99 }));
    expect(ledger.length).toBe(before);                          // nothing emitted
  });

  it('keeps students + items separate and skips FRQ/unkeyed', () => {
    const subs = [
      S('e', { response: 'mean', student_id: 'stu-1' }),
      S('f', { response: 'mean', student_id: 'stu-2' }),
      { source: 'frq', item_id: 'WS-U1L2-reflect1', student_id: 'stu-1', response: 'essay', receipt_id: 'g' },
    ];
    const plans = G.planAutoGrades(subs, inputs, {});
    expect(plans.length).toBe(2);                         // two students, FRQ excluded
    expect(plans.map((p) => p.submission.student_id).sort()).toEqual(['stu-1', 'stu-2']);
  });
});

describe('supersede (§0.9 max-score → min receipt_id, never attempt/ts)', () => {
  it('picks the max score; ties broken by the smallest receipt_id', () => {
    const G = loadGraderOnly();
    expect(G.supersede([{ score: 0.5, receipt_id: 'b' }, { score: 1, receipt_id: 'a' }]).receipt_id).toBe('a');
    // a LATER, LOWER-score submission must NOT win (no farming down)
    expect(G.supersede([{ score: 1, receipt_id: 'z', attempt: 1 }, { score: 0, receipt_id: 'y', attempt: 99 }]).score).toBe(1);
    // tie on score → lexicographically smallest receipt_id (deterministic)
    expect(G.supersede([{ score: 1, receipt_id: 'm' }, { score: 1, receipt_id: 'a' }]).receipt_id).toBe('a');
    expect(G.supersede([])).toBeNull();
  });
});
