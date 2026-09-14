// submission-suppression-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (prop 10).
// fast-check over SubmissionStore suppression (§0.7): once a submission is GRADED, it must
// stop being gossiped — but ONLY its own student's grade suppresses it (no cross-student
// griefing), and suppression is monotone (a covered submission never resurfaces).
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'submission-store.js'), 'utf8');
// Spec-accurate escape() — provided to the vm so decodePayload doesn't depend on the
// host env exposing the legacy `escape`/`atob` globals (which vitest's environment does
// not reliably surface). decodePayload uses Buffer when atob is absent, so we omit atob.
function specEscape(s) {
  return String(s).replace(/[^A-Za-z0-9@*_+\-./]/g, (ch) => {
    const n = ch.charCodeAt(0);
    return n < 256 ? '%' + n.toString(16).toUpperCase().padStart(2, '0')
      : '%u' + n.toString(16).toUpperCase().padStart(4, '0');
  });
}
function loadStore() {
  const win = { Date };
  runInContext(SRC, createContext({
    window: win, globalThis: win, Date, JSON, String, Number, Array, Object, Promise,
    isFinite, Buffer, escape: specEscape, decodeURIComponent,   // no atob → decodePayload uses Buffer
  }));
  return win.SubmissionStore;
}

// A receipt_compact that SubmissionStore.decodePayload can read (payload only — coveredKeys
// DECODES, it never verifies; verifyLedgerRow is the trust gate upstream). base64url of the
// JSON payload + a dummy sig segment.
function fakeCompact(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.sig';
}

const submission = (id, owner) => ({ receipt_id: id, student_id: owner, item_id: 'SUB-U1L1' });
const gradeNaming = (subId, by) => ({ student_id: by, receipt_compact: fakeCompact({ t: 'ledger', sid: by, sub: subId }) });
const rid = () => fc.constantFrom('s1', 's2', 's3', 's4', 's5');
const who = () => fc.constantFrom('A', 'B', 'C');
const dedupe = (subs) => { const seen = new Set(); return subs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))); };

let S;
beforeAll(() => { S = loadStore(); });

// The pure gossip filter that rowsForGossip wraps (rowsForGossip itself is async + reads
// the device's own store via all(); the suppression LOGIC is coveredKeys + isCovered).
const gossip = (grades, rows) => rows.filter((r) => !S.isCovered(r, S.coveredKeys(grades)));

describe('submission suppression (§0.7, prop 10)', () => {
  it('a same-student grade naming a submission suppresses it from gossip', () => {
    fc.assert(fc.property(rid(), who(), (id, s) => {
      const grades = [gradeNaming(id, s)];
      expect(S.isCovered(submission(id, s), S.coveredKeys(grades))).toBe(true);
      expect(gossip(grades, [submission(id, s)])).toHaveLength(0);
    }));
  });

  it('anti-griefing: a grade by a DIFFERENT student never suppresses your submission', () => {
    fc.assert(fc.property(rid(), who(), who(), (id, owner, attacker) => {
      fc.pre(owner !== attacker);
      const grades = [gradeNaming(id, attacker)];               // attacker names your submission's id
      expect(S.isCovered(submission(id, owner), S.coveredKeys(grades))).toBe(false);
      expect(gossip(grades, [submission(id, owner)])).toHaveLength(1); // still gossiped
    }));
  });

  it('a submission named by NO grade is always gossiped', () => {
    fc.assert(fc.property(fc.array(fc.record({ id: rid(), owner: who() }), { minLength: 1, maxLength: 6 }), (subs) => {
      const rows = dedupe(subs).map((x) => submission(x.id, x.owner));
      expect(gossip([], rows).length).toBe(rows.length);
    }));
  });

  it('monotone: adding one covering grade removes exactly that submission and resurrects none', () => {
    fc.assert(fc.property(fc.array(fc.record({ id: rid(), owner: who() }), { minLength: 1, maxLength: 6 }), (subs) => {
      const rows = dedupe(subs).map((x) => submission(x.id, x.owner));
      const before = gossip([], rows);
      const target = rows[0];
      const after = gossip([gradeNaming(target.receipt_id, target.student_id)], rows);
      expect(after.length).toBe(before.length - 1);
      expect(after.map((r) => r.receipt_id)).not.toContain(target.receipt_id);
      const beforeSet = new Set(before.map((r) => r.receipt_id));
      for (const r of after) expect(beforeSet.has(r.receipt_id)).toBe(true);   // suppression only removes
    }));
  });

  it('a non-ledger grade, or a ledger grade without `sub`, covers nothing', () => {
    fc.assert(fc.property(rid(), who(), (id, s) => {
      const notLedger = [{ student_id: s, receipt_compact: fakeCompact({ t: 'review', sid: s, sub: id }) }];
      const noSub = [{ student_id: s, receipt_compact: fakeCompact({ t: 'ledger', sid: s }) }];
      expect(S.isCovered(submission(id, s), S.coveredKeys(notLedger))).toBe(false);
      expect(S.isCovered(submission(id, s), S.coveredKeys(noSub))).toBe(false);
    }));
  });
});
