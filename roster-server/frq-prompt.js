export const FRQ_RUBRIC_SCHEMA = 'apstats-frq-rubrics/v1';
export const FRQ_RUBRIC_SCHOOL_YEAR = 'SY2627';

function unknownItemError(prefix, textareaId) {
  return new Error(`unknown FRQ item: ${prefix}-${textareaId}`);
}

function requireObject(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  throw new Error(`invalid FRQ rubric bundle: ${label} must be an object`);
}

export function validateFrqRubricRegistry(registry) {
  requireObject(registry, 'registry');
  if (registry.schema !== FRQ_RUBRIC_SCHEMA) {
    throw new Error(`invalid FRQ rubric bundle: expected schema ${FRQ_RUBRIC_SCHEMA}`);
  }
  if (registry.schoolYear !== FRQ_RUBRIC_SCHOOL_YEAR) {
    throw new Error(`invalid FRQ rubric bundle: expected schoolYear ${FRQ_RUBRIC_SCHOOL_YEAR}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(registry.sourceDigest || '')) {
    throw new Error('invalid FRQ rubric bundle: sourceDigest must be a SHA-256 digest');
  }

  const worksheets = requireObject(registry.worksheets, 'worksheets');
  for (const [prefix, worksheet] of Object.entries(worksheets)) {
    requireObject(worksheet, `worksheet ${prefix}`);
    const items = requireObject(worksheet.items, `worksheet ${prefix}.items`);
    for (const [textareaId, item] of Object.entries(items)) {
      requireObject(item, `item ${prefix}-${textareaId}`);
      if (typeof item.promptBeforeAnswer !== 'string') {
        throw new Error(`invalid FRQ rubric bundle: ${prefix}-${textareaId} promptBeforeAnswer must be a string`);
      }
      if (typeof item.promptAfterAnswer !== 'string') {
        throw new Error(`invalid FRQ rubric bundle: ${prefix}-${textareaId} promptAfterAnswer must be a string`);
      }
      if (!/^[a-f0-9]{64}$/.test(item.samplePromptSha256 || '')) {
        throw new Error(`invalid FRQ rubric bundle: ${prefix}-${textareaId} samplePromptSha256 must be a SHA-256 digest`);
      }
    }
  }

  return registry;
}

export function loadFrqRubricRegistry(serializedRegistry) {
  let registry;
  try {
    registry = typeof serializedRegistry === 'string'
      ? JSON.parse(serializedRegistry)
      : serializedRegistry;
  } catch (error) {
    throw new Error(`invalid FRQ rubric bundle JSON: ${error.message}`);
  }
  return validateFrqRubricRegistry(registry);
}

export function getServerReflectionItem(registry, prefix, textareaId) {
  const item = registry?.worksheets?.[prefix]?.items?.[textareaId];
  if (!item) throw unknownItemError(prefix, textareaId);
  return item;
}

export function buildServerReflectionPrompt(registry, prefix, textareaId, answer) {
  const item = getServerReflectionItem(registry, prefix, textareaId);
  return item.promptBeforeAnswer + answer + item.promptAfterAnswer;
}

export function parseServerReflectionItemId(registry, itemId) {
  if (typeof itemId !== 'string') throw new Error(`unknown FRQ item: ${String(itemId)}`);

  for (const [prefix, worksheet] of Object.entries(registry?.worksheets || {})) {
    for (const textareaId of Object.keys(worksheet?.items || {})) {
      if (`${prefix}-${textareaId}` === itemId) return { prefix, textareaId };
    }
  }

  throw new Error(`unknown FRQ item: ${itemId}`);
}
