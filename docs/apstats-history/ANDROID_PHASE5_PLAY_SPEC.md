# ANDROID PHASE 5 — Google Play build (on-demand video)

> ANDROID_PACKET_APP_SPEC §2/§12 Phase 5 (OPTIONAL). Google Play caps a single
> APK/AAB at ~150 MB, so the Play build CANNOT bundle the ~1.5 GB video that the
> sideload APK ships. Instead the app downloads video **per-unit on-demand** and
> **evicts** old units to free space. The spec's rule holds: **"Play is a flag, not
> a fork"** — playback already resolves *lesson → local file* (`offline-video.js` /
> `media-manifest.json`); only *how that file gets there* changes (bundled vs
> downloaded). Same `applicationId` → the Play app upgrades the sideload cleanly.
>
> **Status:** spec → implement. The build path + the on-demand manager are buildable
> + testable now. The one real fork — **where the videos are hosted** — is a
> build-time config (`MEDIA_BASE_URL`), so the code ships without blocking on it.

---

## 1. What changes vs the sideload build

| | Sideload (today) | Play (this phase) |
|---|---|---|
| Video | ~1.5 GB bundled in the APK | NOT bundled; downloaded per-unit on demand |
| Build | `assembleDebug` APK, `--keep-media` | `bundleRelease` **AAB**, `--no-media` |
| Resolve lesson→file | `offline-video.js` (bundled path) | `video-ondemand.js` (download → app storage → play) |
| Flag | (none) | `window.PLAY_BUILD = true` + `window.MEDIA_BASE_URL` (in `offline-config.js`) |
| Size | ~1.5 GB | app shell <50 MB (well under Play's 150 MB) |

Everything else (worksheets, quiz, grades, gossip, teacher app) is unchanged — they
already fit and work offline once first-loaded.

## 2. On-demand video manager (`video-ondemand.js`, `window.VideoOnDemand`)

Layers on the existing `media-manifest.json` (`byUrl`: lesson-video-url → `{file}`).
The download URL = `MEDIA_BASE_URL + '/' + file`. Storage is an **injectable adapter**
(`window.VideoStore`, Capacitor-Filesystem-backed by default) so the logic is
unit-testable and the storage/download backend is swappable.

- `.resolve(url)` → `{state, playUri?, downloadUrl?, key?}` — `bundled` (file present
  in the pack), `downloaded` (in app storage → playable URI via
  `Capacitor.convertFileSrc`), or `remote` (needs download).
- `.download(url, onProgress)` — fetch the download URL → store under `key` (= the
  manifest filename). `.downloadUnit(unit, lessonsIndex, onProgress)` — all of a
  unit's videos. `.evictUnit(unit, lessonsIndex)` — delete a unit's files.
- `.isDownloaded(url)`, `.downloadedUnits(lessonsIndex)`, `.usage()` (bytes on disk).
- **Eviction policy** (`evictionPlan`): keep the current + adjacent unit; when free
  space is low, evict the least-recently-played unit first (the teacher's
  "delete-old-unit-videos" idea). Pure + tested.

`mobile-home.html` (PLAY_BUILD only): a tapped video resolves → if `remote`, show a
**Download (NN MB)** affordance with progress, then play; a per-unit **Download
unit** / **Free up space** control. Falls back to the bundled path otherwise — the
sideload build is byte-unaffected.

## 3. THE DECISION — where the compressed videos are hosted (`MEDIA_BASE_URL`)

The ~1.5 GB of `media-compressed/` (144 × ~10 MB, a few ~31 MB) must live somewhere
the app can `fetch` over HTTPS with permissive CORS. Set once at build time
(`--media-base <url>`), baked into `offline-config.js`. Options:

- **(a) GitHub Releases** — attach the per-topic `.mp4`s as release assets (GH allows
  large assets, serves them CORS-open via a redirect to a CDN). Free, durable, no new
  infra; a release upload step. **Recommended default.**
- **(b) A CDN / object store** (Cloudflare R2, Backblaze B2, S3+CloudFront) — cheap at
  this size, fast, full CORS control. Slight setup + (minimal) cost.
- **(c) The Google-Drive `altUrl`s** (today's source) — no new hosting, but Drive's
  large-file confirm-form + CORS make in-WebView download unreliable; not recommended
  for the Play download path.

The code is source-agnostic: `MEDIA_BASE_URL` empty → the app degrades to "video
unavailable, set MEDIA_BASE_URL" (worksheets/quiz/grades still work). **Decision
needed: pick a host, upload `media-compressed/`, set `--media-base`.**

## 4. Build path
- `scripts/build-offline-pack.mjs --play --media-base <url>` → injects
  `window.PLAY_BUILD=true; window.MEDIA_BASE_URL='<url>'` into `offline-config.js`,
  adds `video-ondemand.js` + `video-store.js` to the pack, skips bundled media
  (implies `--no-media`).
- `scripts/build-android.mjs --play [--media-base <url>] [--release]` → runs the play
  pack, `cap sync`, then `gradle bundle{Debug,Release}` → an **AAB**
  (`app/build/outputs/bundle/`). `--release` needs the teacher's upload keystore
  (Play app signing) — `bundleDebug` validates the packaging path without it.
- `@capacitor/filesystem` is added for on-device storage (official plugin, no custom
  Java).

## 5. Non-code remainder (Play Console)
- **Upload keystore** + Play App Signing (Google manages the release key).
- **Privacy policy** URL (grades = student data) + **Data Safety** form (what's
  collected: name/grades; where it goes: the roster server; encryption-in-transit).
- Store listing, screenshots, content rating, the `media-compressed/` upload to the
  chosen host.
- Internal-testing track first; same `applicationId com.robcolson.apstats`.

## 6. Out of scope / hardening
Streaming download (current path is fetch→blob→write, fine for ~10–31 MB files; a
native file-transfer plugin streams for robustness on huge files); background /
resumable downloads; Play Asset Delivery (an alternative to self-hosting video, but
PAD has its own caps + complexity — self-host + on-demand is simpler here).
