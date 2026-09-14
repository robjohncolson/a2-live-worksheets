(function(window) {
  'use strict';

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function createFrqHelpers() {
    return {
      formulasViewed: [],
      mcqDrills: {},
      confirmed: false,
      activeDrillQuestionId: null
    };
  }

  function ensureFrqHelpers(state, unit) {
    if (!state || !state.units || !state.units[unit] || typeof state.units[unit] !== 'object') {
      return null;
    }

    if (!state.units[unit].frqHelpers || typeof state.units[unit].frqHelpers !== 'object') {
      state.units[unit].frqHelpers = createFrqHelpers();
    }

    return state.units[unit].frqHelpers;
  }

  function normalizeRawScore(rawScore) {
    if (rawScore === 'E' || rawScore === 'P' || rawScore === 'I') {
      return rawScore;
    }

    return 'I';
  }

  function getRawNumeric(rawScore) {
    if (rawScore === 'E') {
      return 1.0;
    }

    if (rawScore === 'P') {
      return 0.6;
    }

    return 0.2;
  }

  function getFrqDecomposition(questionId) {
    if (!window || !window.FRQ_DECOMPOSITIONS) {
      return null;
    }

    if (typeof questionId !== 'string' || questionId.length === 0) {
      return null;
    }

    if (!hasOwn(window.FRQ_DECOMPOSITIONS, questionId)) {
      return null;
    }

    return window.FRQ_DECOMPOSITIONS[questionId];
  }

  function recordHelperUsed(unit, kind, payload, state) {
    const frqHelpers = ensureFrqHelpers(state, unit);

    if (!frqHelpers) {
      return;
    }

    if (typeof payload !== 'string' || payload.length === 0) {
      return;
    }

    if (kind === 'formula') {
      if (frqHelpers.formulasViewed.indexOf(payload) !== -1) {
        return;
      }

      frqHelpers.formulasViewed.push(payload);
      return;
    }

    if (kind !== 'mcq-correct' && kind !== 'mcq-wrong') {
      return;
    }

    if (hasOwn(frqHelpers.mcqDrills, payload)) {
      return;
    }

    frqHelpers.mcqDrills[payload] = kind === 'mcq-correct' ? 'correct' : 'wrong';
  }

  // Per-helper penalties (formula 0.05, correct drill 0.10, wrong drill 0.15). Global cap from decomposition.maxPenalty (0.50).
  function computeEffectivePenalty(frqHelpers, decomposition) {
    const skills = decomposition && Array.isArray(decomposition.skills) ? decomposition.skills : [];
    const formulasViewed = frqHelpers && Array.isArray(frqHelpers.formulasViewed)
      ? frqHelpers.formulasViewed
      : [];
    const mcqDrills = frqHelpers && frqHelpers.mcqDrills && typeof frqHelpers.mcqDrills === 'object'
      ? frqHelpers.mcqDrills
      : null;
    const supportingFormulaIds = new Set();
    const uniqueFormulasViewed = new Set(formulasViewed);
    let maxPenalty;
    let penalty = 0;
    let i;
    let j;
    let skill;
    let formulas;
    let questionIds;
    let status;

    if (!frqHelpers || !decomposition) {
      return 0;
    }

    for (i = 0; i < skills.length; i += 1) {
      skill = skills[i];
      formulas = skill && Array.isArray(skill.supportingFormulas) ? skill.supportingFormulas : [];

      for (j = 0; j < formulas.length; j += 1) {
        supportingFormulaIds.add(formulas[j]);
      }
    }

    uniqueFormulasViewed.forEach(function(formulaId) {
      if (supportingFormulaIds.has(formulaId)) {
        penalty += 0.05;
      }
    });

    if (mcqDrills) {
      questionIds = Object.keys(mcqDrills);

      for (i = 0; i < questionIds.length; i += 1) {
        status = mcqDrills[questionIds[i]];

        if (status === 'correct') {
          penalty += 0.10;
        } else if (status === 'wrong') {
          penalty += 0.15;
        }
      }
    }

    maxPenalty = Number.isFinite(decomposition.maxPenalty) ? decomposition.maxPenalty : 0.50;
    maxPenalty = Math.min(0.50, maxPenalty);

    return Math.max(0, Math.min(penalty, maxPenalty));
  }

  function computeEffectiveScore(rawScore, penalty) {
    const safePenalty = Number.isFinite(penalty) ? penalty : 0;
    const normalizedRaw = normalizeRawScore(rawScore);
    const rawNumeric = getRawNumeric(normalizedRaw);

    if (rawScore === 'paper') {
      return {
        raw: 'paper',
        rawNumeric: null,
        effective: null,
        penaltyPct: 0,
        breakdown: []
      };
    }

    return {
      raw: normalizedRaw,
      rawNumeric: rawNumeric,
      effective: Math.round(rawNumeric * (1 - safePenalty) * 100) / 100,
      penaltyPct: Math.round(safePenalty * 100),
      breakdown: []
    };
  }

  window.__studyGuideV6__ = {
    getFrqDecomposition: getFrqDecomposition,
    recordHelperUsed: recordHelperUsed,
    computeEffectivePenalty: computeEffectivePenalty,
    computeEffectiveScore: computeEffectiveScore
  };
})(typeof window !== 'undefined' ? window : globalThis);
