# AI Grading Integration Analysis

This document analyzes AI grading functionality from `lrsl-driller` and `curriculum_render` to identify copy-pasteable structures for the live worksheet app.

---

## Executive Summary

Both repos share a common Railway server already deployed at:
- `https://curriculumrender-production.up.railway.app` (curriculum_render)
- `https://lrsl-driller-production.up.railway.app` (lrsl-driller)

**Key Finding:** The live worksheet already connects to the curriculum_render Railway server for answer aggregation. We can reuse its `/api/ai/grade` endpoint with minimal changes.

---

## 1. Grading Architecture Comparison

| Feature | lrsl-driller | curriculum_render | live-worksheet (current) |
|---------|--------------|-------------------|--------------------------|
| Server | Railway | Railway | Railway (same!) |
| AI Provider | Groq + Gemini (fallback) | Groq only | None |
| Grading Types | numeric, regex, exact, ai, dual | numeric, regex, exact, ai, dual | exact match only |
| Score System | E/P/I | E/P/I | correct/partial/incorrect |
| Appeals | Yes | Yes | No |
| Keywords First | Yes (AI can only upgrade) | Yes (AI can only upgrade) | Yes (only keywords) |

---

## 2. Copy-Paste Ready: GradingEngine Class

From `curriculum_render/js/grading/grading-engine.js` - this is the simpler of the two implementations and matches the live worksheet's existing Railway connection.

### Minimal Integration (~100 lines)

```javascript
// Add to live worksheet <script> section or separate file

class GradingEngine {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || window.RAILWAY_SERVER_URL ||
      'https://curriculumrender-production.up.railway.app';
    this.aiEnabled = config.aiEnabled !== false;
  }

  /**
   * Grade using AI - call Railway server
   */
  async gradeWithAI(answer, rule, context) {
    if (!this.aiEnabled) return { score: null, _aiGraded: false };

    try {
      const response = await fetch(`${this.serverUrl}/api/ai/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            topic: context.topic || 'Algebra 2',
            questionId: context.questionId,
            expectedElements: rule.expected || [],
            prompt: context.prompt
          },
          answers: { answer: answer }
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return {
        score: result.score || result.answer?.score || 'I',
        feedback: result.feedback || result.answer?.feedback || '',
        _aiGraded: true,
        _provider: result._provider,
        _model: result._model
      };
    } catch (err) {
      console.warn('AI grading failed:', err);
      return { score: null, _error: err.message, _aiGraded: false };
    }
  }

  /**
   * Dual grading: Keywords first, AI can only UPGRADE
   */
  async gradeDual(answer, expectedAnswers, context) {
    // Keyword grading (your existing logic)
    const userAnswer = (answer || '').trim().toLowerCase();
    const accepted = expectedAnswers.map(a => a.toLowerCase());

    const isExact = accepted.some(a => userAnswer === a);
    const isPartial = !isExact && accepted.some(a =>
      userAnswer.includes(a) || a.includes(userAnswer)
    );

    const keywordScore = isExact ? 'E' : (isPartial ? 'P' : 'I');

    // AI grading (only if not already E)
    if (keywordScore === 'E') {
      return { score: 'E', feedback: 'Correct!', _method: 'keywords' };
    }

    const aiResult = await this.gradeWithAI(answer, { expected: expectedAnswers }, context);

    // AI can only UPGRADE, never downgrade
    const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };
    if (aiResult._aiGraded && scoreOrder[aiResult.score] > scoreOrder[keywordScore]) {
      return { ...aiResult, _upgraded: true, _keywordScore: keywordScore };
    }

    return {
      score: keywordScore,
      feedback: keywordScore === 'P' ? 'Partially correct' : 'Try again',
      _method: 'keywords',
      _aiScore: aiResult.score
    };
  }
}
```

---

## 3. Integration Points in Live Worksheet

### Current Answer Checking (lines 998-1027)

```javascript
// BEFORE: Simple keyword matching
function checkAnswer(blank) {
  const userAnswer = normalize(blank.value);
  const acceptedAnswers = (blank.dataset.answer || '').split('|').map(normalize);

  const isExactMatch = acceptedAnswers.some(a => userAnswer === a);
  const isPartialMatch = !isExactMatch && acceptedAnswers.some(a =>
    userAnswer.includes(a) || a.includes(userAnswer)
  );

  // Apply classes...
}
```

### Enhanced with AI (proposed)

```javascript
// AFTER: Dual grading with AI upgrade capability
const gradingEngine = new GradingEngine();

async function checkAnswerWithAI(blank) {
  const userAnswer = blank.value.trim();
  const acceptedAnswers = (blank.dataset.answer || '').split('|');
  const questionId = blank.dataset.questionId;

  // Get question context from surrounding text
  const questionEl = blank.closest('.question');
  const context = {
    questionId,
    topic: 'Algebra 2 - Experimental Design',
    prompt: questionEl?.textContent?.substring(0, 200) || ''
  };

  const result = await gradingEngine.gradeDual(userAnswer, acceptedAnswers, context);

  blank.classList.remove('correct', 'partial', 'incorrect');
  if (result.score === 'E') {
    blank.classList.add('correct');
  } else if (result.score === 'P') {
    blank.classList.add('partial');
  } else {
    blank.classList.add('incorrect');
  }

  // Show AI feedback if upgraded
  if (result._upgraded) {
    showAIFeedback(blank, result);
  }

  return result;
}
```

---

## 4. State Machine for AI-Enhanced Grading

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI-ENHANCED GRADING STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  USER SUBMITS   │
                         │    ANSWER       │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  KEYWORD CHECK  │
                         │  (instant)      │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
      ┌───────────┐       ┌───────────┐       ┌───────────┐
      │  EXACT    │       │  PARTIAL  │       │ NO MATCH  │
      │  MATCH    │       │  MATCH    │       │           │
      │  (E)      │       │  (P)      │       │  (I)      │
      └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
            │                   │                   │
            │ ◄──── SKIP AI ────┤                   │
            │     (already E)   │                   │
            │                   ▼                   ▼
            │           ┌─────────────────────────────────┐
            │           │       REQUEST AI GRADE          │
            │           │  POST /api/ai/grade             │
            │           └─────────────┬───────────────────┘
            │                         │
            │               ┌─────────┴─────────┐
            │               │                   │
            │               ▼                   ▼
            │       ┌───────────┐       ┌───────────┐
            │       │ AI AGREES │       │ AI HIGHER │
            │       │ or LOWER  │       │  SCORE    │
            │       └─────┬─────┘       └─────┬─────┘
            │             │                   │
            │    KEEP KEYWORD         USE AI SCORE
            │       SCORE             (UPGRADE)
            │             │                   │
            └─────────────┴─────────┬─────────┘
                                    │
                                    ▼
                         ┌─────────────────┐
                         │  FINAL RESULT   │
                         │  Display + Sync │
                         └─────────────────┘

Critical Rule: AI NEVER DOWNGRADES
- If keyword = P and AI = I → Keep P
- If keyword = I and AI = E → Upgrade to E ✓
- This protects students from AI errors
```

---

## 5. Server Endpoint (Already Available)

The curriculum_render Railway server already has the endpoint. From `curriculum_render/railway-server/server.js`:

```javascript
// POST /api/ai/grade
// Request body:
{
  "scenario": {
    "topic": "Algebra 2 - Experimental Design",
    "questionId": "WS-U3L6-7-Q1",
    "expectedElements": ["blocking", "random assignment", "control"]
  },
  "answers": {
    "answer": "student's response here"
  }
}

// Response:
{
  "score": "E" | "P" | "I",
  "feedback": "Explanation of grade",
  "matched": ["elements found"],
  "missing": ["elements not found"],
  "_provider": "groq",
  "_model": "llama-3.3-70b-versatile",
  "_serverGraded": true
}
```

---

## 6. Required Environment Variables

For the Railway server (already configured in curriculum_render):

```bash
GROQ_API_KEY=gsk_...        # Required for AI grading
SUPABASE_URL=https://...    # For answer storage
SUPABASE_ANON_KEY=eyJ...    # For answer storage
```

---

## 7. UI Components to Add

### 7a. AI Feedback Indicator (from lrsl-driller)

```html
<!-- Add to each question's blank area -->
<span class="ai-badge" style="display: none;">
  <span class="ai-icon">🤖</span>
  <span class="ai-label">AI Upgraded</span>
</span>
```

```css
.ai-badge {
  font-size: 0.75em;
  color: #6c63ff;
  margin-left: 8px;
  padding: 2px 6px;
  background: #f0f0ff;
  border-radius: 4px;
}
```

### 7b. Score Legend

```html
<!-- Add near controls -->
<div class="score-legend">
  <span class="legend-item"><span class="dot correct"></span> E - Essentially Correct</span>
  <span class="legend-item"><span class="dot partial"></span> P - Partially Correct</span>
  <span class="legend-item"><span class="dot incorrect"></span> I - Incorrect</span>
</div>
```

---

## 8. Migration Path

### Phase 1: Add GradingEngine class (no behavior change)
- Copy GradingEngine class into worksheet
- Keep existing checkAnswer() working

### Phase 2: Add AI toggle
- Add "Enable AI Grading" checkbox
- Call `gradeDual()` when enabled

### Phase 3: Show AI feedback
- Display when AI upgrades a score
- Show model info (Groq/Gemini)

### Phase 4: Appeals (optional)
- Add appeal button for P/I scores
- Student explains reasoning
- AI reconsiders

---

## 9. Files to Copy

| Source | Destination | Purpose |
|--------|-------------|---------|
| `curriculum_render/js/grading/grading-engine.js` | `follow-alongs/grading-engine.js` | Main grading logic |
| `curriculum_render/railway_client.js` | Already present via `../railway_client.js` | Server communication |

---

---

## 10. Reflection Question AI Grading (Specific to This Worksheet)

The fill-in-the-blanks have clear keyword answers. The **reflection textareas** at the end need AI grading.

### Questions to AI-Grade

| ID | Question | Key Concepts |
|----|----------|--------------|
| `reflect53` | Random selection vs. random assignment | Definitions + purposes |
| `reflect54a` | Identify confounding variable | Soil type, explain why |
| `reflect54b` | Propose blocking design | Block by soil, randomize within |
| `reflect55` | Interpret p = 0.02 | Not chance, causation needs random assignment |
| `reflect56` | Conditions for generalization | Random selection OR representative |
| `exitTicket` | Three-concept relationship | Assignment → significance → causation |

### Prompt Configuration File

Created: `ai-grading-prompts.js`

This file contains:
- **LESSON_CONTEXT**: Unit 3 L6-7 vocabulary, learning objectives, key principles
- **REFLECTION_RUBRICS**: Per-question rubrics with:
  - Expected elements (required/optional)
  - E/P/I scoring guide
  - Common mistakes to watch for
  - Context from Joshua Sawyer's video transcripts
- **buildReflectionPrompt()**: Constructs AI prompt with full context

### Sample Prompt Output

```
You are an Algebra 2 teacher grading a student's response...

## Topic Context
Unit 3, Lessons 6-7: Selecting an Experimental Design & Inference

## Key Vocabulary for This Topic
- random assignment: Assigning treatments to units by chance; allows causal conclusions
- statistical significance: Observed difference too large to be due to chance alone
...

## Question
Explain the difference between random selection and random assignment...

## Expected Elements (Rubric)
1. Random selection = choosing sample from population (REQUIRED)
2. Random assignment = assigning treatments to units (REQUIRED)
...

## Lesson Context from Video
"Random selection of experimental units allows for results to be generalized..."

## Student's Response
"[student's answer here]"

Grade using E/P/I scoring. Respond in JSON...
```

### Integration Code for HTML

Add to `u3_lesson6-7_live.html`:

```html
<!-- Load AI grading prompts -->
<script src="ai-grading-prompts.js"></script>

<script>
// AI Grading Engine for Reflection Questions
class ReflectionGrader {
  constructor() {
    this.serverUrl = window.RAILWAY_SERVER_URL ||
      'https://curriculumrender-production.up.railway.app';
  }

  async gradeReflection(textareaId, studentAnswer) {
    if (!studentAnswer || studentAnswer.trim().length < 20) {
      return {
        score: 'I',
        feedback: 'Please provide a more complete response.',
        _aiGraded: false
      };
    }

    try {
      const prompt = buildReflectionPrompt(textareaId, studentAnswer);

      const response = await fetch(`${this.serverUrl}/api/ai/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            topic: 'Algebra 2 - Experimental Design',
            questionId: textareaId,
            lessonContext: LESSON_CONTEXT
          },
          answers: { answer: studentAnswer },
          prompt: prompt
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return {
        score: result.score || 'I',
        feedback: result.feedback || '',
        matched: result.matched || [],
        missing: result.missing || [],
        suggestion: result.suggestion,
        _aiGraded: true,
        _model: result._model
      };
    } catch (err) {
      console.warn('AI grading failed:', err);
      return {
        score: null,
        feedback: 'AI grading unavailable.',
        _error: err.message,
        _aiGraded: false
      };
    }
  }
}

const reflectionGrader = new ReflectionGrader();

// Grade all reflection textareas
async function gradeAllReflections() {
  const reflectionIds = getReflectionQuestionIds();
  const results = {};

  for (const id of reflectionIds) {
    const textarea = document.getElementById(id);
    if (!textarea) continue;

    const answer = textarea.value.trim();
    if (!answer) continue;

    // Show loading state
    textarea.style.borderColor = '#ccc';
    textarea.style.backgroundColor = '#f9f9f9';

    const result = await reflectionGrader.gradeReflection(id, answer);
    results[id] = result;

    // Apply visual feedback
    if (result.score === 'E') {
      textarea.style.borderColor = '#28a745';
      textarea.style.backgroundColor = '#d4edda';
    } else if (result.score === 'P') {
      textarea.style.borderColor = '#ffc107';
      textarea.style.backgroundColor = '#fff3cd';
    } else if (result.score === 'I') {
      textarea.style.borderColor = '#dc3545';
      textarea.style.backgroundColor = '#f8d7da';
    }

    // Show feedback tooltip or panel
    showReflectionFeedback(textarea, result);
  }

  return results;
}

function showReflectionFeedback(textarea, result) {
  // Remove existing feedback
  const existingFeedback = textarea.parentElement.querySelector('.ai-feedback');
  if (existingFeedback) existingFeedback.remove();

  if (!result._aiGraded) return;

  const feedbackEl = document.createElement('div');
  feedbackEl.className = 'ai-feedback';
  feedbackEl.innerHTML = `
    <div class="ai-feedback-header">
      <span class="score-badge score-${result.score}">${result.score}</span>
      <span class="ai-label">🤖 AI Feedback</span>
    </div>
    <div class="ai-feedback-text">${result.feedback}</div>
    ${result.suggestion ? `<div class="ai-suggestion">💡 ${result.suggestion}</div>` : ''}
    ${result.missing?.length ? `<div class="ai-missing">Consider adding: ${result.missing.join(', ')}</div>` : ''}
  `;

  textarea.parentElement.appendChild(feedbackEl);
}
</script>

<style>
.ai-feedback {
  margin-top: 8px;
  padding: 10px;
  background: #f8f9ff;
  border: 1px solid #d0d7ff;
  border-radius: 4px;
  font-size: 0.9em;
}
.ai-feedback-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.score-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.85em;
}
.score-E { background: #d4edda; color: #155724; }
.score-P { background: #fff3cd; color: #856404; }
.score-I { background: #f8d7da; color: #721c24; }
.ai-label { color: #666; font-size: 0.85em; }
.ai-feedback-text { color: #333; }
.ai-suggestion { margin-top: 6px; color: #0066cc; font-style: italic; }
.ai-missing { margin-top: 4px; color: #856404; font-size: 0.85em; }
</style>
```

### Add "Grade Reflections" Button

```html
<!-- Add to .controls section -->
<button onclick="gradeAllReflections()">🤖 Grade Reflections</button>
```

---

## 11. State Machine: Reflection AI Grading

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REFLECTION AI GRADING STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  USER CLICKS    │
                         │ "Grade Reflect" │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  FOR EACH TEXTAREA:     │
                    │  - Get studentAnswer    │
                    │  - Skip if empty/<20ch  │
                    └─────────────┬───────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  BUILD AI PROMPT        │
                    │  buildReflectionPrompt()│
                    │  - Question rubric      │
                    │  - Expected elements    │
                    │  - Video context        │
                    │  - Scoring guide        │
                    └─────────────┬───────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  POST /api/ai/grade     │
                    │  - scenario + prompt    │
                    │  - student answer       │
                    └─────────────┬───────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
        ┌───────────┐       ┌───────────┐       ┌───────────┐
        │  E SCORE  │       │  P SCORE  │       │  I SCORE  │
        │  green    │       │  yellow   │       │  red      │
        │  border   │       │  border   │       │  border   │
        └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  SHOW FEEDBACK PANEL    │
                    │  - Score badge          │
                    │  - AI feedback text     │
                    │  - Suggestion (if any)  │
                    │  - Missing elements     │
                    └─────────────────────────┘
```

---

## 12. Testing Checklist

### Fill-in-the-Blank (unchanged)
- [ ] Keyword grading still works without AI
- [ ] Correct/partial/incorrect classes applied
- [ ] Server sync continues to work

### Reflection Textareas (new AI grading)
- [ ] Empty/short responses get I score with message
- [ ] AI prompt includes lesson context
- [ ] E/P/I scores display with correct colors
- [ ] Feedback panel appears with AI explanation
- [ ] Missing elements shown when relevant
- [ ] Suggestion provided for P/I scores
- [ ] Graceful fallback if AI fails
- [ ] "🤖 AI Feedback" label visible
