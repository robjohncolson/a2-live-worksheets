// desk-receipt-row.test.js — the wallet (My Ledger) receipt row was redesigned:
// always-on QR + a "View" button (jump to the material) + a single "Verify" that
// checks BOTH the signature AND live gradebook presence. Copy and the duplicate
// "open full verifier" link were dropped, and the redundant standalone "Sign & QR"
// button (openCommitLedger) was removed (the per-session inline QR covers it).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

describe('Wallet receipt row — redesigned actions', () => {
  const row = fnBody(DESK, '_walletReceiptRow');

  it('shows a View button that opens the material', () => {
    expect(row).toContain('_receiptViewUrl(r, payload)');
    expect(row).toMatch(/View/);
    expect(DESK).toMatch(/function _receiptViewUrl/);
  });

  it('Verify does signature + live gradebook presence check', () => {
    expect(row).toContain('_walletVerifyAndCheck(r,');
    const v = fnBody(DESK, '_walletVerifyAndCheck');
    expect(v).toContain('_walletVerifyReceiptCompact');   // signature
    expect(v).toContain('gradebookClient.fetchReceipts');  // durable/DB presence
  });

  it('renders the QR ALWAYS (no toggle)', () => {
    expect(row).toContain('_renderReceiptQr(qr, url)');
    expect(row).not.toContain('_toggleReceiptQr');
  });

  it('drops Copy and the open-full-verifier link from the row', () => {
    expect(row).not.toContain('Copy');
    expect(row).not.toContain('open full verifier');
    expect(row).not.toContain('navigator.clipboard');
  });

  it('_receiptViewUrl resolves item ids via the lesson registry', () => {
    const v = fnBody(DESK, '_receiptViewUrl');
    expect(v).toContain('getRegistryEntry');
    expect(v).toMatch(/WS\|CR\|BL/);
  });
});

describe('Wallet — redundant "Sign & QR" button removed', () => {
  it('no standalone Sign & QR button and no openCommitLedger call', () => {
    expect(DESK).not.toMatch(/var sessionsBtn/);
    expect(DESK).not.toMatch(/openCommitLedger\(\)/); // the call (and the def) are gone
  });

  
});
