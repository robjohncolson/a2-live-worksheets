/**
 * scripts/lib/framework-parse.mjs
 * Hardened shared parser for Algebra 2 framework files.
 *
 * Export: parseFrameworks(root) → { topicSkills, malformed }
 *
 * Strategy (TT1-A):
 *   Primary:  per-## TOPIC block LO-table [Skill N.L] extraction
 *   Fallback: UNIT AT A GLANCE topic→skills table (every framework has one)
 *
 * Guarantee: zero "(none parsed)" topics across U1–U9.
 * Topics with genuinely no skills (7.10, 8.7 synthesis topics) emit [].
 *
 * Skill code recognition: all CED codes matching /^[1-4]\.[A-F]$/ (not just the
 * canonical 11 in the audit matrix). The audit matrix columns are a display
 * choice; the framework stores what the CED says.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolve the repo root lazily and safely.
 *
 * vitest runs modules under a non-file:// scheme (e.g. vite:// or data://),
 * so fileURLToPath(import.meta.url) throws ERR_INVALID_URL_SCHEME at module
 * load time if computed eagerly. Wrapping it in a function with try/catch
 * means the module loads cleanly under vitest; tests pass an explicit root
 * so the fallback (process.cwd()) is only used as a last resort.
 */
function repoRoot() {
  try {
    return resolve(fileURLToPath(new URL('../..', import.meta.url)));
  } catch {
    return process.cwd();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CED skill code pattern — any N.L where N ∈ 1-4, L ∈ A-F
// Broader than the 11-code audit matrix, but never fabricated.
// ─────────────────────────────────────────────────────────────────────────────

const CED_SKILL_RE = /\[Skill\s+([1-4]\.[A-F])\]/g;
const BOLD_SKILL_RE = /\*\*([1-4]\.[A-F])\*\*/g;
const BULLET_SKILL_RE = /^\s*\*\s+\*\*([1-4]\.[A-F])\*\*/gm;
// Matches "N.L" in text near skill keywords; used as last resort inside blocks
const BARE_SKILL_RE = /\b([1-4]\.[A-F])\b/g;

// Glance-table line: "| ... | N.N Topic Title | N.L desc<br>N.L desc | ... |"
// Captures topic number and the skills cell.
const GLANCE_ROW_RE = /\|\s*(?:[^|]*\|)?\s*\*?\*?(\d+\.\d+)[^|]*\|([^|]+)\|/g;

function isValidCedSkill(code) {
  return /^[1-4]\.[A-F]$/.test(code);
}

/**
 * Extract all CED skill codes from a text block.
 * Tries [Skill N.L] notation first, then **N.L** bold, then bare N.L.
 */
function extractSkillsFromBlock(block) {
  const found = new Set();

  let m;
  CED_SKILL_RE.lastIndex = 0;
  while ((m = CED_SKILL_RE.exec(block)) !== null) {
    if (isValidCedSkill(m[1])) found.add(m[1]);
  }

  BOLD_SKILL_RE.lastIndex = 0;
  while ((m = BOLD_SKILL_RE.exec(block)) !== null) {
    if (isValidCedSkill(m[1])) found.add(m[1]);
  }

  BULLET_SKILL_RE.lastIndex = 0;
  while ((m = BULLET_SKILL_RE.exec(block)) !== null) {
    if (isValidCedSkill(m[1])) found.add(m[1]);
  }

  return [...found].sort();
}

/**
 * Parse skills from the UNIT AT A GLANCE table.
 * Returns Map<topicNum, skillCode[]>.
 *
 * The glance table rows look like:
 *   | EU | 5.1 Topic Title | **N.L** description... |
 * Skills appear as **N.L** or bare N.L in the skills cell.
 */
function parseGlanceTable(raw) {
  const glanceMap = new Map();

  // Find the UNIT AT A GLANCE section
  const glanceIdx = raw.search(/^##\s+UNIT AT A GLANCE/m);
  if (glanceIdx === -1) return glanceMap;

  // Find next ## section after glance (or end of file)
  const afterGlance = raw.slice(glanceIdx);
  const nextSectionMatch = afterGlance.slice(1).search(/^##\s+(?!UNIT AT A GLANCE)/m);
  const glanceSection = nextSectionMatch === -1
    ? afterGlance
    : afterGlance.slice(0, nextSectionMatch + 1);

  // Each table row: look for topic number N.N
  const rowRe = /^\|[^|]*\|\s*\*?\*?(\d+\.\d+)[^\|]*\|([^\|]+)\|/gm;
  let m;
  while ((m = rowRe.exec(glanceSection)) !== null) {
    const topicNum = m[1];
    const skillCell = m[2];

    // Skip N/A topics (synthesis topics with no assigned skills)
    if (/N\/A/i.test(skillCell)) {
      if (!glanceMap.has(topicNum)) glanceMap.set(topicNum, []);
      continue;
    }

    const skills = new Set();
    let sm;

    BOLD_SKILL_RE.lastIndex = 0;
    while ((sm = BOLD_SKILL_RE.exec(skillCell)) !== null) {
      if (isValidCedSkill(sm[1])) skills.add(sm[1]);
    }
    BARE_SKILL_RE.lastIndex = 0;
    while ((sm = BARE_SKILL_RE.exec(skillCell)) !== null) {
      if (isValidCedSkill(sm[1])) skills.add(sm[1]);
    }

    glanceMap.set(topicNum, [...skills].sort());
  }

  return glanceMap;
}

/**
 * Parse a single framework file.
 * Returns array of { topicNum: string, skills: string[] }.
 */
function parseOneFramework(filePath) {
  if (!existsSync(filePath)) return { topics: [], missing: true, malformed: false };

  const raw = readFileSync(filePath, 'utf8');

  const hasTOPICHeaders = /^##\s+(?:\*\*)?TOPIC\s+\d+\.\d+/m.test(raw);
  const malformed = !hasTOPICHeaders;

  const topics = [];

  if (hasTOPICHeaders) {
    // Split on ## TOPIC N.N headers
    const topicBlocks = raw.split(/^##\s+(?:\*\*)?TOPIC\s+/m).slice(1);

    for (const block of topicBlocks) {
      const firstLine = block.split('\n')[0].replace(/\*\*/g, '');
      const numMatch = firstLine.match(/^(\d+\.\d+)/);
      if (!numMatch) continue;
      const topicNum = numMatch[1];

      const skills = extractSkillsFromBlock(block);
      topics.push({ topicNum, skills });
    }
  }

  // Build glance fallback map (always parsed, used to fill gaps)
  const glanceMap = parseGlanceTable(raw);

  if (!hasTOPICHeaders) {
    // Malformed file: use glance table as primary source
    for (const [topicNum, skills] of glanceMap) {
      topics.push({ topicNum, skills });
    }
  } else {
    // Well-formed: fill any topics that got empty skills from the TOPIC block
    // using the glance table as fallback.
    for (const t of topics) {
      if (t.skills.length === 0 && glanceMap.has(t.topicNum)) {
        t.skills = glanceMap.get(t.topicNum);
      }
    }

    // Add any topics in glance that didn't appear in ## TOPIC blocks
    const coveredTopics = new Set(topics.map(t => t.topicNum));
    for (const [topicNum, skills] of glanceMap) {
      if (!coveredTopics.has(topicNum)) {
        topics.push({ topicNum, skills });
      }
    }
  }

  // Sort topics by unit.lesson
  topics.sort((a, b) => {
    const [au, al] = a.topicNum.split('.').map(Number);
    const [bu, bl] = b.topicNum.split('.').map(Number);
    return au !== bu ? au - bu : al - bl;
  });

  return { topics, missing: false, malformed };
}

/**
 * Parse all 9 Algebra 2 framework files.
 *
 * @param {string} root - Repo root directory path
 * @returns {{ topicSkills: Object.<string, string[]>, malformed: string[] }}
 *   topicSkills: map from "N.L" topic number to array of CED skill codes
 *   malformed: list of filenames that had the no-## TOPIC-header defect
 */
export function parseFrameworks(root) {
  if (root === undefined) root = repoRoot();
  const topicSkills = {};
  const malformed = [];

  for (let unit = 1; unit <= 9; unit++) {
    const filePath = resolve(root, `apstat_${unit}_framework.md`);
    const result = parseOneFramework(filePath);

    if (result.missing) continue;
    if (result.malformed) malformed.push(`apstat_${unit}_framework.md`);

    for (const { topicNum, skills } of result.topics) {
      // Deterministic: if two files define the same topic, last write wins —
      // but topics are unique per unit so this shouldn't occur.
      topicSkills[topicNum] = skills;
    }
  }

  return { topicSkills, malformed };
}

/**
 * Parse a single framework file (for use by the audit script's parseFramework).
 * Returns the original audit-script shape for backward compatibility.
 */
export function parseSingleFramework(filePath, unit) {
  const result = parseOneFramework(filePath);
  const skillsMentioned = new Set();

  for (const { skills } of result.topics) {
    for (const s of skills) skillsMentioned.add(s);
  }

  return {
    unit,
    topics: result.topics.map(({ topicNum, skills }) => ({
      topicNum,
      skills,
      los: [],
      eks: [],
    })),
    malformed: result.malformed,
    missing: result.missing || false,
    skillsMentioned,
  };
}
