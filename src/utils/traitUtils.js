import { getPathLevel } from './pathUtils';

export const TRAITS = [
  {
    id: 'steady',
    name: 'Steady',
    statement: "You return to calm when most don't.",
  },
  {
    id: 'forged',
    name: 'Forged',
    statement: "Difficulty is where you do your best work.",
  },
  {
    id: 'the_returner',
    name: 'The Returner',
    statement: "You fall. You come back. Every time.",
  },
  {
    id: 'broadminded',
    name: 'Broadminded',
    statement: "You show up for all of it, not just the easy parts.",
  },
  {
    id: 'grounded',
    name: 'Grounded',
    statement: "You know where you stand.",
  },
  {
    id: 'relentless',
    name: 'Relentless',
    statement: "You don't stop. Not really.",
  },
  {
    id: 'the_adaptor',
    name: 'The Adaptor',
    statement: "Change doesn't destabilize you anymore.",
  },
  {
    id: 'unguarded',
    name: 'Unguarded',
    statement: "You stopped hiding from the hard feelings.",
  },
  {
    id: 'the_long_game',
    name: 'The Long Game',
    statement: "You understand that slow is fast.",
  },
  {
    id: 'clear',
    name: 'Clear',
    statement: "When others spiral, you find the thread.",
  },
];

// Historical max streaks per opportunity (oldest → newest pass)
// Returns { maxAttemptStreak, maxMasteryStreak, recoveryCount }
function computeOppHistory(oppId, sortedOldestFirst) {
  const evs = sortedOldestFirst.filter(
    e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(oppId)
  );

  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;

  let maxAttemptStreak = 0;
  let maxMasteryStreak = 0;
  let recoveryCount = 0;
  let curAttempt = 0;
  let curMastery = 0;
  let inRecovery = false;
  let curRecovery = 0;

  for (const ev of evs) {
    const cv = ev.choice_value;
    if (isSuccess(cv)) {
      curAttempt++;
      if (curAttempt > maxAttemptStreak) maxAttemptStreak = curAttempt;
      if (cv === 4) {
        curMastery++;
        if (curMastery > maxMasteryStreak) maxMasteryStreak = curMastery;
      } else {
        curMastery = 0;
      }
      if (inRecovery) curRecovery++;
    } else if (isFailure(cv)) {
      if (inRecovery && curRecovery > 0) recoveryCount++;
      curAttempt = 0;
      curMastery = 0;
      inRecovery = true;
      curRecovery = 0;
    }
  }
  if (inRecovery && curRecovery > 0) recoveryCount++;

  return { maxAttemptStreak, maxMasteryStreak, recoveryCount };
}

// Returns array of trait IDs that are currently unlocked based on all event/opportunity data.
// oppStreaks: { [oppId]: { attemptStreak, masteryStreak, failureRun, recoveryStreak, recoveryBest } }
export function computeUnlockedTraitIds(opportunities, events, situations, oppStreaks) {
  if (events.length === 0 || opportunities.length === 0) return [];

  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));
  const oldestFirst = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const oppHistory = {};
  for (const opp of opportunities) {
    oppHistory[opp.id] = computeOppHistory(opp.id, oldestFirst);
  }

  const totalEvents = events.length;

  let realEventCount = 0;
  for (const e of events) {
    const sit = sitMap[e.situation_id];
    if (sit && !sit.isMeta) realEventCount++;
  }
  const realRatio = totalEvents > 0 ? realEventCount / totalEvents : 0;

  let highDiffWellDone = 0;
  const wellDoneCount = events.filter(e => {
    if (e.choice_value !== 4) return false;
    const sit = sitMap[e.situation_id];
    if (sit && sit.challenging_level >= 4) highDiffWellDone++;
    return true;
  }).length;

  const realSitIds = new Set();
  for (const e of events) {
    const sit = sitMap[e.situation_id];
    if (sit && !sit.isMeta) realSitIds.add(e.situation_id);
  }

  const breadthSitIds = new Set();
  for (const e of events) {
    if (e.choice_value === 3 || e.choice_value === 4) breadthSitIds.add(e.situation_id);
  }

  const sitEventCounts = {};
  for (const e of events) {
    sitEventCounts[e.situation_id] = (sitEventCounts[e.situation_id] || 0) + 1;
  }
  const maxSitPct = totalEvents > 0
    ? Math.max(0, ...Object.values(sitEventCounts)) / totalEvents
    : 0;

  const firstTs = oldestFirst.length > 0 ? new Date(oldestFirst[0].timestamp).getTime() : Date.now();
  const calendarDays = Math.floor((Date.now() - firstTs) / (1000 * 60 * 60 * 24));

  // Weeks where ≥ 7 distinct situations had tried/well_done
  const weekSitMap = {};
  const weekEventCounts = {};
  for (const e of events) {
    const d = new Date(e.timestamp);
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay());
    ws.setHours(0, 0, 0, 0);
    const wk = ws.toISOString().slice(0, 10);
    weekEventCounts[wk] = (weekEventCounts[wk] || 0) + 1;
    if (e.choice_value === 3 || e.choice_value === 4) {
      if (!weekSitMap[wk]) weekSitMap[wk] = new Set();
      weekSitMap[wk].add(e.situation_id);
    }
  }
  let weeksWithBreadth7 = 0;
  for (const s of Object.values(weekSitMap)) {
    if (s.size >= 7) weeksWithBreadth7++;
  }
  const maxWeeklyEvents = Object.values(weekEventCounts).length > 0
    ? Math.max(...Object.values(weekEventCounts))
    : 0;

  // Max failure run per situation in last 60 days
  const ms60 = 60 * 24 * 60 * 60 * 1000;
  const recent60 = [...events]
    .filter(e => Date.now() - new Date(e.timestamp).getTime() <= ms60)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  let maxRecentFailureRun = 0;
  const recentSitIds = [...new Set(recent60.map(e => e.situation_id))];
  for (const sitId of recentSitIds) {
    const sitEvs = recent60.filter(e => e.situation_id === sitId);
    let run = 0;
    for (const ev of sitEvs) {
      if (ev.choice_value === 1 || ev.choice_value === 2) run++;
      else break;
    }
    if (run > maxRecentFailureRun) maxRecentFailureRun = run;
  }

  // Emotional path opportunity event stats
  const emotionalOpps = opportunities.filter(o => o.path === 'emotional');
  const emotionalOppIds = new Set(emotionalOpps.map(o => o.id));
  let emotionalTotal = 0;
  let emotionalReal = 0;
  for (const e of events) {
    if (!Array.isArray(e.affected_opportunities)) continue;
    if (!e.affected_opportunities.some(id => emotionalOppIds.has(id))) continue;
    emotionalTotal++;
    const sit = sitMap[e.situation_id];
    if (sit && !sit.isMeta) emotionalReal++;
  }
  const emotionalRealRatio = emotionalTotal > 0 ? emotionalReal / emotionalTotal : 0;

  const getLevel = (opp) => getPathLevel(opp.game_xp || 0, opp.path || 'default').level;

  const recoveryBestAny = opportunities.length > 0
    ? Math.max(0, ...opportunities.map(o => oppStreaks[o.id]?.recoveryBest || 0))
    : 0;
  const totalRecoveryCount = opportunities.reduce((sum, o) => sum + (oppHistory[o.id]?.recoveryCount || 0), 0);
  const histAttemptBest = opportunities.length > 0
    ? Math.max(0, ...opportunities.map(o => oppHistory[o.id]?.maxAttemptStreak || 0))
    : 0;

  const unlockedIds = [];

  for (const trait of TRAITS) {
    let unlocked = false;
    switch (trait.id) {
      case 'steady':
        unlocked = totalEvents >= 20 && opportunities.some(o =>
          o.path === 'emotional' &&
          getLevel(o) >= 7 &&
          (oppHistory[o.id]?.maxAttemptStreak || 0) >= 7
        );
        break;
      case 'forged':
        unlocked = highDiffWellDone >= 15 &&
          maxRecentFailureRun <= 4 &&
          opportunities.some(o => getLevel(o) >= 7);
        break;
      case 'the_returner':
        unlocked = recoveryBestAny >= 8 &&
          totalRecoveryCount >= 5 &&
          opportunities.some(o => getLevel(o) >= 4);
        break;
      case 'broadminded':
        unlocked = weeksWithBreadth7 >= 3 &&
          realSitIds.size >= 10 &&
          maxSitPct <= 0.4;
        break;
      case 'grounded':
        unlocked = totalEvents >= 30 &&
          realRatio > 0.6 &&
          opportunities.some(o =>
            (o.path === 'emotional' || o.path === 'behavioral') && getLevel(o) >= 7
          );
        break;
      case 'relentless':
        unlocked = totalEvents >= 50 &&
          histAttemptBest >= 15 &&
          opportunities.some(o => getLevel(o) >= 13);
        break;
      case 'the_adaptor':
        unlocked = realSitIds.size >= 10 &&
          breadthSitIds.size >= 10 &&
          opportunities.some(o =>
            (o.path === 'behavioral' || o.path === 'cognitive') && getLevel(o) >= 7
          );
        break;
      case 'unguarded':
        unlocked = emotionalTotal >= 20 &&
          emotionalRealRatio > 0.7 &&
          emotionalOpps.some(o => getLevel(o) >= 4);
        break;
      case 'the_long_game':
        unlocked = calendarDays >= 90 &&
          maxWeeklyEvents <= 15 &&
          opportunities.some(o => getLevel(o) >= 10);
        break;
      case 'clear':
        unlocked = wellDoneCount >= 10 &&
          opportunities.some(o =>
            o.path === 'cognitive' &&
            getLevel(o) >= 7 &&
            (oppHistory[o.id]?.maxMasteryStreak || 0) >= 5
          );
        break;
    }
    if (unlocked) unlockedIds.push(trait.id);
  }

  return unlockedIds;
}
