# Phase 23: Function Call Harness — Codex Prompt

## Overview

Build `TI-84_Plus_CE/ti84-math.mjs` — a module that converts JS numbers to TI-84 format, discovers OS function entry points, and calls transpiled ROM math functions directly. This is the bridge between the transpiled ROM and the AP Stats curriculum app.

There is one prerequisite: the CPU memory model currently masks all addresses to 4MB (`& 0x3fffff`), but the TI-84 CE RAM (where OP registers live) is at 0xD00000+. A small targeted change to `cpu-runtime.js` is needed first.

---

## Prerequisite: Memory Model Fix (cpu-runtime.js)

### Problem

In `TI-84_Plus_CE/cpu-runtime.js`, the `read8`/`write8`/`read16`/`write16`/`read24`/`write24` methods all use a hardcoded `& 0x3fffff` mask (lines 101-129). This limits memory access to 4MB, but TI-84 CE math functions read/write OP registers at 0xD005F8+ (13MB range). Accesses to 0xD005F8 currently alias to `memory[0x1005F8]` — inside the ROM, not RAM.

### Fix

Make the mask derive from the memory array size so larger arrays work correctly.

**Step 1:** Add a computed mask in the constructor (line 23 area):

```javascript
constructor(memory) {
    this.memory = memory || new Uint8Array(0x400000);
    this._memMask = this.memory.length - 1;
    // ... rest unchanged
```

**Step 2:** Replace every `& 0x3fffff` in the 6 memory methods with `& this._memMask`:

```javascript
// read8 (line ~101)
read8(addr) {
    return this.memory[addr & this._memMask] ?? 0;
}

// write8 (line ~105)
write8(addr, value) {
    this.memory[addr & this._memMask] = value & 0xff;
}

// read16 (line ~109)
read16(addr) {
    const a = addr & this._memMask;
    return this.memory[a] | (this.memory[a + 1] << 8);
}

// write16 (line ~114)
write16(addr, value) {
    const a = addr & this._memMask;
    this.memory[a] = value & 0xff;
    this.memory[a + 1] = (value >> 8) & 0xff;
}

// read24 (line ~120)
read24(addr) {
    const a = addr & this._memMask;
    return this.memory[a] | (this.memory[a + 1] << 8) | (this.memory[a + 2] << 16);
}

// write24 (line ~125)
write24(addr, value) {
    const a = addr & this._memMask;
    this.memory[a] = value & 0xff;
    this.memory[a + 1] = (value >> 8) & 0xff;
    this.memory[a + 2] = (value >> 16) & 0xff;
}
```

**That's it** — 7 lines changed. Backward compatible: existing code passes 4MB arrays and gets the same 0x3FFFFF mask. New code passes 16MB arrays and gets 0xFFFFFF.

**Constraint:** Memory arrays MUST be power-of-2 sized for the mask to work. The two expected sizes are 0x400000 (4MB, existing) and 0x1000000 (16MB, new).

### Verification

After this change, run the existing test harness — it must still pass:

```bash
node TI-84_Plus_CE/test-harness.mjs
```

All 8 tests should produce identical results (they use the default 4MB romBytes array, so `_memMask` = 0x3FFFFF = same as before).

---

## Main Task: Create `TI-84_Plus_CE/ti84-math.mjs`

### File Structure (~300 lines)

```
Section 1: TI Float Codec          (~80 lines)
Section 2: OP Register Constants    (~10 lines)
Section 3: System Call Discovery    (~60 lines)
Section 4: Function Call Harness    (~80 lines)
Section 5: Behavioral Identification (~40 lines)
Section 6: Self-Test (main)         (~50 lines)
```

---

### Section 1: TI Float Codec

```javascript
export function jsToTIReal(value)   // Returns Uint8Array(9)
export function tiRealToJS(bytes)   // Returns number
```

**TI-84 Real Number Format (9-byte BCD):**

```
Byte:  [0]        [1]          [2]  [3]  [4]  [5]  [6]  [7]  [8]
       type/sign   exponent    --------- BCD mantissa (14 digits) ---------
```

- **Byte 0:** Bit 7 = sign (1 = negative). Bits 6-0 = type (0x00 for real numbers).
- **Byte 1:** Exponent in excess-0x80 notation. 0x80 = 10^0, 0x81 = 10^1, 0x7F = 10^-1.
- **Bytes 2-8:** 14 BCD digits packed (2 per byte, high nibble first). Normalized: first digit 1-9 (except zero).
- **Value:** sign * D1.D2D3...D14 * 10^(byte1 - 0x80)

**`jsToTIReal(value)` algorithm:**

1. If value is 0 (or very close, e.g. `Math.abs(value) < 1e-99`): return `Uint8Array([0x00, 0x80, 0, 0, 0, 0, 0, 0, 0])`
2. Separate sign. byte0 = value < 0 ? 0x80 : 0x00
3. `abs = Math.abs(value)`
4. `exp = Math.floor(Math.log10(abs))`
5. Clamp exp to [-128, 127] range
6. `byte1 = exp + 0x80`
7. Normalize: `mantissa = abs / Math.pow(10, exp)` — gives 1.0 <= mantissa < 10.0
8. Scale to 14-digit integer: `digits = Math.round(mantissa * 1e13)` — 14-digit value
9. If digits >= 1e14: `digits = Math.floor(digits / 10); exp++; byte1 = exp + 0x80` (rounding overflow)
10. Pack into 7 bytes (bytes 2-8): for i in [0..6], `byte = ((digits / 10^(12-2*i)) % 100)` packed as high nibble = tens digit, low nibble = ones digit
11. Return Uint8Array(9)

**`tiRealToJS(bytes)` algorithm:**

1. If bytes[2] through bytes[8] are ALL zero: return 0 (regardless of exponent)
2. sign = (bytes[0] & 0x80) ? -1 : 1
3. exp = bytes[1] - 0x80
4. Unpack 14 BCD digits from bytes 2-8:
   - Each byte has high nibble (>> 4) and low nibble (& 0xf)
   - Build as: D1.D2D3D4...D14
5. mantissa = (digit string as float) — e.g. sum of digits[i] * 10^(-i) for i = 0..13
6. Return sign * mantissa * Math.pow(10, exp)

**Test vectors (these MUST round-trip correctly):**

| JS value | Hex bytes |
|---|---|
| 0 | `00 80 00 00 00 00 00 00 00` |
| 1 | `00 80 10 00 00 00 00 00 00` |
| -1 | `80 80 10 00 00 00 00 00 00` |
| 100 | `00 82 10 00 00 00 00 00 00` |
| 0.5 | `00 7F 50 00 00 00 00 00 00` |
| -42.7 | `80 81 42 70 00 00 00 00 00` |
| 3.14159265359 | `00 80 31 41 59 26 53 59 00` |

**Round-trip tolerance:** For exact values (0, 1, -1, 100), expect exact match. For values like pi, accept tolerance of 1e-10 (BCD truncation at 14 digits).

---

### Section 2: OP Register Constants

```javascript
const OP1 = 0xD005F8;
const OP2 = 0xD00601;
const OP3 = 0xD0060A;
const OP4 = 0xD00613;
const OP5 = 0xD0061C;
const OP6 = 0xD00625;
const OP_SIZE = 9;

const STACK_TOP = 0xD1A87E;  // Top of user RAM on TI-84 CE (stack grows downward)
const SENTINEL = 0xFFFFFF;   // Non-existent address — triggers missing_block on RET
```

Convention: OS math functions read inputs from OP1/OP2, write result to OP1, may clobber OP2-OP6.

---

### Section 3: System Call Discovery

```javascript
export function discoverSystemCalls(romBytes)
// romBytes: Uint8Array (the raw 4MB ROM)
// Returns: Map<targetAddress, { count, sites: [srcAddress, ...] }>
```

Scan the ROM binary for RST 0x28 instructions (opcode 0xEF). For each at position `pos`:
1. Read 3 bytes at `pos+1` as little-endian 24-bit: `target = rom[pos+1] | (rom[pos+2] << 8) | (rom[pos+3] << 16)`
2. Filter: target must be < 0x100000 (OS code area) and > 0x000100 (skip low addresses/vectors)
3. Add to frequency map

Return a Map sorted by descending call count.

When run in self-test, print the top 30:
```
System Call Discovery
=====================
Address    Calls
0x0XXXXX   247
0x0XXXXX   183
...
```

---

### Section 4: Function Call Harness

```javascript
export function callFunction(entryPoint, args = [], options = {})
```

**Parameters:**
- `entryPoint`: number — ROM address of the function to call
- `args`: number[] — JS values, written to OP1, OP2, OP3, ... (max 6)
- `options.maxSteps`: number (default 10000) — execution step limit
- `options.trace`: boolean (default false) — log each block to console

**Returns:** `{ result, rawResult, steps, termination }`
- `result`: number — JS value decoded from OP1 after execution
- `rawResult`: Uint8Array(9) — raw TI bytes from OP1
- `steps`: number — blocks executed
- `termination`: string — 'missing_block' (clean return), 'halt', 'max_steps', 'error'

**Implementation:**

```javascript
import { readFileSync } from 'node:fs';
import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
```

**IMPORTANT — ROM loading:** Do NOT use `decodeEmbeddedRom()` for the memory array. That function returns a 4MB ROM image, but we need 16MB to cover the RAM address space. Instead:

```javascript
// Module-level (load once, reuse across calls):
const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const romBuffer = readFileSync(ROM_PATH);

function createMemory() {
    // 16MB = full eZ80 address space, power-of-2 for mask
    const mem = new Uint8Array(0x1000000);
    mem.set(romBuffer);  // ROM at 0x000000-0x3FFFFF
    // RAM at 0xD00000-0xD1FFFF is writable (starts zeroed)
    return mem;
}
```

**Harness steps (fresh state per call):**

1. Create fresh 16MB memory with ROM loaded
2. Create peripheral bus: `createPeripheralBus({ timerInterrupt: false })` — disable timer interrupts for isolated function calls (we don't want NMI/IRQ interrupting math)
3. Create executor: `createExecutor(PRELIFTED_BLOCKS, memory, { peripherals })`
4. Get cpu ref: `const { cpu } = executor`
5. Reset CPU state:
   ```javascript
   cpu.a = 0; cpu.f = 0; cpu.b = 0; cpu.c = 0;
   cpu.d = 0; cpu.e = 0; cpu.h = 0; cpu.l = 0;
   cpu.sp = STACK_TOP;
   cpu._ix = 0; cpu._iy = 0xD00080;  // IY = OS system vars base (standard TI convention)
   cpu.i = 0; cpu.im = 1;
   cpu.iff1 = 0; cpu.iff2 = 0;
   cpu.madl = 1;
   cpu.halted = false;
   ```
6. Write args to OP registers:
   ```javascript
   const opAddrs = [OP1, OP2, OP3, OP4, OP5, OP6];
   for (let i = 0; i < args.length; i++) {
       const tiBytes = jsToTIReal(args[i]);
       for (let j = 0; j < OP_SIZE; j++) {
           memory[opAddrs[i] + j] = tiBytes[j];
       }
   }
   ```
   Note: Write directly to the memory array, NOT through `cpu.write8()` — avoids any address translation issues during setup. The addresses are already the real 24-bit addresses and the 16MB array supports them directly.
7. Push sentinel return address:
   ```javascript
   cpu.sp -= 3;
   memory[cpu.sp] = SENTINEL & 0xFF;
   memory[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
   memory[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;
   ```
   When the function RETs, it pops 0xFFFFFF → no transpiled block at that address → executor exits with `termination: 'missing_block'`. This is the clean exit signal.
8. Execute:
   ```javascript
   const result = executor.runFrom(entryPoint, 'adl', {
       maxSteps,
       maxLoopIterations: 200,
       onBlock: trace ? (pc, mode, meta, step) => {
           const dasm = meta?.instructions?.[0]?.dasm ?? '???';
           console.log(`  [${step}] ${pc.toString(16).padStart(6,'0')}:${mode} ${dasm}`);
       } : undefined,
   });
   ```
9. Read result from OP1:
   ```javascript
   const rawResult = new Uint8Array(OP_SIZE);
   for (let j = 0; j < OP_SIZE; j++) {
       rawResult[j] = memory[OP1 + j];
   }
   ```
10. Return:
    ```javascript
    return {
        result: tiRealToJS(rawResult),
        rawResult,
        steps: result.steps,
        termination: result.termination,
    };
    ```

**Key detail:** A termination of `'missing_block'` with the last PC at 0xFFFFFF (or near it) means the function returned cleanly. Any other termination means something went wrong (max_steps = function took too long or looped; halt = function halted the CPU; error = crash).

---

### Section 5: Behavioral Function Identification

```javascript
function identifyFunction(addr) {
    // Try arithmetic test cases to identify what a function does
    const tests = [
        { args: [2, 3],    expect: 5,      name: 'FPAdd' },
        { args: [7, 3],    expect: 4,      name: 'FPSub' },
        { args: [6, 7],    expect: 42,     name: 'FPMult' },
        { args: [22, 7],   expect: 22/7,   name: 'FPDiv',  tol: 1e-10 },
        { args: [9],       expect: 3,      name: 'SqRoot' },
    ];

    for (const t of tests) {
        try {
            const r = callFunction(addr, t.args, { maxSteps: 5000 });
            if (r.termination !== 'missing_block' && r.termination !== 'halt') continue;
            const diff = Math.abs(r.result - t.expect);
            if (diff < (t.tol || 1e-12)) return { name: t.name, steps: r.steps };
        } catch {
            // not a math function or crashed
        }
    }
    return null;
}
```

### Known addresses for cross-reference

These addresses are from Phase 22A OS jump table analysis. Use them to validate discovery:

| Function | Address | Source |
|----------|---------|--------|
| FPAdd | 0x07C77F | Jump table |
| FPMult | 0x07C8B7 | Jump table |
| FPDiv | 0x07CAB9 | Jump table |
| SqRoot | 0x07DF66 | Jump table |
| Sin | 0x07E57B | Jump table |
| Cos | 0x07E5B5 | Jump table |
| Tan | 0x07E5D8 | Jump table |
| OneVar | 0x0A9325 | Jump table |

If behavioral identification matches any of these addresses, report it as a confirmed match.

---

### Section 6: Self-Test (main block)

When run directly (`node TI-84_Plus_CE/ti84-math.mjs`), execute:

```javascript
// Use a robust main-module check for Windows compatibility
const isMain = process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\//, ''));
```

Or simpler — just always run the self-test (no conditional needed since this is a standalone tool file, not a library yet).

**Self-test flow:**

1. **Codec tests:** For each of the 7 test vectors, verify:
   - `jsToTIReal(value)` produces the expected hex bytes
   - `tiRealToJS(jsToTIReal(value))` round-trips to within tolerance
   - Print PASS/FAIL for each

2. **Discovery scan:**
   - Load ROM binary: `readFileSync(new URL('./ROM.rom', import.meta.url))`
   - Run `discoverSystemCalls(romBytes)`
   - Print top 30 targets with call counts

3. **Known-address smoke test:**
   - Try `callFunction(0x07C77F, [2, 3])` — expected result ~5 (FPAdd)
   - Try `callFunction(0x07C8B7, [6, 7])` — expected result ~42 (FPMult)
   - Try `callFunction(0x07CAB9, [22, 7])` — expected result ~3.142857... (FPDiv)
   - Print result, steps, termination for each
   - Mark PASS if result matches within tolerance, FAIL otherwise

4. **Behavioral sweep:**
   - Take the top 50 discovery targets
   - Run `identifyFunction(addr)` on each
   - Print any matches found

Print a final summary: codec tests passed, functions discovered, functions identified.

---

## Files to read before coding

1. **`TI-84_Plus_CE/cpu-runtime.js`** — Full file. Understand CPU class, createExecutor, runFrom signatures and return values. The prerequisite change targets lines 22-23 (constructor) and 101-129 (memory methods).

2. **`TI-84_Plus_CE/peripherals.js`** — Full file. Understand createPeripheralBus options.

3. **`TI-84_Plus_CE/test-harness.mjs`** — Lines 1-50. See how ROM is loaded, executor created, CPU state initialized.

---

## Files to create/modify

| File | Action |
|------|--------|
| `TI-84_Plus_CE/cpu-runtime.js` | MODIFY — add `_memMask` to constructor, replace 6 instances of `& 0x3fffff` with `& this._memMask` |
| `TI-84_Plus_CE/ti84-math.mjs` | CREATE — the full function call harness (~300 lines) |

---

## Constraints

- ES modules (`import`/`export`), no classes, plain functions and `const`
- No npm dependencies — only `node:fs` and `node:url` from stdlib
- `ROM.transpiled.js` is imported for PRELIFTED_BLOCKS; `ROM.rom` is read as binary for discovery scan and memory initialization
- Do NOT modify peripherals.js, test-harness.mjs, ez80-decoder.js, or the transpiler
- Do NOT add new transpilation seeds
- Do NOT implement trig/stats functions — just prove the harness works with basic arithmetic (FPAdd/Sub/Mult/Div)
- Early returns, flat structure, liberal comments

---

## Verification

```bash
# 1. Syntax check both files
node --check TI-84_Plus_CE/cpu-runtime.js
node --check TI-84_Plus_CE/ti84-math.mjs

# 2. Existing tests still pass (backward compat)
node TI-84_Plus_CE/test-harness.mjs

# 3. Full self-test
node TI-84_Plus_CE/ti84-math.mjs
```

**Expected output from self-test:**
1. 7/7 codec round-trip tests pass
2. Discovery reports 50-200+ unique system call targets
3. At least one known-address smoke test produces a plausible numeric result
4. Behavioral sweep may identify some functions (or may not — depends on execution coverage)

**It is OK if some functions fail.** Not all ROM functions may execute correctly yet — some may hit missing blocks, exceed step limits, or require RAM state we don't set up. The goal is: codec works, harness runs, at least FPAdd returns 5 for inputs (2, 3). If that works, Phase 23 is complete.
