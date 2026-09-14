/**
 * Contract pins for the offline student export page (offline.html) and the
 * teacher import page (teacher-offline-import.html). OFFLINE_MODE_SPEC §4.C/§4.D.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const OFFLINE = read('offline.html');
const IMPORT = read('teacher-offline-import.html');

describe('offline.html — student export/sync page', () => {
  it('loads the identity + queue + ledger clients in order', () => {
    const order = ['roster-client.js', 'offline-queue.js', 'gradebook-client.js']
      .map((s) => OFFLINE.indexOf('src="' + s + '"'));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]); // roster before queue
    expect(order[1]).toBeLessThan(order[2]); // queue before gradebook-client
  });

  it('builds an export bundle from the queue and downloads it', () => {
    expect(OFFLINE).toMatch(/OfflineQueue\.all\(\)/);
    expect(OFFLINE).toMatch(/OfflineQueue\.toBundle\(/);
    expect(OFFLINE).toMatch(/new Blob\(/);
    expect(OFFLINE).toMatch(/a\.download =/);
    expect(OFFLINE).toContain('a2_');
  });

  it('offers Sync now via the gradebook client drain', () => {
    expect(OFFLINE).toMatch(/gradebookClient\.syncOfflineQueue\(\)/);
  });

  it('reads identity from rosterClient.current (never invents one)', () => {
    expect(OFFLINE).toMatch(/rosterClient\.current\(\)/);
  });
});

describe('teacher-offline-import.html — teacher import page', () => {
  it('POSTs the bundle to /ledger/import with the teacher key header', () => {
    expect(IMPORT).toMatch(/\/ledger\/import/);
    expect(IMPORT).toContain("'x-teacher-secret'");
    expect(IMPORT).toMatch(/method:\s*'POST'/);
  });

  it('accepts a dropped file or pasted JSON and parses it', () => {
    expect(IMPORT).toMatch(/FileReader/);
    expect(IMPORT).toMatch(/JSON\.parse\(/);
    expect(IMPORT).toMatch(/addEventListener\('drop'/);
  });

  it('does not store the teacher key (autocomplete off, password field)', () => {
    expect(IMPORT).toMatch(/id="key"[^>]*type="password"|type="password"[^>]*id="key"/);
    expect(IMPORT).toContain('autocomplete="off"');
    expect(IMPORT).not.toMatch(/localStorage\.setItem\([^)]*key/i);
  });

  it('renders results with textContent (no untrusted-HTML sink)', () => {
    // result rows use el(tag,text)->textContent, never innerHTML of server data
    expect(IMPORT).toMatch(/n\.textContent = text/);
    expect(IMPORT).not.toMatch(/innerHTML\s*=\s*[^']*data\./);
  });

  it('is LOCAL-ONLY: not linked from index.html or TOC.html', () => {
    const pages = ['index.html', 'TOC.html'].filter((f) => existsSync(resolve(repo, f)));
    for (const f of pages) {
      expect(read(f)).not.toContain('teacher-offline-import.html');
    }
  });
});
