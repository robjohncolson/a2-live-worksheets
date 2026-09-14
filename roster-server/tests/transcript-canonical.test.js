import { describe, expect, it } from 'vitest';
import {
  canonicalizeTranscript,
  hashTranscriptGradeProjection,
  transcriptGradeProjection,
} from '../transcript-canonical.js';

const FROZEN_PROJECTION = {
  completion: { U1: { frq: 1, worksheet: 2 } },
  lessons: [{
    Cws: 88.94,
    Q: 100,
    W: 66.66,
    blooket: 80,
    hasBlooket: true,
    items: { frq: [{ itemId: 'FRQ-1', score: 66.66, ts: '2026-01-02T00:00:00.000Z' }], quiz: [], worksheet: [] },
    lessonGrade: 76.54,
    lessonGradeNoQuiz: 74.14,
    lessonKey: '1.1',
    quizTotal: 3,
    topicName: null,
    unit: 1,
    worksheetKey: '1',
  }],
  quarters: {
    Q1: {
      blooketDone: 1,
      blooketDue: 1,
      blooketTodo: [],
      ceiling: 93.34,
      lessonsDue: 2,
      lessonsGraded: 1,
      lessonsTotal: 3,
      pcAvg: 100,
      quarterGrade: 87.65,
      quizDone: 1,
      quizDue: 1,
      quizTodo: [],
      unitGrades: { U1: 90.12 },
      units: [1, 2, 3],
      unitsGraded: 1,
      unitsTotal: 3,
      workAvg: 75.44,
    },
  },
  units: {
    U1: { B: 90.12, P: 100, Q: 93.34, W: 80, banked: 85, graded: true, pcRawPct: 100, unitGrade: 100 },
  },
};

const FROZEN_CANONICAL = '{"completion":{"U1":{"frq":1,"worksheet":2}},"lessons":[{"Cws":88.9,"Q":100,"W":66.7,"blooket":80,"hasBlooket":true,"items":{"frq":[{"itemId":"FRQ-1","score":66.7,"ts":"2026-01-02T00:00:00.000Z"}],"quiz":[],"worksheet":[]},"lessonGrade":76.5,"lessonGradeNoQuiz":74.1,"lessonKey":"1.1","quizTotal":3,"topicName":null,"unit":1,"worksheetKey":"1"}],"quarters":{"Q1":{"blooketDone":1,"blooketDue":1,"blooketTodo":[],"ceiling":93.3,"lessonsDue":2,"lessonsGraded":1,"lessonsTotal":3,"pcAvg":100,"quarterGrade":87.7,"quizDone":1,"quizDue":1,"quizTodo":[],"unitGrades":{"U1":90.1},"units":[1,2,3],"unitsGraded":1,"unitsTotal":3,"workAvg":75.4}},"units":{"U1":{"B":90.1,"P":100,"Q":93.3,"W":80,"banked":85,"graded":true,"pcRawPct":100,"unitGrade":100}}}';
const FROZEN_HASH = '00f229513cbf29b898ad6246bdbf59bec4c2afd0a01bf8315ca0f1820f005d78';

describe('transcript canonicalizer', () => {
  it('pins the rounded recursive grade projection vector', () => {
    const projection = transcriptGradeProjection(FROZEN_PROJECTION);
    expect(canonicalizeTranscript(projection)).toBe(FROZEN_CANONICAL);
    expect(hashTranscriptGradeProjection(FROZEN_PROJECTION)).toBe(FROZEN_HASH);
  });

  it('drops undefined, keeps null, sorts nested keys and stable arrays', () => {
    const canonical = canonicalizeTranscript({
      z: undefined,
      b: [{ itemId: 'b', v: undefined }, { itemId: 'a', n: null }],
      a: { d: 1, c: null },
    });
    expect(canonical).toBe('{"a":{"c":null,"d":1},"b":[{"itemId":"a","n":null},{"itemId":"b"}]}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalizeTranscript({ bad: NaN })).toThrow(/NaN/);
    expect(() => canonicalizeTranscript({ bad: Infinity })).toThrow(/Infinity/);
  });
});
