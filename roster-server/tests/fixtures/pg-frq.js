// pg-frq.js -- real-SQL fixture for FRQ grade tickets. PGlite executes the
// actual migration 0031 and its plpgsql; tests only provide adversarial call
// orderings because PGlite intentionally exposes one database session.

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationDir = resolve(__dirname, '..', '..', 'migrations');
const BASE_MIGRATIONS = [
  '0002_item_ledger.sql',
  '0013_item_ledger_blooket_source.sql',
  '0014_item_ledger_quiz_exception.sql',
  '0015_item_ledger_quiz_review.sql',
  '0018_item_ledger_receipt.sql',
];

export const FRQ_STUDENT_ID = '11111111-1111-4111-8111-111111111111';

export async function createFrqDb({
  studentIds = [FRQ_STUDENT_ID],
  applyFrqMigration = true,
} = {}) {
  const db = new PGlite();

  await db.exec(`
    create table roster (
      student_id uuid primary key,
      section text default 'PeriodC',
      role text default 'student',
      status text default 'active',
      real_name text,
      login_username text
    );
  `);

  for (const studentId of studentIds) {
    await db.query(
      'insert into roster (student_id, login_username) values ($1, $2)',
      [studentId, `student-${studentId.slice(0, 8)}`],
    );
  }

  for (const file of BASE_MIGRATIONS) {
    await db.exec(await readFile(resolve(migrationDir, file), 'utf8'));
  }

  if (applyFrqMigration) {
    await db.exec(await readFile(resolve(migrationDir, '0031_frq_tickets.sql'), 'utf8'));
  }

  return db;
}

export async function resetFrqDb(db) {
  await db.exec('truncate item_ledger');
}

export async function pgRecordFrqDraft(db, {
  studentId = FRQ_STUDENT_ID,
  itemId,
  response,
  responseHash,
  readyAt,
}) {
  const result = await db.query(
    `select * from record_frq_draft(
      $1::uuid, $2::text, $3::text, $4::text, $5::timestamptz
    )`,
    [studentId, itemId, response, responseHash, readyAt],
  );
  return result.rows[0];
}

export async function pgClaimFrqTickets(db, {
  worker,
  limit = 8,
  leaseMs = 120000,
}) {
  const result = await db.query(
    `select * from claim_frq_tickets(
      $1::text, $2::int, $3::bigint
    )`,
    [worker, limit, leaseMs],
  );
  return result.rows;
}

export async function pgApplyFrqVerdict(db, {
  ledgerId,
  claimToken = null,
  responseVersion,
  score,
  result = {},
  rubricVersion = 'SY2627:test',
  gradedAt,
  teacher = false,
}) {
  const queryResult = await db.query(
    `select * from apply_frq_verdict(
      $1::uuid, $2::uuid, $3::bigint, $4::numeric,
      $5::jsonb, $6::text, $7::timestamptz, $8::boolean
    )`,
    [
      ledgerId,
      claimToken,
      responseVersion,
      score,
      JSON.stringify(result),
      rubricVersion,
      gradedAt,
      teacher,
    ],
  );
  return queryResult.rows[0];
}

export async function pgFailFrqClaim(db, {
  ledgerId,
  claimToken,
  error,
  nextAttemptAt,
}) {
  const result = await db.query(
    `select fail_frq_claim(
      $1::uuid, $2::uuid, $3::text, $4::timestamptz
    ) as matched`,
    [ledgerId, claimToken, error, nextAttemptAt],
  );
  return result.rows[0].matched;
}

export async function pgFrqRow(db, ledgerId) {
  const result = await db.query(
    'select * from item_ledger where ledger_id = $1::uuid',
    [ledgerId],
  );
  return result.rows[0] || null;
}

export async function pgSetAppealPending(db, ledgerId, pending) {
  await db.query(
    'update item_ledger set frq_appeal_pending = $2::jsonb where ledger_id = $1::uuid',
    [ledgerId, JSON.stringify(pending)],
  );
}

export async function pgSetFrqTimes(db, ledgerId, values) {
  const columns = {
    claimedUntil: 'frq_claimed_until',
    nextAttemptAt: 'frq_next_attempt_at',
    readyAt: 'frq_ready_at',
  };
  const assignments = [];
  const params = [ledgerId];

  for (const [key, column] of Object.entries(columns)) {
    if (!Object.hasOwn(values, key)) continue;
    params.push(values[key]);
    assignments.push(`${column} = $${params.length}::timestamptz`);
  }

  if (!assignments.length) return;
  await db.query(
    `update item_ledger set ${assignments.join(', ')} where ledger_id = $1::uuid`,
    params,
  );
}

// Mirrors §5.1's derived-state table; there is intentionally no mutable status
// column in either production SQL or this oracle.
export function deriveFrqState(row, now) {
  const nowMs = new Date(now).getTime();
  const leaseIsLive = row.frq_claimed_until
    && new Date(row.frq_claimed_until).getTime() > nowMs;

  if (row.score != null && row.frq_appeal_pending != null) {
    return leaseIsLive ? 'appeal-grading' : 'appeal-queued';
  }
  if (row.score != null) return 'graded';
  if (leaseIsLive) return 'grading';
  if (row.frq_next_attempt_at
    && new Date(row.frq_next_attempt_at).getTime() > nowMs) return 'retrying';

  const response = typeof row.response === 'string' ? row.response : '';
  if (response.length < 20 || row.frq_ready_at == null) return 'draft';
  return 'queued';
}

// Supabase-compatible surface over PGlite. It is deliberately tiny: just the
// rpc and select-chain operations used by createFrqLedgerDb.
export function createPgliteFrqClient(db) {
  return {
    rpc: (name, params) => pgliteRpc(db, name, params),
    from: (table) => createSelectBuilder(db, table),
  };
}

async function pgliteRpc(db, name, params) {
  try {
    let data;
    if (name === 'record_frq_draft') {
      const result = await db.query(
        'select * from record_frq_draft($1::uuid,$2::text,$3::text,$4::text,$5::timestamptz)',
        [params.p_student_id, params.p_item_id, params.p_response, params.p_response_hash, params.p_ready_at],
      );
      data = result.rows;
    } else if (name === 'claim_frq_tickets') {
      const result = await db.query(
        'select * from claim_frq_tickets($1::text,$2::int,$3::bigint)',
        [params.p_worker, params.p_limit, params.p_lease_ms],
      );
      data = result.rows;
    } else if (name === 'apply_frq_verdict') {
      const result = await db.query(
        `select * from apply_frq_verdict(
          $1::uuid,$2::uuid,$3::bigint,$4::numeric,$5::jsonb,$6::text,$7::timestamptz,$8::boolean
        )`,
        [
          params.p_ledger_id,
          params.p_claim_token,
          params.p_response_version,
          params.p_score,
          JSON.stringify(params.p_result),
          params.p_rubric_version,
          params.p_graded_at,
          params.p_teacher,
        ],
      );
      data = result.rows;
    } else if (name === 'fail_frq_claim') {
      const result = await db.query(
        'select fail_frq_claim($1::uuid,$2::uuid,$3::text,$4::timestamptz) as matched',
        [params.p_ledger_id, params.p_claim_token, params.p_error, params.p_next_attempt_at],
      );
      data = result.rows[0].matched;
    } else {
      throw Object.assign(new Error(`function ${name} does not exist`), { code: '42883' });
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: normalizePgError(error) };
  }
}

function createSelectBuilder(db, table) {
  const state = { columns: '*', filters: [], updateValues: null };
  const builder = {
    update(values) {
      state.updateValues = values;
      return builder;
    },
    select(columns) {
      state.columns = columns;
      return builder;
    },
    eq(column, value) {
      state.filters.push({ kind: 'eq', column, value });
      return builder;
    },
    in(column, values) {
      state.filters.push({ kind: 'in', column, values });
      return builder;
    },
    then(onFulfilled, onRejected) {
      return executeSelect(db, table, state).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

async function executeSelect(db, table, state) {
  try {
    if (table !== 'item_ledger') throw new Error(`unsupported fixture table: ${table}`);
    if (!/^[a-z0-9_, *]+$/i.test(state.columns)) throw new Error('unsafe fixture projection');

    const params = [];
    const assignments = [];
    const clauses = [];
    if (state.updateValues) {
      for (const [column, value] of Object.entries(state.updateValues)) {
        if (!/^[a-z_]+$/i.test(column)) throw new Error('unsafe fixture update');
        params.push(value);
        assignments.push(`${column} = $${params.length}`);
      }
    }
    for (const filter of state.filters) {
      if (!/^[a-z_]+$/i.test(filter.column)) throw new Error('unsafe fixture filter');
      if (filter.kind === 'eq') {
        params.push(filter.value);
        clauses.push(`${filter.column} = $${params.length}`);
        continue;
      }

      if (!Array.isArray(filter.values) || filter.values.length === 0) {
        clauses.push('false');
        continue;
      }
      const placeholders = filter.values.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      clauses.push(`${filter.column} in (${placeholders.join(', ')})`);
    }

    const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
    if (state.updateValues) {
      if (!assignments.length) throw new Error('empty fixture update');
      const result = await db.query(
        `update item_ledger set ${assignments.join(', ')}${where} returning ${state.columns}`,
        params,
      );
      return { data: result.rows, error: null };
    }
    const result = await db.query(`select ${state.columns} from item_ledger${where}`, params);
    return { data: result.rows, error: null };
  } catch (error) {
    return { data: null, error: normalizePgError(error) };
  }
}

function normalizePgError(error) {
  const message = error && error.message ? error.message : String(error);
  let code = error && (error.code || (error.cause && error.cause.code));
  if (!code && /function .* does not exist/i.test(message)) code = '42883';
  if (!code && /column .* does not exist/i.test(message)) code = '42703';
  return {
    code,
    message,
  };
}
