# TI-84 Plus CE ROM Targeted Disassembly — Spec

**Goal**: Extract wizard field order, default values, and result screen layouts from the ROM binary so we can verify and fix `ti84-procedures-data.json` without manual step-through of all 384 steps.

**ROM**: `TI-84_Plus_CE/ROM.rom` — OS 5.8.2.0029, 4,194,304 bytes, eZ80 (24-bit Zilog) architecture.

---

## What We Already Know

Prior string extraction (`ti84-rom-wizard-fields.md`) found:
- **Wizard field labels** at `0xAEB30–0xAED00` — 35+ confirmed matches to JSON
- **Menu item names** at `0x7BDF9` (STAT>TESTS), `0xA0DEF` (DISTR), `0xA0808` (STAT>CALC)
- **Alternative hypothesis options** at `0xAEC05–0xAEC49`
- **Result variable tokens** at `0xA0A68–0xA0AE8`
- **TI token byte mappings** (0xCB=x̄, 0xC3=σ, 0xC7=μ, etc.)

**What string extraction CANNOT tell us** (and why we need disassembly):
1. **Field ORDER within each wizard** — labels are in a shared pool, not grouped per-wizard
2. **Default values** — stored in code/data tables, not as ASCII strings
3. **Result screen line order** — which output appears first (z= before p=? or vice versa?)
4. **Navigation structure** — how the cursor moves between fields
5. **Data/Stats toggle behavior** — which fields appear in each mode

## What We Need To Extract

### Priority 1: Wizard Field Tables (20 wizards)

For each wizard screen, we need the ordered list of fields. Each wizard is launched by a menu item in STAT>TESTS, STAT>CALC, or 2ND>DISTR. The OS likely stores per-wizard field definitions as data tables — arrays of pointers into the shared label pool at `0xAEB30`.

**Target**: A mapping from each wizard ID to its ordered field list:
```
one-var-stats-wizard: [List, FreqList, Calculate]
normalcdf-wizard: [lower, upper, μ, σ, Paste]
one-propztest-wizard: [p₀, x, n, prop≠p₀/>p₀/<p₀, Calculate, Draw]
t-test-stats-wizard: [μ₀, x̄, Sx, n, μ≠μ₀/>μ₀/<μ₀, Calculate, Draw]
...etc for all 20 wizards
```

**Approach**: Each STAT>TESTS menu item at `0x7BDF9` has an associated handler function. Follow the handler to find the wizard setup routine. The setup routine populates fields from a table. Extract those tables.

### Priority 2: Wizard Default Values

For each wizard field, what value is pre-filled:
- `List` defaults to `L₁`
- `FreqList` defaults to `1`
- `C-Level` defaults to `.95`
- `Tail` defaults to `LEFT`
- etc.

### Priority 3: Result Screen Line Order (14 result screens)

For each test's result screen, the exact line order. Example for 1-PropZTest:
```
Line 1: prop≠p₀  (or >p₀ or <p₀ depending on selection)
Line 2: z = {value}
Line 3: p = {value}
Line 4: p̂ = {value}
Line 5: n = {value}
```

The result display routines likely iterate over a field table. Find those tables.

### Priority 4: CNTB Verification

The JSON claims χ²GOF-Test result screen shows `CNTB` (contributions). The string `CNTB` was NOT found in the ROM. Either:
- It's computed/abbreviated at runtime
- It doesn't exist (Codex hallucinated it)
- It's stored in a compressed or tokenized form we missed

## Architecture Reference

### eZ80 Basics
- 24-bit address space (16MB), but ROM is 4MB
- Z80-compatible instruction set with 24-bit extensions
- Key registers: A, BC, DE, HL (all extendable to 24-bit with suffix instructions)
- `CALL addr` / `JP addr` for function calls/jumps
- ROM is mapped starting at 0x000000

### TI-84 CE OS Structure (from community RE)
- **OS entry points** are at known offsets (boot vectors, syscall table)
- **Menu system** uses a table-driven approach: each menu has a descriptor with item count, string pointers, and handler function pointers
- **Wizard forms** are rendered by a shared form engine that reads field descriptor arrays
- **Stat variable storage** uses a token-based system (1-2 bytes per variable)

### Known ROM Regions

| Region | Offset | Contents |
|--------|--------|----------|
| STAT>TESTS menu strings | 0x7BDF9–0x7BEC0 | Menu item names |
| STAT>CALC menu strings | 0xA0808–0xA0850 | Calc procedure names |
| DISTR menu strings | 0xA0DEF–0xA0E70 | Distribution function names |
| Alt hypothesis options | 0xAEC05–0xAEC49 | ≠/>/< choice strings |
| Wizard field labels | 0xAEB30–0xAED00 | Shared label pool |
| Result variable tokens | 0xA0A68–0xA0AE8 | Stat variable name→token |
| Result display strings | 0xAB3D6–0xAB49F | Alt hypothesis for results |
| Plot editor labels | 0xB24A3–0xB2518 | Xlist, Ylist, Freq, etc. |

## Output Format

Produce **one file**: `ti84-rom-disassembly-results.json`

```json
{
  "meta": {
    "rom": "TI-84 Plus CE OS 5.8.2.0029",
    "rom_size": 4194304,
    "extraction_date": "YYYY-MM-DD",
    "method": "eZ80 disassembly + data table extraction"
  },
  "wizards": {
    "one-var-stats-wizard": {
      "entry_offset": "0x??????",
      "fields": [
        { "label": "List", "label_offset": "0xAEB45", "default": "L₁", "type": "list-selector", "position": 1 },
        { "label": "FreqList", "label_offset": "0xAECC4", "default": "1", "type": "list-selector", "position": 2 },
        { "label": "Calculate", "label_offset": "0xAEBD1", "type": "action-button", "position": 3 }
      ],
      "confidence": "high|medium|low",
      "notes": "any ambiguities"
    }
  },
  "results": {
    "one-var-stats-result-page1": {
      "lines": ["x̄ = {value}", "Σx = {value}", "Σx² = {value}", "Sx = {value}", "σx = {value}", "n = {value}"],
      "scrollable": true,
      "confidence": "high|medium|low"
    }
  },
  "discrepancies": [
    {
      "item": "wizard or result ID",
      "field": "which field",
      "json_says": "what ti84-procedures-data.json claims",
      "rom_says": "what the ROM actually has",
      "confidence": "high|medium|low",
      "offset": "0x??????"
    }
  ]
}
```

## Constraints

- Do NOT modify any existing files
- Output only the results JSON file
- Include ROM offsets for every claim so findings are verifiable
- Mark confidence levels honestly — `low` is fine if the data table structure is ambiguous
- If you can't fully disassemble a handler, extract what you can and note the gap
