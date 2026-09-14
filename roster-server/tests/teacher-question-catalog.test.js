import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
const read = path => readFileSync(new URL('../data/' + path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('teacher-question-catalog.json'));
describe('teacher question catalog', () => {
  it('covers all mapped quiz questions with their choices and every worksheet FRQ prompt', () => {
    const key = JSON.parse(read('answer-key.json')).answerKey;
    const map = JSON.parse(read('skill-map.json'));
    for (const id of Object.keys(key).filter(id => map[id]?.skill)) {
      expect(catalog.questions[id]?.prompt, id).toBeTruthy();
      expect(catalog.questions[id].attachments.choices.some(c => c.key === key[id].answerKey), id).toBe(true);
    }
    const registry = JSON.parse(read('frq-rubrics.SY2627.json'));
    for (const [prefix, sheet] of Object.entries(registry.worksheets)) {
      for (const id of Object.keys(sheet.items)) expect(catalog.questions[prefix + '-' + id]?.prompt, prefix + '-' + id).toBeTruthy();
    }
  });
  it('tracks the rubric source and includes no grading instructions or solutions', () => {
    expect(catalog.sources.frqRubrics).toBe(createHash('sha256').update(read('frq-rubrics.SY2627.json')).digest('hex'));
    for (const q of Object.values(catalog.questions)) {
      expect(Object.keys(q).every(k => ['prompt', 'attachments', 'worksheet', 'context'].includes(k))).toBe(true);
      expect(q.prompt).not.toContain('## Student');
      expect(q.prompt).not.toContain('STUDENT RESPONSE:');
    }
  });
});
