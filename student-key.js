/* student-key.js — the STUDENT's device signing key for the offline-grading mesh
 * (OFFLINE_GRADING_MESH_SPEC.md §0.2, §4). window.StudentKey.
 *
 * Each student device holds its own Ed25519 keypair; submissions (raw work) are
 * self-signed so the mesh can carry them without impersonation. The key NEVER
 * signs a grade — grades are the issuer trust set's job (domain separation §0.1).
 *
 * Storage: the private JWK is hardware-wrapped via SecureKeyStore in the SILENT
 * (non-biometric) key class (§2.5) — a student on a SHARED classroom device must not
 * need the teacher's fingerprint to sign in or do routine work; the roster password is
 * the auth, and the key just makes mesh submissions attributable. APK only; on the web
 * this module is inert (StudentKey.available() === false). Keys are labeled PER STUDENT
 * ('a2_student_signing_v2:<sid>') so a shared device gives each signed-in student
 * their own key. The pubkey is cached in plain localStorage (it's public).
 *
 * Registration (§0.2 — the impersonation gate): the pubkey is bound to the sid
 * server-side via POST /student-keys/register, authenticated by the caller's
 * OWN roster token — the server derives the sid from the token, never from a
 * client claim. Registration is once-per-device (idempotent to retry).
 *
 * Revocation (§0.3): if the server says the key is revoked, the stored key is
 * cleared (the NEXT ensure() generates + registers a fresh one) — a revoked key
 * never signs again, and never comes back server-side.
 */
(function (root) {
  'use strict';

  // v2: the silent (non-biometric) key class (§2.5). A fresh label version so the new
  // APK never tries to read a v1 auth-required key with the silent master (wrong master
  // → decrypt fails); v1 keys are simply left orphaned + a fresh v2 key is generated.
  var KEY_PREFIX = 'a2_student_signing_v2:';   // SecureKeyStore label, per sid
  var PUB_PREFIX = 'a2_student_pubkey_v2:';    // plain localStorage pubkey cache
  var REG_PREFIX = 'a2_student_key_reg_v2:';   // set to the pubkey once the server confirms
  // requireAuth:false → SILENT store/unlock (no biometric). title/subtitle are unused
  // when there's no prompt, but pass a student-correct copy for defense in depth.
  var STUDENT_OPTS = { requireAuth: false, title: 'Signing in', subtitle: 'Algebra 2 — your account key' };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

  function available() {
    return !!(root.SecureKeyStore && root.SecureKeyStore.available
      && root.ReceiptSign && typeof root.ReceiptSign.generateKey === 'function');
  }

  function identity(rosterClient) {
    var rc = rosterClient || root.rosterClient;
    var sid = null, token = null;
    try { sid = rc && typeof rc.studentId === 'function' ? rc.studentId() : null; } catch (_) {}
    try { token = rc && typeof rc.token === 'function' ? rc.token() : null; } catch (_) {}
    return { sid: sid, token: token };
  }

  // Get-or-generate this student's device key. Resolves { ok, pubkey, generated }
  // or { ok:false, reason }. Generating triggers ONE biometric/credential prompt
  // (the Keystore wrap); subsequent boots read only the cached pubkey.
  function ensureKey(sid) {
    if (!available()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    if (!sid) return Promise.resolve({ ok: false, reason: 'no-identity' });
    var label = KEY_PREFIX + sid;
    var cached = lsGet(PUB_PREFIX + sid);
    return root.SecureKeyStore.hasKey(label).then(function (has) {
      if (has && cached) return { ok: true, pubkey: cached, generated: false };
      if (has && !cached) {
        // Key exists but the pubkey cache was cleared — re-derive (silent, no prompt).
        return root.SecureKeyStore.getKey(label, STUDENT_OPTS).then(function (jwkStr) {
          return root.ReceiptSign.importPrivateKey(JSON.parse(jwkStr));
        }).then(function (priv) {
          return root.ReceiptSign.publicKeyXFromPrivate(priv);
        }).then(function (pk) {
          lsSet(PUB_PREFIX + sid, pk);
          return { ok: true, pubkey: pk, generated: false };
        });
      }
      return root.ReceiptSign.generateKey().then(function (k) {
        return root.SecureKeyStore.setKey(label, JSON.stringify(k.privateJwk), STUDENT_OPTS).then(function () {
          lsSet(PUB_PREFIX + sid, k.publicKeyX);
          return { ok: true, pubkey: k.publicKeyX, generated: true };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: 'keystore', detail: (e && e.message) || String(e) };
    });
  }

  // Register the pubkey with the roster (authenticated: sid comes from the TOKEN
  // server-side). Idempotent; safe to retry every boot until it sticks.
  function register(serverUrl, token, sid, pubkey) {
    if (!serverUrl || !token || !sid || !pubkey) return Promise.resolve({ ok: false, reason: 'no-identity' });
    if (lsGet(REG_PREFIX + sid) === pubkey) return Promise.resolve({ ok: true, already: true });
    return fetch(serverUrl + '/student-keys/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ pubkey: pubkey, label: 'device' })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (j) {
        if (res.ok && j && j.ok) { lsSet(REG_PREFIX + sid, pubkey); return { ok: true, existing: !!j.existing }; }
        if (res.status === 403 && j && /revoked/i.test(String(j.error || ''))) {
          // §0.3: this key is dead forever. Clear it so the next ensure() starts fresh.
          lsDel(PUB_PREFIX + sid);
          lsDel(REG_PREFIX + sid);
          return root.SecureKeyStore.removeKey(KEY_PREFIX + sid).then(
            function () { return { ok: false, reason: 'revoked' }; },
            function () { return { ok: false, reason: 'revoked' }; }
          );
        }
        return { ok: false, reason: (j && j.error) || ('http' + res.status), status: res.status };
      });
    }).catch(function () { return { ok: false, reason: 'network' }; });
  }

  // The boot entry point: get-or-generate + register-once. Fire-and-forget safe.
  function ensure(rosterClient, serverUrl) {
    var id = identity(rosterClient);
    if (!id.sid) return Promise.resolve({ ok: false, reason: 'no-identity' });
    return ensureKey(id.sid).then(function (k) {
      if (!k.ok) return k;
      return register(serverUrl, id.token, id.sid, k.pubkey).then(function (r) {
        return { ok: k.ok, pubkey: k.pubkey, generated: !!k.generated, registered: !!r.ok, registerReason: r.ok ? undefined : r.reason };
      });
    });
  }

  // Unlock the private key for signing (ONE biometric prompt; Phase 2's submission
  // signer holds the returned CryptoKey in memory, mirroring teacher-app).
  function unlock(sid) {
    if (!available()) return Promise.reject(new Error('unavailable'));
    if (!sid) return Promise.reject(new Error('no-identity'));
    return root.SecureKeyStore.getKey(KEY_PREFIX + sid, STUDENT_OPTS).then(function (jwkStr) {
      return root.ReceiptSign.importPrivateKey(JSON.parse(jwkStr));
    });
  }

  // Fetch the class trust set and feed it to ReceiptVerify.registerStudentKeys
  // (the submissions-lane verifier's key source). Any signed-in student may read it.
  function syncTrustSet(serverUrl, token) {
    if (!serverUrl || !token) return Promise.resolve({ ok: false, reason: 'no-identity' });
    if (!root.ReceiptVerify || typeof root.ReceiptVerify.registerStudentKeys !== 'function') {
      return Promise.resolve({ ok: false, reason: 'no-verifier' });
    }
    return fetch(serverUrl + '/student-keys', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !Array.isArray(j.keys)) return { ok: false, reason: 'bad-response' };
        var r = root.ReceiptVerify.registerStudentKeys(j.keys);
        return { ok: true, added: r.added, updated: r.updated, conflicts: r.conflicts, total: j.keys.length };
      })
      .catch(function () { return { ok: false, reason: 'network' }; });
  }

  function pubkeyFor(sid) { return sid ? lsGet(PUB_PREFIX + sid) : null; }

  root.StudentKey = {
    available: available,
    ensure: ensure,
    ensureKey: ensureKey,
    register: register,
    unlock: unlock,
    syncTrustSet: syncTrustSet,
    pubkeyFor: pubkeyFor,
    _KEY_PREFIX: KEY_PREFIX
  };
})(typeof window !== 'undefined' ? window : this);
