// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { privacySelfCheck } from '../../scripts/build-golden-fixture.mjs';

const SOURCE_STUDENT = {
  studentId: 'student-real-001',
  username: 'student@example.test',
  realName: 'Alexandra Student',
  bundle: {
    student: {
      studentId: 'student-real-001',
      username: 'student@example.test',
      realName: 'Alexandra Student',
    },
  },
};

function snapshot() {
  return { students: [structuredClone(SOURCE_STUDENT)] };
}

function outputs(record, extra = {}) {
  return {
    'students.json': {
      students: [{ id: 'gm-000000000001', records: [record] }],
    },
    'inputs.json': extra,
  };
}

describe('golden fixture privacy self-check', () => {
  it.each([
    {
      label: 'a free-text response',
      record: { source: 'worksheet', item_id: 'WS-U1L1-Q1', response: 'tell me' },
      extra: {},
      itemId: 'WS-U1L1-Q1',
    },
    {
      label: 'an @ character',
      record: { source: 'worksheet', item_id: 'WS-U1L1-Q1', response: null },
      extra: { accidentalEmail: 'someone@example.test' },
      itemId: null,
    },
    {
      label: 'a real-name string',
      record: { source: 'worksheet', item_id: 'WS-U1L1-Q1', response: null },
      extra: { accidentalName: 'Alexandra Student' },
      itemId: null,
    },
    {
      label: 'a quiz response longer than eight characters',
      record: { source: 'curriculum_quiz', item_id: 'U1-L1-Q1', response: 'abcdefghi' },
      extra: {},
      itemId: 'U1-L1-Q1',
    },
  ])('rejects $label without echoing the value', ({ record, extra, itemId }) => {
    let error;
    try {
      privacySelfCheck(outputs(record, extra), snapshot());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Privacy self-check failed');
    if (itemId) expect(error.message).toContain(itemId);
    expect(error.message).not.toContain(record.response || 'Alexandra Student');
  });
});
