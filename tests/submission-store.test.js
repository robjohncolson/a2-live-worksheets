// submission-store.test.js — the submissions G-Set + grade-gated suppression
// (OFFLINE_GRADING_MESH_SPEC §2, §0.7). @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'submission-store.js'), 'utf8');

function load() {
  const win = {};
  const ctx = createContext({
    window: win, globalThis: win, self: win,
    Promise, Map, Array, Object, String, Number, JSON, isFinite, Date,
    atob, btoa, Buffer, escape, unescape, decodeURIComponent, console,
    // no indexedDB → the in-memory store adapter is used
  });
  runInContext(SRC, ctx);
  return win.SubmissionStore;
}

// A submission row (content-addressed; the receipt_compact is opaque here).
function sub(receiptId, { sid = 'stu-1', item = 'WS-U5L2-reflect1', attempt = 1, ts = 1000, response = 'a' } = {}) {
  return { source: 'frq', item_id: item, student_id: sid, response, attempt, ts,
    recorded_at: new Date(ts).toISOString(), receipt_id: receiptId, receipt_compact: 'x.y' };
}

// A GRADE row whose signed payload names a submission via `sub` (Phase 3 mints this).
// coveredKeys decodes the payload from receipt_compact (no signature check here).
function gradeCovering(subReceiptId, { sid = 'stu-1', t = 'ledger' } = {}) {
  const payload = { v: 1, t, sid, src: 'frq', i: 'WS-U5L2-reflect1', sc: 1, sub: subReceiptId };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { student_id: sid, source: 'frq', item_id: 'WS-U5L2-reflect1', score: 1,
    receipt_id: 'g-' + subReceiptId, receipt_compact: b64 + '.sig' };
}

describe('SubmissionStore — G-Set merge', () => {
  let S;
  beforeEach(() => { S = load(); });

  it('keys by receipt_id and unions/dedups', () => {
    let list = S.mergeRow([], sub('r1'));
    list = S.mergeRow(list, sub('r2'));
    list = S.mergeRow(list, sub('r1'));            // dup content address
    expect(list.length).toBe(2);
    expect(list.map((r) => r.receipt_id).sort()).toEqual(['r1', 'r2']);
  });

  it('put/all persist and dedup idempotently', async () => {
    await S.put(sub('r1'));
    await S.put(sub('r1'));
    await S.putAll([sub('r2'), sub('r3')]);
    const all = await S.all();
    expect(all.length).toBe(3);
  });
});

describe('SubmissionStore — grade-gated suppression (§0.7)', () => {
  let S;
  beforeEach(() => { S = load(); });

  it('coveredKeys maps a submission receipt_id → covering student from the grade payload', () => {
    const covered = S.coveredKeys([gradeCovering('r1', { sid: 'stu-1' })]);
    expect(covered.r1).toBe('stu-1');
  });

  it('a grade with no `sub` field, or a non-ledger type, covers nothing', () => {
    const gNoSub = gradeCovering('r1');
    // strip `sub` by re-encoding a payload without it
    const p = { v: 1, t: 'ledger', sid: 'stu-1', src: 'frq', i: 'x', sc: 1 };
    gNoSub.receipt_compact = Buffer.from(JSON.stringify(p)).toString('base64url') + '.sig';
    expect(Object.keys(S.coveredKeys([gNoSub])).length).toBe(0);
    const gReview = gradeCovering('r1', { t: 'review' });
    expect(Object.keys(S.coveredKeys([gReview])).length).toBe(0);
  });

  it('isCovered requires the SAME student (blocks cross-student griefing)', () => {
    const covered = S.coveredKeys([gradeCovering('r1', { sid: 'stu-1' })]);
    expect(S.isCovered(sub('r1', { sid: 'stu-1' }), covered)).toBe(true);
    // a grade for stu-1 must NOT suppress stu-2's submission that happens to share an id
    expect(S.isCovered(sub('r1', { sid: 'stu-2' }), covered)).toBe(false);
    expect(S.isCovered(sub('r2', { sid: 'stu-1' }), covered)).toBe(false);
  });

  it('rowsForGossip excludes covered submissions but keeps uncovered ones', async () => {
    await S.putAll([sub('r1'), sub('r2'), sub('r3', { sid: 'stu-2' })]);
    const grades = [gradeCovering('r1', { sid: 'stu-1' })];
    const gossipable = await S.rowsForGossip(grades);
    expect(gossipable.map((r) => r.receipt_id).sort()).toEqual(['r2', 'r3']);
    // The covered row is NOT deleted from the store (deletion would resurrect via gossip).
    expect((await S.all()).length).toBe(3);
  });

  it('rowsForGossip accepts a Promise of grades (not just an array) so a caller cannot silently disable suppression', async () => {
    await S.putAll([sub('r1'), sub('r2')]);
    const gossipable = await S.rowsForGossip(Promise.resolve([gradeCovering('r1', { sid: 'stu-1' })]));
    expect(gossipable.map((r) => r.receipt_id)).toEqual(['r2']);
  });

  it('suppressingVerify rejects a covered submission on ingest and defers to the base verify otherwise (§0.7)', async () => {
    const covered = S.coveredKeys([gradeCovering('r1', { sid: 'stu-1' })]);
    let baseCalls = 0;
    const base = () => { baseCalls += 1; return Promise.resolve(true); };
    const v = S.suppressingVerify(base, covered);
    // covered → rejected WITHOUT running the base verify (short-circuit)
    expect(await v(sub('r1', { sid: 'stu-1' }))).toBe(false);
    expect(baseCalls).toBe(0);
    // uncovered → base verify decides
    expect(await v(sub('r2'))).toBe(true);
    expect(baseCalls).toBe(1);
    // a base-verify rejection still rejects
    const vReject = S.suppressingVerify(() => Promise.resolve(false), covered);
    expect(await vReject(sub('r2'))).toBe(false);
  });
});

describe('SubmissionStore — flood cap (§0.4/§5 anti-farming)', () => {
  let S;
  beforeEach(() => { S = load(); });

  it('bounds rows per (student,item) — a brute-force flood on one item is capped', async () => {
    const v = S.floodCapVerify(() => Promise.resolve(true), { maxPerItem: 3 });
    let ok = 0;
    for (let i = 0; i < 10; i++) if (await v(sub('r' + i, { sid: 'stu-1', item: 'WS-X' }))) ok += 1;
    expect(ok).toBe(3);                                    // only 3 admitted for (stu-1, WS-X)
    // a DIFFERENT item for the same student still has its own budget
    expect(await v(sub('other', { sid: 'stu-1', item: 'WS-Y' }))).toBe(true);
  });

  it('bounds rows per student and total across items', async () => {
    const v = S.floodCapVerify(() => Promise.resolve(true), { maxPerStudent: 4, maxPerItem: 100, maxTotal: 100 });
    let ok = 0;
    for (let i = 0; i < 10; i++) if (await v(sub('r' + i, { sid: 'stu-1', item: 'WS-' + i }))) ok += 1;
    expect(ok).toBe(4);                                    // per-student cap
    // another student is unaffected
    expect(await v(sub('z', { sid: 'stu-2', item: 'WS-0' }))).toBe(true);
  });

  it('runs the base verifier FIRST so a rejected row never consumes budget', async () => {
    const v = S.floodCapVerify(() => Promise.resolve(false), { maxPerItem: 1 });
    expect(await v(sub('r1', { sid: 'stu-1', item: 'WS-X' }))).toBe(false);
    expect(await v(sub('r2', { sid: 'stu-1', item: 'WS-X' }))).toBe(false);
    // budget intact: a good row on the same key still admits (the rejects didn't count)
    const v2 = S.floodCapVerify((r) => Promise.resolve(r.receipt_id !== 'bad'), { maxPerItem: 1 });
    expect(await v2(sub('bad', { sid: 'stu-1', item: 'WS-X' }))).toBe(false);
    expect(await v2(sub('good', { sid: 'stu-1', item: 'WS-X' }))).toBe(true);
  });
});
