// Academic receipts retain session grouping without economy or the old tab strip.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');

describe('Academic receipt list', () => {
  it('does not restore the obsolete Lessons/Types/Days tab strip', () => {
    expect(DESK).not.toContain('_walletRenderReceiptTabs');
    expect(DESK).not.toMatch(/dim:\s*'lesson',\s*label:\s*'Lessons'/);
    expect(DESK).not.toMatch(/dim:\s*'type',\s*label:\s*'Types'/);
    expect(DESK).not.toMatch(/dim:\s*'day',\s*label:\s*'Days'/);
  });

  it('uses academic session grouping without restoring the wallet feed', () => {
    expect(DESK).toContain('function _receiptRenderGroupedReceipts(');
    expect(DESK).toContain('function _receiptAppendSessionQRRow(');
    expect(DESK).not.toContain('function _walletLoadReceipts(');
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
