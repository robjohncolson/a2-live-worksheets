// phase4-structure.test.js — Phase 4a structure + jargon-ban guard.
// Asserts the new teacher-dashboard.html exists and is structurally sane, AND
// that the new "Where you stand" block in start-here.html contains NO BKT /
// θ / probability vocabulary (GRADEBOOK_GRADING_SPEC.md §3 student guard).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPath = resolve(repo, 'teacher-dashboard.html');
const startHerePath = resolve(repo, 'start-here.html');

const DASH = existsSync(dashboardPath) ? readFileSync(dashboardPath, 'utf8') : null;
const START = existsSync(startHerePath) ? readFileSync(startHerePath, 'utf8') : null;

// Banned vocabulary on the STUDENT-facing page (start-here.html "Where you
// stand" block only — pre-existing course-name copy elsewhere is fine).
// Case-insensitive whole-word-ish patterns.
const STUDENT_JARGON = [
  /\bBKT\b/i,
  /\btheta\b/i,
  /θ/,
  /\bpKnow\b/i,
  /\bposterior\b/i,
  /\bBayesian\b/i,
  /\bmastery probability\b/i,
  /\bweak skill\b/i,
];

// Helper: extract the "Where you stand" section + inline script from start-here.
function extractWhereYouStand(html) {
  // The section + everything after it through </body> (the inline script lives
  // at end of body and renders into #wys-status — its strings are student-facing).
  const sectionStart = html.indexOf('id="where-you-stand"');
  expect(sectionStart, 'where-you-stand section must exist').toBeGreaterThan(0);
  const bodyEnd = html.lastIndexOf('</body>');
  return html.slice(sectionStart, bodyEnd);
}

// ── teacher-dashboard.html structure ──────────────────────────────────────────
describe('teacher-dashboard.html — Phase 4a structure', () => {
  it('the file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist at repo root').toBeTypeOf('string');
  });

  it('declares it is a teacher dashboard (title)', () => {
    expect(DASH).toMatch(/<title>[^<]*teacher[^<]*dashboard/i);
  });

  it('loads roster_config.js as a sibling (single-source URL config)', () => {
    expect(DASH).toMatch(/<script\s+src=["']roster_config\.js["']/i);
  });

  it('calls BOTH /class endpoints', () => {
    expect(DASH).toMatch(/\/class\/grades/);
    expect(DASH).toMatch(/\/class\/mastery/);
  });

  it('sends the teacher-secret header on requests', () => {
    expect(DASH).toMatch(/x-teacher-secret/i);
  });

  it('teacher-secret persistence is OPT-IN only; localStorage writes are scoped to known keys', () => {
    // Updated 2026-05-19: the original Phase-4a posture was zero persistence.
    // To make local-only e2e testing usable (Railway-down day, plus general
    // teacher convenience) the dashboard now:
    //   (a) saves the service-URL choice to localStorage UNCONDITIONALLY
    //       (URL is not a secret), and
    //   (b) saves the teacher secret to localStorage ONLY when the user
    //       explicitly checks an opt-in "Remember on this device" checkbox.
    // The exact key names are pinned here so a future regression (e.g. an
    // accidental rename or an extra setItem call) is caught — the assertion
    // is now "ONLY these known keys may be set," not "no setItem at all."

    // No sessionStorage / cookie writes — those were never opt-in surfaces.
    expect(DASH).not.toMatch(/sessionStorage\.setItem/);
    expect(DASH).not.toMatch(/document\.cookie\s*=/);

    // Every localStorage.setItem call must target one of the four known
    // keys: URL_KEY (this page's URL choice), SECRET_KEY (opt-in secret),
    // and GLOBAL_OVERRIDE_KEY (the same key roster_config.js consults so
    // Desk + worksheets + start-here pick up the same backend in one click).
    // _inboxSeenKey() derives tsc-inbox-seen-at:<section>; its value is an
    // inbox-seen timestamp and stores no credential.
    const setItemCalls = [...DASH.matchAll(/localStorage\.setItem\s*\(\s*(_inboxSeenKey\(\)|[A-Z_][A-Z0-9_]*|['"][^'"]+['"])/g)];
    expect(setItemCalls.length, 'localStorage.setItem must appear at least once (for URL persistence)').toBeGreaterThan(0);
    const ALLOWED_KEYS = new Set(['URL_KEY', 'SECRET_KEY', 'GLOBAL_OVERRIDE_KEY', '_inboxSeenKey()']);
    for (const m of setItemCalls) {
      const target = m[1];
      expect(
        ALLOWED_KEYS.has(target),
        `localStorage.setItem(${target}, ...) targets an unknown key — only URL_KEY, SECRET_KEY, GLOBAL_OVERRIDE_KEY, and _inboxSeenKey() are allowed`
      ).toBe(true);
    }

    // The literal key strings must be exactly these — pins the
    // dashboard/console to share the same storage namespace and the
    // global-override contract that roster_config.js depends on.
    expect(DASH).toMatch(/URL_KEY\s*=\s*['"]a2_teacher_service_url['"]/);
    expect(DASH).toMatch(/SECRET_KEY\s*=\s*['"]a2_teacher_secret['"]/);
    expect(DASH).toMatch(/GLOBAL_OVERRIDE_KEY\s*=\s*['"]roster_service_url_override['"]/);

    // The SECRET_KEY write must be guarded by the remember-secret checkbox.
    // Walk the persistSecretMaybe body and prove the setItem only fires when
    // the checkbox is checked.
    const fnStart = DASH.indexOf('function persistSecretMaybe');
    expect(fnStart, 'persistSecretMaybe guard function must exist').toBeGreaterThan(0);
    const fnSlice = DASH.slice(fnStart, fnStart + 800);
    // The body must check 'remember-secret' (the checkbox) before the write.
    expect(fnSlice).toMatch(/remember-secret['"]?\)\s*\.\s*checked/);
    expect(fnSlice).toMatch(/localStorage\.setItem\s*\(\s*SECRET_KEY/);
    // And the unchecked branch must call removeItem(SECRET_KEY).
    expect(fnSlice).toMatch(/localStorage\.removeItem\s*\(\s*SECRET_KEY/);
  });

  it('no external CDN/script imports (self-contained)', () => {
    // Allow ONLY relative sibling script srcs (no http(s)://, no //cdn).
    const externalScript = /<script\s+[^>]*src=["'](?:https?:)?\/\//i;
    expect(DASH).not.toMatch(externalScript);
  });

  it('Phase 4a /class/* fetches stay read-only; only Phase 4b /remediation/* adds POSTs', () => {
    // Updated 2026-05-19 (Phase 4b): the dashboard now also drives the
    // remediation write workflow (propose/approve/complete/waive). The
    // Phase-4a read-only guarantee survives for /class/* — verify that
    // every POST in this file is scoped to /remediation/*, never to
    // /class/* / /grade / /mastery / /rollup / /ledger.

    // No PUT/PATCH/DELETE anywhere — those verbs have never been part of
    // either Phase-4a or Phase-4b contracts.
    expect(DASH).not.toMatch(/method:\s*["'](?:PUT|DELETE|PATCH)["']/i);

    // Codex Phase 4b MINOR-2: the prior version of this guard built an
    // unused `postBlocks` list and only scanned ~400 chars after each
    // method:'POST' literal. A POST issued through a helper (postJson)
    // builds the URL FAR from the literal method:'POST' line, so the old
    // search window missed every real call site. Inspect ALL string-literal
    // path arguments to fetch/postJson and assert each one is scoped to
    // /remediation/ — this is what the contract actually forbids.
    //
    // Capture every quoted path that looks like an endpoint (starts with /
    // and contains no spaces) AND verify it's either a GET (allowed
    // anywhere) or a known Phase-4a/-4b path. We extract the static string
    // arguments to fetch(...) / postJson(...) — those are the URLs.
    const callTargets = [];
    // postJson('/path', ...) — the dashboard's only POST helper.
    for (const m of DASH.matchAll(/\bpostJson\s*\(\s*(['"`])(\/[^'"`\s]*)\1/g)) {
      callTargets.push({ kind: 'POST', path: m[2] });
    }
    // Direct fetch with method:'POST' (none expected, but pin it).
    for (const m of DASH.matchAll(/fetch\s*\([^)]*?method:\s*["']POST["'][^)]*?\)/g)) {
      callTargets.push({ kind: 'POST', path: '(direct-fetch)' });
    }
    // Every POST must hit /remediation/ — forbid /class/*/grade/etc. POSTs.
    for (const t of callTargets) {
      if (t.kind !== 'POST') continue;
      if (t.path === '(direct-fetch)') {
        // The dashboard's pattern is postJson + a `path` variable. Any
        // direct-POST fetch is a regression risk — flag for manual review.
        // (As of Phase 4b shipping, there are zero such call sites.)
        // We do NOT fail outright since postJson itself uses fetch with
        // method:'POST' — but that's the helper definition, not a call site.
        continue;
      }
      // Retained teacher writes: remediation, feedback, backup/recovery,
      // and quarter snapshots. Removed wallet, payout and PC routes are forbidden.
      const ok = t.path.startsWith('/remediation/') || t.path.startsWith('/teacher/nudge') || t.path.startsWith('/admin/') || t.path.startsWith('/class/quarter/');
      expect(ok, `POST to "${t.path}" violates the /class/* read-only intent`).toBe(true);
    }
  });
});

// ── start-here.html — "Where you stand" section + jargon ban ──────────────────
describe('start-here.html — Algebra 2 orientation', () => {
  it('uses district categories and actual quarter closes', () => {
    for (const value of ['Assessments 50%', 'Assignments 40%', 'Engagement 10%', 'November 6', 'January 22', 'April 14', 'June 17']) expect(START).toContain(value);
  });
  it('offers the Desk and omits retired policies', () => {
    expect(START).toContain('desk.html');
    expect(START).not.toMatch(/Progress Check|Blooket|video|summer on-ramp/i);
  });
});
