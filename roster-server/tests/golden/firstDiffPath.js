function childPath(path, key) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
}

export function firstDiffPath(actual, expected, path = '$') {
  if (Object.is(actual, expected)) return null;

  const actualIsObject = actual !== null && typeof actual === 'object';
  const expectedIsObject = expected !== null && typeof expected === 'object';
  if (!actualIsObject || !expectedIsObject) return path;

  const actualIsArray = Array.isArray(actual);
  const expectedIsArray = Array.isArray(expected);
  if (actualIsArray !== expectedIsArray) return path;

  if (actualIsArray) {
    const sharedLength = Math.min(actual.length, expected.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const difference = firstDiffPath(actual[index], expected[index], `${path}[${index}]`);
      if (difference !== null) return difference;
    }
    return actual.length === expected.length ? null : `${path}[${sharedLength}]`;
  }

  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  for (const key of keys) {
    const keyPath = childPath(path, key);
    const actualHasKey = Object.prototype.hasOwnProperty.call(actual, key);
    const expectedHasKey = Object.prototype.hasOwnProperty.call(expected, key);
    if (actualHasKey !== expectedHasKey) return keyPath;

    const difference = firstDiffPath(actual[key], expected[key], keyPath);
    if (difference !== null) return difference;
  }

  return null;
}
