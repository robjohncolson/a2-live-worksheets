(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ProbeSelector = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    function normalizeCount(value) {
      var safeCount = Number(value);

      if (!Number.isFinite(safeCount) || safeCount <= 0) {
        return 0;
      }

      return Math.floor(safeCount);
    }

    function normalizeSet(value) {
      if (value instanceof Set) {
        return value;
      }

      if (Array.isArray(value)) {
        return new Set(value);
      }

      return new Set();
    }

    function normalizeLoIds(primaryLoId, secondaryLoIds) {
      var loIds = [];
      var seen = Object.create(null);
      var rawIds = [primaryLoId].concat(Array.isArray(secondaryLoIds) ? secondaryLoIds : []);
      var i;

      for (i = 0; i < rawIds.length; i += 1) {
        var loId = rawIds[i];

        if (!loId || seen[loId]) {
          continue;
        }

        seen[loId] = true;
        loIds.push(loId);
      }

      return loIds;
    }

    function compareByLessonThenId(left, right) {
      if (left.lesson !== right.lesson) {
        return left.lesson - right.lesson;
      }

      if (left.question.id < right.question.id) {
        return -1;
      }

      if (left.question.id > right.question.id) {
        return 1;
      }

      return 0;
    }

    function buildCandidates(options) {
      var curriculum = Array.isArray(options.curriculum) ? options.curriculum : [];
      var tagQuestions = options.tagMap && options.tagMap.questions ? options.tagMap.questions : {};
      var answered = normalizeSet(options.alreadyAnswered);
      var masteryState = options.masteryState || {};
      var expectedInfoGain =
        options.BKT && typeof options.BKT.expectedInfoGain === 'function'
          ? options.BKT.expectedInfoGain
          : null;
      var unitPrefix = 'U' + String(options.unit) + '-L';
      var candidates = [];
      var i;

      for (i = 0; i < curriculum.length; i += 1) {
        var question = curriculum[i];

        if (!question || question.type !== 'multiple-choice' || typeof question.id !== 'string') {
          continue;
        }

        if (!question.id.startsWith(unitPrefix) || answered.has(question.id)) {
          continue;
        }

        var tag = tagQuestions[question.id];

        if (!tag || !tag.primaryLoId) {
          continue;
        }

        var loIds = normalizeLoIds(tag.primaryLoId, tag.secondaryLoIds);

        if (loIds.length === 0) {
          continue;
        }

        candidates.push({
          question: question,
          lesson: Number(tag.lesson) || 0,
          primaryLoId: tag.primaryLoId,
          loIds: loIds,
          infoGain: expectedInfoGain ? expectedInfoGain(masteryState, loIds) : 0
        });
      }

      return candidates;
    }

    function selectProbes(options) {
      var safeOptions = options || {};
      var targetCount = normalizeCount(
        Object.prototype.hasOwnProperty.call(safeOptions, 'count') ? safeOptions.count : 3
      );
      var remaining = buildCandidates(safeOptions);
      var picks = [];
      var coveredPrimaryLos = Object.create(null);

      while (picks.length < targetCount && remaining.length > 0) {
        var bestIndex = 0;
        var bestCandidate = null;
        var i;

        for (i = 0; i < remaining.length; i += 1) {
          var candidate = remaining[i];
          var coverageBonus = coveredPrimaryLos[candidate.primaryLoId] ? 0 : 0.3;
          var scoredCandidate = {
            question: candidate.question,
            lesson: candidate.lesson,
            primaryLoId: candidate.primaryLoId,
            loIds: candidate.loIds,
            infoGain: candidate.infoGain,
            coverageBonus: coverageBonus,
            score: candidate.infoGain + coverageBonus
          };

          if (!bestCandidate) {
            bestCandidate = scoredCandidate;
            bestIndex = i;
            continue;
          }

          if (scoredCandidate.score > bestCandidate.score) {
            bestCandidate = scoredCandidate;
            bestIndex = i;
            continue;
          }

          if (
            scoredCandidate.score === bestCandidate.score &&
            compareByLessonThenId(scoredCandidate, bestCandidate) < 0
          ) {
            bestCandidate = scoredCandidate;
            bestIndex = i;
          }
        }

        picks.push({
          question: bestCandidate.question,
          lesson: bestCandidate.lesson,
          loIds: bestCandidate.loIds.slice(),
          infoGain: bestCandidate.infoGain,
          coverageBonus: bestCandidate.coverageBonus,
          score: bestCandidate.score
        });

        coveredPrimaryLos[bestCandidate.primaryLoId] = true;
        remaining.splice(bestIndex, 1);
      }

      picks.sort(compareByLessonThenId);

      return picks;
    }

    return {
      selectProbes: selectProbes
    };
  }
);
