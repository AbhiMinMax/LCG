# Declared Antagonist System — To-Do

## Implementation Order

| # | File | Change | Status |
|---|------|--------|--------|
| 1 | `db.js` | Schema v8 migration + constants + all antagonist helpers + modify `addEvent` | [x] |
| 2 | `animationState.js` | Extend pending event to carry antagonist changes | [x] |
| 3 | `Customize.jsx` | Antagonists tab, create/edit/delete/archive | [x] |
| 4 | `CheckProgress.jsx` | Declared Antagonists section + AntagonistCard + animations | [x] |
| 5 | `AddEvent.jsx` | Antagonist damage preview | [x] |
| 6 | `CheckHistory.jsx` | ⚔ icon + popover on event cards (needs `antagonistImpacts` field from step 1) | [x] |
| 7 | `Analytics.jsx` | Per-situation antagonist info block | [x] |
| 8 | Global | ⚔ badge on situation titles where needed | [x] |

---

## Phase 1 — Database (`src/database/db.js`)

### Schema migration (v8)
- [ ] Add `antagonists` table: `++id, name, description, startingLevel, currentLevel, currentHP, taggedSituationIds, status, totalDamageDealt, createdAt, defeatedAt`

### Constants
- [ ] `HP_POOLS = { 10:200, 9:250, 8:300, 7:350, 6:400, 5:450, 4:500, 3:550, 2:600, 1:650 }`
- [ ] `LEVEL_LABELS = { 10:'Dominant', 9:'Consuming', 8:'Pervasive', 7:'Persistent', 6:'Present', 5:'Recurring', 4:'Occasional', 3:'Weakening', 2:'Residual', 1:'Shadow' }`

### New dbHelpers
- [ ] `getAntagonists()` — all non-defeated antagonists
- [ ] `createAntagonist(name, description, startingLevel, taggedSituationIds)`
- [ ] `updateAntagonist(id, changes)`
- [ ] `deleteAntagonist(id)` — hard delete
- [ ] `applyAntagonistDamage(antagonistId, gameXpChange)` — HP math, level transitions, defeat detection; returns `{ levelChanged, defeated, newLevel, newHP }`

### Modify `addEvent()`
- [ ] After XP computation, look up antagonists where `taggedSituationIds` includes the logged `situation_id`
- [ ] Call `applyAntagonistDamage()` for each, collect results
- [ ] Persist `antagonistImpacts` array on event record (id, hpChange, levelAtTime)
- [ ] Return antagonist state changes in return value

---

## Phase 2 — Animation State (`src/utils/animationState.js`)

- [ ] Extend `setPendingEvent()` to accept and store antagonist state changes
- [ ] Add `getAntagonistPendingChanges()` / `consumeAntagonistPendingChanges()`

---

## Phase 3 — Customize Page (`src/screens/Customize.jsx`)

- [ ] Add Antagonists tab (game mode only)
- [ ] Active antagonists list: name, level label + number, HP bar, edit/delete buttons
- [ ] Defeated archive subsection (read-only)
- [ ] Create/Edit form: Name, Description, Starting level picker (1–10 with label), tagged situations multi-select
- [ ] Delete flow: second confirmation step

---

## Phase 4 — Progress Page (`src/screens/CheckProgress.jsx`)

- [ ] Load antagonists after `gameModeEnabled` check
- [ ] Insert "Declared Antagonists" section between Opportunities and The Frontier
- [ ] `AntagonistCard` component — collapsed/expanded toggle
  - Collapsed: ⚔ name, level label + Lv.N, HP bar (deep red #8b2020), total damage, days fighting, last hit days ago
  - Expanded: + description, tagged situations, started date, starting level, levels cleared
- [ ] Consume pending antagonist changes for animations (HP transition, level crossfade, defeat fade-out)

---

## Phase 5 — Add Event Page (`src/screens/AddEvent.jsx`)

- [ ] After situation selected, check tagged antagonists
- [ ] Show damage/recovery preview per antagonist below streak state
- [ ] Update dynamically as choice changes

---

## Phase 6 — History Page (`src/screens/CheckHistory.jsx`)

- [ ] Show ⚔ icon on event card if `antagonistImpacts` is non-empty
- [ ] Tap icon → popover: antagonist name(s), HP change, level at time

---

## Phase 7 — Analytics Page (`src/screens/Analytics.jsx`)

- [ ] Per-situation view: if tagged to active antagonist(s), show name, current level, total damage through this situation

---

## Phase 8 — Global ⚔ Badge

- [ ] Helper `isTaggedToAntagonist(situationId, antagonists)`
- [ ] Show ⚔ badge on situation titles in Customize list, Add Event selector, History

---

## Key Decisions

- **IndexedDB not localStorage** — use Dexie like situations/opportunities
- **`antagonistImpacts` field on events** — stored at log time for History page replay
- **Damage values reuse `calculateGameXpChange()`** — no new math
- **Game mode gate** — all antagonist UI hidden when `gameModeEnabled = false`
