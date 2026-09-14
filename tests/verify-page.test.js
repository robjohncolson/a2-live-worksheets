// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

describe('local receipt verifier page', () => {
  it('checks real signatures for pasted receipts and commit links, hides tampered data, and renders payload text safely', async () => {
    const dom = new JSDOM(source('verify.html'), { url: 'https://school.test/a2/verify.html', runScripts: 'outside-only' });
    const w = dom.window;
    Object.defineProperty(w, 'crypto', { value: webcrypto });
    w.TextDecoder = TextDecoder;
    w.TextEncoder = TextEncoder;
    w.eval(source('receipt-verify.js'));
    const keys = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
    w.ReceiptVerify.registerIssuerKeys([publicKey], { name: 'Fixture issuer' });
    const bytes = Buffer.from(JSON.stringify({ v: 1, text: '<img src=x onerror=alert(1)>' }));
    const signature = Buffer.from(await webcrypto.subtle.sign('Ed25519', keys.privateKey, bytes)).toString('base64url');
    const compact = bytes.toString('base64url') + '.' + signature;
    w.eval(source('verify-page.js'));
    const submit = async value => {
      w.document.getElementById('receipt').value = value;
      w.document.getElementById('verify-form').requestSubmit();
      await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          if (!w.document.getElementById('verify-status').textContent.startsWith('Checking')) return resolve();
          if (Date.now() - started > 2000) return reject(new Error('verification did not finish'));
          setTimeout(poll, 5);
        };
        poll();
      });
    };
    try {
      await submit(compact);
      expect(w.document.getElementById('verify-status').textContent).toContain('Valid signature');
      expect(w.document.getElementById('verify-details').textContent).toContain('<img');
      expect(w.document.querySelector('#verify-details img')).toBeNull();
      for (const value of [compact, Buffer.from(JSON.stringify({ m: compact })).toString('base64url')]) {
        await submit('https://school.test/a2/verify.html#commit=' + value);
        expect(w.document.getElementById('verify-status').textContent).toContain('Manifest signature checked');
      }
      const tampered = Buffer.from(JSON.stringify({ v: 1, text: 'forged' })).toString('base64url') + '.' + signature;
      await submit(tampered);
      expect(w.document.getElementById('verify-status').textContent).toBe('Signature could not be verified.');
      expect(w.document.getElementById('verify-details').textContent).toBe('');
    } finally { w.close(); }
  });
});
