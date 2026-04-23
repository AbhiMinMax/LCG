// Module-level session state for game-mode animations that span navigation.
// Persists within the browser tab; cleared after consumption.

const state = {
  affectedOppIds: null,   // number[] — opp IDs from the last logged event
  levelChanges: null,     // { oppId: { prevLabel } }[] — level label changes from last event
};

// Called in AddEvent after a successful event submission (game mode only).
export function setPendingEvent(affectedOppIds, levelChanges) {
  state.affectedOppIds = affectedOppIds;
  state.levelChanges = levelChanges;
}

// Called in CheckProgress on mount. Consumes and clears the pending data.
export function consumePendingEvent() {
  const result = { affectedOppIds: state.affectedOppIds, levelChanges: state.levelChanges };
  state.affectedOppIds = null;
  state.levelChanges = null;
  return result;
}

// Stores the boss snapshot from the last Progress page render.
// Used to detect boss dissolution across navigations.
let prevBossSnapshot = null;

export function storeBossSnapshot(bosses) {
  prevBossSnapshot = Object.fromEntries(bosses.map(b => [`${b.type}-${b.id}`, b]));
}

export function getPrevBossSnapshot() {
  return prevBossSnapshot;
}
