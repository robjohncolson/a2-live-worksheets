// remediation-db.js — data-access wrapper for remediation_assignment around
// @supabase/supabase-js. Injectable for tests: call createRemediationDb
// (supabaseClient) with a real or fake client. server.js calls
// createLiveRemediationDb() to get the production instance.
//
// Until migrations/0004_remediation_assignment.sql is run on the
// curriculum_render Supabase project, every query here returns
// { data: null, error: { code: '42P01', ... } } — the route module converts
// that into a 503 "remediation table not yet provisioned" response. See
// GRADEBOOK_PHASE4B_BUILD.md §2.2.

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveRemediationDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  const client = createClient(url, key, { db: { schema: process.env.ROSTER_DB_SCHEMA || 'a2' } });
  return createRemediationDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createRemediationDb(client) {
  return {
    insertAssignment,
    getAssignmentById,
    updateAssignmentStatus,
    listAssignmentsForStudent,
    listAssignmentsForSection,
    findAssignment,
  };

  // Insert a new remediation_assignment row in status='proposed'.
  // Returns { data, error } — data has the full row on success.
  async function insertAssignment({
    studentId,
    unit,
    skill,
    sourceAttempt,
    assignedRefs,
    proposedBy,
    unlocks,
    notes,
  }) {
    return client
      .from('remediation_assignment')
      .insert([{
        student_id:     studentId,
        unit:           unit,
        skill:          skill,
        source_attempt: sourceAttempt ?? null,
        assigned_refs:  Array.isArray(assignedRefs) ? assignedRefs : [],
        status:         'proposed',
        proposed_by:    proposedBy || 'system',
        unlocks:        unlocks ?? null,
        notes:          notes ?? null,
      }])
      .select('*')
      .single();
  }

  // Fetch one assignment by id.
  // Returns { data, error } — data is the row or null.
  async function getAssignmentById(assignmentId) {
    return client
      .from('remediation_assignment')
      .select('*')
      .eq('assignment_id', assignmentId)
      .single();
  }

  // Update an assignment's status + the appropriate timestamp/fields.
  // The caller is responsible for transition validity; this function only
  // sets the columns it receives. Returns { data, error } — data is the
  // updated row.
  async function updateAssignmentStatus({
    assignmentId,
    status,
    approvedBy,
    assignedAt,
    completedAt,
    completedScore,
    recheckItemId,
    notes,
  }) {
    const patch = { status };
    if (approvedBy !== undefined) patch.approved_by = approvedBy;
    if (assignedAt !== undefined) patch.assigned_at = assignedAt;
    if (completedAt !== undefined) patch.completed_at = completedAt;
    if (completedScore !== undefined) patch.completed_score = completedScore;
    if (recheckItemId !== undefined) patch.recheck_item_id = recheckItemId;
    if (notes !== undefined) patch.notes = notes;

    return client
      .from('remediation_assignment')
      .update(patch)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single();
  }

  // List a student's own assignments, newest first. Optional status filter.
  // Returns { data, error } — data is an array of rows.
  async function listAssignmentsForStudent(studentId, { status } = {}) {
    let q = client
      .from('remediation_assignment')
      .select('*')
      .eq('student_id', studentId);
    if (status) q = q.eq('status', status);
    return q.order('created_at', { ascending: false });
  }

  // List assignments for a section, joining roster for real_name / username.
  // Optional status filter. Returns { data, error } — data is an array with
  // a nested `roster` object (Supabase fk join shorthand).
  //
  // Codex MAJOR (Phase 4b review): the join MUST be `!inner` so the
  // section equality constrains the PARENT rows. With a default (left)
  // embed, .eq('roster.section', ...) only filters the embedded payload
  // and the parent set is unchanged — the section filter would silently
  // become a no-op in production. `!inner` makes Supabase emit an inner
  // join so the parent rows are restricted to those whose joined roster
  // row matches. (The fake DB tests this contract via __rosterMeta.)
  async function listAssignmentsForSection({ section, status }) {
    const embed = section
      ? 'roster:student_id!inner ( real_name, login_username, section )'
      : 'roster:student_id ( real_name, login_username, section )';
    let q = client
      .from('remediation_assignment')
      .select('*, ' + embed);
    if (status) q = q.eq('status', status);
    if (section) q = q.eq('roster.section', section);
    return q.order('created_at', { ascending: false });
  }

  // Idempotency probe used by /remediation/propose-from-mastery: returns
  // any existing rows for the (student, skill) pair (optionally filtered
  // to a status set so 'completed' or 'waived' don't block a new proposal).
  // Returns { data, error } — data is an array, possibly empty.
  async function findAssignment({ studentId, skill, statuses }) {
    let q = client
      .from('remediation_assignment')
      .select('*')
      .eq('student_id', studentId)
      .eq('skill', skill);
    if (Array.isArray(statuses) && statuses.length) {
      q = q.in('status', statuses);
    }
    return q.order('created_at', { ascending: false });
  }
}
