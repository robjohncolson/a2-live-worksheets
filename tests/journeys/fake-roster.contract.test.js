/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { createFakeRoster } from './fake-roster.js';

const URL = 'https://roster.test/ledger/record';
const TRAINER_URL = 'https://roster.test/flashcards/state';
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
    expect(fake.state.flashcardStates.size).toBe(0);
  });
});


describe('fake-roster A2 retained routes', () => {
  it('serves scripted lessons, announcements, and C/D/G sections', async () => {
    const lessons = [{ key: '1-1', title: 'Linear equations', published: true }];
    const fake = createFakeRoster({ lessons });
    expect(await (await fake.fetch('https://roster.test/lessons')).json())
      .toEqual({ ok: true, lessons });
    expect(await (await fake.fetch('https://roster.test/announcement')).json())
      .toEqual({ text: null });
    expect(await (await fake.fetch('https://roster.test/roster/open-sections')).json())
      .toEqual({ ok: true, sections: ['C', 'D', 'G'].map(section => ({ value: section, label: section })) });
  });

  it('does not route trainer PATCH or removed classroom poll archives', async () => {
    const fake = createFakeRoster();
    for (const [method, path] of [
      ['PATCH', '/flashcards/state'],
      ['GET', '/trainer/state/ap-stats-flashcards'],
      ['GET', '/poll-archive'],
      ['GET', '/teacher/student/stu-alpha/poll-archive'],
    ]) {
      expect(fake.handles(method, path)).toBe(false);
      expect((await fake.fetch(`https://roster.test${path}`, { method })).status).toBe(404);
    }
  });
});

describe('fake-roster flashcard CAS details', () => {
  it('matches auth and validation errors without creating state', async () => {
    const fake = createFakeRoster();
    expect(await trainerRequest(fake, 'PUT', { body: { state: {}, baseUpdatedAt: null } }))
      .toEqual({ status: 401, body: { ok: false, error: 'forbidden' } });
    const token = 'token:alpha_otter';
    for (const state of [null, [], 'bad']) {
      expect(await trainerRequest(fake, 'PUT', { body: { token, state, baseUpdatedAt: null } }))
        .toEqual({ status: 400, body: { ok: false, error: 'state must be a JSON object' } });
    }
    for (const baseUpdatedAt of [undefined, 0, '', 'bad']) {
      expect(await trainerRequest(fake, 'PUT', { body: { token, state: {}, baseUpdatedAt } }))
        .toEqual({ status: 400, body: { ok: false, error: 'baseUpdatedAt must be null or a timestamp' } });
    }
    expect(fake.state.flashcardStates.size).toBe(0);
  });

  it('uses query auth, marks private reads no-store, and preserves state on stale writes', async () => {
    const fake = createFakeRoster();
    const url = `${TRAINER_URL}?token=token:alpha_otter`;
    const state = { v: 1, e: [['algebra-round', 0]] };
    const first = await trainerRequest(fake, 'PUT', { url, body: { state, baseUpdatedAt: null } });
    expect(first.status).toBe(200);
    expect(await trainerRequest(fake, 'PUT', { url, body: { state: {}, baseUpdatedAt: null } }))
      .toEqual({ status: 409, body: { ok: false, error: 'stale' } });
    const response = await fake.fetch(url);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, found: true, state, updatedAt: first.body.updatedAt });
    const second = await trainerRequest(fake, 'PUT', {
      url, body: { state: { v: 2 }, baseUpdatedAt: first.body.updatedAt },
    });
    expect(second.status).toBe(200);
    expect(Date.parse(second.body.updatedAt)).toBeGreaterThan(Date.parse(first.body.updatedAt));
    expect(fake.state.flashcardStates.get('stu-alpha').state).toEqual({ v: 2 });
    expect(fake.state.ledgerRecords).toEqual([]);
  });
});
