(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.BKT = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    var DEFAULT_PARAMS = {
      pInit: 0.3,
      pTransit: 0.0,
      pSlip: 0.1,
      pGuess: 0.25
    };

    function clampProbability(value) {
      if (!Number.isFinite(value)) {
        return 0;
      }

      if (value <= 0) {
        return 0;
      }

      if (value >= 1) {
        return 1;
      }

      return value;
    }

    function resolveParams(params) {
      return Object.assign({}, DEFAULT_PARAMS, params || {});
    }

    function readMastery(masteryState, loId, params) {
      if (!masteryState || !Object.prototype.hasOwnProperty.call(masteryState, loId)) {
        return clampProbability(params.pInit);
      }

      return clampProbability(masteryState[loId]);
    }

    function binaryEntropy(mastery) {
      var safeMastery = clampProbability(mastery);

      if (safeMastery === 0 || safeMastery === 1) {
        return 0;
      }

      return (
        (-safeMastery * Math.log2(safeMastery)) -
        ((1 - safeMastery) * Math.log2(1 - safeMastery))
      );
    }

    /**
     * Given correct observation:
     *   pGivenObs = prior * (1 - pSlip) / (prior * (1 - pSlip) + (1 - prior) * pGuess)
     * Given incorrect observation:
     *   pGivenObs = prior * pSlip / (prior * pSlip + (1 - prior) * (1 - pGuess))
     * Apply learning transition:
     *   posterior = pGivenObs + (1 - pGivenObs) * pTransit
     *
     * If the denominator collapses to 0, the prior is returned unchanged.
     */
    function updateMastery(prior, correct, params) {
      var resolved = resolveParams(params);
      var safePrior = clampProbability(prior);
      var numerator;
      var denominator;

      if (correct) {
        numerator = safePrior * (1 - resolved.pSlip);
        denominator = numerator + ((1 - safePrior) * resolved.pGuess);
      } else {
        numerator = safePrior * resolved.pSlip;
        denominator = numerator + ((1 - safePrior) * (1 - resolved.pGuess));
      }

      if (denominator === 0) {
        return safePrior;
      }

      var pGivenObs = numerator / denominator;
      var posterior = pGivenObs + ((1 - pGivenObs) * resolved.pTransit);

      return clampProbability(posterior);
    }

    function predictCorrect(mastery, params) {
      var resolved = resolveParams(params);
      var safeMastery = clampProbability(mastery);

      return (
        (safeMastery * (1 - resolved.pSlip)) +
        ((1 - safeMastery) * resolved.pGuess)
      );
    }

    function uncertainty(mastery) {
      return binaryEntropy(mastery);
    }

    function expectedInfoGain(masteryState, loIds, params) {
      var resolved = resolveParams(params);
      var uniqueLoIds = [];
      var seen = Object.create(null);
      var i;

      if (!Array.isArray(loIds) || loIds.length === 0) {
        return 0;
      }

      for (i = 0; i < loIds.length; i += 1) {
        var loId = loIds[i];

        if (!loId || seen[loId]) {
          continue;
        }

        seen[loId] = true;
        uniqueLoIds.push(loId);
      }

      if (uniqueLoIds.length === 0) {
        return 0;
      }

      var totalMastery = 0;

      for (i = 0; i < uniqueLoIds.length; i += 1) {
        totalMastery += readMastery(masteryState, uniqueLoIds[i], resolved);
      }

      var meanMastery = totalMastery / uniqueLoIds.length;
      var predictedCorrect = predictCorrect(meanMastery, resolved);
      var totalGain = 0;

      // Approximation: treat each LO as independent, but use the mean mastery
      // across the targeted LOs to estimate the shared observation likelihood.
      // That keeps the score simple and stable while still prioritizing probes
      // aimed at uncertain concepts over probes aimed at already-certain ones.
      for (i = 0; i < uniqueLoIds.length; i += 1) {
        var mastery = readMastery(masteryState, uniqueLoIds[i], resolved);
        var entropyBefore = binaryEntropy(mastery);
        var entropyAfterCorrect = binaryEntropy(updateMastery(mastery, true, resolved));
        var entropyAfterWrong = binaryEntropy(updateMastery(mastery, false, resolved));
        var expectedEntropyAfter =
          (predictedCorrect * entropyAfterCorrect) +
          ((1 - predictedCorrect) * entropyAfterWrong);

        totalGain += entropyBefore - expectedEntropyAfter;
      }

      return totalGain;
    }

    function initMasteryState(unitNodes, params) {
      var resolved = resolveParams(params);
      var masteryState = {};
      var i;
      var j;

      if (!Array.isArray(unitNodes)) {
        return masteryState;
      }

      for (i = 0; i < unitNodes.length; i += 1) {
        var node = unitNodes[i];

        if (!node || !Array.isArray(node.loIds)) {
          continue;
        }

        for (j = 0; j < node.loIds.length; j += 1) {
          var loId = node.loIds[j];

          if (!loId || Object.prototype.hasOwnProperty.call(masteryState, loId)) {
            continue;
          }

          masteryState[loId] = clampProbability(resolved.pInit);
        }
      }

      return masteryState;
    }

    return {
      DEFAULT_PARAMS: DEFAULT_PARAMS,
      updateMastery: updateMastery,
      predictCorrect: predictCorrect,
      expectedInfoGain: expectedInfoGain,
      uncertainty: uncertainty,
      initMasteryState: initMasteryState
    };
  }
);
