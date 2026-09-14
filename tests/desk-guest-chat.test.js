/**
 * tests/desk-guest-chat.test.js
 *
 * Guests have no roster token, so the chat (built on the roster identity) couldn't
 * reach them. The Desk now lets a guest READ teacher messages by their Guest_ alias
 * via the un-authed /student/nudge-history-guest endpoint (poll + inbox + badge).
 * Replying stays roster-only (a guest is steered to sign in). Source pins.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
let html = '';
beforeAll(() => { html = readFileSync(resolve(ROOT, 'desk.html'), 'utf8'); });

describe('Desk teacher chat — guests can READ teacher messages by alias', () => {
  it('_studentNudgeGuestAlias gates on a2_guest_active + a Guest_ alias', () => {
    expect(html).toMatch(/function _studentNudgeGuestAlias/);
    expect(html).toMatch(/a2_guest_active/);
    expect(html).toMatch(/\/\^Guest_\/i\.test/);
  });
  it('_studentNudgeFetch uses the token endpoint OR the un-authed guest-alias endpoint', () => {
    expect(html).toMatch(/function _studentNudgeFetch/);
    expect(html).toMatch(/\/student\/nudge-history-guest\?guestUsername=/);
    expect(html).toMatch(/\/student\/nudge-history\?limit=/);   // roster path still there
  });
  it('the poll gate allows a guest (token OR guest alias; never a teacher)', () => {
    const m = /function _studentNudgeCanPoll\([\s\S]*?\n}/.exec(html);
    expect(m, '_studentNudgeCanPoll defined').not.toBeNull();
    expect(m[0]).toMatch(/_studentNudgeToken\(\) \|\| _studentNudgeGuestAlias\(\)/);
    expect(m[0]).toMatch(/role === 'teacher'/);
  });
  it('a guest who tries to reply is steered to sign in (reply stays roster-only)', () => {
    expect(html).toMatch(/Sign in with your name to reply/);
  });
});
