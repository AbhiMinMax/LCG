// Module-level session state for game-mode animations that span navigation.
// Persists within the browser tab; cleared after consumption.

const state = {
  affectedOppIds: null,      // number[] — opp IDs from the last logged event
  levelChanges: null,        // { oppId: { prevLabel } }[] — level label changes from last event
  antagonistChanges: null,   // AntagonistImpact[] — antagonist state changes from last event
};

// Called in AddEvent after a successful event submission (game mode only).
// antagonistChanges: array of { antagonistId, hpDelta, oldLevel, newLevel, levelChanged, defeated }
export function setPendingEvent(affectedOppIds, levelChanges, antagonistChanges = null) {
  state.affectedOppIds = affectedOppIds;
  state.levelChanges = levelChanges;
  state.antagonistChanges = antagonistChanges;
}

// Called in CheckProgress on mount. Consumes and clears the pending data.
export function consumePendingEvent() {
  const result = {
    affectedOppIds: state.affectedOppIds,
    levelChanges: state.levelChanges,
    antagonistChanges: state.antagonistChanges,
  };
  state.affectedOppIds = null;
  state.levelChanges = null;
  state.antagonistChanges = null;
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
