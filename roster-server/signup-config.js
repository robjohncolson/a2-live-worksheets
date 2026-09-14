// signup-config.js — open self-signup section allowlist (value:label pairs).
//
// Students choose their actual class section. OPEN_SIGNUP_SECTIONS can override
// the value:label list for an isolated deployment; the default is C/D/G.

const DEFAULT_SECTIONS = [
  { value: 'C', label: 'Section C' },
  { value: 'D', label: 'Section D' },
  { value: 'G', label: 'Section G' },
];

// Pure parser — exported for tests. Never throws; falls back to DEFAULT_SECTIONS.
export function parseOpenSections(envValue) {
  if (!envValue || typeof envValue !== 'string') return DEFAULT_SECTIONS.slice();

  const out = [];
  for (const part of envValue.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    const value = (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
    const label = (idx === -1 ? '' : trimmed.slice(idx + 1)).trim() || value;
    if (value) out.push({ value, label });
  }
  return out.length ? out : DEFAULT_SECTIONS.slice();
}

// Read the live allowlist from the environment.
export function getOpenSections() {
  return parseOpenSections(process.env.OPEN_SIGNUP_SECTIONS);
}

// Is this section value one a student may self-enroll into? (Authoritative gate —
// the server NEVER trusts the section the client sends without this check.)
export function isOpenSection(value) {
  return getOpenSections().some((s) => s.value === value);
}
