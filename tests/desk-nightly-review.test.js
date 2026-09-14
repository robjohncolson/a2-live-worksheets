// desk-nightly-review.test.js — pins the Desk Nightly Review surface (NIGHTLY_REVIEW_SPEC
// Phases 2-3). Source-level structure guards (mirrors desk-update-nudge.test.js): the menu
// item + badge, the overlay, the queue/mark functions, the teacher token auth, and the
// student My Ledger "seen / comment" badge wiring.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESK = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'desk.html'), 'utf8');

describe('Desk — Nightly Review teacher surface (Phase 2)', () => {
  it('replaces the nightly badge with Recent work', () => {
    expect(DESK).toContain("openTeacherTools('recent')");
    expect(DESK).not.toContain('id="menu-review-badge"');
  });
  it('has the Nightly Review overlay window', () => {
    expect(DESK).toMatch(/id="app-nightlyreview-overlay"/);
    expect(DESK).toMatch(/id="nightlyreview-content"/);
    expect(DESK).toMatch(/onclick="closeNightlyReview\(\)"/);
  });
  it('defines the queue + mark + badge functions', () => {
    for (const fn of ['function openNightlyReview', 'function _reviewFetchQueue', 'function _paintReviewQueue',
                      'async function _reviewMark', 'async function _reviewBadgePoll', 'function _reviewEditTemplates']) {
      expect(DESK, `missing ${fn}`).toContain(fn);
    }
  });
  it('the queue + mark calls hit /class/review-queue and /class/review with a Bearer token', () => {
    expect(DESK).toMatch(/\/class\/review-queue/);
    expect(DESK).toMatch(/fetch\(cfg\.base \+ '\/class\/review'/);
    expect(DESK).toMatch(/Authorization: 'Bearer ' \+ cfg\.token/);
  });
  it('routes the legacy opener to Recent work and stops review polling', () => {
    expect(DESK).toContain("function openNightlyReview() {\n    openTeacherTools('recent');");
    var poll = DESK.slice(DESK.indexOf('async function _reviewBadgePoll()'), DESK.indexOf('function openNightlyReview()'));
    expect(poll).not.toContain('_reviewFetchQueue');
  });
  it('comment templates persist in localStorage with seeded defaults', () => {
    expect(DESK).toMatch(/desk_review_templates_v1/);
    expect(DESK).toMatch(/'Nice work!', 'Show your steps', 'See me', 'Great improvement'/);
  });
});

describe('Desk — student My Ledger review badge (Phase 3)', () => {
  it('loads the student\'s own review marks (students only, not teacher/view-as)', () => {
    expect(DESK).toMatch(/async function _loadReviewMarksForSelf/);
    expect(DESK).toMatch(/who\.role === 'teacher'/);                       // skip for teacher/view-as
    expect(DESK).toMatch(/'\/ledger\/student\/' \+ encodeURIComponent\(sid\)/);
  });
  it('renders a "Seen by teacher" badge in the receipt row from _reviewByItem', () => {
    expect(DESK).toMatch(/_reviewByItem\[String\(r\.i \|\| payload\.i \|\| ''\)\]/);
    expect(DESK).toMatch(/👁 Seen by teacher/);
  });
});

describe('Desk — Nightly Review v2 (NIGHTLY_REVIEW_V2_SPEC)', () => {
  it('has the By student / By item toggle wired through _reviewMode', () => {
    expect(DESK).toMatch(/var _reviewMode = 'student'/);
    expect(DESK).toContain('function _reviewToggleBtns');
    expect(DESK).toMatch(/\[\['student', 'By student'\], \['item', 'By item'\]\]/);
    expect(DESK).toMatch(/_reviewMode === 'item'\) \? await _reviewFetchByItem\(\) : await _reviewFetchQueue\(\)/);
  });
  it('defines the v2 fetch + paint + draft functions', () => {
    for (const fn of ['async function _reviewFetchByItem', 'function _paintReviewByItem',
                      'async function _reviewDraftForItem', 'async function _reviewDraftCluster',
                      'async function _reviewFetchItemFull', 'async function _reviewDraftComment']) {
      expect(DESK, `missing ${fn}`).toContain(fn);
    }
  });
  it('hits the v2 roster endpoints with the Bearer token and the cr drafter', () => {
    expect(DESK).toMatch(/fetch\(cfg\.base \+ '\/class\/review-by-item'/);
    expect(DESK).toMatch(/fetch\(cfg\.base \+ '\/class\/review-item\/' \+ encodeURIComponent\(ledgerId\)/);
    expect(DESK).toMatch(/_reviewCrBase\(\) \+ '\/api\/ai\/review-comment'/);
  });
  it('pins rh AND score at render + sends expected[] so a revised answer 409s instead of mis-attaching a comment (§0.5)', () => {
    expect(DESK).toMatch(/var _reviewPins = \{\}/);
    expect(DESK).toMatch(/function _reviewPinRow/);
    expect(DESK).toMatch(/_reviewPinRow\(it\.ledgerId, it\.rh, it\.score\)/);
    expect(DESK).toMatch(/_reviewPinRow\(a\.ledgerId, a\.rh, a\.score\)/);
    // Score rides the pin: a *-DESK_DONE retake changes only the score (constant
    // {selfAttest} response) — rh alone would let a comment land on an unseen score.
    expect(DESK).toMatch(/expected\.push\(\{ ledgerId: id, rh: p\.rh, score: p\.score \}\)/);
    expect(DESK).toMatch(/res\.status === 409/);
    expect(DESK).toContain('a student revised that work while you were reviewing');
  });
  it('surfaces the 500-cap truncation instead of silently dropping the tail (§0.9)', () => {
    expect(DESK).toMatch(/data\.truncated/);
    expect(DESK).toContain('500 max per request');
  });
  it('the ✨ Draft button appears only for draftable rows and the fill is marked as an AI draft', () => {
    expect(DESK).toMatch(/if \(!it\.seen && it\.draftable\)/);
    expect(DESK).toContain('✨ AI draft — edit me');
    expect(DESK).toMatch(/full\.redacted \|\| full\.response == null/);   // redacted rows never reach the drafter
  });
  it('cluster drafts cap at 5 selected draftable answers and never send identifiers', () => {
    expect(DESK).toMatch(/filter\(function \(a\) \{ return a\.draftable; \}\)\.slice\(0, 5\)/);
    // The cr payloads carry only response/answers + score/source/topic — no names/ids.
    const draftBlock = DESK.slice(DESK.indexOf('async function _reviewDraftForItem'), DESK.indexOf('function _reviewSelectedAnswers'));
    expect(draftBlock).not.toMatch(/realName|studentId|username/);
  });
});
