// secure-key.js — window.SecureKeyStore bridge to the native SecureKeyStore plugin.
// Classic <script>; loaded by teacher-app.html + the mobile launcher.
//
// Stores/returns an Ed25519 signing-key JWK, hardware-wrapped at rest. Ed25519 SIGNING
// stays in JS (receipt-sign.js); this only guards the key material. Always defined
// (even on the web) with an `available` flag, so callers can branch + degrade
// gracefully when there's no native plugin (web preview) instead of crashing.
//
// setKey/getKey take an optional opts { requireAuth, title, subtitle }:
//   - TEACHER key (default): requireAuth true → biometric/PIN gate on every use.
//   - STUDENT key (offline-grading mesh §2.5): requireAuth:false → SILENT, no prompt
//     (a student on a shared classroom device must not need the teacher's fingerprint;
//     the roster password is the auth). A label must be read with the SAME requireAuth
//     it was written with (separate master keys back the two classes).

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function nativePlugin() {
    var C = root.Capacitor;
    if (!C) return null;
    if (typeof C.isNativePlatform === 'function' && !C.isNativePlatform()) return null;
    return (C.Plugins && C.Plugins.SecureKeyStore) || null;
  }

  var p = nativePlugin();
  var NATIVE_ONLY = 'SecureKeyStore is only available in the Algebra 2 app';

  // Merge opts into the native call args (only when set, so a 2-arg teacher call
  // stays byte-identical → requireAuth defaults true on the native side).
  function withOpts(args, opts) {
    opts = opts || {};
    if (opts.requireAuth === false) args.requireAuth = false;
    if (opts.title) args.title = opts.title;
    if (opts.subtitle) args.subtitle = opts.subtitle;
    return args;
  }

  root.SecureKeyStore = {
    available: !!p,

    // Store a JWK string under `name`. Teacher key (default): biometric-gated.
    // Student key: pass { requireAuth: false } → silent.
    setKey: function (name, value, opts) {
      if (!p) return Promise.reject(new Error(NATIVE_ONLY));
      return Promise.resolve(p.setKey(withOpts({ key: name, value: value }, opts)));
    },

    // Return the stored JWK string (teacher: after a biometric unlock; student with
    // requireAuth:false: silently), or null if absent.
    getKey: function (name, opts) {
      if (!p) return Promise.reject(new Error(NATIVE_ONLY));
      return Promise.resolve(p.getKey(withOpts({ key: name }, opts))).then(function (r) { return (r && r.value) || null; });
    },

    hasKey: function (name) {
      if (!p) return Promise.resolve(false);
      return Promise.resolve(p.hasKey({ key: name })).then(function (r) { return !!(r && r.exists); });
    },

    removeKey: function (name) {
      if (!p) return Promise.resolve();
      return Promise.resolve(p.removeKey({ key: name }));
    },

    isBiometricAvailable: function () {
      if (!p) return Promise.resolve(false);
      return Promise.resolve(p.isBiometricAvailable()).then(function (r) { return !!(r && r.available); });
    }
  };

})();
