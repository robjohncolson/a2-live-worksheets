// commits.test.js — unit coverage for the progress "proto-git" chain builder.
// buildCommits is a pure function: it turns immutable ledger receipts into a
// deterministic, prev-chained list of session/QR-sized commits. Tracked as F071
// (Receipts | Progress proto-git commit chain) — previously had NO test.
//
// issueCommitReceipt returns null without RECEIPT_ISSUER_PRIVATE_KEY (checked at
// call time), so the manifest is null here but the structural chain still computes.

import { describe, it, expect } from 'vitest';
import { buildCommits } from '../commits.js';

const MIN = 60 * 1000;

function row(id, ts, extra = {}) {
  return {
    id,
    compact: 'receipt_' + id,
    i: extra.i || ('item_' + id),
    src: extra.src || 'worksheet',
    sc: extra.sc ?? 1,
    ts,
  };
}

describe('buildCommits — proto-git progress chain', () => {
  it('returns an empty chain for no receipts', () => {
    const { commits, head } = buildCommits([], { sid: 's1', u: 'amy' });
    expect(commits).toEqual([]);
    expect(head).toBeNull();
  });

  it('packs a single short session into one commit (seq 1, session 1, prev null)', () => {
    const rows = [row('a', 1000), row('b', 2000), row('c', 3000)];
    const { commits, head } = buildCommits(rows, { sid: 's1', u: 'amy' });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ seq: 1, session: 1, prev: null, cnt: 3, from: 1000, to: 3000 });
    expect(commits[0].items).toHaveLength(3);
    expect(head).toBe(commits[0].root);
  });

  it('splits a session over MAX_PER_COMMIT (8) into 8-then-rest, prev-chained', () => {
    const rows = [];
    for (let k = 0; k < 9; k += 1) rows.push(row('r' + k, 1000 + k * 1000)); // all within one 25-min window
    const { commits, head } = buildCommits(rows, { sid: 's1', u: 'amy' });
    expect(commits).toHaveLength(2);
    expect(commits[0].cnt).toBe(8);
    expect(commits[1].cnt).toBe(1);
    expect(commits.every((c) => c.session === 1)).toBe(true);
    expect(commits[0].seq).toBe(1);
    expect(commits[1].seq).toBe(2);
    expect(commits[0].prev).toBeNull();
    expect(commits[1].prev).toBe(commits[0].root); // the chain links by prev root
    expect(head).toBe(commits[1].root);
  });

  it('starts a new session after a >25-min idle gap, continuing the same chain', () => {
    const rows = [
      row('a', 0),
      row('b', 5 * MIN), // same session
      row('c', 5 * MIN + 26 * MIN), // gap > 25min -> new session
    ];
    const { commits, head } = buildCommits(rows, { sid: 's1', u: 'amy' });
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ session: 1, cnt: 2 });
    expect(commits[1]).toMatchObject({ session: 2, cnt: 1 });
    expect(commits[1].prev).toBe(commits[0].root); // chain spans the session boundary
    expect(head).toBe(commits[1].root);
  });

  it('is order-independent: shuffled receipts yield identical roots and head', () => {
    const rows = [row('a', 1000), row('b', 2000), row('c', 3000), row('d', 4000)];
    const ordered = buildCommits(rows, { sid: 's1', u: 'amy' });
    const shuffled = buildCommits([rows[2], rows[0], rows[3], rows[1]], { sid: 's1', u: 'amy' });
    expect(shuffled.head).toBe(ordered.head);
    expect(shuffled.commits.map((c) => c.root)).toEqual(ordered.commits.map((c) => c.root));
  });

  it('skips a chunk containing duplicate receipt ids (mints no commit)', () => {
    const dup = row('dup', 1000);
    const { commits, head } = buildCommits([dup, { ...dup, ts: 2000 }], { sid: 's1', u: 'amy' });
    expect(commits).toEqual([]);
    expect(head).toBeNull();
  });
});
