// rate-limit.js — tiny in-memory fixed-window per-key limiter.
//
// Single-instance only (one Railway dyno). State lives in a Map and resets on
// redeploy — acceptable for an abuse throttle (NOT an auth boundary).
//
// CLASSROOM NOTE: a whole class self-signs-up from behind ONE school NAT, so they
// share a public IP. The cap must be generous enough that the 30th student isn't
// blocked, while still stopping a runaway script. That is why the default cap is
// high (see server.js). Junk accounts are the teacher's to delete, not this gate's
// to prevent perfectly.

export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  // Returns true if this hit is ALLOWED, false if the key is over the cap.
  // `now` is injectable for deterministic tests.
  return function allow(key, now) {
    const t = typeof now === 'number' ? now : Date.now();
    let rec = hits.get(key);

    if (!rec || t >= rec.resetAt) {
      rec = { count: 0, resetAt: t + windowMs };
      hits.set(key, rec);
    }

    rec.count += 1;

    // Opportunistic prune so the Map can't grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (t >= v.resetAt) hits.delete(k);
      }
      // Hard backstop: if a key explosion (e.g. a deliberate flood) keeps the Map
      // huge even after pruning expired entries, reset everything. Under that load
      // it is already an attack, so resetting honest counters is acceptable.
      if (hits.size > 20000) hits.clear();
    }

    return rec.count <= max;
  };
}

// createLoginThrottle — per-key FAILED-attempt lockout for the login path.
//
// Unlike createRateLimiter (which counts every call), this counts only failures:
// the caller records a failure on a bad password/PIN and clears on success. After
// maxFailures within the window the key is locked until the window rolls. Keyed on
// the lowercased username so a 4-digit-PIN account can't be brute-forced (the
// 10k keyspace becomes maxFailures/window). `now` is injectable for tests.
//
// Trade-off: a griefer can lock a victim's username for the window by failing on
// purpose. Accepted for a low-stakes classroom (short window, generous threshold);
// the alternative (per-IP) is both NAT-shared and X-Forwarded-For-spoofable.
export function createLoginThrottle({ windowMs, maxFailures }) {
  const fails = new Map(); // key -> { count, resetAt }

  function record(key, t) {
    let rec = fails.get(key);
    if (!rec || t >= rec.resetAt) {
      rec = { count: 0, resetAt: t + windowMs };
      fails.set(key, rec);
    }
    return rec;
  }

  return {
    isLocked(key, now) {
      const t = typeof now === 'number' ? now : Date.now();
      const rec = fails.get(key);
      if (!rec || t >= rec.resetAt) return false;
      return rec.count >= maxFailures;
    },
    fail(key, now) {
      const t = typeof now === 'number' ? now : Date.now();
      const rec = record(key, t);
      rec.count += 1;
      if (fails.size > 5000) {
        for (const [k, v] of fails) if (t >= v.resetAt) fails.delete(k);
        // If a flood of distinct keys keeps the Map huge, evict NOT-yet-locked
        // noise (count below the lock threshold) FIRST — never clear() the whole
        // Map, which would reset a real account's active lockout (the security
        // boundary). Callers should also avoid keying this on un-validated input
        // (e.g. don't fail() for non-existent usernames).
        if (fails.size > 20000) {
          for (const [k, v] of fails) {
            if (v.count < maxFailures) { fails.delete(k); if (fails.size <= 10000) break; }
          }
        }
      }
    },
    succeed(key) {
      fails.delete(key);
    }
  };
}
