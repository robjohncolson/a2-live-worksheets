import { buildQuestionLoMap, runSanityChecks } from "./question-lo-tagger.mjs";

const { map, sourceQuestionCount } = buildQuestionLoMap();
runSanityChecks(map, sourceQuestionCount);

console.log("question-lo-tagger sanity checks passed");
