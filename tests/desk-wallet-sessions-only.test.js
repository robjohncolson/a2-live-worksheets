// Academic receipts use a plain list; the removed session tab is not required.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');

function loadReceipts() {
  const dom = new JSDOM('<div id="my-receipts-body"></div>', {
    url: 'https://school.example/a2/desk.html',
  });
  const ctx = createContext({
    window: dom.window, document: dom.window.document, URL, atob,
    cedDisplayText: value => value,
    _receiptSourceIcon: () => '',
  });
  runInContext(DESK.slice(
    DESK.indexOf('function _readDeskReceipts('), DESK.indexOf('var WALLET_ISSUERS')
  ), ctx);
  runInContext(DESK.slice(
    DESK.indexOf('function _formatReceiptDate('), DESK.indexOf('function openMyReceipts(')
  ), ctx);
  return { dom, ctx, body: dom.window.document.getElementById('my-receipts-body') };
}

describe('Academic receipt list', () => {
  it('does not restore the obsolete Lessons/Types/Days tab strip', () => {
    expect(DESK).not.toContain('_walletRenderReceiptTabs');
    expect(DESK).not.toMatch(/dim:\s*'lesson',\s*label:\s*'Lessons'/);
    expect(DESK).not.toMatch(/dim:\s*'type',\s*label:\s*'Types'/);
    expect(DESK).not.toMatch(/dim:\s*'day',\s*label:\s*'Days'/);
  });

  it.each(['[]', '{}', 'not json'])('shows an empty list safely for %s', raw => {
    const { dom, ctx, body } = loadReceipts();
    dom.window.localStorage.setItem('desk_receipts_v1', raw);
    ctx.renderMyReceipts();
    expect(body.textContent).toContain('No receipts yet');
    expect(body.querySelectorAll('a')).toHaveLength(0);
    dom.window.close();
  });

  it('renders each saved receipt with its own verifier link and drops unsigned entries', () => {
    const { dom, ctx, body } = loadReceipts();
    const receipts = [
      { i: 'LC-1-1-Q1', src: 'worksheet', compact: 'one.signature', sc: 1 },
      { i: 'TI-1-1-Q1', src: 'worksheet', compact: 'two.signature', sc: 0 },
      { i: 'unsigned' }, null,
    ];
    dom.window.localStorage.setItem('desk_receipts_v1', JSON.stringify(receipts));
    ctx.renderMyReceipts();
    const links = Array.from(body.querySelectorAll('a'));
    expect(body.children).toHaveLength(2);
    expect(links.map(link => link.href)).toEqual([
      'https://school.example/a2/verify.html#r=one.signature',
      'https://school.example/a2/verify.html#r=two.signature',
    ]);
    expect(links.every(link => link.rel === 'noopener')).toBe(true);
    expect(body.textContent).toContain('LC-1-1-Q1');
    expect(body.textContent).toContain('TI-1-1-Q1');
    expect(body.textContent).not.toContain('unsigned');
    ctx.renderMyReceipts();
    expect(body.children).toHaveLength(2);
    dom.window.close();
  });

  it('uses only the signed manifest for a saved commit QR and toggles it off', () => {
    const dom = new JSDOM('<div><button></button><div class="commit-qr-host"></div></div>', {
      url: 'https://school.example/a2/desk.html?token=private',
    });
    const button = dom.window.document.querySelector('button');
    const host = dom.window.document.querySelector('.commit-qr-host');
    const compact = 'manifest.signature';
    button.setAttribute('data-deep', Buffer.from(JSON.stringify({
      m: compact, receipts: ['one.signature', 'two.signature'],
    })).toString('base64url'));
    dom.window._renderScanQR = vi.fn((target) => {
      target.appendChild(dom.window.document.createElement('div'));
    });
    const ctx = createContext({ window: dom.window, URL, atob });
    runInContext(DESK.match(/window\._commitShowQR = function\(btn\)\{[\s\S]*?\r?\n\};/)[0], ctx);
    dom.window._commitShowQR(button);
    expect(dom.window._renderScanQR).toHaveBeenCalledTimes(1);
    expect(dom.window._renderScanQR).toHaveBeenCalledWith(
      host, 'https://school.example/a2/verify.html#commit=' + encodeURIComponent(compact)
    );
    dom.window._commitShowQR(button);
    expect(host.children).toHaveLength(0);
    expect(dom.window._renderScanQR).toHaveBeenCalledTimes(1);
    dom.window.close();
  });
});
