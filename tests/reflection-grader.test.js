/**
 * Unit tests for ReflectionGrader class and appeal system
 * Tests grading workflow, state management, and API interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the grading functions that would be loaded from ai-grading-prompts.js
global.buildReflectionPrompt = vi.fn((id, answer) => `Mock prompt for ${id}: ${answer}`);
global.getRubric = vi.fn((id) => id ? { questionText: 'Mock question' } : null);
global.getReflectionQuestionIds = vi.fn(() => ['reflect53', 'reflect54a', 'reflect54b', 'reflect55', 'reflect56', 'exitTicket']);
global.LESSON_CONTEXT = { unit: 3, lessons: '6-7' };

// ReflectionGrader class (extracted from HTML for testing)
class ReflectionGrader {
  constructor() {
    this.serverUrl = 'https://a2-live-worksheets-production.up.railway.app';
  }

  async gradeReflection(textareaId, studentAnswer) {
    if (!studentAnswer || studentAnswer.trim().length < 20) {
      return {
        score: 'I',
        feedback: 'Please provide a more complete response (at least a few sentences).',
        _aiGraded: false
      };
    }

    try {
      const prompt = typeof buildReflectionPrompt === 'function'
        ? buildReflectionPrompt(textareaId, studentAnswer)
        : this.buildFallbackPrompt(textareaId, studentAnswer);

      const response = await fetch(`${this.serverUrl}/api/ai/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            topic: 'Algebra 2 - Experimental Design',
            questionId: textareaId,
            lessonContext: typeof LESSON_CONTEXT !== 'undefined' ? LESSON_CONTEXT : null
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
      return {
        score: null,
        feedback: 'AI grading unavailable. Please try again later.',
        _error: err.message,
        _aiGraded: false
      };
    }
  }

  buildFallbackPrompt(questionId, answer) {
    return `Grade this Algebra 2 response about experimental design.
Question ID: ${questionId}
Student Answer: "${answer}"

Score using E (Essentially correct), P (Partially correct), or I (Incorrect).
Respond in JSON: {"score": "E/P/I", "feedback": "explanation"}`;
  }

  async submitAppeal(textareaId, originalAnswer, appealText, previousResult) {
    if (!appealText || appealText.trim().length < 10) {
      return {
        success: false,
        error: 'Please explain your reasoning in more detail.',
        score: previousResult?.score || 'I'
      };
    }

    try {
      const rubric = typeof getRubric === 'function' ? getRubric(textareaId) : null;

      const response = await fetch(`${this.serverUrl}/api/ai/appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            questionId: textareaId,
            topic: 'Algebra 2 - Experimental Design',
            prompt: rubric?.questionText || textareaId,
            expectedElements: rubric?.expectedElements?.map(e => e.description) || [],
            lessonContext: typeof LESSON_CONTEXT !== 'undefined' ? LESSON_CONTEXT : null
          },
          answers: { answer: originalAnswer },
          appealText: appealText,
          previousResults: { answer: previousResult }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Appeal failed');
      }

      const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };
      const previousScore = scoreOrder[previousResult?.score] || 0;
      const newScore = scoreOrder[result.score] || 0;
      const upgraded = newScore > previousScore;

      return {
        success: true,
        score: result.score,
        feedback: result.feedback || '',
        appealGranted: upgraded,
        upgraded,
        previousScore: previousResult?.score,
        _provider: result._provider,
        _model: result._model,
        _appealProcessed: true
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Appeal could not be processed.',
        score: previousResult?.score || 'I'
      };
    }
  }
}

describe('ReflectionGrader', () => {
  let grader;

  beforeEach(() => {
    grader = new ReflectionGrader();
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should set default server URL', () => {
      expect(grader.serverUrl).toBe('https://a2-live-worksheets-production.up.railway.app');
    });
  });

  describe('gradeReflection()', () => {
    it('should reject empty answers', async () => {
      const result = await grader.gradeReflection('reflect53', '');
      expect(result.score).toBe('I');
      expect(result._aiGraded).toBe(false);
      expect(result.feedback).toContain('complete response');
    });

    it('should reject answers shorter than 20 characters', async () => {
      const result = await grader.gradeReflection('reflect53', 'Too short');
      expect(result.score).toBe('I');
      expect(result._aiGraded).toBe(false);
    });

    it('should accept answers with 20+ characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 'E', feedback: 'Great answer!' })
      });

      const result = await grader.gradeReflection('reflect53', 'This is a sufficiently long answer about random selection and assignment.');
      expect(result._aiGraded).toBe(true);
      expect(result.score).toBe('E');
    });

    it('should call API with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 'P', feedback: 'Partial credit' })
      });

      await grader.gradeReflection('reflect53', 'This is my answer about experimental design concepts.');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://a2-live-worksheets-production.up.railway.app/api/ai/grade');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.scenario.questionId).toBe('reflect53');
      expect(body.scenario.topic).toBe('Algebra 2 - Experimental Design');
      expect(body.answers.answer).toContain('experimental design');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' })
      });

      const result = await grader.gradeReflection('reflect53', 'A valid answer that is long enough to be graded');
      expect(result._aiGraded).toBe(false);
      expect(result._error).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await grader.gradeReflection('reflect53', 'A valid answer that is long enough to be graded');
      expect(result._aiGraded).toBe(false);
      expect(result._error).toBe('Network error');
    });

    it('should include model info in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          score: 'E',
          feedback: 'Excellent!',
          _model: 'llama-3.3-70b-versatile'
        })
      });

      const result = await grader.gradeReflection('reflect53', 'A complete answer with all required elements.');
      expect(result._model).toBe('llama-3.3-70b-versatile');
    });
  });

  describe('submitAppeal()', () => {
    const previousResult = { score: 'P', feedback: 'Partial credit' };

    it('should reject empty appeal text', async () => {
      const result = await grader.submitAppeal('reflect53', 'Original answer', '', previousResult);
      expect(result.success).toBe(false);
      expect(result.error).toContain('reasoning');
    });

    it('should reject appeal text shorter than 10 characters', async () => {
      const result = await grader.submitAppeal('reflect53', 'Original answer', 'Too short', previousResult);
      expect(result.success).toBe(false);
    });

    it('should call appeal API with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 'E', feedback: 'Appeal granted' })
      });

      await grader.submitAppeal(
        'reflect53',
        'My original answer',
        'I believe my answer deserves a higher score because I mentioned random assignment.',
        previousResult
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://a2-live-worksheets-production.up.railway.app/api/ai/appeal');
      const body = JSON.parse(options.body);
      expect(body.appealText).toContain('random assignment');
      expect(body.previousResults.answer).toEqual(previousResult);
    });

    it('should detect upgraded score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 'E', feedback: 'Reconsidered and upgraded' })
      });

      const result = await grader.submitAppeal(
        'reflect53',
        'My answer',
        'I included all the required elements in my response.',
        { score: 'P' }
      );

      expect(result.success).toBe(true);
      expect(result.upgraded).toBe(true);
      expect(result.score).toBe('E');
      expect(result.previousScore).toBe('P');
    });

    it('should detect maintained score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 'P', feedback: 'Score maintained' })
      });

      const result = await grader.submitAppeal(
        'reflect53',
        'My answer',
        'I think my answer was correct because...',
        { score: 'P' }
      );

      expect(result.success).toBe(true);
      expect(result.upgraded).toBe(false);
      expect(result.score).toBe('P');
    });

    it('should handle appeal API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Appeal service unavailable' })
      });

      const result = await grader.submitAppeal(
        'reflect53',
        'My answer',
        'My reasoning for the appeal is...',
        { score: 'I' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('buildFallbackPrompt()', () => {
    it('should include question ID', () => {
      const prompt = grader.buildFallbackPrompt('reflect53', 'Test answer');
      expect(prompt).toContain('reflect53');
    });

    it('should include student answer', () => {
      const prompt = grader.buildFallbackPrompt('reflect53', 'My specific answer');
      expect(prompt).toContain('My specific answer');
    });

    it('should include scoring instructions', () => {
      const prompt = grader.buildFallbackPrompt('reflect53', 'Test');
      expect(prompt).toContain('E');
      expect(prompt).toContain('P');
      expect(prompt).toContain('I');
    });
  });
});

describe('Grading State Management', () => {
  it('should initialize empty state', () => {
    const gradingState = new Map();
    expect(gradingState.size).toBe(0);
  });

  it('should store grading result with appeal tracking', () => {
    const gradingState = new Map();
    const testResult = {
      score: 'P',
      feedback: 'Partial credit',
      _aiGraded: true
    };

    gradingState.set('reflect53', {
      result: testResult,
      originalAnswer: 'My answer',
      appealCount: 0,
      history: []
    });

    const state = gradingState.get('reflect53');
    expect(state.appealCount).toBe(0);
    expect(state.history).toHaveLength(0);
    expect(state.result.score).toBe('P');
  });

  it('should track appeal history', () => {
    const gradingState = new Map();
    gradingState.set('reflect53', {
      result: { score: 'P' },
      originalAnswer: 'My answer',
      appealCount: 0,
      history: []
    });

    const state = gradingState.get('reflect53');

    // Simulate appeal
    state.appealCount++;
    state.history.push({
      appealText: 'My reasoning',
      previousScore: 'P',
      newScore: 'E',
      upgraded: true
    });

    expect(state.appealCount).toBe(1);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].upgraded).toBe(true);
  });

  it('should enforce max appeals limit', () => {
    const maxAppeals = 3;
    const gradingState = new Map();
    gradingState.set('reflect53', {
      result: { score: 'P' },
      appealCount: 3,
      history: [{}, {}, {}]
    });

    const state = gradingState.get('reflect53');
    const canAppeal = state.appealCount < maxAppeals;

    expect(canAppeal).toBe(false);
  });
});

describe('Score Ordering', () => {
  const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };

  it('should rank E highest', () => {
    expect(scoreOrder['E']).toBeGreaterThan(scoreOrder['P']);
    expect(scoreOrder['E']).toBeGreaterThan(scoreOrder['I']);
  });

  it('should rank P in the middle', () => {
    expect(scoreOrder['P']).toBeGreaterThan(scoreOrder['I']);
    expect(scoreOrder['P']).toBeLessThan(scoreOrder['E']);
  });

  it('should rank I lowest', () => {
    expect(scoreOrder['I']).toBeLessThan(scoreOrder['P']);
    expect(scoreOrder['I']).toBeLessThan(scoreOrder['E']);
  });

  it('should correctly determine upgrade P -> E', () => {
    const previous = scoreOrder['P'];
    const newScore = scoreOrder['E'];
    expect(newScore > previous).toBe(true);
  });

  it('should correctly determine no upgrade P -> P', () => {
    const previous = scoreOrder['P'];
    const newScore = scoreOrder['P'];
    expect(newScore > previous).toBe(false);
  });

  it('should correctly determine downgrade E -> P', () => {
    const previous = scoreOrder['E'];
    const newScore = scoreOrder['P'];
    expect(newScore > previous).toBe(false);
  });
});
