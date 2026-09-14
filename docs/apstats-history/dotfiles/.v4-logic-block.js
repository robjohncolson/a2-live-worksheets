// .v4-logic-block.js - Pure logic for the v4 daily-queue picker.
// Safe to paste inside study_guide_diagnostic.html's main IIFE; also runnable
// under Node via: new Function('window', src + '; return window.__studyGuideV4__;')({}).

(function(window) {
  'use strict';

  // --- constants ---
  const AP_EXAM_DATE = '2026-05-07';
  const UNIT_EXAM_WEIGHTS = { 1: 0.19, 2: 0.135, 3: 0.06, 4: 0.15, 5: 0.095, 6: 0.135, 7: 0.14, 8: 0.035, 9: 0.035 };
  const TIER_MULTIPLIERS = { core: 4, regular: 3, power: 2, support: 1 };
  const MASTERY_THRESHOLD = 0.75;
  const BKT_INIT = 0.3;
  const DOSE_MIN = 3;
  const DOSE_MAX = 12;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const FORMULA_UNIT_MAP = {
    // U1 - descriptive (one variable)
    mean: 1, 'std-dev': 1, variance: 1, zscore: 1, iqr: 1, 'outlier-iqr': 1, 'empirical-rule': 1,
    // U2 - descriptive (regression)
    linreg: 2, 'linreg-mean': 2, 'corr-r': 2, 'slope-b': 2, residual: 2, 'r-squared': 2, 'y-intercept': 2, 'log-transform': 2,
    // U4 - probability + RVs
    'add-rule': 4, 'cond-prob': 4, complement: 4, 'mult-rule': 4, 'mult-independent': 4,
    'rv-mean': 4, 'rv-sd': 4, 'binom-pmf': 4, 'binom-mean': 4, 'binom-sd': 4,
    'geom-pmf': 4, 'geom-mean': 4, 'geom-sd': 4,
    'lincomb-mean': 4, 'lincomb-var': 4, lintransform: 4,
    // U5 - sampling distributions
    'phat-mean': 5, 'phat-sd': 5, 'xbar-mean': 5, 'xbar-sd': 5,
    'diff-p-sd': 5, 'diff-x-sd': 5, 'large-counts': 5,
    // U6 - inference for proportions + general inference
    'phat-se': 6, 'one-prop-z': 6, 'one-prop-ci': 6, 'two-prop-z': 6, 'two-prop-ci': 6,
    'diff-p-se': 6, 'pooled-se': 6,
    power: 6, 'margin-error': 6, 'width-ci': 6, 'type-i-error': 6, 'type-ii-error': 6,
    'random-condition': 6, 'normal-condition': 6, 'ten-pct-condition': 6, 'p-value-interp': 6,
    'z-test-stat': 6, 'ci-formula': 6,
    // U7 - inference for means
    'xbar-se': 7, 'one-mean-t': 7, 'one-mean-ci': 7, 'two-mean-t': 7, 'two-mean-ci': 7,
    'diff-x-se': 7, 'paired-t': 7, 'df-t': 7,
    // U8 - chi-square
    'chi-sq': 8, 'expected-twoway': 8, 'expected-gof': 8, 'df-gof': 8, 'df-twoway': 8,
    'chi-sq-select': 8, 'chi-sq-hyp': 8, 'chi-sq-conditions': 8, 'chi-sq-conclude': 8,
    'chi-sq-output': 8, 'std-resid-chi': 8,
    // U9 - inference for regression
    'slope-mean': 9, 'slope-sd': 9, 'slope-se': 9, 'resid-s': 9, 'slope-t': 9, 'slope-ci': 9
  };

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    let year;
    let month;
    let day;
    let date;

    if (!match) {
      return null;
    }

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    date = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function getCommands() {
    if (!window.AP_STATS_CARTRIDGE || !Array.isArray(window.AP_STATS_CARTRIDGE.commands)) {
      return [];
    }

    return window.AP_STATS_CARTRIDGE.commands;
  }

  function getFormulaEntry(formulaId) {
    const commands = getCommands();
    let i;

    for (i = 0; i < commands.length; i += 1) {
      if (commands[i] && commands[i].id === formulaId) {
        return commands[i];
      }
    }

    return null;
  }

  function getUnits(state) {
    if (!state || !state.units || typeof state.units !== 'object') {
      return {};
    }

    return state.units;
  }

  function getUnitState(state, unit) {
    const units = getUnits(state);

    if (hasOwn(units, unit)) {
      return units[unit];
    }

    if (hasOwn(units, String(unit))) {
      return units[String(unit)];
    }

    return null;
  }

  function hasQuestionResultInUnit(state, unit, questionId) {
    const unitState = getUnitState(state, unit);

    return !!(
      unitState &&
      unitState.mcqResults &&
      typeof unitState.mcqResults === 'object' &&
      hasOwn(unitState.mcqResults, questionId)
    );
  }

  function hasQuestionResultAnywhere(state, questionId) {
    const units = getUnits(state);
    const unitKeys = Object.keys(units);
    let i;
    let unitState;

    for (i = 0; i < unitKeys.length; i += 1) {
      unitState = units[unitKeys[i]];
      if (
        unitState &&
        unitState.mcqResults &&
        typeof unitState.mcqResults === 'object' &&
        hasOwn(unitState.mcqResults, questionId)
      ) {
        return true;
      }
    }

    return false;
  }

  function compareFormulaIds(a, b, weights) {
    const weightDiff = (weights[b] || 0) - (weights[a] || 0);

    if (weightDiff !== 0) {
      return weightDiff;
    }

    if (a < b) {
      return -1;
    }

    if (a > b) {
      return 1;
    }

    return 0;
  }

  function parseSupplementQuestionId(questionId) {
    const match = /^U(\d+)-L(\d+)-QS?\d+/.exec(questionId);

    if (!match) {
      return null;
    }

    return {
      unit: Number(match[1]),
      lesson: Number(match[2])
    };
  }

  function parseMainQuestionId(questionId) {
    const match = /^U(\d+)-L(\d+)-Q\d+/.exec(questionId);

    if (!match) {
      return null;
    }

    return {
      unit: Number(match[1]),
      lesson: Number(match[2])
    };
  }

  // --- pure helpers ---

  function daysLeft(todayStr, examDateStr) {
    const today = parseIsoDate(todayStr);
    const examDate = parseIsoDate(examDateStr);
    let diffDays;

    if (!today || !examDate) {
      return 1;
    }

    diffDays = Math.ceil((examDate.getTime() - today.getTime()) / MS_PER_DAY);

    if (diffDays <= 0) {
      return 1;
    }

    return Math.max(1, diffDays);
  }

  function computeDailyDose(remaining, days) {
    if (remaining <= 0 || days <= 0) {
      return DOSE_MIN;
    }

    return Math.min(DOSE_MAX, Math.max(DOSE_MIN, Math.ceil(remaining / days)));
  }

  function formulaMastery(formulaId, state) {
    if (
      state &&
      state.touchedFormulas &&
      state.touchedFormulas[formulaId] &&
      typeof state.touchedFormulas[formulaId].lastMastery === 'number'
    ) {
      return state.touchedFormulas[formulaId].lastMastery;
    }

    return BKT_INIT;
  }

  function formulaWeight(formulaId, state) {
    const unit = FORMULA_UNIT_MAP[formulaId];
    const formulaEntry = getFormulaEntry(formulaId);
    const examWeight = UNIT_EXAM_WEIGHTS[unit] || 0;
    const tierMult = formulaEntry ? (TIER_MULTIPLIERS[formulaEntry.tier] || 0) : 0;
    const mastery = formulaMastery(formulaId, state);
    const touchedEntry = state && state.touchedFormulas && state.touchedFormulas[formulaId];
    const hintedAt = touchedEntry && typeof touchedEntry.hintedAt === 'string' ? touchedEntry.hintedAt : null;
    let baseWeight;
    let hintBoost = 0;

    if (!unit || !formulaEntry) {
      return 0;
    }

    baseWeight = examWeight * tierMult * (1 - mastery);

    if (hintedAt) {
      const hintDate = parseIsoDate(hintedAt);
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayDate = parseIsoDate(todayStr);

      if (hintDate && todayDate) {
        const daysSince = Math.floor((todayDate.getTime() - hintDate.getTime()) / MS_PER_DAY);

        if (daysSince < 3) {
          hintBoost = 0.3 * (1 - daysSince / 3);
        }
      }
    }

    return baseWeight + hintBoost;
  }

  function formulaName(formulaId) {
    const formulaEntry = getFormulaEntry(formulaId);

    if (formulaEntry && typeof formulaEntry.action === 'string') {
      return formulaEntry.action;
    }

    return formulaId;
  }

  function touchedFormulaCount(state, tier) {
    const touchedFormulas = state && state.touchedFormulas ? state.touchedFormulas : null;
    let count = 0;
    let formulaIds;
    let i;
    let formulaEntry;

    if (!touchedFormulas || typeof touchedFormulas !== 'object') {
      return 0;
    }

    formulaIds = Object.keys(touchedFormulas);

    for (i = 0; i < formulaIds.length; i += 1) {
      formulaEntry = getFormulaEntry(formulaIds[i]);
      if (formulaEntry && formulaEntry.tier === tier) {
        count += 1;
      }
    }

    return count;
  }

  function pickProbeForFormula(formulaId, state) {
    const formulaEntry = getFormulaEntry(formulaId);
    const tier = formulaEntry ? formulaEntry.tier : null;
    const supplement = Array.isArray(window.EMBEDDED_CURRICULUM_SUPPLEMENT) ? window.EMBEDDED_CURRICULUM_SUPPLEMENT : [];
    const probeMap = window.FORMULA_PROBE_MAP && window.FORMULA_PROBE_MAP.map ? window.FORMULA_PROBE_MAP.map : {};
    let supplementCandidates = [];
    let supplementPick = null;
    let mainQuestionIds;
    let mainPick = null;
    let meta;
    let i;
    let entry;
    let questionId;

    for (i = 0; i < supplement.length; i += 1) {
      entry = supplement[i];
      if (entry && entry.formulaId === formulaId) {
        supplementCandidates.push(entry);
      }
    }

    if (supplementCandidates.length > 0) {
      supplementPick = supplementCandidates[0];

      for (i = 0; i < supplementCandidates.length; i += 1) {
        entry = supplementCandidates[i];
        meta = parseSupplementQuestionId(entry.id);

        if (!meta) {
          continue;
        }

        if (!hasQuestionResultInUnit(state, meta.unit, entry.id)) {
          supplementPick = entry;
          break;
        }
      }

      meta = parseSupplementQuestionId(supplementPick.id);
      if (!meta) {
        return null;
      }

      return {
        formulaId: formulaId,
        questionId: supplementPick.id,
        unit: meta.unit,
        lesson: meta.lesson,
        tier: tier
      };
    }

    if (!hasOwn(probeMap, formulaId) || !probeMap[formulaId] || !Array.isArray(probeMap[formulaId].questionIds) || probeMap[formulaId].questionIds.length === 0) {
      return null;
    }

    mainQuestionIds = probeMap[formulaId].questionIds;
    mainPick = mainQuestionIds[0];

    for (i = 0; i < mainQuestionIds.length; i += 1) {
      questionId = mainQuestionIds[i];
      if (!hasQuestionResultAnywhere(state, questionId)) {
        mainPick = questionId;
        break;
      }
    }

    meta = parseMainQuestionId(mainPick);
    if (!meta) {
      return null;
    }

    return {
      formulaId: formulaId,
      questionId: mainPick,
      unit: meta.unit,
      lesson: meta.lesson,
      tier: tier
    };
  }

  function pickDailyQueue(state, todayStr, examDateStr) {
    const sourceState = state || {};
    const existingDose = sourceState.dailyDose;
    const allFormulas = Object.keys(FORMULA_UNIT_MAP);
    const touchedFormulas = sourceState.touchedFormulas && typeof sourceState.touchedFormulas === 'object' ? sourceState.touchedFormulas : {};
    const touched = [];
    const untouched = [];
    const weights = {};
    const priorityLookup = {};
    const priority = [];
    const others = [];
    const queue = [];
    const days = daysLeft(todayStr, examDateStr);
    const coreAndRegularTouched = touchedFormulaCount(sourceState, 'core') + touchedFormulaCount(sourceState, 'regular');
    let dose;
    let remaining;
    let i;
    let formulaId;
    let formulaEntry;
    let probe;
    let sortedCandidates;

    if (existingDose && existingDose.date === todayStr) {
      return existingDose;
    }

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      if (hasOwn(touchedFormulas, formulaId)) {
        touched.push(formulaId);
      } else {
        untouched.push(formulaId);
      }
    }

    remaining = untouched.length || 81;

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      weights[formulaId] = formulaWeight(formulaId, sourceState);
    }

    if (coreAndRegularTouched < 32) {
      for (i = 0; i < untouched.length; i += 1) {
        formulaId = untouched[i];
        formulaEntry = getFormulaEntry(formulaId);
        if (formulaEntry && (formulaEntry.tier === 'core' || formulaEntry.tier === 'regular')) {
          priorityLookup[formulaId] = true;
        }
      }
    }

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      if (priorityLookup[formulaId]) {
        priority.push(formulaId);
      } else {
        others.push(formulaId);
      }
    }

    priority.sort(function(a, b) {
      return compareFormulaIds(a, b, weights);
    });

    others.sort(function(a, b) {
      return compareFormulaIds(a, b, weights);
    });

    sortedCandidates = priority.concat(others);
    dose = computeDailyDose(remaining, days);

    for (i = 0; i < sortedCandidates.length; i += 1) {
      if (queue.length >= dose) {
        break;
      }

      probe = pickProbeForFormula(sortedCandidates[i], sourceState);
      if (probe) {
        queue.push(probe);
      }
    }

    return {
      date: todayStr,
      queue: queue,
      completed: []
    };
  }

  function recordFormulaTouch(formulaId, correct, state) {
    const sourceState = state || {};
    const touchedFormulas = sourceState.touchedFormulas || {};
    const existingTouch = touchedFormulas[formulaId];
    const prior = existingTouch && typeof existingTouch.lastMastery === 'number' ? existingTouch.lastMastery : BKT_INIT;
    const next = window.BKT && window.BKT.updateMastery ? window.BKT.updateMastery(prior, correct) : prior;

    sourceState.touchedFormulas = touchedFormulas;
    sourceState.touchedFormulas[formulaId] = {
      firstTouchedAt: existingTouch ? existingTouch.firstTouchedAt : new Date().toISOString().slice(0, 10),
      lastMastery: next,
      hintedAt: existingTouch ? existingTouch.hintedAt : undefined
    };

    return next;
  }

  // Records that the student viewed a formula card as a hint.
  // Sets hintedAt to today's date but does NOT modify lastMastery.
  // This is a lighter-weight signal than recordFormulaTouch — it boosts
  // the formula's weight in the SRS queue without tanking BKT mastery.
  function recordFormulaHint(formulaId, state) {
    const sourceState = state || {};
    const touchedFormulas = sourceState.touchedFormulas || {};
    const existingTouch = touchedFormulas[formulaId];
    const todayStr = new Date().toISOString().slice(0, 10);

    sourceState.touchedFormulas = touchedFormulas;
    sourceState.touchedFormulas[formulaId] = {
      firstTouchedAt: existingTouch && existingTouch.firstTouchedAt ? existingTouch.firstTouchedAt : todayStr,
      lastMastery: existingTouch && typeof existingTouch.lastMastery === 'number' ? existingTouch.lastMastery : BKT_INIT,
      hintedAt: todayStr
    };

    return sourceState.touchedFormulas[formulaId];
  }

  function queuedFormulasToday(state, todayStr) {
    const touched = (state && state.touchedFormulas) || {};
    const result = [];
    for (const id in touched) {
      const entry = touched[id];
      if (entry && entry.hintedAt === todayStr) {
        result.push({ id: id, name: formulaName(id) });
      }
    }
    return result;
  }

  // Returns the signed integer number of days from fromIso to toIso.
  // Uses UTC midnight parsing to avoid timezone drift.
  // Returns NaN if either argument is falsy or cannot be parsed as YYYY-MM-DD.
  function daysBetween(fromIso, toIso) {
    if (!fromIso || !toIso) return NaN;
    const from = parseIsoDate(fromIso);
    const to = parseIsoDate(toIso);
    if (!from || !to) return NaN;
    return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  }

  // Returns an array of {id, name, hintedAt, daysSince} objects for formulas
  // in the review queue: hinted within maxDays (default 7), not graduated.
  // Sorted by hintedAt descending (most recent first); ties broken by id ascending.
  function reviewQueueEntries(state, todayIso, opts) {
    const maxDays = (opts && typeof opts.maxDays === 'number') ? opts.maxDays : 7;
    const touched = (state && state.touchedFormulas) || {};
    const result = [];

    for (const id in touched) {
      const entry = touched[id];

      // Skip graduated entries.
      if (entry && entry.graduated === true) continue;

      // Skip entries without a valid hintedAt date.
      if (!entry || typeof entry.hintedAt !== 'string') continue;

      const daysSince = daysBetween(entry.hintedAt, todayIso);

      // Skip NaN, negative (future), or beyond maxDays.
      if (Number.isNaN(daysSince) || daysSince < 0 || daysSince > maxDays) continue;

      result.push({
        id: id,
        name: formulaName(id),
        hintedAt: entry.hintedAt,
        daysSince: daysSince
      });
    }

    // Sort by hintedAt descending; ties broken by id alphabetically ascending.
    result.sort(function(a, b) {
      if (b.hintedAt > a.hintedAt) return 1;
      if (b.hintedAt < a.hintedAt) return -1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    return result;
  }

  // Sets graduated=true on an existing touchedFormulas entry.
  // No-op if the entry doesn't exist (does not create a new entry).
  // Returns the updated entry, or null if no-op.
  // NOTE: Graduation does NOT refund any FRQ penalty already applied.
  // data.frqHelpers.formulasViewed is a separate concern from the review queue.
  function graduateFormula(formulaId, state) {
    if (!state || !state.touchedFormulas || !state.touchedFormulas[formulaId]) {
      return null;
    }
    state.touchedFormulas[formulaId].graduated = true;
    return state.touchedFormulas[formulaId];
  }

  // --- mastery map layout (pure, deterministic) ---

  function computeMapLayout(commands, formulaUnitMap) {
    const CELL_W = 300;
    const CELL_H = 200;
    const GRID_ORIGIN_X = 50;
    const GRID_ORIGIN_Y = 50;
    const INNER_R = 30;
    const OUTER_R = 65;

    // Group commands by unit and ring.
    const byUnit = {};
    let u;
    for (u = 1; u <= 9; u += 1) {
      byUnit[u] = { core: [], outer: [] };
    }
    const unmapped = [];

    let i;
    let cmd;
    let unit;
    let ring;
    for (i = 0; i < commands.length; i += 1) {
      cmd = commands[i];
      unit = formulaUnitMap ? formulaUnitMap[cmd.id] : undefined;
      if (!unit) {
        unmapped.push(cmd);
        continue;
      }
      ring = cmd.tier === 'core' ? 'core' : 'outer';
      byUnit[unit][ring].push(cmd);
    }

    // Fallback: unmapped formulas go into unit 3 (which has no mapped formulas).
    for (i = 0; i < unmapped.length; i += 1) {
      byUnit[3].outer.push(unmapped[i]);
    }

    // Compute positions for each unit cluster.
    const nodes = [];
    const unitCenters = [];
    let row;
    let col;
    let cx;
    let cy;
    let coreList;
    let outerList;
    let angle;
    let node;

    for (u = 1; u <= 9; u += 1) {
      row = Math.floor((u - 1) / 3);
      col = (u - 1) % 3;
      cx = GRID_ORIGIN_X + col * CELL_W + CELL_W / 2;
      cy = GRID_ORIGIN_Y + row * CELL_H + CELL_H / 2;
      unitCenters.push({ unit: u, cx: cx, cy: cy });

      coreList = byUnit[u].core;
      outerList = byUnit[u].outer;

      coreList.forEach(function(c, idx) {
        angle = (idx / Math.max(1, coreList.length)) * Math.PI * 2 - Math.PI / 2;
        nodes.push({
          id: c.id,
          label: c.action || c.id,
          unit: u,
          ring: 'core',
          x: cx + Math.cos(angle) * INNER_R,
          y: cy + Math.sin(angle) * INNER_R,
          radius: 8
        });
      });

      outerList.forEach(function(c, idx) {
        angle = (idx / Math.max(1, outerList.length)) * Math.PI * 2 - Math.PI / 2;
        nodes.push({
          id: c.id,
          label: c.action || c.id,
          unit: u,
          ring: 'outer',
          x: cx + Math.cos(angle) * OUTER_R,
          y: cy + Math.sin(angle) * OUTER_R,
          radius: 7
        });
      });
    }

    return {
      nodes: nodes,
      worldBounds: { x: 0, y: 0, width: 1000, height: 700 },
      unitCenters: unitCenters
    };
  }

  // Maps a BKT mastery value (0.0–1.0) to HSL fill/stroke colors.
  // touched=false means "never seen" → grey-blue; touched=true uses hue gradient.
  function colorForMastery(mastery, touched) {
    if (!touched || typeof mastery !== 'number') {
      return { fill: '#3a4060', stroke: '#4a5075', glow: null };
    }
    const m = Math.max(0, Math.min(1, mastery));
    const hue = m * 120;
    const sat = 75;
    const light = 50;
    return {
      fill: 'hsl(' + hue + ', ' + sat + '%, ' + light + '%)',
      stroke: 'hsl(' + hue + ', ' + sat + '%, ' + (light + 15) + '%)',
      glow: m > 0.5 ? 'hsla(' + hue + ', ' + sat + '%, ' + light + '%, 0.4)' : null
    };
  }

  // --- diagnostic export for testing + integration ---
  window.__studyGuideV4__ = {
    AP_EXAM_DATE: AP_EXAM_DATE,
    UNIT_EXAM_WEIGHTS: UNIT_EXAM_WEIGHTS,
    TIER_MULTIPLIERS: TIER_MULTIPLIERS,
    MASTERY_THRESHOLD: MASTERY_THRESHOLD,
    BKT_INIT: BKT_INIT,
    DOSE_MIN: DOSE_MIN,
    DOSE_MAX: DOSE_MAX,
    FORMULA_UNIT_MAP: FORMULA_UNIT_MAP,
    daysLeft: daysLeft,
    computeDailyDose: computeDailyDose,
    formulaMastery: formulaMastery,
    formulaWeight: formulaWeight,
    formulaName: formulaName,
    getFormulaEntry: getFormulaEntry,
    touchedFormulaCount: touchedFormulaCount,
    pickProbeForFormula: pickProbeForFormula,
    pickDailyQueue: pickDailyQueue,
    recordFormulaTouch: recordFormulaTouch,
    recordFormulaHint: recordFormulaHint,
    queuedFormulasToday: queuedFormulasToday,
    daysBetween: daysBetween,
    reviewQueueEntries: reviewQueueEntries,
    graduateFormula: graduateFormula,
    computeMapLayout: computeMapLayout,
    colorForMastery: colorForMastery
  };
})(typeof window !== 'undefined' ? window : globalThis);
