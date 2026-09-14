# Reliability pin conversion (B4)

This audit covers only Desk pins named by a J1–J6 journey title. “Regex-only” below means an `it` whose assertions inspect the Desk source or a sliced function body rather than executing the Desk behavior. Unnamed structural pins—including function shapes, script ordering, copy literals, and incident contracts—remain untouched.

| Pin file | `it` title | Verdict | Journey that covers it |
|---|---|---|---|
| `tests/desk-donow-card.test.js` | `renderDoNow fetches /donow with a Bearer token (D7 server-mediated)` | BEHAVIOR-deleted | `journeys/j1-signin-donow.journey.test.js` — J1 sign-in renders fake `/grade` values and records the authenticated `/donow` request |
| `tests/desk-donow-card.test.js` | `is invoked at init, after sign-in, and on visibilitychange` | BEHAVIOR-deleted | `journeys/j1-signin-donow.journey.test.js` — J1 boots the Desk and observes the post-sign-in refresh |
| `tests/desk-donow-card.test.js` | `the submitSignIn (DN2c) call to renderDoNow is typeof-guarded (decoupled)` | BEHAVIOR-deleted | `journeys/j1-signin-donow.journey.test.js` — J1 drives the real sign-in UI and observes refreshed Do Now state |
| `tests/desk-calendar-sync.test.js` | `seeds per-resource <topic>\|<artifact> marks from selfDoneArtifacts` | BEHAVIOR-deleted | `journeys/j2-shared-device.journey.test.js` — J2 hydrates a fresh per-student marks bucket from `/donow` |
| `tests/desk-calendar-sync.test.js` | `DESK_WORKSHEET_DONE_THRESHOLD is 60 (was an 80% gate)` | BEHAVIOR-deleted | `journeys/j3-worksheet-done.journey.test.js` — J3 executes the 59%/60% boundary and exact write path |
| `tests/desk-blooket-flashcards.test.js` | `55: _bfSaveProgress persists the answered snapshot` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 answered-snapshot resume |
| `tests/desk-blooket-flashcards.test.js` | `56: answer saves after scoring and Next clears answered before saving` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 answered-snapshot resume |
| `tests/desk-blooket-flashcards.test.js` | `57: answer then Cancel resumes at the following card without another point` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 answered-snapshot resume |
| `tests/desk-blooket-flashcards.test.js` | `58: pass timer is canceled on close and resume commits the saved 80% once` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 passing resume and single commit |
| `tests/desk-blooket-flashcards.test.js` | `58b: non-passing answer then Cancel resumes one card ahead without a commit` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 non-passing resume |
| `tests/desk-blooket-flashcards.test.js` | `59: legacy snapshot without answered resumes at its saved index` | BEHAVIOR-deleted | `journeys/j4-quick-check.journey.test.js` — J4 legacy snapshot compatibility |
| `tests/desk-timed-deck.test.js` | `17: _ftFinish logs, recaps, and commits the score (best-wins)` | BEHAVIOR-deleted | `journeys/j5-timed-deck.journey.test.js` — J5 completes the real timed deck |
| `tests/desk-timed-deck.test.js` | `24: _blooketCommit only saves a NEW best + refreshes /grade BEFORE the floor` | BEHAVIOR-deleted | `journeys/j5-timed-deck.journey.test.js` — J5 rejects a lower rerun and posts one higher best |
| `tests/desk-due-today.test.js` | `renders the chip only behind dueTodayDeck in renderDoNowGrades, never renderDoNow` | BEHAVIOR-deleted | `journeys/j6-review-mode.journey.test.js` — J6 verifies all-ON and both-OFF flag behavior |
| `tests/desk-review-mode.test.js` | `adds the Review button only inside the reviewMode flag gate` | BEHAVIOR-deleted | `journeys/j6-review-mode.journey.test.js` — J6 verifies all-ON and both-OFF flag behavior |
| `tests/desk-review-mode.test.js` | `logs one good review entry, applies it, saves, and advances` | BEHAVIOR-deleted | `journeys/j6-review-mode.journey.test.js` — J6 rates Good, checks the log/folded state, and observes advance |

No named pin was NOT-FOUND, and no named pin was classified STRUCTURE-kept. Structural tests not named by a journey were kept untouched.

## Regex-only `it` counts

| Touched test file | Before | After | Change |
|---|---:|---:|---:|
| `tests/desk-blooket-flashcards.test.js` | 44 | 42 | -2 |
| `tests/desk-donow-card.test.js` | 4 | 1 | -3 |
| `tests/desk-calendar-sync.test.js` | 8 | 7 | -1 |
| `tests/desk-due-today.test.js` | 5 | 4 | -1 |
| `tests/desk-review-mode.test.js` | 5 | 4 | -1 |
| `tests/desk-timed-deck.test.js` | 15 | 13 | -2 |
| **Total** | **81** | **71** | **-10** |

Six additional executed behavior `it`s were removed because their journey replacements exercise the same behavior, for 16 converted `it`s total. No describe block became empty.
