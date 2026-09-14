# Phase 23: Function Call Harness — Spec

## Vision Context

The TI-84 Plus CE ROM transpilation is being integrated into the AP Statistics curriculum app (curriculum_render). The end state: a fully interactive virtual TI-84 embedded in the curriculum where students can free-roam menus, perform calculations, and produce graphs — all running on the actual transpiled ROM in JavaScript.

The curriculum app will:
- Offer a virtual TI-84 with full keyboard, rendering TI-84 screens in a `<canvas>` window
- Run a recommendation state machine that suggests optimal next keypresses but doesn't constrain the student
- Record all keystrokes, diff against the optimal sequence, and store alignment % in Supabase
- Use the ROM engine for all computation (not chart.js or other JS math libs), ensuring exact TI-84 rounding/formatting
- Route TI-84 LCD output to an in-app window (replacing physical calculator screen)
- Eventually replace chart.js visuals with R-generated plots (server-side or WebR)

Phase 23 builds the bridge between transpiled ROM blocks and callable JavaScript functions. This is the foundation everything else builds on.

## Goal

Create `TI-84_Plus_CE/ti84-math.mjs` — a module that:

1. Converts JS numbers to/from TI-84 9-byte BCD floating point format
2. Discovers OS function entry points by analyzing RST 0x28 call sites in transpiled code
3. Calls ROM functions directly — writes args to OP registers, executes, reads results
4. Exposes a clean `ti84.*` API for downstream use

## TI-84 Real Number Format (9-byte BCD)

```
Byte:  [0]        [1]          [2]  [3]  [4]  [5]  [6]  [7]  [8]
       type/sign   exponent    --------- BCD mantissa (14 digits) ---------
```

### Byte 0: Type and Sign
- Bit 7 (0x80): Sign flag (1 = negative)
- Bits 6-0: Object type (0x00 = real number)

### Byte 1: Exponent
- Excess-0x80 notation: stored = actual_exponent + 0x80
- 0x80 = 10^0, 0x81 = 10^1, 0x7F = 10^-1
- Range: 10^-128 to 10^127

### Bytes 2-8: Mantissa
- 14 BCD digits (2 per byte), most significant first
- Normalized: leading digit is 1-9 (except for zero)
- Value = ±D₁.D₂D₃D₄...D₁₄ × 10^(exponent - 0x80)

### Reference Values

| Value | B0 | B1 | B2-B8 |
|-------|----|----|-------|
| 0 | 00 | 80 | 00 00 00 00 00 00 00 |
| 1 | 00 | 80 | 10 00 00 00 00 00 00 |
| -1 | 80 | 80 | 10 00 00 00 00 00 00 |
| 3.14159265359 | 00 | 80 | 31 41 59 26 53 59 00 |
| 100 | 00 | 82 | 10 00 00 00 00 00 00 |
| 0.5 | 00 | 7F | 50 00 00 00 00 00 00 |
| -42.7 | 80 | 81 | 42 70 00 00 00 00 00 |

### Zero Representation
Zero has all-zero mantissa. The exponent byte may be 0x80 or 0x00 depending on context. The decoder (`tiRealToJS`) must treat any value with all-zero mantissa digits as zero regardless of exponent.

## OP Register Addresses (TI-84 Plus CE)

Fixed RAM locations for math function arguments/results:

| Register | Address | Purpose |
|----------|---------|---------|
| OP1 | 0xD005F8 | Primary argument / return value |
| OP2 | 0xD00601 | Secondary argument |
| OP3 | 0xD0060A | Scratch / third argument |
| OP4 | 0xD00613 | Scratch |
| OP5 | 0xD0061C | Scratch |
| OP6 | 0xD00625 | Scratch |

**Convention**: Math functions read from OP1/OP2, write result to OP1, may clobber OP2-OP6.

**Verification**: Search transpiled blocks for loads/stores referencing 0xD005F8 to confirm these addresses match this ROM version.

## System Call Mechanism

TI-84 CE OS functions are invoked via `RST 0x28` followed by a 3-byte inline address:

```asm
RST 0x28          ; opcode 0xEF
.DL  targetAddr   ; 3-byte LE target address
; execution continues here after the function returns
```

The RST 0x28 handler reads the inline address, pushes the adjusted return address, and jumps to the target. For our harness, we bypass this mechanism and call functions directly by setting PC.

## Function Discovery Strategy

### Step 1: RST 0x28 Call Site Scan
Walk the ROM binary looking for opcode 0xEF (RST 0x28). At each occurrence, read the next 3 bytes as a LE address. Build a frequency map of targets. High-frequency targets are core OS functions.

### Step 2: Behavioral Identification
For top-frequency targets:
- Set up known inputs in OP1/OP2
- Call the function
- Check OP1 for expected result
- Example: if callFunction(addr, [2.5, 3.7]) produces OP1=6.2, that's FPAdd

### Step 3: Cross-Reference
Known TI-84 CE SDK function names for math:
- _FPAdd, _FPSub, _FPMult, _FPDiv
- _SqRoot, _Sin, _Cos, _Tan, _Ln, _Exp
- _Int (integer part), _Round
- _Mov9ToOP1, _Mov9ToOP2 (copy helpers)
- _PushRealO1, _PopRealO1 (OP1 stack operations)

Exact addresses depend on OS version. Discovery + behavioral testing is more reliable than hardcoding.

## API Design

```javascript
// ti84-math.mjs exports

// Codec
export function jsToTIReal(value);    // → Uint8Array(9)
export function tiRealToJS(bytes);    // → number

// Discovery
export function discoverSystemCalls(romBytes);  // → Map<addr, {count, sites}>

// Harness
export async function callFunction(entryPoint, args, options);
// → { result, rawResult, steps, exitReason }

// High-level API (populated after discovery)
export const ti84 = {};
```

## Harness Execution Model

For each function call:
1. Load ROM blocks + create writable RAM overlay at 0xD00000+
2. Create peripheral bus (PLL, GPIO, flash, timers — needed for some OS paths)
3. Write arguments to OP1, OP2, ... as TI Real bytes
4. Set SP to safe stack area (0xD1A87F = top of user RAM on CE)
5. Push sentinel return address (0xFFFFFF) — when function RETs here, no block exists → `missing_block` exit = clean return
6. Set PC to function entry point
7. Execute with step limit (default 10,000)
8. Read 9 bytes from OP1, convert to JS number
9. Return result + metadata

### State Isolation
Each call starts fresh — no state leaks between calls. This is correct for direct function calls. The future interactive mode (Phase 25+) will maintain persistent state across keystrokes.

## Target Functions by Priority

### Tier 1: Basic Arithmetic (Phase 23)
FPAdd, FPSub, FPMult, FPDiv — proves the harness works

### Tier 2: Scientific Functions (Phase 24)
Sin, Cos, Tan, Ln, Exp, SqRoot, Powers — foundation for distributions

### Tier 3: Distribution Functions (Phase 25)
NormalCDF, InvNorm, tcdf, invT, χ²cdf, binompdf, binomcdf — AP Stats core

### Tier 4: Statistical Procedures (Phase 26+)
1-Var Stats, LinReg, 1-PropZTest, χ²GOF — full AP Stats coverage

## Integration Roadmap

```
Phase 23 (this)     → callFunction() + codec + discovery
Phase 24            → keyboard simulation + LCD buffer
Phase 25            → interactive mode (keystrokes → ROM → screen)
Phase 26            → curriculum_render integration (virtual TI-84 in worksheets)
Phase 27            → keystroke recording + alignment scoring + Supabase
Phase 28            → R visualization layer (replace chart.js)
```

## Files Involved

| File | Role |
|------|------|
| `TI-84_Plus_CE/ti84-math.mjs` | **NEW** — Function call harness (this phase) |
| `TI-84_Plus_CE/cpu-runtime.js` | CPU class + executor (read, don't modify) |
| `TI-84_Plus_CE/peripherals.js` | I/O peripheral bus (read, don't modify) |
| `TI-84_Plus_CE/ROM.transpiled.js` | 124K transpiled blocks (import) |
| `TI-84_Plus_CE/ROM.rom` | Raw ROM binary (read for discovery scan) |
| `TI-84_Plus_CE/test-harness.mjs` | Reference for executor setup patterns |
