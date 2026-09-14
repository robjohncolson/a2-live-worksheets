#!/usr/bin/env node
// nightly-backup.mjs — local nightly grade backup + REVIEW digest.
//
// Each night: pull GET /admin/snapshot, save a dated + latest copy, verify it
// zero-trust, then DIFF against last night's snapshot to produce a human-readable
// "what the kids did since the last backup" review the teacher skims each morning.
//
// Config (keeps the teacher key off the Task Scheduler command line): a local JSON
//   { "rosterUrl": "...", "teacherKey": "...", "backupDir": "C:\\Users\\you\\grade-backups" }
// passed via --config, or --roster-url/--teacher-key/--dir flags, or env
// ROSTER_URL/TEACHER_KEY. Writes: <dir>/snapshots/<date>.json, <dir>/latest.json,
// <dir>/review-<date>.txt, and appends <dir>/ANCHORS.md. Exit 0 = verified, 1 = a
// verification break (so the scheduler can flag it). See GRADE_LEDGER_DURABILITY_SPEC.md.

import fs from 'node:fs';
import path from 'node:path';
import { verifySnapshot } from '../roster-server/snapshot-verify.js';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

function loadConfig() {
  const p = arg('--config');
  let cfg = {};
  if (p && fs.existsSync(p)) { try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { } }
  return {
    rosterUrl: arg('--roster-url') || cfg.rosterUrl || process.env.ROSTER_URL,
    teacherKey: arg('--teacher-key') || cfg.teacherKey || process.env.TEACHER_KEY,
    backupDir: arg('--dir') || cfg.backupDir || (p ? path.dirname(p) : process.cwd())
  };
}

function snip(v, n = 70) {
  let s = (v === null || v === undefined) ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function pad(s, n) { s = String(s == null ? '' : s); return (s.length >= n) ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

// Index a snapshot's records by receipt_id (unique per answered item / re-grade).
function indexByReceipt(snap) {
  const m = new Map();
  for (const st of (snap.students || [])) for (const r of ((st.bundle && st.bundle.records) || [])) {
    if (r.receipt_id) m.set(r.receipt_id, true);
  }
  return m;
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.rosterUrl || !cfg.teacherKey) { console.error('need rosterUrl + teacherKey (via --config json, flags, or env)'); process.exit(2); }
  const snapDir = path.join(cfg.backupDir, 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const latestPath = path.join(cfg.backupDir, 'latest.json');

  // Previous snapshot for the diff — read BEFORE we overwrite latest.json.
  let prev = null;
  if (fs.existsSync(latestPath)) { try { prev = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch (_) { } }

  // Pull tonight's snapshot.
  let snap;
  try {
    const res = await fetch(cfg.rosterUrl.replace(/\/$/, '') + '/admin/snapshot', { headers: { 'x-teacher-secret': cfg.teacherKey } });
    if (res.status !== 200) throw new Error('HTTP ' + res.status + ' (check the teacher key / URL)');
    snap = await res.json();
  } catch (e) { console.error('pull failed:', e.message); process.exit(1); }

  const date = snap.asOfDateNY || new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(snapDir, date + '.json'), JSON.stringify(snap, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(snap, null, 2));

  // Verify zero-trust.
  const rep = verifySnapshot(snap);
  const t = rep.totals || {};

  // Diff: records whose receipt_id wasn't in last night's snapshot = new work.
  const prevIdx = prev ? indexByReceipt(prev) : null;
  const perStudent = new Map();
  for (const st of (snap.students || [])) for (const r of ((st.bundle && st.bundle.records) || [])) {
    if (!r.receipt_id) continue;
    if (prevIdx && prevIdx.has(r.receipt_id)) continue;
    const key = st.studentId;
    if (!perStudent.has(key)) perStudent.set(key, { name: st.realName || st.username || st.studentId, items: [] });
    perStudent.get(key).items.push(r);
  }

  const out = [];
  out.push('NIGHTLY GRADE REVIEW — ' + date);
  out.push('Verify: ' + (rep.ok ? '✓ VERIFIED' : '✗ ' + (rep.breaks ? rep.breaks.length : '?') + ' BREAK(S)') +
    '  (' + (t.students || 0) + ' students, ' + (t.records || 0) + ' records, ' + (t.verifiedReceipts || 0) + ' signed, ' +
    (t.reviews || 0) + ' reviews/' + (t.verifiedReviews || 0) + ' signed, anchor ' + (rep.epochOk ? 'OK' : 'BROKEN') + ')');
  if (!rep.ok) { out.push('!!! VERIFICATION FAILED — do NOT trust this backup until investigated:'); for (const b of (rep.breaks || []).slice(0, 25)) out.push('   - ' + JSON.stringify(b)); }
  out.push('');
  if (!prev) {
    out.push('(first backup in this folder — no previous snapshot to diff against)');
  } else {
    const active = [...perStudent.values()].filter((s) => s.items.length).sort((a, b) => b.items.length - a.items.length);
    const newCount = active.reduce((n, s) => n + s.items.length, 0);
    out.push('NEW WORK SINCE LAST BACKUP — ' + active.length + ' student(s), ' + newCount + ' new item(s)');
    out.push('');
    for (const s of active) {
      out.push('• ' + s.name + '  (' + s.items.length + ' new)');
      for (const r of s.items.slice(0, 50)) {
        out.push('    ' + pad(r.source, 13) + pad(r.itemId, 22) + 'score=' + pad(r.score == null ? '—' : r.score, 6) + snip(r.response));
      }
      if (s.items.length > 50) out.push('    … +' + (s.items.length - 50) + ' more');
      out.push('');
    }
    if (!active.length) out.push('(no new work since the last backup)');
  }

  // ── Review coverage (NIGHTLY_REVIEW_SPEC §8) — the offline mirror of the Desk surface.
  // Flags students who DID work but the teacher hasn't reviewed in N days (or ever).
  const N_DAYS = 5;
  const reviewedTotal = (snap.students || []).reduce((n, x) => n + (((x.bundle && x.bundle.reviews) || []).length), 0);
  const lastReviewMs = (st) => {
    let m = 0;
    for (const r of ((st.bundle && st.bundle.reviews) || [])) { const ts = Date.parse(r.seenAt) || 0; if (ts > m) m = ts; }
    return m;
  };
  const nowMs = Date.now();
  const stale = (snap.students || []).map((st) => {
    const recs = ((st.bundle && st.bundle.records) || []).length;
    const lr = lastReviewMs(st);
    return { name: st.realName || st.username || st.studentId, recs, days: lr ? Math.floor((nowMs - lr) / 86400000) : null };
  }).filter((s) => s.recs > 0 && (s.days === null || s.days >= N_DAYS))
    .sort((a, b) => (b.days === null ? 1e9 : b.days) - (a.days === null ? 1e9 : a.days));
  out.push('');
  out.push('REVIEW COVERAGE — ' + reviewedTotal + ' item(s) reviewed all-time; ' + stale.length + ' student(s) not reviewed in ' + N_DAYS + '+ days');
  for (const s of stale.slice(0, 40)) {
    out.push('    ⚠ ' + pad(s.name, 28) + (s.days === null ? 'never reviewed' : s.days + ' days ago'));
  }
  if (!stale.length) out.push('    (everyone with work has been reviewed within ' + N_DAYS + ' days)');

  const review = out.join('\n');
  const reviewPath = path.join(cfg.backupDir, 'review-' + date + '.txt');
  fs.writeFileSync(reviewPath, review);

  // Anchor line (mirrors the git mirror's ANCHORS.md).
  const recs = (snap.students || []).reduce((n, x) => n + (((x.bundle && x.bundle.records) || []).length), 0);
  fs.appendFileSync(path.join(cfg.backupDir, 'ANCHORS.md'),
    `${date}  root=${snap.epoch && snap.epoch.root || '-'}  students=${(snap.students || []).length}  records=${recs}  verify=${rep.ok ? 'OK' : 'FAIL'}  at=${new Date().toISOString()}\n`);

  console.log(review);
  console.log('\nSaved: ' + path.join(snapDir, date + '.json'));
  console.log('Review: ' + reviewPath);
  process.exit(rep.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
