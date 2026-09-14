(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FlashcardFlags = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    function isObject(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function parseFlagsJson(flagsJson) {
      var parsed = flagsJson;

      if (typeof flagsJson === 'string') {
        try {
          parsed = JSON.parse(flagsJson);
        } catch (error) {
          return null;
        }
      }

      if (!isObject(parsed) || !isObject(parsed.flags)) {
        return null;
      }

      return parsed;
    }

    function decodeQueryPart(value) {
      try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
      } catch (error) {
        return null;
      }
    }

    function searchOverride(search, urlParam) {
      var query;
      var hashIndex;
      var pairs;
      var i;

      if (typeof search !== 'string' || typeof urlParam !== 'string' || !urlParam) {
        return null;
      }

      query = search.charAt(0) === '?' ? search.slice(1) : search;
      hashIndex = query.indexOf('#');

      if (hashIndex !== -1) {
        query = query.slice(0, hashIndex);
      }

      if (!query) {
        return null;
      }

      pairs = query.split('&');

      for (i = 0; i < pairs.length; i += 1) {
        var separatorIndex = pairs[i].indexOf('=');
        var rawName = separatorIndex === -1 ? pairs[i] : pairs[i].slice(0, separatorIndex);
        var rawValue = separatorIndex === -1 ? '' : pairs[i].slice(separatorIndex + 1);
        var name = decodeQueryPart(rawName);
        var value = decodeQueryPart(rawValue);

        if (name !== urlParam) {
          continue;
        }

        if (value === '1') {
          return true;
        }

      }

      return null;
    }

    function hasAllowedValue(values, value) {
      if (!Array.isArray(values)) {
        return false;
      }

      return values.indexOf(value) !== -1;
    }

    function killSwitchIsOn(flag, storage) {
      if (!flag.killSwitchKey || !storage || typeof storage.getItem !== 'function') {
        return false;
      }

      try {
        return storage.getItem(flag.killSwitchKey) === '1';
      } catch (error) {
        return false;
      }
    }

    function resolveFlag(flagsJson, name, ctx) {
      var parsed = parseFlagsJson(flagsJson);
      var context = ctx || {};
      var flag;
      var override;

      if (!parsed || typeof name !== 'string') {
        return false;
      }

      if (!Object.prototype.hasOwnProperty.call(parsed.flags, name)) {
        return false;
      }

      flag = parsed.flags[name];

      if (!isObject(flag)) {
        return false;
      }

      if (killSwitchIsOn(flag, context.storage)) {
        return false;
      }

      override = searchOverride(context.search, flag.urlParam);

      if (override !== null) {
        return override;
      }

      if (hasAllowedValue(flag.allowUsernames, context.username)) {
        return true;
      }

      if (hasAllowedValue(flag.allowSections, context.section)) {
        return true;
      }

      return !!flag.enabled;
    }

    function resolveAll(flagsJson, ctx) {
      var parsed = parseFlagsJson(flagsJson);
      var resolved = {};
      var name;

      if (!parsed) {
        return resolved;
      }

      for (name in parsed.flags) {
        if (!Object.prototype.hasOwnProperty.call(parsed.flags, name)) {
          continue;
        }

        resolved[name] = resolveFlag(parsed, name, ctx);
      }

      return resolved;
    }

    function emptyFlags() {
      return { version: 0, flags: {} };
    }

    function loadFlags(fetchImpl, build) {
      var request;
      var url;

      try {
        if (typeof fetchImpl !== 'function') {
          return Promise.resolve(emptyFlags());
        }

        url = 'data/flashcard-flags.json?v=' + encodeURIComponent(build);
        request = fetchImpl(url, { cache: 'no-cache' });
      } catch (error) {
        return Promise.resolve(emptyFlags());
      }

      return Promise.resolve(request).then(function (response) {
        if (!response || response.ok === false || typeof response.json !== 'function') {
          throw new Error('Unable to load flashcard flags');
        }

        return response.json();
      }).then(function (parsed) {
        return parseFlagsJson(parsed) || emptyFlags();
      }, function () {
        return emptyFlags();
      });
    }

    return {
      resolveFlag: resolveFlag,
      resolveAll: resolveAll,
      loadFlags: loadFlags
    };
  }
);
