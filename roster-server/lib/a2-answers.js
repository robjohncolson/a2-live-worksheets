// Shared by the Chromebook runner and the trusted server scorer.
// Preserve brackets: [-1,2] and (-1,2) are different mathematical answers.
(function (root) {
  function normalizeAnswer(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[−–]/g, '-')
      .replace(/\\infty|infinity|∞/g, 'inf')
      .replace(/\+inf/g, 'inf')
      .replace(/\s+/g, '');
  }
  function answerMatches(answer, response) {
    const actual = normalizeAnswer(response);
    return actual !== '' && String(answer).split('|').some(value => normalizeAnswer(value) === actual);
  }
  function scoreLessonCheck(items, responses) {
    const results = items.map(item => ({ registryId: item.registryId,
      correct: answerMatches(item.answer, responses?.[item.registryId]) }));
    const correct = results.filter(item => item.correct).length;
    return { results, correct, total: items.length, score: items.length ? correct / items.length * 10 : 0, maxPoints: 10 };
  }
  root.A2Answers = { normalizeAnswer, answerMatches, scoreLessonCheck };
})(globalThis);
