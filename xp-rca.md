# XP Calculation RCA & Fix Document

## User-Reported Issue
When game mode (real/meta) + dynamic XP (situation difficulty) are both enabled, the contribution of dynamic XP is not visible.

---

## Root Cause Analysis

### Bug 1 — SUCCESS CARD shows standard XP instead of game XP (PRIMARY)
**File:** `src/screens/AddEvent.jsx` lines 264–282

After submitting an event, the success card always renders `lastResult.xpChange` (standard XP) and `opp.current_xp / opp.current_level` (standard XP levels). In game mode the meaningful value is `lastResult.gameXpChange` and `opp.game_xp`.

**Example:**
- Situation: challenging_level = 5, real (not meta)
- Choice: "Well Done!" (4)
- Standard XP (with dynamic): round(5 × 1.67) = 8 → shown in success card
- Game XP (with dynamic + real doubling): round(10 × 1.67) × 2 = 34 → hidden

User sees "+8 XP" but expected "+34 game XP". Looks like dynamic XP "didn't contribute" because the game XP is never shown.

**Status:** FIX APPLIED ✅

---

### Bug 2 — NON-GAME-MODE opportunities preview is broken (IIFE not returned)
**File:** `src/screens/AddEvent.jsx` lines 627–648

The standard-mode opportunity preview uses an IIFE `{(() => { ... })()}` but does NOT `return` its result from the outer `map` callback. The JSX is computed and discarded. The opportunities list renders empty in non-game mode.

```js
// BROKEN — IIFE result discarded, map returns undefined
{(() => {
  let previewXp = ...;
  return (<li key={opp.id}>...</li>);
})()}
```

**Status:** FIX APPLIED ✅

---

### Bug 3 — Dynamic XP multiplier indicator hidden in game mode
**File:** `src/screens/AddEvent.jsx` lines 433–437

The `×N.Nx` badge on choice options is guarded by `!gameModeEnabled`, so in game mode + dynamic XP combined, only the ⚡ ("real doubling") badge shows. The user cannot see that the difficulty multiplier is also being applied.

**Status:** FIX APPLIED ✅

---

## Calculation Logic Verification (db.js)

Both `calculateXpChange` (standard) and `calculateGameXpChange` (game) are correct:
- Dynamic multiplier: `Math.max(1.0, challengingLevel / 3)`
- Applied BEFORE game-mode real doubling
- Real doubling only applies to positive XP
- Both functions are consistent with UI preview logic in AddEvent.jsx

No bugs in the core calculation functions.

---

## Fixes Applied

### Fix 1: Success card — show game XP when game mode is on
In the success card, conditionally show `gameXpChange` vs `xpChange`, and opportunities use game_xp path if game mode is enabled.

### Fix 2: Non-game-mode IIFE — return the element from map callback
Replace the bare IIFE with an explicit `return` in the non-game-mode branch.

### Fix 3: Show ×N.Nx badge in game mode too
Remove the `!gameModeEnabled` guard from the multiplier badge (keep it alongside ⚡).
