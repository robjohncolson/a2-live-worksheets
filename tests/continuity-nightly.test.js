// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextClassCards, parseArgs } from '../scripts/push-observer-cards.mjs';

const year = JSON.parse(readFileSync(new URL('../data/a2-school-year.json', import.meta.url), 'utf8'));
const observerCard = { title: 'Next class', body: 'Practice the assigned examples.' };
const entries = [
  { date: '2026-10-26', section: 'C', observerCard },
  { date: '2026-10-27', section: 'C', observerCard },
  { date: '2026-10-27', section: 'G', observerCard },
  { date: '2026-10-28', section: 'D', observerCard },
  { date: '2026-10-29', section: 'C', observerCard },
];

describe('nightly cards follow each section calendar', () => {
  it('publishes exactly the next meeting for C/D/G, leaving past and later cards alone', () => {
    const cards = nextClassCards({ entries }, { year, date: '2026-10-27' });
    expect(cards.map(card => `${card.date} ${card.section}`)).toEqual([
      '2026-10-27 C', '2026-10-28 D', '2026-10-27 G',
    ]);
    expect(nextClassCards({ entries }, { year, date: '2026-10-27', section: 'D' }))
      .toEqual([cards[1]]);
  });

  it('accepts the nightly flags and rejects contradictory date selection', () => {
    expect(parseArgs(['--per-section', '--date', '2026-10-27', '--section', 'd']))
      .toMatchObject({ perSection: true, date: '2026-10-27', section: 'D' });
    expect(() => parseArgs(['--per-section', '--from', '2026-10-27'])).toThrow(/--date/);
  });
});
