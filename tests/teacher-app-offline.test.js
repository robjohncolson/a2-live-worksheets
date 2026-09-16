// @vitest-environment node
// Mesh removal must preserve file recovery and teacher receipt signing.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const APP = readFileSync(new URL('../teacher-app.html', import.meta.url), 'utf8');
const IMPORT = readFileSync(new URL('../teacher-offline-import.html', import.meta.url), 'utf8');

describe('teacher app without nearby mesh', () => {
  it('removes mesh scripts, controls, and transport references', () => {
    expect(APP).not.toMatch(/<script[^>]+src=["'][^"']*(?:nearby-transport|ledger-gossip)\.js/i);
    expect(APP).not.toMatch(/GossipTransport|LedgerGossip|offline-card|btn-offline-|offlineSyncNearby/);
  });

  it('connects and imports class work without mesh dependencies', async () => {
    const dom = new JSDOM(APP, { url: 'https://teacher.example/', runScripts: 'outside-only' });
    const { window } = dom;
    try {
      Object.defineProperty(window.document, 'readyState', { value: 'complete' });
      window.ROSTER_SERVICE_URL = 'https://roster.example';
      window.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ students: [{ studentId: 's1', username: 'Student', bundle: {
          records: [{ source: 'frq', itemId: 'lesson-response', response: 'My answer', score: null, attempt: 1 }],
        } }] }),
      });
      for (const script of window.document.querySelectorAll('script:not([src])')) window.eval(script.textContent);
      window.document.getElementById('btn-connect').click();
      expect(window.document.getElementById('grade-card').classList.contains('hidden')).toBe(false);
      window.document.getElementById('btn-import').click();
      await vi.waitFor(() => expect(window.document.getElementById('frq-list').textContent).toContain('My answer'));
      expect(window.fetch.mock.calls[0][0]).toBe('https://roster.example/admin/snapshot');
    } finally {
      window.close();
    }
  });

  it('imports an offline file, grades its response, unlocks, signs, and restores without mesh', async () => {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const options = { url: 'https://teacher.example/', runScripts: 'outside-only', virtualConsole };
    const importer = new JSDOM(IMPORT, options);
    const app = new JSDOM(APP, options);
    const exported = {
      student: { studentId: 's1', username: 'Student', realName: 'Student' },
      records: [{ source: 'frq', itemId: 'lesson-response', response: 'My offline answer', score: null, attempt: 2 }],
    };
    const privateJwk = { kty: 'OKP', crv: 'Ed25519', d: 'fixture-private-key' };
    const signingKey = { type: 'private' };
    const signed = {
      payload: { ts: Date.parse('2026-09-16T14:00:00Z') },
      receiptId: 'signed-fixture-receipt', compact: 'fixture.signed.receipt',
    };
    let imported;
    let restored;
    const fetch = vi.fn(async (url, request) => {
      if (url.endsWith('/ledger/import')) {
        imported = JSON.parse(request.body);
        return { status: 200, ok: true, json: async () => ({ ok: true, imported: 1, skipped: 0, total: 1 }) };
      }
      if (url.endsWith('/admin/snapshot')) {
        return { status: 200, json: async () => ({ students: [{
          ...imported.student, bundle: { records: restored || imported.records },
        }] }) };
      }
      if (url.endsWith('/admin/restore')) {
        restored = JSON.parse(request.body).records;
        return { status: 200, json: async () => ({ ok: true, restored: 1, skipped: 0 }) };
      }
      throw new Error('Unexpected request: ' + url);
    });
    const meshAccess = vi.fn(() => { throw new Error('Removed mesh symbol accessed'); });
    const { window } = app;
    try {
      window.SecureKeyStore = {
        available: true,
        hasKey: vi.fn().mockResolvedValue(true),
        isBiometricAvailable: vi.fn().mockResolvedValue(true),
        getKey: vi.fn().mockResolvedValue(JSON.stringify(privateJwk)),
      };
      window.ReceiptSign = {
        importPrivateKey: vi.fn().mockResolvedValue(signingKey),
        signLedgerReceipt: vi.fn().mockResolvedValue(signed),
      };
      for (const page of [importer.window, window]) {
        Object.defineProperty(page.document, 'readyState', { value: 'complete' });
        page.ROSTER_SERVICE_URL = 'https://roster.example';
        page.fetch = fetch;
        for (const symbol of ['GossipTransport', 'LedgerGossip', 'offlineSyncNearby']) {
          Object.defineProperty(page, symbol, { get: meshAccess });
        }
        for (const script of page.document.querySelectorAll('script:not([src])')) page.eval(script.textContent);
      }

      const importDoc = importer.window.document;
      const file = importDoc.getElementById('file');
      Object.defineProperty(file, 'files', { value: [new importer.window.File([JSON.stringify(exported)], 'offline.json', { type: 'application/json' })] });
      importDoc.getElementById('key').value = 'teacher-test-key';
      importDoc.getElementById('key').dispatchEvent(new importer.window.Event('input'));
      file.dispatchEvent(new importer.window.Event('change'));
      await vi.waitFor(() => expect(importDoc.getElementById('import').disabled).toBe(false));
      importDoc.getElementById('import').click();
      await vi.waitFor(() => expect(importDoc.getElementById('result').textContent).toContain('1 recorded'));
      expect(imported).toEqual(exported);

      const doc = window.document;
      doc.getElementById('secret').value = 'teacher-test-key';
      doc.getElementById('btn-connect').click();
      doc.getElementById('btn-import').click();
      await vi.waitFor(() => expect(doc.querySelector('.resp')?.textContent).toBe('My offline answer'));
      const partial = Array.from(doc.querySelectorAll('.grade-btns button')).find(button => button.textContent === 'P');
      partial.click();
      expect(doc.getElementById('push-row').classList.contains('hidden')).toBe(false);
      doc.getElementById('btn-push').click();
      await vi.waitFor(() => expect(doc.getElementById('push-status').textContent).toContain('Restored 1, skipped 0'));
      expect(window.SecureKeyStore.getKey).toHaveBeenCalledWith('a2_teacher_signing_v1', expect.objectContaining({ requireAuth: true }));
      expect(window.ReceiptSign.importPrivateKey).toHaveBeenCalledWith(privateJwk);
      expect(window.ReceiptSign.signLedgerReceipt).toHaveBeenCalledTimes(1);
      expect(window.ReceiptSign.signLedgerReceipt).toHaveBeenCalledWith(signingKey, {
        sid: 's1', src: 'frq', i: 'lesson-response', a: 3,
        e: 'practice', response: 'My offline answer', sc: 0.5, g: 'self',
      });
      expect(restored).toEqual([{
        studentId: 's1', source: 'frq', itemId: 'lesson-response',
        response: 'My offline answer', score: 0.5, attempt: 3,
        recorded_at: '2026-09-16T14:00:00.000Z',
        receipt_id: signed.receiptId, receipt_compact: signed.compact,
      }]);
      expect(fetch).toHaveBeenCalledWith('https://roster.example/admin/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-teacher-secret': 'teacher-test-key' },
        body: JSON.stringify({ records: restored }),
      });
      await vi.waitFor(() => expect(doc.getElementById('frq-list').children).toHaveLength(0));
      expect(meshAccess).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    } finally {
      importer.window.close();
      window.close();
    }
  });

  it('imports an offline JSON file into the class ledger', async () => {
    const dom = new JSDOM(IMPORT, { url: 'https://teacher.example/', runScripts: 'outside-only' });
    const { window } = dom;
    const exported = { student: { studentId: 's1', realName: 'Student' }, records: [] };
    try {
      window.ROSTER_SERVICE_URL = 'https://roster.example';
      window.fetch = vi.fn().mockResolvedValue({
        status: 200, ok: true,
        json: async () => ({ ok: true, imported: 1, skipped: 0, total: 1 }),
      });
      for (const script of window.document.querySelectorAll('script:not([src])')) window.eval(script.textContent);
      const file = window.document.getElementById('file');
      Object.defineProperty(file, 'files', { value: [new window.File([JSON.stringify(exported)], 'offline.json', { type: 'application/json' })] });
      const key = window.document.getElementById('key');
      key.value = 'teacher-test-key';
      key.dispatchEvent(new window.Event('input'));
      file.dispatchEvent(new window.Event('change'));
      const button = window.document.getElementById('import');
      await vi.waitFor(() => expect(button.disabled).toBe(false));
      button.click();
      await vi.waitFor(() => expect(window.document.getElementById('result').textContent).toContain('1 recorded'));
      expect(window.fetch).toHaveBeenCalledWith('https://roster.example/ledger/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-teacher-secret': 'teacher-test-key' },
        body: JSON.stringify(exported),
      });
    } finally {
      window.close();
    }
  });
});
