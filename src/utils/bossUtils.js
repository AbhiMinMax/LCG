// Shared boss and streak computation logic used by CheckProgress and Customize.

// Returns { attemptStreak, masteryStreak, failureRun, recoveryStreak, recoveryBest }
export function computeOppStreaks(oppId, sortedEvents /* newest first */) {
  const evs = sortedEvents.filter(
    e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(oppId)
  );

  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;

  let attemptStreak = 0;
  for (const ev of evs) {
    if (isSuccess(ev.choice_value)) attemptStreak++;
    else break;
  }

  let masteryStreak = 0;
  for (const ev of evs) {
    if (ev.choice_value === 4) masteryStreak++;
    else break;
  }

  let failureRun = 0;
  for (const ev of evs) {
    if (isFailure(ev.choice_value)) failureRun++;
    else break;
  }

  let recoveryStreak = 0;
  let recoveryBest = 0;
  const firstFailIdx = evs.findIndex(e => isFailure(e.choice_value));
  if (firstFailIdx > 0) recoveryStreak = firstFailIdx;

  let currentRun = 0;
  let inRecovery = false;
  for (let i = evs.length - 1; i >= 0; i--) {
    const cv = evs[i].choice_value;
    if (isFailure(cv)) {
      if (inRecovery && currentRun > recoveryBest) recoveryBest = currentRun;
      currentRun = 0;
      inRecovery = true;
    } else if (inRecovery) {
      currentRun++;
    }
  }
  if (inRecovery && currentRun > recoveryBest) recoveryBest = currentRun;

  return { attemptStreak, masteryStreak, failureRun, recoveryStreak, recoveryBest };
}

// Returns array of boss objects.
// sorted   = all events newest → oldest
// sitMap   = { id → situation }
export function computeBosses(opportunities, sorted, sitMap, failThreshold = 5, dissThreshold = 5, oppWindow = 20) {
  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;
  const bosses = [];

  // Situation bosses
  const seenSitIds = [...new Set(sorted.map(e => e.situation_id))];
  for (const sitId of seenSitIds) {
    const sit = sitMap[sitId];
    if (!sit) continue;

    const sitEvs = sorted.filter(e => e.situation_id === sitId);
    if (sitEvs.length === 0) continue;

    let successStreak = 0;
    for (const ev of sitEvs) {
      if (isSuccess(ev.choice_value)) successStreak++;
      else break;
    }

    let failureRun = 0;
    for (const ev of sitEvs.slice(successStreak)) {
      if (isFailure(ev.choice_value)) failureRun++;
      else break;
    }

    if (failureRun < failThreshold) continue;
    if (successStreak >= dissThreshold) continue;

    const state = successStreak >= 1 ? 'weakening' : 'active';

    const lastSuccessEv = sitEvs.find(e => isSuccess(e.choice_value));
    const lastSuccessDaysAgo = lastSuccessEv
      ? Math.floor((Date.now() - new Date(lastSuccessEv.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const diff = sit.challenging_level || 3;
    const timePressure = lastSuccessDaysAgo !== null ? Math.min(lastSuccessDaysAgo * 0.5, 15) : 15;
    const grip = failureRun * 1.5 + timePressure + (diff - 1) * 0.5;
    const resistance = successStreak * 3;

    bosses.push({
      type: 'situation',
      id: sitId,
      title: sit.title,
      state,
      grip: Math.max(0.1, grip),
      resistance: Math.max(0, resistance),
      failureRun,
      successStreak,
      lastSuccessDaysAgo,
    });
  }

  // Opportunity bosses
  for (const opp of opportunities) {
    const oppEvs = sorted.filter(
      e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
    );

    if (oppEvs.length < oppWindow) continue;

    const last20 = oppEvs.slice(0, oppWindow);
    const netXp = last20.reduce((s, e) => s + (e.game_xp_change || 0), 0);
    if (netXp >= 0) continue;

    let successStreak = 0;
    for (const ev of oppEvs) {
      if (isSuccess(ev.choice_value)) successStreak++;
      else break;
    }
    if (successStreak >= dissThreshold * 2) continue;

    const state = successStreak >= dissThreshold ? 'weakening' : 'active';

    const negXp = last20.reduce((s, e) => {
      const gxp = e.game_xp_change || 0;
      return gxp < 0 ? s + Math.abs(gxp) : s;
    }, 0);
    const posXp = last20.reduce((s, e) => {
      const gxp = e.game_xp_change || 0;
      return gxp > 0 ? s + gxp : s;
    }, 0);

    bosses.push({
      type: 'opportunity',
      id: opp.id,
      title: opp.title,
      state,
      grip: Math.max(0.1, negXp),
      resistance: Math.max(0, posXp),
      netXp,
      successStreak,
      lastSuccessDaysAgo: null,
    });
  }

  return bosses;
}
