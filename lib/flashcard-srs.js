(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FlashcardSrs = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    var EASY_MS = 12000;
    var MAX_INTERVAL_DAYS = 45;
    var EASE_START = 2500;
    var EASE_MIN = 1300;
    var EASE_MAX = 3000;
    var EASE_DELTA = {
      again: -320,
      hard: -140,
      good: 0,
      easy: 100
    };
    var DAY_MS = 86400000;
    var GRADES = {
      again: true,
      hard: true,
      good: true,
      easy: true
    };
    var MODES = {
      quick: true,
      full: true,
      review: true
    };

    function hasOwn(value, key) {
      return Object.prototype.hasOwnProperty.call(value, key);
    }

    function cardId(csv, qnum) {
      return String(csv) + '#' + String(qnum);
    }

    function normalizeStem(text) {
      return String(text == null ? '' : text)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    }

    function stemHash(text) {
      var normalized = normalizeStem(text);
      var hash = 5381;
      var i;

      for (i = 0; i < normalized.length; i += 1) {
        hash = (((hash << 5) + hash) + normalized.charCodeAt(i)) >>> 0;
      }

      return ('00000000' + hash.toString(16)).slice(-8);
    }

    function dayIndex(ts) {
      return Math.floor(ts / DAY_MS);
    }

    function isGrade(grade) {
      return typeof grade === 'string' && hasOwn(GRADES, grade);
    }

    function gradeOfOutcome(entry) {
      var outcome = entry || {};

      if (isGrade(outcome.review)) {
        return outcome.review;
      }

      if (outcome.wasTimeout || !outcome.correct) {
        return 'again';
      }

      if (outcome.missIndex > 0) {
        return 'hard';
      }

      if (outcome.latencyMs <= EASY_MS) {
        return 'easy';
      }

      return 'good';
    }

    function newCard(hash) {
      return {
        ease: EASE_START,
        intervalDays: 0,
        dueDay: 0,
        reps: 0,
        lapses: 0,
        lastGrade: null,
        lastTs: 0,
        stemHash: hash || null
      };
    }

    function copyCard(card) {
      var source = card || newCard();

      return {
        ease: typeof source.ease === 'number' ? source.ease : EASE_START,
        intervalDays: typeof source.intervalDays === 'number' ? source.intervalDays : 0,
        dueDay: typeof source.dueDay === 'number' ? source.dueDay : 0,
        reps: typeof source.reps === 'number' ? source.reps : 0,
        lapses: typeof source.lapses === 'number' ? source.lapses : 0,
        lastGrade: source.lastGrade == null ? null : source.lastGrade,
        lastTs: typeof source.lastTs === 'number' ? source.lastTs : 0,
        stemHash: source.stemHash
      };
    }

    function clampEase(ease) {
      return Math.max(EASE_MIN, Math.min(EASE_MAX, ease));
    }

    function goodInterval(card, ease) {
      if (card.reps === 0) {
        return 1;
      }

      if (card.reps === 1) {
        return 3;
      }

      return Math.round(card.intervalDays * ease / 1000);
    }

    function clampInterval(intervalDays) {
      return Math.max(1, Math.min(MAX_INTERVAL_DAYS, intervalDays));
    }

    function applyGrade(card, grade, todayDay, ts) {
      var next = copyCard(card);
      var resolvedGrade = isGrade(grade) ? grade : 'good';
      var intervalDays;
      var nextEase = clampEase(next.ease + EASE_DELTA[resolvedGrade]);

      next.ease = nextEase;
      next.lastGrade = resolvedGrade;
      next.lastTs = typeof ts === 'number' && ts > -Infinity && ts < Infinity
        ? ts
        : todayDay * DAY_MS;

      if (resolvedGrade === 'again') {
        next.intervalDays = 0;
        next.dueDay = todayDay;
        next.reps = 0;
        next.lapses += 1;
        return next;
      }

      if (resolvedGrade === 'hard') {
        intervalDays = Math.round(next.intervalDays * 1.2);
      } else {
        intervalDays = goodInterval(next, nextEase);

        if (resolvedGrade === 'easy') {
          intervalDays = Math.round(intervalDays * 1.3);
        }
      }

      next.intervalDays = clampInterval(intervalDays);
      next.dueDay = todayDay + next.intervalDays;
      next.reps += 1;

      return next;
    }

    function entryKey(entry) {
      var value = entry || {};

      if (value.roundId != null) {
        return String(value.roundId) + '#' + String(value.seq);
      }

      return (
        String(value.ts) + '#' +
        String(value.csv || value.topic) + '#' +
        String(value.qnum)
      );
    }

    function cloneCards(cards) {
      var copy = {};
      var source = cards || {};
      var ids = Object.keys(source);
      var i;

      for (i = 0; i < ids.length; i += 1) {
        copy[ids[i]] = copyCard(source[ids[i]]);
      }

      return copy;
    }

    function readSeen(seen) {
      var keys = [];
      var lookup = Object.create(null);

      function add(key) {
        var resolved = String(key);

        if (lookup[resolved]) {
          return;
        }

        lookup[resolved] = true;
        keys.push(resolved);
      }

      if (Array.isArray(seen)) {
        seen.forEach(add);
      } else if (seen && typeof seen.forEach === 'function') {
        seen.forEach(add);
      }

      return {
        keys: keys,
        lookup: lookup,
        add: add
      };
    }

    function normalizeEntry(entry) {
      var value = entry || {};

      return {
        topic: value.topic,
        qnum: value.qnum,
        correct: value.correct,
        latencyMs: value.latencyMs,
        wasTimeout: value.wasTimeout,
        missIndex: value.missIndex,
        ts: value.ts,
        mode: value.mode == null ? 'full' : value.mode,
        csv: value.csv == null ? value.topic : value.csv,
        surface: value.surface == null ? 'desk' : value.surface,
        roundId: value.roundId,
        seq: value.seq,
        review: value.review,
        stemHash: value.stemHash || null
      };
    }

    function entryNumber(value) {
      return typeof value === 'number' && value === value ? value : 0;
    }

    function compareEntries(left, right) {
      var tsDifference = entryNumber(left && left.ts) - entryNumber(right && right.ts);

      if (tsDifference !== 0) {
        return tsDifference;
      }

      return entryNumber(left && left.seq) - entryNumber(right && right.seq);
    }

    function foldLog(entries, opts) {
      var options = opts || {};
      var priorState = options.state || {};
      var cards = cloneCards(priorState.cards);
      var seen = readSeen(priorState.seen);
      var ordered = Array.isArray(entries) ? entries.slice().sort(compareEntries) : [];
      var i;

      for (i = 0; i < ordered.length; i += 1) {
        var rawEntry = ordered[i] || {};
        var key = entryKey(rawEntry);

        if (seen.lookup[key]) {
          continue;
        }

        seen.add(key);

        var entry = normalizeEntry(rawEntry);

        if (!hasOwn(MODES, entry.mode)) {
          continue;
        }

        // Legacy entries have no csv, so their topic is the card-id namespace.
        // A missing surface resolves to desk; scheduling is surface-independent.
        var id = cardId(entry.csv, entry.qnum);
        var card = hasOwn(cards, id) ? cards[id] : newCard(entry.stemHash);
        var todayDay = typeof entry.ts === 'number'
          ? dayIndex(entry.ts)
          : entryNumber(options.today);
        cards[id] = applyGrade(card, gradeOfOutcome(entry), todayDay, entry.ts);
      }

      return {
        cards: cards,
        seen: seen.keys
      };
    }

    function dueCards(state, todayDay, limit) {
      var cards = state && state.cards ? state.cards : {};
      var ids = Object.keys(cards).filter(function (id) {
        return cards[id] && cards[id].dueDay <= todayDay;
      });

      ids.sort(function (leftId, rightId) {
        var left = cards[leftId];
        var right = cards[rightId];

        if (left.dueDay !== right.dueDay) {
          return left.dueDay - right.dueDay;
        }

        if (left.lapses !== right.lapses) {
          return right.lapses - left.lapses;
        }

        if (leftId < rightId) {
          return -1;
        }

        if (leftId > rightId) {
          return 1;
        }

        return 0;
      });

      if (typeof limit !== 'number' || limit !== limit) {
        return ids;
      }

      return ids.slice(0, Math.max(0, Math.floor(limit)));
    }

    function summarize(state, todayDay) {
      var cards = state && state.cards ? state.cards : {};
      var ids = Object.keys(cards);
      var due = 0;
      var learned = 0;
      var i;

      for (i = 0; i < ids.length; i += 1) {
        var card = cards[ids[i]];

        if (card.dueDay <= todayDay) {
          due += 1;
        }

        if (card.reps >= 2 && card.dueDay > todayDay) {
          learned += 1;
        }
      }

      return {
        due: due,
        learned: learned,
        total: ids.length
      };
    }

    function masteryMode(entry) {
      if (!entry || entry.mode == null) {
        return 'full';
      }

      return entry.mode;
    }

    function masteryCsv(entry) {
      if (!entry) {
        return null;
      }

      if (entry.csv != null && String(entry.csv)) {
        return String(entry.csv);
      }

      if (entry.topic != null && String(entry.topic)) {
        return String(entry.topic);
      }

      return null;
    }

    function masteryPGuess(entries, explicitPGuess) {
      if (typeof explicitPGuess === 'number' && Number.isFinite(explicitPGuess)) {
        return explicitPGuess;
      }

      var allTwoChoice = entries.length > 0;
      var i;

      for (i = 0; i < entries.length; i += 1) {
        if (entries[i].nChoices !== 2) {
          allTwoChoice = false;
          break;
        }
      }

      return allTwoChoice ? 0.5 : 0.25;
    }

    function masteryParams(bkt, pGuess) {
      var defaults = bkt.DEFAULT_PARAMS || {};
      var params = {};
      var keys = Object.keys(defaults);
      var i;

      for (i = 0; i < keys.length; i += 1) {
        params[keys[i]] = defaults[keys[i]];
      }

      params.pGuess = pGuess;
      return params;
    }

    function foldMastery(entries, opts) {
      var options = opts || {};
      var bkt = options.bkt;
      var grouped = {};
      var arityEntriesByCsv = {};
      var byCsv = {};
      var ordered;
      var i;

      if (!bkt || typeof bkt.updateMastery !== 'function') {
        return { byCsv: byCsv };
      }

      ordered = Array.isArray(entries) ? entries.slice().sort(compareEntries) : [];

      for (i = 0; i < ordered.length; i += 1) {
        var entry = ordered[i] || {};
        var csv = masteryCsv(entry);
        var mode = masteryMode(entry);
        var missIndex = entry.missIndex == null ? 0 : entry.missIndex;

        if (csv) {
          if (!arityEntriesByCsv[csv]) {
            arityEntriesByCsv[csv] = [];
          }

          arityEntriesByCsv[csv].push(entry);
        }

        if (mode !== 'quick' && mode !== 'full') {
          continue;
        }

        if (missIndex !== 0) {
          continue;
        }

        if (!csv) {
          continue;
        }

        if (!grouped[csv]) {
          grouped[csv] = [];
        }

        grouped[csv].push(entry);
      }

      var csvNames = Object.keys(grouped);

      for (i = 0; i < csvNames.length; i += 1) {
        var csvName = csvNames[i];
        var evidence = grouped[csvName];
        var arityEntries = arityEntriesByCsv[csvName] || evidence;
        var pGuess = masteryPGuess(arityEntries, options.pGuess);
        var params = masteryParams(bkt, pGuess);
        var pMastery = typeof params.pInit === 'number' ? params.pInit : 0.3;
        var objectiveCorrects = 0;
        var spacedCorrect = false;
        var latestClean = false;
        var firstTs = null;
        var j;

        for (j = 0; j < evidence.length; j += 1) {
          var objectiveEntry = evidence[j];
          var correct = objectiveEntry.correct === true;
          var ts = objectiveEntry.ts;

          pMastery = bkt.updateMastery(pMastery, correct, params);

          if (correct) {
            objectiveCorrects += 1;
          }

          if (correct
              && firstTs !== null
              && typeof ts === 'number'
              && Number.isFinite(ts)
              && ts - firstTs >= DAY_MS) {
            spacedCorrect = true;
          }

          if (typeof ts === 'number'
              && Number.isFinite(ts)
              && (firstTs === null || ts < firstTs)) {
            firstTs = ts;
          }

          latestClean = correct;
        }

        byCsv[csvName] = {
          pMastery: pMastery,
          objectiveCorrects: objectiveCorrects,
          spacedCorrect: spacedCorrect,
          latestClean: latestClean,
          ready: objectiveCorrects >= 3 && spacedCorrect && latestClean,
          n: evidence.length
        };
      }

      return { byCsv: byCsv };
    }

    function readinessLabel(readiness) {
      if (readiness && readiness.ready) {
        return 'Ready';
      }

      if (readiness && readiness.objectiveCorrects > 0) {
        return 'Getting there';
      }

      return 'Not yet';
    }

    return {
      EASY_MS: EASY_MS,
      MAX_INTERVAL_DAYS: MAX_INTERVAL_DAYS,
      EASE_START: EASE_START,
      EASE_MIN: EASE_MIN,
      EASE_MAX: EASE_MAX,
      EASE_DELTA: EASE_DELTA,
      cardId: cardId,
      stemHash: stemHash,
      dayIndex: dayIndex,
      gradeOfOutcome: gradeOfOutcome,
      newCard: newCard,
      applyGrade: applyGrade,
      entryKey: entryKey,
      foldLog: foldLog,
      dueCards: dueCards,
      summarize: summarize,
      foldMastery: foldMastery,
      readinessLabel: readinessLabel
    };
  }
);
