# Algebra 2 lesson targets: Precalculus prerequisite vs. SAT relevance

**Status: discussion draft.** Distilled from two department PLC meetings in September 2026 and the
department-facing PDF the teacher circulated. The department has not adopted it. It records the
teacher's current intent for what to teach, compress, or skip in SY2026-27, and it drives the
order in which lessons get authored and published in `content/a2/`. Machine-readable copy:
`data/a2-lesson-targets.json` (pinned by `tests/a2-lesson-targets.test.js`).

## Why this exists

Last year the course only reached Topic 4. Topics 1-4 are the foundation for both Precalculus and
the SAT, so they cannot be skipped, but taught in full they consume the year. The plan is to
**compress Topics 1-4 heavily, then reach the bridge material in Topics 5-7** that students
otherwise never see before Precalculus.

Two lenses are not enough. "Not on the SAT" is not the same as "not important" (properties of
logarithms), and "not a Precalculus prerequisite" is not the same as "low value" (sampling methods).
Read every row with a third lens in mind: **foundational value for Algebra 2 itself.**

## The plan

### Bare-minimum Topics 1-4 (17 of 25 sections)

| Topic | Keep | Compress (brief) or skip |
|---|---|---|
| 1 Linear functions and systems | 1-1 Key Features of Functions, 1-2 Transformations, 1-5 Solving by Graphing, 1-6 Linear Systems | 1-3 Piecewise (brief), 1-4 Arithmetic Sequences (brief or skip) |
| 2 Quadratics | 2-1 Vertex Form, 2-2 Standard Form, 2-3 Factored Form, 2-6 Quadratic Formula, 2-7 Linear-Quadratic Systems | 2-4 Complex Numbers (brief), 2-5 Completing the Square (brief) |
| 3 Polynomials | 3-1 Graphing Polynomials, 3-2 Polynomial Operations, 3-4 Dividing Polynomials, 3-5 Zeros | 3-3 Identities (brief), 3-6 Root Theorems (skip or brief), 3-7 Transformations (brief) |
| 4 Rational functions | 4-2 Graphing Rational Functions, 4-3 Multiply/Divide, 4-4 Add/Subtract, 4-5 Solving Rational Equations | 4-1 Inverse Variation (brief) |

Authoring order follows this list: `1-1, 1-2, 1-5, 1-6, 2-1, 2-2, 2-3, 2-6, 2-7, 3-1, 3-2, 3-4, 3-5, 4-2, 4-3, 4-4, 4-5`.

### Ultra-compressed core (9 sections, probably too compressed)

`1-1, 1-6, 2-2, 2-3, 2-6, 3-2, 3-5, 4-3, 4-5`. Preserves function interpretation, systems,
quadratic forms and solving, polynomial operations and zeros, and rational expressions and
equations. Marked `core: true` in the JSON. Use only if the year collapses.

### Bridge material after Topics 1-4

`5-1, 5-5, 5-6, 6-1, 6-2, 6-3, 6-6, 7-1, 7-2`, and ideally `7-3`. Radicals and rational exponents,
function operations and inverses, exponential features and models, logarithms and solving
exponential/log equations, right-triangle trig and the unit circle.

## Pacing (SY26-27)

Each lesson runs about two weeks. In `content/a2/lessons.json`, a lesson's `sections` date for
C, D, or G is the **last meeting day of its window**, which is the due date: after that day,
unattempted Try-Its, the lesson check, and the deck count as zero. The Desk and the teacher
scorer treat the first lesson whose date is not yet past as the current lesson. Meeting days:
C Mon/Tue/Thu, D Mon/Wed/Fri, G Tue/Wed/Thu/Fri; district holidays shift a due date earlier.

| Lesson | Window | C due | D due | G due |
|---|---|---|---|---|
| 1-1 | Sep 2 - Sep 25 (extended a week, 2026-09-16 decision) | 2026-09-24 | 2026-09-25 | 2026-09-25 |
| 1-2 | Sep 28 - Oct 9 | 2026-10-08 | 2026-10-09 | 2026-10-09 |
| 1-5 | Oct 12 - Oct 23 | 2026-10-22 | 2026-10-23 | 2026-10-23 |
| 1-6 | Oct 26 - Nov 6 | 2026-11-05 | 2026-11-06 | 2026-11-06 |

1-3 and 1-4 are brief lessons and are not scheduled or published. 1-6 now ends on the Q1 close
(Nov 6), so the Topic 1 assessment lands in the first days of Q2 unless a window is shortened. Dates can be overridden per section from the teacher pacing
tool without editing the file.

## Per-lesson classification

Ratings: **YES** clearly required or tested; **MAYBE** partially; **NO** not; **NO/MAYBE** mostly not.
Plan: **keep**, **brief**, **skip**, **bridge**, or **later** (unscheduled, only if time remains).

### Topic 1: Linear Functions and Systems

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 1-1 | Key Features of Functions | YES | YES | keep |
| 1-2 | Transformations of Functions | YES | MAYBE | keep |
| 1-3 | Piecewise-Defined Functions | YES | MAYBE | brief |
| 1-4 | Arithmetic Sequences and Series | MAYBE | YES | brief |
| 1-5 | Solving Equations and Inequalities by Graphing | YES | YES | keep |
| 1-6 | Linear Systems | YES | YES | keep |

### Topic 2: Quadratic Functions and Equations

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 2-1 | Vertex Form of a Quadratic Function | YES | YES | keep |
| 2-2 | Standard Form of a Quadratic Function | YES | YES | keep |
| 2-3 | Factored Form of a Quadratic Function | YES | YES | keep |
| 2-4 | Complex Numbers and Operations | YES | NO/MAYBE | brief |
| 2-5 | Completing the Square | YES | MAYBE | brief |
| 2-6 | Quadratic Formula | YES | YES | keep |
| 2-7 | Linear-Quadratic Systems | YES | YES | keep |

### Topic 3: Polynomial Functions

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 3-1 | Graphing Polynomial Functions | YES | MAYBE | keep |
| 3-2 | Adding, Subtracting, and Multiplying Polynomials | YES | YES | keep |
| 3-3 | Polynomial Identities / Binomial Theorem | MAYBE | MAYBE | brief |
| 3-4 | Dividing Polynomials | YES | MAYBE | keep |
| 3-5 | Zeros of Polynomial Functions | YES | YES | keep |
| 3-6 | Theorems About Roots of Polynomial Equations | YES | NO/MAYBE | skip |
| 3-7 | Transformations of Polynomial Functions | YES | MAYBE | brief |

### Topic 4: Rational Functions

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 4-1 | Inverse Variation and the Reciprocal Function | YES | MAYBE | brief |
| 4-2 | Graphing Rational Functions | YES | MAYBE | keep |
| 4-3 | Multiplying and Dividing Rational Expressions | YES | YES | keep |
| 4-4 | Adding and Subtracting Rational Expressions | YES | MAYBE | keep |
| 4-5 | Solving Rational Equations | YES | YES | keep |

### Topic 5: Rational Exponents and Radical Functions

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 5-1 | nth Roots, Radicals, and Rational Exponents | YES | YES | bridge |
| 5-2 | Properties of Exponents and Radicals | YES | YES | later |
| 5-3 | Graphing Radical Functions | YES | MAYBE | later |
| 5-4 | Solving Radical Equations | YES | YES | later |
| 5-5 | Function Operations | YES | MAYBE | bridge |
| 5-6 | Inverse Relations and Functions | YES | MAYBE | bridge |

### Topic 6: Exponential and Logarithmic Functions

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 6-1 | Key Features of Exponential Functions | YES | YES | bridge |
| 6-2 | Exponential Models | YES | YES | bridge |
| 6-3 | Logarithms | YES | MAYBE | bridge |
| 6-4 | Logarithmic Functions | YES | NO/MAYBE | later |
| 6-5 | Properties of Logarithms | YES | NO | later |
| 6-6 | Exponential and Logarithmic Equations | YES | MAYBE | bridge |
| 6-7 | Geometric Sequences and Series | YES | MAYBE | later |

6-1 and 6-2 are very high value for the SAT. Expanding and condensing logs (6-5) matters for
Precalculus but not the SAT.

### Topic 7: Trigonometric Functions

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 7-1 | Trigonometric Functions and Acute Angles | YES | YES | bridge |
| 7-2 | Angles and the Unit Circle | YES | MAYBE | bridge |
| 7-3 | Trigonometric Functions and Real Numbers | YES | MAYBE | bridge |
| 7-4 | Graphing Sine and Cosine Functions | YES | NO/MAYBE | later |
| 7-5 | Graphing Other Trigonometric Functions | YES | NO | later |
| 7-6 | Translating Trigonometric Functions | YES | NO | later |

Right-triangle trig is SAT-relevant; unit-circle work and trig graphing are Precalculus preparation.

### Topic 8: Trigonometric Equations and Identities

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 8-1 | Solving Trigonometric Equations Using Inverses | YES | NO/MAYBE | later |
| 8-2 | Law of Sines and Law of Cosines | MAYBE | MAYBE | later |
| 8-3 | Trigonometric Identities | YES | NO | later |
| 8-4 | The Complex Plane | MAYBE | NO | later |
| 8-5 | Polar Form of Complex Numbers | MAYBE | NO | later |

8-3 is important for Precalculus and almost irrelevant to the SAT; 8-4 and 8-5 are the easiest
compression candidates depending on the next course.

### Topic 9: Conic Sections

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 9-1 | Parabolas | YES | MAYBE | later |
| 9-2 | Circles | YES | YES | later |
| 9-3 | Ellipses | MAYBE | NO | later |
| 9-4 | Hyperbolas | MAYBE | NO | later |

Circles are the SAT-relevant piece; ellipses and hyperbolas generally are not.

### Topic 10: Matrices

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 10-1 | Operations With Matrices | MAYBE | NO | later |
| 10-2 | Matrix Multiplication | MAYBE | NO | later |
| 10-3 | Vectors | MAYBE | NO/MAYBE | later |
| 10-4 | Inverses and Determinants | MAYBE | NO | later |
| 10-5 | Inverse Matrices and Systems of Equations | MAYBE | NO | later |

The clearest low-SAT topic in the book. Precalculus relevance depends on what the school's
Precalculus course actually does.

### Topic 11: Data Analysis and Statistics

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 11-1 | Statistical Questions and Variables | NO | YES | later |
| 11-2 | Statistical Studies and Sampling Methods | NO | YES | later |
| 11-3 | Data Distributions | NO/MAYBE | YES | later |
| 11-4 | Normal Distributions | NO/MAYBE | MAYBE | later |
| 11-5 | Margin of Error | NO | MAYBE | later |
| 11-6 | Introduction to Hypothesis Testing | NO | NO/MAYBE | later |

The reverse of Topic 8: not a Precalculus prerequisite, but parts are valuable SAT preparation.

### Topic 12: Probability

| Lesson | Section | Precalc? | SAT? | Plan |
|---|---|---|---|---|
| 12-1 | Probability Events | NO | YES | later |
| 12-2 | Conditional Probability | NO | YES | later |
| 12-3 | Permutations and Combinations | MAYBE | MAYBE | later |
| 12-4 | Probability Distributions | NO/MAYBE | MAYBE | later |

## Topic 1 assessment audit (14 items)

Standards named in the curriculum map for Topic 1: F-IF.B.4, F-IF.B.5, F-IF.B.6, F-BF.B.3,
F-IF.C.7b, F-BF.A.2, A-REI.D.11, A-REI.C.6, A-CED.A.2/3. Highlighted practices: MP.3 (construct
viable arguments) and MP.7 (make use of structure).

| DOK | Items | Count |
|---|---|---|
| 1 Recall / routine procedure | 1, 4, 5, 12 | 4 |
| 2 Skill / concept | 2, 3, 6, 7, 8, 9, 10, 11, 13, 14 | 10 |
| 3 Strategic reasoning | none | 0 |
| 4 Extended thinking | none | 0 |

Findings worth carrying into lesson checks and topic assessments:

- Content coverage is good, but the assessment is roughly 29% DOK 1 and 71% DOK 2 with no DOK 3
  item. Nothing asks students to justify, critique, compare strategies, or construct an argument,
  despite MP.3 and MP.7 being the highlighted practices.
- Items 13 and 14 use three-variable systems. The listed standard A-REI.C.6 specifies pairs of
  equations in two variables, so label those items Savvas Topic 1 extension content rather than a
  Massachusetts standard requirement.

## How the platform uses this

- `data/a2-lesson-targets.json` is the source of truth for plan and ratings. Edit it and this
  document together.
- Lesson authoring and publishing into `content/a2/` follow the bare-minimum order, then the
  bridge list. Lessons marked `later` are not authored until the department decides otherwise
  (the test refuses to publish one). Brief and skip lessons may still be authored as short treatments.
- Teacher lesson-plan source docs (objectives, standards, language objectives) live in
  `content/a2/source-docs/`; lessons 1-2 through 1-6 were added 2026-09-16.
- The classification does not change grading. Every published lesson keeps the same Try-It,
  lesson-check, flashcard, and IXL supporting-skill pieces regardless of plan.
