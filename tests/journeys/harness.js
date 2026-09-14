/**
 * Real-Desk JSDOM journey harness.
 *
 * Resource choice: external <script src> elements stay external and are loaded by
 * DiskResourceLoader from this checkout. Returning null is ResourceLoader's
 * unavailable-resource/404 equivalent; it never falls through to the network.
 * Window.fetch is routed separately and returns a real 404 Response for unknowns.
 *
 * JSDOM gaps shimmed here (current Desk references):
 * - canvas 2D context: Desk lines 10322, 18573-18586, 19142-19145, 23054.
 * - matchMedia: Desk line 15815.
 * - Element.scrollIntoView: Desk lines 8156, 22735, 23021; window.scrollTo is
 *   paired with it because JSDOM reports both scrolling APIs as unimplemented.
 * - navigator.serviceWorker: Desk line 2610 loads pwa-register.js, whose guarded
 *   registration is the PWA path exercised by the real page.
 * - HTMLMediaElement.play: Desk line 18344 and boot-chime line 23481.
 * - IntersectionObserver: required browser surface for journey-loaded content;
 *   the current Desk has no direct call (the shim remains inert until observed).
 *
 * Navigation model: Desk sign-out calls location.reload() at Desk line 7799.
 * JSDOM does not implement navigation, so harness.reboot() models that reload as
 * teardown + a fresh bootDesk while explicitly carrying over every localStorage
 * and sessionStorage entry (the same persistence a browser reload provides).
 *
 * The WebSocket replacement is network isolation, not a missing-API shim: the
 * signed-in Desk opens curriculum-render sockets at lines 21955 and 23294. The
 * in-memory socket prevents a journey from reaching Railway.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { createFakeRoster } from './fake-roster.js';

export const DESK_URL = 'https://a2.example.test/a2-live-worksheets/desk.html';
export const ROSTER_URL = 'https://api.a2.example.test';
export const CURRICULUM_URL = 'https://api.a2.example.test';
export const SUPABASE_URL = 'https://database.example.test';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DESK_PATH = resolve(REPO_ROOT, 'desk.html');
const DESK_HTML = readFileSync(DESK_PATH, 'utf8');
const PAGE_PREFIX = '/a2-live-worksheets/';
const HOST_SET_TIMEOUT = globalThis.setTimeout.bind(globalThis);
const SUPABASE_ROUTE_KEYS = new Set([
  'GET /rest/v1/topic_schedule',
  'GET /rest/v1/lesson_urls',
  'POST /rest/v1/student_progress',
  'POST /rest/v1/students',
]);

function isCurriculumRoute(method, path) {
  if (method === 'POST' && path === '/api/ai/coach') return true;
  if (method === 'POST' && path === '/api/ai/review-comment') return true;
  return method === 'GET' && /^\/api\/user-answers\/[^/]+$/.test(path);
}

function unhandledResponse(unhandled, method, url) {
  unhandled.push(`${method} ${url.href}`);
  return new Response(JSON.stringify({ ok: false, error: 'unhandled-harness-url' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mimeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (extension === '.js') return 'text/javascript';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.html') return 'text/html';
  return 'text/plain';
}

function isFetchableRepoFile(path) {
  if (/^content\/a2\/[^/]+\.json$/i.test(path)) return true;
  if (path === 'roadmap-data.json' || path === 'version.json') return true;
  if (/^data\/[^/]+\.json$/i.test(path)) return true;
  if (/^lib\/[^/]+\.js$/i.test(path)) return true;
  return /(^|\/)[^/]+\.csv$/i.test(path);
}

class DiskResourceLoader extends ResourceLoader {
  constructor({ resources, unhandled }) {
    super();
    this.resources = resources;
    this.unhandled = unhandled;
  }

  fetch(url) {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(DESK_URL).origin || !parsed.pathname.startsWith(PAGE_PREFIX)) {
      this.unhandled.push(`RESOURCE ${parsed.href}`);
      return null;
    }

    const repoPath = decodeURIComponent(parsed.pathname.slice(PAGE_PREFIX.length));
    const fixtures = {
        'roadmap-data.json': 'tests/fixtures/a2/roadmap-data.json',
        'u1_l1_blooket.csv': 'tests/fixtures/a2/u1_l1_blooket.csv',
        'u1_lesson1_live.html': 'tests/fixtures/a2/u1_lesson1_live.html'
      };
      const absolutePath = resolve(REPO_ROOT, fixtures[repoPath] || repoPath);
    const insideRepo = absolutePath === REPO_ROOT || absolutePath.startsWith(REPO_ROOT + sep);
    if (!insideRepo || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      this.unhandled.push(`RESOURCE ${parsed.href}`);
      return null;
    }

    this.resources.push(relative(REPO_ROOT, absolutePath));
    return readFile(absolutePath);
  }
}

function createNullCanvasContext(canvas) {
  const gradient = { addColorStop() {} };
  const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  const base = {
    canvas,
    imageSmoothingEnabled: false,
    measureText(text) {
      return {
        width: String(text ?? '').length * 6,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      };
    },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    createPattern() { return null; },
    createImageData() { return imageData; },
    getImageData() { return imageData; },
    isPointInPath() { return false; },
    isPointInStroke() { return false; },
  };
  const noOp = () => undefined;
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property];
      return noOp;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

function installBrowserShims(window, serviceWorkerMessages) {
  const canvasContexts = new WeakMap();
  window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    if (!canvasContexts.has(this)) canvasContexts.set(this, createNullCanvasContext(this));
    return canvasContexts.get(this);
  };

  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
      constructor(callback) { this.callback = callback; this.targets = new Set(); }
      observe(target) {
        this.targets.add(target);
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
      }
      unobserve(target) { this.targets.delete(target); }
      disconnect() { this.targets.clear(); }
      takeRecords() { return []; }
    };
  }

  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: String(query),
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return true; },
    });
  }

  window.scrollTo = () => undefined;
  if (!window.Element.prototype.scrollIntoView) {
    window.Element.prototype.scrollIntoView = () => undefined;
  }

  const swListeners = new Map();
  const registration = { sync: { register: async () => undefined } };
  const serviceWorker = {
    register: async () => registration,
    ready: Promise.resolve(registration),
    addEventListener(type, listener) {
      if (!swListeners.has(type)) swListeners.set(type, new Set());
      swListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { swListeners.get(type)?.delete(listener); },
    dispatchMessage(data) {
      serviceWorkerMessages.push(data);
      for (const listener of swListeners.get('message') || []) listener({ data });
    },
  };
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: serviceWorker });

  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => undefined;
}

function installFakeClock(window, startMs) {
  let nowMs = startMs;
  let nextId = 1;
  const tasks = new Map();

  const add = (callback, delay, interval, args) => {
    const id = nextId++;
    tasks.set(id, {
      id,
      callback,
      due: nowMs + Math.max(0, Number(delay) || 0),
      interval,
      args,
    });
    return id;
  };
  window.setTimeout = (callback, delay, ...args) => add(callback, delay, 0, args);
  window.setInterval = (callback, delay, ...args) => add(callback, delay, Math.max(1, Number(delay) || 1), args);
  window.clearTimeout = (id) => tasks.delete(id);
  window.clearInterval = window.clearTimeout;

  const advance = (milliseconds = 0) => {
    const end = nowMs + Math.max(0, Number(milliseconds) || 0);
    let turns = 0;
    while (turns < 10_000) {
      const ready = [...tasks.values()]
        .filter((task) => task.due <= end)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!ready) break;
      nowMs = ready.due;
      if (ready.interval) ready.due += ready.interval;
      else tasks.delete(ready.id);
      ready.callback(...ready.args);
      turns += 1;
    }
    if (turns === 10_000) throw new Error('Fake timer runaway');
    nowMs = end;
  };

  return {
    now: () => nowMs,
    advance,
    runPending: () => advance(0),
    pendingCount: () => tasks.size,
    clear: () => tasks.clear(),
  };
}

function installDeterminism(window, opts) {
  const parsedNow = new globalThis.Date(opts.now || '2026-08-18T12:00:00.000Z').getTime();
  if (!Number.isFinite(parsedNow)) throw new TypeError(`Invalid harness clock: ${opts.now}`);
  const fakeClock = opts.fakeTimers ? installFakeClock(window, parsedNow) : null;
  const NativeDate = window.Date;
  const now = () => fakeClock ? fakeClock.now() : parsedNow;

  function FixedDate(...args) {
    if (!(this instanceof FixedDate)) return new NativeDate(now()).toString();
    return args.length ? new NativeDate(...args) : new NativeDate(now());
  }
  FixedDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(FixedDate, NativeDate);
  FixedDate.now = now;
  window.Date = FixedDate;

  let seed = 0;
  const seedText = String(opts.randomSeed ?? 0x5eed1234);
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  window.Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return fakeClock;
}

function createWebSocketStub(window, sockets) {
  return class FakeWebSocket extends window.EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      this.protocol = '';
      this.extensions = '';
      this.bufferedAmount = 0;
      this.binaryType = 'blob';
      sockets.push(this);
      Promise.resolve().then(() => {
        if (this.readyState !== FakeWebSocket.CONNECTING) return;
        this.readyState = FakeWebSocket.OPEN;
        const event = new window.Event('open');
        this.dispatchEvent(event);
        if (typeof this.onopen === 'function') this.onopen(event);
      });
    }

    send(data) { this.sent.push(data); }

    close(code = 1000, reason = '') {
      if (this.readyState === FakeWebSocket.CLOSED) return;
      this.readyState = FakeWebSocket.CLOSED;
      const event = new window.CloseEvent('close', { code, reason, wasClean: true });
      this.dispatchEvent(event);
      if (typeof this.onclose === 'function') this.onclose(event);
    }
  };
}

function mergeFlashcardFlags(body, overrides) {
  if (!overrides || typeof overrides !== 'object') return body;

  const document = JSON.parse(String(body));
  const diskFlags = document.flags || {};
  const flags = { ...diskFlags };
  for (const [name, override] of Object.entries(overrides)) {
    flags[name] = { ...(diskFlags[name] || {}), ...(override || {}) };
  }
  return JSON.stringify({ ...document, flags });
}

function makeFetchRouter({ requests, unhandled, roster, opts }) {
  const pageOrigin = new URL(DESK_URL).origin;
  const rosterOrigin = new URL(ROSTER_URL).origin;
  const curriculumOrigin = new URL(CURRICULUM_URL).origin;
  const supabaseOrigin = new URL(SUPABASE_URL).origin;

  return async function routedFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl, DESK_URL);
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    requests.push({ method, url: url.href });

    if (method === 'GET' && url.origin === pageOrigin && url.pathname.startsWith(PAGE_PREFIX)) {
      const repoPath = decodeURIComponent(url.pathname.slice(PAGE_PREFIX.length));
      const fixtures = {
        'roadmap-data.json': 'tests/fixtures/a2/roadmap-data.json',
        'u1_l1_blooket.csv': 'tests/fixtures/a2/u1_l1_blooket.csv',
        'u1_lesson1_live.html': 'tests/fixtures/a2/u1_lesson1_live.html'
      };
      const absolutePath = resolve(REPO_ROOT, fixtures[repoPath] || repoPath);
      const insideRepo = absolutePath.startsWith(REPO_ROOT + sep);
      if (insideRepo && isFetchableRepoFile(repoPath) && existsSync(absolutePath) && statSync(absolutePath).isFile()) {
        let body = await readFile(absolutePath);
        if (repoPath === 'data/flashcard-flags.json') {
          body = mergeFlashcardFlags(body, opts.flags);
        }
        return new Response(body, { status: 200, headers: { 'Content-Type': mimeFor(absolutePath) } });
      }
    }

    if (url.origin === rosterOrigin) {
      if (typeof roster.handles === 'function' && !roster.handles(method, url.pathname)) {
        return unhandledResponse(unhandled, method, url);
      }
      const response = await roster.fetch(url.href, init);
      if (response.headers.get('X-Journey-Unhandled') === 'true') {
        unhandled.push(`${method} ${url.href}`);
      }
      return response;
    }

    if (url.origin === supabaseOrigin) {
      if (!SUPABASE_ROUTE_KEYS.has(`${method} ${url.pathname}`)) {
        return unhandledResponse(unhandled, method, url);
      }
      const table = url.pathname.slice('/rest/v1/'.length);
      const source = opts.supabase || {};
      if (typeof source === 'function') {
        const result = await source({ method, url, init });
        if (result instanceof Response) return result;
        return new Response(JSON.stringify(result ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const rows = source[table] ?? [];
      const status = method === 'GET' ? 200 : 201;
      return new Response(method === 'HEAD' ? null : JSON.stringify(rows), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.origin === curriculumOrigin) {
      if (!isCurriculumRoute(method, url.pathname)) {
        return unhandledResponse(unhandled, method, url);
      }
      const source = opts.curriculum || {};
      const value = typeof source === 'function'
        ? await source({ method, url, init })
        : source[url.pathname] ?? source.default ?? { ok: true };
      if (value instanceof Response) return value;
      return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Third-party price feed the Desk's DOGE wallet polls at boot (js/wallet_logic.js
    // → api.coingecko.com). Deterministic stub; opts.dogeUsd overrides the price.
    if (url.hostname === 'api.coingecko.com') {
      const usd = typeof opts.dogeUsd === 'number' ? opts.dogeUsd : 0.0699;
      return new Response(JSON.stringify({ dogecoin: { usd } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return unhandledResponse(unhandled, method, url);
  };
}

function seedStorage(storage, values) {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) {
    storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

function snapshotStorage(storage) {
  const values = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) values[key] = storage.getItem(key);
  }
  return values;
}

function normalizeViewAs(value, roster) {
  if (!value) return null;
  const wanted = typeof value === 'string' ? value : value.studentId || value.username;
  const user = roster.state.userByStudentId(wanted) || roster.state.userByUsername(wanted);
  const source = typeof value === 'object' ? value : user || {};
  const studentId = source.studentId || user?.studentId;
  if (!studentId) throw new Error(`Unknown view-as student: ${wanted}`);
  return {
    studentId,
    username: source.username || user?.username || '',
    realName: source.realName || user?.realName || '',
    section: source.section || user?.section || 'PeriodX',
    readOnly: true,
    enteredAt: new Date('2026-08-18T12:00:00.000Z').getTime(),
  };
}

function waitForLoad(window, timeoutMs) {
  if (window.document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolveLoad, rejectLoad) => {
    const timeout = HOST_SET_TIMEOUT(() => rejectLoad(new Error(`Desk load exceeded ${timeoutMs} ms`)), timeoutMs);
    window.addEventListener('load', () => {
      globalThis.clearTimeout(timeout);
      resolveLoad();
    }, { once: true });
  });
}

function makeFlush(fakeClock) {
  return async function flush(n = 6) {
    for (let index = 0; index < n; index += 1) {
      await Promise.resolve();
      if (fakeClock) fakeClock.runPending();
      // ALWAYS yield one host macrotask: the fetch router reads repo files from
      // disk (real libuv I/O) even when the Desk's clock is fake — without this
      // yield a fake-timer journey spins forever waiting for a CSV that can never
      // resolve. HOST_SET_TIMEOUT is the real Node timer, untouched by the fake clock.
      await new Promise((resolveTick) => HOST_SET_TIMEOUT(resolveTick, 0));
    }
  };
}

function makeWaitFor(fakeClock, flush) {
  return async function waitFor(predicate, options = {}) {
    if (typeof predicate !== 'function') throw new TypeError('waitFor requires a predicate function');
    const timeoutMs = options.timeoutMs ?? 1_000;
    // Under the fake clock each poll costs one real host yield, so step the
    // fake clock in 25 ms increments (deterministic; a 700 ms UI delay = 28 polls
    // instead of 140). Real-timer journeys keep the fine 5 ms poll.
    const pollIntervalMs = options.pollIntervalMs ?? (fakeClock ? 25 : 5);
    const message = options.message || 'Harness condition was not met';
    const startedAt = globalThis.performance.now();
    let fakeElapsedMs = 0;

    while (true) {
      const value = await predicate();
      if (value) return value;

      const elapsedMs = fakeClock
        ? fakeElapsedMs
        : globalThis.performance.now() - startedAt;
      if (elapsedMs >= timeoutMs) break;

      await flush(1);
      if (fakeClock) {
        fakeClock.advance(pollIntervalMs);
        fakeElapsedMs += pollIntervalMs;
      } else {
        await new Promise((resolveTick) => HOST_SET_TIMEOUT(resolveTick, pollIntervalMs));
      }
    }

    throw new Error(`${message} after ${timeoutMs} ms`);
  };
}

/**
 * Boot the checked-in Desk document with its real scripts and UI.
 *
 * Useful options: `roster` (a createFakeRoster result or initial state), `now`,
 * `randomSeed`, `fakeTimers`, `flags`, `supabase`, `curriculum`, `localStorage`,
 * `sessionStorage`, `url`, `readOnly`, and `viewAs`.
 */
export async function bootDesk(opts = {}) {
  const startedAt = globalThis.performance.now();
  const unhandled = [];
  const requests = Array.isArray(opts.requestLog) ? opts.requestLog : [];
  const resources = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const jsdomErrors = [];
  const windowErrors = [];
  const unhandledRejections = [];
  const serviceWorkerMessages = [];
  const sockets = [];
  const roster = opts.roster && typeof opts.roster.fetch === 'function'
    ? opts.roster
    : createFakeRoster(opts.roster || {});
  const viewAsContext = normalizeViewAs(opts.viewAs, roster);
  const url = new URL(opts.url || DESK_URL, DESK_URL);
  if (viewAsContext) url.searchParams.set('viewAsUserId', viewAsContext.studentId);

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => consoleErrors.push(args));
  virtualConsole.on('warn', (...args) => consoleWarnings.push(args));
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error));

  const resourceLoader = new DiskResourceLoader({ resources, unhandled });
  let fakeClock = null;
  const dom = new JSDOM(DESK_HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: resourceLoader,
    url: url.href,
    virtualConsole,
    beforeParse(window) {
      window.addEventListener('error', (event) => {
        windowErrors.push({
          message: event.message || event.error?.message || 'window error',
          filename: event.filename || '',
          line: event.lineno || 0,
          column: event.colno || 0,
          error: event.error || null,
        });
      });
      window.addEventListener('unhandledrejection', (event) => {
        unhandledRejections.push(event.reason);
      });
      window.Response = globalThis.Response;
      window.Request = globalThis.Request;
      window.Headers = globalThis.Headers;
      window.ROSTER_SERVICE_URL = ROSTER_URL;
      window.RAILWAY_SERVER_URL = CURRICULUM_URL;
      installBrowserShims(window, serviceWorkerMessages);
      fakeClock = installDeterminism(window, opts);
      window.WebSocket = createWebSocketStub(window, sockets);
      window.fetch = makeFetchRouter({ requests, unhandled, roster, opts });
      seedStorage(window.localStorage, opts.localStorage);
      seedStorage(window.sessionStorage, opts.sessionStorage);
      if (opts.readOnly || viewAsContext) window.__WS_READ_ONLY__ = true;
      if (viewAsContext) {
        const teacher = roster.state.users.find((user) => user.role === 'teacher');
        if (!teacher) throw new Error('viewAs requires a teacher in the fake roster');
        window.localStorage.setItem('a2_roster.v1', JSON.stringify({
          studentId: teacher.studentId,
          username: teacher.username,
          realName: teacher.realName,
          section: teacher.section,
          token: roster.state.tokenFor(teacher),
          role: 'teacher',
          spriteHue: teacher.spriteHue,
          mustChangePassword: false,
          signedInAt: new window.Date().toISOString(),
        }));
        window.sessionStorage.setItem('a2_view_as_context', JSON.stringify(viewAsContext));
        window.__VIEW_AS_STUDENT_ID__ = viewAsContext.studentId;
      }
    },
  });

  const flush = makeFlush(fakeClock);
  const waitFor = makeWaitFor(fakeClock, flush);
  try {
    await waitForLoad(dom.window, opts.bootTimeoutMs || 2_750);
    await flush(opts.bootFlushes || 8);
  } catch (error) {
    dom.window.close();
    throw error;
  }

  const bootTimeMs = globalThis.performance.now() - startedAt;
  console.log(`[journey harness] Desk boot ${bootTimeMs.toFixed(1)} ms`);

  const readOnly = (enabled = true) => {
    dom.window.__WS_READ_ONLY__ = !!enabled;
    return dom.window.__WS_READ_ONLY__;
  };

  const viewAs = (value) => {
    const context = normalizeViewAs(value, roster);
    dom.window.sessionStorage.setItem('a2_view_as_context', JSON.stringify(context));
    dom.window.__VIEW_AS_STUDENT_ID__ = context.studentId;
    readOnly(true);
    if (typeof dom.window._renderViewAsBanner === 'function') dom.window._renderViewAsBanner();
    if (typeof dom.window._applyViewAsReadOnly === 'function') dom.window._applyViewAsReadOnly();
    return context;
  };

  const signIn = async (username) => {
    const user = roster.state.userByUsername(username);
    if (!user) throw new Error(`Unknown fake-roster username: ${username}`);
    dom.window.document.getElementById('menu-identity').click();
    const usernameInput = dom.window.document.getElementById('signin-username');
    const passwordInput = dom.window.document.getElementById('signin-password');
    usernameInput.value = user.username;
    usernameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    passwordInput.value = user.password;
    passwordInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.document.getElementById('signin-ok').click();
    try {
      return await waitFor(() => {
        const current = dom.window.rosterClient?.current();
        return current?.username === user.username ? current : false;
      }, {
        timeoutMs: 1_500,
        message: `Desk sign-in did not settle for ${username}`,
      });
    } catch (_) {
      const message = dom.window.document.getElementById('signin-error')?.textContent || 'sign-in did not settle';
      throw new Error(`Desk sign-in failed for ${username}: ${message}`);
    }
  };

  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    fakeClock?.clear();
    for (const socket of sockets) socket.close();
    dom.window.close();
  };

  const reboot = async (nextOpts = {}) => {
    if (tornDown) throw new Error('Cannot reboot a torn-down Desk harness');
    const localStorage = snapshotStorage(dom.window.localStorage);
    const sessionStorage = snapshotStorage(dom.window.sessionStorage);
    teardown();
    return bootDesk({
      ...opts,
      ...nextOpts,
      roster,
      requestLog: requests,
      localStorage,
      sessionStorage,
    });
  };

  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    roster,
    requests,
    resources,
    unhandled,
    consoleErrors,
    consoleWarnings,
    jsdomErrors,
    windowErrors,
    unhandledRejections,
    serviceWorkerMessages,
    sockets,
    clock: fakeClock,
    bootTimeMs,
    flush,
    waitFor,
    signIn,
    readOnly,
    viewAs,
    reboot,
    teardown,
    close: teardown,
  };
}
