// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { lintCorpus, lintDeck } from '../scripts/lib/blooket-lint.mjs';

function card(qnum, q, choices, correctIdx) {
  return { qnum, q, choices, correctIdx };
}

function codes(findings) {
  return findings.map(function (item) { return item.code; });
}

describe('Blooket content lint', () => {
  it('flags duplicate choices after case, whitespace, and trailing-punctuation normalization', () => {
    const cards = [
      card(1, 'Which response is duplicated?', ['Same answer.', '  same   answer!!! ', 'Different'], 2),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).toContain('dupChoice');
  });

  it('flags a normalized correct answer of at least four characters inside its stem', () => {
    const cards = [
      card(2, 'Which choice describes the sample mean?', ['sample mean', 'sample size', 'population'], 0),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).toContain('answerInStem');
  });

  it('flags sibling stems at 0.9 similarity unless the qnums are a declared pair', () => {
    const cards = [
      card(3, 'Which display is best for these data?', ['Histogram', 'Table', 'List'], 0),
      card(4, 'Which display is best for these data!', ['Boxplot', 'Table', 'List'], 0),
    ];

    expect(codes(lintDeck('sample.csv', cards))).toContain('siblingStem');

    const pairs = { version: 1, pairs: { 'sample.csv': [[3, 4]] } };
    expect(codes(lintCorpus({ 'sample.csv': cards }, pairs))).not.toContain('siblingStem');
  });

  it('flags a long correct answer that appears in another card stem', () => {
    const leakedAnswer = 'the sample mean changes from sample to sample';
    const cards = [
      card(5, 'What describes sampling variability?', [leakedAnswer, 'No variation', 'A fixed value'], 0),
      card(6, `Why does ${leakedAnswer}?`, ['Random sampling varies', 'The mean is fixed', 'There is no sample'], 0),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).toContain('crossCardLeak');
  });

  it('flags two-choice decks with more than 70 percent of correct answers on one text', () => {
    const cards = [
      card(7, 'Statement alpha is supported.', ['True', 'False'], 0),
      card(8, 'Statement beta is supported.', ['True', 'False'], 0),
      card(9, 'Statement gamma is supported.', ['True', 'False'], 0),
      card(10, 'Statement delta is supported.', ['True', 'False'], 1),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).toContain('tfImbalance');
  });

  it('does not treat a two-choice non-true-false deck as true-false', () => {
    const cards = [
      card(21, 'Choose the first Greek label.', ['Alpha', 'Beta'], 0),
      card(22, 'Select the earlier label.', ['Alpha', 'Beta'], 0),
      card(23, 'Identify the leading label.', ['Alpha', 'Beta'], 0),
      card(24, 'Pick the alternate label.', ['Alpha', 'Beta'], 1),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).not.toContain('tfImbalance');
  });

  it('flags choices that depend on all-or-none fixed ordering', () => {
    const cards = [
      card(11, 'Which response applies?', ['First response', 'Second response', 'All of the above'], 0),
    ];

    const findings = lintDeck('sample.csv', cards);
    expect(codes(findings)).toContain('permutationUnsafe');
  });

  it('suppresses only findings whose card or deck-level legacy key is declared', () => {
    const duplicate = [
      card(12, 'Which response is duplicated?', ['Repeat', 'repeat.', 'Different'], 2),
    ];
    const duplicateLegacy = new Set(['sample.csv#12']);
    expect(lintDeck('sample.csv', duplicate, { legacy: duplicateLegacy })).toEqual([]);

    const imbalanced = [
      card(13, 'Statement one is supported.', ['True', 'False'], 0),
      card(14, 'Statement two is supported.', ['True', 'False'], 0),
    ];
    const deckLegacy = new Set(['sample.csv#*']);
    expect(lintDeck('sample.csv', imbalanced, { legacy: deckLegacy })).toEqual([]);
  });
});
