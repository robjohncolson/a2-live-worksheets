(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FlashcardStore = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    var PASSPORT_FORMAT = 'apstats-flashcards';
    var STORE_VERSION = 1;
    var LOG_LIMIT = 2000;

    function hasOwn(value, key) {
      return Object.prototype.hasOwnProperty.call(value, key);
    }

    function isRecord(value) {
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function isFiniteNumber(value) {
      return typeof value === 'number' && Number.isFinite(value);
    }

    function copyValue(value) {
      var copy;
      var keys;
      var i;

      if (Array.isArray(value)) {
        copy = [];

        for (i = 0; i < value.length; i += 1) {
          copy.push(copyValue(value[i]));
        }

        return copy;
      }

      if (!isRecord(value)) {
        return value;
      }

      copy = {};
      keys = Object.keys(value);

      for (i = 0; i < keys.length; i += 1) {
        copy[keys[i]] = copyValue(value[keys[i]]);
      }

      return copy;
    }

    function freshState() {
      return {
        version: STORE_VERSION,
        cards: {},
        seen: [],
        tombstones: {},
        updatedAt: 0
      };
    }

    function countKeys(value) {
      if (!isRecord(value)) {
        return 0;
      }

      return Object.keys(value).length;
    }

    function mergeExtra(first, second) {
      var merged = {};
      var sources = [first, second];
      var source;
      var keys;
      var i;
      var j;

      for (i = 0; i < sources.length; i += 1) {
        source = sources[i];

        if (!isRecord(source)) {
          continue;
        }

        keys = Object.keys(source);

        for (j = 0; j < keys.length; j += 1) {
          merged[keys[j]] = copyValue(source[keys[j]]);
        }
      }

      if (Object.keys(merged).length === 0) {
        return null;
      }

      return merged;
    }

    function mergeSeen(first, second) {
      var merged = [];
      var sources = [first, second];
      var source;
      var i;
      var j;

      for (i = 0; i < sources.length; i += 1) {
        source = sources[i];

        if (!Array.isArray(source)) {
          continue;
        }

        for (j = 0; j < source.length; j += 1) {
          if (merged.indexOf(source[j]) !== -1) {
            continue;
          }

          merged.push(copyValue(source[j]));
        }
      }

      return merged;
    }

    function normalizeLogEntry(entry) {
      var normalized = {};
      var keys;
      var i;

      if (isRecord(entry)) {
        keys = Object.keys(entry);

        for (i = 0; i < keys.length; i += 1) {
          normalized[keys[i]] = copyValue(entry[keys[i]]);
        }
      }

      if (typeof normalized.mode === 'undefined') {
        normalized.mode = 'full';
      }

      if (typeof normalized.surface === 'undefined') {
        normalized.surface = 'desk';
      }

      if (typeof normalized.seq === 'undefined') {
        normalized.seq = 0;
      }

      if (typeof normalized.csv === 'undefined') {
        normalized.csv = null;
      }

      return normalized;
    }

    function isKnownCard(card) {
      if (!isRecord(card)) {
        return false;
      }

      if (!isFiniteNumber(card.ease) || !isFiniteNumber(card.intervalDays)) {
        return false;
      }

      if (!isFiniteNumber(card.dueDay) || !isFiniteNumber(card.reps)) {
        return false;
      }

      if (!isFiniteNumber(card.lapses) || !isFiniteNumber(card.lastTs)) {
        return false;
      }

      if (typeof card.lastGrade !== 'string') {
        return false;
      }

      if (
        typeof card.stemHash !== 'undefined' &&
        card.stemHash !== null &&
        typeof card.stemHash !== 'string'
      ) {
        return false;
      }

      return true;
    }

    function isKnownTombstone(tombstone) {
      return isRecord(tombstone) && isFiniteNumber(tombstone.removedAt);
    }

    function logIdentity(entry) {
      if (
        typeof entry.roundId !== 'undefined' &&
        entry.roundId !== null &&
        entry.roundId !== ''
      ) {
        return 'round:' + String(entry.roundId) + '#' + String(entry.seq);
      }

      return (
        'fallback:' +
        String(entry.ts) + '#' +
        String(entry.csv) + '#' +
        String(entry.qnum)
      );
    }

    function createStore(options) {
      var config = options || {};
      var storage = config.storage;
      var email = config.email;
      var now = config.now;
      var stateKey = 'a2_fc_state_v1_' + email;
      var logKey = 'a2_srs_log_' + email;
      var corrupt = false;

      function key() {
        return stateKey;
      }

      function migrate(raw) {
        var migrated = freshState();
        var extra = {};
        var knownKeys = {
          version: true,
          cards: true,
          seen: true,
          tombstones: true,
          updatedAt: true,
          extra: true
        };
        var keys;
        var i;

        if (!isRecord(raw)) {
          return migrated;
        }

        if (isRecord(raw.cards)) {
          migrated.cards = copyValue(raw.cards);
        }

        if (Array.isArray(raw.seen)) {
          migrated.seen = copyValue(raw.seen);
        }

        if (isRecord(raw.tombstones)) {
          migrated.tombstones = copyValue(raw.tombstones);
        }

        if (isFiniteNumber(raw.updatedAt)) {
          migrated.updatedAt = raw.updatedAt;
        }

        if (isRecord(raw.extra)) {
          extra = copyValue(raw.extra);
        } else if (hasOwn(raw, 'extra') && typeof raw.extra !== 'undefined') {
          extra.legacyExtra = copyValue(raw.extra);
        }

        keys = Object.keys(raw);

        for (i = 0; i < keys.length; i += 1) {
          if (knownKeys[keys[i]]) {
            continue;
          }

          extra[keys[i]] = copyValue(raw[keys[i]]);
        }

        if (Object.keys(extra).length > 0) {
          migrated.extra = extra;
        }

        return migrated;
      }

      function load() {
        var serialized = storage.getItem(stateKey);
        var parsed;

        if (serialized === null || typeof serialized === 'undefined') {
          return freshState();
        }

        try {
          parsed = JSON.parse(serialized);
        } catch (error) {
          corrupt = true;
          return freshState();
        }

        return migrate(parsed);
      }

      function save(state, opts) {
        var saveOptions = opts || {};
        var nextState;

        if (corrupt && !saveOptions.force) {
          return { ok: false, reason: 'corrupt-guard' };
        }

        nextState = migrate(state);
        nextState.updatedAt = now();
        storage.setItem(stateKey, JSON.stringify(nextState));
        corrupt = false;

        return { ok: true };
      }

      function tombstone(state, cardId) {
        var nextState = migrate(state);
        var card = nextState.cards[cardId];
        var previous = nextState.tombstones[cardId];
        var stemHash = null;

        if (isRecord(card) && typeof card.stemHash !== 'undefined') {
          stemHash = copyValue(card.stemHash);
        } else if (isRecord(previous) && typeof previous.stemHash !== 'undefined') {
          stemHash = copyValue(previous.stemHash);
        }

        delete nextState.cards[cardId];
        nextState.tombstones[cardId] = {
          removedAt: now(),
          stemHash: stemHash
        };

        return nextState;
      }

      function readSrsLog() {
        var serialized = storage.getItem(logKey);
        var parsed;
        var normalized = [];
        var i;

        if (serialized === null || typeof serialized === 'undefined') {
          return normalized;
        }

        try {
          parsed = JSON.parse(serialized);
        } catch (error) {
          return normalized;
        }

        if (!Array.isArray(parsed)) {
          return normalized;
        }

        for (i = 0; i < parsed.length; i += 1) {
          if (!isRecord(parsed[i])) {
            continue;
          }

          normalized.push(normalizeLogEntry(parsed[i]));
        }

        return normalized;
      }

      function exportPassport(state, log) {
        return {
          format: PASSPORT_FORMAT,
          version: STORE_VERSION,
          exportedAt: new Date(now()).toISOString(),
          email: email,
          payload: {
            state: copyValue(state),
            log: copyValue(log)
          }
        };
      }

      function parsePassport(json) {
        var passport = json;

        if (typeof json === 'string') {
          try {
            passport = JSON.parse(json);
          } catch (error) {
            return { ok: false, reason: 'invalid-json' };
          }
        }

        if (!isRecord(passport)) {
          return { ok: false, reason: 'invalid-passport' };
        }

        if (passport.format !== PASSPORT_FORMAT) {
          return { ok: false, reason: 'format-mismatch', passport: passport };
        }

        if (passport.version !== STORE_VERSION) {
          return { ok: false, reason: 'version-mismatch', passport: passport };
        }

        if (!isRecord(passport.payload)) {
          return { ok: false, reason: 'invalid-payload', passport: passport };
        }

        if (!isRecord(passport.payload.state) || !Array.isArray(passport.payload.log)) {
          return { ok: false, reason: 'invalid-payload', passport: passport };
        }

        return { ok: true, passport: passport };
      }

      function previewImport(json) {
        var parsed = parsePassport(json);
        var counts = {
          cards: 0,
          logEntries: 0,
          tombstones: 0
        };
        var passport;

        if (!parsed.ok) {
          return {
            ok: false,
            reason: parsed.reason,
            counts: counts,
            emailMatches: Boolean(parsed.passport && parsed.passport.email === email)
          };
        }

        passport = parsed.passport;
        counts.cards = countKeys(passport.payload.state.cards);
        counts.logEntries = passport.payload.log.length;
        counts.tombstones = countKeys(passport.payload.state.tombstones);

        return {
          ok: true,
          counts: counts,
          emailMatches: passport.email === email
        };
      }

      function mergeImportedCard(merged, cardId, card) {
        var currentCard = merged.cards[cardId];
        var currentTombstone = merged.tombstones[cardId];

        if (!isKnownCard(card)) {
          merged.tombstones[cardId] = {
            removedAt: now(),
            stemHash: isRecord(card) && typeof card.stemHash === 'string'
              ? card.stemHash
              : null
          };
          delete merged.cards[cardId];
          return true;
        }

        if (isKnownCard(currentCard) && currentCard.lastTs >= card.lastTs) {
          return false;
        }

        if (
          isKnownTombstone(currentTombstone) &&
          currentTombstone.removedAt >= card.lastTs
        ) {
          return false;
        }

        merged.cards[cardId] = copyValue(card);
        delete merged.tombstones[cardId];
        return true;
      }

      function mergeImportedTombstone(merged, cardId, imported) {
        var currentCard = merged.cards[cardId];
        var currentTombstone = merged.tombstones[cardId];

        if (!isKnownTombstone(imported)) {
          return false;
        }

        if (isKnownCard(currentCard) && currentCard.lastTs > imported.removedAt) {
          return false;
        }

        if (
          isKnownTombstone(currentTombstone) &&
          currentTombstone.removedAt >= imported.removedAt
        ) {
          return false;
        }

        merged.tombstones[cardId] = {
          removedAt: imported.removedAt,
          stemHash: typeof imported.stemHash === 'undefined'
            ? null
            : copyValue(imported.stemHash)
        };
        delete merged.cards[cardId];
        return true;
      }

      function mergeLogs(currentLog, importedLog) {
        var combined = [];
        var identities = Object.create(null);
        var added = 0;
        var skipped = 0;
        var entry;
        var identity;
        var i;

        for (i = 0; i < currentLog.length; i += 1) {
          entry = normalizeLogEntry(currentLog[i]);
          identity = logIdentity(entry);

          if (identities[identity]) {
            continue;
          }

          identities[identity] = true;
          combined.push(entry);
        }

        for (i = 0; i < importedLog.length; i += 1) {
          if (!isRecord(importedLog[i])) {
            skipped += 1;
            continue;
          }

          entry = normalizeLogEntry(importedLog[i]);
          identity = logIdentity(entry);

          if (identities[identity]) {
            skipped += 1;
            continue;
          }

          identities[identity] = true;
          combined.push(entry);
          added += 1;
        }

        if (combined.length > LOG_LIMIT) {
          combined = combined.slice(combined.length - LOG_LIMIT);
        }

        return {
          entries: combined,
          added: added,
          skipped: skipped
        };
      }

      function refusedImport(reason) {
        return {
          ok: false,
          reason: reason,
          added: 0,
          skipped: 0
        };
      }

      function importPassport(json, opts) {
        var importOptions = opts || {};
        var parsed = parsePassport(json);
        var passport;
        var incoming;
        var merged;
        var extra;
        var cardIds;
        var tombstoneIds;
        var logs;
        var saveResult;
        var added = 0;
        var skipped = 0;
        var i;

        if (!parsed.ok) {
          return refusedImport(parsed.reason);
        }

        passport = parsed.passport;

        if (passport.email !== email) {
          return refusedImport('email-mismatch');
        }

        incoming = migrate(passport.payload.state);
        merged = migrate(load());
        merged.seen = mergeSeen(merged.seen, incoming.seen);
        extra = mergeExtra(merged.extra, incoming.extra);

        if (extra) {
          merged.extra = extra;
        } else {
          delete merged.extra;
        }

        cardIds = Object.keys(incoming.cards);

        for (i = 0; i < cardIds.length; i += 1) {
          if (mergeImportedCard(merged, cardIds[i], incoming.cards[cardIds[i]])) {
            added += 1;
          } else {
            skipped += 1;
          }
        }

        tombstoneIds = Object.keys(incoming.tombstones);

        for (i = 0; i < tombstoneIds.length; i += 1) {
          if (
            mergeImportedTombstone(
              merged,
              tombstoneIds[i],
              incoming.tombstones[tombstoneIds[i]]
            )
          ) {
            added += 1;
          } else {
            skipped += 1;
          }
        }

        logs = mergeLogs(readSrsLog(), passport.payload.log);
        added += logs.added;
        skipped += logs.skipped;

        saveResult = save(merged, { force: importOptions.force === true });

        if (!saveResult.ok) {
          return refusedImport(saveResult.reason);
        }

        storage.setItem(logKey, JSON.stringify(logs.entries));

        return {
          ok: true,
          added: added,
          skipped: skipped
        };
      }

      return {
        key: key,
        load: load,
        save: save,
        migrate: migrate,
        tombstone: tombstone,
        readSrsLog: readSrsLog,
        exportPassport: exportPassport,
        previewImport: previewImport,
        importPassport: importPassport
      };
    }

    return {
      createStore: createStore
    };
  }
);
