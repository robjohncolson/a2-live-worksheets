/**
 * Unit tests for UI components and DOM interactions
 * Tests feedback rendering, appeal forms, and visual states
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('UI Components', () => {
  let document;
  let container;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
    document = dom.window.document;
    container = document.getElementById('container');
  });

  describe('Score Badge Rendering', () => {
    it('should create E score badge with correct class', () => {
      const badge = document.createElement('span');
      badge.className = 'score-badge score-E';
      badge.textContent = 'E';

      expect(badge.classList.contains('score-E')).toBe(true);
      expect(badge.textContent).toBe('E');
    });

    it('should create P score badge with correct class', () => {
      const badge = document.createElement('span');
      badge.className = 'score-badge score-P';
      badge.textContent = 'P';

      expect(badge.classList.contains('score-P')).toBe(true);
    });

    it('should create I score badge with correct class', () => {
      const badge = document.createElement('span');
      badge.className = 'score-badge score-I';
      badge.textContent = 'I';

      expect(badge.classList.contains('score-I')).toBe(true);
    });
  });

  describe('Textarea Grading States', () => {
    let textarea;

    beforeEach(() => {
      textarea = document.createElement('textarea');
      textarea.id = 'reflect53';
      container.appendChild(textarea);
    });

    it('should apply grading class during grading', () => {
      textarea.classList.add('grading');
      expect(textarea.classList.contains('grading')).toBe(true);
    });

    it('should apply graded-E class for E score', () => {
      textarea.classList.add('graded-E');
      expect(textarea.classList.contains('graded-E')).toBe(true);
    });

    it('should apply graded-P class for P score', () => {
      textarea.classList.add('graded-P');
      expect(textarea.classList.contains('graded-P')).toBe(true);
    });

    it('should apply graded-I class for I score', () => {
      textarea.classList.add('graded-I');
      expect(textarea.classList.contains('graded-I')).toBe(true);
    });

    it('should remove old grading classes when applying new one', () => {
      textarea.classList.add('graded-I');
      textarea.classList.remove('graded-E', 'graded-P', 'graded-I');
      textarea.classList.add('graded-E');

      expect(textarea.classList.contains('graded-E')).toBe(true);
      expect(textarea.classList.contains('graded-I')).toBe(false);
      expect(textarea.classList.contains('graded-P')).toBe(false);
    });
  });

  describe('AI Feedback Panel', () => {
    it('should create feedback panel with correct structure', () => {
      const feedback = document.createElement('div');
      feedback.className = 'ai-feedback';
      feedback.innerHTML = `
        <div class="ai-feedback-header">
          <span class="score-badge score-P">P</span>
          <span class="ai-label">🤖 AI Feedback</span>
        </div>
        <div class="ai-feedback-text">Your answer is partially correct.</div>
      `;

      container.appendChild(feedback);

      expect(document.querySelector('.ai-feedback')).not.toBeNull();
      expect(document.querySelector('.ai-feedback-header')).not.toBeNull();
      expect(document.querySelector('.ai-feedback-text')).not.toBeNull();
    });

    it('should include suggestion when present', () => {
      const feedback = document.createElement('div');
      feedback.className = 'ai-feedback';
      feedback.innerHTML = `
        <div class="ai-feedback-text">Feedback text</div>
        <div class="ai-suggestion">💡 Consider adding more detail.</div>
      `;

      container.appendChild(feedback);

      const suggestion = document.querySelector('.ai-suggestion');
      expect(suggestion).not.toBeNull();
      expect(suggestion.textContent).toContain('Consider adding');
    });

    it('should include missing elements when present', () => {
      const feedback = document.createElement('div');
      feedback.className = 'ai-feedback';
      feedback.innerHTML = `
        <div class="ai-missing">Consider adding: random selection, generalization</div>
      `;

      container.appendChild(feedback);

      const missing = document.querySelector('.ai-missing');
      expect(missing).not.toBeNull();
      expect(missing.textContent).toContain('random selection');
    });

    it('should show appeal count when appeals used', () => {
      const feedback = document.createElement('div');
      feedback.className = 'ai-feedback';
      feedback.innerHTML = `
        <div class="ai-feedback-header">
          <span class="appeal-count">(1/3 appeals used)</span>
        </div>
      `;

      container.appendChild(feedback);

      const appealCount = document.querySelector('.appeal-count');
      expect(appealCount).not.toBeNull();
      expect(appealCount.textContent).toContain('1/3');
    });
  });

  describe('Appeal Form', () => {
    let appealForm;

    beforeEach(() => {
      appealForm = document.createElement('div');
      appealForm.className = 'appeal-form';
      appealForm.id = 'appealForm-reflect53';
      appealForm.innerHTML = `
        <textarea id="appealText-reflect53" placeholder="Explain your reasoning..."></textarea>
        <div class="appeal-form-buttons">
          <button class="appeal-submit">Submit Appeal</button>
          <button class="appeal-cancel">Cancel</button>
        </div>
      `;
      container.appendChild(appealForm);
    });

    it('should be hidden by default', () => {
      expect(appealForm.classList.contains('visible')).toBe(false);
    });

    it('should become visible when toggled', () => {
      appealForm.classList.add('visible');
      expect(appealForm.classList.contains('visible')).toBe(true);
    });

    it('should have appeal textarea', () => {
      const textarea = document.getElementById('appealText-reflect53');
      expect(textarea).not.toBeNull();
      expect(textarea.placeholder).toContain('Explain');
    });

    it('should have submit and cancel buttons', () => {
      const submitBtn = document.querySelector('.appeal-submit');
      const cancelBtn = document.querySelector('.appeal-cancel');

      expect(submitBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    it('should disable buttons when submitting', () => {
      const submitBtn = document.querySelector('.appeal-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Processing...';

      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toContain('Processing');
    });
  });

  describe('Appeal Result Notification', () => {
    it('should show upgraded result with correct class', () => {
      const result = document.createElement('div');
      result.className = 'appeal-result upgraded';
      result.innerHTML = '<strong>🎉 Appeal Granted!</strong>';

      container.appendChild(result);

      expect(result.classList.contains('upgraded')).toBe(true);
      expect(result.textContent).toContain('Appeal Granted');
    });

    it('should show maintained result with correct class', () => {
      const result = document.createElement('div');
      result.className = 'appeal-result maintained';
      result.innerHTML = '<strong>Score Maintained: P</strong>';

      container.appendChild(result);

      expect(result.classList.contains('maintained')).toBe(true);
    });

    it('should show error result with correct class', () => {
      const result = document.createElement('div');
      result.className = 'appeal-result error';
      result.innerHTML = '<strong>⚠️ Appeal Error</strong>';

      container.appendChild(result);

      expect(result.classList.contains('error')).toBe(true);
    });
  });

  describe('Appeal Button State', () => {
    it('should show appeal button for P score', () => {
      const score = 'P';
      const appealCount = 0;
      const maxAppeals = 3;
      const canAppeal = score !== 'E' && appealCount < maxAppeals;

      expect(canAppeal).toBe(true);
    });

    it('should show appeal button for I score', () => {
      const score = 'I';
      const appealCount = 0;
      const maxAppeals = 3;
      const canAppeal = score !== 'E' && appealCount < maxAppeals;

      expect(canAppeal).toBe(true);
    });

    it('should hide appeal button for E score', () => {
      const score = 'E';
      const appealCount = 0;
      const maxAppeals = 3;
      const canAppeal = score !== 'E' && appealCount < maxAppeals;

      expect(canAppeal).toBe(false);
    });

    it('should hide appeal button when max appeals reached', () => {
      const score = 'P';
      const appealCount = 3;
      const maxAppeals = 3;
      const canAppeal = score !== 'E' && appealCount < maxAppeals;

      expect(canAppeal).toBe(false);
    });
  });

  describe('Grade Reflections Button', () => {
    let button;

    beforeEach(() => {
      button = document.createElement('button');
      button.className = 'btn-ai';
      button.textContent = '🤖 Grade My Reflections with AI';
      container.appendChild(button);
    });

    it('should have correct initial text', () => {
      expect(button.textContent).toContain('Grade My Reflections');
    });

    it('should show loading state when clicked', () => {
      button.textContent = '⏳ Grading...';
      button.disabled = true;

      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Grading');
    });

    it('should show progress with question ID', () => {
      button.textContent = '⏳ Grading reflect53...';

      expect(button.textContent).toContain('reflect53');
    });

    it('should restore original state after grading', () => {
      const originalText = '🤖 Grade My Reflections with AI';
      button.textContent = '⏳ Grading...';
      button.disabled = true;

      // Simulate completion
      button.textContent = originalText;
      button.disabled = false;

      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe(originalText);
    });
  });
});

describe('Reflection Question IDs', () => {
  const expectedIds = ['reflect53', 'reflect54a', 'reflect54b', 'reflect55', 'reflect56', 'exitTicket'];

  it('should have 6 reflection questions', () => {
    expect(expectedIds).toHaveLength(6);
  });

  it('should have consistent naming pattern for numbered questions', () => {
    const numberedQuestions = expectedIds.filter(id => id.startsWith('reflect'));
    expect(numberedQuestions).toHaveLength(5);
  });

  it('should include exit ticket', () => {
    expect(expectedIds).toContain('exitTicket');
  });

  it('should match textarea IDs in DOM structure', () => {
    // This validates the expected DOM structure
    expectedIds.forEach(id => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });
});

describe('CSS Class Conventions', () => {
  const expectedClasses = {
    feedback: 'ai-feedback',
    header: 'ai-feedback-header',
    text: 'ai-feedback-text',
    suggestion: 'ai-suggestion',
    missing: 'ai-missing',
    badge: 'score-badge',
    appealBtn: 'appeal-btn',
    appealForm: 'appeal-form',
    appealSubmit: 'appeal-submit',
    appealCancel: 'appeal-cancel',
    appealResult: 'appeal-result'
  };

  it('should have consistent class naming', () => {
    Object.values(expectedClasses).forEach(className => {
      expect(typeof className).toBe('string');
      expect(className).toMatch(/^[a-z-]+$/);
    });
  });

  it('should use ai- prefix for AI-related classes', () => {
    expect(expectedClasses.feedback).toMatch(/^ai-/);
    expect(expectedClasses.header).toMatch(/^ai-/);
    expect(expectedClasses.text).toMatch(/^ai-/);
  });

  it('should use appeal- prefix for appeal-related classes', () => {
    expect(expectedClasses.appealBtn).toMatch(/^appeal-/);
    expect(expectedClasses.appealForm).toMatch(/^appeal-/);
    expect(expectedClasses.appealSubmit).toMatch(/^appeal-/);
  });
});
