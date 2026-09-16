// Local receipt and transcript verification remains public.
// The teacher scan bridge opens this same public verifier.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const VERIFY = readFileSync(new URL('../verify.html', import.meta.url), 'utf8');
const receiptUrlSource = DESK.slice(
  DESK.indexOf('function _receiptVerifyUrl('),
  DESK.indexOf('function _receiptPayload(')
);

describe('Desk public verification links', () => {
  it('uses the local verifier and puts only the encoded receipt in the fragment', () => {
    const ctx = createContext({
      URL,
      window: { location: { href: 'https://school.example/a2/desk.html?token=private#secret' } },
    });
    runInContext(receiptUrlSource, ctx);
    const compact = 'payload.signature+/=';
    const url = new URL(ctx._receiptVerifyUrl({ compact }));
    expect(url.origin).toBe('https://school.example');
    expect(url.pathname).toBe('/a2/verify.html');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#r=' + encodeURIComponent(compact));
    expect(url.href).not.toContain('private');
    expect(url.href).not.toContain('secret');
  });

  it('keeps the public paste verifier wired to signature verification', () => {
    expect(VERIFY).toContain('id="verify-form"');
    expect(VERIFY).toContain('id="receipt"');
    expect(VERIFY).toContain('src="receipt-verify.js"');
    expect(VERIFY).toContain('src="verify-page.js"');
    expect(VERIFY).toContain('Receipt or verification link');
  });

  it('prints an escaped A2 summary with a public manifest QR, without leaking the fetch token', async () => {
    const dom = new JSDOM('', { url: 'https://school.example/a2/desk.html?token=private' });
    const transcript = {
      manifest: 'signed.manifest+/=', u: '<img src=x onerror=alert(1)>',
      quarter: 'Q1', grade: 85, count: 6, issuedAt: '2026-09-16T12:00:00Z',
    };
    const printed = [];
    const qrOptions = [];
    const notice = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, transcript }),
    });
    dom.window.ROSTER_SERVICE_URL = 'https://roster.example';
    dom.window.rosterClient = { token: () => 'bearer-secret' };
    dom.window.open = vi.fn(() => ({
      document: { open() {}, write: html => printed.push(html), close() {} },
    }));
    const ctx = createContext({
      window: dom.window, document: dom.window.document, URL, fetch,
      rosterClient: dom.window.rosterClient,
      _sealedTranscriptSignInMessage: notice,
      QRCode: function (_host, options) { qrOptions.push(options); },
    });
    runInContext(DESK.slice(
      DESK.indexOf('async function printSealedSummary('),
      DESK.indexOf('// Resolve the material a receipt points at')
    ), ctx);
    await ctx.printSealedSummary();
    expect(notice).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://roster.example/transcript', {
      method: 'GET', headers: { Authorization: 'Bearer bearer-secret' },
    });
    expect(qrOptions).toHaveLength(1);
    expect(qrOptions[0].text).toBe(
      'https://school.example/a2/verify.html#r=' + encodeURIComponent(transcript.manifest)
    );
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('Algebra 2');
    expect(printed[0]).toContain('no app or login needed');
    expect(printed[0]).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(printed[0]).not.toContain('<img src=x');
    expect(printed[0]).not.toContain('bearer-secret');
    expect(qrOptions[0].text).not.toContain('private');
    dom.window.close();
  });
});
