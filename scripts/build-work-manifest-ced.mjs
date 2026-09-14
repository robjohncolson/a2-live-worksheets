#!/usr/bin/env node
// build-work-manifest-ced.mjs — P1a of the SY2627 reframe (Option B).
// Reorders work-manifest.json into the Fall-2026 5-unit CED teaching order.
// Old `lesson` ids and their activity itemIds are NOT touched, so the gradebook
// (which keys off itemIds) sees the kept lessons identically.
//
// PRESERVATION CLAIM (narrow, per Codex review): every KEPT CORE lesson-activity
// itemId is preserved verbatim. The source manifest's 3402 itemIds become 2641 in
// the fixture; the 758 difference is INTENTIONAL — 394 bonus-lesson itemIds
// (dropped: enrichment, off Do-Now) + 364 progress-check itemIds (deferred, below).
// The generator asserts this accounting and refuses to write on any violation.
//
// Progress checks (pc) are DEFERRED — old per-old-unit PCs straddle the new units
// (U1-PC, U2-PC, U5-PC) and U9-PC is all-bonus (see _pcReview); they can't be
// split without per-question topic tags. computeDonow() skips units w/o pc.
//
// CONSUMER AUDIT (why reorder+drop is safe): work-manifest.json is read by
// (1) donow.js computeDonow + (2) teacher.js view-as — order-SENSITIVE sequencing
// (the intended change); and (3) lesson-grade.js buildWorksheetBlankCounts — a
// keyed, order-INDEPENDENT map (activity==='worksheet' only). Core keys+itemIds
// are preserved → core worksheet grading is unaffected; only bonus worksheets lose
// blank counts (acceptable, enrichment); PCs are ignored by blank counts entirely.
// grade.js reads lesson-schedule.json, not this file.
//
// Output is a FIXTURE — it does NOT overwrite the live manifest. Whether the live
// manifest is replaced drop-in vs. Do-Now sequencing is split from the grade/
// history manifest is a P2/P3 decision, not settled here.
// Run: node scripts/build-work-manifest-ced.mjs [--out <path>]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
// Read the FROZEN 9-unit source snapshot (not the live manifest — that's now
// CED-shaped, so reading it would no longer be a clean transform). Refresh the
// source with build-work-manifest.mjs. Pass --deploy to write both live paths.
const SRC = resolve(REPO, arg('--source', 'scripts/fixtures/work-manifest-9unit-source.json'));
const CW  = resolve(REPO, arg('--crosswalk', '2026-crosswalk.json'));
const OUT = resolve(REPO, arg('--out', 'scripts/fixtures/work-manifest-ced.json'));

/** Testability exports (W-reg): frozen source + live dual-write targets. */
export const CED_FROZEN_SOURCE = SRC;
export const CED_LIVE_RELPATHS = [
  'data/work-manifest.json',
  'roster-server/data/work-manifest.json',
];

const manifest = JSON.parse(readFileSync(SRC, 'utf8'));
const crosswalk = JSON.parse(readFileSync(CW, 'utf8')).map;

const NEW_UNIT_TITLES = {
  1: 'Exploring One-Variable Data & Collecting Data',
  2: 'Probability, Random Variables & Distributions',
  3: 'Inference for Categorical Data: Proportions',
  4: 'Inference for Quantitative Data: Means',
  5: 'Regression Analysis',
};

// A manifest lesson id is either "U.L" or a combined "U.L1-L2" (same unit, L1..L2,
// e.g. "4.10-12" → 4.10,4.11,4.12). Expand to member old ids.
function members(id) {
  const m = /^(\d+)\.(\d+)-(\d+)$/.exec(id);
  if (!m) return [id];
  const [, u, a, b] = m.map(Number);
  const out = [];
  for (let l = a; l <= b; l++) out.push(`${u}.${l}`);
  return out;
}

const _tk = (t) => { const [a, b] = String(t || '').split('.').map(Number); return (a || 0) * 100 + (b || 0); };

// Classify each manifest lesson entry against the crosswalk.
function classify(entry) {
  const mem = members(entry.lesson);
  const cells = mem.map((id) => ({ id, c: crosswalk[id] || null }));
  const core = cells.filter((x) => x.c && x.c.status === 'core');
  const bonus = cells.filter((x) => x.c && x.c.status === 'bonus');
  const unknown = cells.filter((x) => !x.c);
  if (core.length === 0 && bonus.length > 0) return { drop: true, reason: 'all-bonus', mem };
  // core wins (a combined worksheet spanning core+bonus stays core). Anchor on the
  // MIN-new-topic core member so display order == sort order. A combined worksheet
  // can span >1 new topic (e.g. old 5.1-2 → new 2.11 Normal + 2.12 CLT); show a range.
  const sorted = core.slice().sort((a, b) => _tk(a.c.newTopic) - _tk(b.c.newTopic));
  const anchor = (sorted[0] || cells[0]);
  const units = [...new Set(core.map((x) => x.c.newUnit))];
  const topics = [...new Set(core.map((x) => x.c.newTopic))];
  const newTopic = topics.length > 1 ? `${sorted[0].c.newTopic}–${sorted[sorted.length - 1].c.newTopic}` : (anchor.c ? anchor.c.newTopic : null);
  return {
    drop: false,
    newUnit: anchor.c ? anchor.c.newUnit : null,
    newTopic,
    newLabel: anchor.c ? anchor.c.newLabel : null,
    topicKey: _tk(sorted[0] && sorted[0].c ? sorted[0].c.newTopic : 999),
    mixedBonus: bonus.length > 0,
    crossUnit: units.length > 1 ? units : undefined,   // should never happen; flagged if it does
    unknown: unknown.map((x) => x.id),
    mem,
  };
}

const byNewUnit = {};      // newUnit -> [ {lesson, activities, ced2026, _topicKey} ]
const dropped = [];        // all-bonus entries excluded from Do-Now
const unknownIds = [];     // manifest ids with no crosswalk row
const crossUnitWarn = [];  // combined entries whose members span >1 new unit (should be empty)

for (const unit of manifest.units) {
  for (const lesson of (unit.lessons || [])) {
    const cls = classify(lesson);
    if (cls.unknown && cls.unknown.length) unknownIds.push(...cls.unknown);
    if (cls.crossUnit) crossUnitWarn.push({ id: lesson.lesson, units: cls.crossUnit });
    if (cls.drop) { dropped.push(lesson.lesson); continue; }
    if (cls.newUnit == null) { unknownIds.push(lesson.lesson); continue; }
    (byNewUnit[cls.newUnit] = byNewUnit[cls.newUnit] || []).push({
      lesson: lesson.lesson,                 // OLD id, unchanged
      activities: lesson.activities,         // itemIds, unchanged
      ced2026: { newUnit: cls.newUnit, newTopic: cls.newTopic, newLabel: cls.newLabel, oldId: lesson.lesson, mixedBonus: cls.mixedBonus || undefined },
      _topicKey: cls.topicKey,
    });
  }
}

// Sort each new unit by new topic, then worksheet-before-quiz, then old id.
const actRank = (l) => (l.activities || []).some((a) => a.activity === 'worksheet') ? 0 : 1;
const units = [1, 2, 3, 4, 5].filter((u) => byNewUnit[u]).map((u) => {
  const lessons = byNewUnit[u].sort((a, b) => a._topicKey - b._topicKey || actRank(a) - actRank(b) || a.lesson.localeCompare(b.lesson))
    .map(({ _topicKey, ...rest }) => rest);
  return { unit: `U${u}`, title: NEW_UNIT_TITLES[u], lessons /* pc DEFERRED — see _pcReview */ };
});

// PC review: where does each old unit's core content land? (drives §P1b policy)
const pcReview = manifest.units.filter((x) => x.pc).map((oldU) => {
  const dist = {};
  for (const l of (oldU.lessons || [])) {
    for (const id of members(l.lesson)) {
      const c = crosswalk[id];
      if (c && c.status === 'core') dist[c.newUnit] = (dist[c.newUnit] || 0) + 1;
    }
  }
  const targets = Object.keys(dist).map(Number).sort((a, b) => dist[b] - dist[a]);
  return { oldPc: oldU.unit + '-PC', items: (oldU.pc.itemIds || []).length, landsIn: dist, straddles: targets.length > 1, allBonus: targets.length === 0 };
});

// ── itemId accounting (source lesson/bonus/pc vs kept) ───────────────────────
const droppedSet = new Set(dropped);
const srcLessonIds = new Set(), srcBonusIds = new Set(), srcPcIds = new Set();
for (const u of manifest.units) {
  for (const l of (u.lessons || [])) for (const a of (l.activities || [])) for (const it of (a.itemIds || [])) {
    srcLessonIds.add(it); if (droppedSet.has(l.lesson)) srcBonusIds.add(it);
  }
  if (u.pc) for (const it of (u.pc.itemIds || [])) srcPcIds.add(it);
}
const srcAll = new Set([...srcLessonIds, ...srcPcIds]);
const keptList = [];
for (const u of units) for (const l of u.lessons) for (const a of (l.activities || [])) for (const it of (a.itemIds || [])) keptList.push(it);
const keptSet = new Set(keptList);
const missing = [...srcAll].filter((x) => !keptSet.has(x));
const missingAllBonusOrPc = missing.every((x) => srcBonusIds.has(x) || srcPcIds.has(x));

// ── regenerate the top-level index (itemId → {unit,lesson,activity}) for kept
// entries, so the fixture is a faithful drop-in shape (no live consumer reads it
// today, but keep parity). ────────────────────────────────────────────────────
const index = {};
for (const u of units) for (const l of u.lessons) for (const a of (l.activities || [])) for (const it of (a.itemIds || [])) {
  index[it] = { unit: u.unit, lesson: l.lesson, activity: a.activity };
}

const invariants = {
  srcItemIds: srcAll.size, keptItemIds: keptSet.size, bonusItemIds: srcBonusIds.size, pcItemIds: srcPcIds.size,
  accountingOk: keptSet.size + srcBonusIds.size + srcPcIds.size === srcAll.size,
  allMissingAreBonusOrPc: missingAllBonusOrPc,
  noDuplicateKeptItemIds: keptList.length === keptSet.size,
  unknownEmpty: unknownIds.length === 0,
  crossUnitEmpty: crossUnitWarn.length === 0,
  pcStraddles: pcReview.filter((p) => p.straddles).map((p) => p.oldPc),
  pcAllBonus: pcReview.filter((p) => p.allBonus).map((p) => p.oldPc),
};

// Refuse to write if any structural invariant fails.
const checks = [
  ['accounting kept+bonus+pc == source', invariants.accountingOk],
  ['every missing itemId is bonus or PC', invariants.allMissingAreBonusOrPc],
  ['no duplicate kept itemIds', invariants.noDuplicateKeptItemIds],
  ['no unknown ids', invariants.unknownEmpty],
  ['no cross-unit combined entries', invariants.crossUnitEmpty],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('INVARIANT FAILURE:\n  ' + failed.map(([m]) => m).join('\n  ')); process.exit(1); }

const out = {
  generatedFrom: 'work-manifest.json + 2026-crosswalk.json (P1a lesson reframe)',
  ced: 'fall-2026-5unit',
  note: 'Do-Now sequencing fixture. Kept CORE lesson ids + itemIds preserved verbatim; 394 bonus + 364 PC itemIds intentionally omitted (see _invariants). PCs deferred (see _pcReview). NOT the live manifest.',
  _consumerAudit: 'Readers: donow.js/teacher.js computeDonow (order-sensitive, intended); lesson-grade.js buildWorksheetBlankCounts (keyed/order-independent — core grading unaffected, bonus worksheets lose blank counts, PCs ignored). grade.js reads lesson-schedule.json, not this.',
  units,
  index,
  _invariants: invariants,
  _dropped: [...new Set(dropped)].sort(),
  _unknown: [...new Set(unknownIds)].sort(),
  _crossUnit: crossUnitWarn,
  _pcReview: pcReview,
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${OUT}`);

// --deploy: write the CLEAN live manifest (audit metadata stripped) to BOTH live
// paths — the only sanctioned way to refresh the live Do-Now manifest post-P2.
// WORK_MANIFEST_DEPLOY_ROOT (test-only): redirect writes for W-reg without
// clobbering the real live copies during the regression suite.
if (process.argv.includes('--deploy')) {
  const live = {
    generatedFrom: 'work-manifest-ced (P1a) — Fall-2026 5-unit CED Do-Now order; old ids + itemIds preserved; bonus + PCs omitted (PCs live in AP Classroom)',
    generated: null,
    units,     // {unit, title, lessons} — no pc (computeDonow skips unit-less-pc)
    index,
  };
  const liveJson = JSON.stringify(live, null, 1) + '\n';
  const deployRoot = process.env.WORK_MANIFEST_DEPLOY_ROOT
    ? resolve(process.env.WORK_MANIFEST_DEPLOY_ROOT)
    : REPO;
  for (const p of CED_LIVE_RELPATHS) {
    const abs = resolve(deployRoot, p);
    writeFileSync(abs, liveJson);
    console.log(`  deployed → ${abs}`);
  }
}
console.log(`  units: ${units.map((u) => u.unit + '(' + u.lessons.length + ')').join(' ')}`);
console.log(`  itemIds: source ${invariants.srcItemIds} = kept ${invariants.keptItemIds} + bonus ${invariants.bonusItemIds} + PC ${invariants.pcItemIds}  [accounting ${invariants.accountingOk ? 'OK' : 'FAIL'}]`);
console.log(`  invariants: allMissingBonusOrPc=${invariants.allMissingAreBonusOrPc} noDup=${invariants.noDuplicateKeptItemIds} unknown=${invariants.unknownEmpty} crossUnit=${invariants.crossUnitEmpty}`);
console.log(`  dropped (all-bonus): ${out._dropped.join(', ') || '(none)'}`);
console.log(`  PC straddles: ${invariants.pcStraddles.join(', ')}; all-bonus: ${invariants.pcAllBonus.join(', ')}`);
