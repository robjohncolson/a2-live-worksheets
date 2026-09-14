// lesson-unlock-db.js -- Supabase DAL for lesson_unlock (Phase 5 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createLessonUnlockDb(client) {
  return {
    upsertUnlock,                // teacher overrides -- INSERT ON CONFLICT (student,lesson) UPDATE
    listActiveForStudent,        // student-side: their active unlocks
    revokeUnlock,                // teacher revocation -- flips active -> revoked
  };

  // upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason })
  // -> { data: row|null, error }
  async function upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason }) {
    var row = {
      student_username: studentUsername,
      lesson_key: lessonKey,
      unlocked_by: unlockedBy,
      reason: reason || null,
      status: 'active',
      unlocked_at: new Date().toISOString(),
    };
    return client
      .from('lesson_unlock')
      .upsert([row], { onConflict: 'student_username,lesson_key' })
      .select('*')
      .single();
  }

  // listActiveForStudent(studentUsername) -> { data: [row, ...], error }
  // Returns ONLY active (not revoked) unlocks.
  async function listActiveForStudent(studentUsername) {
    return client
      .from('lesson_unlock')
      .select('*')
      .eq('student_username', studentUsername)
      .eq('status', 'active');
  }

  // revokeUnlock({ studentUsername, lessonKey, revokedBy })
  // -> { data: row|null, error }
  //
  // Flips status from 'active' to 'revoked' for the given (student, lesson).
  // Returns data=null (no error) when no active row exists OR when the row
  // changed underneath us between SELECT and UPDATE -- the route maps both
  // outcomes to 404 so the UI refreshes instead of silently clobbering newer
  // state.
  //
  // Uses a two-step read-modify-write because Supabase's update API does not
  // support string concatenation in a single call. Step 2 carries optimistic-
  // concurrency guards (status + unlocked_at must still match what Step 1 saw)
  // so a concurrent upsertUnlock() landing in the gap is detected and the
  // revoke returns null rather than overwriting the fresher state. (Codex P6
  // MAJOR fold: TOCTOU window between SELECT and UPDATE.)
  async function revokeUnlock({ studentUsername, lessonKey, revokedBy }) {
    // Step 1: fetch the active row.
    var found = await client
      .from('lesson_unlock')
      .select('*')
      .eq('student_username', studentUsername)
      .eq('lesson_key', lessonKey)
      .eq('status', 'active')
      .maybeSingle();
    if (found.error) return { data: null, error: found.error };
    if (!found.data) return { data: null, error: null };  // nothing to revoke -> route returns 404

    // Step 2: compose new reason + flip status. Optimistic concurrency: filter
    // by id + the unlocked_at we just saw. If a concurrent upsertUnlock has
    // refreshed unlocked_at in the gap, this UPDATE matches 0 rows and we
    // return data=null so the caller refreshes.
    var tag = 'revoked by ' + (revokedBy || 'teacher');
    var newReason = found.data.reason
      ? (found.data.reason + ' | ' + tag)
      : tag;

    return client
      .from('lesson_unlock')
      .update({ status: 'revoked', reason: newReason })
      .eq('id', found.data.id)
      .eq('status', 'active')
      .eq('unlocked_at', found.data.unlocked_at)
      .select('*')
      .maybeSingle();
  }
}

export function createLiveLessonUnlockDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key, { db: { schema: process.env.ROSTER_DB_SCHEMA || 'a2' } });
  return createLessonUnlockDb(client);
}
