// Read the teacher's questions beside numbered examples in the TE transcription.
// This is extraction only: answers and cautions stay as printed, with their source.
// Anchor 0 is the Explore opener, and is deliberately not an example prompt.

const SYMBOLS = {
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
  times: '×', cdot: '·', pm: '±', mp: '∓', div: '÷', infty: '∞', pi: 'π',
  theta: 'θ', alpha: 'α', beta: 'β', sigma: 'σ', mu: 'μ', Delta: 'Δ',
  rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔',
  mid: ' | ', in: '∈', notin: '∉', cup: '∪', cap: '∩',
  ldots: '…', cdots: '…', ell: 'ℓ', circ: '°', textcent: '¢',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  langle: '⟨', rangle: '⟩', angle: '∠', triangle: '△', Omega: 'Ω',
  sim: '∼', sum: 'Σ', vdots: '⋮', textdegree: '°',
  longrightarrow: '→', Leftrightarrow: '⇔', square: '□', blacksquare: '■',
};
const FORMATTING = new Set(['text', 'textbf', 'textit', 'textrm', 'textnormal', 'mathrm',
  'mathbf', 'mathit', 'mathbb', 'operatorname', 'emph', 'underline', 'boxed', 'answer', 'te', 'uncertain']);
const SPACING = new Set(['quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace',
  'smallskip', 'medskip', 'bigskip', 'newline', 'par']);
const INVISIBLE = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle',
  'textstyle', 'scriptstyle', 'toprule', 'midrule', 'bottomrule', 'hline']);

function escapedAt(text, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

// Blank comments without shifting offsets, so provenance stays exact.
function withoutComments(text) {
  return String(text ?? '').split('\n').map(line => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '%' && !escapedAt(line, i)) return line.slice(0, i) + ' '.repeat(line.length - i);
    }
    return line;
  }).join('\n');
}

function groupAt(text, start, open = '{', close = '}') {
  let index = start;
  while (/\s/.test(text[index] ?? '') && index < text.length) index++;
  if (text[index] !== open) return null;
  let depth = 1;
  for (let i = index + 1; i < text.length; i++) {
    if (escapedAt(text, i)) continue;
    if (text[i] === open) depth++;
    if (text[i] === close) depth--;
    if (depth === 0) return { text: text.slice(index + 1, i), start: index, end: i + 1 };
  }
  return null;
}

const fractionPart = text => /^[-+]?\w+$/.test(text) ? text : `(${text})`;

// TeX also allows a single token instead of a braced argument: \frac12 or \frac x2.
function argumentAt(text, start) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index++;
  const group = groupAt(text, index);
  if (group) return group;
  if (index >= text.length) return null;
  const command = /^\\(?:[A-Za-z]+|.)/s.exec(text.slice(index));
  const token = command ? command[0] : text[index];
  return { text: token, start: index, end: index + token.length };
}

function tableAt(text, start) {
  const begin = /^\s*\\begin\{tabular\}/.exec(text.slice(start));
  if (!begin) return null;
  let index = start + begin[0].length;
  const placement = groupAt(text, index, '[', ']');
  if (placement) index = placement.end;
  const columns = groupAt(text, index);
  if (!columns) return null;
  const closing = text.indexOf('\\end{tabular}', columns.end);
  if (closing < 0) return null;
  return { body: text.slice(columns.end, closing), start, end: closing + '\\end{tabular}'.length };
}

function renderTable(body) {
  const rows = [];
  let cells = [];
  let cellStart = 0;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (escapedAt(body, i)) continue;
    if (body[i] === '{') depth++;
    if (body[i] === '}') depth--;
    if (depth !== 0) continue;
    if (body[i] === '&') {
      cells.push(body.slice(cellStart, i));
      cellStart = i + 1;
    }
    if (body[i] === '\\' && body[i + 1] === '\\') {
      cells.push(body.slice(cellStart, i));
      rows.push(cells);
      cells = [];
      i++;
      const spacing = groupAt(body, i + 1, '[', ']');
      if (spacing) i = spacing.end - 1;
      cellStart = i + 1;
    }
  }
  cells.push(body.slice(cellStart));
  rows.push(cells);
  return rows.map(row => row.map(cell => renderText(cell).replace(/\s+/g, ' ').trim()))
    .filter(row => row.some(Boolean)).map(row => row.join(' | ')).join('; ');
}

function adjacentAnswerTables(text, start) {
  const tables = [];
  let index = start;
  for (let table = tableAt(text, index); table; table = tableAt(text, index)) {
    tables.push(teacherText(text.slice(table.start, table.end)));
    index = table.end;
  }
  return tables;
}

// Small balanced-brace renderer for the transcription's text and inline math.
// It never evaluates TeX, and keeps grouping in fractions, roots, and exponents.
function renderText(text) {
  let result = '';
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === '{') {
      const group = groupAt(text, i);
      if (group) { result += renderText(group.text); i = group.end; continue; }
    }
    if (char === '^' || char === '_') {
      const group = groupAt(text, i + 1);
      if (group) {
        const value = renderText(group.text);
        result += char + (value.length === 1 || /^\d+$/.test(value) ? value : `(${value})`);
        i = group.end;
        continue;
      }
    }
    if (char !== '\\') {
      result += char === '$' ? '' : ['~', '&'].includes(char) ? ' ' : char;
      i++;
      continue;
    }

    const commandStart = i;
    const command = /^\\([A-Za-z]+|.)/s.exec(text.slice(i));
    if (!command) { i++; continue; }
    const name = command[1];
    i += command[0].length;
    if (name === '\\') { result += '; '; continue; }
    if (['{', '}', '%', '$', '&', '_', '#'].includes(name)) { result += name; continue; }
    if (['(', ')', '[', ']'].includes(name)) continue;
    if ([' ', ',', ';', ':', '!'].includes(name)) { result += ' '; continue; }
    if (Object.hasOwn(SYMBOLS, name)) { result += SYMBOLS[name]; continue; }
    if (SPACING.has(name)) { result += ' '; continue; }
    if (INVISIBLE.has(name)) continue;

    if (['frac', 'dfrac', 'tfrac', 'binom'].includes(name)) {
      const first = argumentAt(text, i);
      const second = first && argumentAt(text, first.end);
      if (first && second) {
        const numerator = renderText(first.text).trim();
        const denominator = renderText(second.text).trim();
        result += name === 'binom' ? `C(${numerator}, ${denominator})`
          : `${fractionPart(numerator)}/${fractionPart(denominator)}`;
        i = second.end;
        continue;
      }
    }
    if (name === 'sqrt') {
      const index = groupAt(text, i, '[', ']');
      const radicand = argumentAt(text, index ? index.end : i);
      if (radicand) {
        result += index ? `root[${renderText(index.text)}](${renderText(radicand.text)})`
          : `√(${renderText(radicand.text)})`;
        i = radicand.end;
        continue;
      }
    }
    if (name === 'begin' || name === 'end') {
      const table = name === 'begin' && tableAt(text, commandStart);
      if (table) {
        result += renderTable(table.body);
        i = table.end;
        continue;
      }
      const environment = groupAt(text, i);
      if (environment) {
        i = environment.end;
        if (name === 'begin' && ['array', 'tabular'].includes(environment.text)) {
          const columns = groupAt(text, i);
          if (columns) i = columns.end;
        }
        result += environment.text === 'cases' ? (name === 'begin' ? '{ ' : ' }') : ' ';
        continue;
      }
    }
    if (name === 'placeholder') {
      const kind = groupAt(text, i);
      const description = kind && groupAt(text, kind.end);
      if (description) { i = description.end; continue; }
    }
    if (['hspace', 'vspace', 'phantom', 'label', 'index'].includes(name)) {
      const value = groupAt(text, i);
      if (value) { i = value.end; continue; }
    }
    if (name === 'textcolor') {
      const color = groupAt(text, i);
      const value = color && groupAt(text, color.end);
      if (value) { result += renderText(value.text); i = value.end; continue; }
    }
    if (FORMATTING.has(name)) {
      const value = groupAt(text, i);
      if (value) { result += renderText(value.text); i = value.end; continue; }
    }
    if (['bar', 'overline', 'widehat', 'vec', 'overrightarrow'].includes(name)) {
      const value = argumentAt(text, i);
      if (value) {
        const label = ['vec', 'overrightarrow'].includes(name) ? 'vector' : name === 'widehat' ? 'arc' : 'bar';
        result += `${label}(${renderText(value.text)})`;
        i = value.end;
        continue;
      }
    }
    if (name === 'item') { result += ' '; continue; }
    // Keep unfamiliar mathematical operators readable instead of dropping them.
    result += name;
  }
  return result;
}

export function teacherText(tex) {
  return renderText(withoutComments(tex)).replace(/\s+/g, ' ')
    .replace(/([⟨⌊⌈])\s+/g, '$1').replace(/\s+([⟩⌋⌉])/g, '$1').trim();
}

function commandGroups(text, name) {
  const groups = [];
  const pattern = new RegExp(`\\\\${name}\\s*\\{`, 'g');
  let match;
  while ((match = pattern.exec(text))) {
    const group = groupAt(text, match.index + match[0].length - 1);
    if (!group) continue;
    groups.push({ ...group, start: match.index });
    pattern.lastIndex = group.end;
  }
  return groups;
}

function omitCommands(text, names) {
  const ranges = names.flatMap(name => commandGroups(text, name)).sort((a, b) => b.start - a.start);
  let result = text;
  for (const range of ranges) result = result.slice(0, range.start) + result.slice(range.end);
  return result;
}

function pageAt(text, offset) {
  const pages = [...text.slice(0, offset).matchAll(/^\s*%\s*Source page\s+([^\r\n]+)/gm)];
  return pages.length ? pages[pages.length - 1][1].trim() : null;
}

function figureDescriptions(text) {
  const figures = [];
  const pattern = /\\placeholder\s*\{/g;
  let match;
  while ((match = pattern.exec(text))) {
    const kind = groupAt(text, match.index + match[0].length - 1);
    const description = kind && groupAt(text, kind.end);
    if (!description) continue;
    figures.push({ kind: teacherText(kind.text), description: teacherText(description.text) });
    pattern.lastIndex = description.end;
  }
  return figures;
}

function inlineCommonErrors(text, original, sourceFile) {
  const examples = /\\begin\{example\}\s*\{([1-9]\d*)\}([\s\S]*?)\\end\{example\}/g;
  const counts = new Map();
  const prompts = [];
  let match;
  while ((match = examples.exec(text))) {
    const example = Number(match[1]);
    const body = match[2];
    const bodyOffset = match.index + match[0].indexOf(body);
    for (const note of commandGroups(body, 'te')) {
      const rendered = teacherText(note.text);
      if (!/^COMMON\s+ERROR\s*[:.—–-]/i.test(rendered)) continue;
      const answer = rendered.replace(/^COMMON\s+ERROR\s*[:.—–-]\s*/i, '').trim();
      if (!answer) continue;
      const item = counts.get(example) || 0;
      counts.set(example, item + 1);
      const offset = bodyOffset + note.start;
      prompts.push({
        example, category: 'InlineCommonError', key: `examples[n=${example}].teacherPrompts.inlineCommonError[${item}]`,
        kind: 'trap', question: 'What misconception should I watch for?', answer,
        variant: 'example', notes: [],
        source: { file: sourceFile, anchor: example, category: 'InlineCommonError', block: 0, item,
          line: text.slice(0, offset).split('\n').length, page: pageAt(original, offset) },
      });
    }
  }
  return prompts;
}

/**
 * Extract numbered-example prompts from a TE .tex source, in source order.
 * Keys use anchor/category/block/item positions, never the question's wording.
 * `notes` preserves transcription cautions; callers can flag or omit disputed text.
 */
export function parseTeacherPrompts(tex, { sourceFile = '' } = {}) {
  const original = String(tex ?? '');
  const text = withoutComments(original);
  const blocks = /\\begin\{te-addendum\}\s*\{([^}]+)\}\s*\{([^}]+)\}([\s\S]*?)\\end\{te-addendum\}/g;
  const counts = new Map();
  const prompts = [];
  let match;
  while ((match = blocks.exec(text))) {
    const anchor = match[1].trim();
    if (!/^[1-9]\d*$/.test(anchor)) continue;
    const example = Number(anchor);
    const category = match[2].trim();
    const categoryKey = `${example}|${category}`;
    const block = counts.get(categoryKey) || 0;
    counts.set(categoryKey, block + 1);
    const body = match[3];
    const bodyOffset = match.index + match[0].indexOf(body);
    const questions = [...body.matchAll(/^\s*Q:\s*/gm)];
    const preamble = questions.length ? body.slice(0, questions[0].index) : '';
    const context = { text: teacherText(preamble), figures: figureDescriptions(preamble) };
    const variant = /ADDITIONAL\s+EXAMPLE/i.test(body) ? 'additional' : 'example';
    const sourceBase = {
      file: sourceFile, anchor: example, category, block,
      page: pageAt(original, match.index),
    };
    const keyBase = `examples[n=${example}].teacherPrompts.${category}[${block}]`;

    questions.forEach((question, item) => {
      const start = question.index + question[0].length;
      const end = questions[item + 1]?.index ?? body.length;
      const region = body.slice(start, end);
      const answer = commandGroups(region, 'answer')[0];
      // No answer in this question's region means no fabricated or borrowed answer.
      if (!answer) return;
      const q = teacherText(region.slice(0, answer.start));
      const a = [teacherText(answer.text), ...adjacentAnswerTables(region, answer.end)].filter(Boolean).join(' ');
      if (!q || !a) return;
      const notes = commandGroups(region.slice(answer.end), 'te').map(note => teacherText(note.text)).filter(Boolean);
      prompts.push({
        example, category, key: `${keyBase}.questions[${item}]`, kind: 'question',
        question: q, answer: a, variant, notes,
        context: { text: context.text, figures: [...context.figures, ...figureDescriptions(region.slice(0, answer.start))] },
        source: { ...sourceBase, item, line: text.slice(0, bodyOffset + start).split('\n').length },
      });
    });

    // A standalone teaching response is useful without manufacturing a student question.
    // Graph-dependent support and blocks already represented by Q/A cards stay out here.
    if (questions.length || !['CommonError', 'RtISupport'].includes(category) || /\\placeholder\s*\{/.test(body)) continue;
    const guidance = teacherText(omitCommands(body, ['textbf', 'te', 'answer']))
      .replace(/^USE WITH EXAMPLES?\s+[\d,& ]+\s*/i, '').trim();
    if (!guidance) continue;
    prompts.push({
      example, category, key: `${keyBase}.guidance`, kind: category === 'CommonError' ? 'trap' : 'support',
      question: category === 'CommonError' ? 'What error should I watch for, and how does the TE respond?' : 'How does the TE support students who struggle?',
      answer: guidance, variant,
      notes: commandGroups(body, 'te').map(note => teacherText(note.text)).filter(Boolean),
      source: { ...sourceBase, item: 0, line: text.slice(0, match.index).split('\n').length },
    });
  }
  prompts.push(...inlineCommonErrors(text, original, sourceFile));
  return prompts.sort((a, b) => a.source.line - b.source.line);
}
