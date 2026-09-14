import { afterEach, it, expect, vi } from 'vitest';
const { clientFactory } = vi.hoisted(() => ({ clientFactory: vi.fn(() => ({ storage: { from: () => ({}) } })) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: clientFactory }));
import { createLiveDb } from '../db.js';
import { createServiceClient } from '../ledger-db.js';
import { createLiveNudgesDb } from '../nudge-db.js';
import { createLiveLessonUnlockDb } from '../lesson-unlock-db.js';
import { createLiveRemediationDb } from '../remediation-db.js';
import { createLiveDiagnosticsStore } from '../worksheet-diagnostics.js';

afterEach(() => { vi.unstubAllEnvs(); clientFactory.mockClear(); });

it.each(['a2', 'a2_test'])('pins every live Supabase factory to the resolved schema %s', schema => {
  vi.stubEnv('ROSTER_SUPABASE_URL', 'https://shared-project.example');
  vi.stubEnv('ROSTER_SUPABASE_SERVICE_KEY', 'test-key');
  vi.stubEnv('ROSTER_DB_SCHEMA', schema);
  if (schema === 'a2') delete process.env.ROSTER_DB_SCHEMA;
  for (const factory of [createLiveDb, createServiceClient, createLiveNudgesDb, createLiveLessonUnlockDb, createLiveRemediationDb, createLiveDiagnosticsStore]) factory();
  expect(clientFactory).toHaveBeenCalledTimes(6);
  for (const call of clientFactory.mock.calls) {
    expect(call).toEqual(['https://shared-project.example', 'test-key', { db: { schema } }]);
  }
});
