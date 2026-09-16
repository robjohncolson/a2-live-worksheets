// @vitest-environment node
// Generic regression assertions retained from the current suite. Synthetic FRQs
// exercise the runtime without assuming an AP bank or future A2 study-guide content.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const HTML_PATH = resolve(__dirname, '../study_guide_diagnostic.html');
const SYNC_CONFIG_PATH = resolve(__dirname, '../data/study-guide-sync-config.js');
const SYNC_SQL_PATH = resolve(__dirname, '../scripts/study-guide-state-backups.sql');

describe('study_guide_diagnostic.html — v3 structure', () => {
  it('exists on disk', () => {
    expect(existsSync(HTML_PATH)).toBe(true);
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

// Evaluate the actual inline helpers; indentation bounds each complete function.
// Keeping dependencies explicit avoids initializing the page's content or network.
function loadStudyHelpers(bank) {
  const html = readFileSync(HTML_PATH, 'utf8');
  const sandbox = createContext({ window: { STUDY_GUIDE_FRQ_BANK: bank }, questions: new Map() });
  for (const name of ['hasOwn', 'normalizeRawScore', 'getRawNumeric', 'getFrqDecomposition', 'computeEffectiveScore', 'applyLocalGateFrqs']) {
    const match = html.match(new RegExp('^( +)function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\1\\}', 'm'));
    if (!match) throw new Error('Missing inline study-guide helper: ' + name);
    runInContext(match[0], sandbox, { filename: pathToFileURL(HTML_PATH).href });
  }
  return sandbox;
}

describe('study-guide FRQ contracts with synthetic A2 questions', () => {
  it('overlays full valid records and ignores malformed bank entries', () => {
    const question = {
      id: 'a2-inline-functions-frq', type: 'free-response',
      prompt: 'Explain why a square function has a nonnegative range.',
      scoring: { rubric: ['Justify using the square of a real input.'] },
      solution: { parts: [{ partId: 'a', response: 'Every real square is nonnegative.' }] },
    };
    const runtime = loadStudyHelpers({ valid: question, empty: null, invalid: { id: 42 } });
    runtime.questions.set(question.id, { id: question.id, prompt: 'Old prompt' });
    runtime.questions.set('a2-unrelated', { id: 'a2-unrelated' });
    runtime.applyLocalGateFrqs();
    expect(runtime.questions.size).toBe(2);
    expect(runtime.questions.get(question.id)).toBe(question);
    expect(runtime.questions.has('a2-unrelated')).toBe(true);
  });

  it('tolerates an absent bank', () => {
    const runtime = loadStudyHelpers(undefined);
    expect(() => runtime.applyLocalGateFrqs()).not.toThrow();
    expect(runtime.questions.size).toBe(0);
  });

  it('looks up only own decomposition records', () => {
    const runtime = loadStudyHelpers({});
    const decomposition = { skills: [{ id: 'a2-range', whyItMatters: 'Explains possible outputs.' }] };
    runtime.window.FRQ_DECOMPOSITIONS = { 'a2-inline-functions-frq': decomposition };
    expect(runtime.getFrqDecomposition('a2-inline-functions-frq')).toBe(decomposition);
    expect(runtime.getFrqDecomposition('toString')).toBeNull();
    expect(runtime.getFrqDecomposition('missing')).toBeNull();
    expect(runtime.getFrqDecomposition(null)).toBeNull();
  });

  it('preserves raw grades while applying helper penalties', () => {
    const runtime = loadStudyHelpers({});
    expect(runtime.computeEffectiveScore('E', 0.25)).toMatchObject({ raw: 'E', rawNumeric: 1, effective: 0.75, penaltyPct: 25 });
    expect(runtime.computeEffectiveScore('P', 0)).toMatchObject({ raw: 'P', effective: 0.6 });
    expect(runtime.computeEffectiveScore('I', NaN)).toMatchObject({ raw: 'I', effective: 0.2, penaltyPct: 0 });
    expect(runtime.computeEffectiveScore('invalid', 0)).toMatchObject({ raw: 'I', effective: 0.2 });
  });

  it('keeps paper responses unscored', () => {
    const runtime = loadStudyHelpers({});
    expect(runtime.computeEffectiveScore('paper', 0.5)).toEqual({ raw: 'paper', rawNumeric: null, effective: null, penaltyPct: 0, breakdown: [] });
  });
});

describe('study-guide optional sync configuration', () => {
  it('defaults to local storage without bundled credentials', () => {
    const sandbox = createContext({ window: {} });
    runInContext(readFileSync(SYNC_CONFIG_PATH, 'utf8'), sandbox, { filename: pathToFileURL(SYNC_CONFIG_PATH).href });
    expect(sandbox.window.AP_STATS_STUDY_GUIDE_SUPABASE).toBeNull();
  });

  it('uses an explicitly supplied A2 sync configuration', () => {
    const config = { url: 'https://example.invalid', schema: 'a2' };
    const sandbox = createContext({ window: { A2_CONFIG: { STUDY_GUIDE_SYNC: config } } });
    runInContext(readFileSync(SYNC_CONFIG_PATH, 'utf8'), sandbox, { filename: pathToFileURL(SYNC_CONFIG_PATH).href });
    expect(sandbox.window.AP_STATS_STUDY_GUIDE_SUPABASE).toBe(config);
  });
});
