function nameTokens(name) {
  return [...new Set(String(name || '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[,\-]/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/).filter(token => token.length > 1 && token !== 'nln'))];
}

function tokensMatch(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// One-to-one token matching prevents a repeated surname from counting twice.
export function nameMatchScore(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  const owners = new Map();
  function assign(i, visited) {
    const candidates = right.map((token, j) => j)
      .filter(j => tokensMatch(left[i], right[j]))
      .sort((j, k) => Number(left[i] !== right[j]) - Number(left[i] !== right[k]));
    for (const j of candidates) {
      if (visited.has(j)) continue;
      visited.add(j);
      if (!owners.has(j) || assign(owners.get(j), visited)) {
        owners.set(j, i);
        return true;
      }
    }
    return false;
  }
  left.forEach((_, i) => assign(i, new Set()));
  const shared = owners.size;
  if (!shared) return 0;
  if (shared === left.length && shared === right.length) return shared;
  if (shared < 2) return 0;
  if (shared === Math.min(left.length, right.length)) return shared;
  const sharesLast = [...owners].some(([j, i]) => i === left.length - 1 || j === right.length - 1);
  return sharesLast ? shared : 0;
}

export function namesMatch(a, b) {
  return nameMatchScore(a, b) > 0;
}
