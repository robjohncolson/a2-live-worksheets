// tests/fixtures/incident-progress-reset/index.js
//
// Sanitized, zero-PII fixture for INCIDENT I5 ("grades reset to 0% / lesson
// lockout" report, 2026-07-20). Identities are the literal strings
// 'student-a' / 'student-b' — never real names or roster UUIDs. Numbers are
// structurally equivalent to the real ledgers (132 / 173 signed records) but
// carry no answers, no real timestamps, no UUIDs — just topic keys and
// pass/fail-band scores. The DB is confirmed intact, so every Cws here is in
// the PASSING band (>=60) and every blooket score is in the PASSING band
// (>=80) — this fixture never encodes a raw score of 0 anywhere. That's the
// crux of the incident: the underlying ledger data was always sufficient.
//
// Two shapes are exported per student:
//   .grade  — the /grade SUCCESS payload (`{ ok:true, lessons:[...] }`),
//             lessons[] carrying ONLY the fields the Desk oracles read:
//             lessonKey, Cws, blooket (desk.html
//             L6498-6527: _getCwsForTopic / _blooketScoreFor).
//   .donow  — the /donow payload (`{ ok:true, lessons:[...] }`), lessons[]
//             carrying `{ lesson, selfDone, selfDoneArtifacts }` — the exact
//             shape _hydrateMarksFromDonow (L5023) consumes. Note the
//             asymmetry that drives the incident: 1.1 has BOTH artifacts,
//             every later lesson has ONLY 'blooket' — there is no
//             DESK_DONE 'worksheet' row for 1.2/1.3(/1.4), even though the
//             ledger has scored worksheet evidence (Cws) for those lessons.

export const studentA = {
  username: 'student-a',
  email: 'student-a@roster.local',
  orderedTopics: ['1.1', '1.2', '1.3', '1.4', '1.5'],
  nextLegitLesson: '1.4',
  grade: {
    ok: true,
    lessons: [
      { lessonKey: '1.1', Cws: 88, blooket: 100 },
      { lessonKey: '1.2', Cws: 79, blooket: 85 },
      { lessonKey: '1.3', Cws: 82, blooket: 90 },
    ],
    quarters: { Q1: { pct: 85 } },
  },
  donow: {
    ok: true,
    lessons: [
      { lesson: '1.1', selfDone: true, selfDoneArtifacts: ['worksheet', 'blooket'] },
      { lesson: '1.2', selfDone: true, selfDoneArtifacts: ['blooket'] },
      { lesson: '1.3', selfDone: true, selfDoneArtifacts: ['blooket'] },
    ],
  },
};

export const studentB = {
  username: 'student-b',
  email: 'student-b@roster.local',
  orderedTopics: ['1.1', '1.2', '1.3', '1.4', '1.5'],
  nextLegitLesson: '1.5',
  grade: {
    ok: true,
    lessons: [
      { lessonKey: '1.1', Cws: 90, blooket: 95 },
      { lessonKey: '1.2', Cws: 81, blooket: 88 },
      { lessonKey: '1.3', Cws: 84, blooket: 92 },
      { lessonKey: '1.4', Cws: 77, blooket: 80 },
    ],
    quarters: { Q1: { pct: 88 } },
  },
  donow: {
    ok: true,
    lessons: [
      { lesson: '1.1', selfDone: true, selfDoneArtifacts: ['worksheet', 'blooket'] },
      { lesson: '1.2', selfDone: true, selfDoneArtifacts: ['blooket'] },
      { lesson: '1.3', selfDone: true, selfDoneArtifacts: ['blooket'] },
      { lesson: '1.4', selfDone: true, selfDoneArtifacts: ['blooket'] },
    ],
  },
};
