/**
 * Structural tests for the Algebra 2 Diagnostic Study Guide (v3).
 *
 * The v3 worksheet uses a focused three-pane layout: a weakness rail, one
 * active probe at a time, and a remediation panel. Adaptive probe selection,
 * BKT mastery updates, AI grading, focus synthesis, and export/import remain
 * in place, but the old per-unit card and DAG-renderer shell is gone.
 *
 * These tests assert the structural wiring — they don't render the UI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML_PATH = resolve(__dirname, '../study_guide_diagnostic.html');
const PROMPTS_PATH = resolve(__dirname, '../ai-grading-prompts-study-guide.js');
const FRQ_BANK_PATH = resolve(__dirname, '../data/study-guide-frq-bank.js');
const SYNC_CONFIG_PATH = resolve(__dirname, '../data/study-guide-sync-config.js');
const SYNC_SQL_PATH = resolve(__dirname, '../scripts/study-guide-state-backups.sql');

const EXPECTED_GATE_IDS = [
  'U1-PC-FRQ-Q02',
  'U2-PC-FRQ-Q02',
  'U3-PC-FRQ-Q01',
  'U4-PC-FRQ-Q02',
  'U5-PC-FRQ-Q02',
  'U6-PC-FRQ-Q01',
  'U7-PC-FRQ-Q02',
  'U8-PC-FRQ-Q01',
  'U9-PC-FRQ-Q01',
];





describe('study_guide_diagnostic.html — v3 structure', () => {
  it('exists on disk', () => {
    expect(existsSync(HTML_PATH)).toBe(true);
  });

  it('loads railway, curriculum, units, frameworks, and study-guide prompts', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('./railway_config.js');
    expect(src).toContain('./railway_client.js');
    expect(src).toContain('../curriculum_render/data/curriculum.js');
    expect(src).toContain('../curriculum_render/data/units.js');
    expect(src).toContain('../curriculum_render/data/frameworks.js');
    
  });

  it('references all 9 expected gate IDs', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    for (const gateId of EXPECTED_GATE_IDS) {
      expect(src, `gate ID ${gateId} should appear`).toContain(gateId);
    }
  });

  it('has the focused v3 layout containers', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="sg-rail"');
    expect(src).toContain('id="sg-active"');
    expect(src).toContain('id="sg-remediation"');
    expect(src).toContain('id="theme-toggle"');
  });

  it('uses the v3 localStorage key', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v3');
  });

  it('POSTs reflections to /api/ai/grade', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('/api/ai/grade');
  });

  it('calls the focus synthesis prompt builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('buildFocusSynthesisPromptSG');
  });

  it('has export and import buttons', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="export-btn"');
    expect(src).toContain('id="import-input"');
  });

  it('embeds a JSON state block id for re-import', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-state-v3');
  });

  it('references EMBEDDED_CURRICULUM, ALL_UNITS_DATA, and UNIT_FRAMEWORKS', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('EMBEDDED_CURRICULUM');
    expect(src).toContain('ALL_UNITS_DATA');
    expect(src).toContain('UNIT_FRAMEWORKS');
  });
});

describe('study_guide_diagnostic.html — DAG / BKT integration', () => {
  it('loads the adaptive-study scripts (topology, tag map, BKT, selector)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/dag-topology.js');
    expect(src).toContain('data/question-lo-map.js');
    expect(src).toContain('lib/bkt.js');
    expect(src).toContain('lib/probe-selector.js');
  });

  it('persists per-unit masteryState through makeDefaultState / normalizeState / getUnit', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const masteryOccurrences = (src.match(/masteryState/g) || []).length;
    expect(masteryOccurrences).toBeGreaterThanOrEqual(6);
  });

  it('defines adaptive probe selection via ProbeSelector with a legacy fallback', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.ProbeSelector');
    expect(src).toContain('selectProbes');
    expect(src).toContain('buildProbesLegacy');
    expect(src).toContain('PROBE_COUNT');
    expect(src).toContain('alreadyAnswered');
  });

  it('updates BKT mastery when a probe is checked', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.BKT.updateMastery');
    expect(src).toContain('loIdsForQuestion');
  });

  it('passes a masterySnapshot into the focus synthesis prompt builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('masterySnapshot');
    expect(src).toContain('ensureMasteryState');
  });

  
});

describe('study_guide_diagnostic.html — v4 daily queue layout', () => {
  it('defines the v5 render pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderQueuePane');
    expect(src).toContain('function renderActiveProbe');
    expect(src).toContain('function renderRemediation');
    expect(src).toContain('function advanceDailyQueue');
    expect(src).toContain('function advanceDailyQueueV5');
    expect(src).toContain('function applyFrqFocusToBkt');
    expect(src).toContain('function buildCurriculumLink');
    expect(src).toContain('function renderTierInfoModal');
    expect(src).toContain('function setActiveProbe');
    expect(src).toContain('function applyTheme');
  });

  it('no longer references the removed v3 tree-rail pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function renderTreeRail');
    expect(src).not.toContain('function markActiveRailRow');
    expect(src).not.toContain('function pickNextWeakest');
    expect(src).not.toContain('function activateNextWeakest');
  });

  it('no longer references the removed DAG renderer pipeline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('renderDagPanel');
    expect(src).not.toContain('window.DagRenderer');
    expect(src).not.toContain('lib/dag-renderer.js');
  });

  it('loads the formula-backed study-guide data layer scripts in order', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/ap-stats-cartridge.js');
    expect(src).toContain('data/formula-probe-map.js');
    expect(src).toContain('data/formula-probe-supplement.js');
  });

  it('uses the v7 schema version, storage key, and state id', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("STORAGE_KEY = 'apStatsStudyGuideDiagnostic.v7'");
    expect(src).toContain('SCHEMA_VERSION = 7');
    expect(src).toContain('sg-state-v7');
  });

  it('declares v7 storage schema and keeps v6 migration chain', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('apStatsStudyGuideDiagnostic.v7');
    expect(src).toContain('sg-state-v7');
    expect(src).toContain('SCHEMA_VERSION = 7');
    // v6 key still referenced in migration chain (fallback load)
    expect(src).toContain('apStatsStudyGuideDiagnostic.v6');
  });

  it('exposes v6 FRQ decomposition helpers', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFrqDecomposition');
    expect(src).toContain('computeEffectiveScore');
    expect(src).toContain('computeEffectivePenalty');
    expect(src).toContain('recordHelperUsed');
  });

  it('includes frqHelpers state field', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('frqHelpers');
    expect(src).toContain('defaultFrqHelpers');
    expect(src).toContain('normalizeFrqHelpers');
  });

  it('has FRQ helpers panel class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-frq-helpers');
  });

  it('loads frq-decompositions.js script', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/frq-decompositions.js');
  });

  it('publishes and consumes __studyGuideV5__ while keeping the v4 bridge inline', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.__studyGuideV4__');
    expect(src).toContain('window.__studyGuideV5__');
    expect(src).toContain('tier: 0');
    expect(src).toContain('mcq: 5');
    expect(src).toContain('frq: 1');
    expect(src).toContain('recordFormulaTouch');
  });

  it('renders the v5 tier meter, queue tabs, and FRQ paper toggle hooks', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-tier-meter');
    expect(src).toContain('sg-queue-tabs');
    expect(src).toContain('sg-frq-paper-toggle');
  });

  it('uses the v5 queue generator call sites instead of the old v4 init call', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('pickDailyQueueV5(state, today()');
    expect(src).not.toContain('pickDailyQueue(state, today()');
  });

  it('guards against supplement ID collisions on init', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('supplement ID collision');
  });

  it('links to curriculum_render via query params', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('../curriculum_render/index.html?u=');
  });
});

describe('study_guide_diagnostic.html — Thread 1: formula card modal', () => {
  it('defines showFormulaCardModal function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function showFormulaCardModal(');
  });

  it('uses the .sg-formula-modal class in the modal builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal');
  });

  it('calls getFormulaEntry inside showFormulaCardModal to look up formula content', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFormulaEntry(formulaId)');
  });

  it('renders the latex block from formulaEntry', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal-latex');
    expect(src).toContain('formulaEntry.latex');
  });

  it('renders the hint callout from formulaEntry', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-formula-modal-hint');
    expect(src).toContain('formulaEntry.hint');
  });

  it('calls showFormulaCardModal from doHelperAction formula branch', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("showFormulaCardModal(id, unit, data, questionId)");
  });

  it('calls recordFormulaHint from doHelperAction formula branch', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('recordFormulaHint(id, state)');
  });

  it('exports getFormulaEntry from __studyGuideV4__', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('getFormulaEntry: getFormulaEntry');
  });

  it('exports recordFormulaHint from __studyGuideV4__', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('recordFormulaHint: recordFormulaHint');
  });
});

describe('study_guide_diagnostic.html — Thread 2: SRS hint feed', () => {
  it('defines recordFormulaHint function in the inline v4 block', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function recordFormulaHint(');
  });

  it('includes hintedAt passthrough in normalizeState', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("entry.hintedAt = v.hintedAt");
  });

  it('formulaWeight reads hintedAt for the SRS boost', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('hintedAt');
    expect(src).toContain('hintBoost');
  });
});


describe('study_guide_diagnostic.html — session 79 fix-pass regression tests', () => {
  it('Fix 1: wraps formulaEntry.latex in block-math delimiters for MathJax', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The modal builder must delimit the raw TeX so MathJax recognizes it.
    // Accepts \\[...\\] (block) or \\(...\\) (inline) — either works.
    const hasBlockDelim = src.includes("'\\\\[' + formulaEntry.latex + '\\\\]'") ||
                          src.includes('"\\\\[" + formulaEntry.latex + "\\\\]"') ||
                          src.includes("'\\[' + formulaEntry.latex + '\\]'") ||
                          src.includes('"\\[" + formulaEntry.latex + "\\]"') ||
                          src.includes('`\\\\[${formulaEntry.latex}\\\\]`') ||
                          src.includes('`\\[${formulaEntry.latex}\\]`');
    const hasInlineDelim = src.includes("'\\\\(' + formulaEntry.latex + '\\\\)'") ||
                           src.includes('"\\\\(" + formulaEntry.latex + "\\\\)"') ||
                           src.includes('`\\\\(${formulaEntry.latex}\\\\)`') ||
                           src.includes('`\\(${formulaEntry.latex}\\)`');
    expect(hasBlockDelim || hasInlineDelim).toBe(true);
  });

  it('Fix 2: subconcept rendering accesses sc.q (not bare sc)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The subconcept loop must reference sc.q (the question string), not pass sc directly.
    expect(src).toContain('sc.q');
  });

  it('Fix 2: subconcept rendering accesses sc.correct for the answer', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sc.correct');
  });

  it('Fix 3: used formula buttons still get a click listener (re-open modal)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The else-if branch for used formula buttons must attach a click listener.
    expect(src).toContain("} else if (kind === 'formula') {");
    // And it must call showFormulaCardModal for re-opens.
    expect(src).toContain("showFormulaCardModal(id, unit, data, questionId)");
  });

  it('Fix 3: CSS pointer-events:none scoped to drill buttons only, not all used buttons', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The broad rule locking all [data-used="true"] with pointer-events:none must NOT exist.
    expect(src).not.toContain('.sg-frq-helper-btn[data-used="true"]{opacity:.72;background:var(--sg-bar-track);cursor:default;pointer-events:none}');
    // The drill-specific rule must exist.
    expect(src).toContain('sg-frq-helper-drill-btn[data-used="true"]');
    // Formula buttons must NOT have pointer-events:none when used.
    expect(src).toContain('sg-frq-helper-formula-btn[data-used="true"]');
    expect(src).not.toMatch(/sg-frq-helper-formula-btn\[data-used="true"\][^}]*pointer-events:none/);
  });

  it('Fix 4: null formulaEntry shows a data-issue fallback message in the modal', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // There must be a branch that renders a fallback when formulaEntry is falsy.
    expect(src).toContain('sg-formula-modal-not-found');
    expect(src).toContain('data issue');
  });

  it('Fix 2 (polish): subconcept loop filters out null/malformed entries before rendering', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The filter must guard against null entries and missing .q / .correct fields.
    expect(src).toContain('sc && typeof sc === \'object\' && sc.q && sc.correct');
    // The "Check your understanding" header must only appear inside the validSubconcepts guard.
    expect(src).toContain('validSubconcepts.length');
  });
});

describe('study_guide_diagnostic.html — session 80 formula UX fixes', () => {
  // Note: chip rendering tests removed in session 86 (chip deleted — redundant with session-81 review queue).
  it('handleHelperClick bypasses confirmation modal for formula kind', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("if (kind === 'formula')");
  });

  it('doHelperAction handles drill kind via activeDrillQuestionId', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('activeDrillQuestionId');
  });
});

describe('study_guide_diagnostic.html — session 81 review queue panel', () => {
  it('defines renderReviewQueuePanel function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderReviewQueuePanel()');
  });

  it('renderReviewQueuePanel reads from reviewQueueEntries(state, today())', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('reviewQueueEntries(state, today())');
  });

  it('renderReviewQueuePanel renders sg-review-queue disclosure', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue');
    expect(src).toContain('sg-review-queue-summary');
    expect(src).toContain('sg-review-queue-body');
  });

  it('renderReviewQueuePanel shows count badge', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue-count');
    expect(src).toContain('entries.length');
  });

  it('renderReviewQueuePanel shows empty-state message when list is empty', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-review-queue-empty');
    expect(src).toContain('No formulas to review yet');
  });

  it('review button click calls showFormulaCardModal with onClose callback', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // Review button must call showFormulaCardModal with entry.id and an onClose callback.
    expect(src).toContain('showFormulaCardModal(entry.id, null, null, null, function()');
    expect(src).toContain('renderReviewQueuePanel()');
  });

  it('graduate button click calls graduateFormula', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('graduateFormula(entry.id, state)');
    expect(src).toContain('sg-review-queue-btn-graduate');
  });

  it('showFormulaCardModal accepts optional onClose parameter', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function showFormulaCardModal(formulaId, unit, data, questionId, onClose)');
  });

  it('closeModal calls onClose when provided, renderActiveProbe otherwise', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (typeof onClose === \'function\')');
    expect(src).toContain('onClose()');
    // The else branch must still call renderActiveProbe.
    const closeModalIdx = src.indexOf('if (typeof onClose === \'function\')');
    const region = src.slice(closeModalIdx, closeModalIdx + 200);
    expect(region).toContain('renderActiveProbe()');
  });

  it('normalizeState preserves graduated field on touchedFormulas entries', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (v.graduated === true) entry.graduated = true');
  });

  it('meta text uses "Hinted today" / "Hinted yesterday" / "Hinted N days ago"', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Hinted today');
    expect(src).toContain('Hinted yesterday');
    expect(src).toContain('Hinted ');
    expect(src).toContain('days ago');
  });

  it('CSS rules for review queue are present', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-review-queue{');
    expect(src).toContain('.sg-review-queue-item{');
    expect(src).toContain('.sg-review-queue-btn{');
    expect(src).toContain('.sg-review-queue-btn-graduate{');
  });

  it('new functions are exported via v4 and destructured from v5', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('daysBetween: daysBetween');
    expect(src).toContain('reviewQueueEntries: reviewQueueEntries');
    expect(src).toContain('graduateFormula: graduateFormula');
    expect(src).toContain('daysBetween, reviewQueueEntries, graduateFormula');
  });
});

describe('study_guide_diagnostic.html — session 82 always-scored simplification', () => {
  it('handleHelperClick calls doHelperAction directly without any mode branching', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // handleHelperClick must be exactly 3 lines: guard + doHelperAction call. No frqMode branching.
    const fnStart = src.indexOf('function handleHelperClick(');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doHelperAction(kind, id, unit, data, questionId)');
    expect(fnBody).not.toContain("frqMode");
    expect(fnBody).not.toContain('showFrqHelperModal');
  });

  it('buildFrqHelperButton cost pills always show real penalty values', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // No 'free' string should appear inside the cost pill branch.
    const fnStart = src.indexOf('function buildFrqHelperButton(');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("'free'");
    // Formula button must show −5%.
    expect(fnBody).toContain('\\u22125%');
    // Drill pending state must show −10% / −15%.
    expect(fnBody).toContain('\\u221210% / \\u221215%');
  });

  it('renderFrqHelperPanel intro always includes the penalty values', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The source contains JS unicode escapes — check for the escape sequences literally.
    expect(src).toContain('Formula cards:');
    expect(src).toContain('Correct drill:');
    expect(src).toContain('Wrong drill:');
    expect(src).toContain('Max total penalty:');
    expect(src).toContain('sg-frq-helpers-intro');
  });

  it('renderFrqHelperPanel includes the escape-hatch note about grading', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-frq-helpers-escape-hatch');
    expect(src).toContain("Click");
    expect(src).toContain("Grade");
    expect(src).toContain("until then, helpers don");
  });

  it('renderGrade signature includes questionId and no mode parameter', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderGrade(grade, effectiveScoreResult, questionId)');
    expect(src).not.toContain('function renderGrade(grade, effectiveScoreResult, mode)');
  });

  it('renderQueuePane FRQ click handler does not touch unitData.frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The click handler block must not write frqMode.
    const queuePaneStart = src.indexOf('function renderQueuePane()');
    const queuePaneEnd = src.indexOf('\n      function ', queuePaneStart + 1);
    const queuePaneBody = src.slice(queuePaneStart, queuePaneEnd);
    expect(queuePaneBody).not.toContain("frqMode");
  });

  it('makeDefaultState per-unit defaults do not include frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const fnStart = src.indexOf('function makeDefaultState()');
    const fnEnd = src.indexOf('\n      }', fnStart) + '\n      }'.length;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('frqMode');
  });

  it('normalizeState does not preserve frqMode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain("value.frqMode");
  });

  it('showFrqHelperModal is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function showFrqHelperModal(');
  });

  it('showGateEscalationModal is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function showGateEscalationModal(');
  });

  it('renderFrqModeBanner is not defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function renderFrqModeBanner(');
  });
});

describe('session 84 modal viewport overflow fix', () => {
  it('sg-modal base rule caps height at 90vh with overflow-y auto', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const rule = src.match(/\.sg-modal\{[^}]+\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain('max-height:90vh');
    expect(rule[0]).toContain('overflow-y:auto');
  });

  it('sg-modal uses overscroll-behavior:contain to prevent background scroll', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const rule = src.match(/\.sg-modal\{[^}]+\}/);
    expect(rule[0]).toContain('overscroll-behavior:contain');
  });
});

describe('session 83 TI-84 procedure walkthroughs', () => {
  const PROCEDURES_JS_PATH = resolve(__dirname, '../data/ti84-procedures.js');
  const MAP_JS_PATH = resolve(__dirname, '../data/formula-procedure-map.js');
  const PROCEDURES_JSON_PATH = resolve(__dirname, '../ti84-procedures-data.json');

  // Test 1
  it('loads window.TI84_PROCEDURES via data/ti84-procedures.js script tag', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('<script src="data/ti84-procedures.js"></script>');
  });

  // Test 2
  it('loads window.FORMULA_PROCEDURE_MAP via data/formula-procedure-map.js script tag', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('<script src="data/formula-procedure-map.js"></script>');
  });

  // Test 3
  it('defines renderProcedureWalkthrough function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderProcedureWalkthrough(');
  });

  // Test 4
  it('showFormulaCardModal reads window.FORMULA_PROCEDURE_MAP', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.FORMULA_PROCEDURE_MAP || {})[formulaId]');
  });

  // Test 5
  it('showFormulaCardModal always renders a calc-steps details block', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("const calcDetails = document.createElement('details');");
    expect(src).toContain("calcDetails.className = 'sg-formula-modal-calc-steps'");
  });

  // Test 6
  it('calc-steps details uses .sg-formula-modal-calc-steps class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("calcDetails.className = 'sg-formula-modal-calc-steps'");
  });

  // Test 7
  it('calc-steps summary text is "📱 Show calculator steps"', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('TI-84 calculator steps');
  });

  // Test 8
  it('renderProcedureWalkthrough renders sg-calc-walkthrough container', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("make('div', 'sg-calc-walkthrough')");
  });

  // Test 9
  it('renderProcedureWalkthrough renders sg-calc-step-list', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("make('ol', 'sg-calc-step-list')");
  });

  // Test 10
  it('renderProcedureWalkthrough renders sg-calc-prereq when dataRequirements non-empty', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-calc-prereq');
    expect(src).toContain('hasDataReqs');
  });

  // Test 11
  it('KEY_DISPLAY map wraps arrow keys as unicode', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("RIGHT: '\u2192'");
    expect(src).toContain("DOWN: '\u2193'");
  });

  // Test 12
  it('parameter placeholder keys are rendered as sg-calc-param chips', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("key.startsWith('{') && key.endsWith('}')" );
    expect(src).toContain("sg-calc-param");
  });

  // Test 13
  it('narration wraps [KEY] patterns in <strong>', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.replace(/\\[([A-Z0-9');
    expect(src).toContain('<strong>[$1]</strong>');
  });

  // Test 14
  it('formula-procedure-map.js exports at least 30 mappings', () => {
    const mapSrc = readFileSync(MAP_JS_PATH, 'utf8');
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', mapSrc)(win);
    expect(Object.keys(win.FORMULA_PROCEDURE_MAP).length).toBeGreaterThanOrEqual(30);
  });

  // Test 15
  it('every mapped procedure id exists in the procedures data', () => {
    const mapSrc = readFileSync(MAP_JS_PATH, 'utf8');
    const procSrc = readFileSync(PROCEDURES_JS_PATH, 'utf8');
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', mapSrc)(win);
    // eslint-disable-next-line no-new-func
    new Function('window', procSrc)(win);
    const procedureIds = new Set(win.TI84_PROCEDURES.procedures.map(p => p.id));
    const mapValues = Object.values(win.FORMULA_PROCEDURE_MAP);
    for (const procId of mapValues) {
      expect(procedureIds.has(procId), `Procedure id "${procId}" not found in ti84-procedures-data.json`).toBe(true);
    }
  });
});

describe('session 85 mastery map', () => {
  it('defines renderMasteryMap function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderMasteryMap(');
  });

  it('defines renderMasteryMiniMap function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderMasteryMiniMap(');
  });

  it('defines showMasteryMapModal function', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function showMasteryMapModal(');
  });

  it('mastery map modal uses sg-mastery-map-modal class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-mastery-map-modal');
  });

  it('mastery map modal overrides max-height and overflow', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-mastery-map-modal .sg-modal');
    expect(src).toContain('overflow:hidden');
  });

  it('mastery map legend shows four color states', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-mastery-legend-dot');
    expect(src).toContain('Untouched');
    expect(src).toContain('Low');
    expect(src).toContain('Mid');
    expect(src).toContain('High');
    expect(src).toContain('Locked');
    expect(src).toContain('1 ring');
    expect(src).toContain('3 rings');
  });

  it('renderQueuePane appends the mastery-map-panel', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('renderMasteryMapPanel');
    expect(src).toContain('sg-mastery-map-panel');
  });

  it('mini-map canvas has width 120 and height 80', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('miniCanvas.width = 120');
    expect(src).toContain('miniCanvas.height = 80');
  });

  it('full-screen canvas uses createRadialGradient for glow', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('createRadialGradient');
  });

  it('click handler calls showFormulaCardModal with a no-op onClose', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('showFormulaCardModal(hit.id, null, null, null, noop)');
  });

  it('wheel handler prevents default and clamps zoom to [minZoom, maxZoom]', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('e.preventDefault()');
    expect(src).toContain('minZoom');
    expect(src).toContain('maxZoom');
  });

  it('drag vs click threshold is 4 pixels', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('dist < 4');
  });
});

describe('session 86 mastery map polish', () => {
  it('renderMasteryMap draws cluster outline circles before nodes', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const outlineIndex = src.indexOf("ctx.strokeStyle = '#77766C'");
    const nodesIndex = src.indexOf('// Draw nodes.');
    expect(outlineIndex).toBeGreaterThan(-1);
    expect(nodesIndex).toBeGreaterThan(-1);
    expect(outlineIndex).toBeLessThan(nodesIndex);
    expect(src).toContain('OUTLINE_RADIUS = 80');
  });

  it('mastery map uses a granular monotonic ramp plus non-hue cues without locked-node opacity', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('const MASTERY_MAP_RAMP = [');
    expect(src).toContain('ringCount');
    expect(src).toContain("cue: '—'");
    expect(src).toContain("cue: '×'");
    expect(src).not.toContain('ctx.globalAlpha = locked ? 0.4 : 1');
    expect(src).not.toContain('ctx.globalAlpha = miniLocked ? 0.4 : 1');
  });

  it('night-only component overrides are rooted on data-theme and paper copy uses normal ink', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('.sg-night .');
    expect(src).toContain(':root[data-theme="night"] .sg-rubric-notes');
    expect(src).toContain(':root[data-theme="night"] .sg-calc-prereq');
    expect(src).toContain(':root[data-theme="night"] .sg-calc-param');
    expect(src).toMatch(/\.sg-calc-prereq\{[^}]*color:var\(--sg-text\)/);
  });

  it('lifeboat correctness chips expose visible and accessible status cues', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("chip.textContent += ' ✓'");
    expect(src).toContain("chip.textContent += ' ✕'");
    expect(src).toContain("chip.setAttribute('aria-label', questionLabel + ': ' + resultLabel");
  });

  it('mastery map modal has a tooltip element', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('sg-mastery-map-tooltip');
  });

  it('tooltip shows formula name and mastery percent on hover', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Math.round(hovTouched.lastMastery * 100)');
    expect(src).toContain('sg-mastery-tooltip-name');
    expect(src).toContain('sg-mastery-tooltip-meta');
  });

  it('tooltip shows "Not yet touched" for untouched formulas', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Not yet touched');
  });

  it('tooltip shows "Graduated" for graduated formulas', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Graduated');
    expect(src).toContain('graduated === true');
  });

  it('showMasteryMapModal uses requestAnimationFrame for the pulse loop', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('requestAnimationFrame');
    expect(src).toContain('pulseGlowScale');
  });

  it('showMasteryMapModal cancels the rAF loop on close', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('cancelAnimationFrame');
    expect(src).toContain('pulseRafId');
  });
});

describe('session 86 queued chip removal', () => {
  it('renderFrqHelperPanel no longer renders the sg-frq-queued-formulas chip', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The class must not appear anywhere in the source (chip and CSS both removed).
    expect(src).not.toContain('sg-frq-queued-formulas');
  });

  it('CSS rules for sg-frq-queued-formulas are removed', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('.sg-frq-queued-formulas{');
    expect(src).not.toContain('.sg-frq-queued-label');
    expect(src).not.toContain('.sg-frq-queued-list');
  });
});

describe('session 88 mastery map click fix', () => {
  it('showMasteryMapModal defines a toBitmap helper', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function toBitmap(e)');
  });

  it('toBitmap uses canvas.getBoundingClientRect for CSS-to-bitmap scaling', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const toBitmapMatch = src.match(/function toBitmap\(e\)\s*\{[\s\S]*?\n\s{8}\}/);
    expect(toBitmapMatch).not.toBeNull();
    expect(toBitmapMatch[0]).toContain('canvas.getBoundingClientRect');
    expect(toBitmapMatch[0]).toContain('canvas.width');
    expect(toBitmapMatch[0]).toContain('canvas.height');
  });

  it('click (mouseup) hit-test uses toBitmap-converted coordinates', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const mouseupMatch = src.match(/canvas\.addEventListener\('mouseup'[\s\S]*?\}\);/);
    expect(mouseupMatch).not.toBeNull();
    expect(mouseupMatch[0]).toContain('toBitmap(e)');
    expect(mouseupMatch[0]).toContain('hitTest');
  });

  it('hover (mousemove) hit-test uses toBitmap-converted coordinates', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const mousemoveMatch = src.match(/canvas\.addEventListener\('mousemove'[\s\S]*?\}\);/);
    expect(mousemoveMatch).not.toBeNull();
    expect(mousemoveMatch[0]).toContain('toBitmap(e)');
  });

  it('wheel zoom uses toBitmap-converted coordinates', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const wheelMatch = src.match(/canvas\.addEventListener\('wheel'[\s\S]*?\}, \{ passive: false \}\);/);
    expect(wheelMatch).not.toBeNull();
    expect(wheelMatch[0]).toContain('toBitmap(e)');
  });

  it('mousedown stores drag start in bitmap coordinates', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const mousedownMatch = src.match(/canvas\.addEventListener\('mousedown'[\s\S]*?\}\);/);
    expect(mousedownMatch).not.toBeNull();
    expect(mousedownMatch[0]).toContain('toBitmap(e)');
  });
});

describe('session 87 audit fixes', () => {
  const MAP_PATH = resolve(__dirname, '../data/formula-procedure-map.js');
  const FRQ_PATH = resolve(__dirname, '../data/frq-decompositions.json');
  const CARTRIDGE_PATH = resolve(__dirname, '../data/ap-stats-cartridge.js');

  // Fix A — dropped wrong normalcdf mappings
  it('formula-procedure-map no longer contains zscore', () => {
    const src = readFileSync(MAP_PATH, 'utf8');
    expect(src).not.toContain('"zscore":');
  });

  it('formula-procedure-map no longer contains z-test-stat', () => {
    const src = readFileSync(MAP_PATH, 'utf8');
    expect(src).not.toContain('"z-test-stat":');
  });

  it('formula-procedure-map no longer contains empirical-rule', () => {
    const src = readFileSync(MAP_PATH, 'utf8');
    expect(src).not.toContain('"empirical-rule":');
  });

  it('formula-procedure-map now has exactly 35 entries', () => {
    const src = readFileSync(MAP_PATH, 'utf8');
    // Count lines that match the pattern  "key": "value",  inside the object
    const entries = src.match(/^\s+"[\w-]+":\s+"[\w-]+"/gm);
    expect(entries).not.toBeNull();
    expect(entries.length).toBe(35);
  });

  // Fix B — FRQ skill drift corrections
  it('u1-frq-tail-comparison no longer lists empirical-rule', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U1-PC-FRQ-Q02'].skills.find(s => s.id === 'u1-frq-tail-comparison');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).not.toContain('empirical-rule');
  });

  it('u4-frq-strategy-ev no longer lists lincomb-mean', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U4-PC-FRQ-Q02'].skills.find(s => s.id === 'u4-frq-strategy-ev');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).not.toContain('lincomb-mean');
  });

  it('u4-frq-break-even-p no longer lists lincomb-mean', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U4-PC-FRQ-Q02'].skills.find(s => s.id === 'u4-frq-break-even-p');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).not.toContain('lincomb-mean');
  });

  it('u5-frq-estimator-comparison has empty supportingFormulas', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U5-PC-FRQ-Q02'].skills.find(s => s.id === 'u5-frq-estimator-comparison');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).toEqual([]);
  });

  it('u6-frq-claim-check lists one-prop-ci', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U6-PC-FRQ-Q01'].skills.find(s => s.id === 'u6-frq-claim-check');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).toContain('one-prop-ci');
    expect(skill.supportingFormulas).not.toContain('ci-formula');
  });

  it('u9-frq-scatterplot has empty supportingFormulas', () => {
    const frq = JSON.parse(readFileSync(FRQ_PATH, 'utf8'));
    const skill = frq['U9-PC-FRQ-Q01'].skills.find(s => s.id === 'u9-frq-scatterplot');
    expect(skill).toBeDefined();
    expect(skill.supportingFormulas).toEqual([]);
  });

  // Fix C — cartridge wording corrections
  it('z-test-stat action is "Standardized z Statistic"', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    expect(src).toContain("action:'Standardized z Statistic'");
    expect(src).not.toContain("action:'Standardized Test Statistic'");
  });

  it('y-intercept explain is "Predicted y when x = 0"', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    expect(src).toContain("explain:'Predicted y when x = 0'");
    expect(src).not.toContain("explain:'Ensures the line passes through (x-bar, y-bar)'");
  });

  it('normal-condition explain mentions roughly normal for small n', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    const cardStart = src.indexOf("id:'normal-condition'");
    const nextCard = src.indexOf("{id:'", cardStart + 1);
    const cardSrc = src.slice(cardStart, nextCard);
    expect(cardSrc).toContain('roughly normal');
  });

  it('phat-mean subconcept mentions Large Counts condition', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    const cardStart = src.indexOf("id:'phat-mean'");
    const nextCard = src.indexOf("{id:'", cardStart + 1);
    const cardSrc = src.slice(cardStart, nextCard);
    expect(cardSrc).toContain('Large Counts condition');
  });

  it('margin-error subconcept no longer claims sigma known', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    const cardStart = src.indexOf("id:'margin-error'");
    const nextCard = src.indexOf("{id:'", cardStart + 1);
    const cardSrc = src.slice(cardStart, nextCard);
    expect(cardSrc).not.toContain('sigma known');
  });

  it('large-counts subconcept says unreliable not invalid', () => {
    const src = readFileSync(CARTRIDGE_PATH, 'utf8');
    const cardStart = src.indexOf("id:'large-counts'");
    // Find the start of the very next card to bound our slice tightly
    const nextCard = src.indexOf("{id:'", cardStart + 1);
    const cardSrc = src.slice(cardStart, nextCard);
    expect(cardSrc).toContain('unreliable');
    expect(cardSrc).not.toContain('invalid');
  });
});



describe('session 88b formula modal practice button + see-all removal', () => {
  it('showFormulaCardModal has a Practice this formula button', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('Practice this formula');
  });

  it('practice button is disabled when pickProbeForFormula returns null', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('practiceBtn.disabled = true');
    expect(src).toContain('No practice probe available for this formula yet');
  });

  it('practice button click calls pickProbeForFormula and setActiveProbe', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('pickProbeForFormula(formulaId, state)');
    expect(src).toContain('setActiveProbe(practicePick.unit, practicePick.questionId,');
  });

  it('practice button click closes the formula modal first', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // closeModal() must appear before setActiveProbe( within the practice click handler
    const handlerStart = src.indexOf("practiceBtn.addEventListener('click', function()");
    const handlerRegion = src.slice(handlerStart, handlerStart + 300);
    const closeModalIdx = handlerRegion.indexOf('closeModal()');
    const setActiveProbeIdx = handlerRegion.indexOf('setActiveProbe(');
    expect(closeModalIdx).toBeGreaterThan(-1);
    expect(setActiveProbeIdx).toBeGreaterThan(-1);
    expect(closeModalIdx).toBeLessThan(setActiveProbeIdx);
  });

  it("practice button uses 'manual' source for setActiveProbe", () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const handlerStart = src.indexOf("practiceBtn.addEventListener('click', function()");
    const handlerRegion = src.slice(handlerStart, handlerStart + 300);
    expect(handlerRegion).toContain("'manual'");
  });

  it('renderSeeAllDisclosure function is no longer defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('function renderSeeAllDisclosure');
  });

  it('no call sites of renderSeeAllDisclosure remain', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('renderSeeAllDisclosure()');
  });

  it('no sg-see-all CSS rules remain', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('.sg-see-all{');
    expect(src).not.toContain('.sg-see-all-');
  });

  it('renderMasteryMapPanel no longer queries for .sg-see-all', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain("querySelector('.sg-see-all')");
  });

  it('formula modal practice button has sg-formula-modal-practice class', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("make('button', 'sg-formula-modal-practice', 'Practice this formula')");
  });

  it('practice button CSS uses primary accent style', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-formula-modal-practice{');
    // Tango separates the accent FILL from the accent INK: --sg-accent (#A8330A) is
    // the readable text/link tone, --sg-accent-fill (#FF5B19) is for filled buttons,
    // and text on that fill is --sg-on-accent (#161616), never white.
    expect(src).toContain('background:var(--sg-accent-fill)');
    expect(src).toContain('color:var(--sg-on-accent)');
  });
});

describe('session 89b formula modal calculator visibility', () => {
  it('keeps the TI-84 section visible by default', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('calcDetails.open = true');
    expect(src).toContain('TI-84 calculator steps');
  });

  it('shows an explicit empty-state message when a formula has no TI-84 mapping', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('No TI-84 walkthrough is attached to this formula card yet.');
    expect(src).toContain("make('p', 'sg-formula-modal-calc-empty'");
  });
});

describe('session 90 student profiles + supabase backup', () => {
  it('adds username, password, and account controls to the student panel', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="studentUsername"');
    expect(src).toContain('<select id="studentUsername"');
    expect(src).toContain('id="studentPassword"');
    // session 89 A: Period + New Username fields dropped from main bar; modal has newStudentUsernameModal
    expect(src).toContain('id="newStudentUsernameModal"');
    expect(src).toContain('id="studentLoginBtn"');
    // session 89 A: Create button replaced with a link
    expect(src).toContain('id="studentCreateLink"');
    expect(src).toContain('id="syncStatus"');
    expect(src).not.toContain('id="studentName"');
    expect(src).not.toContain('id="studentDate"');
  });

  it('loads the optional study-guide sync config file', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/study-guide-sync-config.js');
  });

  it('persists studentUsername in the v6 state model', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("studentUsername:''");
    expect(src).toContain("next.studentUsername = typeof raw.studentUsername === 'string'");
    expect(src).not.toContain('studentName:\'\'');
    expect(src).not.toContain('studentDate:today()');
  });

  it('writes per-user local snapshots and can switch student profiles', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('PROFILE_INDEX_KEY');
    expect(src).toContain('USER_SNAPSHOT_PREFIX');
    expect(src).toContain('localStorage.setItem(userSnapshotKey(snapshot.studentUsername), JSON.stringify(snapshot))');
    expect(src).toContain('async function switchStudentProfile(');
  });

  it('fetches the shared username roster from lrsl-driller for the dropdown', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('DEFAULT_DRILLER_API_BASE');
    expect(src).toContain('https://lrsl-driller-production.up.railway.app');
    expect(src).toContain('/api/users');
    expect(src).toContain('async function fetchRosterProfiles(');
    expect(src).toContain('void fetchRosterProfiles()');
  });

  it('supports password verification and username creation against lrsl-driller', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('async function verifyStudentAccount()');
    expect(src).toContain('async function createStudentAccount()');
    expect(src).toContain('/api/users/verify');
    expect(src).toContain("body: JSON.stringify({ username: name, real_name: realName, password })");
    expect(src).toContain("ui.loginBtn.addEventListener('click'");
    // session 89 A: create account is now via modal; confirmCreateBtn wires the creation
    expect(src).toContain("confirmCreateBtn.addEventListener('click'");
  });

  it('exports username, period, and saved timestamp instead of name/date metadata', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('<strong>Username</strong>');
    expect(src).toContain('<strong>Saved</strong>');
    expect(src).not.toContain('<strong>Name</strong>');
    expect(src).not.toContain('<strong>Date</strong>');
  });

  it('contains Supabase backup and restore hooks', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.AP_STATS_STUDY_GUIDE_SUPABASE');
    expect(src).toContain('/rest/v1/');
    expect(src).toContain('study_guide_state_backups');
    expect(src).toContain('hydrateRemoteSnapshot');
    expect(src).toContain('isMissingStudyGuideBackupTable');
    expect(src).toContain('Run the setup SQL first.');
  });

  it('ships an opt-in sync config file and SQL schema', () => {
    expect(existsSync(SYNC_CONFIG_PATH)).toBe(true);
    expect(existsSync(SYNC_SQL_PATH)).toBe(true);
    expect(readFileSync(SYNC_CONFIG_PATH, 'utf8')).toContain('AP_STATS_STUDY_GUIDE_SUPABASE');
    expect(readFileSync(SYNC_CONFIG_PATH, 'utf8')).toContain('AP_STATS_STUDY_GUIDE_USER_SOURCE');
    expect(readFileSync(SYNC_CONFIG_PATH, 'utf8')).toContain('window.A2_CONFIG.STUDY_GUIDE_SYNC');
    expect(readFileSync(SYNC_SQL_PATH, 'utf8')).toContain('create table if not exists public.study_guide_state_backups');
    expect(readFileSync(SYNC_SQL_PATH, 'utf8')).not.toContain('student_name text');
  });
});

describe('session 91 local gate FRQ bank + official scoring prompt', () => {
  it('ships a local gate FRQ bank file', () => {
    expect(existsSync(FRQ_BANK_PATH)).toBe(true);
    const src = readFileSync(FRQ_BANK_PATH, 'utf8');
    expect(src).toContain('window.STUDY_GUIDE_FRQ_BANK');
  });

  it('local FRQ bank contains all 9 expected gate IDs', () => {
    const src = readFileSync(FRQ_BANK_PATH, 'utf8');
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', src)(win);
    const bank = win.STUDY_GUIDE_FRQ_BANK || {};
    for (const gateId of EXPECTED_GATE_IDS) {
      expect(bank[gateId], `gate record ${gateId} should exist`).toBeDefined();
    }
  });

  it('loads the local gate FRQ bank script into the worksheet', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('data/study-guide-frq-bank.js');
  });

  it('overlays local gate FRQs into the questions map during init', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function applyLocalGateFrqs()');
    expect(src).toContain('window.STUDY_GUIDE_FRQ_BANK');
    expect(src).toContain('Object.values(bank).forEach(question => {');
    expect(src).toContain('questions.set(question.id, question);');
  });

  it('passes the full local question record into the FRQ grading prompt builder', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.buildReflectionPromptSG(unit, question, answer)');
    expect(src).not.toContain('window.buildReflectionPromptSG(unit, promptText, answer)');
  });

  

  
});

describe('session 89 workstream C — FRQ decomposition integrity', () => {
  const DECOMP_JSON_PATH = resolve(__dirname, '../data/frq-decompositions.json');
  const rawDecomps = JSON.parse(readFileSync(DECOMP_JSON_PATH, 'utf8'));
  const allKeys = Object.keys(rawDecomps);

  it('all 9 FRQ keys are present in frq-decompositions.json', () => {
    const expected = [
      'U1-PC-FRQ-Q02',
      'U2-PC-FRQ-Q02',
      'U3-PC-FRQ-Q01',
      'U4-PC-FRQ-Q02',
      'U5-PC-FRQ-Q02',
      'U6-PC-FRQ-Q01',
      'U7-PC-FRQ-Q02',
      'U8-PC-FRQ-Q01',
      'U9-PC-FRQ-Q01'
    ];

    expect(allKeys.sort()).toEqual(expected.sort());
  });

  it('total skill count is exactly 31 — no accidental deletions', () => {
    let total = 0;

    for (const key of allKeys) {
      const { skills } = rawDecomps[key];

      if (Array.isArray(skills)) {
        total += skills.length;
      }
    }

    expect(total).toBe(31);
  });

  it('every skill has a non-empty whyItMatters string', () => {
    for (const key of allKeys) {
      const { skills } = rawDecomps[key];

      if (Array.isArray(skills)) {
        for (const skill of skills) {
          expect(typeof skill.whyItMatters).toBe('string');
          expect(
            skill.whyItMatters.trim().length,
            `${skill.id} whyItMatters should not be empty`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('updated u5-frq-estimator-comparison whyItMatters mentions numerical evidence', () => {
    const skills = rawDecomps['U5-PC-FRQ-Q02'].skills;
    const skill = skills.find(s => s.id === 'u5-frq-estimator-comparison');

    expect(skill).toBeDefined();
    expect(skill.whyItMatters).toContain('numerical evidence');
  });

  it('updated u9-frq-scatterplot whyItMatters mentions both components', () => {
    const skills = rawDecomps['U9-PC-FRQ-Q01'].skills;
    const skill = skills.find(s => s.id === 'u9-frq-scatterplot');

    expect(skill).toBeDefined();
    expect(skill.whyItMatters).toContain('constructing the scatterplot');
    expect(skill.whyItMatters).toContain('linear model');
  });
});

describe('session 89 workstream D — rubric surfacing in renderGrade', () => {
  it('renderGrade function accepts questionId as third argument', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function renderGrade(grade, effectiveScoreResult, questionId)');
  });

  it('renderGrade looks up STUDY_GUIDE_FRQ_BANK at render time', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.STUDY_GUIDE_FRQ_BANK ? window.STUDY_GUIDE_FRQ_BANK[questionId]');
  });

  it('renderGrade gates disclosures on non-paper score (Fix 2)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("if (grade && grade.score && grade.score !== 'paper')");
    // Old unconditional gate must not exist
    expect(src).not.toContain('if (grade && grade.score) {');
  });

  it('renderGrade paper gate: condition comment mentions non-paper AI grading', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('non-paper AI grading');
  });

  it('.sg-grade-rubric CSS class exists', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-grade-rubric');
  });

  it('.sg-grade-solution CSS class exists', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-grade-solution');
  });

  it('.sg-rubric-notes CSS class exists', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-rubric-notes');
  });

  it('.sg-solution-calcs CSS class exists', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-solution-calcs');
  });

  it('Official AP rubric details disclosure has correct summary text pattern', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('📋 Official AP rubric');
  });

  it('Worked solution details disclosure has correct summary text', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('💡 Worked solution');
  });

  it('graceful degradation: skips rubric disclosure if scoring.rubric is missing or empty', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('rubric.length > 0');
  });

  it('graceful degradation: skips solution disclosure if solution.parts is missing', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('parts.length > 0');
  });

  it('MathJax typesetPromise is called on solution body after append', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.MathJax.typesetPromise([solutionBody])');
  });

  it('call site passes questionId to renderGrade', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('renderGrade(data.frqGrade, effScore, questionId)');
  });
});

describe('session 91 phase 4 — FRQ solution-part chart rendering', () => {
  it('renderGrade solution branch reads part.attachments.chartType', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("part.attachments && typeof part.attachments.chartType === 'string'");
  });

  it('renderGrade solution branch uses chartCounter + getChartHtml', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('window.getChartHtml(part.attachments, canvasId)');
  });

  it('renderGrade solution branch defers chart rendering via toggle listener', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('pendingSolutionCharts');
    expect(src).toContain("solutionDetails.addEventListener('toggle'");
    expect(src).toContain('solutionChartsRendered');
  });

  it('renderGrade solution branch calls renderChartNow inside rAF', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toMatch(/requestAnimationFrame\(\(\) => \{\s*if \(window\.renderChartNow\) window\.renderChartNow\(attachments, canvasId\);/);
  });

  it('study-guide-frq-bank still has solution chart attachments for U2 part c and U9 part a', () => {
    const bankSrc = readFileSync(resolve(__dirname, '../data/study-guide-frq-bank.js'), 'utf8');
    // U2-PC-FRQ-Q02 part c: normal distribution
    expect(bankSrc).toMatch(/"partId":\s*"c"[\s\S]*?"chartType":\s*"normal"/);
    // U9-PC-FRQ-Q01 part a: scatter
    expect(bankSrc).toMatch(/"partId":\s*"a"[\s\S]*?"chartType":\s*"scatter"/);
  });
});

describe('session 91 — attachMedia plural charts array', () => {
  it('attachMedia detects hasCharts for attachments.charts plural form', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('const hasCharts = Array.isArray(attachments && attachments.charts) && attachments.charts.length > 0');
  });

  it('attachMedia early-return gate includes hasCharts', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('if (!hasTable && !hasImage && !hasChart && !hasCharts) return null');
  });

  it('attachMedia plural branch iterates attachments.charts and skips malformed entries', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('attachments.charts.forEach(chartData =>');
    expect(src).toContain("typeof chartData.chartType !== 'string'");
  });

  it('attachMedia plural branch wraps each chart in attachment-chart-container inside attachment-multi-chart', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain("multiWrap.className = 'attachment-multi-chart'");
    expect(src).toContain("chartWrap.className = 'attachment-chart-container'");
  });

  it('attachment-multi-chart CSS grid layout is defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.attachment-multi-chart{display:grid');
    expect(src).toContain('minmax(320px,1fr)');
  });
});

describe('session 89 workstream A — login bar UX', () => {
  it('student-info section does not contain studentPeriod or newStudentUsername ids', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).not.toContain('id="studentPeriod"');
    expect(src).not.toContain('id="newStudentUsername"');
  });

  it('student-info section contains studentCreateLink anchor (not a button)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('id="studentCreateLink"');
    // Should be an anchor, not a button
    expect(src).toContain('<a href="#" id="studentCreateLink"');
  });

  it('refreshAuthPanelVisibility function is defined in the HTML', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function refreshAuthPanelVisibility()');
  });

  it('createNewUsername flow is handled via createStudentAccount using modal input', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('newStudentUsernameModal');
    expect(src).toContain('async function createStudentAccount()');
  });

  it('.sg-create-user-modal CSS class exists', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('.sg-create-user-modal');
  });

  it('grid template columns updated to repeat(2,...) for student-info', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  });

  it('sign out button calls clearAuthSession', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('clearAuthSession()');
    expect(src).toContain('sg-signout-btn');
  });

  it('username change handler calls clearAuthSession when new username differs from verified username', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('usernameLookupKey(ui.username.value) !== authSession.username');
    expect(src).toContain('clearAuthSession()');
    expect(src).toContain('refreshAuthPanelVisibility()');
  });

  it('Fix 3: refreshSyncStatus is called inside refreshAuthPanelVisibility so sync status stays current on auth state changes', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The refreshAuthPanelVisibility body should contain a call to refreshSyncStatus.
    const fnStart = src.indexOf('function refreshAuthPanelVisibility()');
    const fnEnd = src.indexOf('\n      function ', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refreshSyncStatus()');
  });
});

describe('Fix 1 — wireAuthFormListeners rebind after sign-out', () => {
  it('wireAuthFormListeners function is defined', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    expect(src).toContain('function wireAuthFormListeners()');
  });

  it('wireAuthFormListeners is called from init (replaces inline wiring)', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // init() contains wireAuthFormListeners() call
    expect(src).toContain('wireAuthFormListeners()');
    // The init body should not contain the old inline wiring — all of that now lives in wireAuthFormListeners.
    // Extract init() body to check it specifically.
    const initStart = src.indexOf('function init()');
    const initEnd = src.indexOf('\n      function ', initStart + 1);
    const initBody = src.slice(initStart, initEnd);
    expect(initBody).toContain('wireAuthFormListeners()');
    // Confirm inline addEventListener calls are not duplicated inside init itself.
    expect(initBody).not.toContain("ui.password.addEventListener('keydown'");
    expect(initBody).not.toContain("ui.username.addEventListener('change'");
  });

  it('wireAuthFormListeners is called from restore branch of refreshAuthPanelVisibility', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    // The refreshAuthPanelVisibility body must contain wireAuthFormListeners()
    const fnStart = src.indexOf('function refreshAuthPanelVisibility()');
    const fnEnd = src.indexOf('\n      function ', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('wireAuthFormListeners()');
  });

  it('wireAuthFormListeners re-queries all 4 ui fields from the DOM', () => {
    const src = readFileSync(HTML_PATH, 'utf8');
    const fnStart = src.indexOf('function wireAuthFormListeners()');
    const fnEnd = src.indexOf('\n      function ', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("getElementById('studentUsername')");
    expect(fnBody).toContain("getElementById('studentPassword')");
    expect(fnBody).toContain("getElementById('studentLoginBtn')");
    expect(fnBody).toContain("getElementById('studentCreateLink')");
  });
});

describe('Fix 4 — frq-decompositions.js and .json parity', () => {
  const FRQ_JSON_PATH = resolve(__dirname, '../data/frq-decompositions.json');
  const FRQ_JS_PATH = resolve(__dirname, '../data/frq-decompositions.js');

  it('frq-decompositions.js and frq-decompositions.json have identical content', () => {
    // Parse the JSON file directly.
    const jsonSrc = readFileSync(FRQ_JSON_PATH, 'utf8');
    const parsedJson = JSON.parse(jsonSrc);

    // Extract window.FRQ_DECOMPOSITIONS from the JS wrapper using a synthetic window.
    const jsSrc = readFileSync(FRQ_JS_PATH, 'utf8');
    const fakeWindow = {};
    new Function('window', jsSrc)(fakeWindow);
    const parsedWrapper = fakeWindow.FRQ_DECOMPOSITIONS;

    // Deep equality: any drift between the two files will fail here.
    expect(parsedWrapper).toEqual(parsedJson);
  });
});
