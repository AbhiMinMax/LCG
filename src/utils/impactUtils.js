// Impact dimmers: how strongly a situation affects a linked antagonist or
// opportunity. 1 = direct; lower = weaker/indirect. Missing or invalid = 1.

export const IMPACT_FACTORS = [1, 0.75, 0.5, 0.25];

export function normalizeImpact(f) {
  return IMPACT_FACTORS.includes(f) ? f : 1;
}

// Same 2-decimal rounding the XP code already uses.
export function round2(x) {
  return Math.round(x * 100) / 100;
}

// Factor applied to an opportunity by a logged event. Taken from the event's
// own snapshot (opportunityImpacts), so changing a link later never rewrites
// history. Events logged before the dimmer existed have no snapshot → 1.
export function eventOppFactor(event, oppId) {
  return normalizeImpact(event?.opportunityImpacts?.[oppId]);
}

// Scale an event-level XP amount for one opportunity.
export function scaleForOpp(event, oppId, amount) {
  const f = eventOppFactor(event, oppId);
  return f === 1 ? (amount || 0) : round2((amount || 0) * f);
}

// Per-opportunity game XP from an event (event.game_xp_change is undimmed).
export function oppGameXp(event, oppId) {
  return scaleForOpp(event, oppId, event?.game_xp_change || 0);
}
