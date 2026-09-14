import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_SPEC_QUESTION_COUNT = 433;
export const QUESTION_ID_RE = /^U([1-9])-L(\d+)-Q\d+$/;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const CURRICULUM_FILE = path.resolve(
  ROOT_DIR,
  "..",
  "curriculum_render",
  "data",
  "curriculum.js",
);
const FRAMEWORKS_FILE = path.resolve(
  ROOT_DIR,
  "..",
  "curriculum_render",
  "data",
  "frameworks.js",
);
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "study-guide-question-lo-map.json");

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "is",
  "are",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "and",
  "or",
  "but",
  "if",
  "which",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "from",
  "by",
  "as",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "must",
  "should",
  "do",
  "does",
  "did",
  "not",
  "no",
  "so",
  "than",
  "then",
  "when",
  "where",
  "why",
  "how",
  "what",
  "who",
  "whose",
  "all",
  "any",
  "each",
  "every",
  "some",
  "such",
  "nor",
  "only",
  "own",
  "same",
  "other",
  "another",
  "more",
  "most",
  "less",
  "least",
  "very",
  "also",
]);

export function loadJsExports(filePath, exportNames) {
  const source = fs.readFileSync(filePath, "utf8");
  return new Function(`${source}\nreturn { ${exportNames.join(", ")} };`)();
}

export function roundNumber(value) {
  return Number(value.toFixed(4));
}

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function buildTermFrequency(tokens) {
  const termFrequency = new Map();

  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
  }

  return termFrequency;
}

export function buildQuestionText(question) {
  const prompt = question.prompt || "";
  const choiceText = Array.isArray(question.attachments?.choices)
    ? question.attachments.choices.map((choice) => choice?.value || "").join(" ")
    : "";

  return `${prompt} ${choiceText}`.trim();
}

export function compareQuestionIds(left, right) {
  const leftMatch = left.match(/^U(\d+)-L(\d+)-Q(\d+)$/);
  const rightMatch = right.match(/^U(\d+)-L(\d+)-Q(\d+)$/);

  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right);
  }

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) {
      return difference;
    }
  }

  return left.localeCompare(right);
}

export function loadSourceData() {
  const curriculumSource = fs.readFileSync(CURRICULUM_FILE, "utf8");
  const frameworksSource = fs.readFileSync(FRAMEWORKS_FILE, "utf8");
  const { EMBEDDED_CURRICULUM } = loadJsExports(CURRICULUM_FILE, ["EMBEDDED_CURRICULUM"]);
  const { UNIT_FRAMEWORKS } = loadJsExports(FRAMEWORKS_FILE, ["UNIT_FRAMEWORKS"]);

  return {
    curriculum: EMBEDDED_CURRICULUM,
    curriculumSource,
    frameworks: UNIT_FRAMEWORKS,
    frameworksSource,
  };
}

export function getTargetQuestions(curriculum) {
  return curriculum
    .filter((item) => item.type === "multiple-choice" && QUESTION_ID_RE.test(item.id))
    .sort((left, right) => compareQuestionIds(left.id, right.id));
}

export function buildUnitIndex(unitFramework) {
  const learningObjectives = [];

  for (const [lessonKey, lesson] of Object.entries(unitFramework.lessons || {})) {
    const lessonNumber = Number(lessonKey);

    for (const learningObjective of lesson.learningObjectives || []) {
      const objectiveText = [
        learningObjective.text || "",
        ...(learningObjective.essentialKnowledge || []),
        ...(lesson.keyConcepts || []),
      ].join(" ");
      const tokens = tokenize(objectiveText);

      learningObjectives.push({
        id: learningObjective.id,
        lesson: lessonNumber,
        tf: buildTermFrequency(tokens),
        tokens,
      });
    }
  }

  const documentFrequency = new Map();

  for (const learningObjective of learningObjectives) {
    for (const token of new Set(learningObjective.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const idf = new Map();
  const objectiveCount = learningObjectives.length;

  for (const [token, frequency] of documentFrequency.entries()) {
    idf.set(token, Math.log((1 + objectiveCount) / (1 + frequency)) + 1);
  }

  const vocabulary = new Set(documentFrequency.keys());
  const objectivesByLesson = new Map();

  for (const learningObjective of learningObjectives) {
    const vector = new Map();
    let normSquared = 0;

    for (const [token, count] of learningObjective.tf.entries()) {
      const weight = count * idf.get(token);
      vector.set(token, weight);
      normSquared += weight * weight;
    }

    learningObjective.norm = Math.sqrt(normSquared);
    learningObjective.vector = vector;

    if (!objectivesByLesson.has(learningObjective.lesson)) {
      objectivesByLesson.set(learningObjective.lesson, []);
    }

    objectivesByLesson.get(learningObjective.lesson).push(learningObjective);
  }

  return {
    idf,
    learningObjectives,
    objectivesByLesson,
    vocabulary,
  };
}

export function buildQuestionVector(questionTf, unitIndex) {
  const vector = new Map();
  let normSquared = 0;

  for (const [token, count] of questionTf.entries()) {
    if (!unitIndex.vocabulary.has(token)) {
      continue;
    }

    const weight = count * unitIndex.idf.get(token);
    vector.set(token, weight);
    normSquared += weight * weight;
  }

  return {
    norm: Math.sqrt(normSquared),
    vector,
  };
}

export function computeCosineSimilarity(questionVector, learningObjective) {
  if (!questionVector.norm || !learningObjective.norm) {
    return 0;
  }

  let dotProduct = 0;

  for (const [token, questionWeight] of questionVector.vector.entries()) {
    const objectiveWeight = learningObjective.vector.get(token);
    if (!objectiveWeight) {
      continue;
    }

    dotProduct += questionWeight * objectiveWeight;
  }

  return dotProduct / (questionVector.norm * learningObjective.norm);
}

export function buildSortedOutput({
  generated,
  perUnit,
  questions,
  sourceHash,
  taggedWithFallback,
  taggedWithTfidf,
  totalQuestions,
}) {
  const sortedQuestions = {};

  for (const questionId of Object.keys(questions).sort(compareQuestionIds)) {
    const question = questions[questionId];
    sortedQuestions[questionId] = {
      unit: question.unit,
      lesson: question.lesson,
      primaryLoId: question.primaryLoId,
      secondaryLoIds: [...question.secondaryLoIds],
      confidence: question.confidence,
      method: question.method,
      matchedKeywords: [...question.matchedKeywords],
    };
  }

  const sortedPerUnit = {};
  for (let unit = 1; unit <= 9; unit += 1) {
    sortedPerUnit[String(unit)] = {
      total: perUnit[String(unit)]?.total || 0,
      avgConfidence: perUnit[String(unit)]?.avgConfidence || 0,
    };
  }

  return {
    generated,
    sourceHash,
    questions: sortedQuestions,
    stats: {
      totalQuestions,
      taggedWithTfidf,
      taggedWithFallback,
      perUnit: sortedPerUnit,
    },
  };
}

export function buildQuestionLoMap() {
  const { curriculum, curriculumSource, frameworks, frameworksSource } = loadSourceData();
  const sourceHash = crypto
    .createHash("sha1")
    .update(curriculumSource)
    .update(frameworksSource)
    .digest("hex");
  const generated = new Date(
    Math.max(
      fs.statSync(CURRICULUM_FILE).mtimeMs,
      fs.statSync(FRAMEWORKS_FILE).mtimeMs,
    ),
  ).toISOString();
  const targetQuestions = getTargetQuestions(curriculum);
  const unitIndexes = Object.fromEntries(
    Object.keys(frameworks).map((unit) => [unit, buildUnitIndex(frameworks[unit])]),
  );
  const validLoIdsByUnit = new Map(
    Object.entries(frameworks).map(([unitKey, unitFramework]) => [
      Number(unitKey),
      new Set(
        Object.values(unitFramework.lessons || {}).flatMap((lesson) =>
          (lesson.learningObjectives || []).map((learningObjective) => learningObjective.id),
        ),
      ),
    ]),
  );

  const questions = {};
  const perUnitAccumulator = {};
  let taggedWithTfidf = 0;
  let taggedWithFallback = 0;

  for (const question of targetQuestions) {
    const match = question.id.match(QUESTION_ID_RE);
    const unit = Number(match[1]);
    const lesson = Number(match[2]);
    const unitIndex = unitIndexes[unit];
    const questionTf = buildTermFrequency(tokenize(buildQuestionText(question)));
    const questionVector = buildQuestionVector(questionTf, unitIndex);

    const scoredObjectives = unitIndex.learningObjectives
      .map((learningObjective) => ({
        learningObjective,
        similarity: computeCosineSimilarity(questionVector, learningObjective),
      }))
      .sort(
        (left, right) =>
          right.similarity - left.similarity ||
          left.learningObjective.id.localeCompare(right.learningObjective.id),
      );

    let entry;
    const topMatch = scoredObjectives[0];

    if (!topMatch || topMatch.similarity <= 0) {
      const fallbackObjective = (unitIndex.objectivesByLesson.get(lesson) || [])[0];
      if (!fallbackObjective) {
        throw new Error(`No fallback learning objective found for ${question.id}`);
      }

      taggedWithFallback += 1;
      entry = {
        unit,
        lesson,
        primaryLoId: fallbackObjective.id,
        secondaryLoIds: [],
        confidence: 0.15,
        method: "lesson-fallback",
        matchedKeywords: [],
      };
    } else {
      const secondaryLoIds = scoredObjectives
        .filter(
          (candidate, index) =>
            index > 0 &&
            candidate.similarity > 0 &&
            candidate.similarity >= topMatch.similarity * 0.6,
        )
        .slice(0, 2)
        .map((candidate) => candidate.learningObjective.id);
      const matchedKeywords = Array.from(questionVector.vector.entries())
        .filter(([token]) => topMatch.learningObjective.vector.has(token))
        .map(([token, questionWeight]) => ({
          contribution: questionWeight * topMatch.learningObjective.vector.get(token),
          token,
        }))
        .sort(
          (left, right) =>
            right.contribution - left.contribution || left.token.localeCompare(right.token),
        )
        .slice(0, 5)
        .map((item) => item.token);

      taggedWithTfidf += 1;
      entry = {
        unit,
        lesson,
        primaryLoId: topMatch.learningObjective.id,
        secondaryLoIds,
        confidence: roundNumber(Math.max(0, Math.min(1, topMatch.similarity))),
        method: "tfidf-cosine",
        matchedKeywords,
      };
    }

    if (!validLoIdsByUnit.get(unit)?.has(entry.primaryLoId)) {
      throw new Error(`Invalid primary LO ${entry.primaryLoId} for ${question.id}`);
    }

    questions[question.id] = entry;

    const unitKey = String(unit);
    perUnitAccumulator[unitKey] ||= {
      confidenceSum: 0,
      total: 0,
    };
    perUnitAccumulator[unitKey].total += 1;
    perUnitAccumulator[unitKey].confidenceSum += entry.confidence;
  }

  const perUnit = {};
  for (let unit = 1; unit <= 9; unit += 1) {
    const unitKey = String(unit);
    const totals = perUnitAccumulator[unitKey] || { total: 0, confidenceSum: 0 };
    perUnit[unitKey] = {
      total: totals.total,
      avgConfidence: totals.total ? roundNumber(totals.confidenceSum / totals.total) : 0,
    };
  }

  return {
    map: buildSortedOutput({
      generated,
      perUnit,
      questions,
      sourceHash,
      taggedWithFallback,
      taggedWithTfidf,
      totalQuestions: targetQuestions.length,
    }),
    sourceQuestionCount: targetQuestions.length,
  };
}

export function getCoverageAtOrAbove(map, minimumConfidence) {
  const questionEntries = Object.values(map.questions);
  const coveredCount = questionEntries.filter(
    (entry) => entry.confidence >= minimumConfidence,
  ).length;

  return {
    coveredCount,
    ratio: questionEntries.length ? coveredCount / questionEntries.length : 0,
  };
}

export function runSanityChecks(map, sourceQuestionCount) {
  assert.equal(
    map.stats.totalQuestions,
    sourceQuestionCount,
    "Map question count should match the strict lesson-question source count.",
  );

  const rollerCoasterQuestion = map.questions["U1-L2-Q01"];
  assert.ok(rollerCoasterQuestion, "Expected U1-L2-Q01 to be present in the map.");
  assert.ok(
    ["VAR-1.B", "VAR-1.C"].includes(rollerCoasterQuestion.primaryLoId),
    `Expected U1-L2-Q01 primary LO to be VAR-1.B or VAR-1.C, received ${rollerCoasterQuestion.primaryLoId}.`,
  );

  const coverage = getCoverageAtOrAbove(map, 0.2);
  assert.ok(
    coverage.ratio >= 0.8,
    `Expected at least 80% of questions to have confidence >= 0.2, received ${(coverage.ratio * 100).toFixed(2)}%.`,
  );

  return coverage;
}

export function writeQuestionLoMap() {
  const { map, sourceQuestionCount } = buildQuestionLoMap();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(map, null, 2)}\n`);

  return {
    map,
    sourceQuestionCount,
  };
}

export function buildSummaryLine(map) {
  const avgConfidenceByUnit = Object.fromEntries(
    Object.entries(map.stats.perUnit).map(([unit, stats]) => [unit, stats.avgConfidence]),
  );

  return `Tagged ${map.stats.totalQuestions} questions, ${map.stats.taggedWithTfidf} with tfidf, ${map.stats.taggedWithFallback} with fallback, avg confidence per unit: ${JSON.stringify(avgConfidenceByUnit)}`;
}

function main() {
  const { map, sourceQuestionCount } = writeQuestionLoMap();
  runSanityChecks(map, sourceQuestionCount);

  if (sourceQuestionCount !== EXPECTED_SPEC_QUESTION_COUNT) {
    console.warn(
      `Warning: spec text references ${EXPECTED_SPEC_QUESTION_COUNT} lesson MCQs, but the current source files produce ${sourceQuestionCount} strict lesson questions.`,
    );
  }

  console.log(buildSummaryLine(map));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
