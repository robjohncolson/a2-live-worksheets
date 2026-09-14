const DEFAULT_USERS = [
  {
    studentId: 'stu-alpha',
    username: 'alpha_otter',
    realName: 'Alpha Otter',
    section: 'PeriodX',
    role: 'student',
    password: '1234',
    spriteHue: 42,
  },
  {
    studentId: 'stu-beta',
    username: 'beta_fox',
    realName: 'Beta Fox',
    section: 'PeriodX',
    role: 'student',
    password: '1234',
    spriteHue: 210,
  },
  {
    studentId: 'teacher-one',
    username: 'teacher_one',
    realName: 'Teacher One',
    section: 'PeriodX',
    role: 'teacher',
    password: 'teacher-pass',
    spriteHue: 0,
  },
];

const STATIC_ROUTE_KEYS = new Set([
  'GET /announcement',
  'GET /lessons',
  'POST /roster/verify',
  'GET /roster/open-sections',
  'GET /roster/list',
  'POST /roster/change-password',
  'GET /grade',
  'GET /grade/offline-inputs',
  'GET /receipts/issuer',
  'GET /donow',
  'POST /ledger/record',
  'GET /poll-archive',
  'GET /class/review-queue',
  'GET /class/review-by-item',
  'POST /class/review',
  'GET /class/grades',
]);

const TRAINER_DECK_ID_RE = /^[a-z0-9-]{1,64}$/;
const TRAINER_STATE_MAX_CHARS = 262_144;
const DEFAULT_TRAINER_DECK_ALLOWLIST = [
  'ap-stats-formulas',
  'joyo-kanji',
  'jlpt-n5',
  'formula-lab',
];

function isStaticRoute(method, path) {
  if (STATIC_ROUTE_KEYS.has(`${method} ${path}`)) return true;
  if (method === 'GET' && /^\/roster\/section\/[^/]+$/.test(path)) return true;
  if (method === 'GET' && /^\/teacher\/student\/[^/]+\/profile$/.test(path)) return true;
  if (method === 'GET' && /^\/teacher\/student\/[^/]+\/(grade|donow|poll-archive)$/.test(path)) return true;
  if (method === 'GET' && /^\/ledger\/student\/[^/]+$/.test(path)) return true;
  if (/^(GET|PUT)$/.test(method) && path === '/flashcards/state') return true;
  return method === 'GET' && /^\/class\/review-item\/[^/]+$/.test(path);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function normalizeUser(user, index) {
  const username = String(user.username || `student_${index + 1}`);
  return {
    studentId: user.studentId || `stu-${index + 1}`,
    username,
    realName: user.realName || username,
    section: user.section || 'PeriodX',
    role: user.role || 'student',
    password: user.password == null ? '1234' : String(user.password),
    spriteHue: typeof user.spriteHue === 'number' ? user.spriteHue : null,
    mustChangePassword: !!user.mustChangePassword,
  };
}

function defaultGrade() {
  return {
    ok: true,
    asOf: '2026-08-18T12:00:00.000Z',
    units: [],
    quarters: {},
    completion: {},
    lessons: [],
    gradebook: {},
  };
}

function defaultDoNow() {
  return {
    ok: true,
    nextTask: {
      unit: 'U1',
      lesson: '1.1',
      activity: 'worksheet',
      source: 'worksheet',
      progress: { done: 0, total: 1 },
      reason: 'earliest-incomplete',
    },
    lessons: [
      {
        unit: 'U1',
        lesson: '1.1',
        lessonState: 'none',
        activities: [{ activity: 'worksheet', done: 0, total: 1, state: 'none' }],
        selfDone: false,
        selfDoneArtifacts: [],
      },
    ],
    units: [],
    earlierGapFlag: false,
  };
}

function scriptedValue(source, user, fallback, request) {
  if (typeof source === 'function') return source(user, request);
  if (source instanceof Map) {
    return source.get(user && user.studentId) ?? source.get(user && user.username) ?? source.get('default') ?? fallback;
  }
  if (source && typeof source === 'object') {
    if (Object.prototype.hasOwnProperty.call(source, 'ok')) return source;
    return source[user && user.studentId] ?? source[user && user.username] ?? source.default ?? fallback;
  }
  return source == null ? fallback : source;
}

async function requestBody(input, init) {
  let text = init && init.body;
  if (text == null && input && typeof input === 'object' && typeof input.clone === 'function') {
    try { text = await input.clone().text(); } catch (_) { text = null; }
  }
  if (text == null || text === '') return null;
  if (typeof text !== 'string') return text;
  try { return JSON.parse(text); } catch (_) { return text; }
}

function requestHeaders(input, init) {
  const headers = new Headers((init && init.headers) || (input && input.headers) || {});
  return Object.fromEntries(headers.entries());
}

function resolveRequestUser(state, url, request) {
  const auth = request.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const token = bearer || url.searchParams.get('token') || (request.body && request.body.token);
  if (!token) return null;
  return state.users.find((user) => state.tokenFor(user) === token) || null;
}

async function responseFromOverride(override, request, state) {
  const value = typeof override === 'function' ? await override(request, state) : override;
  if (value instanceof Response) return value;
  if (value && typeof value === 'object' && ('body' in value || 'status' in value)) {
    return jsonResponse(value.body ?? null, value.status || 200, value.headers || {});
  }
  return jsonResponse(value == null ? { ok: true } : value);
}

function mergeTrainerState(current, delta) {
  const merged = { ...(current || {}), ...(delta || {}) };
  if ((current && current.srs) || (delta && delta.srs)) {
    merged.srs = { ...((current && current.srs) || {}), ...((delta && delta.srs) || {}) };
  }
  if (typeof current?.resetRev === 'number' || typeof delta?.resetRev === 'number') {
    merged.resetRev = Math.max(Number(current?.resetRev || 0), Number(delta?.resetRev || 0));
  }
  return merged;
}

/**
 * In-memory implementation of the roster-server surfaces used by Desk journeys.
 * Mutate `fake.state` between steps, or provide `routes`/`failures` handlers, to
 * script a journey. Reuse one fake across two `bootDesk` calls for cross-device
 * tests; ledger and trainer state are deliberately shared by the fake instance.
 */
export function createFakeRoster(initial = {}) {
  const users = (initial.users || DEFAULT_USERS).map(normalizeUser);
  const state = {
    users,
    requests: [],
    inflight: 0,
    unhandledRequests: [],
    ledgerRecords: [],
    ledgerByStudentId: initial.ledgerByStudentId || new Map(),
    trainerStates: initial.trainerStates || new Map(),
    trainerAllowlist: new Set(
      initial.trainerAllowlist
        || initial.trainerDeckAllowlist
        || DEFAULT_TRAINER_DECK_ALLOWLIST,
    ),
    trainerWriteSequence: Number(initial.trainerWriteSequence) || 0,
    grades: initial.grades ?? initial.grade ?? {},
    donow: initial.donow ?? {},
    classData: initial.classData || {},
    routes: initial.routes || {},
    failures: initial.failures || {},
    now: initial.now || '2026-08-18T12:00:00.000Z',
    tokenFor(user) {
      return `token:${user.username}`;
    },
    userByUsername(username) {
      const wanted = String(username || '').toLowerCase();
      return this.users.find((user) => user.username.toLowerCase() === wanted) || null;
    },
    userByStudentId(studentId) {
      return this.users.find((user) => user.studentId === studentId) || null;
    },
    passwordFor(username) {
      return this.userByUsername(username)?.password || null;
    },
  };

  function nextTrainerUpdatedAt() {
    const base = Date.parse(state.now);
    const updatedAt = new Date(base + state.trainerWriteSequence).toISOString();
    state.trainerWriteSequence += 1;
    return updatedAt;
  }

  function handles(method, path) {
    const routeKey = `${String(method).toUpperCase()} ${path}`;
    if (Object.prototype.hasOwnProperty.call(state.routes, routeKey)) return true;
    if (Object.prototype.hasOwnProperty.call(state.failures, routeKey)) return true;
    if (Object.prototype.hasOwnProperty.call(state.classData, routeKey)) return true;
    return isStaticRoute(String(method).toUpperCase(), path);
  }

  async function fetch(input, init = {}) {
    state.inflight += 1;
    try {
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const url = new URL(rawUrl, 'https://roster.test');
      const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      const body = await requestBody(input, init);
      const headers = requestHeaders(input, init);
      const request = { method, url: url.href, path: url.pathname, headers, body };
      state.requests.push(request);

      const routeKey = `${method} ${url.pathname}`;
      if (!handles(method, url.pathname)) {
        state.unhandledRequests.push(request);
        return jsonResponse(
          { ok: false, error: 'not-found' },
          404,
          { 'X-Journey-Unhandled': 'true' },
        );
      }

      const failure = state.failures[routeKey];
      if (failure) {
        if (failure === 'network') throw new TypeError(`Fake network failure: ${routeKey}`);
        if (typeof failure === 'function') return await responseFromOverride(failure, request, state);
        const status = typeof failure === 'number' ? failure : 503;
        return jsonResponse({ ok: false, error: 'scripted-failure' }, status);
      }

      const override = state.routes[routeKey];
      if (override !== undefined) return await responseFromOverride(override, request, state);

      if (method === 'GET' && url.pathname === '/lessons') return jsonResponse({ ok: true, lessons: initial.lessons || [] });
      if (method === 'GET' && url.pathname === '/announcement') return jsonResponse({ text: null });

    if (method === 'POST' && url.pathname === '/roster/verify') {
      const user = state.userByUsername(body && body.username);
      if (!user || String(body && body.password) !== user.password) {
        return jsonResponse({ ok: false, error: 'Invalid username or password' }, 401);
      }
      return jsonResponse({
        ok: true,
        studentId: user.studentId,
        username: user.username,
        realName: user.realName,
        section: user.section,
        token: state.tokenFor(user),
        role: user.role,
        spriteHue: user.spriteHue,
        mustChangePassword: user.mustChangePassword,
      });
    }

    if (method === 'GET' && url.pathname === '/roster/open-sections') {
      return jsonResponse({ ok: true, sections: [{ value: 'PeriodX', label: 'Period X' }] });
    }

    if (method === 'GET' && url.pathname.startsWith('/roster/section/')) {
      const section = decodeURIComponent(url.pathname.slice('/roster/section/'.length));
      const students = state.users
        .filter((user) => user.role === 'student' && user.section === section)
        .map(({ username, realName, section: studentSection }) => ({ username, realName, section: studentSection }));
      return jsonResponse({ ok: true, students });
    }

    if (method === 'GET' && url.pathname === '/roster/list') {
      return jsonResponse({
        ok: true,
        students: state.users.map(({ studentId, username, realName, section, role, spriteHue }) => ({
          studentId, username, realName, section, role, spriteHue,
        })),
      });
    }

    if (method === 'POST' && url.pathname === '/roster/change-password') {
      const user = resolveRequestUser(state, url, request);
      if (!user) return jsonResponse({ ok: false, error: 'Not signed in' }, 401);
      user.password = String(body.newPassword || '');
      user.mustChangePassword = false;
      return jsonResponse({ ok: true });
    }

    if (method === 'GET' && url.pathname.startsWith('/teacher/student/') && url.pathname.endsWith('/profile')) {
      const studentId = decodeURIComponent(url.pathname.split('/')[3]);
      const user = state.userByStudentId(studentId);
      if (!user) return jsonResponse({ ok: false, error: 'not-found' }, 404);
      return jsonResponse({
        ok: true,
        studentId: user.studentId,
        username: user.username,
        realName: user.realName,
        section: user.section,
      });
    }

    if (method === 'GET' && (url.pathname === '/grade' || /^\/teacher\/student\/[^/]+\/grade$/.test(url.pathname))) {
      const targetId = url.pathname.startsWith('/teacher/') ? decodeURIComponent(url.pathname.split('/')[3]) : null;
      const user = targetId ? state.userByStudentId(targetId) : resolveRequestUser(state, url, request);
      if (!user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      return jsonResponse(await scriptedValue(state.grades, user, defaultGrade(), request));
    }

    if (method === 'GET' && url.pathname === '/grade/offline-inputs') {
      return jsonResponse({ ok: true, config: {}, answerKey: {}, workManifest: {}, worksheetKey: {} });
    }

    if (method === 'GET' && url.pathname === '/receipts/issuer') {
      return jsonResponse({ enabled: false });
    }

    if (method === 'GET' && (url.pathname === '/donow' || /^\/teacher\/student\/[^/]+\/donow$/.test(url.pathname))) {
      const targetId = url.pathname.startsWith('/teacher/') ? decodeURIComponent(url.pathname.split('/')[3]) : null;
      const user = targetId ? state.userByStudentId(targetId) : resolveRequestUser(state, url, request);
      if (!user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      return jsonResponse(await scriptedValue(state.donow, user, defaultDoNow(), request));
    }

    if (method === 'POST' && url.pathname === '/ledger/record') {
      if (!body || !body.token) {
        return jsonResponse({ ok: false, error: 'invalid token' }, 401);
      }
      if (!body.source || !body.itemId || body.response === undefined) {
        return jsonResponse({
          ok: false,
          error: 'source, itemId, and response are required',
        }, 400);
      }
      const user = resolveRequestUser(state, url, request);
      if (!user) return jsonResponse({ ok: false, error: 'invalid token' }, 401);
      const payload = { ...body };
      state.ledgerRecords.push(payload);
      const rows = state.ledgerByStudentId.get(user.studentId) || [];
      const recordedAt = new Date(state.now).toISOString();
      const row = {
        source: payload.source,
        item_id: payload.itemId,
        unit: payload.unit ?? null,
        topic: payload.topic ?? null,
        skill: payload.skill ?? null,
        response: payload.response,
        score: payload.score ?? null,
        attempt: payload.attempt ?? 1,
        recorded_at: recordedAt,
        receipt_id: null,
        receipt_compact: null,
      };
      rows.unshift(row);
      state.ledgerByStudentId.set(user.studentId, rows);
      return jsonResponse({ ok: true, ledgerId: `ledger-${state.ledgerRecords.length}`, receipt: null });
    }

    if (method === 'GET' && url.pathname.startsWith('/ledger/student/')) {
      const studentId = decodeURIComponent(url.pathname.slice('/ledger/student/'.length));
      let rows = (state.ledgerByStudentId.get(studentId) || []).slice();
      const prefix = url.searchParams.get('prefix');
      if (prefix) rows = rows.filter((row) => String(row.item_id || '').startsWith(prefix));
      return jsonResponse({ ok: true, rows });
    }

    if (/^(GET|PUT)$/.test(method) && url.pathname === '/flashcards/state') {
      const deckId = 'ap-stats-flashcards';
      if (!TRAINER_DECK_ID_RE.test(deckId)) {
        return jsonResponse({ ok: false, error: 'bad deckId' }, 400);
      }

      if (method === 'GET') {
        const auth = request.headers.authorization || '';
        const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || null;
        const user = bearer
          ? state.users.find((candidate) => state.tokenFor(candidate) === bearer)
          : null;
        if (!user) return jsonResponse({ ok: false, error: 'forbidden' }, 401);

        const key = `${user.studentId}:${deckId}`;
        const current = state.trainerStates.get(key) || null;
        if (!current) return jsonResponse({ ok: true, found: false });
        return jsonResponse({
          ok: true,
          found: true,
          state: current.state,
          updatedAt: current.updatedAt,
        });
      }

      

      const writeToken = (request.headers.authorization || '').replace(/^Bearer\s+/i, '') || (body && body.token);
      const user = writeToken
        ? state.users.find((candidate) => state.tokenFor(candidate) === writeToken)
        : null;
      if (!user) return jsonResponse({ ok: false, error: 'invalid token' }, 401);
      const key = `${user.studentId}:${deckId}`;
      const current = state.trainerStates.get(key) || null;
      if (method === 'PUT') {
        if (!body?.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
          return jsonResponse({ ok: false, error: 'state object is required' }, 400);
        }
        if (Buffer.byteLength(JSON.stringify(body.state), 'utf8') > TRAINER_STATE_MAX_CHARS) {
          return jsonResponse({ ok: false, error: 'state too large' }, 413);
        }
        if ((current?.updatedAt || null) !== body.baseUpdatedAt) {
          return jsonResponse({ ok: false, error: 'stale', updatedAt: current?.updatedAt || null }, 409);
        }
        const updatedAt = nextTrainerUpdatedAt();
        state.trainerStates.set(key, { state: body.state, updatedAt });
        return jsonResponse({ ok: true, updatedAt });
      }
    }

    if (method === 'GET' && (url.pathname === '/poll-archive' || /^\/teacher\/student\/[^/]+\/poll-archive$/.test(url.pathname))) {
      return jsonResponse({ ok: true, polls: [] });
    }

    if (url.pathname.startsWith('/class/')) {
      const configured = state.classData[routeKey];
      return jsonResponse(configured || { ok: true, students: [], items: [], reviews: [] });
    }

      state.unhandledRequests.push(request);
      return jsonResponse(
        { ok: false, error: 'not-found' },
        404,
        { 'X-Journey-Unhandled': 'true' },
      );
    } finally {
      state.inflight -= 1;
    }
  }

  return { state, fetch, handles };
}
