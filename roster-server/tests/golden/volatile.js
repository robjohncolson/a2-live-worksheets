// Increment whenever the stripping contract changes. expected.json.gz records this
// value so a test cannot silently compare snapshots made by older rules.
export const VOLATILE_VERSION = 'apstats-golden-volatile/v1';

const VOLATILE_KEYS = new Set([
  // GET /grade and GET /class/grades generate this timestamp from new Date().
  'asOf',
  // Generated artifacts may stamp their wall-clock creation time under this key.
  'generatedAt',
  // Receipt identifiers are minted by the signing path, not by grade math.
  'receiptId',
  'receipt_id',
  // Compact receipts contain a signature and issuer-dependent envelope bytes.
  'receiptCompact',
  'receipt_compact',
  // Explicit signature spellings are signing output, never grade-engine output.
  'signature',
  'sig',
]);

export function stripVolatile(json) {
  if (Array.isArray(json)) return json.map(stripVolatile);
  if (!json || typeof json !== 'object') return json;

  const stripped = {};
  for (const [key, value] of Object.entries(json)) {
    if (VOLATILE_KEYS.has(key)) continue;
    stripped[key] = stripVolatile(value);
  }
  return stripped;
}
