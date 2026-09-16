import { describe, expect, it } from 'vitest';
import {
  buildServerReflectionPrompt, FRQ_RUBRIC_SCHEMA, FRQ_RUBRIC_SCHOOL_YEAR,
  getServerReflectionItem, loadFrqRubricRegistry, parseServerReflectionItemId,
} from '../roster-server/frq-prompt.js';

// Synthetic contract fixture, not authored course content. The persisted runtime
// schema constant is intentionally retained; migrating it is outside this batch.
const registry = {
  schema: FRQ_RUBRIC_SCHEMA, schoolYear: FRQ_RUBRIC_SCHOOL_YEAR,
  sourceDigest: 'sha256:' + 'a'.repeat(64),
  worksheets: {
    'WS-A2-1-1': { items: { reflect1: {
      promptBeforeAnswer: 'Explain how you solve 2x + 3 = 11.\nAnswer:\n',
      promptAfterAnswer: '\nCheck the substitution.',
      samplePromptSha256: 'b'.repeat(64),
    } } },
  },
};

describe('retained FRQ registry contracts with synthetic algebra content', () => {
  it('loads serialized and object registries', () => {
    expect(loadFrqRubricRegistry(JSON.stringify(registry))).toEqual(registry);
    expect(loadFrqRubricRegistry(registry)).toBe(registry);
    expect(getServerReflectionItem(registry, 'WS-A2-1-1', 'reflect1'))
      .toBe(registry.worksheets['WS-A2-1-1'].items.reflect1);
  });

  it('parses only exact known item IDs', () => {
    expect(parseServerReflectionItemId(registry, 'WS-A2-1-1-reflect1'))
      .toEqual({ prefix: 'WS-A2-1-1', textareaId: 'reflect1' });
    for (const id of ['WS-A2-1-1-reflect', 'ws-a2-1-1-reflect1', null, 12]) {
      expect(() => parseServerReflectionItemId(registry, id)).toThrow('unknown FRQ item');
    }
  });

  it('rejects unknown worksheet and response IDs', () => {
    expect(() => buildServerReflectionPrompt(registry, 'WS-UNKNOWN', 'reflect1', 'x = 4'))
      .toThrow('unknown FRQ item: WS-UNKNOWN-reflect1');
    expect(() => buildServerReflectionPrompt(registry, 'WS-A2-1-1', 'missing', 'x = 4'))
      .toThrow('unknown FRQ item: WS-A2-1-1-missing');
  });

  it('inserts answer text literally without interpreting markers or templates', () => {
    const tick = String.fromCharCode(96);
    const answer = 'x = 4\n"quotes" and \'quotes\'\n' + tick + 'backticks' + tick
      + ' $' + '{templateLike}\n<ANSWER>$&</ANSWER>';
    expect(buildServerReflectionPrompt(registry, 'WS-A2-1-1', 'reflect1', answer))
      .toBe('Explain how you solve 2x + 3 = 11.\nAnswer:\n' + answer + '\nCheck the substitution.');
  });

  it('rejects malformed JSON, schema, year, digest, and item shape', () => {
    expect(() => loadFrqRubricRegistry('{')).toThrow('invalid FRQ rubric bundle JSON');
    for (const override of [
      { schema: 'unknown' }, { schoolYear: 'SY0000' },
      { sourceDigest: 'not-a-digest' }, { worksheets: [] },
      { worksheets: { 'WS-A2-1-1': { items: { reflect1: {} } } } },
    ]) {
      expect(() => loadFrqRubricRegistry({ ...registry, ...override }))
        .toThrow('invalid FRQ rubric bundle');
    }
  });
});
