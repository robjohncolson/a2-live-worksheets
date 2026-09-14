const PERMUTATION_UNSAFE_RE = /\b(all|none) of (these|the above)\b/i;

function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\p{P}+$/gu, '')
    .trim();
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = new Array(right.length + 1);
  for (let i = 0; i <= right.length; i += 1) previous[i] = i;

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[right.length];
}

function stemSimilarity(left, right) {
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 1;
  return 1 - (levenshtein(left, right) / maxLength);
}

function normalizeCard(card) {
  const source = card || {};
  const choices = Array.isArray(source.choices) ? source.choices : [];
  const correctIdx = Number.isInteger(source.correctIdx) ? source.correctIdx : -1;
  const correctChoice = correctIdx >= 0 && correctIdx < choices.length
    ? choices[correctIdx]
    : '';

  return {
    source,
    stem: normalizeText(source.q),
    choices: choices.map(normalizeText),
    correctChoice: normalizeText(correctChoice),
  };
}

function finding(csv, qnum, code, detail) {
  return { csv, qnum, code, detail };
}

function lintCard(csvName, card, findings) {
  const firstChoiceByText = new Map();

  for (let i = 0; i < card.choices.length; i += 1) {
    const choice = card.choices[i];
    if (firstChoiceByText.has(choice)) {
      const first = firstChoiceByText.get(choice);
      findings.push(finding(
        csvName,
        card.source.qnum,
        'dupChoice',
        `choices ${first + 1} and ${i + 1} normalize to the same text`,
      ));
      continue;
    }
    firstChoiceByText.set(choice, i);
  }

  if (card.correctChoice.length >= 4 && card.stem.includes(card.correctChoice)) {
    findings.push(finding(
      csvName,
      card.source.qnum,
      'answerInStem',
      `correct choice "${card.correctChoice}" appears in the normalized stem`,
    ));
  }

  const rawChoices = Array.isArray(card.source.choices) ? card.source.choices : [];
  for (let i = 0; i < rawChoices.length; i += 1) {
    if (!PERMUTATION_UNSAFE_RE.test(String(rawChoices[i]))) continue;
    findings.push(finding(
      csvName,
      card.source.qnum,
      'permutationUnsafe',
      `choice ${i + 1} depends on a fixed choice order`,
    ));
    break;
  }
}

function pairKey(leftQnum, rightQnum) {
  const left = String(leftQnum);
  const right = String(rightQnum);
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function declaredPairSet(csvName, pairs) {
  const byCsv = pairs && pairs.pairs ? pairs.pairs : pairs;
  const declarations = Array.isArray(byCsv)
    ? byCsv
    : (byCsv && Array.isArray(byCsv[csvName]) ? byCsv[csvName] : []);
  const declared = new Set();

  for (const pair of declarations) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    declared.add(pairKey(pair[0], pair[1]));
  }

  return declared;
}

function lintSiblingStems(csvName, cards, declaredPairs, findings) {
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const left = cards[i];
      const right = cards[j];
      if (!left.stem || !right.stem) continue;

      const similarity = stemSimilarity(left.stem, right.stem);
      if (similarity < 0.9) continue;
      if (declaredPairs.has(pairKey(left.source.qnum, right.source.qnum))) continue;

      findings.push(finding(
        csvName,
        right.source.qnum,
        'siblingStem',
        `normalized stem is ${similarity.toFixed(3)} similar to q${left.source.qnum}`,
      ));
    }
  }
}

function lintCrossCardLeaks(csvName, cards, findings) {
  for (let answerIndex = 0; answerIndex < cards.length; answerIndex += 1) {
    const answerCard = cards[answerIndex];
    if (answerCard.correctChoice.length < 25) continue;

    for (let stemIndex = 0; stemIndex < cards.length; stemIndex += 1) {
      if (answerIndex === stemIndex) continue;
      const stemCard = cards[stemIndex];
      if (!stemCard.stem.includes(answerCard.correctChoice)) continue;

      findings.push(finding(
        csvName,
        stemCard.source.qnum,
        'crossCardLeak',
        `q${answerCard.source.qnum}'s correct choice appears in this stem`,
      ));
    }
  }
}

function lintTrueFalseBalance(csvName, cards, findings) {
  if (!cards.length) return;
  if (!cards.every(function (card) {
    if (card.choices.length !== 2) return false;

    const choices = card.choices.slice().sort();
    const isTrueFalse = choices[0] === 'false' && choices[1] === 'true';
    const isYesNo = choices[0] === 'no' && choices[1] === 'yes';
    return isTrueFalse || isYesNo;
  })) return;

  const counts = new Map();
  for (const card of cards) {
    const side = card.correctChoice === 'true' || card.correctChoice === 'yes'
      ? 'true/yes'
      : 'false/no';
    const count = counts.get(side) || 0;
    counts.set(side, count + 1);
  }

  let mostCommonAnswer = '';
  let mostCommonCount = 0;
  for (const [answer, count] of counts) {
    if (count <= mostCommonCount) continue;
    mostCommonAnswer = answer;
    mostCommonCount = count;
  }

  if (mostCommonCount / cards.length <= 0.7) return;
  findings.push(finding(
    csvName,
    '*',
    'tfImbalance',
    `${mostCommonCount}/${cards.length} correct answers are on the "${mostCommonAnswer}" side`,
  ));
}

function withoutLegacyFindings(findings, legacy) {
  if (!legacy || typeof legacy.has !== 'function') return findings;
  return findings.filter(function (item) {
    return !legacy.has(`${item.csv}#${item.qnum}`);
  });
}

export function lintDeck(csvName, cards, opts) {
  const options = opts || {};
  const normalizedCards = (Array.isArray(cards) ? cards : []).map(normalizeCard);
  const findings = [];

  for (const card of normalizedCards) lintCard(csvName, card, findings);

  const declaredPairs = declaredPairSet(csvName, options.pairs);
  lintSiblingStems(csvName, normalizedCards, declaredPairs, findings);
  lintCrossCardLeaks(csvName, normalizedCards, findings);
  lintTrueFalseBalance(csvName, normalizedCards, findings);

  return withoutLegacyFindings(findings, options.legacy);
}

function corpusEntries(decks) {
  if (!decks) return [];
  if (decks instanceof Map) return Array.from(decks.entries());
  if (!Array.isArray(decks)) return Object.entries(decks);

  return decks.map(function (deck) {
    if (Array.isArray(deck)) return deck;
    return [deck.csv || deck.name, deck.cards || deck.deck || []];
  });
}

export function lintCorpus(decks, pairs) {
  const findings = [];
  for (const [csvName, cards] of corpusEntries(decks)) {
    findings.push(...lintDeck(csvName, cards, { pairs }));
  }
  return findings;
}
