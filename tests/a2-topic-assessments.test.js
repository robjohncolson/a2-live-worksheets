// @vitest-environment node
// data/a2-topic-assessments.json (docs/a2-fast-lesson-spec.md section 7): every Savvas Topic
// Assessment item mapped to a year-plan lesson and its Examples; each fast lesson's prep entry
// lists exactly its items; docs/a2-topic-assessment-audit.md is the generator output.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coverage, loadInputs, PATHS, renderAudit } from '../scripts/build-a2-topic-assessment-audit.mjs';

const { data, targets, prep } = loadInputs();
const plan = Object.fromEntries(targets.lessons.map(lesson => [lesson.key, lesson]));
const topics = Object.entries(data.topics);
const LEVELS = ['high', 'medium', 'low', 'none'];
const DISTRICT = ['kept', 'dropped', 'unknown'];

describe('data/a2-topic-assessments.json', () => {
  it('covers Topics 1 through 7 with a transcription each', () => {
    expect(topics.map(([n]) => n)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    for (const [n, topic] of topics) {
      expect(topic.title, n).toBeTruthy();
      expect(topic.transcription, n).toBe(`a2_T${n}_assessment_TE.tex`);
      expect(topic.printed, n).toMatch(/^\d+A-\d+B$/);
      expect(topic.byItem.length, n).toBe(topic.items);
      expect(topic.district && topic.district.status, n).toBeTruthy();
    }
  });
  it('numbers every item once, with a DOK, a year-plan lesson of the same topic and Examples that exist', () => {
    for (const [n, topic] of topics) {
      expect(topic.byItem.map(item => item.n), n).toEqual(topic.byItem.map((_, i) => i + 1));
      for (const item of topic.byItem) {
        const where = `Topic ${n} item ${item.n}`;
        expect([1, 2, 3], where).toContain(item.dok);
        expect(Array.isArray(item.skills), where).toBe(true);
        expect(plan[item.lesson], `${where}: lesson ${item.lesson} is not in the year plan`).toBeDefined();
        expect(plan[item.lesson].topic, where).toBe(Number(n));
        expect(Array.isArray(item.examples), where).toBe(true);
        for (const ex of item.examples) expect(Number.isInteger(ex) && ex > 0, `${where}: example ${ex}`).toBe(true);
        const entry = prep[item.lesson];
        if (entry) {
          const known = new Set((entry.examples || []).map(e => e.n));
          for (const ex of item.examples) expect(known.has(ex), `${where}: Example ${ex} is not in the ${item.lesson} prep entry`).toBe(true);
        }
        expect(item.formA, where).toBeTruthy();
        expect(item.formB, where).toBeTruthy();
        expect(item.keyA, where).toBeTruthy();
        expect(LEVELS, where).toContain(item.sat);
        expect(LEVELS, where).toContain(item.precalc);
        expect(DISTRICT, where).toContain(item.district);
      }
    }
  });
  it('re-ranks every fast lesson of the topic and names only its own items', () => {
    for (const [n, topic] of topics) {
      const fastLessons = targets.lessons.filter(l => l.topic === Number(n) && prep[l.key]).map(l => l.key);
      expect(Object.keys(topic.lessons).sort(), `Topic ${n}`).toEqual(fastLessons.sort());
      for (const [key, rec] of Object.entries(topic.lessons)) {
        const mine = topic.byItem.filter(item => item.lesson === key).map(item => item.n);
        expect(rec.items, `${key} items`).toEqual(mine);
        const kept = (prep[key].examples || []).filter(e => e.keep === true).map(e => e.n);
        expect(rec.recommendedKept, `${key}: the prep entry keeps ${kept}`).toEqual(kept);
        expect(typeof rec.change, key).toBe('boolean');
        expect(rec.why, key).toBeTruthy();
      }
    }
  });
});

describe('content/a2/lesson-prep.json topicAssessment blocks', () => {
  it('every fast lesson of Topics 1-7 lists exactly the items the map assigns to it', () => {
    for (const [key, entry] of Object.entries(prep)) {
      const topic = plan[key] && plan[key].topic;
      if (!topic || topic > 7) continue;
      const block = entry.topicAssessment;
      expect(block, `${key} has no topicAssessment block`).toBeDefined();
      expect(block.topic, key).toBe(topic);
      expect(block.source, key).toContain(`a2_T${topic}_assessment_TE.tex`);
      const mine = data.topics[String(topic)].byItem.filter(item => item.lesson === key).map(item => String(item.n));
      expect(Object.keys(block.items), `${key} topicAssessment.items`).toEqual(mine);
      for (const [n, text] of Object.entries(block.items)) expect(text, `${key} item ${n}`).toMatch(/Examples? \d+|no Example|Topic Review/);
    }
  });
});

describe('docs/a2-topic-assessment-audit.md', () => {
  it('is the generator output and reports the coverage of every item', () => {
    const rendered = renderAudit({ data, targets, prep });
    expect(readFileSync(new URL(`../${PATHS.doc}`, import.meta.url), 'utf8')).toBe(rendered);
    for (const [, topic] of topics) for (const item of topic.byItem) expect(['kept', 'cut', 'none', 'no-lesson']).toContain(coverage(item, prep));
    expect(rendered).toContain('## Topic 2:');
    expect(rendered).toContain('### Re-ranking under R1');
  });
});
