// desk-user-role.test.js -- 2026-05-20: user-role gating on the Desk.
// - "Student" menu label renamed to "User"
// - Teacher menu hidden by default; revealed via updateUserRoleUI() when
//   rosterClient.current().role === 'teacher' (server-verified, not access code)
// - signOutStudent clears the role.
//
// Tests for retired access-code behavior have been removed (Connected Teacher
// Auth, 2026-05-21): TEACHER_ACCESS_CODE_DEFAULT, _teacherAccessCode,
// _onTeacherCodeInput, signin-teacher checkbox+code input, makeMeTeacher,
// the standalone fast-path in submitSignIn, and the post-signin code re-check
// are all gone.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk: user-role gating + sign-in teacher checkbox', () => {

  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: title-bar menu label is "User" (renamed from "Student")', () => {
    // The data-menu attr stays "student" for compat with closeMenus / wiring;
    // only the visible label changed.
    expect(DESK).toMatch(/data-menu="student">User\b/);
  });

  it('02: Teacher menu is default-hidden via inline style:display:none', () => {
    expect(DESK).toMatch(/id="menu-item-teacher"[^>]*style="display:none"/);
  });

  it('05: updateUserRoleUI derives teacher from rosterClient session role', () => {
    const body = fnBody(DESK, 'updateUserRoleUI');
    // Reads the roster session.
    expect(body).toMatch(/rosterClient/);
    expect(body).toMatch(/current\s*\(\s*\)/);
    // Derives isTeacher from the server-verified role field.
    expect(body).toMatch(/\.role\s*===\s*['"]teacher['"]/);
    // Syncs the a2_user_role cache.
    expect(body).toMatch(/a2_user_role/);
    // Shows or hides the Teacher menu item.
    expect(body).toMatch(/menu-item-teacher/);
    expect(body).toMatch(/style\.display/);
  });

  it('06: updateUserRoleUI is called on page init (so the Teacher menu reflects persisted role)', () => {
    // Look for the init-time call site near loadRegistry().
    expect(DESK).toMatch(/loadRegistry\(\);[\s\S]{0,200}updateUserRoleUI\(\)/);
  });

  it('10e: Do Now sign-in nudge points at the User menu (not the renamed Student menu)', () => {
    // The renderDoNow nudge string was stale: "Student > Gradebook" but
    // the menu is now "User > Sign In". Updated.
    const body = fnBody(DESK, 'renderDoNow');
    expect(body).not.toMatch(/Student\s*[▸>]\s*Gradebook/);
    expect(body).toMatch(/User\s*[▸>]\s*Sign In/);
  });

  // -- 2026-05-20: username datalist autocomplete ---------------------------
  it('11: username field has list="signin-username-list" + the datalist element exists', () => {
    expect(DESK).toMatch(/id="signin-username"[^>]*list="signin-username-list"/);
    expect(DESK).toMatch(/<datalist\s+id="signin-username-list">/);
  });

  it('12: known-user helpers exist (load / add / populate) with sane cap', () => {
    expect(DESK).toMatch(/function\s+_loadKnownUsers\s*\(/);
    expect(DESK).toMatch(/function\s+_addKnownUser\s*\(/);
    expect(DESK).toMatch(/function\s+_populateUsernameDatalist\s*\(/);
    expect(DESK).toMatch(/KNOWN_USERS_KEY\s*=\s*['"]a2_desk_known_users['"]/);
    expect(DESK).toMatch(/KNOWN_USERS_CAP\s*=\s*20/);
  });

  it('13: _addKnownUser dedupes case-insensitively + caps; no synthetic-identity special case', () => {
    const body = fnBody(DESK, '_addKnownUser');
    // The retired standalone-teacher identity (teacher@desk.local) is gone --
    // _addKnownUser must not carry that special case any more.
    expect(body).not.toMatch(/teacher@desk\.local/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);   // case-insensitive dedupe
    expect(body).toMatch(/unshift/);                  // most-recent first
    expect(body).toMatch(/KNOWN_USERS_CAP/);          // cap applied
  });

  it('14: openSignInModal re-populates the datalist on every open', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/_populateUsernameDatalist\s*\(\s*\)/);
  });

  it('15: roster sign-in success path adds to known users', () => {
    const body = fnBody(DESK, 'submitSignIn');
    // The roster-signin success path calls _addKnownUser with the legacy key.
    expect(body).toMatch(/_addKnownUser\s*\(\s*legacyKey\s*\)/);
  });

  // -- 2026-05-20 v7: server-backed roster picker dropdown ------------------
  it('16: roster dropdown markup exists (#signin-roster-dropdown + #signin-roster-list)', () => {
    expect(DESK).toMatch(/id="signin-roster-dropdown"/);
    expect(DESK).toMatch(/id="signin-roster-list"/);
    // CSS classes are scoped to the dropdown.
    expect(DESK).toMatch(/#signin-roster-dropdown\s+\.sr-row/);
  });

  it('17: roster fetch hits /roster/section/:section', () => {
    expect(DESK).toMatch(/async\s+function\s+_fetchPeriodRoster\s*\(/);
    // After the PeriodX-fallback refactor (sign-in dropdown fix) the actual
    // per-section fetch lives in _fetchSectionRoster which _fetchPeriodRoster
    // calls -- once for the primary section, again for PeriodX on empty.
    expect(DESK).toMatch(/async\s+function\s+_fetchSectionRoster\s*\(/);
    const body = fnBody(DESK, '_fetchSectionRoster');
    expect(body).toMatch(/\/roster\/section\//);
    expect(body).toMatch(/encodeURIComponent\s*\(\s*section\s*\)/);
    // Cache + TTL.
    expect(body).toMatch(/a2_desk_roster_cache_/);
    expect(body).toMatch(/ROSTER_CACHE_TTL_MS/);
    // Sorts by realName.
    expect(body).toMatch(/realName.*localeCompare/);
  });

  it('18: _periodToSection maps cP letters to roster section strings', () => {
    // _periodToSection is a pure, DOM-free function -- evaluate it in
    // isolation and check the actual mapping. This is more robust than
    // grepping the body, which was generalized in the Live Classroom
    // v1a work (explicit B/E literals -> a bare-letter rule).
    const fn = new Function('return (' + fnBody(DESK, '_periodToSection') + ')')();
    expect(fn('B')).toBe('PeriodB');
    expect(fn('E')).toBe('PeriodE');
    expect(fn('X')).toBe('PeriodX');
    expect(fn('PeriodB')).toBe('PeriodB');
    // Never returns a falsy section (that would empty the roster picker).
    expect(fn('')).toBe('PeriodX');
    expect(fn(null)).toBe('PeriodX');
  });

  it('19: _renderRosterDropdown filters by realName OR username + caps at 50 rows', () => {
    const body = fnBody(DESK, '_renderRosterDropdown');
    expect(body).toMatch(/r\.realName/);
    expect(body).toMatch(/r\.username/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);
    // 50-row cap.
    expect(body).toMatch(/slice\s*\(\s*0\s*,\s*50\s*\)/);
    // Empty state when no data loaded.
    expect(body).toMatch(/No class list loaded/);
  });

  it('20: row click fills the username field and focuses the password field', () => {
    const body = fnBody(DESK, '_renderRosterDropdown');
    // Sets the username input value.
    expect(body).toMatch(/uInp\.value\s*=\s*r\.username/);
    // Closes the dropdown.
    expect(body).toMatch(/_closeRosterDropdown/);
    // Focuses the password field for one-keystroke continuation.
    expect(body).toMatch(/getElementById\s*\(\s*['"]signin-password['"]/);
    expect(body).toMatch(/pInp\.focus/);
  });

  it('21: openSignInModal wires focus + click + input events on the username field', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/uInp\.onfocus\s*=/);
    expect(body).toMatch(/uInp\.onclick\s*=/);
    // The username field's oninput is re-bound to filter the dropdown.
    expect(body).toMatch(/uInp\.oninput\s*=\s*function/);
    expect(body).toMatch(/_renderRosterDropdown/);
  });

  it('22: outside pointer-down closes the dropdown without swallowing the click', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/addEventListener\s*\(\s*['"]pointerdown['"]/);
    expect(body).toMatch(/_closeRosterDropdown/);
  });

  it('22b: Escape closes only the open roster dropdown', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/ov\.onkeydown\s*=\s*function/);
    expect(body).toMatch(/e\.key\s*!==\s*['"]Escape['"]/);
    expect(body).toMatch(/e\.stopPropagation\s*\(\s*\)/);
    expect(body).toMatch(/_closeRosterDropdown\s*\(\s*\)/);
  });

  it('23: closeSignInModal also closes the roster dropdown', () => {
    const body = fnBody(DESK, 'closeSignInModal');
    expect(body).toMatch(/_closeRosterDropdown/);
  });

  it('10b: updateStudentMenu shows "Teacher:" prefix when role=teacher (status surfaces role)', () => {
    const body = fnBody(DESK, 'updateStudentMenu');
    expect(body).toMatch(/a2_user_role/);
    expect(body).toMatch(/Teacher:/);
  });

  it('11: signOutStudent clears the user role + refreshes the menu', () => {
    const body = fnBody(DESK, 'signOutStudent');
    expect(body).toMatch(/removeItem\s*\(\s*['"]a2_user_role['"]/);
    expect(body).toMatch(/updateUserRoleUI\s*\(\s*\)/);
  });

  it('12: Teacher Tools launcher reaches the teacher pages (roster console, dashboard, codegen)', () => {
    // The flat teacher menu was consolidated into one launcher (openTeacherTools);
    // the tool actions live in the _TEACHER_TOOLS array. Roster Console is included
    // (it's teacher-secret-gated at runtime, so the role-gated menu adds no surface)
    // — the teacher needs it to enroll students.
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-roster-console\.html['"]/);
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-dashboard\.html['"]/);
    expect(DESK).toMatch(/window\.open\s*\(\s*['"]teacher-code-generator\.html['"]/);
  });
});
