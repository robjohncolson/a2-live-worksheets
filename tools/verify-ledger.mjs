#!/usr/bin/env node
// verify-ledger.mjs — verify an apstats-ledger-snapshot/v1 mirror, print a class
// report, and (optionally) rebuild Supabase from it via POST /ledger/import.
//
//   node tools/verify-ledger.mjs <snapshot.json> [--pubkey <x> | --issuer-url <url>]
//   node tools/verify-ledger.mjs <snapshot.json> --rebuild --roster-url <url> --teacher-secret <s>
//
// Zero-trust: every receipt signature, every commit-chain head, the per-student
// transcript root, and the epoch anchor are recomputed and checked against the
// issuer public key. Exit code 0 = verified, 1 = breaks/rebuild-failed, 2 = usage.
// See GRADE_LEDGER_DURABILITY_SPEC.md.

import fs from 'node:fs';
import { verifySnapshot } from '../roster-server/snapshot-verify.js';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function flag(name) { return process.argv.includes(name); }

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('usage: verify-ledger <snapshot.json> [--pubkey <x>|--issuer-url <url>] [--rebuild --roster-url <url> --teacher-secret <s>]');
    process.exit(2);
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));

  let pubkey = arg('--pubkey');
  const issuerUrl = arg('--issuer-url');
  if (!pubkey && issuerUrl) {
    const r = await fetch(issuerUrl.replace(/\/$/, '') + '/receipts/issuer');
    const j = await r.json();
    pubkey = j && j.pubkey;
  }

  const report = verifySnapshot(snapshot, { pubkey });
  if (report.error) { console.error('cannot verify:', report.error); process.exit(2); }

  const t = report.totals || {};
  console.log(`snapshot ${snapshot.schema}  asOf=${snapshot.asOfDateNY}  section=${snapshot.section || 'ALL'}`);
  console.log(`students=${t.students}  records=${t.records}  verifiedReceipts=${t.verifiedReceipts}  unsigned=${t.unsignedRecords}`);
  console.log(`epoch  root=${(snapshot.epoch && snapshot.epoch.root || '-').slice(0, 12)}…  ${report.epochOk ? 'OK' : 'BROKEN'}`);
  for (const s of report.students || []) {
    const mark = s.verified ? '✓' : '✗';
    console.log(`  ${mark} ${s.username || s.studentId}  records=${s.recordCount}  head=${(s.head || '-').slice(0, 8)}  last=${s.lastActivityAt || '-'}`);
    for (const b of s.breaks) console.log(`      ! ${b.kind} ${b.itemId || ''}`.trimEnd());
  }
  if (report.ok) console.log('RESULT: VERIFIED — every signature, chain head, and the epoch anchor check out.');
  else console.log(`RESULT: ${report.breaks.length} BREAK(S) — see above.`);

  if (flag('--rebuild')) {
    if (!report.ok) { console.error('refusing to rebuild from an unverified snapshot'); process.exit(1); }
    const rosterUrl = arg('--roster-url');
    const secret = arg('--teacher-secret');
    if (!rosterUrl || !secret) { console.error('--rebuild needs --roster-url and --teacher-secret'); process.exit(2); }
    const bundles = (snapshot.students || []).map((s) => s.bundle).filter((b) => b && b.records && b.records.length);
    // Faithful restore: /admin/restore replays issuer-signed rows byte-for-byte (score
    // AS-IS, original receipt + timestamp) — unlike /ledger/import, which clamps to 0..1
    // and re-issues (right for offline self-reported work, lossy for disaster recovery).
    const r = await fetch(rosterUrl.replace(/\/$/, '') + '/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Teacher-Secret': secret },
      body: JSON.stringify({ bundles })
    });
    const j = await r.json().catch(() => ({}));
    console.log(`restore -> ${JSON.stringify(j)}`);
    process.exit(j && j.ok ? 0 : 1);
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
