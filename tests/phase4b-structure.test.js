// phase4b-structure.test.js — Phase 4b structure guard.
// Asserts the migration SQL ships, the roster-server endpoint module file
// exists, and the teacher-dashboard.html "Remediation" panel + its action
// wiring are present. The full roster-server-side behaviour is covered by
// roster-server/tests/remediation.test.js (44 cases); this file is a
// follow-alongs-root structure check so the deliverables can't silently
// drift from the frozen contract.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = resolve(repo, 'roster-server/migrations/0004_remediation_assignment.sql');
const remediationDbPath = resolve(repo, 'roster-server/remediation-db.js');
const remediationModPath = resolve(repo, 'roster-server/remediation.js');
const dashPath = resolve(repo, 'teacher-dashboard.html');

const SQL = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : null;
const REM_DB = existsSync(remediationDbPath) ? readFileSync(remediationDbPath, 'utf8') : null;
const REM_MOD = existsSync(remediationModPath) ? readFileSync(remediationModPath, 'utf8') : null;
const DASH = existsSync(dashPath) ? readFileSync(dashPath, 'utf8') : null;

describe('Phase 4b — migration SQL', () => {
  it('the SQL file exists at the canonical path', () => {
    expect(SQL, 'roster-server/migrations/0004_remediation_assignment.sql must exist').toBeTypeOf('string');
  });

  it('creates the remediation_assignment table with the spec §6 columns', () => {
    expect(SQL).toMatch(/create table if not exists remediation_assignment/i);
    expect(SQL).toMatch(/assignment_id\s+uuid\s+primary key/i);
    expect(SQL).toMatch(/student_id\s+uuid[^,]+references\s+roster\(student_id\)\s+on\s+delete\s+cascade/i);
    expect(SQL).toMatch(/\bunit\s+text\b/);
    expect(SQL).toMatch(/\bskill\s+text\b/);
    expect(SQL).toMatch(/assigned_refs\s+jsonb/i);
    expect(SQL).toMatch(/status\s+text[^,]*check\s*\(\s*status\s+in\s*\(\s*'proposed'\s*,\s*'assigned'\s*,\s*'completed'\s*,\s*'waived'/i);
    expect(SQL).toMatch(/proposed_by\s+text/i);
    expect(SQL).toMatch(/assigned_at\s+timestamptz/i);
    expect(SQL).toMatch(/completed_at\s+timestamptz/i);
    expect(SQL).toMatch(/\bunlocks\s+text\b/);
  });

  it('declares the four required indexes', () => {
    expect(SQL).toMatch(/create index[^;]*remediation_student_idx[^;]*\(student_id\)/i);
    expect(SQL).toMatch(/create index[^;]*remediation_skill_idx[^;]*\(skill\)/i);
    expect(SQL).toMatch(/create index[^;]*remediation_status_idx[^;]*\(status\)/i);
    expect(SQL).toMatch(/create index[^;]*remediation_student_skill_idx[^;]*\(student_id,\s*skill\)/i);
  });

  it('enables RLS with NO policies (service-role only)', () => {
    expect(SQL).toMatch(/alter table remediation_assignment enable row level security/i);
    // Zero policies — the migration intentionally has none.
    expect(SQL).not.toMatch(/create policy/i);
  });

  it('only touches the new table — no ALTER on existing tables', () => {
    expect(SQL).not.toMatch(/\balter table roster\b/i);
    expect(SQL).not.toMatch(/\balter table item_ledger\b/i);
    expect(SQL).not.toMatch(/\bdrop table\b/i);
  });
});

describe('Phase 4b — roster-server modules ship', () => {
  it('remediation-db.js exports createLiveRemediationDb + createRemediationDb', () => {
    expect(REM_DB, 'remediation-db.js must exist').toBeTypeOf('string');
    expect(REM_DB).toMatch(/export function createLiveRemediationDb/);
    expect(REM_DB).toMatch(/export function createRemediationDb/);
  });

  it('remediation-db.js exposes the helpers the route module consumes', () => {
    // The shape returned by createRemediationDb(client) — these must all be in
    // the source so the wrapper round-trips with the route module.
    for (const name of [
      'insertAssignment',
      'getAssignmentById',
      'updateAssignmentStatus',
      'listAssignmentsForStudent',
      'listAssignmentsForSection',
      'findAssignment',
    ]) {
      expect(REM_DB, `${name} must be defined in remediation-db.js`).toMatch(
        new RegExp('\\b' + name + '\\b')
      );
    }
  });

  it('remediation.js mounts all 8 endpoints', () => {
    expect(REM_MOD, 'remediation.js must exist').toBeTypeOf('string');
    expect(REM_MOD).toMatch(/export function mountRemediation/);
    // 5 POSTs + 3 GETs per the build doc §2.3.
    const expectedRoutes = [
      "app.post('/remediation/propose'",
      "app.post('/remediation/approve'",
      "app.post('/remediation/complete'",
      "app.post('/remediation/waive'",
      "app.post('/remediation/propose-from-mastery'",
      "app.get('/remediation/student'",
      "app.get('/remediation/list'",
      "app.get('/remediation/unlocks'",
    ];
    for (const route of expectedRoutes) {
      expect(REM_MOD, `route "${route}" must be declared`).toContain(route);
    }
  });

  it('table-missing degrade: respondTableMissing + 42P01 detection both present', () => {
    expect(REM_MOD).toMatch(/respondTableMissing/);
    expect(REM_MOD).toMatch(/42P01/);
    expect(REM_MOD).toMatch(/remediation table not yet provisioned/);
  });

  it('/remediation/complete accepts EITHER a student token OR a teacher (requireTeacher)', () => {
    // WI-2: checkTeacherSecret replaced by imported requireTeacher from teacher-auth.js.
    // Both paths must be present in the same handler.
    const completeIdx = REM_MOD.indexOf("app.post('/remediation/complete'");
    expect(completeIdx).toBeGreaterThan(0);
    const handler = REM_MOD.slice(completeIdx, completeIdx + 2500);
    // Student-token path.
    expect(handler).toMatch(/verifyToken/);
    // Teacher path via requireTeacher (the new implementation of the teacher gate).
    expect(handler).toMatch(/requireTeacher/);
    // Token-branch cross-student check (403).
    expect(handler).toMatch(/status\(403\)/);
  });
});

describe('Phase 4b — teacher-dashboard.html remediation panel', () => {
  it('the dashboard file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('renders a "Remediation" section heading', () => {
    expect(DASH).toMatch(/<h2[^>]*class=["']section-title["'][^>]*>\s*Remediation\s*<\/h2>/);
  });

  it('declares the four required IDs the JS handlers wire onto', () => {
    for (const id of [
      'propose-from-mastery-btn',
      'propose-dryrun-btn',
      'remediation-tbody',
      'remediation-meta',
    ]) {
      expect(DASH, `id="${id}" must be declared in the dashboard`).toMatch(
        new RegExp(`id=["']${id}["']`)
      );
    }
  });

  it('uses postJson for the new write actions', () => {
    expect(DASH).toMatch(/function\s+postJson\s*\(/);
    // Endpoints the dashboard POSTs to:
    expect(DASH).toMatch(/\/remediation\/propose-from-mastery/);
    // The action endpoints are constructed via '/remediation/' + act:
    expect(DASH).toMatch(/\/remediation\/['"]\s*\+\s*act/);
  });

  it('the migration-pending 503 is handled with a clear user-facing message', () => {
    expect(DASH).toMatch(/Migration pending/);
    expect(DASH).toMatch(/0004_remediation_assignment\.sql/);
  });

  it('teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19)', () => {
    // Updated alongside the phase4-structure.test.js companion check.
    // Auto-persistence is still forbidden; opt-in localStorage is allowed
    // for exactly two known keys (URL_KEY = 'a2_teacher_service_url',
    // SECRET_KEY = 'a2_teacher_secret'). No sessionStorage / cookies.
    expect(DASH).not.toMatch(/sessionStorage\.setItem/);
    expect(DASH).not.toMatch(/document\.cookie\s*=/);
    // Any localStorage.setItem call must use one of the three known constants
    // (URL_KEY, SECRET_KEY, GLOBAL_OVERRIDE_KEY).
    const setItemCalls = [...DASH.matchAll(/localStorage\.setItem\s*\(\s*([A-Z_][A-Z0-9_]*|['"][^'"]+['"])/g)];
    const ALLOWED = new Set(['URL_KEY', 'SECRET_KEY', 'GLOBAL_OVERRIDE_KEY']);
    for (const m of setItemCalls) {
      expect(ALLOWED.has(m[1]), `unexpected setItem key: ${m[1]}`).toBe(true);
    }
  });
});
