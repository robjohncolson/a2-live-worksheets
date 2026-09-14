#!/usr/bin/env node
/**
 * Backfill B: answers -> item_ledger ingestion/report tool.
 *
 * Usage:
 *   node scripts/ingest-answers-to-ledger.mjs
 *   node scripts/ingest-answers-to-ledger.mjs --apply
 *
 * Environment:
 *   ROSTER_SUPABASE_URL
 *   ROSTER_SUPABASE_SERVICE_KEY
 *
 * Safety model:
 *   - Dry-run is the default. No writes happen unless --apply is passed.
 *   - Legacy answer usernames are mapped best-effort:
 *     1. exact roster_alias.legacy_key match
 *     2. exact roster.login_username match, case-insensitive
 *     3. UNMAPPED
 *   - UNMAPPED answers are NEVER inserted.
 *   - Existing item_ledger rows are NEVER inserted again.
 *   - New rows omit score so normal answer-key scoring can re-score them.
 *   - After --apply, A2's POST /class/backfill-receipts signs receipts for them.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Reuse roster-server's @supabase install (the dependency isn't resolvable from
// scripts/). This also keeps the pure exports (classifyAnswerSource) importable
// for tests without a top-level @supabase resolution.
import { createServiceClient } from '../roster-server/ledger-db.js';

const PAGE_SIZE = 1000;
const UNMAPPED_SAMPLE_SIZE = 10;

export function classifyAnswerSource(questionId) {
  const id = String(questionId ?? '');

  if (/^U\d+-PC-/i.test(id)) return 'pc';
  if (/^U\d+-L\d+-Q/i.test(id)) return 'curriculum_quiz';
  return null;
}

function createSupabaseClient() {
  return createServiceClient();
}

async function fetchAll(client, table, columns, buildQuery = query => query) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = buildQuery(client.from(table).select(columns).range(from, to));
    const { data, error } = await query;

    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    if (!Array.isArray(data) || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

function normalizeUsername(username) {
  return String(username ?? '').trim();
}

function makeLedgerKey(row) {
  return `${row.student_id}\u0000${row.source}\u0000${row.item_id}`;
}

function countBy(rows, getKey) {
  const counts = new Map();

  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

async function loadUsernameMappings(client) {
  const [aliases, rosterRows] = await Promise.all([
    fetchAll(client, 'roster_alias', 'student_id, legacy_key'),
    fetchAll(client, 'roster', 'student_id, login_username')
  ]);

  const aliasByLegacyKey = new Map();
  for (const alias of aliases) {
    const legacyKey = normalizeUsername(alias.legacy_key);
    if (!legacyKey || !alias.student_id) continue;
    if (!aliasByLegacyKey.has(legacyKey)) aliasByLegacyKey.set(legacyKey, alias.student_id);
  }

  const rosterByLoginLower = new Map();
  for (const row of rosterRows) {
    const login = normalizeUsername(row.login_username).toLowerCase();
    if (!login || !row.student_id) continue;
    if (!rosterByLoginLower.has(login)) rosterByLoginLower.set(login, row.student_id);
  }

  return { aliasByLegacyKey, rosterByLoginLower };
}

function mapUsername(username, mappings) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const aliasStudentId = mappings.aliasByLegacyKey.get(normalized);
  if (aliasStudentId) return aliasStudentId;

  return mappings.rosterByLoginLower.get(normalized.toLowerCase()) || null;
}

async function loadExistingLedgerKeys(client, candidates) {
  const existing = new Set();
  const bySource = new Map();

  for (const row of candidates) {
    if (!bySource.has(row.source)) bySource.set(row.source, []);
    bySource.get(row.source).push(row);
  }

  for (const [source, sourceRows] of bySource.entries()) {
    const itemIds = [...new Set(sourceRows.map(row => row.item_id))];

    for (let index = 0; index < itemIds.length; index += PAGE_SIZE) {
      const itemIdBatch = itemIds.slice(index, index + PAGE_SIZE);
      const { data, error } = await client
        .from('item_ledger')
        .select('student_id, source, item_id')
        .eq('source', source)
        .in('item_id', itemIdBatch);

      if (error) throw new Error(`Failed to read item_ledger: ${error.message}`);

      for (const row of data || []) {
        existing.add(makeLedgerKey(row));
      }
    }
  }

  return existing;
}

function buildReport({ answers, mappedAnswers, unmappedAnswers, alreadyInLedger, newRows, duplicateNewAnswers }) {
  const usernameCounts = countBy(answers, row => normalizeUsername(row.username) || '(blank)');
  const unmappedCounts = countBy(unmappedAnswers, row => normalizeUsername(row.username) || '(blank)');
  const groupedNew = countBy(newRows, row => row.source);
  const groupedAlready = countBy(alreadyInLedger, row => row.source);
  const groupedMappable = countBy(mappedAnswers, row => row.source);
  const unmappedSample = [...unmappedCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, UNMAPPED_SAMPLE_SIZE);

  const mappedUsernames = new Set(mappedAnswers.map(row => normalizeUsername(row.username) || '(blank)'));
  const unmappedUsernames = new Set(unmappedAnswers.map(row => normalizeUsername(row.username) || '(blank)'));

  console.log('Backfill B answers -> item_ledger report');
  console.log('========================================');
  console.log(`Mode: ${process.argv.includes('--apply') ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Total answers read: ${answers.length}`);
  console.log(`Distinct usernames: ${usernameCounts.size}`);
  console.log(`Distinct usernames mapped: ${mappedUsernames.size}`);
  console.log(`Distinct usernames unmapped: ${unmappedUsernames.size}`);
  console.log(`Answers mappable: ${mappedAnswers.length}`);
  console.log(`Answers already in ledger: ${alreadyInLedger.length}`);
  console.log(`Answers NEW (would insert): ${newRows.length}`);
  console.log(`Duplicate NEW answers skipped by ledger key: ${duplicateNewAnswers}`);
  console.log('');

  console.log('Grouped by source');
  console.log('-----------------');
  for (const source of ['curriculum_quiz', 'pc']) {
    console.log(`${source}: mappable=${groupedMappable.get(source) || 0}, already=${groupedAlready.get(source) || 0}, new=${groupedNew.get(source) || 0}`);
  }
  console.log('');

  console.log('Unmapped username sample');
  console.log('------------------------');
  if (unmappedSample.length === 0) {
    console.log('(none)');
  } else {
    for (const [username, count] of unmappedSample) {
      console.log(`${username}: ${count}`);
    }
  }
}

function dedupeNewRows(rows) {
  const seen = new Set();
  const uniqueRows = [];

  for (const row of rows) {
    const key = makeLedgerKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  return {
    rows: uniqueRows,
    duplicateCount: rows.length - uniqueRows.length
  };
}

async function insertRows(client, rows) {
  let inserted = 0;

  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const batch = rows.slice(index, index + PAGE_SIZE).map(row => ({
      student_id: row.student_id,
      source: row.source,
      item_id: row.item_id,
      response: row.response,
      recorded_at: row.recorded_at,
      attempt: 1
    }));

    const { data, error } = await client
      .from('item_ledger')
      .upsert(batch, { onConflict: 'student_id,source,item_id,attempt', ignoreDuplicates: true })
      .select('ledger_id');

    if (error) throw new Error(`Failed to insert item_ledger rows: ${error.message}`);
    inserted += Array.isArray(data) ? data.length : 0;
  }

  return inserted;
}

export async function main() {
  const apply = process.argv.includes('--apply');
  const client = createSupabaseClient();

  const [answers, mappings] = await Promise.all([
    fetchAll(client, 'answers', 'username, question_id, answer_value, timestamp'),
    loadUsernameMappings(client)
  ]);

  const mappedAnswers = [];
  const unmappedAnswers = [];

  for (const answer of answers) {
    const source = classifyAnswerSource(answer.question_id);
    if (!source) continue;

    const studentId = mapUsername(answer.username, mappings);
    if (!studentId) {
      unmappedAnswers.push(answer);
      continue;
    }

    mappedAnswers.push({
      username: answer.username,
      student_id: studentId,
      source,
      item_id: answer.question_id,
      response: answer.answer_value,
      recorded_at: answer.timestamp
    });
  }

  const existingKeys = await loadExistingLedgerKeys(client, mappedAnswers);
  const alreadyInLedger = [];
  const newAnswerRows = [];

  for (const row of mappedAnswers) {
    if (existingKeys.has(makeLedgerKey(row))) {
      alreadyInLedger.push(row);
    } else {
      newAnswerRows.push(row);
    }
  }

  const { rows: newRows, duplicateCount } = dedupeNewRows(newAnswerRows);

  buildReport({
    answers,
    mappedAnswers,
    unmappedAnswers,
    alreadyInLedger,
    newRows,
    duplicateNewAnswers: duplicateCount
  });

  if (!apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to insert NEW mapped rows.');
    return;
  }

  const inserted = await insertRows(client, newRows);
  console.log('');
  console.log(`Inserted rows: ${inserted}`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
