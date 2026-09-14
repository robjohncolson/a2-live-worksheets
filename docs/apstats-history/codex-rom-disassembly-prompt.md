# Codex Task: TI-84 Plus CE ROM Targeted Disassembly

## Context

We're building a TI-84 Plus CE procedural trainer for AP Statistics students. We have `ti84-procedures-data.json` with 27 procedures, 20 wizard screens, and 14 result screens — but the **field order**, **default values**, and **result line order** were guessed by a previous Codex run, not verified against the ROM.

We have the ROM binary (`TI-84_Plus_CE/ROM.rom`, 4MB, OS 5.8.2.0029, eZ80 architecture). A prior extraction found wizard field label strings at known offsets (documented in `ti84-rom-wizard-fields.md`), but string extraction can't determine field **order** or **defaults** — those are in data tables and code.

**Your job**: Disassemble the relevant ROM regions to extract wizard field tables, default values, and result screen layouts. Produce a structured JSON report.

## Files You Have

| File | Purpose |
|------|---------|
| `TI-84_Plus_CE/ROM.rom` | The ROM binary (4,194,304 bytes, eZ80) |
| `ti84-procedures-data.json` | Current procedure data (27 procedures, 65 screens) — your reference for what to verify |
| `ti84-rom-wizard-fields.md` | Prior string extraction report — known offsets for labels, tokens, menus |
| `ti84-rom-disassembly-spec.md` | Full spec with output schema, known ROM regions, and architecture notes |

## Your Approach

### Step 1: Build a minimal eZ80 disassembler (or use byte-level analysis)

The eZ80 is a Z80 superset with 24-bit address extensions. You don't need a full disassembler — focus on:
- `CALL` instructions (CD xx xx / CD xx xx xx) to trace function calls
- `LD` instructions to find table base addresses loaded into registers
- `JP`/`JR` for control flow
- Data table patterns: sequential pointer arrays, field descriptor structs

If writing a disassembler is too complex, use pattern-based byte analysis:
- Find cross-references from menu handler addresses to wizard setup code
- Look for pointer arrays near known string offsets
- Identify repeated structural patterns (field descriptors are likely uniform structs)

### Step 2: Trace menu item → wizard handler → field table

Starting points (from `ti84-rom-wizard-fields.md`):

**STAT > TESTS menu** at `0x7BDF9`:
- Each menu item has a name string (we found those) and an associated handler function pointer
- The handler function sets up the wizard form
- The wizard setup reads from a field descriptor table
- Find the handler pointer table near the menu string table

**STAT > CALC menu** at `0xA0808`:
- Same pattern — handler pointers near menu strings

**2ND > DISTR menu** at `0xA0DEF`:
- Same pattern

### Step 3: Extract field descriptor tables

For each wizard, the field table likely contains per-field:
- Pointer to label string (into the pool at `0xAEB30–0xAED00`)
- Field type (number, choice, list-selector, action-button)
- Default value or pointer to default
- Position/order (or implied by array index)

Extract these for all 20 wizard screens.

### Step 4: Extract result screen display tables

Each test's result display routine iterates over a list of variable tokens to show. Find these display lists. They likely reference the variable token table at `0xA0A68–0xA0AE8`.

### Step 5: Cross-reference with JSON and report discrepancies

Compare your findings to `ti84-procedures-data.json`. For each wizard/result screen, note:
- Fields that match
- Fields in wrong order
- Missing or extra fields
- Wrong default values
- Wrong result line order

## Output

Produce **one file**: `ti84-rom-disassembly-results.json`

Follow the schema in `ti84-rom-disassembly-spec.md`. Key requirements:
- Include ROM offset for every claim
- Mark confidence: `high` (clear data table), `medium` (inferred from patterns), `low` (uncertain)
- Document your disassembly approach in `meta.method`

## Tips

- The eZ80 in ADL mode uses 3-byte addresses. In Z80-compat mode, 2-byte. The TI-84 CE ROM runs primarily in ADL mode (24-bit).
- TI's OS is proprietary but the Cemetech community has documented many OS internals. Key resources if you have access: WikiTI, the CEmu source code (which contains OS call tables and memory maps).
- Menu descriptor tables in TI-OS typically follow this pattern: item count byte, then N entries of [string_ptr, handler_ptr] or similar.
- Don't try to disassemble the entire ROM. Focus on the ~20 wizard handlers and ~14 result display routines.
- If you find a shared "form engine" function that all wizards call, document its calling convention — that's the key to understanding field tables.

## What NOT To Do

- Do NOT modify `ti84-procedures-data.json` or any other existing file
- Do NOT generate code for the trainer app
- Do NOT hallucinate field orders — if you can't determine the order from the ROM, say so with `"confidence": "low"`
- Do NOT assume ROM string table order = display order (we learned this lesson the hard way with STAT>TESTS menu)

## Scope

Focus on the 20 wizards and 14 result screens used by AP Statistics procedures. Ignore:
- Finance wizards
- Matrix editor (we have it but it's simple)
- Graph/Window settings
- Programming features
- Anything not in `ti84-procedures-data.json`
