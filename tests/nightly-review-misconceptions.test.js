import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

it('falls back to three frequent labels safely, retaining persistence precedence and the empty state', () => {
  const html = readFileSync('desk.html', 'utf8');
  const start = html.indexOf('function _paintReviewByItem(host, data)');
  const source = html.slice(start, html.indexOf('\n}', start) + 2);
  const paint = new Function('document', '_reviewToggleBtns', '_reviewEditTemplates', '_reviewRefresh',
    source + ';return _paintReviewByItem;')(document, () => document.createElement('div'), () => {}, () => {});
  const host = document.createElement('div');
  const frequent = ['<img src=x onerror=bad()>', 'Second', 'Third', 'Fourth'].map(label => ({ label, students: 2 }));
  paint(host, { items: [], topMisconceptions: [], frequent });
  expect(host.firstChild.textContent).toBe('Top recurring misconceptions this week: <img src=x onerror=bad()> (2); Second (2); Third (2) (most frequent, not yet persistent)');
  expect(host.querySelector('img')).toBeNull();
  paint(host, { items: [], topMisconceptions: [{ label: 'Persistent', students: 3 }], frequent });
  expect(host.firstChild.textContent).toBe('Top recurring misconceptions this week: Persistent (3)');
  paint(host, { items: [], frequent: [{ label: 'Draft', students: 1, draft: true }] });
  expect(host.firstChild.textContent).toContain('draft — not yet reviewed (most frequent, not yet persistent)');
  paint(host, { items: [], frequent: [] });
  expect(host.firstChild.textContent).toBe('Top recurring misconceptions this week: None in this window.');
});

it('renders the Nightly Review recurring line as text even with hostile labels', () => {
  const html = readFileSync('desk.html', 'utf8');
  const start = html.indexOf('function _paintReviewByItem(host, data)');
  const source = html.slice(start, html.indexOf('\n}', start) + 2);
  const paint = new Function('document', '_reviewToggleBtns', '_reviewEditTemplates', '_reviewRefresh',
    source + ';return _paintReviewByItem;')(document, () => document.createElement('div'), () => {}, () => {});
  const host = document.createElement('div');
  paint(host, { items: [], topMisconceptions: [{ label: '<img src=x onerror=bad()>', students: 2 }] });
  expect(host.firstChild.textContent).toBe('Top recurring misconceptions this week: <img src=x onerror=bad()> (2)');
  expect(host.querySelector('img')).toBeNull();
});
