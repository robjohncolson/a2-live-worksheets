# Student Host Matrix & Quiz Packaging (W0)

**Status:** recon complete (evidence-backed)  
**Date:** 2026-07-09  
**Plan ref:** `student-facing-surface-implementation-plan.md` → W0  
**Smoke script:** `scripts/smoke-student-host-matrix.mjs`  
**Raw results (local, not committed):** re-run the script → `state/w0-host-matrix-results.json`  
**Constraint:** recon + docs only; Option B (old ids stable); G1 written from host responses only.

---

## 1. Origins (hardcoded from verified code constants)

The smoke script does **not** parse source files at runtime. Values in
`scripts/smoke-student-host-matrix.mjs` → `ORIGINS` are **hardcoded from verified
code constants** (re-check those files if URLs ever move):

| Constant | Verified source file | Live value |
|---|---|---|
| `WS_BASE` | `scripts/build-lessons-index.mjs` (`WS_BASE`) | `https://robjohncolson.github.io/apstats-live-worksheet/` |
| `CR_BASE` | `scripts/build-lessons-index.mjs` (`CR_BASE`) | `https://robjohncolson.github.io/curriculum_render/` |
| `ROSTER_SERVICE_URL` (prod) | `roster_config.js` production fallback | `https://roster-production-12c1.up.railway.app` |
| `RAILWAY_SERVER_URL` (AI grade proxy) | `railway_config.js` | `https://curriculumrender-production.up.railway.app` |
| Formula deck (Desk primary today) | Desk `APP_REGISTRY.formulas` | `https://tmux-trainer.vercel.app/#deck=ap-stats-formulas` |
| Formula Lab (exists; not primary) | Vercel path probe | `https://tmux-trainer.vercel.app/formula-lab.html` (**200**) — bare `/formula-lab` is **404** |
| TI-84 | Desk `APP_REGISTRY.ti84` | `https://robjohncolson.github.io/apstats-live-worksheet/ti84-trainer-v2/standalone.html` |
| Desk Apps quiz | Desk `APP_REGISTRY.quiz` | `https://robjohncolson.github.io/curriculum_render/` (absolute CR) |

### How lesson **1.2** quiz is wired (dual path — the H0 root cause)

| Surface | Data source | Quiz URL shape for 1.2 | Live behavior |
|---|---|---|---|
| **Desk** (registry / `roadmap-data.json`) | absolute | `https://robjohncolson.github.io/curriculum_render/?u=1&l=2` | **200**, renders "AP Stats Consensus Quiz" |
| **Mobile launcher** when `lessons-index.json` loads | relative | `quiz/index.html?u=1&l=2` → same-origin under WS_BASE | **404** on GH Pages |
| **Mobile launcher** fallback (`roadmap-data.json`) | absolute CR | same as Desk | would work — but live Pages **serves lessons-index 200**, so fallback is **not** used |
| **APK pack** (`android-app/www/quiz/`) | relative, bundled cr | `quiz/index.html?u=&l=` | **PRESENT** in local pack snapshot |

`build-lessons-index.mjs` intentionally rewrites `CR_BASE…` → `quiz/index.html?…` for offline/APK. That rewrite is correct for Capacitor; it is a **day-one dead-end on GH Pages** because `/quiz` is not published under `apstats-live-worksheet`.

---

## 2. Host matrix (core lesson 1.2)

Legend: **200** = HTTP ok · **404** = missing · **401** = expected auth gate · **PRESENT/MISSING** = APK filesystem snapshot (not a live store listing) · **render** = Playwright desktop+phone agreed unless noted.

### 2.1 Primary student content hosts

| Resource | GH Pages Desk host (`apstats-live-worksheet`) | GH Pages CR (`curriculum_render`) | Vercel (`tmux-trainer`) | Railway Roster | Railway CR AI | APK `android-app/www` (local pack) |
|---|---|---|---|---|---|---|
| **Desk HTML** | **200** + render | n/a | n/a | n/a | n/a | **PRESENT** |
| **Mobile HTML** | **200** + render | n/a | n/a | n/a | n/a | **PRESENT** |
| **Worksheet 1.2** | **200** + render (`u1_lesson2_live.html`) | n/a | n/a | n/a | n/a | **PRESENT** |
| **Quiz (relative `/quiz`)** | **404** + no render (H0) | n/a | n/a | n/a | n/a | **PRESENT** (`quiz/index.html`) |
| **Quiz (absolute CR)** | n/a | **200** + render | n/a | n/a | n/a | n/a (uses bundled relative) |
| **Video `/media/*`** | **140/140 404** (full lessons-index sweep) | n/a | n/a | n/a | n/a | sample 1.2 **MISSING** in current pack snapshot |
| **Flashcards CSV** `u1_l2_blooket.csv` | **200** | n/a | n/a | n/a | n/a | **MISSING** in current pack snapshot |
| **Flashcards engine** `flashcards.js` | **200** | n/a | n/a | n/a | n/a | **MISSING** in current pack snapshot |
| **Formula deck** (current primary) | n/a (iframe external) | n/a | **200** + render ("AP Stats Formula Defense") | n/a | n/a | external / network |
| **Formula Lab** | n/a | n/a | **200** at `/formula-lab.html`; `/formula-lab` **404** | n/a | n/a | external / network |
| **TI-84 standalone** | **200** + render | n/a | n/a | n/a | n/a | **PRESENT** |
| **`roadmap-data.json`** | **200** (quiz URLs absolute CR; `videos: []`) | n/a | n/a | n/a | n/a | via pack age |
| **`lessons-index.json`** | **200** (quiz relative; videos local paths) | n/a | n/a | n/a | n/a | **PRESENT** |
| **Do-Now / roster** | clients call Railway | n/a | n/a | **health 200**; `/donow` **401** unauth (expected) | n/a | needs network |
| **AI grade backend** | worksheets call Railway | n/a | n/a | n/a | **health 200** | needs network |
| **Blooket set (external)** | linked from registry | n/a | n/a | n/a | n/a | needs network (**200** on set URL) |

### 2.2 H0 nail (quiz)

| Probe URL | HTTP | Browser render |
|---|---|---|
| `…/apstats-live-worksheet/quiz/index.html?u=1&l=2` | **404** | false — "Page not found · GitHub Pages" (desktop + phone) |
| `…/apstats-live-worksheet/quiz/?u=1&l=2` | **404** | (HTTP only) |
| `…/curriculum_render/?u=1&l=2` | **200** | true — title **AP Stats Consensus Quiz** (desktop + phone) |
| `…/curriculum_render/index.html?u=1&l=2` | **200** | (HTTP only) |

**Status (post-fix):** **Fixed on web in `6ebf6c6`** (live-verified after GH Pages redeploy, 2026-07-09).

| Surface | Quiz 1.2 resolution after deploy |
|---|---|
| Live mobile-home on Pages | `href` → `https://robjohncolson.github.io/curriculum_render/?u=1&l=2` → **200** (playwright) |
| Desk registry (unchanged) | absolute CR → **200** |
| Pages relative `/quiz/**` | still **404** (unused by web mobile after fix) |
| APK | relative `quiz/` kept when `OFFLINE_MODE` is true or `'1'` |

**Original conclusion (pre-fix):** The day-one dead-end was real for any UI that used **relative** `quiz/index.html` on the Desk/Pages host (live **mobile-home** via `lessons-index.json`). The Desk tile/registry path that uses **absolute CR** already worked.

### 2.3 Video / media — full sweep (related H3; W7 keys off this)

Smoke script `runMediaSweep()` fetches **live** `lessons-index.json`, collects every
unique `media/*` path, and `HEAD`s each against `WS_BASE`.

| Probe | Result |
|---|---|
| Live `lessons-index` unique media paths | **140** |
| HEAD on GH Pages (`…/apstats-live-worksheet/<path>`) | **140/140 → 404** (`all404: true`) |
| Sample path 1.2 | `media/1-2__0__1cJ3a5DSlZ0w3vta901HVyADfQ-qKVQcD.mp4` → 404 |
| Live `roadmap-data` 1.2 `videos` | `[]` (empty — Desk bake has no media URLs) |
| APK pack `media/…` for 1.2 | **MISSING** in current `android-app/www` snapshot |

**Conclusion for W7:** Do **not** assume Pages hosts lesson mp4s. Rehydrate/merge strategies must point at a real media host (R2 / Drive / AP Classroom / pack on-demand), not `WS_BASE/media/…`. Re-run `node scripts/smoke-student-host-matrix.mjs --http-only` and read `media.total` / `media.all404` after any Pages media deploy.

### 2.4 Stale comment in `mobile-home.html` (crux of H0 on web)

Source comment near the lessons boot (~L1204) still claims:

> `lessons-index.json` is an APK BUILD ARTIFACT … and **isn't published to Pages**, so on a laptop it 404s. `roadmap-data.json` IS tracked/published…

**Reality (measured):** live Pages serves `lessons-index.json` **200**. Mobile-web therefore takes the **primary** path (relative `quiz/index.html?…`), not the roadmap fallback that would have carried absolute CR quiz URLs.

That stale assumption is exactly why mobile-web hit H0 while the Desk (absolute CR from registry) stayed fine. The H0 fix (context-aware quiz href rewrite) does not depend on deleting the fallback — it corrects quiz resolution when the index *does* load on web.

### 2.5 Browser smoke summary (playwright-core, 2026-07-09)

Desktop 1280×800 and phone 390×844 agreed:

| Page | status | renderOk |
|---|---|---|
| Desk | 200 | true |
| Mobile | 200 | true |
| Worksheet 1.2 | 200 | true |
| Quiz relative (Pages) | 404 | false |
| Quiz absolute (CR) | 200 | true |
| TI-84 | 200 | true |
| Formula deck | 200 | true (title: Formula Defense) |

---

## 3. G1 recommendation (from evidence)

### Locked recommendation

> **G1 = absolute `curriculum_render` origin for all web student quiz links.**  
> Canonical base: `https://robjohncolson.github.io/curriculum_render/`  
> Example lesson 1.2: `https://robjohncolson.github.io/curriculum_render/?u=1&l=2`

### Why (evidence only)

1. Pages `…/apstats-live-worksheet/quiz/**` → **404** (HTTP + browser).
2. CR origin → **200** and renders the quiz app.
3. Desk already uses absolute CR in `roadmap-data` + `APP_REGISTRY.quiz`.
4. Mobile web is the broken path: live `lessons-index.json` serves relative `quiz/index.html?…` and Pages serves that index, so the relative path is chosen and 404s.
5. One-origin Pages `/quiz` is **not** supported by current deploy evidence (would require publishing cr under the worksheet repo). Prefer fixing the **URL shape** over inventing a new monorepo deploy until someone intentionally ships option B.

### Fix options (for W9 / packaging work — not done in W0)

| Option | Action | Pros | Cons |
|---|---|---|---|
| **A — recommended** | Web path: keep absolute `CR_BASE` quiz URLs (Desk already; stop rewriting for web / dual-write lessons-index web vs APK). APK keeps relative `quiz/index.html` via offline pack builder. | Matches working Desk; smallest change; evidence-backed | Two URL shapes by host (document in pack builder) |
| **B — one-origin Pages** | Publish/copy cr into `apstats-live-worksheet/quiz/` on deploy | Relative paths work everywhere on Pages | Heavy; duplicate deploy; drift risk with CR repo |
| **C — APK-only quiz** | Accept web quiz broken | None for students on laptop/GH Pages | Rejects web as first-class |

**W0 does not implement A/B/C** — it only locks G1 from measurement. Implementation belongs to W9 (+ possibly a thin mobile-home / index-builder fix once product signs G1).

### Provisional notes

- Railway `curriculumrender-production` **health 200** is the **AI grading** backend, not the static quiz HTML host. Do not conflate with G1.
- Formula Lab URL that works is **`/formula-lab.html`**, not `/formula-lab`. Relevant to W2 (G3 already locked: Lab primary, Defense legacy).
- APK snapshot is the **repo pack tree**, not necessarily the last Play/sideload binary. Treat APK cells as packaging intent + current tree, re-verify after `build-offline-pack`.

---

## 4. What each host actually serves (cheat sheet)

| Host | Serves | Does not serve |
|---|---|---|
| **GH Pages `apstats-live-worksheet`** | Desk, mobile, worksheets, TI-84, flashcards JS/CSV, roadmap + lessons-index + work-manifest JSON | **`/quiz/**` (404)**, **`/media/**` 140/140 index paths 404** |
| **GH Pages `curriculum_render`** | Quiz HTML app (`?u=&l=`), static cr assets | Worksheets, Desk, media |
| **Vercel `tmux-trainer`** | Formula Defense deck, Formula Lab HTML | Course worksheets/quizzes |
| **Railway roster** | Auth, ledger, `/donow`, grades APIs | Static lesson HTML |
| **Railway CR AI** | AI grade / worksheet grade services (`/health` ok) | Static quiz HTML (not G1) |
| **APK `www` (current tree)** | Desk, mobile, worksheets, **bundled quiz/**, TI-84, lessons-index | Full media set + root blooket CSVs / flashcards.js **missing in this snapshot** (pack incomplete vs repo root) |
| **Blooket dashboard** | Hosted game sets | Offline |

---

## 5. APK / offline-pack rebuild timing

Rebuild the offline pack / Capacitor `www` when any of the following ship:

| Trigger | Why |
|---|---|
| Desk HTML or mobile-home student UX change | Pack embeds copies of these files |
| `data/work-manifest.json` / dual Do-Now deploy | Packaged next-task sequence must match live CED order |
| `roadmap-data.json` / `lessons-index.json` regenerate | Resource URLs + ced2026 labels |
| Quiz/cr packaging change (W9) | `www/quiz` is a full cr copy |
| Flashcards engine or blooket CSV bulk change | Current pack snapshot **lacks** root CSVs / `flashcards.js` — rebuild must **include** them if offline flashcards are in scope |
| TI-84 trainer standalone change | Embedded trainer iframe target |

**Suggested rule of thumb:** after any merge that touches student-facing HTML/JSON under follow-alongs that the pack copies, run `scripts/build-offline-pack.mjs` (or the project’s pack pipeline) before cutting an APK. After pure Railway API deploys with no static asset change, pack rebuild is optional.

**Known pack gap (provisional):** this recon found `quiz/` present but `media/`, `u1_l2_blooket.csv`, and `flashcards.js` **missing** under `android-app/www`. Offline video + native flashcards may be broken in the current tree even when quiz is present — track as pack-completeness follow-up (not G1).

---

## 6. Re-run instructions

```bash
cd school/follow-alongs

# HTTP + APK snapshot + G1 recommendation (no browser)
node scripts/smoke-student-host-matrix.mjs --http-only

# Full (needs playwright-core + chromium once)
npm install --no-save playwright-core
npx playwright-core install chromium
node scripts/smoke-student-host-matrix.mjs
# → state/w0-host-matrix-results.json
```

W7 (registry media) and W9 (quiz packaging policy) should re-run this script and attach the JSON (or a diff against this matrix) in their review packets.

---

## 7. Acceptance checklist (W0)

| Criterion | Met? |
|---|---|
| Every "does it 404?" answered with HTTP status | **Yes** (table §2) |
| `/quiz`, `/media`, formula origin documented per host | **Yes** (§2, §4) |
| G1 paragraph written from evidence | **Yes** (§3) — absolute CR origin |
| Prefer one-origin only if evidence supports | **Yes** — one-origin Pages `/quiz` **not** supported; absolute CR is |
| Reusable smoke script under `scripts/` | **Yes** — `smoke-student-host-matrix.mjs` |
| APK rebuild timing note | **Yes** (§5) |
| No app-code edits in W0 | **Yes** |

---

## 8. Downstream handoff

| Next | Uses this matrix how |
|---|---|
| **W1 / W3** | May proceed without G1 code change; copy/tile honesty still valid |
| **W2** | Formula Lab URL that works: `/formula-lab.html` (not bare `/formula-lab`) |
| **W7** | Pages `/media` is 404; merge/rehydrate strategy must not assume Pages hosts mp4s |
| **W9** | Implement G1 option A (or B if product chooses one-origin); dual web vs APK quiz URL shapes |
| **Codex / review** | Sanity-check G1 before any W7/W9 code keys off it |
