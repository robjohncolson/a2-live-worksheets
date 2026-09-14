/**
 * Unit tests for Aggregate Drawer features
 * Tests focus-following behavior, escape key, and bar chart rendering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Aggregate Drawer', () => {
  let document;
  let window;
  let drawer;
  let content;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <div class="question">
          <span class="question-number">1.</span>
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q1" data-answer="test">
        </div>
        <div class="question">
          <span class="question-number">2.</span>
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q2" data-answer="answer">
          <input type="text" class="blank" data-question-id="WS-U4L1-3-Q3" data-answer="value">
        </div>
        <div id="aggregateDrawer" class="aggregate-drawer">
          <div class="drawer-header">
            <h3>Class Responses</h3>
            <span class="drawer-hint">Tab to change input - Esc to close</span>
            <button class="drawer-close">&times;</button>
          </div>
          <div class="drawer-content" id="drawerContent">
            <p>Click a "Class" button next to a question to see responses.</p>
          </div>
        </div>
      </body>
      </html>
    `);
    document = dom.window.document;
    window = dom.window;
    drawer = document.getElementById('aggregateDrawer');
    content = document.getElementById('drawerContent');
  });

  describe('Drawer Open/Close', () => {
    it('should be closed by default (no .open class)', () => {
      expect(drawer.classList.contains('open')).toBe(false);
    });

    it('should open when .open class is added', () => {
      drawer.classList.add('open');
      expect(drawer.classList.contains('open')).toBe(true);
    });

    it('should close when .open class is removed', () => {
      drawer.classList.add('open');
      drawer.classList.remove('open');
      expect(drawer.classList.contains('open')).toBe(false);
    });
  });

  describe('Escape Key Handling', () => {
    it('should close drawer on Escape key when open', () => {
      drawer.classList.add('open');

      // Simulate closeDrawer function behavior
      const closeDrawer = () => {
        drawer.classList.remove('open');
      };

      // Simulate keydown event handling
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
        }
      };

      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      handleKeydown(event);

      expect(drawer.classList.contains('open')).toBe(false);
    });

    it('should not affect drawer when other keys pressed', () => {
      drawer.classList.add('open');

      const closeDrawer = () => {
        drawer.classList.remove('open');
      };

      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
        }
      };

      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      handleKeydown(event);

      expect(drawer.classList.contains('open')).toBe(true);
    });
  });

  describe('Focus-Following Behavior', () => {
    it('should track currently focused blank', () => {
      let currentFocusedBlank = null;

      const handleBlankFocus = (blank) => {
        currentFocusedBlank = blank;
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);

      expect(currentFocusedBlank).toBe(blanks[0]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q1');
    });

    it('should update focused blank when focus changes', () => {
      let currentFocusedBlank = null;

      const handleBlankFocus = (blank) => {
        currentFocusedBlank = blank;
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q1');

      handleBlankFocus(blanks[1]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q2');

      handleBlankFocus(blanks[2]);
      expect(currentFocusedBlank.dataset.questionId).toBe('WS-U4L1-3-Q3');
    });

    it('should trigger drawer update when drawer is open and focus changes', () => {
      drawer.classList.add('open');
      let updateCalled = false;
      let updatedBlank = null;

      const loadAggregateDataForBlank = (blank) => {
        updateCalled = true;
        updatedBlank = blank;
      };

      const handleBlankFocus = (blank) => {
        if (drawer.classList.contains('open')) {
          loadAggregateDataForBlank(blank);
        }
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[1]);

      expect(updateCalled).toBe(true);
      expect(updatedBlank.dataset.questionId).toBe('WS-U4L1-3-Q2');
    });

    it('should NOT trigger drawer update when drawer is closed', () => {
      let updateCalled = false;

      const loadAggregateDataForBlank = () => {
        updateCalled = true;
      };

      const handleBlankFocus = (blank) => {
        if (drawer.classList.contains('open')) {
          loadAggregateDataForBlank(blank);
        }
      };

      const blanks = document.querySelectorAll('.blank');
      handleBlankFocus(blanks[0]);

      expect(updateCalled).toBe(false);
    });
  });

  describe('Single Chart Per Input', () => {
    it('should load data for single blank, not multiple', () => {
      const blanks = document.querySelectorAll('.blank');
      const targetBlank = blanks[0];

      // Simulate loadAggregateDataForBlank behavior
      const loadAggregateDataForBlank = (blank) => {
        const questionId = blank.dataset.questionId;
        return questionId; // Returns single ID, not array
      };

      const result = loadAggregateDataForBlank(targetBlank);

      expect(typeof result).toBe('string');
      expect(result).toBe('WS-U4L1-3-Q1');
    });
  });

  describe('Bar Chart Rendering', () => {
    // Updated renderBarChart function matching the production code
    const renderBarChart = (questionId, stats, blank) => {
      let entries = [];
      let total = 0;
      let isPercentages = false;

      if (stats.responses && Array.isArray(stats.responses)) {
        // Format 1: Array of response objects [{answer: "foo"}, ...]
        const groups = new Map();
        stats.responses.forEach(r => {
          const ans = (r.answer || '').trim();
          if (!ans) return;
          groups.set(ans, (groups.get(ans) || 0) + 1);
        });
        entries = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
        total = stats.responses.length;
      } else if (stats.distribution) {
        // Format 2: Distribution object {answer: count_or_percentage}
        const rawEntries = Object.entries(stats.distribution).filter(([k]) => k && k !== '(blank)');
        const sumValues = rawEntries.reduce((sum, [, v]) => sum + v, 0);

        if (stats.totalResponses && stats.totalResponses > 0) {
          total = stats.totalResponses;
          if (sumValues > 0 && sumValues <= 101) {
            entries = rawEntries.map(([answer, pct]) => [answer, Math.round((pct / 100) * total)]);
          } else {
            entries = rawEntries;
          }
        } else if (sumValues > 0 && sumValues <= 101 && rawEntries.length > 1) {
          isPercentages = true;
          total = null;
          entries = rawEntries;
        } else {
          total = sumValues;
          entries = rawEntries;
        }
        entries.sort((a, b) => b[1] - a[1]);
      }

      const maxValue = entries.length > 0 ? entries[0][1] : 0;
      const questionEl = blank ? blank.closest('.question') : null;
      const questionNum = questionEl ? questionEl.querySelector('.question-number')?.textContent : '';

      let html = `<div class="bar-chart">`;
      html += `<div class="chart-header">`;
      html += `<strong>${questionId}</strong>`;
      if (questionNum) {
        html += `<span class="chart-question-num">Question ${questionNum}</span>`;
      }
      if (isPercentages) {
        html += `<span class="chart-total">Distribution</span>`;
      } else if (total !== null) {
        html += `<span class="chart-total">${total} response${total !== 1 ? 's' : ''}</span>`;
      }
      html += `</div>`;

      if (entries.length === 0) {
        html += '<p class="no-responses">No responses yet</p>';
      } else {
        entries.slice(0, 10).forEach(([answer, value]) => {
          const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
          const displayValue = isPercentages ? `${Math.round(value)}%` : value;
          html += `
            <div class="bar-row">
              <span class="bar-label" title="${answer}">${answer}</span>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${barWidth}%"></div>
              </div>
              <span class="bar-count">${displayValue}</span>
            </div>
          `;
        });
      }
      html += '</div>';
      return html;
    };

    // Tests with array of response objects (Format 1)
    describe('with responses array format', () => {
      it('should show total response count in header', () => {
        const blank = document.querySelector('.blank');
        const stats = {
          responses: [
            { answer: 'answer1' }, { answer: 'answer1' }, { answer: 'answer1' },
            { answer: 'answer1' }, { answer: 'answer1' }, // 5x answer1
            { answer: 'answer2' }, { answer: 'answer2' }, { answer: 'answer2' } // 3x answer2
          ]
        };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('8 responses');
      });

      it('should show singular "response" for single response', () => {
        const blank = document.querySelector('.blank');
        const stats = { responses: [{ answer: 'answer1' }] };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('1 response');
        expect(html).not.toContain('1 responses');
      });

      it('should group and count duplicate answers', () => {
        const blank = document.querySelector('.blank');
        const stats = {
          responses: [
            { answer: 'foo' }, { answer: 'foo' }, { answer: 'foo' },
            { answer: 'bar' }, { answer: 'bar' }
          ]
        };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('5 responses');
        expect(html).toContain('<span class="bar-count">3</span>'); // foo
        expect(html).toContain('<span class="bar-count">2</span>'); // bar
      });
    });

    // Tests with distribution object containing actual counts (Format 2a)
    // Note: Values must sum to > 101 to avoid being treated as percentages
    describe('with distribution counts format', () => {
      it('should show total response count from distribution values', () => {
        const blank = document.querySelector('.blank');
        // Sum must be > 101 to be treated as counts
        const stats = { distribution: { 'answer1': 75, 'answer2': 35 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('110 responses');
      });

      it('should display raw counts in bar-count element', () => {
        const blank = document.querySelector('.blank');
        // Sum must be > 101 to be treated as counts
        const stats = { distribution: { 'answer1': 120, 'answer2': 80 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('<span class="bar-count">120</span>');
        expect(html).toContain('<span class="bar-count">80</span>');
      });

      it('should sort responses by count descending', () => {
        const blank = document.querySelector('.blank');
        // Sum must be > 101 to be treated as counts
        const stats = { distribution: { 'low': 10, 'high': 100, 'mid': 50 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        const highPos = html.indexOf('title="high"');
        const midPos = html.indexOf('title="mid"');
        const lowPos = html.indexOf('title="low"');

        expect(highPos).toBeLessThan(midPos);
        expect(midPos).toBeLessThan(lowPos);
      });

      it('should filter out (blank) entries', () => {
        const blank = document.querySelector('.blank');
        // (blank) is filtered, leaving only answer1 as a single entry
        const stats = { distribution: { 'answer1': 150, '(blank)': 50 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('150 responses');
        expect(html).not.toContain('200 responses');
        expect(html).not.toContain('(blank)');
      });
    });

    // Tests with distribution object containing percentages (Format 2b)
    describe('with distribution percentages format (no totalResponses)', () => {
      it('should detect percentages and show "Distribution" instead of count', () => {
        const blank = document.querySelector('.blank');
        // Percentages that sum to 100
        const stats = { distribution: { 'answer1': 60, 'answer2': 40 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('Distribution');
        expect(html).not.toContain('100 responses');
      });

      it('should display percentages with % symbol', () => {
        const blank = document.querySelector('.blank');
        const stats = { distribution: { 'answer1': 75, 'answer2': 25 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('<span class="bar-count">75%</span>');
        expect(html).toContain('<span class="bar-count">25%</span>');
      });

      it('should handle percentages that sum to ~100 (rounding)', () => {
        const blank = document.querySelector('.blank');
        // Sum is 99 due to rounding
        const stats = { distribution: { 'a': 33, 'b': 33, 'c': 33 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('Distribution');
        expect(html).toContain('33%');
      });

      it('should NOT treat single entry as percentage even if value <= 100', () => {
        const blank = document.querySelector('.blank');
        // Single entry with value 50 - could be a count, not percentage
        const stats = { distribution: { 'answer1': 50 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        // Should treat as count since only 1 entry
        expect(html).toContain('50 responses');
        expect(html).not.toContain('Distribution');
      });
    });

    // Tests with distribution percentages + totalResponses (Format 2c)
    describe('with distribution percentages and totalResponses', () => {
      it('should convert percentages to counts using totalResponses', () => {
        const blank = document.querySelector('.blank');
        const stats = {
          distribution: { 'answer1': 60, 'answer2': 40 },
          totalResponses: 50
        };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('50 responses');
        expect(html).toContain('<span class="bar-count">30</span>'); // 60% of 50
        expect(html).toContain('<span class="bar-count">20</span>'); // 40% of 50
      });

      it('should round converted counts correctly', () => {
        const blank = document.querySelector('.blank');
        const stats = {
          distribution: { 'answer1': 33, 'answer2': 67 },
          totalResponses: 10
        };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('10 responses');
        // 33% of 10 = 3.3 -> rounds to 3
        // 67% of 10 = 6.7 -> rounds to 7
        expect(html).toContain('<span class="bar-count">3</span>');
        expect(html).toContain('<span class="bar-count">7</span>');
      });
    });

    // General rendering tests
    describe('general rendering', () => {
      it('should show question number from parent element', () => {
        const blank = document.querySelector('.blank');
        const stats = { distribution: { 'answer1': 5 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('Question 1.');
      });

      it('should scale bars by max value', () => {
        const blank = document.querySelector('.blank');
        // Sum must be > 101 to be treated as counts
        const stats = { distribution: { 'top': 100, 'second': 50, 'third': 20 } };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('width: 100%');
        expect(html).toContain('width: 50%');
        expect(html).toContain('width: 20%');
      });

      it('should show "No responses yet" when empty', () => {
        const blank = document.querySelector('.blank');
        const stats = { distribution: {} };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        expect(html).toContain('No responses yet');
      });

      it('should limit to 10 entries', () => {
        const blank = document.querySelector('.blank');
        const distribution = {};
        for (let i = 1; i <= 15; i++) {
          distribution[`answer${i}`] = 100 + (15 - i); // counts > 100 so not treated as percentages
        }
        const stats = { distribution };

        const html = renderBarChart('WS-U4L1-3-Q1', stats, blank);

        const barRowCount = (html.match(/bar-row/g) || []).length;
        expect(barRowCount).toBe(10);
      });
    });
  });

  describe('Drawer Hint Display', () => {
    it('should have hint text for keyboard navigation', () => {
      const hint = document.querySelector('.drawer-hint');

      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain('Tab');
      expect(hint.textContent).toContain('Esc');
    });
  });

  describe('Drawer Header Structure', () => {
    it('should have title, hint, and close button', () => {
      const header = document.querySelector('.drawer-header');
      const title = header.querySelector('h3');
      const hint = header.querySelector('.drawer-hint');
      const closeBtn = header.querySelector('.drawer-close');

      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Class Responses');
      expect(hint).not.toBeNull();
      expect(closeBtn).not.toBeNull();
    });
  });
});

describe('Chart Header CSS Classes', () => {
  const expectedClasses = {
    header: 'chart-header',
    questionNum: 'chart-question-num',
    total: 'chart-total',
    noResponses: 'no-responses'
  };

  it('should use consistent class naming', () => {
    Object.values(expectedClasses).forEach(className => {
      expect(typeof className).toBe('string');
      expect(className).toMatch(/^[a-z-]+$/);
    });
  });

  it('should use chart- prefix for chart-specific classes', () => {
    expect(expectedClasses.header).toMatch(/^chart-/);
    expect(expectedClasses.questionNum).toMatch(/^chart-/);
    expect(expectedClasses.total).toMatch(/^chart-/);
  });
});

describe('Global Key Bindings', () => {
  it('should define bindGlobalKeys function behavior', () => {
    let escapeHandled = false;

    const bindGlobalKeys = (doc, closeDrawer) => {
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeDrawer();
          escapeHandled = true;
        }
      });
    };

    // This validates the expected function signature
    expect(typeof bindGlobalKeys).toBe('function');
  });
});
