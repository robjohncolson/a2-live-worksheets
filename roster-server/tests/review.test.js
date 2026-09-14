// review.test.js — Nightly Review (NIGHTLY_REVIEW_SPEC.md) Phase 1 server.
// Covers: issueReviewReceipt (signed + comment-hash binds), GET /class/review-queue
// (priority order, unseen counts, daysSinceReview, since/window), POST /class/review
// (mark seen, signed receipt persisted, candy minted ONCE/student/day, notify only on a
// comment, idempotent re-mark), the /ledger/student review augment, and a pglite block
// that runs migration 0025 to prove the candy_bonus mint + that it becomes spendable.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import express from 'express';
import http from 'http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountReview, itemPriority, responseSnippet, responseHash, aiGradedRow, windowFloorFrom } from '../review.js';
import { mountLedger } from '../ledger.js';
import { initReceipts, issueReviewReceipt, getReceiptIssuer } from '../receipts.js';
import { verifyCompact, publicKeyFromX, verifySnapshot } from '../snapshot-verify.js';
import { buildStudentEntry } from '../admin-snapshot.js';
import { normalizeReviews } from '../admin-restore.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';
const TEACHER_SECRET = 'test-teacher-secret';
const SID_A = '00000000-0000-4000-8000-00000000000a';
const SID_B = '00000000-0000-4000-8000-00000000000b';

let savedKey, savedSecret;
beforeAll(() => {
  savedKey = process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  savedSecret = process.env.ROSTER_TEACHER_SECRET;
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
  initReceipts();
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.RECEIPT_ISSUER_PRIVATE_KEY; else process.env.RECEIPT_ISSUER_PRIVATE_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.ROSTER_TEACHER_SECRET; else process.env.ROSTER_TEACHER_SECRET = savedSecret;
  initReceipts();
});

// ── A fake roster+review db and a fake ledger db, in-memory ───────────────────
function makeWorld() {
  const roster = {
    [SID_A]: { student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana Apple', section: 'PeriodX', role: 'student' },
    [SID_B]: { student_id: SID_B, login_username: 'berry_owl', real_name: 'Ben Berry', section: 'PeriodX', role: 'student' },
  };
  const reviewMarks = new Map();     // ledger_id → mark row
  const grants = new Set();          // `sid|date`
  const ledger = [];                 // item_ledger rows
  const nudges = [];                 // sent teacher→student rows

  const db = {
    async listRoster() { return { data: Object.values(roster), error: null }; },
    async findByStudentId(sid) { return { data: roster[sid] || null, error: null }; },
    async findTeacherUsername() { return { data: { login_username: 'teach', section: 'PeriodX' }, error: null }; },
    async getRoleByStudentId() { return 'teacher'; },
    async listReviewMarksByStudents(ids) {
      return { data: Array.from(reviewMarks.values()).filter((m) => ids.includes(m.student_id)), error: null };
    },
    async listReviewMarksByStudent(sid) {
      return { data: Array.from(reviewMarks.values()).filter((m) => m.student_id === sid), error: null };
    },
    async upsertReviewMark(row) {
      const stored = {
        review_id: reviewMarks.get(row.ledgerId)?.review_id || ('rv-' + row.ledgerId),
        ledger_id: row.ledgerId, student_id: row.studentId, teacher_username: row.teacherUsername,
        seen_at: row.seenAt, comment: row.comment ?? null, candy_awarded: row.candyAwarded ?? 0,
        receipt_id: row.receiptId ?? null, receipt_compact: row.receiptCompact ?? null,
      };
      reviewMarks.set(row.ledgerId, stored);
      return { data: stored, error: null };
    },
    async reviewAward(sid, date) {
      const key = sid + '|' + date;
      if (grants.has(key)) return { data: 0, error: null };
      grants.add(key);
      return { data: 1, error: null };
    },
  };
  const ledgerDb = {
    async getLedgerByStudent(sid) {
      return { data: ledger.filter((r) => r.student_id === sid).sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0)), error: null };
    },
    async getRowsByLedgerIds(ids) { return { data: ledger.filter((r) => ids.includes(r.ledger_id)), error: null }; },
  };
  const nudgesDb = { async insertNudges(args) { nudges.push(args); return { data: [], error: null }; } };
  return { db, ledgerDb, nudgesDb, ledger, reviewMarks, grants, nudges, roster };
}

let seq = 0;
function addRow(world, sid, over = {}) {
  const row = {
    ledger_id: '00000000-0000-4000-9000-' + String(++seq).padStart(12, '0'),
    student_id: sid, source: 'worksheet', item_id: 'WS-' + seq, score: 1,
    response: 'answer ' + seq, recorded_at: new Date(Date.now() - seq * 1000).toISOString(),
    evidence_tier: 'practice', ...over,
  };
  world.ledger.push(row);
  return row;
}

function mountServer(world, extra = {}) {
  const app = express();
  app.use(express.json());
  mountReview(app, { db: world.db, ledgerDb: world.ledgerDb, nudgesDb: world.nudgesDb, loadAnswerKey: null, ...extra });
  // also mount /ledger/student to exercise the review augment (rosterDb = the review db)
  mountLedger(app, { db: world.ledgerDb, verifyToken: () => null, rosterDb: world.db });
  return http.createServer(app);
}
async function call(server, method, path, { body, secret } = {}) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body: json };
}

// ── issueReviewReceipt ────────────────────────────────────────────────────────
describe('issueReviewReceipt', () => {
  const pubKey = () => publicKeyFromX(getReceiptIssuer().pubkey);

  it('signs a verifiable t:review receipt that binds the comment by hash', () => {
    const r = issueReviewReceipt({ ledgerId: 'L1', studentId: SID_A, teacher: 'teach', seenAt: 1234, comment: 'Nice work!' });
    expect(r).toBeTruthy();
    const payload = verifyCompact(r.compact, pubKey());
    expect(payload).toBeTruthy();
    expect(payload.t).toBe('review');
    expect(payload.lid).toBe('L1');
    expect(payload.sid).toBe(SID_A);
    expect(payload.by).toBe('teach');
    expect(payload.ts).toBe(1234);
    expect(payload.ch).toBe(crypto.createHash('sha256').update('Nice work!', 'utf8').digest('hex').slice(0, 16));
  });

  it('omits ch when there is no comment, and a different comment yields a different ch', () => {
    const none = issueReviewReceipt({ ledgerId: 'L2', studentId: SID_A, teacher: 't', seenAt: 1 });
    expect(verifyCompact(none.compact, pubKey()).ch).toBeUndefined();
    const a = issueReviewReceipt({ ledgerId: 'L3', studentId: SID_A, teacher: 't', seenAt: 1, comment: 'A' });
    const b = issueReviewReceipt({ ledgerId: 'L3', studentId: SID_A, teacher: 't', seenAt: 1, comment: 'B' });
    expect(verifyCompact(a.compact, pubKey()).ch).not.toBe(verifyCompact(b.compact, pubKey()).ch);
  });

  it('returns null without a ledgerId or studentId', () => {
    expect(issueReviewReceipt({ studentId: SID_A })).toBeNull();
    expect(issueReviewReceipt({ ledgerId: 'L' })).toBeNull();
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────
describe('priority + snippet helpers', () => {
  it('floats FRQ/free-response above appeals above low-scores above proctored above auto-graded', () => {
    expect(itemPriority({ source: 'frq' })).toBe(100);
    expect(itemPriority({ source: 'quiz_review' })).toBe(90);
    expect(itemPriority({ source: 'worksheet', score: 0.2 })).toBe(80);
    expect(itemPriority({ source: 'worksheet', score: 1, evidence_tier: 'proctored' })).toBe(60);
    expect(itemPriority({ source: 'worksheet', score: 1 })).toBe(10);
  });
  it('truncates a long response and JSON-stringifies objects', () => {
    expect(responseSnippet('x'.repeat(200)).length).toBe(141); // 140 + ellipsis
    expect(responseSnippet({ a: 1 })).toBe('{"a":1}');
    expect(responseSnippet(null)).toBe('');
  });
});

// ── GET /class/review-queue ────────────────────────────────────────────────────
describe('GET /class/review-queue', () => {
  it('401s without the teacher secret', async () => {
    const world = makeWorld();
    const res = await call(mountServer(world), 'GET', '/class/review-queue');
    expect(res.status).toBe(401);
  });

  it('lists students with unseen counts and sorts FRQ-bearing students first', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { source: 'worksheet', score: 1 });            // low-priority auto-graded
    addRow(world, SID_B, { source: 'frq', score: 0.5, item_id: 'FRQ-1' }); // needs eyes
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.unseenTotal).toBe(2);
    expect(res.body.students[0].studentId).toBe(SID_B);                 // FRQ student floats up
    expect(res.body.students[0].items[0].sessionId).not.toBeNull();
  });

  it('counts a marked item as seen and reports daysSinceReview', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    world.reviewMarks.set(row.ledger_id, {
      ledger_id: row.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: new Date(Date.now() - 3 * 86400000).toISOString(), comment: 'seen it',
    });
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    const a = res.body.students.find((s) => s.studentId === SID_A);
    expect(a.unseen).toBe(0);
    expect(a.items[0].seen).toBe(true);
    expect(a.daysSinceReview).toBe(3);
    expect(res.body.unseenTotal).toBe(0);
  });

  it('503s when review_marks is not provisioned', async () => {
    const world = makeWorld();
    world.db.listReviewMarksByStudents = async () => ({ data: null, error: { code: '42P01' } });
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    expect(res.status).toBe(503);
  });
});

// ── POST /class/review ─────────────────────────────────────────────────────────
describe('POST /class/review', () => {
  it('marks an item seen and persists a signed receipt', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    const res = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [row.ledger_id], comment: 'great' } });
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(1);
    const mark = world.reviewMarks.get(row.ledger_id);
    expect(mark.comment).toBe('great');
    expect(mark.receipt_compact).toBeTruthy();
    const payload = verifyCompact(mark.receipt_compact, publicKeyFromX(getReceiptIssuer().pubkey));
    expect(payload.t).toBe('review');
    expect(payload.lid).toBe(row.ledger_id);
  });

  

  it('sends a notify message ONLY when there is a comment', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    const silent = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [row.ledger_id] } });
    expect(silent.body.notified).toBe(0);
    expect(world.nudges.length).toBe(0);
    const r2 = addRow(world, SID_A);
    const spoke = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [r2.ledger_id], comment: 'see me' } });
    expect(spoke.body.notified).toBe(1);
    expect(world.nudges[0].recipientUsernames).toEqual(['apple_fox']);
    expect(world.nudges[0].text).toBe('see me');
  });

  it('resolves scope:day to that student\'s items on a given NY date', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { recorded_at: '2026-06-29T14:00:00.000Z' });
    addRow(world, SID_A, { recorded_at: '2026-06-20T14:00:00.000Z' });
    const res = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { studentId: SID_A, scope: 'day', date: '2026-06-29' } });
    expect(res.body.marked).toBe(1);                       // only the 6-29 row
  });

  it('400s when there are no items to review and 401s without the secret', async () => {
    const world = makeWorld();
    expect((await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [] } })).status).toBe(400);
    expect((await call(mountServer(world), 'POST', '/class/review', { body: { ledgerIds: ['x'] } })).status).toBe(401);
  });
});

// ── /ledger/student review augment ─────────────────────────────────────────────
describe('GET /ledger/student carries review state', () => {
  it('attaches { seenAt, teacher, comment } to a reviewed row and null otherwise', async () => {
    const world = makeWorld();
    const reviewed = addRow(world, SID_A);
    const fresh = addRow(world, SID_A);
    world.reviewMarks.set(reviewed.ledger_id, {
      ledger_id: reviewed.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: '2026-06-29T00:00:00.000Z', comment: 'nice',
    });
    const res = await call(mountServer(world), 'GET', `/ledger/student/${SID_A}`, { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.rows.map((r) => [r.ledger_id, r]));
    expect(byId[reviewed.ledger_id].review).toEqual({ seenAt: '2026-06-29T00:00:00.000Z', teacher: 'teach', comment: 'nice' });
    expect(byId[fresh.ledger_id].review).toBeNull();
  });
});

// ── Durability: reviews ride the snapshot / verify / restore (NIGHTLY_REVIEW §8) ─
describe('review durability (snapshot + verify + normalizeReviews)', () => {
  function snapshotWithReview(comment) {
    const ledgerRow = { ledger_id: '00000000-0000-4000-9000-0000000000ee', student_id: SID_A, source: 'frq', item_id: 'FRQ-9', score: 0.5, response: 'my answer', recorded_at: '2026-06-29T12:00:00.000Z' };
    const receipt = issueReviewReceipt({ ledgerId: ledgerRow.ledger_id, studentId: SID_A, teacher: 'teach', seenAt: 1000, comment });
    const mark = {
      ledger_id: ledgerRow.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: '2026-06-29T13:00:00.000Z', comment, candy_awarded: 1,
      receipt_id: receipt.receiptId, receipt_compact: receipt.compact,
    };
    const entry = buildStudentEntry({ student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana', section: 'PeriodX' }, [ledgerRow], [mark]);
    return { snapshot: { issuer: getReceiptIssuer(), students: [entry] }, entry };
  }

  it('carries reviews in the student entry and verifySnapshot validates the t:review receipt', () => {
    const { snapshot, entry } = snapshotWithReview('great FRQ');
    expect(entry.reviewCount).toBe(1);
    expect(entry.bundle.reviews[0].receipt_compact).toBeTruthy();
    const report = verifySnapshot(snapshot);
    expect(report.ok).toBe(true);
    expect(report.totals.reviews).toBe(1);
    expect(report.totals.verifiedReviews).toBe(1);
  });

  it('flags a review whose stored comment was tampered (ch no longer matches)', () => {
    const { snapshot } = snapshotWithReview('great FRQ');
    snapshot.students[0].bundle.reviews[0].comment = 'tampered!';   // edit under a valid signature
    const report = verifySnapshot(snapshot);
    expect(report.ok).toBe(false);
    expect(report.breaks.some((b) => b.kind === 'review-comment-tampered')).toBe(true);
  });

  it('normalizeReviews extracts reviews from a full snapshot and a bundles[] body', () => {
    const { snapshot } = snapshotWithReview('hi');
    expect(normalizeReviews(snapshot).length).toBe(1);                         // { students:[{bundle}] }
    expect(normalizeReviews({ bundles: [snapshot.students[0].bundle] }).length).toBe(1); // { bundles:[...] }
  });
});

// ── v2 helpers (NIGHTLY_REVIEW_V2_SPEC.md §0) ──────────────────────────────────
describe('v2 helpers: windowFloorFrom / aiGradedRow / responseHash', () => {
  it('windowFloorFrom defaults to 14 days, honors all, clamps at 365', () => {
    const now = 1000 * 86400000;
    expect(windowFloorFrom(undefined, now)).toEqual({ days: 14, floor: now - 14 * 86400000 });
    expect(windowFloorFrom('', now).days).toBe(14);
    expect(windowFloorFrom('garbage', now).days).toBe(14);
    expect(windowFloorFrom('-3', now).days).toBe(14);
    expect(windowFloorFrom('all', now)).toEqual({ days: null, floor: null });
    expect(windowFloorFrom('7', now)).toEqual({ days: 7, floor: now - 7 * 86400000 });
    expect(windowFloorFrom('9999', now).days).toBe(365);
  });

  it('aiGradedRow admits ONLY rows that crossed the LLM at grade time (§0.1)', () => {
    // AI-mediated at grade time → draftable
    expect(aiGradedRow({ source: 'quiz_review', item_id: 'U1-L2-Q02#rev' })).toBe(true);
    expect(aiGradedRow({ source: 'quiz_exception', item_id: 'U1-L2-Q02#exc' })).toBe(true);
    expect(aiGradedRow({ source: 'pc', item_id: 'U1-SG', score: 0.5 })).toBe(true);
    expect(aiGradedRow({ source: 'frq', item_id: 'WS-U1L2-reflect1', score: 0.5 })).toBe(true);
    // Never crossed the LLM → redacted
    expect(aiGradedRow({ source: 'frq', item_id: 'WS-U1L2-reflect1', score: null })).toBe(false);   // draft
    expect(aiGradedRow({ source: 'frq', item_id: 'WS-U1L2-reflect1' })).toBe(false);                // no score
    expect(aiGradedRow({ source: 'pc', item_id: 'U1-PC-MCQ-A-Q05', score: 1 })).toBe(false);        // proctored-family MCQ
    expect(aiGradedRow({ source: 'worksheet', item_id: 'WS-U1L2-Q1', score: 1 })).toBe(false);
    expect(aiGradedRow({ source: 'curriculum_quiz', item_id: 'U1-L2-Q01', score: 1 })).toBe(false);
    expect(aiGradedRow({ source: 'blooket', item_id: 'BLOOKET-U1L2', score: 0.9 })).toBe(false);
    expect(aiGradedRow({ source: 'trainer', item_id: 'TI84-1-var-stats' })).toBe(false);
    // NEVER proctored, no matter the source (§0.1 "Never draft proctored")
    expect(aiGradedRow({ source: 'frq', item_id: 'X', score: 1, evidence_tier: 'proctored' })).toBe(false);
    expect(aiGradedRow({ source: 'quiz_review', item_id: 'X#rev', evidence_tier: 'proctored' })).toBe(false);
    // The spec's dead strings stay dead (no writer can produce them; they must NOT unlock drafting)
    expect(aiGradedRow({ source: 'ai', item_id: 'X', score: 1 })).toBe(false);
    expect(aiGradedRow({ source: 'ai-graded', item_id: 'X', score: 1 })).toBe(false);
    expect(aiGradedRow(null)).toBe(false);
  });

  it('responseHash matches the ledger-receipt ah recipe and is null for empty', () => {
    expect(responseHash('my answer')).toBe(crypto.createHash('sha256').update('my answer', 'utf8').digest('hex').slice(0, 16));
    expect(responseHash({ a: 1 })).toBe(crypto.createHash('sha256').update(JSON.stringify({ a: 1 }), 'utf8').digest('hex').slice(0, 16));
    expect(responseHash(null)).toBeNull();
    expect(responseHash(undefined)).toBeNull();
  });
});

// ── v2: the shared window + uncapped counts on the queue ──────────────────────
describe('GET /class/review-queue (v2 window + counts)', () => {
  it('applies the 14-day default window; days=all restores full history', async () => {
    const world = makeWorld();
    addRow(world, SID_A);                                                          // now-ish → in window
    addRow(world, SID_A, { recorded_at: new Date(Date.now() - 30 * 86400000).toISOString() }); // 30d ago
    const dflt = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    expect(dflt.body.windowDays).toBe(14);
    expect(dflt.body.unseenTotal).toBe(1);                                         // old row outside the window
    const all = await call(mountServer(world), 'GET', '/class/review-queue?days=all', { secret: TEACHER_SECRET });
    expect(all.body.windowDays).toBeNull();
    expect(all.body.unseenTotal).toBe(2);
  });

  it('unseen counts are NOT capped by the 80-item payload cap (itemsTruncated flags it)', async () => {
    const world = makeWorld();
    for (let i = 0; i < 85; i += 1) addRow(world, SID_A);
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    const a = res.body.students.find((s) => s.studentId === SID_A);
    expect(a.items.length).toBe(80);                                               // payload capped
    expect(a.unseen).toBe(85);                                                     // count NOT capped
    expect(a.itemsTruncated).toBe(true);
    expect(res.body.unseenTotal).toBe(85);
  });

  it('items carry rh + draftable for the Draft flow', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'my essay', item_id: 'WS-U1L2-reflect1' });
    addRow(world, SID_A, { source: 'worksheet', score: 1, response: '42' });
    const res = await call(mountServer(world), 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    const a = res.body.students.find((s) => s.studentId === SID_A);
    const frq = a.items.find((it) => it.source === 'frq');
    const ws = a.items.find((it) => it.source === 'worksheet');
    expect(frq.draftable).toBe(true);
    expect(frq.rh).toBe(responseHash('my essay'));
    expect(ws.draftable).toBe(false);
    expect(ws.rh).toBe(responseHash('42'));
  });
});

// ── v2: GET /class/review-item/:ledgerId ───────────────────────────────────────
describe('GET /class/review-item/:ledgerId (v2)', () => {
  it('401s without the teacher secret and 400s on a non-UUID', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A);
    expect((await call(mountServer(world), 'GET', `/class/review-item/${row.ledger_id}`)).status).toBe(401);
    expect((await call(mountServer(world), 'GET', '/class/review-item/not-a-uuid', { secret: TEACHER_SECRET })).status).toBe(400);
  });

  it('404s for an unknown ledgerId and for a row whose student left the roster', async () => {
    const world = makeWorld();
    const gone = addRow(world, '00000000-0000-4000-8000-00000000dead');
    expect((await call(mountServer(world), 'GET', '/class/review-item/00000000-0000-4000-9000-999999999999', { secret: TEACHER_SECRET })).status).toBe(404);
    expect((await call(mountServer(world), 'GET', `/class/review-item/${gone.ledger_id}`, { secret: TEACHER_SECRET })).status).toBe(404);
  });

  it('returns the FULL response only for AI-graded rows (§0.1)', async () => {
    const world = makeWorld();
    const frq = addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'a long reflection about sampling', item_id: 'WS-U1L2-reflect1' });
    const res = await call(mountServer(world), 'GET', `/class/review-item/${frq.ledger_id}`, { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.draftable).toBe(true);
    expect(res.body.redacted).toBe(false);
    expect(res.body.response).toBe('a long reflection about sampling');
    expect(res.body.rh).toBe(responseHash('a long reflection about sampling'));
    expect(res.body.realName).toBe('Ana Apple');
    expect(res.body.score).toBe(0.5);
  });

  it('REDACTS the response for non-AI-graded and proctored rows', async () => {
    const world = makeWorld();
    const ws = addRow(world, SID_A, { source: 'worksheet', score: 1, response: 'secret worksheet answer' });
    const proc = addRow(world, SID_A, { source: 'frq', score: 1, response: 'proctored essay', evidence_tier: 'proctored' });
    for (const row of [ws, proc]) {
      const res = await call(mountServer(world), 'GET', `/class/review-item/${row.ledger_id}`, { secret: TEACHER_SECRET });
      expect(res.status).toBe(200);
      expect(res.body.redacted).toBe(true);
      expect(res.body.draftable).toBe(false);
      expect(res.body.response).toBeNull();
      expect(res.body.rh).toBeTruthy();                       // the stale-pin still works on redacted rows
    }
  });

  it('carries the existing mark (seen/comment) when one exists', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A, { source: 'frq', score: 0.5 });
    world.reviewMarks.set(row.ledger_id, {
      ledger_id: row.ledger_id, student_id: SID_A, teacher_username: 'teach',
      seen_at: '2026-06-30T00:00:00.000Z', comment: 'already seen',
    });
    const res = await call(mountServer(world), 'GET', `/class/review-item/${row.ledger_id}`, { secret: TEACHER_SECRET });
    expect(res.body.seen).toBe(true);
    expect(res.body.comment).toBe('already seen');
  });
});

// ── v2: GET /class/review-by-item ──────────────────────────────────────────────
describe('GET /class/review-by-item (v2)', () => {
  it('401s without the teacher secret and 503s pre-migration', async () => {
    const world = makeWorld();
    expect((await call(mountServer(world), 'GET', '/class/review-by-item')).status).toBe(401);
    world.db.listReviewMarksByStudents = async () => ({ data: null, error: { code: '42P01' } });
    expect((await call(mountServer(world), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET })).status).toBe(503);
  });

  it('groups all students under one itemId with unseen/count/meanScore and lowest-score-first answers', async () => {
    const world = makeWorld();
    const a = addRow(world, SID_A, { source: 'frq', score: 0.5, item_id: 'WS-U1L2-reflect1', response: 'ana says' });
    const b = addRow(world, SID_B, { source: 'frq', score: 0, item_id: 'WS-U1L2-reflect1', response: 'ben says' });
    world.reviewMarks.set(a.ledger_id, { ledger_id: a.ledger_id, student_id: SID_A, teacher_username: 'teach', seen_at: '2026-06-30T00:00:00.000Z', comment: null });
    const res = await call(mountServer(world), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    const item = res.body.items.find((it) => it.itemId === 'WS-U1L2-reflect1');
    expect(item.count).toBe(2);
    expect(item.unseen).toBe(1);
    expect(item.meanScore).toBe(0.25);
    expect(item.priority).toBe(100);
    expect(item.draftable).toBe(true);
    expect(item.unit).toBe('U1');
    expect(item.answers[0].studentId).toBe(SID_B);           // score 0 floats first
    expect(item.answers[0].rh).toBe(responseHash('ben says'));
    expect(item.answers[1].seen).toBe(true);
    expect(res.body.unseenTotal).toBe(1);
  });

  it('sorts FRQ/low-mean items first and has NO per-student cap (§0.6)', async () => {
    const world = makeWorld();
    for (let i = 0; i < 85; i += 1) addRow(world, SID_A, { source: 'worksheet', score: 1, item_id: 'WS-BULK-' + i });
    addRow(world, SID_A, { source: 'frq', score: 0.2, item_id: 'WS-U1L2-reflect1', response: 'essay' });
    const res = await call(mountServer(world), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET });
    expect(res.body.items.length).toBe(86);                  // 85 worksheet items + 1 frq — nothing dropped
    expect(res.body.items[0].itemId).toBe('WS-U1L2-reflect1'); // FRQ floats to the top
    expect(res.body.unseenTotal).toBe(86);
  });

  it('shares the SAME row universe as the by-student queue (badge consistency, §0.7)', async () => {
    const world = makeWorld();
    for (let i = 0; i < 85; i += 1) addRow(world, SID_A);    // beyond the by-student payload cap
    addRow(world, SID_B, { recorded_at: new Date(Date.now() - 30 * 86400000).toISOString() }); // outside window
    const server1 = mountServer(world);
    const queue = await call(server1, 'GET', '/class/review-queue', { secret: TEACHER_SECRET });
    const byItem = await call(mountServer(world), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET });
    expect(byItem.body.unseenTotal).toBe(queue.body.unseenTotal);   // identical universes → identical badge
    expect(byItem.body.windowDays).toBe(queue.body.windowDays);
  });

  it('groups a planted "__proto__" item_id safely (no prototype pollution, no crash)', async () => {
    // item_id is CLIENT-supplied text: a student can write itemId '__proto__' via
    // POST /ledger/record. With a plain {} groups map that returns Object.prototype
    // → pollution + TypeError → the shared server crashes on every By-item load.
    const world = makeWorld();
    addRow(world, SID_A, { item_id: '__proto__', source: 'worksheet', score: 1 });
    addRow(world, SID_A, { item_id: 'constructor', source: 'worksheet', score: 1 });
    const res = await call(mountServer(world), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    const proto = res.body.items.find((it) => it.itemId === '__proto__');
    const ctor = res.body.items.find((it) => it.itemId === 'constructor');
    expect(proto.count).toBe(1);
    expect(ctor.count).toBe(1);
    expect(Object.prototype.count).toBeUndefined();          // no pollution escaped
    expect(Object.prototype.unseen).toBeUndefined();
  });

  it('derives the item label from the answer key when available (§0.8)', async () => {
    const world = makeWorld();
    addRow(world, SID_A, { source: 'curriculum_quiz', score: 1, item_id: 'U1-L2-Q01', topic: 'client junk' });
    const loadAnswerKey = async () => ({ answerKey: { 'U1-L2-Q01': { answerKey: 'D', type: 'multiple-choice', unit: '1', topic: '1.10' } } });
    const res = await call(mountServer(world, { loadAnswerKey }), 'GET', '/class/review-by-item', { secret: TEACHER_SECRET });
    const item = res.body.items.find((it) => it.itemId === 'U1-L2-Q01');
    expect(item.unit).toBe('U1');
    expect(item.topic).toBe('1.10');                          // key wins over the client-supplied row topic
  });
});

// ── v2: POST /class/review — TOCTOU 409 + truncation + rh binding ─────────────
describe('POST /class/review (v2 stale pins + truncation + rh)', () => {
  it('binds rh into the signed t:review receipt', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'the essay' });
    await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [row.ledger_id], comment: 'good' } });
    const mark = world.reviewMarks.get(row.ledger_id);
    const payload = verifyCompact(mark.receipt_compact, publicKeyFromX(getReceiptIssuer().pubkey));
    expect(payload.rh).toBe(responseHash('the essay'));
  });

  it('accepts a mark whose expected pins match the current row', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'stable answer' });
    const res = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [row.ledger_id], comment: 'drafted about THIS answer', expected: [{ ledgerId: row.ledger_id, rh: responseHash('stable answer'), score: 0.5 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(1);
  });

  it('409s with the stale ids and marks NOTHING when a pinned row changed (§0.5)', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'original answer' });
    const pinnedRh = responseHash('original answer');
    row.response = 'REVISED answer';                          // the student revised between fetch and mark
    row.score = 0.9;
    const res = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [row.ledger_id], comment: 'drafted about the OLD answer', expected: [{ ledgerId: row.ledger_id, rh: pinnedRh }] },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('stale');
    expect(res.body.stale).toEqual([row.ledger_id]);
    expect(world.reviewMarks.size).toBe(0);                   // whole request rejected — nothing marked
    expect(world.grants.size).toBe(0);                        // no candy either
  });

  it('treats rh:null as a REAL pin — a null→answer revision 409s; a still-null response passes', async () => {
    const world = makeWorld();
    const draft = addRow(world, SID_A, { source: 'frq', score: null, response: null });
    // Teacher rendered the row while it had NO response; student then typed one.
    draft.response = 'late-arriving essay';
    const stale = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [draft.ledger_id], expected: [{ ledgerId: draft.ledger_id, rh: null }] },
    });
    expect(stale.status).toBe(409);
    const still = addRow(world, SID_B, { source: 'frq', score: null, response: null });
    const ok = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [still.ledger_id], expected: [{ ledgerId: still.ledger_id, rh: null, score: null }] },
    });
    expect(ok.status).toBe(200);
  });

  it('409s on a score-only pin mismatch and ignores pins for rows not in the request', async () => {
    const world = makeWorld();
    const row = addRow(world, SID_A, { source: 'frq', score: 0.5, response: 'answer' });
    const other = addRow(world, SID_B, { source: 'frq', score: 1, response: 'other' });
    const scoreStale = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [row.ledger_id], expected: [{ ledgerId: row.ledger_id, score: 0.25 }] },
    });
    expect(scoreStale.status).toBe(409);
    const ignored = await call(mountServer(world), 'POST', '/class/review', {
      secret: TEACHER_SECRET,
      body: { ledgerIds: [row.ledger_id], expected: [{ ledgerId: other.ledger_id, rh: 'ffffffffffffffff' }] },
    });
    expect(ignored.status).toBe(200);                         // the pin targets a row outside this request → ignored
  });

  it('reports truncation instead of silently dropping the tail (§0.9)', async () => {
    const world = makeWorld();
    const real = addRow(world, SID_A);
    const ids = [real.ledger_id];
    for (let i = 0; i < 501; i += 1) ids.push('00000000-0000-4000-9000-9' + String(i).padStart(11, '0'));
    const res = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: ids } });
    expect(res.status).toBe(200);
    expect(res.body.requested).toBe(502);
    expect(res.body.truncated).toBe(true);
    expect(res.body.marked).toBe(1);
    const small = await call(mountServer(world), 'POST', '/class/review', { secret: TEACHER_SECRET, body: { ledgerIds: [real.ledger_id] } });
    expect(small.body.truncated).toBe(false);
    expect(small.body.requested).toBe(1);
  });
});

// ── v2: durability back-compat — rh rides verify/snapshot without breaking v1 ──
describe('review durability with rh (v2 back-compat)', () => {
  it('a v1 receipt (no rh) and a v2 receipt (rh) BOTH verify through verifySnapshot', () => {
    const mkSnapshot = (receipt, comment) => {
      const ledgerRow = { ledger_id: '00000000-0000-4000-9000-0000000000ef', student_id: SID_A, source: 'frq', item_id: 'FRQ-9', score: 0.5, response: 'my answer', recorded_at: '2026-06-29T12:00:00.000Z' };
      const mark = {
        ledger_id: ledgerRow.ledger_id, student_id: SID_A, teacher_username: 'teach',
        seen_at: '2026-06-29T13:00:00.000Z', comment, candy_awarded: 1,
        receipt_id: receipt.receiptId, receipt_compact: receipt.compact,
      };
      const entry = buildStudentEntry({ student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana', section: 'PeriodX' }, [ledgerRow], [mark]);
      return { issuer: getReceiptIssuer(), students: [entry] };
    };
    const v1 = issueReviewReceipt({ ledgerId: '00000000-0000-4000-9000-0000000000ef', studentId: SID_A, teacher: 'teach', seenAt: 1000, comment: 'hi' });
    const v2 = issueReviewReceipt({ ledgerId: '00000000-0000-4000-9000-0000000000ef', studentId: SID_A, teacher: 'teach', seenAt: 1000, comment: 'hi', responseHash: responseHash('my answer') });
    expect(verifySnapshot(mkSnapshot(v1, 'hi')).ok).toBe(true);
    expect(verifySnapshot(mkSnapshot(v2, 'hi')).ok).toBe(true);
    const v2payload = verifyCompact(v2.compact, publicKeyFromX(getReceiptIssuer().pubkey));
    expect(v2payload.rh).toBe(responseHash('my answer'));
    const v1payload = verifyCompact(v1.compact, publicKeyFromX(getReceiptIssuer().pubkey));
    expect(v1payload.rh).toBeUndefined();
  });
});

// ── pglite: the REAL migration 0025 SQL ─────────────────────────────────────────
// Proves the candy_bonus mint is atomic + idempotent per day AND that a minted bonus
// becomes spendable through the real doge_spend guard (0 earned + 1 bonus → can buy 1).

