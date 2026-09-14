# PERSISTENT_ANSWERS_BUILD.md — frozen contract (session 103)

> Goal: when a signed-in student opens any of the 69 live worksheets,
> all their previously-submitted fill-in-the-blank inputs (and AI-graded
> reflections) are auto-populated from the `item_ledger` server-side.
> Multi-device-safe. Read-only (no new writes; uses existing
> `gradebookClient.record` writes already wired by DN2a/b).
>
> Status: contract frozen 2026-05-20. Sonnet implements per §3 / §4 / §5.
> Codex reviews read-only. Planner reverifies on disk before commit.

## §1 — Why this works (the data is already there)

- `item_ledger` schema (`roster-server/migrations/0002_item_ledger.sql`):
  - `response jsonb` — stores the actual answer text (worksheet `value`
    string OR FRQ answer text); confirmed by `roster-server/ledger.js`
    line 53.
  - `unique (student_id, source, item_id, attempt)` — retries get a new
    `attempt`; most-recent attempt wins.
- All 69 worksheets already write via `gradebookClient.record(...)` per
  DN2b rollout. Source = `'worksheet'` for fill-ins, `'frq'` for
  reflections; `itemId` = `WS-{UNIT_ID}-Q{N}` for fill-ins, prefix +
  textareaId for reflections.
- An endpoint already exists (`GET /ledger/student/:studentId`) but is
  **teacher-secret-only**. Two minimal extensions unlock student
  self-fetch: (a) accept student token auth where token's student_id ==
  `:studentId`; (b) add `?prefix=` filter.

## §2 — Out of scope (explicit non-goals)

- No new writes / no schema migration / no Supabase touch.
- No changes to `gradebookClient.record` write path.
- No clobber of in-progress edits (fill-empty policy).
- No display of OTHER students' data (auth scope is self-only).
- No new persisted state on the client beyond a single localStorage TTL.
- No re-grading of restored reflections — display the prior grade, the
  existing appeal flow handles disagreements.
- Sacred `curriculum_render/data/curriculum.js` NEVER touched.

## §3 — Server contract (additive)

### Endpoint: `GET /ledger/student/:studentId`

**Extend the existing handler** in `roster-server/ledger.js` lines 75-93:

```
Path:    GET /ledger/student/:studentId
Query:   prefix    — string, optional. If present, server filters
                     rows where item_id starts with prefix.

Auth (EITHER):
  - Header  x-teacher-secret == process.env.ROSTER_TEACHER_SECRET, OR
  - Header  Authorization: Bearer <token> OR query ?token=<token>
            AND verifyToken(token) === :studentId

Responses:
  200 { ok:true, rows:[ item_ledger row ... ] }   // newest first by recorded_at
  401 { ok:false, error:'forbidden' }              // no valid auth
  403 { ok:false, error:'cross-student' }          // token's sid != :studentId
  500 { ok:false, error:'Database error' }
```

**Auth precedence:** teacher secret beats token; if neither valid → 401.
If teacher absent and token present but `verifyToken(token) !==
:studentId` → 403 (not 401 — clearer signal for cross-student attempts).

**Behavior changes vs current:**
- Add token-auth branch (currently teacher-only).
- Add `prefix` query-string filter — translate to a Supabase `.ilike`
  pattern: `prefix + '%'` on `item_id`. Strict prefix (no `%`/`_`
  wildcards permitted in the user input — sanitize by rejecting any
  non-`[A-Za-z0-9_\-]` chars with 400 to dodge wildcard-injection).
- Default sort already newest-first; keep that.

### DB-layer change: `roster-server/ledger-db.js`

Extend `getLedgerByStudent(studentId)` to accept an optional `prefix`:

```js
async function getLedgerByStudent(studentId, opts) {
  const prefix = opts && opts.prefix;
  let q = client.from('item_ledger').select('*').eq('student_id', studentId);
  if (prefix) q = q.like('item_id', prefix + '%');  // ESCAPED upstream
  return q.order('recorded_at', { ascending: false });
}
```

(`.like` not `.ilike` — item_ids are uppercase by convention; preserving
case-sensitivity avoids matching unintended prefixes.)

### Tests: extend `roster-server/tests/ledger.test.js`

Add cases that ALL pass with the existing fake-db harness:
- 401 with no auth.
- 200 with teacher secret (unchanged behavior).
- 200 with valid student token where token sid == :studentId.
- 403 with valid student token where token sid != :studentId.
- 200 with `?prefix=WS-U4L1-2` returns only matching rows.
- 400 with `?prefix=WS-U4L1-2%` (invalid char in prefix).
- Most-recent-first ordering preserved.

## §4 — Client contract (additive)

### `gradebook-client.js` — add `fetchPrior`

**Append** to `window.gradebookClient` (do NOT modify `record`):

```js
fetchPrior: async function (prefix) {
  try {
    if (!prefix || typeof prefix !== 'string') return new Map();
    if (!/^[A-Za-z0-9_\-]+$/.test(prefix)) return new Map();  // sanitize

    var token = (window.rosterClient && window.rosterClient.token
                 && window.rosterClient.token()) || null;
    var sid   = (window.rosterClient && window.rosterClient.studentId
                 && window.rosterClient.studentId()) || null;
    if (!token || !sid) return new Map();

    var baseUrl = window.ROSTER_SERVICE_URL || null;
    if (!baseUrl) return new Map();

    var url = baseUrl + '/ledger/student/' + encodeURIComponent(sid)
            + '?prefix=' + encodeURIComponent(prefix)
            + '&token=' + encodeURIComponent(token);

    var res = await fetch(url, { method: 'GET' });
    if (!res.ok) return new Map();
    var data = await res.json();
    if (!data || !data.ok || !Array.isArray(data.rows)) return new Map();

    // Dedupe: rows are newest-first; first occurrence per item_id wins.
    var out = new Map();
    for (var i = 0; i < data.rows.length; i++) {
      var r = data.rows[i];
      if (!r || !r.item_id || out.has(r.item_id)) continue;
      out.set(r.item_id, { response: r.response, score: r.score, source: r.source });
    }
    return out;
  } catch (_) { return new Map(); }
}
```

**Contract guarantees:**
- NEVER throws. NEVER rejects. Always resolves to a `Map` (possibly empty).
- No-ops without identity (just returns empty Map).
- No-ops without a sane prefix.
- Authenticates via token+sid; server enforces self-only.

### Tests: extend `tests/gradebook-client.test.js` (or new file)

- Returns empty Map when not signed in.
- Returns empty Map on network error / 401 / 403.
- Returns empty Map on bad prefix.
- Returns deduped Map on success.

## §5 — Worksheet hydration (the rollout)

### Per-worksheet hydration block

Insert AFTER the existing `recordBlankToGradebook` / `recordReflection*`
helpers (find them by string anchor — search for `gbWsPrefix()` to
locate the block) and BEFORE the aggregate drawer section. The block:

```js
// ==================== PRIOR-ANSWER HYDRATION ====================
// Fills empty .blank inputs + reflection textareas with this student's
// most-recent prior submissions, scoped to this worksheet's prefix.
// Fire-and-forget. Never clobbers in-progress edits. Marks restored
// inputs with a small badge so the student sees what was restored.
async function hydratePriorAnswers() {
    try {
        if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return;
        var prefix = gbWsPrefix();
        if (!prefix) return;
        var prior = await window.gradebookClient.fetchPrior(prefix);
        if (!prior || prior.size === 0) return;

        // Fill empty .blank inputs.
        document.querySelectorAll('.blank[data-question-id]').forEach(function (blank) {
            var itemId = blank.dataset.questionId;
            var entry = prior.get(itemId);
            if (!entry || entry.response === undefined || entry.response === null) return;
            if (blank.value && blank.value.trim()) return;  // never clobber
            var v = typeof entry.response === 'string'
                  ? entry.response
                  : String(entry.response);
            blank.value = v;
            blank.dataset.restored = '1';
            if (typeof checkAnswer === 'function') checkAnswer(blank);
            _markRestored(blank);
        });

        // Fill empty reflection textareas (source:'frq', itemId = prefix + '-' + textareaId).
        document.querySelectorAll('textarea[id]').forEach(function (ta) {
            var itemId = prefix + '-' + ta.id;
            var entry = prior.get(itemId);
            if (!entry || entry.response === undefined || entry.response === null) return;
            if (ta.value && ta.value.trim()) return;
            var v = typeof entry.response === 'string'
                  ? entry.response
                  : String(entry.response);
            ta.value = v;
            ta.dataset.restored = '1';
            _markRestored(ta);
        });
    } catch (_) { /* silent — never block the worksheet */ }
}

function _markRestored(el) {
    try {
        if (el.parentNode && !el.parentNode.querySelector('.restored-badge')) {
            var b = document.createElement('span');
            b.className = 'restored-badge';
            b.textContent = '↻ restored';
            b.title = 'Filled from your prior submission. Edit freely to overwrite.';
            b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                              'font-size:0.75em;background:#fff7d6;border:1px solid #d9b800;' +
                              'border-radius:4px;color:#7a5a00;';
            el.parentNode.insertBefore(b, el.nextSibling);
        }
    } catch (_) {}
}

// Hydration trigger: fire on DOMContentLoaded + on any roster-client signin event.
(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydratePriorAnswers);
    } else {
        setTimeout(hydratePriorAnswers, 0);
    }
    // Also fire on storage event so a different tab signin re-hydrates.
    try {
        window.addEventListener('storage', function (e) {
            if (e && e.key === 'apstats_roster.v1') hydratePriorAnswers();
        });
    } catch (_) {}
})();
```

**Idempotency:** the rollout script MUST be re-runnable. If the
`hydratePriorAnswers` function already exists in the file, skip the
insertion for that file. Detection: substring search for
`'function hydratePriorAnswers'`.

### Rollout script: `scripts/wire-hydration.mjs`

Follow the proven pattern in `scripts/dn2b-wire-feeders.mjs`:
- Read every `u*_lesson*_live.html` in repo root.
- Detect existing hydration block; skip if present (idempotent).
- Find insertion anchor: the line containing `recordReflectionToGradebook`
  function close (`function recordReflectionToGradebook` … last `}` on
  that function); insert the new block immediately after.
- Preserve original line endings (CRLF/LF) per file.
- Print per-file result: `OK | SKIP-already-wired | FAIL`.
- Exit 0 if all OK/SKIP; exit 1 if any FAIL.

### Hand-pilot first

Before the rollout, hand-edit ONE worksheet (`u4_lesson1-2_live.html`)
to validate the anchor + block render correctly. Run the test suite.
Then run the rollout for the other 68.

### Tests: `tests/worksheet-hydration.test.js` (NEW)

- For every `u*_lesson*_live.html`, assert:
  - `function hydratePriorAnswers` is present.
  - `function _markRestored` is present.
  - `addEventListener('DOMContentLoaded', hydratePriorAnswers)` OR the
    equivalent immediate-fire branch is present.
  - The block appears AFTER `recordReflectionToGradebook`.

## §6 — Acceptance (GREEN gate)

- roster-server: existing **280/280** + new ledger tests pass.
- root vitest: **1769/1770** (only known unrelated `study-guide.test.js`
  fail) + new `tests/worksheet-hydration.test.js` pass.
- `scripts/audit-feeder-ids.mjs` → CLEAN 69 / MISMATCH 0.
- EOL preserved per file (no CRLF/LF mixing).
- `git status` shows ONLY: `roster-server/ledger.js`,
  `roster-server/ledger-db.js`, `roster-server/tests/ledger.test.js`,
  `gradebook-client.js`, `tests/gradebook-client.test.js` (or new
  equivalent), `scripts/wire-hydration.mjs`,
  `tests/worksheet-hydration.test.js`, 69 × `u*_lesson*_live.html`,
  and this build doc.

## §7 — Sonnet sub-agent prompt template

```
Implement persistent-answer hydration per PERSISTENT_ANSWERS_BUILD.md
§3-§5. Sequence:

1. Extend roster-server/ledger.js GET /ledger/student/:studentId per
   §3. Auth = teacher secret OR student token (self-only).
   Add ?prefix= filter; sanitize input (reject non-[A-Za-z0-9_\-]
   chars with 400).
2. Extend roster-server/ledger-db.js getLedgerByStudent to accept an
   optional prefix.
3. Extend roster-server/tests/ledger.test.js with the 7 cases in §3.
4. Add gradebookClient.fetchPrior to gradebook-client.js per §4.
5. Add tests for fetchPrior to tests/gradebook-client.test.js
   (CREATE the file if it does not exist).
6. Hand-edit u4_lesson1-2_live.html: insert the §5 hydration block
   AFTER recordReflectionToGradebook.
7. Write scripts/wire-hydration.mjs per §5 (idempotent, EOL-safe,
   skips files with the block already present).
8. RUN node scripts/wire-hydration.mjs and verify it rolls the
   remaining 68 worksheets.
9. Write tests/worksheet-hydration.test.js per §5.
10. Run: cd roster-server && npx vitest run
        AND from repo root: npx vitest run
    Both must be green (only known unrelated study-guide.test.js fail).
11. Report: changed files, test counts, any non-trivial decisions.

CONSTRAINTS:
- Additive only. Do not modify the record() path in gradebook-client.js.
- Do not modify any existing test cases (you may ADD).
- Preserve line endings per file (some worksheets are CRLF).
- Do not touch curriculum_render/data/curriculum.js (SACRED).
- ASCII only in code where reasonable; UTF-8 OK for badges (↻).
- Do not commit. Just stage-able changes for planner review.
```
