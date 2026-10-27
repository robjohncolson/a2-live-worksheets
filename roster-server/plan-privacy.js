// Pure projection privacy. Callers obtain names from the trusted roster; never
// accept a client-supplied exemption list. Canonical source storage stays private.
export function sanitizePlanInput(input, rosterNames = []) {
  const result = JSON.parse(JSON.stringify(input));
  delete result.privacyNames;
  const names = new Set();
  for (const value of rosterNames) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const name = value.trim();
    names.add(name);
    const comma = name.indexOf(',');
    const given = comma >= 0 ? name.slice(comma + 1).trim() : name;
    const first = given.split(/\s+/)[0];
    if (first.length > 1) names.add(first);
    if (comma >= 0) {
      names.add(`${given} ${name.slice(0, comma).trim()}`);
      names.add(`${first} ${name.slice(0, comma).trim()}`);
    }
  }
  const escaped = [...names].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
  const clean = value => {
    if (typeof value !== 'string') return value;
    let individual = false;
    const replaced = pattern ? value.replace(pattern, () => { individual = true; return 'a student'; }) : value;
    individual ||= /\b(?:a|one|another|the) student\b|\b(?:he|she|his|her)\b/i.test(replaced);
    const score = /\b(?:scor(?:e|ed|es|ing)|grades?)\b.{0,45}\b\d/i.test(replaced)
      || /\b(?:earned|got|received|had|has|reached)\s+(?:a\s+)?\d+(?:\.\d+)?\s*(?:%|percent|points?|out of\s+\d+|\/\s*\d+|on (?:the )?(?:quiz|test|assessment|IXL))/i.test(replaced)
      || /\b\d+(?:\.\d+)?\s*(?:%|percent\b|points?\b|out of\s+\d+|\/\s*\d+).{0,25}\b(?:quiz|test|assessment|IXL|grade|score)\b/i.test(replaced)
      || /\b(?:quiz|test|assessment|IXL|grade|score)\b.{0,25}\b\d+(?:\.\d+)?\s*(?:%|percent\b|points?\b|out of\s+\d+|\/\s*\d+)/i.test(replaced);
    return individual && score ? '' : replaced;
  };
  const cleanText = value => typeof value === 'string' ? value.split('\n').map(clean).filter(Boolean).join('\n') : value;
  const cleanObject = object => {
    if (!object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string') object[key] = cleanText(value);
      else if (Array.isArray(value)) object[key] = value.map(item => typeof item === 'string' ? cleanText(item) : item).filter(item => item !== '');
    }
  };
  cleanObject(result.source);
  cleanObject(result.lessonInputs?.entry?.observerCard);
  cleanObject(result.lessonInputs?.entry?.teacherBrief);
  result.commitments = (result.commitments || []).map(item => ({ ...item, text: cleanText(item.text) })).filter(item => item.text);
  for (const tree of Object.values(result.lessonInputs?.trees || {})) {
    for (const node of tree.nodes || []) {
      node.front = cleanText(node.front);
      node.back = cleanText(node.back);
    }
  }
  for (const item of result.lessonInputs?.fallbackItems || []) {
    item.front = cleanText(item.front);
    item.back = cleanText(item.back);
  }
  for (const decision of result.decisions || []) cleanObject(decision.set);
  return result;
}
