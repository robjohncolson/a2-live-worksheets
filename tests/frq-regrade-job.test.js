import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildManifest,
  deriveWorksheetEntry,
  evaluatePromptsSource,
  extractPromptsFile,
} from '../tools/frq-regrade-manifest.mjs';
import {
  buildGraderRequest,
  buildPrompt,
  buildRegradeRequest,
  classifyUngradedFrqRows,
  loadRubricBundle,
  MINIMUM_ROW_AGE_MS,
  parseArgs,
  runRegradeJob,
  selectUngradedFrqRows,
  verdictToScore,
} from '../tools/regrade-ungraded-frqs.mjs';
import { buildServerReflectionPrompt } from '../roster-server/frq-prompt.js';

const ROOT = resolve(import.meta.dirname, '..');
const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const REGISTRY = JSON.parse(readFileSync(
  resolve(ROOT, 'roster-server/data/frq-rubrics.SY2627.json'),
  'utf8',
));

function deriveRealWorksheet(filename) {
  const html = readFileSync(resolve(ROOT, filename), 'utf8');
  const promptsFile = extractPromptsFile(html, filename);
  const promptsSource = readFileSync(resolve(ROOT, promptsFile), 'utf8');
  return {
    entry: deriveWorksheetEntry({ filename, html, promptsSource }),
    promptsSource,
  };
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

function snapshotWith(records) {
  return {
    students: [{
      studentId: 'sid-1',
      username: 'amy',
      bundle: { records },
    }],
  };
}

function eligibleRecord(overrides = {}) {
  return {
    source: 'frq',
    itemId: 'WS-U1L2-reflect1',
    score: null,
    response: 'This old response is long enough to send to the grader.',
    recorded_at: '2026-08-19T11:30:00.000Z',
    ...overrides,
  };
}

function runApplyJob(fetchMock, options = {}) {
  return runRegradeJob({
    config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
    registry: options.registry || REGISTRY,
    railwayServerUrl: 'https://grader.test',
    apply: true,
    fetchImpl: fetchMock,
    now: NOW,
    rootDir: ROOT,
    rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    onEvent: options.onEvent,
  });
}



describe('pure regrade job decisions', () => {
  it('maps tolerant E/P/I verdicts, promotes complete P, and skips junk', () => {
    expect(verdictToScore('Essentially correct')).toBe(1);
    expect(verdictToScore(' partially correct ')).toBe(0.5);
    expect(verdictToScore('incorrect')).toBe(0);
    expect(verdictToScore({ score: 'P', missing: [] })).toBe(1);
    expect(verdictToScore({ score: 'P', missing: ['one idea'] })).toBe(0.5);
    expect(verdictToScore('maybe')).toBeNull();
    expect(verdictToScore(null)).toBeNull();
  });

  it('selects only old, long, null-score FRQs with an exact manifest itemId', () => {
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {}, reflect2: {} },
        },
      },
    };
    const old = '2026-08-19T11:30:00.000Z';
    const young = '2026-08-19T11:55:00.000Z';
    const long = 'This response is definitely at least twenty characters.';
    const records = [
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect2', response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: 0, response: long, recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: 'too short', recorded_at: old },
      { source: 'frq', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: young },
      { source: 'frq', itemId: 'WS-U1L2-not-a-reflection', score: null, response: long, recorded_at: old },
      { source: 'worksheet', itemId: 'WS-U1L2-reflect1', score: null, response: long, recorded_at: old },
    ];

    const selected = selectUngradedFrqRows(snapshotWith(records), registry, { now: NOW });
    expect(selected.map((row) => row.itemId)).toEqual([
      'WS-U1L2-reflect1',
      'WS-U1L2-reflect2',
    ]);
  });

  it('requires a finite timestamp and honors the exact ten-minute boundary', () => {
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {} },
        },
      },
    };
    const exactlyTenMinutes = new Date(NOW - MINIMUM_ROW_AGE_MS).toISOString();
    const justUnderTenMinutes = new Date(NOW - MINIMUM_ROW_AGE_MS + 1).toISOString();
    const classified = classifyUngradedFrqRows(snapshotWith([
      eligibleRecord({ recorded_at: undefined }),
      eligibleRecord({ recorded_at: 'not-a-timestamp' }),
      eligibleRecord({ recorded_at: exactlyTenMinutes }),
      eligibleRecord({ recorded_at: justUnderTenMinutes }),
    ]), registry, { now: NOW });

    expect(classified.candidates.map((row) => row.record.recorded_at)).toEqual([
      exactlyTenMinutes,
    ]);
    expect(classified.invalidTimestamps).toHaveLength(2);
    expect(classified.unknownItems).toHaveLength(0);
  });

  it('classifies extra-hyphen and page-only item IDs as unknown without response text', () => {
    const registry = {
      worksheets: {
        'WS-U1L2': {
          filename: 'u1_lesson2_live.html',
          items: { reflect1: {} },
        },
      },
    };
    const classified = classifyUngradedFrqRows(snapshotWith([
      eligibleRecord({ itemId: 'WS-U4L1-2-Q1' }),
      eligibleRecord({ itemId: 'WS-U1L2-reflectNew' }),
    ]), registry, { now: NOW });

    expect(classified.candidates).toHaveLength(0);
    expect(classified.unknownItems.map((row) => row.itemId)).toEqual([
      'WS-U4L1-2-Q1',
      'WS-U1L2-reflectNew',
    ]);
    expect(classified.unknownItems.every((row) => !Object.hasOwn(row, 'response'))).toBe(true);
  });

  it('builds the exact grader and roster request shapes', () => {
    const worksheet = {
      topic: 'Algebra 2 - Variables',
      contextName: 'LESSON_CONTEXT_U1L2',
    };
    const graderBody = buildGraderRequest(
      worksheet,
      'reflect2',
      'student answer',
      'full prompt',
      { unit: 1 },
    );
    expect(graderBody).toEqual({
      scenario: {
        topic: 'Algebra 2 - Variables',
        questionId: 'reflect2',
        lessonContext: { unit: 1 },
      },
      answers: { answer: 'student answer' },
      prompt: 'full prompt',
    });

    expect(buildRegradeRequest({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      attempt: 1,
      response: '  student answer  ',
    }, 0.5, REGISTRY)).toEqual({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      score: 0.5,
      provenance: 'ai-batch',
      responseHash: createHash('sha256').update('student answer', 'utf8').digest('hex'),
      rubricVersion: `${REGISTRY.schoolYear}:${REGISTRY.sourceDigest.replace(/^sha256:/, '')}`,
    });
  });

  it('carries the grader feedback (trimmed, capped) so the student sees WHY, and omits it when absent', () => {
    const candidate = { studentId: 'sid-1', itemId: 'WS-U1L2-reflect2', attempt: 1, response: 'student answer' };
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY, { score: 'P', feedback: '  Name the variable type.  ' }).feedback)
      .toBe('Name the variable type.');
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY, { score: 'P', feedback: 'x'.repeat(5000) }).feedback)
      .toHaveLength(2000);
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY, { score: 'P', feedback: '   ' })).not.toHaveProperty('feedback');
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY, { score: 'P', feedback: 42 })).not.toHaveProperty('feedback');
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY, null)).not.toHaveProperty('feedback');
    expect(buildRegradeRequest(candidate, 0.5, REGISTRY)).not.toHaveProperty('feedback');
  });
});

describe('regrade job HTTP flow', () => {
  it('uses mocked snapshot, grader, and roster calls without network access', async () => {
    const entry = REGISTRY.worksheets['WS-U1L2'];
    const studentAnswer = 'The values are labels for locations, not measurements that should be averaged.';
    const snapshot = snapshotWith([{
      source: 'frq',
      itemId: 'WS-U1L2-reflect2',
      score: null,
      response: studentAnswer,
      attempt: 1,
      recorded_at: '2026-08-19T11:30:00.000Z',
    }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshot))
      .mockResolvedValueOnce(response(200, {
        score: 'P', feedback: 'Complete.', matched: ['labels'], missing: [],
      }))
      .mockResolvedValueOnce(response(200, { ok: true, applied: true, score: 1 }));
    const rateLimiter = { wait: vi.fn().mockResolvedValue(undefined) };

    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test/', teacherKey: 'teacher-secret' },
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
      apply: true,
      now: NOW,
      rootDir: ROOT,
      fetchImpl: fetchMock,
      rateLimiter,
    });

    expect(result.summary).toMatchObject({
      found: 1, graded: 1, applied: 1, floorHeld: 0, failed: 0, grader5xx: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://roster.test/admin/snapshot',
      { headers: { 'x-teacher-secret': 'teacher-secret' } },
    ]);

    const [graderUrl, graderOptions] = fetchMock.mock.calls[1];
    expect(graderUrl).toBe('https://grader.test/api/ai/grade');
    expect(JSON.parse(graderOptions.body)).toMatchObject({
      scenario: {
        topic: entry.topic,
        questionId: 'reflect2',
      },
      answers: { answer: studentAnswer },
    });
    expect(JSON.parse(graderOptions.body).prompt).toBe(
      buildServerReflectionPrompt(REGISTRY, 'WS-U1L2', 'reflect2', studentAnswer),
    );
    expect(JSON.parse(graderOptions.body).scenario.lessonContext).toEqual(entry.lessonContext);

    const [rosterUrl, rosterOptions] = fetchMock.mock.calls[2];
    expect(rosterUrl).toBe('https://roster.test/ledger/frq-regrade');
    expect(rosterOptions.headers['x-teacher-secret']).toBe('teacher-secret');
    expect(JSON.parse(rosterOptions.body)).toEqual({
      studentId: 'sid-1',
      itemId: 'WS-U1L2-reflect2',
      score: 1,
      provenance: 'ai-batch',
      responseHash: createHash('sha256').update(studentAnswer.trim(), 'utf8').digest('hex'),
      rubricVersion: `${REGISTRY.schoolYear}:${REGISTRY.sourceDigest.replace(/^sha256:/, '')}`,
      feedback: 'Complete.',   // 2026-09-09: the verdict's feedback reaches the ledger
      matched: ['labels'],
      missing: [],
    });
    expect(result.exitCode).toBe(0);
  });

  it('makes only the snapshot call in default dry-run mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, snapshotWith([])));
    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
      fetchImpl: fetchMock,
      now: NOW,
    });
    expect(result.summary.mode).toBe('dry-run');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a non-zero exit code when the grader returns 5xx', async () => {
    const long = 'This old response is long enough to send to the grader.';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([{
        source: 'frq', itemId: 'WS-U1L2-reflect1', score: null,
        response: long, recorded_at: '2026-08-19T11:30:00.000Z',
      }])))
      .mockResolvedValueOnce(response(503, { error: 'unavailable' }));

    const result = await runRegradeJob({
      config: { rosterUrl: 'https://roster.test', teacherKey: 'teacher-secret' },
      registry: REGISTRY,
      railwayServerUrl: 'https://grader.test',
      apply: true,
      fetchImpl: fetchMock,
      now: NOW,
      rootDir: ROOT,
      rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    });
    expect(result.summary).toMatchObject({ failed: 1, grader5xx: true });
    expect(result.exitCode).toBe(1);
  });

  it('returns a non-zero exit code when the grader returns 4xx', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(400, { error: 'bad request' }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary).toMatchObject({ failed: 1, grader5xx: false });
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['an unusable verdict', response(200, { score: 'unknown' })],
    ['an unparseable verdict', {
      status: 200,
      ok: true,
      async json() { throw new Error('invalid JSON'); },
    }],
  ])('returns a non-zero exit code for %s', async (_name, graderResponse) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(graderResponse);

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('returns a non-zero exit code when prompt construction throws', async () => {
    const registry = structuredClone(REGISTRY);
    const item = registry.worksheets['WS-U1L2'].items.reflect1;
    const promptBeforeAnswer = item.promptBeforeAnswer;
    let reads = 0;
    Object.defineProperty(item, 'promptBeforeAnswer', {
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 1) return promptBeforeAnswer;
        throw new Error('synthetic prompt build failure');
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])));

    const result = await runApplyJob(fetchMock, { registry });
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])('returns a non-zero exit code when roster apply returns HTTP %i', async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'E' }))
      .mockResolvedValueOnce(response(status, { error: 'apply failed' }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('counts an authoritative stale-response 409 as a non-failing skip', async () => {
    const events = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'E' }))
      .mockResolvedValueOnce(response(409, { error: 'stale-response' }));

    const result = await runApplyJob(fetchMock, { onEvent: (event) => events.push(event) });

    expect(result.summary).toMatchObject({
      graded: 1,
      applied: 0,
      floorHeld: 0,
      stale: 1,
      failed: 0,
    });
    expect(result.exitCode).toBe(0);
    expect(events.at(-1)).toMatchObject({
      type: 'stale-response',
      reason: 'student response changed after the snapshot',
    });
  });

  it('counts an authoritative 200 applied:false response as floor-held', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'P', missing: ['one idea'] }))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        applied: false,
        ledgerId: 'ledger-1',
        score: 0.5,
      }));

    const result = await runApplyJob(fetchMock);

    expect(result.summary).toMatchObject({
      graded: 1,
      applied: 0,
      floorHeld: 1,
      stale: 0,
      failed: 0,
    });
    expect(result.exitCode).toBe(0);
  });

  it('returns a non-zero exit code for a malformed apply response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord()])))
      .mockResolvedValueOnce(response(200, { score: 'E' }))
      .mockResolvedValueOnce(response(200, { ok: true }));

    const result = await runApplyJob(fetchMock);
    expect(result.summary.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('reports an unknown item without grading it and returns a non-zero exit code', async () => {
    const itemId = 'WS-U4L1-2-Q1';
    const events = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([eligibleRecord({ itemId })])));

    const result = await runApplyJob(fetchMock, { onEvent: (event) => events.push(event) });
    expect(result.summary).toMatchObject({ found: 0, failed: 0, unknownItems: 1 });
    expect(result.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{
      type: 'unknown-item',
      username: 'amy',
      itemId,
      reason: 'itemId is not present in the FRQ rubric bundle',
    }]);
    expect(events[0]).not.toHaveProperty('response');
  });

  it('loudly quarantines malformed timestamps and returns a non-zero exit code', async () => {
    const events = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, snapshotWith([
      eligibleRecord({ recorded_at: undefined }),
      eligibleRecord({ recorded_at: 'invalid' }),
    ])));

    const result = await runApplyJob(fetchMock, { onEvent: (event) => events.push(event) });
    expect(result.summary).toMatchObject({
      found: 0,
      failed: 0,
      unknownItems: 0,
      invalidTimestamps: 2,
    });
    expect(result.exitCode).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      'invalid-timestamp',
      'invalid-timestamp',
    ]);
    expect(events.every((event) => !Object.hasOwn(event, 'response'))).toBe(true);
  });
});

describe('config sources (GitHub Actions hourly sweep)', () => {
  it('env APSTATS_ROSTER_URL / APSTATS_TEACHER_KEY wins over the config file', async () => {
    const { loadConfig } = await import('../tools/regrade-ungraded-frqs.mjs');
    const config = loadConfig('/nonexistent/config.json', {
      APSTATS_ROSTER_URL: 'https://roster.example',
      APSTATS_TEACHER_KEY: 'k',
    });
    expect(config).toEqual({ rosterUrl: 'https://roster.example', teacherKey: 'k' });
  });
  it('falls back to the file when the env pair is incomplete', async () => {
    const { loadConfig } = await import('../tools/regrade-ungraded-frqs.mjs');
    expect(() => loadConfig('/nonexistent/config.json', { APSTATS_ROSTER_URL: 'x' })).toThrow();
  });
  it('the workflow is hourly, gated on the secret, and calls the job with --apply', () => {
    const yml = readFileSync(resolve(ROOT, '.github/workflows/frq-regrade.yml'), 'utf8');
    expect(yml).toMatch(/cron: '37 \* \* \* \*'/);
    expect(yml).toMatch(/APSTATS_TEACHER_KEY: \$\{\{ secrets\.APSTATS_TEACHER_KEY \}\}/);
    expect(yml).toMatch(/if \[ -z "\$APSTATS_TEACHER_KEY" \]; then/);
    expect(yml).toContain('args+=(--apply)');
    expect(yml).toContain('node tools/regrade-ungraded-frqs.mjs "${args[@]}"');
    expect(yml).toContain("github.event_name == 'workflow_dispatch' && inputs.backfill_feedback");
    expect(yml).toMatch(/backfill_feedback:[\s\S]*?type: boolean\s+default: false/);
    expect(yml).toMatch(/concurrency:\s*\n\s*group: frq-regrade/);
  });
});

describe('grader retry + exit policy (2026-09-11 — one flaky 500 must not fail the hourly run)', () => {
  const row = (itemId) => ({
    source: 'frq', itemId, score: null, attempt: 1,
    response: 'The values are labels for locations, not measurements that should be averaged.',
    recorded_at: '2026-08-19T11:30:00.000Z',
  });
  const base = (fetchMock) => ({
    config: { rosterUrl: 'https://roster.test/', teacherKey: 'teacher-secret' },
    registry: REGISTRY, railwayServerUrl: 'https://grader.test', apply: true, now: NOW, rootDir: ROOT,
    fetchImpl: fetchMock, rateLimiter: { wait: vi.fn().mockResolvedValue(undefined) }, sleep: vi.fn().mockResolvedValue(undefined),
  });

  it('retries a grader 500 with backoff and then applies the verdict (exit 0)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([row('WS-U1L2-reflect2')])))
      .mockResolvedValueOnce(response(500, { error: 'Empty response from deepseek' }))
      .mockResolvedValueOnce(response(200, { score: 'P', feedback: 'ok', matched: [], missing: ['x'] }))
      .mockResolvedValueOnce(response(200, { ok: true, applied: true, score: 0.5 }));
    const opts = base(fetchMock);
    const events = [];
    const result = await runRegradeJob({ ...opts, onEvent: (e) => events.push(e) });
    expect(result.summary).toMatchObject({ found: 1, graded: 1, applied: 1, failed: 0, retried: 1, grader5xx: true });
    expect(opts.sleep).toHaveBeenCalledWith(2000);
    expect(events.find((e) => e.type === 'retry')).toMatchObject({ attempt: 2, backoffMs: 2000 });
    expect(result.exitCode).toBe(0);
  });

  it('a row that fails every attempt is reported but does NOT fail the run when others got through', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([row('WS-U1L2-reflect1'), row('WS-U1L2-reflect2')])))
      // row 1: three 500s
      .mockResolvedValueOnce(response(500, { error: 'Empty response from deepseek' }))
      .mockResolvedValueOnce(response(500, { error: 'Empty response from deepseek' }))
      .mockResolvedValueOnce(response(500, { error: 'Empty response from deepseek' }))
      // row 2: fine
      .mockResolvedValueOnce(response(200, { score: 'E', feedback: 'ok', matched: [], missing: [] }))
      .mockResolvedValueOnce(response(200, { ok: true, applied: true, score: 1 }));
    const result = await runRegradeJob(base(fetchMock));
    expect(result.summary).toMatchObject({ found: 2, applied: 1, failed: 1, transientFailures: 1, retried: 2 });
    expect(result.exitCode).toBe(0);
  });

  it('a total wipe-out (every candidate failed) still fails the run (exit 1)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([row('WS-U1L2-reflect2')])))
      .mockResolvedValueOnce(response(500, { error: 'x' }))
      .mockResolvedValueOnce(response(500, { error: 'x' }))
      .mockResolvedValueOnce(response(500, { error: 'x' }));
    const result = await runRegradeJob(base(fetchMock));
    expect(result.summary).toMatchObject({ found: 1, failed: 1, transientFailures: 1 });
    expect(result.exitCode).toBe(1);
  });

  it('does not burn retries on a 4xx (not transient)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, snapshotWith([row('WS-U1L2-reflect2')])))
      .mockResolvedValueOnce(response(400, { error: 'bad prompt' }));
    const result = await runRegradeJob(base(fetchMock));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({ failed: 1, retried: 0, transientFailures: 0 });
    expect(result.exitCode).toBe(1);
  });
});
