# Enriched Pass — Rollout to All Worksheets

## What Exists Today

**1 file has enriched pass:** `edgar_u6_conceptual_driller_live.html`

**37 files need it added.** All follow the same standard pattern:

| File Group | Count |
|------------|-------|
| `u3_lesson6-7_live.html` | 1 (special: uses `ReflectionGrader` class) |
| `u4_lesson*_live.html` | 6 |
| `u5_lesson*_live.html` | 6 |
| `u6_lesson*_live.html` | 10 |
| `u7_lesson*_live.html` | 9 |
| `u8_lesson*_live.html` | 3 |
| `mit_ocw_6.0001_lec*_live.html` | 2 |
| **Total** | **37** |

## The Two Patterns

**Standard pattern (36 files):** `gradeAllReflections()` loops over textarea IDs, calls `gradeReflection()`, then `showFeedback()`. The enrichment logic goes inside the loop, between `gradeReflection()` and `gradingState.set()`.

```javascript
// CURRENT (all 36 standard files):
const result = await gradeReflection(id, answer);
gradingState.set(id, { result, originalAnswer: answer, appealCount: 0, history: [] });
showFeedback(id, result);
```

**U3 exception (1 file):** `u3_lesson6-7_live.html` uses a `ReflectionGrader` class with `reflectionGrader.gradeReflection()`. Same insertion point, different call style.

## Per-File Changes (4 touches each)

For each of the 37 files:

### 1. CSS — Add `.enriched-pass` styles

After `.appeal-count` rule, before `#scoreDisplay`:

```css
/* Enriched pass — near-miss auto-upgrade */
.enriched-pass {
    margin-top: 8px;
    padding: 12px 14px;
    background: #e8f0fe;
    border-left: 4px solid #4285f4;
    border-radius: 4px;
    font-size: 0.9em;
}
.enriched-pass-header {
    font-weight: bold;
    color: #1a56db;
    margin-bottom: 6px;
    font-size: 1.05em;
}
.enriched-pass-subtext {
    color: #555;
    font-size: 0.92em;
    margin-bottom: 10px;
}
.enriched-pass-quote {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 10px 12px;
    color: #333;
    line-height: 1.5;
    font-style: italic;
}
.enriched-pass-quote strong {
    font-style: normal;
    background: #d4edda;
    padding: 1px 3px;
    border-radius: 2px;
}
.enriched-pass-score {
    margin-top: 8px;
    color: #155724;
    font-weight: bold;
    font-size: 0.95em;
}
```

### 2. Print CSS — Add `.enriched-pass` visibility rule

Current (all files):
```css
.controls, .aggregate-trigger, .aggregate-drawer, .save-indicator,
.appeal-section, .ai-feedback, .btn-ai { display: none !important; }
```

Add after:
```css
.enriched-pass { display: block !important; border-left-color: #000 !important; background: #f0f0f0 !important; }
```

Note: Some files have `.btn-grade-single` in the print hide list, some don't. Don't change what's already there — just add the `.enriched-pass` rule.

### 3. `resetAnswers()` — Clear feedback containers

Current (all 36 standard files):
```javascript
document.querySelectorAll('.ai-feedback').forEach(fb => fb.remove());
```

Replace with:
```javascript
document.querySelectorAll('[id$="-feedback"]').forEach(c => c.innerHTML = '');
```

This catches both `.ai-feedback` and `.enriched-pass` blocks.

### 4. `gradeAllReflections()` — Add enrichment logic + two new functions

Current inner loop:
```javascript
const result = await gradeReflection(id, answer);
gradingState.set(id, { ... });
showFeedback(id, result);
```

Replace with:
```javascript
const result = await gradeReflection(id, answer);

// --- Enriched Pass ---
if (result.score === 'P' && result.missing && result.missing.length === 0) {
    result.score = 'E';
    result.feedback = 'Nice work — you covered the key ideas.';
    result.suggestion = null;
}

const matchedCount = (result.matched || []).length;
const missingCount = (result.missing || []).length;
const totalElements = matchedCount + missingCount;
const hitRate = totalElements > 0 ? matchedCount / totalElements : 0;

if (result.score === 'P' && hitRate >= 0.3 && missingCount > 0) {
    btn.textContent = '\u2728 Polishing...';
    try {
        const enriched = await fetchEnrichedAnswer(id, answer, result.missing);
        if (enriched.score === 'E' && enriched.suggestion) {
            result.score = 'E';
            gradingState.set(id, { result, originalAnswer: answer, appealCount: 0, history: [] });
            renderEnrichedPass(id, enriched);
            continue;  // NOTE: continue, not return (we're in a for loop)
        }
    } catch (err) {
        console.warn('Enrichment failed, falling back to P:', err);
    }
}
// --- End Enriched Pass ---

gradingState.set(id, { ... });
showFeedback(id, result);
```

Key difference from Edgar: uses `continue` (inside `for` loop) instead of `return` (Edgar has no loop).

**Add two functions** after `gradeAllReflections()`:

```javascript
async function fetchEnrichedAnswer(questionId, studentAnswer, missingElements) {
    const missingList = missingElements.map(function(m, i) { return (i + 1) + '. ' + m; }).join('\n');
    const detailWord = missingElements.length === 1 ? 'one detail' : missingElements.length + ' small details';
    const prompt =
        'You are helping an AP Statistics student polish their answer. ' +
        'Their response was strong but missed ' + detailWord + '.\n\n' +
        '## Student\'s Original Answer\n"' + studentAnswer + '"\n\n' +
        '## What was missing\n' + missingList + '\n\n' +
        '## Instructions\n' +
        'Rewrite the student\'s answer to naturally include the missing concepts. Rules:\n' +
        '- Keep the student\'s voice, vocabulary, and sentence structure\n' +
        '- Weave the missing details in so it reads like the student wrote it\n' +
        '- Do NOT add anything beyond the missing elements listed above\n' +
        '- Keep it concise (add at most one sentence per missing element)\n' +
        '- Wrap ONLY the newly added words or phrases in <strong> tags\n\n' +
        'Respond in JSON format:\n' +
        '{\n' +
        '    "score": "E",\n' +
        '    "feedback": "You nailed the key ideas!",\n' +
        '    "matched": [],\n' +
        '    "missing": [],\n' +
        '    "suggestion": "the rewritten answer with <strong>added details</strong> highlighted"\n' +
        '}';

    const response = await fetch(`${window.RAILWAY_SERVER_URL}/api/ai/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            scenario: {
                topic: 'AP Statistics - Enriched Answer Polish',
                questionId,
                lessonContext: window.LESSON_CONTEXT_XXXX  // <-- VARIES PER FILE
            },
            answers: { answer: studentAnswer },
            prompt
        })
    });

    if (!response.ok) throw new Error('Enrichment request failed');
    return await response.json();
}

function renderEnrichedPass(questionId, enrichedResult) {
    const textarea = document.getElementById(questionId);
    if (!textarea) return;

    textarea.classList.remove('graded-E', 'graded-P', 'graded-I');
    textarea.classList.add('graded-E');

    const container = document.getElementById(`${questionId}-feedback`);
    container.innerHTML = '';

    const block = document.createElement('div');
    block.className = 'enriched-pass';
    block.innerHTML =
        '<div class="enriched-pass-header">\u2726 You nailed the key ideas!</div>' +
        '<div class="enriched-pass-subtext">Here\'s your answer polished up &mdash; save this for your notes:</div>' +
        '<div class="enriched-pass-quote">' + (enrichedResult.suggestion || '') + '</div>' +
        '<div class="enriched-pass-score">Score: E \u2713</div>';

    container.appendChild(block);
}
```

## Variable Names Per File

Each file has its own `LESSON_CONTEXT` variable. This is the only part of `fetchEnrichedAnswer` that varies:

| File | LESSON_CONTEXT var |
|------|-------------------|
| `u3_lesson6-7_live.html` | `window.LESSON_CONTEXT` (no suffix) |
| `u4_lesson1-2_live.html` | `window.LESSON_CONTEXT_U4` |
| `u4_lesson1-2-3_live.html` | `window.LESSON_CONTEXT_U4L123` |
| `u4_lesson3-4-5_live.html` | `window.LESSON_CONTEXT_U4L345` |
| `u4_lesson6_live.html` | `window.LESSON_CONTEXT_U4L6` |
| `u4_lesson7-8_live.html` | `window.LESSON_CONTEXT_U4L78` |
| `u4_lesson9_live.html` | `window.LESSON_CONTEXT_U4L9` |
| `u4_lesson10-12_live.html` | `window.LESSON_CONTEXT_U4L1012` |
| `u5_lesson1-2_live.html` | `window.LESSON_CONTEXT_U5L12` |
| `u5_lesson3_live.html` | `window.LESSON_CONTEXT_U5L3` |
| `u5_lesson4_live.html` | `window.LESSON_CONTEXT_U5L4` |
| `u5_lesson5_live.html` | `window.LESSON_CONTEXT_U5L5` |
| `u5_lesson6_live.html` | `window.LESSON_CONTEXT_U5L6` |
| `u5_lesson7_live.html` | `window.LESSON_CONTEXT_U5L7` |
| `u5_lesson8_live.html` | `window.LESSON_CONTEXT_U5L8` |
| `u6_lesson1-2_live.html` | `window.LESSON_CONTEXT_U6L12` |
| `u6_lesson3_live.html` | `window.LESSON_CONTEXT_U6L3` |
| `u6_lesson4_live.html` | `window.LESSON_CONTEXT_U6L4` |
| `u6_lesson5_live.html` | `window.LESSON_CONTEXT_U6L5` |
| `u6_lesson6_live.html` | `window.LESSON_CONTEXT_U6L6` |
| `u6_lesson7_live.html` | `window.LESSON_CONTEXT_U6L7` |
| `u6_lesson8_live.html` | `window.LESSON_CONTEXT_U6L8` |
| `u6_lesson9_live.html` | `window.LESSON_CONTEXT_U6L9` |
| `u6_lesson10_live.html` | `window.LESSON_CONTEXT_U6L10` |
| `u6_lesson11_live.html` | `window.LESSON_CONTEXT_U6L11` |
| `u7_lesson1_live.html` | `window.LESSON_CONTEXT_U7L1` |
| `u7_lesson2_live.html` | `window.LESSON_CONTEXT_U7L2` |
| `u7_lesson3_live.html` | `window.LESSON_CONTEXT_U7L3` |
| `u7_lesson4_live.html` | `window.LESSON_CONTEXT_U7L4` |
| `u7_lesson5_live.html` | `window.LESSON_CONTEXT_U7L5` |
| `u7_lesson6_live.html` | `window.LESSON_CONTEXT_U7L6` |
| `u7_lesson7_live.html` | `window.LESSON_CONTEXT_U7L7` |
| `u7_lesson8_live.html` | `window.LESSON_CONTEXT_U7L8` |
| `u7_lesson9_live.html` | `window.LESSON_CONTEXT_U7L9` |
| `u8_lesson1_live.html` | `window.LESSON_CONTEXT_U8L1` |
| `u8_lesson2_live.html` | `window.LESSON_CONTEXT_U8L2` |
| `u8_lesson3_live.html` | `window.LESSON_CONTEXT_U8L3` |
| `mit_ocw_6.0001_lec1_live.html` | `window.LESSON_CONTEXT_MIT6001` |
| `mit_ocw_6.0001_lec2_live.html` | `window.LESSON_CONTEXT_MIT6001_LEC2` |

> **Important:** These variable names are best-guess from patterns. Each file's actual variable name MUST be confirmed by reading the `gradeReflection()` function in that file — the `lessonContext` field in the request body shows the correct variable.

## U3 Special Case

`u3_lesson6-7_live.html` uses a `ReflectionGrader` class (not bare functions). The enrichment logic goes inside `gradeAllReflections()` at the same point — after `const result = await reflectionGrader.gradeReflection(id, answer)`. The `fetchEnrichedAnswer` and `renderEnrichedPass` functions are added as standalone functions (not class methods).

## What Doesn't Change

- Grading prompts files (no rubric changes)
- Appeal system (still available for genuine P/I)
- `showFeedback()` function (untouched)
- `gradeReflection()` function (untouched)
- Backend (no server changes)
- Score = E or I flow (untouched)

## Edge Cases

| Case | Behavior |
|------|----------|
| Phase 2 fails | Fall back to normal P (appeal available) |
| Phase 2 returns invalid payload | Fall back to normal P |
| `missing` is empty but score is P | Auto-upgrade to E silently |
| File has no `LESSON_CONTEXT` var | `fetchEnrichedAnswer` sends `undefined` — server handles gracefully |

## Execution Strategy

37 files with near-identical changes. Best dispatched as parallel agent work — each agent owns a batch of files and applies the same 4-touch pattern, only varying the `LESSON_CONTEXT` variable name in `fetchEnrichedAnswer`.
