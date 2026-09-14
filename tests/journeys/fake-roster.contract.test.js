/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { createFakeRoster } from './fake-roster.js';

const URL = 'https://roster.test/ledger/record';
const TRAINER_URL = 'https://roster.test/flashcards/state';
const PRODUCTION_TRAINER_ALLOWLIST = [
  'ap-stats-formulas',
  'joyo-kanji',
  'jlpt-n5',
  'formula-lab',
];
const JOURNEY_TRAINER_ALLOWLIST = [...PRODUCTION_TRAINER_ALLOWLIST, 'ap-stats-flashcards'];
const VALID_BODY = {
  token: 'token:alpha_otter',
  source: 'worksheet',
  itemId: 'WS-U1-L1-DESK_DONE',
  response: { selfAttest: 'worksheet' },
  attempt: 1,
};

async function post(fake, body) {
  const response = await fake.fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function trainerRequest(fake, method, {
  body,
  headers,
  url = TRAINER_URL,
} = {}) {
  const response = await fake.fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function createTrainerFake() {
  return createFakeRoster({ trainerAllowlist: JOURNEY_TRAINER_ALLOWLIST });
}

describe('fake-roster POST /ledger/record production contract', () => {
  it('uses production invalid-token responses for missing and unknown tokens', async () => {
    const fake = createFakeRoster();

    await expect(post(fake, { ...VALID_BODY, token: undefined })).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'invalid token' },
    });
    await expect(post(fake, { ...VALID_BODY, token: 'token:not-a-user' })).resolves.toEqual({
      status: 401,
      body: { ok: false, error: 'invalid token' },
    });
  });

  it.each([
    ['source', { ...VALID_BODY, source: undefined }],
    ['itemId', { ...VALID_BODY, itemId: undefined }],
    ['response', { ...VALID_BODY, response: undefined }],
  ])('rejects a missing required %s with the production 400 error', async (_field, body) => {
    const fake = createFakeRoster();
    await expect(post(fake, body)).resolves.toEqual({
      status: 400,
      body: { ok: false, error: 'source, itemId, and response are required' },
    });
    expect(fake.state.ledgerRecords).toEqual([]);
  });

  it('records a valid payload only after validation succeeds', async () => {
    const fake = createFakeRoster();
    await expect(post(fake, VALID_BODY)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, ledgerId: 'ledger-1' },
    });
    expect(fake.state.ledgerRecords).toEqual([VALID_BODY]);
  });
});

describe('fake-roster /flashcards/state production contract', () => {
  it('keeps student blobs isolated and returns the exact saved timestamp', async () => {
    const fake = createFakeRoster();
    const headers = { Authorization: 'Bearer token:alpha_otter' };
    expect(await trainerRequest(fake, 'GET')).toEqual({ status: 401, body: { ok: false, error: 'forbidden' } });
    expect(await trainerRequest(fake, 'GET', { headers })).toEqual({ status: 200, body: { ok: true, found: false } });
    const state = { v: 1, e: [['round-a', 0]] };
    const saved = await trainerRequest(fake, 'PUT', { headers, body: { state, baseUpdatedAt: null } });
    expect(saved.status).toBe(200);
    expect(await trainerRequest(fake, 'GET', { headers })).toEqual({ status: 200, body: { ok: true, found: true, state, updatedAt: saved.body.updatedAt } });
    expect(await trainerRequest(fake, 'GET', { headers: { Authorization: 'Bearer token:beta_fox' } })).toEqual({ status: 200, body: { ok: true, found: false } });
  });
  it('requires authentication for writes and rejects stale first and subsequent writes', async () => {
    const fake = createFakeRoster();
    const body = { token: 'token:alpha_otter', state: { v: 1 }, baseUpdatedAt: null };
    expect((await trainerRequest(fake, 'PUT', { body: { ...body, token: 'invalid' } })).status).toBe(401);
    const first = await trainerRequest(fake, 'PUT', { body });
    expect(first.status).toBe(200);
    expect((await trainerRequest(fake, 'PUT', { body })).status).toBe(409);
    expect((await trainerRequest(fake, 'PUT', { body: { ...body, baseUpdatedAt: first.body.updatedAt } })).status).toBe(200);
    expect((await trainerRequest(fake, 'PUT', { body: { ...body, baseUpdatedAt: first.body.updatedAt } })).status).toBe(409);
  });
  it('enforces the practice-state cap and rejects arrays', async () => {
    const fake = createFakeRoster();
    const body = { token: 'token:alpha_otter', baseUpdatedAt: null };
    expect((await trainerRequest(fake, 'PUT', { body: { ...body, state: [] } })).status).toBe(400);
    expect((await trainerRequest(fake, 'PUT', { body: { ...body, state: { text: 'é'.repeat(262144) } } })).status).toBe(413);
    expect(fake.state.trainerStates.size).toBe(0);
  });
});
