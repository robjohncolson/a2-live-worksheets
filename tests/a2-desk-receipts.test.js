// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const deskPath = fileURLToPath(new URL('../desk.html', import.meta.url));
const desk = readFileSync(deskPath, 'utf8');
const verify = readFileSync(new URL('../verify.html', import.meta.url), 'utf8');
const doms = [];
afterEach(() => doms.splice(0).forEach(dom => dom.window.close()));
function fn(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(desk);
  if (!match) throw new Error('Missing ' + name);
  const open = desk.indexOf('{', match.index);
  let depth = 0;
  for (let i = open; i < desk.length; i++) {
    if (desk[i] === '{') depth++;
    if (desk[i] === '}' && --depth === 0) return desk.slice(match.index, i + 1);
  }
  throw new Error('Unclosed ' + name);
}
function setup() {
  const dom = new JSDOM('<div id="my-receipts-body"></div><div id="teachertools-content"><iframe></iframe></div>', {
    url: 'https://school.example/a2/desk.html?token=private',
  });
  doms.push(dom);
  const w = dom.window;
  const print = vi.fn();
  const fetchReceipts = vi.fn().mockResolvedValue([]);
  const signature = vi.fn().mockResolvedValue({ ok: true, issuer: 'A2 Desk' });
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
  w.gradebookClient = { fetchReceipts };
  w.rosterClient = { token: () => 'secret', current: () => ({ role: 'student', studentId: 's1' }) };
  w.ROSTER_SERVICE_URL = 'https://roster.example';
  const ctx = createContext({
    window: w, document: w.document, location: w.location, URL, atob, btoa, fetch,
    cedDisplayText: value => value, printSealedSummary: print,
    _walletVerifyReceiptCompact: signature, _walletVerifyAndCheck: vi.fn(),
  });
  const names = ['_readDeskReceipts', '_receiptVerifyUrl', '_receiptPayload', '_formatReceiptDate',
    '_receiptSourceIcon', '_isProctoredReceipt', '_renderReceiptQr', '_receiptViewUrl',
    '_walletReceiptRow', '_loadReviewMarksForSelf', '_ledgerB64url',
    '_escVisible', '_escHide', '_escCloseTopModal', 'openVerifyQR'];
  const source = 'var _reviewByItem = {};\n' + names.map(fn).join('\n') + '\n' + desk.slice(
    desk.indexOf('// Academic receipts: local recovery'), desk.indexOf('function openMyReceipts(')
  ) + '\n' + desk.match(/window\._commitShowQR = function\(btn\)\{[\s\S]*?\r?\n\};/)[0];
  runInContext(source, ctx, { filename: pathToFileURL(deskPath).href });
  return { w, ctx, fetch, fetchReceipts, print, signature, body: w.document.getElementById('my-receipts-body') };
}
function receipt(id, ts, extra = {}) {
  const payload = { v: 1, i: 'LC-1-1-Q1', src: 'worksheet', sc: 1, a: 2, ts, ...extra };
  return { id, ...payload, compact: Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature' };
}

describe('A2 academic receipt feed', () => {
  it('merges server and local receipts, deduplicates and hydrates review marks safely', async () => {
    const h = setup();
    const first = receipt('one', 1000, { i: '<img src=x onerror=bad()>' });
    const second = receipt('two', 2000);
    const third = receipt('three', 2000000, { src: 'assessment' });
    h.w.localStorage.setItem('desk_receipts_v1', JSON.stringify([first, second]));
    h.fetchReceipts.mockResolvedValue([{ ...first, sc: 0.5 }, third]);
    h.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [
      { item_id: first.i, review: { seenAt: '2026-09-16', comment: '<script>bad()</script>' } },
    ] }) });
    await h.ctx.renderMyReceipts();
    await Promise.resolve();
    expect(h.body.querySelectorAll('.academic-receipt')).toHaveLength(3);
    expect(h.body.querySelectorAll('.receipt-session')).toHaveLength(2);
    expect(h.body.querySelectorAll('.receipt-session-qr')).toHaveLength(2);
    expect(h.body.textContent).toContain('score 100%');
    expect(h.body.textContent).not.toContain('score 50%');
    expect(h.body.textContent).toContain('Attempt: 2');
    expect(h.body.textContent).toContain('Issued:');
    expect(h.body.textContent).toContain('Signature: verified');
    expect(h.body.textContent).toContain('Seen by teacher');
    expect(h.body.textContent).toContain('<script>bad()</script>');
    expect(h.body.querySelectorAll('img,script')).toHaveLength(0);
    h.body.querySelector('#receipts-print-summary').click();
    expect(h.print).toHaveBeenCalledTimes(1);
  });

  it.each(['[]', '{}', 'not json'])('keeps an empty feed printable for %s', async raw => {
    const h = setup(); h.w.localStorage.setItem('desk_receipts_v1', raw);
    await h.ctx.renderMyReceipts();
    expect(h.body.textContent).toContain('No receipts yet');
    h.body.querySelector('#receipts-print-summary').click();
    expect(h.print).toHaveBeenCalledTimes(1);
  });

  it('keeps local recovery usable offline and does not claim an invalid signature is valid', async () => {
    const h = setup();
    h.w.localStorage.setItem('desk_receipts_v1', JSON.stringify([receipt('one', 1000)]));
    h.fetchReceipts.mockRejectedValue(new Error('offline'));
    h.fetch.mockRejectedValue(new Error('offline'));
    h.signature.mockResolvedValue({ ok: false });
    await h.ctx.renderMyReceipts(); await Promise.resolve();
    expect(h.body.querySelectorAll('.academic-receipt')).toHaveLength(1);
    expect(h.body.textContent).toContain('Signature: not verified');
  });

  it('uses registered issuer keys and signed values, rejecting unregistered embedded keys', async () => {
    const h = setup();
    const trusted = generateKeyPairSync('ed25519');
    const stranger = generateKeyPairSync('ed25519');
    h.ctx.crypto = webcrypto;
    h.ctx.Uint8Array = Uint8Array;
    h.ctx.TextDecoder = TextDecoder;
    // Health can be unavailable while previously registered keys still verify.
    h.w.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    runInContext(readFileSync(new URL('../receipt-verify.js', import.meta.url), 'utf8'), h.ctx);
    h.w.ReceiptVerify.registerIssuerKeys([trusted.publicKey.export({ format: 'jwk' }).x]);
    runInContext(fn('_walletVerifyReceiptCompact'), h.ctx);
    function signed(id, ts, keys) {
      const row = receipt(id, ts, { pubkey: keys.publicKey.export({ format: 'jwk' }).x });
      const encoded = row.compact.split('.')[0];
      row.compact = encoded + '.' + sign(null, Buffer.from(encoded, 'base64url'), keys.privateKey).toString('base64url');
      return row;
    }
    const valid = signed('trusted', 1000, trusted);
    const unknown = signed('unknown', 2000, stranger);
    const tampered = signed('wrapper', 3000, trusted);
    Object.assign(tampered, { i: 'FORGED ITEM', sc: 0.5, a: 99, src: 'FORGED SOURCE', ts: 9999999999 });
    h.fetchReceipts.mockResolvedValue([valid, unknown, tampered]);
    await h.ctx.renderMyReceipts();
    const statuses = Array.from(h.body.querySelectorAll('.receipt-signature-status'), row => row.textContent);
    expect(statuses).toEqual(['Signature: verified', 'Signature: not verified', 'Signature: verified']);
    expect(h.body.textContent).not.toContain('FORGED');
    expect(h.body.textContent).not.toContain('score 50%');
    expect(h.body.textContent).not.toContain('Attempt: 99');
    expect(h.body.textContent).toContain('score 100%');
    expect(h.body.textContent).toContain('Attempt: 2');
    expect(h.fetchReceipts).toHaveBeenCalledTimes(1);
    h.body.querySelector('#receipts-print-summary').click();
    expect(h.print).toHaveBeenCalledTimes(1);
    expect(h.fetchReceipts).toHaveBeenCalledTimes(1);
  });

  it('hydrates a configured roster issuer before standalone verification', async () => {
    const dom = new JSDOM(verify, { url: 'https://school.example/a2/verify.html', runScripts: 'outside-only' });
    doms.push(dom);
    const w = dom.window;
    const keys = generateKeyPairSync('ed25519');
    const pubkey = keys.publicKey.export({ format: 'jwk' }).x;
    Object.defineProperty(w, 'crypto', { value: webcrypto });
    w.TextDecoder = TextDecoder;
    w.ROSTER_SERVICE_URL = 'https://roster.example';
    w.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ receipts: { pubkey } }) });
    w.eval(readFileSync(new URL('../receipt-verify.js', import.meta.url), 'utf8'));
    const encoded = receipt('health', 1000).compact.split('.')[0];
    const compact = encoded + '.' + sign(null, Buffer.from(encoded, 'base64url'), keys.privateKey).toString('base64url');
    const result = await w.ReceiptVerify.verifyReceipt(compact);
    expect(result.ok).toBe(true);
    expect(result.issuer.pubkey).toBe(pubkey);
    expect(w.fetch).toHaveBeenCalledWith('https://roster.example/health', expect.any(Object));
    expect(verify.indexOf('src="roster_config.js"')).toBeLessThan(verify.indexOf('src="receipt-verify.js"'));
    expect(verify).toContain('src="roster_config.js"');
  });

  it('loads matching signed sessions and reaches the retained manifest QR helper', async () => {
    const h = setup(); const saved = receipt('one', 1000);
    h.fetchReceipts.mockResolvedValue([saved]);
    await h.ctx.renderMyReceipts();
    h.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, commits: [
      { seq: 1, cnt: 1, manifest: 'signed.manifest', receipts: [saved.compact] },
      { seq: 2, cnt: 1, manifest: 'other.manifest', receipts: ['unrelated'] },
    ] }) });
    const qr = vi.fn(); h.w._renderScanQR = qr;
    await h.body.querySelector('.receipt-session-qr button').onclick();
    expect(h.fetch).toHaveBeenLastCalledWith('https://roster.example/commits', { headers: { Authorization: 'Bearer secret' } });
    const show = h.body.querySelector('[data-deep]');
    expect(show).not.toBeNull(); show.click();
    expect(qr).toHaveBeenCalledTimes(1);
    expect(qr.mock.calls[0][1]).toBe('https://school.example/a2/verify.html#commit=signed.manifest');
    expect(h.body.textContent).not.toContain('Commit #2');
  });

  it('opens the local verifier overlay and closes it through the Escape dispatcher', () => {
    const h = setup(); h.ctx.openVerifyQR();
    const overlay = h.w.document.getElementById('verify-qr-overlay');
    expect(overlay.style.display).toBe('flex');
    expect(overlay.querySelector('#verify-qr-card #verify-qr')).not.toBeNull();
    expect(overlay.querySelector('a').href).toBe('https://school.example/a2/verify.html');
    h.w.document.addEventListener('keydown', event => { if (event.key === 'Escape') h.ctx._escCloseTopModal(); });
    h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay.style.display).toBe('none');
  });

  it('routes only a trusted teacher workspace scan message to openVerifyQR', () => {
    const h = setup(); const open = vi.fn();
    h.ctx.openVerifyQR = open; h.ctx._deskIsTeacher = () => true;
    const start = desk.indexOf("window.addEventListener('message', function (event) {\n    var frame = document.querySelector('#teachertools-content iframe');");
    expect(start).toBeGreaterThan(-1);
    runInContext(desk.slice(start, desk.indexOf('\n});', start) + 4), h.ctx, { filename: pathToFileURL(deskPath).href });
    const source = h.w.document.querySelector('iframe').contentWindow;
    const data = { type: 'teacher-workspace', action: 'scan' };
    h.w.dispatchEvent(new h.w.MessageEvent('message', { origin: 'https://evil.example', source, data }));
    expect(open).not.toHaveBeenCalled();
    h.w.dispatchEvent(new h.w.MessageEvent('message', { origin: h.w.location.origin, source, data }));
    expect(open).toHaveBeenCalledTimes(1);
    h.ctx._deskIsTeacher = () => false;
    h.w.dispatchEvent(new h.w.MessageEvent('message', { origin: h.w.location.origin, source, data }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('camera scanning submits once and stops once (pending startup: %s)', async pendingStartup => {
    const dom = new JSDOM(verify, { url: 'https://school.example/a2/verify.html', runScripts: 'outside-only' });
    doms.push(dom); const w = dom.window;
    let decoded;
    let finishStart;
    const started = new Promise(resolve => { finishStart = resolve; });
    const stop = vi.fn().mockResolvedValue();
    w.Html5QrcodeSupportedFormats = { QR_CODE: 0 };
    w.Html5Qrcode = class {
      constructor() { this.isScanning = true; }
      start(_camera, _config, success) { decoded = success; return pendingStartup ? started : Promise.resolve(); }
      stop() { return stop(); }
      clear() {}
    };
    const submit = vi.fn(); w.document.getElementById('verify-form').requestSubmit = submit;
    const inline = w.document.querySelector('script:not([src])').textContent;
    w.eval(inline);
    // Let JSDOM deliver its initial DOMContentLoaded once.
    await new Promise(resolve => w.setTimeout(resolve, 0));
    w.document.getElementById('scan-receipt').click();
    await Promise.resolve();
    await decoded('https://school.example/a2/verify.html#r=signed.receipt');
    finishStart();
    await Promise.resolve();
    await decoded('https://school.example/a2/verify.html#r=signed.receipt');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(w.document.getElementById('receipt').value).toContain('#r=signed.receipt');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(w.document.getElementById('stop-scan').hidden).toBe(true);
  });
});
