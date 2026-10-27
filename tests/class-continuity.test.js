// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { continuityFor, loadContinuitySources } from '../scripts/lib/class-continuity.mjs';

const entry = Object.freeze({ date: '2026-10-27', section: 'C', lesson: '1-3' });
const summary = Object.freeze({ date: '2026-10-26', course: 'algebra2', section: 'C',
  recordedAt: '2026-10-26T15:00:00Z', landed: Object.freeze(['Example 3 parts A and B']),
  promises: Object.freeze(['Revisit piece C']), nextPrep: Object.freeze(['Try It 3B unfinished']),
  studentQuestions: Object.freeze(['Does the open point count? (No.)']),
});
const folders = [];
afterEach(() => { for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(rows, files = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'class-continuity-'));
  folders.push(root);
  const directory = resolve(root, 'roster-local/class-summaries');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'index.json'), JSON.stringify(rows));
  for (const [name, text] of Object.entries(files)) writeFileSync(resolve(directory, name), text);
  return root;
}

describe('continuityFor', () => {
  it('uses the latest prior summary for only the matching course and normalized section', () => {
    const summaries = [summary, { ...summary, date: '2026-10-25', landed: ['Older C'] },
      { ...summary, course: 'apstats', recordedAt: '2026-10-26T20:00:00Z', landed: ['Wrong course'] },
      { ...summary, section: 'D', recordedAt: '2026-10-26T20:00:00Z', landed: ['Wrong section'] },
      { ...summary, date: entry.date, landed: ['Same day'] },
      { ...summary, date: '2026-10-28', landed: ['Future'] }];
    const before = JSON.stringify(summaries);
    const result = continuityFor({ summaries, entry: { ...entry, section: ' period c ' } });
    expect(result).toEqual({ sourceDate: summary.date, recordedAt: summary.recordedAt,
      landed: summary.landed, promises: summary.promises, nextPrep: summary.nextPrep, questions: summary.studentQuestions });
    expect(JSON.stringify(summaries)).toBe(before);
    expect(result.landed).not.toBe(summary.landed);
    expect(continuityFor({ summaries, entry: { ...entry, course: 'apstats' } })).toBeNull();
    expect(continuityFor({ summaries, entry: { ...entry, section: 'all' } })).toBeNull();
  });

  it('orders corrected summaries by timestamp rather than array or timezone string order', () => {
    const corrected = { ...summary, recordedAt: '2026-10-26T12:00:00-04:00', landed: ['Corrected evidence'] };
    const result = continuityFor({ summaries: [corrected, summary], entry });
    expect(result.recordedAt).toBe(corrected.recordedAt);
    expect(result.landed).toEqual(['Corrected evidence']);
  });

  it('allows fourteen calendar days, rejects older or invalid dates, and handles absent sources', () => {
    expect(continuityFor({ summaries: [summary], entry: { ...entry, date: '2026-11-09' } })).not.toBeNull();
    expect(continuityFor({ summaries: [summary], entry: { ...entry, date: '2026-11-10' } })).toBeNull();
    expect(continuityFor({ summaries: [summary], entry: { ...entry, date: '2026-02-30' } })).toBeNull();
    expect(continuityFor({ summaries: [{ ...summary, date: '2026-02-30' }], entry })).toBeNull();
    expect(continuityFor({ summaries: undefined, entry })).toBeNull();
  });

  it('does not revive older evidence when the latest recording is unusable or empty', () => {
    for (const metadata of [{ quality: 'poor' }, { unusable: true }, { poor: true },
      { markdown: '_Recording unusable (12% usable); the lists below may be empty._' },
      { markdown: '## Landed\n- The recording was unusable.' }]) {
      expect(continuityFor({ summaries: [{ ...summary, date: '2026-10-25' }, { ...summary, ...metadata }], entry })).toBeNull();
    }
    expect(continuityFor({ summaries: [{ ...summary, date: '2026-10-25' },
      { ...summary, landed: [], promises: [], nextPrep: [], studentQuestions: [] }], entry })).toBeNull();
  });

  it('removes sentinels and duplicates without truncating or changing evidence qualifiers', () => {
    const long = 'Complete source detail '.repeat(30).trim();
    const result = continuityFor({ summaries: [{ ...summary,
      landed: ['  Finished part A  ', 'Finished part A', 'finished part a', long, null],
      promises: ['None.', '(none recorded)', 'N/A'], studentQuestions: ['No questions.', 'No student questions recorded.'],
      nextPrep: ['Planned Example 5 was not heard', 'None reported'],
    }], entry });
    expect(result.landed).toEqual(['Finished part A', long]);
    expect(result.promises).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.nextPrep).toEqual(['Planned Example 5 was not heard']);
  });

  it('applies reviewed fields and exact resolutions only to the reviewed source revision', () => {
    const review = Object.freeze({ sourceDate: summary.date, sourceRecordedAt: summary.recordedAt,
      landed: Object.freeze(['Reviewed recap']), questions: Object.freeze([]),
      resolved: Object.freeze(['Revisit piece C', 'Try It 3B unfinished']),
    });
    const reviewedEntry = Object.freeze({ ...entry, continuity: review });
    const result = continuityFor({ summaries: [summary], entry: reviewedEntry, entries: [entry] });
    expect(result).toMatchObject({ landed: ['Reviewed recap'], promises: [], nextPrep: [], questions: [] });
    for (const changed of [{ ...summary, recordedAt: '2026-10-26T16:00:00Z' }, { ...summary, date: '2026-10-25' }]) {
      expect(continuityFor({ summaries: [changed], entry: reviewedEntry })).toMatchObject({
        landed: summary.landed, promises: summary.promises, nextPrep: summary.nextPrep, questions: summary.studentQuestions,
      });
    }
    expect(summary.promises).toEqual(['Revisit piece C']);
    expect(review.questions).toEqual([]);
  });

  it('requires both provenance values and never infers that a similar promise is resolved', () => {
    const noRevision = { sourceDate: summary.date, landed: ['Review without revision'] };
    expect(continuityFor({ summaries: [summary], entry: { ...entry, continuity: noRevision } }).landed).toEqual(summary.landed);
    const review = { sourceDate: summary.date, sourceRecordedAt: summary.recordedAt, resolved: ['Revisit piece C tomorrow'] };
    expect(continuityFor({ summaries: [summary], entry: { ...entry, continuity: review } }).promises).toEqual(summary.promises);
    expect(continuityFor({ summaries: [summary], entry, entries: [{ ...entry, continuity: review }] }).promises).toEqual(summary.promises);
    const caseReview = { ...review, resolved: ['revisit piece c', 'Revisit piece C'] };
    expect(continuityFor({ summaries: [summary], entry: { ...entry, continuity: caseReview } }).promises).toEqual([]);
  });

  it('rejects malformed matching review fields without exposing source text in errors', () => {
    const review = { sourceDate: summary.date, sourceRecordedAt: summary.recordedAt };
    for (const [field, value] of [['landed', 'text'], ['promises', [2]], ['questions', null], ['resolved', 'done']]) {
      expect(() => continuityFor({ summaries: [summary], entry: { ...entry, continuity: { ...review, [field]: value } } }))
        .toThrow(new RegExp(`continuity\\.${field} must be an array of strings`));
    }
  });
});

describe('loadContinuitySources', () => {
  it('reads quality evidence from companion Markdown without exposing the document', () => {
    const root = fixture([{ ...summary, file: '2026-10-26-C.md' }, { ...summary, date: '2026-10-25' }], {
      '2026-10-26-C.md': '---\ndate: 2026-10-26\n---\n\n_Recording unusable (12% usable); the lists below may be empty._\n\n## Landed\nNoise.',
    });
    const sources = loadContinuitySources(root);
    expect(sources[0].unusable).toBe(true);
    expect(sources[0]).not.toHaveProperty('markdown');
    expect(continuityFor({ summaries: sources, entry })).toBeNull();
    writeFileSync(resolve(root, 'roster-local/class-summaries/2026-10-26-C.md'), '---\nquality: poor\n---\n');
    expect(loadContinuitySources(root)[0].unusable).toBe(true);
  });

  it('anonymizes roster names and excludes individual results while preserving math and class policy', () => {
    const root = fixture([{ ...summary,
      landed: ['Alex Rivera explained slope 3', 'Alex scored 85 on the quiz', 'A student earned 18/20 on the quiz', 'We graphed y = 3x - 4', 'Alex got slope 3 from the graph'],
      promises: ['70% on each IXL skill restores full quiz credit', 'Alex will explain the interval'],
      nextPrep: ['A student asked why the slope is 3'],
    }]);
    writeFileSync(resolve(root, 'roster-local/roster-view-PeriodC.csv'), 'realName,section\n"Rivera, Alex",PeriodC\n');
    const sources = loadContinuitySources(root);
    const result = continuityFor({ summaries: sources, entry });
    expect(result.landed).toEqual(['a student explained slope 3', 'We graphed y = 3x - 4', 'a student got slope 3 from the graph']);
    expect(result.promises).toEqual(['70% on each IXL skill restores full quiz credit', 'a student will explain the interval']);
    expect(result.nextPrep).toEqual(['A student asked why the slope is 3']);
    expect(JSON.stringify(sources)).not.toMatch(/Alex|Rivera|85|18\/20/);
    const reviewed = continuityFor({ summaries: sources, entry: { ...entry, continuity: {
      sourceDate: summary.date, sourceRecordedAt: summary.recordedAt, landed: ['Alex Rivera explained interval endpoints'],
    } } });
    expect(reviewed.landed).toEqual(['a student explained interval endpoints']);
  });

  it('supports missing caches and rejects malformed indexes without printing their contents', () => {
    const root = fixture([]);
    expect(loadContinuitySources(root)).toEqual([]);
    writeFileSync(resolve(root, 'roster-local/class-summaries/index.json'), '{private incomplete text');
    expect(() => loadContinuitySources(root)).toThrow('Class continuity summary index is not readable JSON');
    expect(loadContinuitySources(resolve(root, 'missing'))).toEqual([]);
  });

  it('uses an explicit index and its companion directory while keeping roster privacy rooted in the repository', () => {
    const root = fixture([summary]);
    writeFileSync(resolve(root, 'roster-local/roster-view-PeriodC.csv'), 'realName\nAlex Rivera\n');
    const alternate = resolve(root, 'imported-summaries');
    mkdirSync(alternate);
    const index = resolve(alternate, 'custom.json');
    writeFileSync(index, JSON.stringify([{ ...summary, landed: ['Alex explained open endpoints'], file: 'C.md' }]));
    writeFileSync(resolve(alternate, 'C.md'), '## Landed\nAn explanation.');
    const sources = loadContinuitySources(root, index);
    expect(continuityFor({ summaries: sources, entry }).landed).toEqual(['a student explained open endpoints']);
    writeFileSync(resolve(alternate, 'C.md'), 'Transcript quality: poor (12% usable).');
    expect(continuityFor({ summaries: loadContinuitySources(root, index), entry })).toBeNull();
  });

  it('does not follow companion paths outside the generated summary directory', () => {
    const root = fixture([{ ...summary, file: '../other.md' }]);
    writeFileSync(resolve(root, 'roster-local/other.md'), 'quality: poor');
    expect(loadContinuitySources(root)[0].unusable).toBe(false);
  });
});
