// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLessonTeacherPrompts } from '../scripts/lib/lesson-teacher-source.mjs';

const folders = [];
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'lesson-teacher-source-'));
  folders.push(dir);
  const teDir = join(dir, 'te');
  const cacheDir = join(dir, 'cache');
  mkdirSync(teDir);
  mkdirSync(cacheDir);
  return { teDir, cacheDir };
}

const prep = { title: 'Piecewise functions', examples: [
  { n: 3, keep: true, title: 'Write a rule' },
  { n: 4, keep: false, title: 'Absolute value' },
  { n: 5, keep: true, title: 'Step functions' },
] };

const tex = String.raw`% Source page 42: 25 STEP 2 Understand & Apply
\begin{te-addendum}{3}{GeneralizeETP}
Q: What does a horizontal piece mean?
\answer{Its slope is 0.}
\end{te-addendum}
\begin{te-addendum}{5}{GeneralizeETP}
Q: What makes this a step function?
\answer{Each piece is constant.}
\te{Examples are available at SavvasRealize.com.}
\end{te-addendum}`;

const prompt = (example, extra = {}) => ({
  example, category: 'GeneralizeETP', key: `examples[n=${example}].teacherPrompts.GeneralizeETP[0].questions[0]`,
  kind: 'question', question: 'What do you notice?', answer: 'A constant piece.', variant: 'example', notes: [],
  source: { file: 'a2_1-3_TE.tex', anchor: example, category: 'GeneralizeETP', block: 0, item: 0, line: 3, page: '42: 25' },
  ...extra,
});

describe('loadLessonTeacherPrompts', () => {
  it('reads current TE ahead of cache, preserves provenance, and only returns a deterministic cache write', () => {
    const options = fixture();
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), tex);
    const cacheFile = join(options.cacheDir, '1-3.json');
    writeFileSync(cacheFile, JSON.stringify({ lesson: '1-3', prompts: [prompt(3), prompt(5)] }));
    const originalCache = readFileSync(cacheFile, 'utf8');
    const result = loadLessonTeacherPrompts('1-3', prep, options);
    expect(result.origin).toBe('textbook');
    expect(result.prep.examples[0].teacherPrompts[0]).toMatchObject({
      question: 'What does a horizontal piece mean?', answer: 'Its slope is 0.',
      source: { file: 'a2_1-3_TE.tex', anchor: 3, page: '42: 25 STEP 2 Understand & Apply' },
    });
    expect(result.prep.examples[2].teacherPrompts[0].notes).toEqual(['Examples are available at SavvasRealize.com.']);
    expect(prep.examples[0]).not.toHaveProperty('teacherPrompts');
    expect(result.cache.path).toBe(cacheFile);
    expect(readFileSync(cacheFile, 'utf8')).toBe(originalCache);
    expect(loadLessonTeacherPrompts('1-3', prep, options).cache).toEqual(result.cache);
    expect(result.warnings).toEqual([]);
  });

  it('uses the saved cache on a machine without the sibling textbook repo', () => {
    const options = fixture();
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), tex);
    const textbook = loadLessonTeacherPrompts('1-3', prep, options);
    writeFileSync(textbook.cache.path, textbook.cache.text);
    const cached = loadLessonTeacherPrompts('1-3', prep, { ...options, teDir: join(options.teDir, 'absent') });
    expect(cached.origin).toBe('cache');
    expect(cached.cache).toBeNull();
    expect(cached.prep).toEqual(textbook.prep);
  });

  it('supports authored prompts without overwriting prep or creating cache files', () => {
    const options = fixture();
    const authored = { ...prep, examples: prep.examples.map(example => ({ ...example,
      teacherPrompts: example.keep ? [{ q: `Question for ${example.n}?`, a: 'Response.', purpose: 'Connect representations' }] : [],
    })) };
    const result = loadLessonTeacherPrompts('1-3', authored, options);
    expect(result.origin).toBe('authored');
    expect(result.cache).toBeNull();
    expect(result.prep.examples[0].teacherPrompts[0]).toMatchObject({
      example: 3, key: 'examples[n=3].teacherPrompts.authored[0]',
      question: 'Question for 3?', answer: 'Response.', purpose: 'Connect representations',
      source: { file: 'lesson-prep.json', anchor: 3 },
    });
    expect(authored.examples[0].teacherPrompts[0]).not.toHaveProperty('key');
    expect(existsSync(join(options.cacheDir, '1-3.json'))).toBe(false);
  });

  it('uses authored guidance only when a kept example has no usable textbook or cached prompts', () => {
    const options = fixture();
    const source = tex.replace('Each piece is constant.', 'The slope is 2.')
      .replace('Examples are available at SavvasRealize.com.', 'Printed teacher answer says 2; the function has slope 0.');
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), source);
    const authored = { ...prep, examples: prep.examples.map(example => ({ ...example,
      teacherPrompts: [{ question: `Reviewed question for ${example.n}?`, answer: 'Reviewed response.' }],
    })) };
    const result = loadLessonTeacherPrompts('1-3', authored, options);
    expect(result.origin).toBe('textbook');
    expect(result.prep.examples[0].teacherPrompts[0].question).toBe('What does a horizontal piece mean?');
    expect(result.prep.examples[1].teacherPrompts).toEqual([]); // A cut example does not gain fallback guidance.
    expect(result.prep.examples[2].teacherPrompts[0]).toMatchObject({
      question: 'Reviewed question for 5?', answer: 'Reviewed response.',
      source: { file: 'lesson-prep.json', anchor: 5 },
    });
    expect(result.warnings).toContain('1-3: using authored teacher prompts for kept Example 5; no usable textbook prompts');
    expect(JSON.parse(result.cache.text).prompts[1].answer).toBe('The slope is 2.');
    writeFileSync(result.cache.path, result.cache.text);
    const cached = loadLessonTeacherPrompts('1-3', authored, { ...options, teDir: undefined });
    expect(cached.prep).toEqual(result.prep);
    expect(cached.origin).toBe('cache');
    expect(cached.cache).toBeNull();
  });

  it('does not accept additional or disputed authored fallback as usable coverage', () => {
    const options = fixture();
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), '% no numbered example guidance');
    const authored = { examples: [{ n: 3, keep: true, teacherPrompts: [
      { question: 'Additional?', answer: 'Yes.', variant: 'additional' },
      { question: 'Question?', answer: 'Unverified.', notes: ['Printed factor is likely wrong.'] },
    ] }] };
    expect(() => loadLessonTeacherPrompts('1-3', authored, options)).toThrow(/kept Example 3.*additional example.*printed-answer discrepancy/);
  });

  it('requires usable coverage for every kept example and ignores cut examples', () => {
    const options = fixture();
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/1-3: no usable teacher prompts for kept Examples 3, 5/);
    writeFileSync(join(options.cacheDir, '1-3.json'), JSON.stringify({ lesson: '1-3', prompts: [prompt(3)] }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/kept Example 5/);
    const result = loadLessonTeacherPrompts('1-3', { ...prep, examples: prep.examples.slice(0, 2) }, options);
    expect(result.prep.examples[1].teacherPrompts).toEqual([]);
  });

  it('keeps all source prompts in the cache but excludes additional and disputed prompts from practice', () => {
    const options = fixture();
    const extra = String.raw`
\begin{te-addendum}{3}{PurposefulQuestions}
\textbf{ADDITIONAL EXAMPLE 3}
Q: Another graph?
\answer{It is linear.}
\end{te-addendum}
\begin{te-addendum}{5}{ElicitEvidence}
Q: Which slope?
\answer{The slope is 2.}
\te{Printed teacher answer says 2; digital prompt and plotted line use 3.}
\end{te-addendum}`;
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), tex + extra);
    const result = loadLessonTeacherPrompts('1-3', prep, options);
    expect(JSON.parse(result.cache.text).prompts).toHaveLength(4);
    expect(result.prep.examples.flatMap(example => example.teacherPrompts)).toHaveLength(2);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(' ')).toMatch(/additional example/);
    expect(result.warnings.join(' ')).toMatch(/printed-answer discrepancy/);
    writeFileSync(result.cache.path, result.cache.text);
    const cached = loadLessonTeacherPrompts('1-3', prep, { ...options, teDir: undefined });
    expect(cached.prep).toEqual(result.prep);
    expect(cached.warnings).toEqual(result.warnings);
  });

  it('explains exclusions if they leave an example with no usable guidance', () => {
    const options = fixture();
    const prompts = [prompt(3), prompt(5, { notes: ['Printed factor conflicts with the function; likely 4.'] })];
    writeFileSync(join(options.cacheDir, '1-3.json'), JSON.stringify({ lesson: '1-3', prompts }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/kept Example 5.*printed-answer discrepancy/);
    const legacy = loadLessonTeacherPrompts('1-3', prep, { ...options, required: false });
    expect(legacy.prep.examples[2].teacherPrompts).toEqual([]);
    expect(legacy.warnings).toHaveLength(2);
  });

  it('allows legacy callers to have no teacher guidance without changing their prep', () => {
    const result = loadLessonTeacherPrompts('1-3', prep, { ...fixture(), required: false });
    expect(result).toEqual({ prep, origin: 'none', cache: null, warnings: [] });
    expect(result.prep).toBe(prep);
  });

  it('rejects malformed or mismatched caches instead of silently falling back to authored guidance', () => {
    const options = fixture();
    const cacheFile = join(options.cacheDir, '1-3.json');
    writeFileSync(cacheFile, '{');
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/cannot read teacher-prompt cache/);
    writeFileSync(cacheFile, JSON.stringify({ lesson: '1-2', prompts: [] }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/cache must contain this lesson/);
    writeFileSync(cacheFile, JSON.stringify({ lesson: '1-3', prompts: [{ example: 3 }] }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/needs a numbered example, question, and answer/);
    writeFileSync(cacheFile, JSON.stringify({ lesson: '1-3', prompts: [prompt(3), prompt(3), prompt(5)] }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/duplicate teacher-prompt key/);
  });

  it('does not hide missing coverage in a current textbook behind an older cache', () => {
    const options = fixture();
    writeFileSync(join(options.teDir, 'a2_1-3_TE.tex'), '% no prompts');
    writeFileSync(join(options.cacheDir, '1-3.json'), JSON.stringify({ lesson: '1-3', prompts: [prompt(3), prompt(5)] }));
    expect(() => loadLessonTeacherPrompts('1-3', prep, options)).toThrow(/kept Examples 3, 5/);
    expect(() => loadLessonTeacherPrompts('../1-3', prep, options)).toThrow(/invalid teacher-prompt lesson/);
  });
});
