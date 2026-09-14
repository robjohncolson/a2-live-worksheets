# Phase 24: Keyboard Input + LCD Display — Spec

## Vision Context

The TI-84 ROM boots, initializes hardware, and enters power-down HALT at 0x0019B5. On real hardware, key presses trigger interrupts that wake the CPU and enter the OS event loop — menus, input editor, computation, LCD rendering. Unlocking this interactive path is the gate to the full virtual calculator.

Phase 24 unlocks that gate: keyboard interrupts that wake the OS, keyboard scanning that reads key presses, and LCD VRAM rendering that shows the display.

## Current State

### What Works
- Boot: DI → PLL init → hardware setup → RST 0x08 → init → power-down HALT (18 steps post-PLL)
- Interrupt dispatch: NMI/IRQ wake from HALT, timer-driven interrupt controller
- Function calls: ti84-math.mjs calls ROM functions directly (FPAdd, FPMult, FPDiv confirmed)
- Peripheral bus: PLL, GPIO (0x03), flash (0x06), timers, interrupt controller (0x5000+)

### What's Blocked
The ISR at 0x000038 always re-enters power-down because of the **CP 0xD0 gate** at block 0x000704.

## Analysis: The ISR Dispatch Path

Traced byte-by-byte from the transpiled blocks:

### Step 1: IM1 Handler (0x000038:adl)
```asm
EX AF, AF'        ; save A/F
EXX               ; save BC/DE/HL
PUSH IX            ; save IX
PUSH IY            ; save IY
LD IY, 0xD00080    ; IY = system vars base
JP 0x0006F3        ; → flash check
```

### Step 2: Flash Status Check (0x0006F3:adl)
```asm
IN0 A, (0x06)      ; A = flash port value (currently returns 0x00)
BIT 2, A           ; test bit 2 (sets Z flag, does NOT modify A)
JR Z, 0x000704     ; if bit 2 = 0 → jump to 0x000704 (taken: 0x00 has bit 2 = 0)
                   ; fall through to 0x0006FA (flash-busy path, not taken)
```

### Step 3: The CP 0xD0 Gate (0x000704:adl)
```asm
SET 6, (IY+27)     ; set bit 6 of system flag at 0xD0009B (doesn't touch A)
NOP                ; ED 6E undefined → NOP (doesn't touch A)
CP 0xD0            ; compare A with 0xD0 — A is STILL the port 0x06 value!
JP NZ, 0x0019B5    ; if A ≠ 0xD0 → power-down (CURRENTLY ALWAYS TAKEN)
                   ; fall through to 0x000710 (callback dispatch)
```

### Step 4: Callback Dispatch (0x000710:adl) — currently unreachable
```asm
LD HL, (0xD02AD7)  ; load callback address from RAM
PUSH HL            ; push callback
CALL 0x001713      ; call callback dispatcher
```

## Key Finding: The Flash Port Fix

**A is never modified between the IN0 at 0x0006F3 and the CP at 0x00070A.** BIT tests flags without changing A. SET operates on memory. The NOP does nothing.

So A = port 0x06 return value. Currently 0x00. Needs to be 0xD0.

**Hypothesis**: The boot sequence writes 0xD0 (or some value) to port 0x06 during initialization. The current flash handler discards writes (stores `lastWrite` but always returns 0x00). Changing it to return `lastWrite` would unlock the gate.

**Why 0xD0?** On real hardware, 0xD0 likely signals "system initialized, interrupts should be processed." The OS writes this to port 0x06 during boot, then checks it in the ISR to distinguish between interrupts during boot (ignore) and interrupts during normal operation (dispatch).

**Verification needed**: Trace boot I/O writes to confirm the OS writes 0xD0 to port 0x06. If the OS writes a different value, the flash handler may need more nuanced logic.

## Keyboard I/O

### Port Assignment
- **Port 0x01**: Keyboard scan port (write = group select, read = key status)
- Found in transpiled blocks at 0x001B1D and 0x0019A9 (both `ioWritePage0(0x01, cpu.a)`)
- 0x0019A9 is near power-down — likely configures keyboard interrupt before HALT
- 0x001B1D is likely the keyboard scan routine called after wake

### TI-84 Keyboard Matrix (Active Low)
Write a byte to port 0x01 with one bit cleared to select a key group. Read port 0x01 to get which keys in that group are pressed (0 = pressed, 1 = released).

| Group | Select | Keys (bit 0→7 within group) |
|-------|--------|----------------------------|
| 0 (bit 0) | 0xFE | DOWN, LEFT, RIGHT, UP |
| 1 (bit 1) | 0xFD | ENTER, +, -, ×, ÷, ^, (-) |
| 2 (bit 2) | 0xFB | 3, 6, 9, ), TAN, VARS |
| 3 (bit 3) | 0xF7 | ., 2, 5, 8, (, COS, PRGM, STAT |
| 4 (bit 4) | 0xEF | 0, 1, 4, 7, ,, SIN, APPS, X,T,θ,n |
| 5 (bit 5) | 0xDF | STO→, LN, LOG, x², ,, MATH, ALPHA, F5 |
| 6 (bit 6) | 0xBF | DEL, MODE, 2ND, Y=, WINDOW, ZOOM, TRACE, GRAPH |
| 7 (bit 7) | 0x7F | (varies by model — may include ON key or be unused) |

**Important**: The exact matrix layout for the CE may differ from the classic TI-84. The analysis phase should verify by tracing keyboard scan routines in the ROM.

### Interrupt Wiring
- Interrupt controller (FTINTC010) bit 10 = keyboard interrupt
- To simulate key press:
  1. Set bit 10 in `intcState.rawStatus` (port 0x5000)
  2. Ensure bit 10 is set in `intcState.enableMask` (port 0x5004)
  3. Trigger IRQ via `peripherals.triggerIRQ()`
  4. When OS scans keyboard, port 0x01 returns the active key data

## LCD Display

### Current Knowledge
- LCD controller accessed via 16-bit ports at 0x4000+ (or memory-mapped I/O)
- VRAM is memory-mapped, likely at 0xD40000 (within RAM space) — needs verification
- Display: 320×240 pixels, 16-bit RGB565 color
- VRAM size: 320 × 240 × 2 = 153,600 bytes
- **Not accessed during current execution** — LCD writes happen after the OS enters its main event loop (post-keyboard-wake)
- References to `0x400000` and `0x400029` found in transpiled code (memory addresses, not I/O ports)

### Discovery Approach
Once the ISR dispatch is unlocked and the OS processes a key press:
1. Enable MMIO tracking (`trackMemoryMapped: true` in executor options)
2. Watch for writes to the 0xD40000+ or 0xE00000+ range
3. The first large burst of sequential writes to a consistent region = VRAM
4. Read LCD controller setup in the boot sequence to find the configured VRAM base

### Rendering
- Browser shell already has `<canvas id="lcd" width="320" height="240">`
- Once VRAM address is known: read 153,600 bytes, decode RGB565, paint to canvas
- RGB565 decode: R = (pixel >> 11) << 3, G = ((pixel >> 5) & 0x3F) << 2, B = (pixel & 0x1F) << 3

## Phase 24 Plan

### Phase 24A: Unlock ISR Dispatch (analysis + minimal fix)
1. Trace boot I/O writes — confirm port 0x06 gets 0xD0
2. Fix flash handler: return `state.flash.lastWrite` instead of 0x00
3. Register port 0x01 as keyboard scan handler
4. Test: boot → HALT → trigger keyboard IRQ → verify ISR reaches 0x000710
5. Report what happens at 0x000710 and beyond (new code regions discovered?)

### Phase 24B: Keyboard Matrix + Interactive Execution
1. Verify key matrix mapping by tracing keyboard scan routine
2. Implement keyboard peripheral with group select / key status
3. Wire interrupt controller bit 10 for keyboard
4. Test: simulated ENTER key press → OS processes key → continues past power-down
5. Run coverage analyzer — how many new blocks discovered?

### Phase 24C: LCD VRAM Discovery + Rendering
1. Enable MMIO tracking during post-keyboard execution
2. Find VRAM base address and display format
3. Implement VRAM → canvas rendering
4. Test: boot → key press → OS draws homescreen → canvas shows it

### Phase 24D: Browser Shell Integration
1. Map PC keyboard → TI-84 key matrix
2. Add keyboard event listeners in browser-shell.html
3. Wire LCD canvas to VRAM reads
4. Add continuous execution mode (run until HALT, wake on key, repeat)

## Files Involved

| File | Phase | Change |
|------|-------|--------|
| `TI-84_Plus_CE/peripherals.js` | 24A | Fix flash handler, add keyboard port 0x01 |
| `TI-84_Plus_CE/test-harness.mjs` | 24A | Add ISR dispatch test |
| `TI-84_Plus_CE/cpu-runtime.js` | 24C | Possibly extend MMIO tracking range |
| `TI-84_Plus_CE/browser-shell.html` | 24D | Keyboard input, LCD rendering, run loop |
| `TI-84_Plus_CE/keyboard.js` | 24B | NEW — keyboard matrix map + handler |
