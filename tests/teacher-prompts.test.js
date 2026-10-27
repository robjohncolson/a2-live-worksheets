// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseTeacherPrompts, teacherText } from '../scripts/lib/teacher-prompts.mjs';

const fixture = String.raw`% Source page 44: 27 STEP 2 Understand & Apply
\begin{te-addendum}{0}{GeneralizeETP}
Q: Opener?
\answer{Keep the opener separate.}
\end{te-addendum}
\begin{te-addendum}{5}{GeneralizeETP}
\textbf{EXAMPLE 5 Graph a Step Function}
Q: What do you notice about the graph?
\answer{An open circle means the point is not included. A closed circle means it is included.}
Q: How does a step function compare to a piecewise-defined function?
\answer{A step function is a piecewise-defined function containing all constant pieces.}
Q: Are step functions continuous functions? Explain.
\answer{No. You need to remove your pencil from the paper when sketching the graph.}
\end{te-addendum}
\begin{te-addendum}{5}{HabitsOfMind}
Q: How would a piecewise-defined rule show that the graph is a step function?
\answer{The rule for each interval would simply be a constant.}
\end{te-addendum}
\begin{te-addendum}{ConceptSummary}{GeneralizeETP}
Q: Summary question?
\answer{Not anchored to an example.}
\end{te-addendum}`;

describe('teacherText', () => {
  it('keeps nested fractions, radicals, sets, powers, and interval endpoints readable', () => {
    expect(teacherText(String.raw`\textbf{Compare} $\frac{1}{\frac{x+1}{2}}$ and \sqrt[3]{x^{n+1}}; \{x\mid 0<x\leq 8\}, (0,2].`))
      .toBe('Compare 1/((x+1)/2) and root[3](x^(n+1)); {x | 0<x≤ 8}, (0,2].');
    expect(teacherText(String.raw`\frac{1}{2}x, \sqrt{x^2+1}, 2\times3, 50\%, \$5 % omitted
next line`)).toBe('1/2x, √(x^2+1), 2×3, 50%, $5 next line');
  });

  it('renders piecewise answers without losing nested text or literal set braces', () => {
    expect(teacherText(String.raw`f(x)=\begin{cases}\frac{x}{2},&\text{if }x<0\\-\frac{x}{2}+3,&\text{if }x\geq0\end{cases}`))
      .toBe('f(x)={ x/2, if x<0; -x/2+3, if x≥0 }');
  });

  it('handles unbraced fraction tokens and common notation from later lessons', () => {
    expect(teacherText(String.raw`\frac16, \frac d6, \frac{\frac12}{3}, \sqrt2, \langle a,b\rangle, \overline{x}, \vec{v}`))
      .toBe('1/6, d/6, (1/2)/3, √(2), ⟨a,b⟩, bar(x), vector(v)');
  });

  it('keeps table row labels and columns readable, including nested math', () => {
    expect(teacherText(String.raw`\begin{tabular}{lll}
x & \frac{1}{2} & 4 \\
y & -5 & 30 \\
\end{tabular}`)).toBe('x | 1/2 | 4; y | -5 | 30');
  });
});

describe('parseTeacherPrompts', () => {
  it('extracts all example questions while excluding Explore and concept-summary questions', () => {
    const prompts = parseTeacherPrompts(fixture, { sourceFile: 'a2_1-3_TE.tex' });
    expect(prompts).toHaveLength(4);
    expect(prompts.map(prompt => prompt.example)).toEqual([5, 5, 5, 5]);
    expect(prompts[1]).toMatchObject({
      category: 'GeneralizeETP', kind: 'question', variant: 'example', notes: [],
      key: 'examples[n=5].teacherPrompts.GeneralizeETP[0].questions[1]',
      question: 'How does a step function compare to a piecewise-defined function?',
      answer: 'A step function is a piecewise-defined function containing all constant pieces.',
      source: { file: 'a2_1-3_TE.tex', anchor: 5, category: 'GeneralizeETP', block: 0, item: 1, line: 10,
        page: '44: 27 STEP 2 Understand & Apply' },
    });
  });

  it('keeps keys stable through wording edits and separates repeated category blocks', () => {
    const extra = String.raw`
\begin{te-addendum}{5}{GeneralizeETP}
Q: Another question?
\answer{Another answer.}
\end{te-addendum}`;
    const before = parseTeacherPrompts(fixture + extra);
    const after = parseTeacherPrompts((fixture + extra).replace('What do you notice', 'What can you observe'));
    expect(after.map(prompt => prompt.key)).toEqual(before.map(prompt => prompt.key));
    expect(before.at(-1).key).toBe('examples[n=5].teacherPrompts.GeneralizeETP[1].questions[0]');
  });

  it('pairs a question only with its own complete nested answer', () => {
    const prompts = parseTeacherPrompts(String.raw`
\begin{te-addendum}{3}{PurposefulQuestions}
\answer{Earlier worked-example solution must not be used.}
Q: No answer here?
Q: State the rule:
for positive inputs?
\answer{\textbf{Use} \frac{x+1}{\sqrt{x^{2}+1}} for \{x\mid x>0\}.}
Q: A malformed answer?
\answer{Never closed
\end{te-addendum}`);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].key).toBe('examples[n=3].teacherPrompts.PurposefulQuestions[0].questions[1]');
    expect(prompts[0].question).toBe('State the rule: for positive inputs?');
    expect(prompts[0].answer).toBe('Use (x+1)/(√(x^2+1)) for {x | x>0}.');
  });

  it('retains source cautions and labels additional examples without silently correcting the answer', () => {
    const prompts = parseTeacherPrompts(String.raw`
\begin{te-addendum}{3}{PurposefulQuestions}
\textbf{ADDITIONAL EXAMPLE 3}
Q: What happens to the output?
\answer{It is \frac{1}{3} of the original.}
\te{Printed factor conflicts with the displayed function; likely \frac{1}{4}.}
\end{te-addendum}`);
    expect(prompts[0]).toMatchObject({ variant: 'additional', answer: 'It is 1/3 of the original.',
      notes: ['Printed factor conflicts with the displayed function; likely 1/4.'] });
  });

  it('extracts standalone error responses and support but avoids duplicate or graph-dependent support', () => {
    const prompts = parseTeacherPrompts(String.raw`
\begin{te-addendum}{2}{CommonError}
\textbf{Common Error—Try It! 2b}
Students may include gaps in the domain. Have students trace every point.
\end{te-addendum}
\begin{te-addendum}{4}{RtISupport}
\textbf{Support Struggling Students}
USE WITH EXAMPLE 4 Have students label each interval before drawing.
\end{te-addendum}
\begin{te-addendum}{4}{RtISupport}
\placeholder{graph}{A diagram needed to use this support.}
Have students use this graph.
\end{te-addendum}
\begin{te-addendum}{4}{RtISupport}
Q: What is the vertex?
\answer{(0,0).}
\end{te-addendum}`);
    expect(prompts.map(prompt => prompt.kind)).toEqual(['trap', 'support', 'question']);
    expect(prompts[0].answer).toBe('Students may include gaps in the domain. Have students trace every point.');
    expect(prompts[1].answer).toBe('Have students label each interval before drawing.');
  });

  it('ignores commented questions and keeps the original source line and page', () => {
    const source = String.raw`% long comment to change character offsets but not line numbers
% Source page 42: 25 STEP 2
\begin{te-addendum}{3}{GeneralizeETP}
% Q: Do not extract this comment.
Q: Is 50\% a half?
\answer{Yes.}
\end{te-addendum}`;
    expect(parseTeacherPrompts(source)[0]).toMatchObject({ question: 'Is 50% a half?', source: { line: 5, page: '42: 25 STEP 2' } });
  });

  it('includes inline example misconceptions with stable source keys and leaves ordinary callouts out', () => {
    const source = String.raw`% Source page 44: 27 STEP 2 Understand & Apply
\begin{example}{5}
\te{Callout: Each y-value goes with an interval of x-values.}
\te{COMMON ERROR: You might think that the range is [5,14], but only \{5,8,11,14\} are possible outputs.}
\te{COMMON ERROR. Keep open and closed endpoints distinct.}
\end{example}
\begin{te-addendum}{5}{HabitsOfMind}
Q: What do the constant pieces show?
\answer{A step function.}
\end{te-addendum}`;
    const prompts = parseTeacherPrompts(source, { sourceFile: 'a2_1-3_TE.tex' });
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toMatchObject({
      kind: 'trap', example: 5, category: 'InlineCommonError', variant: 'example', notes: [],
      question: 'What misconception should I watch for?',
      answer: 'You might think that the range is [5,14], but only {5,8,11,14} are possible outputs.',
      key: 'examples[n=5].teacherPrompts.inlineCommonError[0]',
      source: { file: 'a2_1-3_TE.tex', anchor: 5, item: 0, line: 4, page: '44: 27 STEP 2 Understand & Apply' },
    });
    expect(prompts[1].key).toBe('examples[n=5].teacherPrompts.inlineCommonError[1]');
    expect(prompts[2].kind).toBe('question');
    expect(parseTeacherPrompts(source.replace('You might think', 'Students may think')).map(prompt => prompt.key))
      .toEqual(prompts.map(prompt => prompt.key));
  });

  it('includes a sample table directly after the answer without borrowing unrelated later content', () => {
    const source = String.raw`\begin{te-addendum}{5}{RtIExtend}
Q: State the minimum and maximum and create a table.
\answer{Answers may vary. Sample: Minimum (= -5); Maximum (=30).}
\begin{tabular}{llllll}
(x) & (-3<x\leq0) & (0<x\leq3) & (3<x\leq6) & (6<x\leq9) & (9<x\leq12) \\
(y) & (-5) & 4 & 13 & 21 & 30 \\
\end{tabular}
Q: A different question?
\answer{Only this answer.}
Unrelated explanation before another table.
\begin{tabular}{ll} unrelated & 999 \\ \end{tabular}
\end{te-addendum}`;
    const prompts = parseTeacherPrompts(source);
    expect(prompts[0].answer).toBe('Answers may vary. Sample: Minimum (= -5); Maximum (=30). '
      + '(x) | (-3<x≤0) | (0<x≤3) | (3<x≤6) | (6<x≤9) | (9<x≤12); (y) | (-5) | 4 | 13 | 21 | 30');
    expect(prompts[1].answer).toBe('Only this answer.');
  });

  it('keeps source directions and diagram descriptions as context for graph-dependent questions', () => {
    const source = String.raw`\begin{te-addendum}{4}{RtISupport}
\textbf{Support Struggling Students}
Have students practice using this graph.
\placeholder{graph}{A V with vertex (8,0); the stated function is f(x)=|x-8|.}
Q: How do you determine the function from the graph provided?
\answer{Use the vertex and the slopes.}
\end{te-addendum}`;
    expect(parseTeacherPrompts(source)[0]).toMatchObject({
      question: 'How do you determine the function from the graph provided?',
      context: { text: 'Support Struggling Students Have students practice using this graph.',
        figures: [{ kind: 'graph', description: 'A V with vertex (8,0); the stated function is f(x)=|x-8|.' }] },
    });
  });
});
