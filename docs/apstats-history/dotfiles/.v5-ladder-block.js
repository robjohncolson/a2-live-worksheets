// .v5-ladder-block.js - Pure logic for the v5 dose ladder + FRQ queue.
// Safe to paste inside study_guide_diagnostic.html's main IIFE; also runnable
// under Node via: new Function('window', src + '; return window.__studyGuideV5__;')({}).

(function(window) {
  'use strict';

  const LADDER = [
    { tier: 0, mcq: 5, frq: 1, label: 'Warmup', color: 'green' },
    { tier: 1, mcq: 7, frq: 1, label: 'Steady', color: 'yellow' },
    { tier: 2, mcq: 10, frq: 2, label: 'Catch-up', color: 'orange' },
    { tier: 3, mcq: 12, frq: 2, label: 'Crunch', color: 'red' }
  ];
  const STUDY_START_DATE = '2026-04-14';
  const TIER_CALENDAR_DAYS = [0, 8, 15, 21];
  const GATE_IDS_V5 = {
    1: 'U1-PC-FRQ-Q02',
    2: 'U2-PC-FRQ-Q02',
    3: 'U3-PC-FRQ-Q01',
    4: 'U4-PC-FRQ-Q02',
    5: 'U5-PC-FRQ-Q02',
    6: 'U6-PC-FRQ-Q01',
    7: 'U7-PC-FRQ-Q02',
    8: 'U8-PC-FRQ-Q01',
    9: 'U9-PC-FRQ-Q01'
  };
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DEBT_ROLL_MARKER = '__studyGuideV5DebtRolledDate';

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

  function clampTier(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Math.max(0, Math.min(3, Math.floor(numeric)));
  }

  function debtValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, value);
  }

  function getV4() {
    return window.__studyGuideV4__ || {};
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

  function ensureDoseLadder(state) {
    if (!state || typeof state !== 'object') {
      return null;
    }

    if (!state.doseLadder || typeof state.doseLadder !== 'object') {
      state.doseLadder = {
        tier: 0,
        mcqDebt: 0,
        frqDebt: 0
      };
    }

    state.doseLadder.tier = clampTier(state.doseLadder.tier);
    state.doseLadder.mcqDebt = debtValue(state.doseLadder.mcqDebt);
    state.doseLadder.frqDebt = debtValue(state.doseLadder.frqDebt);

    return state.doseLadder;
  }

  function getDebtRollMarker(doseLadder) {
    return doseLadder && doseLadder[DEBT_ROLL_MARKER];
  }

  function setDebtRollMarker(doseLadder, dateStr) {
    if (!doseLadder || typeof doseLadder !== 'object') {
      return;
    }

    try {
      Object.defineProperty(doseLadder, DEBT_ROLL_MARKER, {
        value: dateStr,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (error) {
      doseLadder[DEBT_ROLL_MARKER] = dateStr;
    }
  }

  function getCount(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function adjustDebt(currentDebt, expected, completed) {
    const short = Math.max(0, expected - completed);
    const over = Math.max(0, completed - expected);

    return Math.max(0, debtValue(currentDebt) + short - over);
  }

  function getQueueEntries(dailyDose, pool) {
    if (!dailyDose || !Array.isArray(dailyDose[pool])) {
      return [];
    }

    return dailyDose[pool];
  }

  function ensureCompletedEntries(dailyDose, pool) {
    const key = pool + 'Completed';

    if (!dailyDose || typeof dailyDose !== 'object') {
      return [];
    }

    if (!Array.isArray(dailyDose[key])) {
      dailyDose[key] = [];
    }

    return dailyDose[key];
  }

  function findPoolForQuestionId(dailyDose, questionId) {
    const pools = ['mcq', 'frq'];
    let poolIndex;
    let entries;
    let i;

    for (poolIndex = 0; poolIndex < pools.length; poolIndex += 1) {
      entries = getQueueEntries(dailyDose, pools[poolIndex]);

      for (i = 0; i < entries.length; i += 1) {
        if (entries[i] && entries[i].questionId === questionId) {
          return pools[poolIndex];
        }
      }
    }

    return null;
  }

  function findNextUncompleted(dailyDose, pool) {
    const entries = getQueueEntries(dailyDose, pool);
    const completed = ensureCompletedEntries(dailyDose, pool);
    let i;

    for (i = 0; i < entries.length; i += 1) {
      if (entries[i] && completed.indexOf(entries[i].questionId) === -1) {
        return entries[i];
      }
    }

    return null;
  }

  function daysSinceStudyStart(todayStr, startStr = STUDY_START_DATE) {
    const today = parseIsoDate(todayStr);
    const start = parseIsoDate(startStr);

    if (!today || !start) {
      return 1;
    }

    return Math.max(1, Math.ceil((today.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  }

  function calendarTier(todayStr, startStr = STUDY_START_DATE) {
    const dayOfStudy = daysSinceStudyStart(todayStr, startStr);
    let tier = 0;
    let i;

    for (i = 0; i < TIER_CALENDAR_DAYS.length; i += 1) {
      if (TIER_CALENDAR_DAYS[i] <= dayOfStudy) {
        tier = i;
      }
    }

    return tier;
  }

  function debtToTier(debt) {
    return clampTier(Math.min(3, debtValue(debt)));
  }

  function computeDoseTier(state, todayStr) {
    const doseLadder = state && state.doseLadder ? state.doseLadder : {};
    const tier = Math.max(
      calendarTier(todayStr),
      debtToTier(doseLadder.mcqDebt),
      debtToTier(doseLadder.frqDebt)
    );

    return clampTier(tier);
  }

  function tierSpec(tier) {
    return LADDER[clampTier(tier)] || LADDER[0];
  }

  function updateDebtFromPriorDose(state, todayStr) {
    const doseLadder = ensureDoseLadder(state);
    const dailyDose = state && state.dailyDose;

    if (!doseLadder || !dailyDose || typeof dailyDose !== 'object') {
      return;
    }

    if (dailyDose.date === todayStr) {
      return;
    }

    if (getDebtRollMarker(doseLadder) === dailyDose.date) {
      return;
    }

    doseLadder.mcqDebt = adjustDebt(
      doseLadder.mcqDebt,
      getCount(dailyDose.mcq),
      getCount(dailyDose.mcqCompleted)
    );
    doseLadder.frqDebt = adjustDebt(
      doseLadder.frqDebt,
      getCount(dailyDose.frq),
      getCount(dailyDose.frqCompleted)
    );

    setDebtRollMarker(doseLadder, dailyDose.date);
  }

  function unitMeanMastery(unitState) {
    const masteryState = unitState && unitState.masteryState && typeof unitState.masteryState === 'object'
      ? unitState.masteryState
      : null;
    const masteryIds = masteryState ? Object.keys(masteryState) : [];
    let sum = 0;
    let count = 0;
    let i;
    let value;

    for (i = 0; i < masteryIds.length; i += 1) {
      value = masteryState[masteryIds[i]];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }

    if (count === 0) {
      return 0.3;
    }

    return sum / count;
  }

  function pickDailyFrqs(state, n) {
    const limit = Math.max(0, Number(n) || 0);
    const candidates = [];
    let unit;
    let unitState;

    for (unit = 1; unit <= 9; unit += 1) {
      unitState = getUnitState(state, unit);

      if (unitState && unitState.frqGrade) {
        continue;
      }

      candidates.push({
        unit: unit,
        mastery: unitMeanMastery(unitState)
      });
    }

    candidates.sort(function(a, b) {
      if (a.mastery !== b.mastery) {
        return a.mastery - b.mastery;
      }

      return a.unit - b.unit;
    });

    return candidates.slice(0, limit).map(function(candidate) {
      return {
        kind: 'frq',
        unit: candidate.unit,
        questionId: GATE_IDS_V5[candidate.unit],
        formulaId: null
      };
    });
  }

  function buildMcqQueue(state, doseSize) {
    const v4 = getV4();
    const formulaMap = v4 && v4.FORMULA_UNIT_MAP && typeof v4.FORMULA_UNIT_MAP === 'object'
      ? v4.FORMULA_UNIT_MAP
      : {};
    const formulaWeight = v4 && typeof v4.formulaWeight === 'function'
      ? v4.formulaWeight
      : function() { return 0; };
    const pickProbeForFormula = v4 && typeof v4.pickProbeForFormula === 'function'
      ? v4.pickProbeForFormula
      : function() { return null; };
    const touchedFormulaCount = v4 && typeof v4.touchedFormulaCount === 'function'
      ? v4.touchedFormulaCount
      : function() { return 0; };
    const allFormulas = Object.keys(formulaMap);
    const touchedFormulas = state && state.touchedFormulas && typeof state.touchedFormulas === 'object'
      ? state.touchedFormulas
      : {};
    const touched = [];
    const untouched = [];
    const weights = {};
    const priorityLookup = {};
    const priority = [];
    const others = [];
    const queue = [];
    const limit = Math.max(0, Number(doseSize) || 0);
    const coreAndRegularTouched = touchedFormulaCount(state, 'core') + touchedFormulaCount(state, 'regular');
    let i;
    let formulaId;
    let formulaEntry;
    let probe;
    let sortedCandidates;

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      if (hasOwn(touchedFormulas, formulaId)) {
        touched.push(formulaId);
      } else {
        untouched.push(formulaId);
      }
    }

    for (i = 0; i < allFormulas.length; i += 1) {
      formulaId = allFormulas[i];
      weights[formulaId] = formulaWeight(formulaId, state);
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

    for (i = 0; i < sortedCandidates.length; i += 1) {
      if (queue.length >= limit) {
        break;
      }

      probe = pickProbeForFormula(sortedCandidates[i], state);

      if (probe) {
        queue.push({
          kind: 'mcq',
          formulaId: probe.formulaId,
          questionId: probe.questionId,
          unit: probe.unit,
          lesson: probe.lesson,
          tier: probe.tier
        });
      }
    }

    return queue;
  }

  function pickDailyQueueV5(state, todayStr, examDateStr) {
    const sourceState = state && typeof state === 'object' ? state : {};
    const existingDose = sourceState.dailyDose;

    updateDebtFromPriorDose(sourceState, todayStr);

    if (existingDose && existingDose.date === todayStr) {
      return existingDose;
    }

    const tier = computeDoseTier(sourceState, todayStr);
    const spec = tierSpec(tier);

    ensureDoseLadder(sourceState);
    sourceState.doseLadder.tier = tier;

    // v7 gating: filter candidates to unlocked units only.
    const v7 = (typeof window !== 'undefined' ? window : globalThis).__studyGuideV7__;
    const isUnlocked = v7 && typeof v7.isUnitUnlocked === 'function'
      ? v7.isUnitUnlocked
      : function() { return true; };

    const mcqRaw = buildMcqQueue(sourceState, spec.mcq);
    const frqRaw = pickDailyFrqs(sourceState, spec.frq);
    const mcq = mcqRaw.filter(function(entry) { return isUnlocked(entry.unit, sourceState); });
    const frq = frqRaw.filter(function(entry) { return isUnlocked(entry.unit, sourceState); });

    return {
      date: todayStr,
      tierAtGeneration: tier,
      mcq: mcq,
      mcqCompleted: [],
      frq: frq,
      frqCompleted: [],
      activeTab: 'mcq'
    };
  }

  function advanceDailyQueueV5(state, currentQuestionId) {
    const dailyDose = state && state.dailyDose;
    const foundPool = findPoolForQuestionId(dailyDose, currentQuestionId);
    const currentPool = foundPool || (dailyDose && dailyDose.activeTab === 'frq' ? 'frq' : 'mcq');
    const otherPool = currentPool === 'frq' ? 'mcq' : 'frq';
    let completed;
    let nextEntry;

    if (!dailyDose || typeof dailyDose !== 'object') {
      return null;
    }

    completed = ensureCompletedEntries(dailyDose, currentPool);

    if (foundPool && completed.indexOf(currentQuestionId) === -1) {
      completed.push(currentQuestionId);
    }

    nextEntry = findNextUncompleted(dailyDose, currentPool);
    if (nextEntry) {
      dailyDose.activeTab = currentPool;
      return nextEntry;
    }

    nextEntry = findNextUncompleted(dailyDose, otherPool);
    if (nextEntry) {
      dailyDose.activeTab = otherPool;
      return nextEntry;
    }

    return null;
  }

  function setActiveTab(state, tab) {
    if (!state || !state.dailyDose || typeof state.dailyDose !== 'object') {
      return;
    }

    state.dailyDose.activeTab = tab === 'frq' ? 'frq' : 'mcq';
  }

  const api = {
    LADDER: LADDER,
    STUDY_START_DATE: STUDY_START_DATE,
    TIER_CALENDAR_DAYS: TIER_CALENDAR_DAYS,
    GATE_IDS_V5: GATE_IDS_V5,
    daysSinceStudyStart: daysSinceStudyStart,
    calendarTier: calendarTier,
    debtToTier: debtToTier,
    computeDoseTier: computeDoseTier,
    tierSpec: tierSpec,
    updateDebtFromPriorDose: updateDebtFromPriorDose,
    unitMeanMastery: unitMeanMastery,
    pickDailyFrqs: pickDailyFrqs,
    pickDailyQueueV5: pickDailyQueueV5,
    advanceDailyQueueV5: advanceDailyQueueV5,
    setActiveTab: setActiveTab,
    daysLeft: function(todayStr, examDateStr) {
      const v4 = getV4();
      return v4 && typeof v4.daysLeft === 'function' ? v4.daysLeft(todayStr, examDateStr) : 1;
    },
    computeDailyDose: function(remaining, days) {
      const v4 = getV4();
      return v4 && typeof v4.computeDailyDose === 'function' ? v4.computeDailyDose(remaining, days) : 3;
    },
    formulaMastery: function(formulaId, state) {
      const v4 = getV4();
      return v4 && typeof v4.formulaMastery === 'function' ? v4.formulaMastery(formulaId, state) : 0.3;
    },
    formulaWeight: function(formulaId, state) {
      const v4 = getV4();
      return v4 && typeof v4.formulaWeight === 'function' ? v4.formulaWeight(formulaId, state) : 0;
    },
    formulaName: function(formulaId) {
      const v4 = getV4();
      return v4 && typeof v4.formulaName === 'function' ? v4.formulaName(formulaId) : formulaId;
    },
    touchedFormulaCount: function(state, tier) {
      const v4 = getV4();
      return v4 && typeof v4.touchedFormulaCount === 'function' ? v4.touchedFormulaCount(state, tier) : 0;
    },
    pickProbeForFormula: function(formulaId, state) {
      const v4 = getV4();
      return v4 && typeof v4.pickProbeForFormula === 'function' ? v4.pickProbeForFormula(formulaId, state) : null;
    },
    recordFormulaTouch: function(formulaId, correct, state) {
      const v4 = getV4();
      return v4 && typeof v4.recordFormulaTouch === 'function' ? v4.recordFormulaTouch(formulaId, correct, state) : 0.3;
    },
    recordFormulaHint: function(formulaId, state) {
      const v4 = getV4();
      return v4 && typeof v4.recordFormulaHint === 'function' ? v4.recordFormulaHint(formulaId, state) : null;
    },
    getFormulaEntry: function(formulaId) {
      const v4 = getV4();
      return v4 && typeof v4.getFormulaEntry === 'function' ? v4.getFormulaEntry(formulaId) : null;
    },
    queuedFormulasToday: function(state, todayStr) {
      const v4 = getV4();
      return v4 && typeof v4.queuedFormulasToday === 'function' ? v4.queuedFormulasToday(state, todayStr) : [];
    },
    daysBetween: function(fromIso, toIso) {
      const v4 = getV4();
      return v4 && typeof v4.daysBetween === 'function' ? v4.daysBetween(fromIso, toIso) : NaN;
    },
    reviewQueueEntries: function(state, todayIso, opts) {
      const v4 = getV4();
      return v4 && typeof v4.reviewQueueEntries === 'function' ? v4.reviewQueueEntries(state, todayIso, opts) : [];
    },
    graduateFormula: function(formulaId, state) {
      const v4 = getV4();
      return v4 && typeof v4.graduateFormula === 'function' ? v4.graduateFormula(formulaId, state) : null;
    },
    computeMapLayout: function(commands, formulaUnitMap) {
      const v4 = getV4();
      return v4 && typeof v4.computeMapLayout === 'function'
        ? v4.computeMapLayout(commands, formulaUnitMap)
        : { nodes: [], worldBounds: { x: 0, y: 0, width: 1000, height: 700 }, unitCenters: [] };
    },
    colorForMastery: function(mastery, touched) {
      const v4 = getV4();
      return v4 && typeof v4.colorForMastery === 'function'
        ? v4.colorForMastery(mastery, touched)
        : { fill: '#3a4060', stroke: '#4a5075', glow: null };
    }
  };

  Object.defineProperties(api, {
    FORMULA_UNIT_MAP: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && v4.FORMULA_UNIT_MAP ? v4.FORMULA_UNIT_MAP : {};
      }
    },
    UNIT_EXAM_WEIGHTS: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && v4.UNIT_EXAM_WEIGHTS ? v4.UNIT_EXAM_WEIGHTS : {};
      }
    },
    TIER_MULTIPLIERS: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && v4.TIER_MULTIPLIERS ? v4.TIER_MULTIPLIERS : {};
      }
    },
    MASTERY_THRESHOLD: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && v4.MASTERY_THRESHOLD ? v4.MASTERY_THRESHOLD : 0.75;
      }
    },
    BKT_INIT: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && typeof v4.BKT_INIT === 'number' ? v4.BKT_INIT : 0.3;
      }
    },
    AP_EXAM_DATE: {
      enumerable: true,
      get: function() {
        const v4 = getV4();
        return v4 && typeof v4.AP_EXAM_DATE === 'string' ? v4.AP_EXAM_DATE : '2026-05-07';
      }
    }
  });

  window.__studyGuideV5__ = api;
})(typeof window !== 'undefined' ? window : globalThis);
