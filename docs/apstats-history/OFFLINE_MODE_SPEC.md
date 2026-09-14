# OFFLINE_MODE_SPEC.md — disconnected AP Stats: do all the work offline, email it in

**Status:** rev 2 — **Phases 0, 1, 1b, AND 2 (PWA) SHIPPED (2026-06-22), incl. the quiz-app offline capture** (cr `2d3d6f3`). The full feature is built. Remaining is teacher-run only: `fetch-offline-videos.mjs` to acquire the real videos, then `build-offline-pack.mjs`. (The FA PWA is committed; pushing it registers a live service worker — see §4.G kill switch. A cr-side PWA, if wanted, mirrors §4.G at the cr scope.) Implementation map:
> - **§4.A queue** → `offline-queue.js` (+ wired into `gradebook-client.js`, loaded across 69 worksheets + Desk + study guide). **§4.C export** → `offline.html`. **§4.D import** → `roster-server/ledger-import.js` (`POST /ledger/import`) + `teacher-offline-import.html`. **§4.E pack** → `scripts/build-offline-pack.mjs` + `Start-Offline.cmd`. **§4.B progress cache** → Desk `renderDoNowGrades` write-through. **§4.H video** → `scripts/fetch-offline-videos.mjs` + `offline-video.js` resolver. **§4.G PWA** → `sw.js` + `pwa-register.js` + `manifest.webmanifest` + `icon.svg` (network-first nav, versioned cache, background-sync drain).
**Decisions locked (teacher):** (1) **both** — ship a disconnected *pack* first, add a PWA auto-sync layer later; (2) **everything** offline — worksheets + Desk + quiz app + study guide + TI-84 trainer; (3) video = **bundled offline** (full local playback — rev 2, changed from transcripts-only); (4) write this spec before building.

> **rev 2 — videos are now offline-playable.** Source: every lesson already carries a Google-Drive `altUrl` (the teacher's own re-hosted copy of the apclassroom video) — ~144 unique files. So acquisition = "download the teacher's own Drive copies." This makes the pack **multi-GB (USB-distributed, not email/download)** and adds a download pipeline + new local-`<video>` playback wiring (there is no existing local-MP4 playback — U9's on-disk MP4s aren't wired in). See §4.H, §6, §8.

> Grounded in a 6-investigator offline-readiness scan of the live code. File/line anchors below are from that scan and may drift — confirm at implementation.

---

## 1. Goal

A student with **no internet** can open a self-contained copy of the course, do real work (worksheets, quizzes, study guide, TI-84 practice), have every answer **recorded locally**, and **export one file** they email to the teacher. The teacher **imports** that file into the class DB. No live sync required; the network apps keep working unchanged for everyone else.

Two scenarios, one shared core:

| Scenario | Delivery | Sync |
|---|---|---|
| **A. Zero internet (build first)** | A *pack* (folder + one-click launcher, or USB) | Export JSON → email → teacher imports |
| **B. Intermittent (build later)** | PWA installed once while online | Auto-drains the same offline queue on reconnect |

Both reuse the same three new primitives: an **offline write-queue**, an **export bundle**, and a **teacher import endpoint**. Build those once.

---

## 2. Current offline-readiness (what the scan found)

### Already works offline — reuse, don't rebuild
- **Worksheets run fully offline.** Fill-in-the-blank validation is pure-local (`checkAnswer` reads the inline `data-answer`, ~`u*_lesson*_live.html:1258`). Completion tracking, reflection drafts, and the Show-Answers teacher gate are all local.
- **The Desk loads offline.** `loadRegistry()` (~`ap_stats_roadmap_square_mode.html:19263`) falls back: live → 14-day localStorage cache → `BAKED_REGISTRY`. An offline banner + `online`/`offline` listeners are already wired (`_wireRoadmapNetworkStatus`).
- **Cached sign-in survives offline.** `apstats_roster.v1` persists; `rosterClient.current()` reads it with no network. Guest identity (`apstats_guest_identity`) works fully offline.
- **Work already partially survives.** Receipts are captured to `localStorage desk_receipts_v1` (cap 500) by `gradebook-client.js::_captureReceipt`.
- **The write paths are centralized.** The "view-as read-only" module neuters `gradebookClient.record` + `railwayClient.submitAnswer` at one seam (~`:3547`, guarded by `window.__WS_READ_ONLY__` at `:3545`). **This is the exact interception point for the offline queue.**
- **Export + verify infra exists.** Ed25519 receipts (`receipts.js`), `exportSealedTranscript()` (`/transcript`), the proto-git commit chain (`commits.js::buildCommits` + `GET /commits`), and `verify.html` / `teacher-verify.html` (verification uses an embedded public key — works offline).
- **Transcripts + slides are on disk** for U1–U3, U5–U9 (136 `*_transcription.txt` + 79 `slides.txt` in `u1/`…`u9/`).

### Hard-fails offline — the gaps to close
- **No offline write-queue** — offline writes silently drop (fire-and-forget).
- **Progress isn't persisted** — `/grade`, `/donow`, lesson-unlocks are session-only, never written to localStorage, so an offline Desk shows an empty Do-Now and no progress pills.
- **No teacher batch-import endpoint** — only `POST /class/blooket` exists (single-source). A generic importer must be built.
- **Initial sign-in needs the server** (`POST /roster/verify`) — no offline auth path.
- **AI grading + appeals, class aggregates, Live Classroom, wallet, nudges** — all network-only (degrade or defer offline).
- **Videos** — apclassroom (auth) + Google-Drive fallbacks, network-only; only U9 has local MP4s.

### Critical gotchas (drive the design)
- **`file://` isolates storage per file.** Firefox gives each `file://` HTML its own opaque origin; Chrome varies. Loose files would **not share** identity/work across the Desk + worksheets + quiz → the pack **must** run from a single origin (local server or PWA), never loose files.
- **`navigator.onLine` is unreliable** (captive portals, slow 2G). Detect offline by **fetch failure + an explicit baked `OFFLINE_MODE` flag**, not `navigator.onLine` alone.
- **Ledger dedup key is `student_id+source+item_id+attempt`, not `receipt_id`** (`ledger-db.js::insertLedgerRow` upsert). Good news: re-importing the same bundle is **idempotent** at the attempt level.
- **The signing key is server-side only** (`RECEIPT_ISSUER_PRIVATE_KEY`). On-device signing can't be trusted → offline work is **self-reported** (see §5 trust).
- **Cross-origin:** the quiz app is a *separate repo/origin* (`curriculum_render`). A single PWA service worker can't span both origins → the zero-internet pack must merge both into one localhost origin; the PWA layer is per-app.

---

## 3. Architecture decisions

| # | Problem | Decision |
|---|---|---|
| D1 | Loose files break storage sharing | Pack ships a **one-click local launcher** that serves the merged tree from `http://localhost:<port>` (single origin = behaves exactly like the live site). Never "open the HTML." |
| D2 | Offline identity (sign-in needs server) | **Personalized pack**: generated while online (by the kid, once, or by the teacher) — bakes the student's identity + a roster snapshot into `offline-config.js` so the apps treat them as signed-in offline. A generic-pack fallback collects name + a teacher code at first launch. |
| D3 | Trust of self-reported work | Imported offline work is tagged **evidence tier = `practice`/`offline`** (the tier system already exists; `proctored` needs a proctor secret). Teacher reviews. Acceptable for low-stakes classwork. |
| D4 | Video | **Bundle videos for full offline playback** (rev 2). Acquire the ~144 Google-Drive copies the teacher already set as fallbacks → store as local files → in `OFFLINE_MODE`, the video opener resolves to a local `<video>` instead of the apclassroom iframe / Drive embed. Transcripts + slides still ship as a lightweight companion + a fallback for any video that can't be fetched. See §4.H. |
| D7 | Video rights / source | **Confirmed:** the Drive `altUrl`s are all the teacher's own / link-shared copies → bulk-downloadable. Distributed to the teacher's own enrolled students for coursework. The pack must still not embed any account credential; downloads run under the teacher's own session at build time. |
| D8 | Video size/quality | **Full quality, whole course, one pack** (no transcode, no per-unit split). Accept the large (~7–20 GB est.) USB-only pack. Transcode/per-unit remain fallback levers only if the measured size proves unworkable. |
| D5 | AI grading offline | **Defer.** Offline stores the raw reflection response (+ optional self-assessment against the *local* `ai-grading-prompts*.js` rubric). AI grade runs **at import** (online) and can only raise (existing appeal-clamp rule). |
| D6 | Detecting offline | Baked `window.OFFLINE_MODE = true` in the pack + fetch-failure fallback in the network apps. The two share one code path. |

---

## 4. Components

### A. Offline write-queue  *(Phase 0 — the spine)*
A durable local queue at the centralized write seam.

- **Store:** IndexedDB `apstats_offline_v1`, object store `queue`, keyed `[source, itemId, attempt, ts]`. Record shape mirrors `recordBlankToGradebook`: `{ source, itemId, response, score, attempt, identity, ts, kind }` (`kind` ∈ blank | reflection-draft | reflection-grade | quiz | blooket | trainer).
- **Interception:** wrap `gradebookClient.record` and `railwayClient.submitAnswer` so that when `OFFLINE_MODE` is set **or** the POST fails, the record is enqueued (and the local receipt still captured) instead of dropped. Must install **before** the view-as read-only stubs (respect `__WS_READ_ONLY__` — never queue in read-only/view-as).
- **Conflict rule:** latest-wins by `ts`; a later edit/re-score supersedes a queued one. Honor the appeal-clamp (never enqueue a lower grade than an existing one).
- **Debounce:** reflection drafts keep the existing 400ms debounce into the queue.
- **Shared:** the same wrapper ships in `gradebook-client.js` + both copies of `railway_client.js` (this repo + `curriculum_render`) so worksheets *and* the quiz app queue identically.

### B. Local progress cache  *(Phase 1)*
So the offline Desk shows real progress, not blanks.
- Persist the last successful `/grade`, `/donow`, and `/student/lesson-unlocks` payloads to localStorage (`apstats_grade_cache_v1`, etc.) at the end of each poll; restore on offline boot.
- The pack bakes a fresh snapshot at generation time so a never-online kid still sees their map.

### C. Export bundle  *(Phase 0)*
- **Trigger:** "📤 Export my work" in the Desk (My Ledger) and a standalone `offline.html` launcher page.
- **Format:** one JSON file, email-friendly:
  ```json
  { "schema": "apstats-offline-export/v1",
    "student": { "studentId", "username", "realName", "section" },
    "appBuild", "generatedAt",
    "records": [ { "source","itemId","response","score","attempt","kind","ts" } ],
    "receipts": [ "<compact>", ... ],
    "sig": "<optional per-student signature>" }
  ```
- Reuses `desk_receipts_v1` + the queue as the source of truth. Optionally also emits the existing **sealed transcript** as a companion. Filename: `apstats_<username>_<date>.json`.

### D. Teacher import  *(Phase 0 — the one new server piece)*
- **Endpoint:** `POST /ledger/import` on roster-server, **teacher-gated** (teacher token / `x-teacher-secret`). Mirrors the `POST /class/blooket` batch pattern (per-row validate, collect-and-skip, return a result list).
- **Body:** the export bundle (one student) or an array (several).
- **Behavior per record:** resolve the student → `insertLedgerRow` (idempotent on `student_id+source+item_id+attempt`) → set evidence tier `practice`/`offline` → persist `receipt_id`/`receipt_compact` if migration 0018 columns exist (degrade if not) → for reflections with raw text, optionally enqueue server-side AI grading (raise-only).
- **Idempotent re-import** by design. Returns `{ imported, skipped, errors[] }`.
- **Teacher UI:** a drag-drop "Import offline work" panel — extend `teacher-verify.html` (it already verifies receipts → show integrity + the student before committing) or add to `teacher-dashboard.html`. Reuse receipt verification to flag tampering.

### E. The offline pack  *(Phase 1)*
- **Launcher (D1):** primary = a small bundled **portable static server** + a double-click script per OS (`Start-Offline.cmd` on Windows → starts the server, opens the default browser at `localhost`). Fallback documented: `python -m http.server`. (Open decision — see §8 — Windows-first since the teacher is on Windows.)
- **Build script:** `scripts/build-offline-pack.mjs` assembles a merged tree: all 69 worksheets + the Desk + study guide + `lib/` + `data/` + transcripts/slides + the quiz app (copied from `../curriculum_render`) + the TI-84 trainer (`standalone.html` + the cached ROM) + `offline-config.js` + the launcher. Rewrites absolute backend URLs to the offline no-op/queue path; sets `OFFLINE_MODE`.
- **Personalization (D2):** a "Download my offline pack" action (online) injects the student's identity + roster snapshot + progress snapshot into `offline-config.js`. Teacher can generate packs for never-online kids.

### F. Material specifics
- **Worksheets:** + `gradebook-client.js`, `railway_client.js`, `roster-client.js`, config, `ai-grading-prompts*.js`, transcripts. Already offline-capable once queued.
- **Desk / study guide:** + `roadmap-data.json`, `data/`, `lib/` (`bkt.js`, `dag-renderer.js`, `probe-selector.js`, `curriculum-charts.js`), sprite/classroom assets.
- **Quiz app (cross-repo):** copied in; its writes use the same queue (shared `railway_client.js`); AI grading deferred (D5); class aggregates show "offline — your answers only."
- **TI-84 trainer:** bundle the ROM into the pack (the download is online-only; it caches to IndexedDB `ti84-trainer-v2/assets`). *Open: ROM redistribution/licensing — confirm.*
- **Video:** bundled local files + manifest + offline playback resolver (§4.H); transcripts/slides ship alongside as the lightweight fallback.
- **Live Classroom / wallet / nudges:** disabled offline with a clear "needs internet" state (not errors).

### G. PWA layer  *(Phase 2 — "intermittent" scenario)*
- Per-app service worker (cache-first static, stale-while-revalidate), installed once online. Drains the **same** offline queue on `online` / background-sync. Per-origin (Desk+worksheets share one; quiz app its own).

### H. Offline video  *(Phase 1b — the heavy item)*
The Desk + worksheets play video via the apclassroom iframe (primary) or the Drive `altUrl` (fallback) — both network-only. Make it local:

- **Acquisition pipeline** — `scripts/fetch-offline-videos.mjs` (teacher-run, online, one-time): parse the ~144 Drive `altUrl`s out of the Desk's RESOURCES (union-checked against the quiz app's `data/units.js` — same id set) and download each in **pure Node** (no yt-dlp/gdown dependency) via Drive's large-file confirm flow (`drive.google.com/uc` → parse the `drive.usercontent.google.com` download form → stream the file). The lone YouTube-only alt can't be fetched this way → reported as a gap (transcript fallback). Output a `media/` tree + `media-manifest.json` mapping every in-page url+altUrl → the local file. Idempotent/resumable via a `media/.downloaded.json` ledger (finished files skipped; an interrupted file is a `.part`, re-fetched cleanly).
- **Playback rewrite** — an offline video resolver: in `OFFLINE_MODE`, the existing "open video" path looks the lesson up in `media-manifest.json` and renders a local `<video controls src="media/…">` instead of the apclassroom/Drive embed. (No existing local-`<video>` precedent — this is new wiring in the Desk + the worksheet video links.) Worksheet timestamps stay meaningful because the file is the same video. Falls back to the local transcript if a given video is missing from the manifest.
- **Size strategy (locked: full quality, whole course)** — download all ~144 at their as-hosted quality into one pack; no transcode, no per-unit split. Ship transcripts/slides regardless as a tiny always-present fallback. The build prints the measured total so we have real numbers; transcode (ffmpeg ~480p) and per-unit sub-packs stay on the shelf as fallback levers only if the measured size proves unworkable for USB.
- **Distribution** — the video pack is **USB-stick / large-download**, separate from the (tiny) work-export-by-email path. The launcher serves `media/` from the same localhost origin as everything else.

---

## 5. Trust & integrity

Offline work is **self-reported** (no trustworthy on-device signing). Mitigations: import tags it `practice`/`offline` tier (never `proctored`); the receipt chain gives ordering + tamper-evidence *within* a bundle (verified at import via the existing public key); the teacher reviews before it counts. This matches how take-home work is already treated and is appropriate for engagement-weighted AP Stats grading. **Do not** embed the server `RECEIPT_ISSUER_PRIVATE_KEY`, teacher secret, or the Supabase service-role key in any pack.

---

## 6. Phases

- **Phase 0 — the loop (highest leverage, smallest):** A (offline queue) + C (export) + D (import endpoint + teacher UI). Closes the full do-work→email→import loop for material that *already* runs offline (worksheets/quiz, when reached same-origin). Helps intermittent kids immediately.
- **Phase 1 — the pack:** E (launcher + build script + personalization) + B (progress cache) + F (bundle everything incl. transcripts, study guide, TI-84). Delivers true zero-internet (text/interactive material).
- **Phase 1b — offline video (heavy):** H (acquisition pipeline + local-`<video>` playback rewrite + size strategy). Run after 1's plumbing works, since it's the big time/size cost and can be tested on one unit (U1) before the full ~144-video pull.
- **Phase 2 — convenience:** G (PWA auto-sync) + deferred-AI-grade-at-import + offline self-grade-against-local-rubric.

---

## 7. File-change map (anticipated)

| File | Change | Phase |
|---|---|---|
| `gradebook-client.js` | queue wrapper around `record` + reconnect drain | 0 |
| `railway_client.js` (both repos) | queue wrapper around `submitAnswer` | 0 |
| `scripts/wire-offline-queue.mjs` | codemod across 69 worksheets (mirror the view-as codemod) | 0 |
| `ap_stats_roadmap_square_mode.html` | "Export my work", progress-cache persist/restore, `OFFLINE_MODE` plumbing | 0/1 |
| `roster-server/ledger-import.js` (new) + mount | `POST /ledger/import` | 0 |
| `teacher-verify.html` or `teacher-dashboard.html` | drag-drop import panel | 0 |
| `offline.html` (new) | standalone export/launcher page | 0/1 |
| `scripts/build-offline-pack.mjs` (new) | assemble merged pack + launcher + personalization | 1 |
| `offline-config.js` (generated) | baked identity/roster/progress + `OFFLINE_MODE` | 1 |
| `scripts/fetch-offline-videos.mjs` (new) | download ~144 Drive/YT videos → `media/` + `media-manifest.json` (resumable) | 1b |
| `ap_stats_roadmap_square_mode.html` + worksheet video links | offline video resolver → local `<video>` from the manifest | 1b |
| `sw.js` per app (new) | PWA caching + queue drain | 2 |

No DB migration needed for import (reuses `item_ledger`); receipt-column persistence already degrades if 0018 isn't present.

## 8. Open decisions / risks
- **Launcher form factor** (the make-or-break): bundled portable static server (best UX, per-OS binaries to ship) vs. `python -m http.server` (zero binary, requires Python) vs. PWA-only (no zero-internet). Recommend Windows-first one-click + documented Python fallback.
- ~~VIDEO — source confirmation~~ **RESOLVED:** all ~144 Drive copies are the teacher's own / link-shared → downloadable.
- ~~VIDEO — size/quality~~ **RESOLVED:** full quality, whole course, one USB pack (D8). Remaining sub-risk: confirm the *measured* total is USB-practical once `fetch-offline-videos.mjs` reports it; ~144 files of any individually-locked Drive video would be flagged in the gap report.
- **TI-84 ROM** redistribution in the pack — confirm licensing.
- **Pack size** dominated by video now (transcripts/slides + quiz + trainer ROM are minor next to ~144 videos).
- **Re-import ordering** — latest-wins relies on `ts`; confirm clocks are trustworthy enough (device clock).
- **Generic-pack identity collisions** — two kids on one device; require the teacher code to disambiguate.

## 9. Test plan
- Unit: offline-queue enqueue/drain/conflict (latest-wins, appeal-clamp); `POST /ledger/import` validate/upsert/idempotent/tier; export-bundle schema round-trip.
- Integration (jsdom): worksheet offline → queue → export JSON → import parses → ledger rows; same-origin shared identity sim.
- Video (1b): `fetch-offline-videos.mjs` resumability (interrupt + resume skips done files); `media-manifest.json` covers every lesson or names the gap; offline resolver plays a local `<video>` and falls back to transcript when a file is missing. Smoke on **U1 only** before the full ~144-video pull.
- Manual: build a pack, run the launcher, do a worksheet + a quiz + a trainer drill **and watch a lesson video** fully offline, export, import on the teacher side, confirm grades land as `practice` tier.
