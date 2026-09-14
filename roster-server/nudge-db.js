// nudge-db.js -- Supabase DAL for the nudges_log table (Phase 3 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createNudgesDb(client) {
  return {
    insertNudges,        // batch insert (one row per recipient)
    insertReply,         // single reply row
    insertStudentDm,     // P13: student-initiated DM (fresh thread, parent_nudge_id=null)
    listForTeacher,      // teacher viewing their sent nudges
    listForStudent,      // student viewing nudges they received
    listStudentInbox,    // 2026-09-09: every student→teacher message across the class (dashboard inbox)
    markDelivered,       // update delivered_at for a (nudge_id, recipient) pair
    findParent,          // Codex BLOCKER fold P3: ownership check for replies
    listConversation,    // P7: dyadic thread for GET /teacher/nudge-history
    listConversationGuest, // guest-chat: teacher->guest thread, case-variant tolerant
  };

  // findParent({ nudgeId, recipientUsername }) -> { data: row|null, error }
  // Used by POST /student/nudge-reply to verify the student was a delivered
  // recipient of the original teacher nudge before persisting the reply.
  async function findParent({ nudgeId, recipientUsername }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('nudge_id', nudgeId)
      .eq('recipient_username', recipientUsername)
      .eq('direction', 'teacher')
      .maybeSingle();
  }

  async function insertNudges({ nudgeId, senderUsername, recipientUsernames, text, section, deliveredUsernames }) {
    var deliveredSet = new Set(deliveredUsernames || []);
    var nowIso = new Date().toISOString();
    var rows = recipientUsernames.map(function(ru) {
      return {
        nudge_id: nudgeId,
        sender_username: senderUsername,
        recipient_username: ru,
        text: text,
        direction: 'teacher',
        section: section,
        created_at: nowIso,
        delivered_at: deliveredSet.has(ru) ? nowIso : null,
      };
    });
    return client.from('nudges_log').insert(rows).select('*');
  }

  async function insertReply({ parentNudgeId, senderUsername, recipientUsername, text, section }) {
    var nowIso = new Date().toISOString();
    return client.from('nudges_log').insert({
      nudge_id: parentNudgeId + ':reply:' + Date.now(),
      parent_nudge_id: parentNudgeId,
      sender_username: senderUsername,
      recipient_username: recipientUsername,
      text: text,
      direction: 'student',
      section: section,
      created_at: nowIso,
      delivered_at: nowIso,  // student replies are sent live; delivery confirmed if teacher online
    }).select('*').single();
  }

  // P13: insert a student-initiated DM. Mirrors insertReply but with
  // parent_nudge_id=NULL (this is a fresh thread, not a reply).
  async function insertStudentDm({ nudgeId, senderUsername, recipientUsername, text, section }) {
    return client.from('nudges_log').insert({
      nudge_id: nudgeId,
      parent_nudge_id: null,
      sender_username: senderUsername,
      recipient_username: recipientUsername,
      text: text,
      direction: 'student',
      section: section,
      created_at: new Date().toISOString(),
      delivered_at: null,   // live delivery deferred; teacher polls via P7 dashboard surface
    }).select('*').single();
  }

  async function listForTeacher({ senderUsername, section, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('sender_username', senderUsername)
      .eq('section', section)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  async function listForStudent({ recipientUsername, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('recipient_username', recipientUsername)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  // Student-initiated messages and replies (direction='student') across the class,
  // newest first. `section` narrows to one period; `since` (ISO) returns only newer rows.
  async function listStudentInbox({ section = null, since = null, limit = 50 } = {}) {
    var q = client
      .from('nudges_log')
      .select('*')
      .eq('direction', 'student');
    if (section) q = q.eq('section', section);
    if (since) q = q.gt('created_at', since);
    return q.order('created_at', { ascending: false }).limit(limit);
  }

  async function markDelivered({ nudgeId, recipientUsername }) {
    return client
      .from('nudges_log')
      .update({ delivered_at: new Date().toISOString() })
      .eq('nudge_id', nudgeId)
      .eq('recipient_username', recipientUsername)
      .select('*')
      .single();
  }

  // listConversation({ teacherUsername, studentUsername, limit, offset })
  // -> { data: [row, ...], error }
  //
  // Returns every row in nudges_log that belongs to the conversation
  // between THIS teacher and THIS student, regardless of direction.
  // Newest-first by created_at. Used by GET /teacher/nudge-history.
  //
  // The conversation set is the UNION of:
  //   (direction='teacher' AND sender_username=teacher AND recipient_username=student)
  //   (direction='student' AND sender_username=student AND recipient_username=teacher)
  //
  // Caller MUST validate teacherUsername and studentUsername against
  // /^[a-zA-Z0-9_-]+$/ before calling this (PostgREST injection guard).
  async function listConversation({ teacherUsername, studentUsername, limit = 20, offset = 0 }) {
    return client
      .from('nudges_log')
      .select('*')
      .or(
        'and(direction.eq.teacher,sender_username.eq.' + teacherUsername + ',recipient_username.eq.' + studentUsername + ')' +
        ',' +
        'and(direction.eq.student,sender_username.eq.' + studentUsername + ',recipient_username.eq.' + teacherUsername + ')'
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.max(0, limit) - 1);
  }

  // listConversationGuest({ teacherUsername, studentUsernames, limit, offset })
  // -> { data: [row, ...], error }
  //
  // The guest variant of listConversation. A guest can only RECEIVE messages
  // (replying is roster-only), so the thread is just the teacher->guest rows.
  // The guest alias is stored with whatever case live presence used -- today
  // the Desk mounts a guest avatar as Title-case Guest_X (getGuestIdentity) and
  // the server never lowercases recipients, so the stored recipient is
  // Title-case. studentUsernames is an array of accepted case-variants (e.g.
  // ['Guest_Berry_Sloth','guest_berry_sloth']) so the thread is found
  // regardless of case, and a future presence canonicalization can't orphan it.
  //
  // Caller MUST validate teacherUsername and every studentUsernames entry
  // against /^[a-zA-Z0-9_-]+$/ before calling this (PostgREST injection guard).
  async function listConversationGuest({ teacherUsername, studentUsernames, limit = 20, offset = 0 }) {
    var variants = Array.isArray(studentUsernames) ? studentUsernames : [studentUsernames];
    var clauses = variants.map(function (su) {
      return 'and(direction.eq.teacher,sender_username.eq.' + teacherUsername + ',recipient_username.eq.' + su + ')';
    });
    return client
      .from('nudges_log')
      .select('*')
      .or(clauses.join(','))
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.max(0, limit) - 1);
  }
}

export function createLiveNudgesDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key, { db: { schema: process.env.ROSTER_DB_SCHEMA || 'a2' } });
  return createNudgesDb(client);
}
