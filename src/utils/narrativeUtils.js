import { getPathLevel } from './pathUtils';
import { TRAITS } from './traitUtils';

// ─── Time helpers ──────────────────────────────────────────────────────────────
function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay()); // Sunday
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d) {
  const r = new Date(d);
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}
function isSameWeek(d, ref) {
  return startOfWeek(d).getTime() === startOfWeek(ref).getTime();
}
function isSameMonth(d, ref) {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
function weekKey(d) {
  return startOfWeek(d).toISOString().slice(0, 10);
}
function monthKey(d) {
  const r = new Date(d);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Event period filters ──────────────────────────────────────────────────────
function periodEvents(events, start) {
  const t = start.getTime();
  return events.filter(e => new Date(e.timestamp).getTime() >= t);
}

// ─── Streak helpers ────────────────────────────────────────────────────────────
function oppAttemptStreak(oppId, sortedNewestFirst) {
  let s = 0;
  for (const e of sortedNewestFirst) {
    if (!Array.isArray(e.affected_opportunities) || !e.affected_opportunities.includes(oppId)) continue;
    if (e.choice_value === 3 || e.choice_value === 4) s++;
    else break;
  }
  return s;
}
function oppFailureRun(oppId, sortedNewestFirst) {
  let s = 0;
  for (const e of sortedNewestFirst) {
    if (!Array.isArray(e.affected_opportunities) || !e.affected_opportunities.includes(oppId)) continue;
    if (e.choice_value === 1 || e.choice_value === 2) s++;
    else break;
  }
  return s;
}

// ─── XP change detection within period ───────────────────────────────────────
function oppXpInPeriod(events, oppId) {
  let total = 0;
  for (const e of events) {
    if (Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(oppId)) {
      total += e.game_xp_change || 0;
    }
  }
  return total;
}

// Returns { opp, prevLabel, newLabel } for opportunities whose level label changed in period
function detectLevelChanges(periodEvs, opportunities) {
  const changes = [];
  for (const opp of opportunities) {
    const gained = oppXpInPeriod(periodEvs, opp.id);
    if (gained === 0) continue;
    const prevXp = Math.max(0, (opp.game_xp || 0) - gained);
    const prevLabel = getPathLevel(prevXp, opp.path || 'default').fullLabel;
    const nowLabel  = getPathLevel(opp.game_xp || 0, opp.path || 'default').fullLabel;
    if (prevLabel !== nowLabel) changes.push({ opp, prevLabel, newLabel: nowLabel });
  }
  return changes;
}

// ─── Active boss detection ─────────────────────────────────────────────────────
function activeSituationBosses(events, situations, threshold = 5) {
  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const seen = [...new Set(sorted.map(e => e.situation_id))];
  const bosses = [];
  for (const sitId of seen) {
    const sit = sitMap[sitId];
    if (!sit) continue;
    const sitEvs = sorted.filter(e => e.situation_id === sitId);
    let succStreak = 0;
    for (const e of sitEvs) {
      if (e.choice_value === 3 || e.choice_value === 4) succStreak++;
      else break;
    }
    let failRun = 0;
    for (const e of sitEvs.slice(succStreak)) {
      if (e.choice_value === 1 || e.choice_value === 2) failRun++;
      else break;
    }
    if (failRun >= threshold && succStreak < threshold) bosses.push({ sit, failRun, succStreak });
  }
  return bosses;
}

// ─── Opportunity boss detection ────────────────────────────────────────────────
function activeOppBosses(events, opportunities, window = 20) {
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const bosses = [];
  for (const opp of opportunities) {
    const oppEvs = sorted.filter(e =>
      Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
    );
    if (oppEvs.length < window) continue;
    const netXp = oppEvs.slice(0, window).reduce((s, e) => s + (e.game_xp_change || 0), 0);
    if (netXp >= 0) continue;
    let succStreak = 0;
    for (const e of oppEvs) {
      if (e.choice_value === 3 || e.choice_value === 4) succStreak++;
      else break;
    }
    if (succStreak >= window) continue;
    bosses.push({ opp, netXp, succStreak });
  }
  return bosses;
}

// ─── Weekly XP totals ─────────────────────────────────────────────────────────
function weeklyXpTotals(events) {
  const map = {};
  for (const e of events) {
    const wk = weekKey(new Date(e.timestamp));
    map[wk] = (map[wk] || 0) + (e.game_xp_change || 0);
  }
  return map;
}

// ─── Monthly XP totals ────────────────────────────────────────────────────────
function monthlyXpTotals(events) {
  const map = {};
  for (const e of events) {
    const mk = monthKey(new Date(e.timestamp));
    map[mk] = (map[mk] || 0) + (e.game_xp_change || 0);
  }
  return map;
}

// ─── Monthly event counts ─────────────────────────────────────────────────────
function monthlyEventCounts(events) {
  const map = {};
  for (const e of events) {
    const mk = monthKey(new Date(e.timestamp));
    map[mk] = (map[mk] || 0) + 1;
  }
  return map;
}

// ─── Daily Narrative ──────────────────────────────────────────────────────────
export function generateDailyNarrative(events, situations, opportunities, profile) {
  const now = new Date();
  const todayEvs = periodEvents(events, startOfDay(now));
  if (todayEvs.length < 1) return null;

  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const realToday   = todayEvs.filter(e => { const s = sitMap[e.situation_id]; return s && !s.isMeta; });
  const metaToday   = todayEvs.filter(e => { const s = sitMap[e.situation_id]; return s && s.isMeta; });
  const highDiffToday = todayEvs.filter(e => { const s = sitMap[e.situation_id]; return s && s.challenging_level >= 4; });
  const N = todayEvs.length;

  // ── Opening ──
  let opening = '';
  if (N === 1) {
    const sit = sitMap[todayEvs[0].situation_id];
    const choiceLabel = { 1: 'Misguided Action', 2: 'Didn\'t Try', 3: 'Tried', 4: 'Well Done' }[todayEvs[0].choice_value] || 'something';
    opening = `One moment today. ${sit?.title ?? 'A situation'}. You chose ${choiceLabel}.`;
  } else if (metaToday.length === 0 && realToday.length > 0) {
    opening = `Today you met life directly. ${N} real moment${N !== 1 ? 's' : ''}, logged as they happened.`;
  } else if (realToday.length === 0 && metaToday.length > 0) {
    opening = `Today was for thinking. ${N} reflection${N !== 1 ? 's' : ''} logged.`;
  } else {
    opening = `Today had ${N} moment${N !== 1 ? 's' : ''} — some lived, some reflected on.`;
  }
  if (highDiffToday.length > 0 && N > 1) {
    const sit = sitMap[highDiffToday[0].situation_id];
    opening += ` You faced something hard today. ${sit?.title ?? 'That situation'} doesn't get easier — you just get better at it.`;
  }

  // ── Body ──
  let body = '';

  // Level label changed today?
  const levelChanges = detectLevelChanges(todayEvs, opportunities);
  if (levelChanges.length > 0) {
    const { opp, prevLabel, newLabel } = levelChanges[0];
    body = `Your ${opp.title} moved. ${prevLabel} is behind you. ${newLabel} is where you are now.`;
  }

  // Attempt streak milestone hit today?
  if (!body) {
    const MILESTONES = [3, 7, 15, 30];
    for (const opp of opportunities) {
      const streak = oppAttemptStreak(opp.id, sorted);
      if (MILESTONES.includes(streak)) {
        const lastOppEv = sorted.find(e =>
          Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
        );
        if (lastOppEv && new Date(lastOppEv.timestamp).toDateString() === now.toDateString()) {
          body = `${opp.title} — ${streak} in a row. That's not luck.`;
          break;
        }
      }
    }
  }

  // Recovery after failure run today?
  if (!body) {
    for (const opp of opportunities) {
      const hasSuccessToday = todayEvs.some(e =>
        Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id) &&
        (e.choice_value === 3 || e.choice_value === 4)
      );
      if (!hasSuccessToday) continue;
      const prevEvs = sorted.filter(e =>
        new Date(e.timestamp).toDateString() !== now.toDateString() &&
        Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
      );
      const failsBefore = prevEvs.filter(e => e.choice_value === 1 || e.choice_value === 2).slice(0, 5);
      if (failsBefore.length >= 2) {
        const sit = sitMap[todayEvs.find(e =>
          Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
        )?.situation_id];
        if (sit) {
          body = `After ${failsBefore.length} difficult moments with ${sit.title}, today you chose differently.`;
          break;
        }
      }
    }
  }

  // Trait unlocked today?
  if (!body && profile?.unlockedTraits) {
    const todayTrait = profile.unlockedTraits.find(t =>
      new Date(t.unlockedAt).toDateString() === now.toDateString()
    );
    if (todayTrait) {
      const traitDef = TRAITS.find(t => t.id === todayTrait.traitId);
      if (traitDef) body = `Something crystallized today. You are ${traitDef.name}.`;
    }
  }

  if (!body) {
    body = 'Nothing dramatic. You showed up, logged it, moved on. That consistency is the whole thing.';
  }

  // ── Closing ──
  let closing = '';
  const realRatioToday = N > 0 ? realToday.length / N : 0;
  const loginStreak = profile?.loginStreak || 0;
  const LOGIN_MILESTONES = new Set([7, 30, 100, 365]);
  if (LOGIN_MILESTONES.has(loginStreak)) {
    closing = `${loginStreak} days in a row. The habit is real.`;
  } else if (realRatioToday > 0.7) {
    closing = 'More living than thinking today. Good.';
  } else if (realRatioToday < 0.3 && metaToday.length > 0) {
    closing = 'Heavy on reflection today. The balance will find itself.';
  } else {
    closing = 'One day in the record. It adds up.';
  }

  return [opening, body, closing].filter(Boolean).join(' ');
}

// ─── Weekly Narrative ─────────────────────────────────────────────────────────
export function generateWeeklyNarrative(events, situations, opportunities, profile) {
  const now = new Date();
  const weekEvs = periodEvents(events, startOfWeek(now));
  if (weekEvs.length < 3) return null;

  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const N = weekEvs.length;
  const realWeek = weekEvs.filter(e => { const s = sitMap[e.situation_id]; return s && !s.isMeta; });
  const metaWeek = weekEvs.filter(e => { const s = sitMap[e.situation_id]; return s && s.isMeta; });
  const realRatio = N > 0 ? realWeek.length / N : 0;
  const metaRatio = N > 0 ? metaWeek.length / N : 0;
  const distinctSits = new Set(weekEvs.map(e => e.situation_id)).size;

  // Best XP week ever?
  const weekXp = weeklyXpTotals(events);
  const thisWk = weekKey(now);
  const thisWkXp = weekXp[thisWk] || 0;
  const prevWeekMax = Math.max(0, ...Object.entries(weekXp).filter(([k]) => k !== thisWk).map(([, v]) => v));
  const isBestWeek = thisWkXp > 0 && thisWkXp > prevWeekMax;

  // ── Opening ──
  let opening = '';
  if (N >= 10) {
    opening = `A full week. ${N} moments logged across ${distinctSits} different situation${distinctSits !== 1 ? 's' : ''}.`;
  } else if (isBestWeek) {
    opening = `Your best week yet. ${thisWkXp} XP earned. Something shifted.`;
  } else if (N >= 3 && realRatio > 0.6) {
    opening = `A quiet week in the app. ${realWeek.length} real moment${realWeek.length !== 1 ? 's' : ''} — enough to matter.`;
  } else if (metaRatio > 0.6) {
    opening = `This week lived mostly in reflection. ${metaWeek.length} reflection${metaWeek.length !== 1 ? 's' : ''}, ${realWeek.length} real moment${realWeek.length !== 1 ? 's' : ''}.`;
  } else {
    opening = `${N} moment${N !== 1 ? 's' : ''} this week across ${distinctSits} situation${distinctSits !== 1 ? 's' : ''}.`;
  }

  // ── Body 1 — biggest movement ──
  let body1 = '';
  const weekOppXp = {};
  for (const e of weekEvs) {
    if (!Array.isArray(e.affected_opportunities)) continue;
    for (const id of e.affected_opportunities) {
      weekOppXp[id] = (weekOppXp[id] || 0) + (e.game_xp_change || 0);
    }
  }
  const topOppEntry = Object.entries(weekOppXp).sort((a, b) => b[1] - a[1])[0];
  if (topOppEntry && topOppEntry[1] > 0) {
    const topOpp = opportunities.find(o => o.id === parseInt(topOppEntry[0]));
    const weekEvCount = weekEvs.filter(e =>
      Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(topOpp?.id)
    ).length;
    if (topOpp) body1 = `${topOpp.title} moved the most this week — ${topOppEntry[1]} XP earned across ${weekEvCount} event${weekEvCount !== 1 ? 's' : ''}.`;
  }

  // ── Body 2 — pattern ──
  let body2 = '';
  const MILESTONES = [3, 7, 15, 30];
  // Attempt streak milestone reached this week?
  for (const opp of opportunities) {
    const streak = oppAttemptStreak(opp.id, sorted);
    if (MILESTONES.includes(streak)) {
      const lastOppEv = sorted.find(e =>
        Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
      );
      if (lastOppEv && isSameWeek(new Date(lastOppEv.timestamp), now)) {
        body2 = `Your ${opp.title} attempt streak reached ${streak}. You haven't stopped yet.`;
        break;
      }
    }
  }
  if (!body2 && distinctSits >= 7) {
    body2 = `${distinctSits} different situations handled with at least an attempt this week. Wide range.`;
  }
  if (!body2 && distinctSits <= 2 && distinctSits > 0) {
    const topSitId = Object.entries(
      weekEvs.reduce((m, e) => { m[e.situation_id] = (m[e.situation_id] || 0) + 1; return m; }, {})
    ).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topSit = sitMap[parseInt(topSitId)];
    if (topSit) body2 = `Narrow week — mostly ${topSit.title}. Deep focus, or just what life handed you.`;
  }
  // Level change this week?
  if (!body2) {
    const lc = detectLevelChanges(weekEvs, opportunities);
    if (lc.length > 0) {
      const { opp, newLabel } = lc[0];
      body2 = `${opp.title} crossed a threshold. You are ${newLabel} now.`;
    }
  }
  // Trait unlocked this week?
  if (!body2 && profile?.unlockedTraits) {
    const weekTrait = profile.unlockedTraits.find(t => isSameWeek(new Date(t.unlockedAt), now));
    if (weekTrait) {
      const traitDef = TRAITS.find(t => t.id === weekTrait.traitId);
      if (traitDef) body2 = `You earned ${traitDef.name} this week. It was already true. Now it's named.`;
    }
  }

  // ── Closing ──
  let closing = '';
  if (profile?.unlockedTraits?.some(t => isSameWeek(new Date(t.unlockedAt), now))) {
    const { TRAITS } = require('./traitUtils');
    const t = profile.unlockedTraits.find(u => isSameWeek(new Date(u.unlockedAt), now));
    const td = TRAITS.find(x => x.id === t?.traitId);
    if (td) closing = `You earned ${td.name} this week. It was already true. Now it's named.`;
  }
  if (!closing && realRatio > 0.65) {
    closing = 'More action than reflection this week. The balance was right.';
  }
  if (!closing) {
    closing = 'Seven days. This is what they looked like.';
  }

  return [opening, body1, body2, closing].filter(Boolean).join(' ');
}

// ─── Monthly Narrative ────────────────────────────────────────────────────────
export function generateMonthlyNarrative(events, situations, opportunities, profile) {
  const now = new Date();
  const monthEvs = periodEvents(events, startOfMonth(now));
  if (monthEvs.length < 10) return null;

  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));

  const N = monthEvs.length;
  const realMonth = monthEvs.filter(e => { const s = sitMap[e.situation_id]; return s && !s.isMeta; });
  const realRatio = N > 0 ? realMonth.length / N : 0;

  // XP per opp this month
  const monthOppXp = {};
  for (const e of monthEvs) {
    if (!Array.isArray(e.affected_opportunities)) continue;
    for (const id of e.affected_opportunities) {
      monthOppXp[id] = (monthOppXp[id] || 0) + (e.game_xp_change || 0);
    }
  }

  // Top 3 by XP gain this month
  const top3 = [...opportunities]
    .filter(o => (monthOppXp[o.id] || 0) > 0)
    .sort((a, b) => (monthOppXp[b.id] || 0) - (monthOppXp[a.id] || 0))
    .slice(0, 3);

  // Top 3 for first half and second half of month
  const mid = new Date(now.getFullYear(), now.getMonth(), 15);
  const firstHalfEvs = monthEvs.filter(e => new Date(e.timestamp) < mid);
  const secondHalfEvs = monthEvs.filter(e => new Date(e.timestamp) >= mid);
  function top1(evs) {
    const m = {};
    for (const e of evs) {
      if (!Array.isArray(e.affected_opportunities)) continue;
      for (const id of e.affected_opportunities) {
        m[id] = (m[id] || 0) + (e.game_xp_change || 0);
      }
    }
    const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    return top ? opportunities.find(o => o.id === parseInt(top[0])) : null;
  }
  const firstHalfTop = top1(firstHalfEvs);
  const secondHalfTop = top1(secondHalfEvs);

  // Best XP month ever?
  const mxp = monthlyXpTotals(events);
  const thisMk = monthKey(now);
  const thisMonthXp = mxp[thisMk] || 0;
  const prevMonthMax = Math.max(0, ...Object.entries(mxp).filter(([k]) => k !== thisMk).map(([, v]) => v));
  const isBestMonth = thisMonthXp > 0 && thisMonthXp > prevMonthMax;

  // Most events ever month?
  const mev = monthlyEventCounts(events);
  const thisMonthEvCount = mev[thisMk] || 0;
  const prevEvMax = Math.max(0, ...Object.entries(mev).filter(([k]) => k !== thisMk).map(([, v]) => v));
  const isMostEvents = thisMonthEvCount > 0 && thisMonthEvCount > prevEvMax;

  // ── Opening ──
  let opening = '';
  const sameTop3 = top3.length === 3 && firstHalfTop && secondHalfTop &&
    firstHalfTop.id === secondHalfTop.id &&
    firstHalfEvs.length >= 3 && secondHalfEvs.length >= 3;

  if (sameTop3 && top3.length >= 3) {
    opening = `For a full month, ${top3[0].title}, ${top3[1].title} and ${top3[2].title} defined your engagement. You are consistently building in one direction.`;
  } else if (firstHalfTop && secondHalfTop && firstHalfTop.id !== secondHalfTop.id && firstHalfEvs.length >= 3 && secondHalfEvs.length >= 3) {
    opening = `Something changed mid-month. The first half was shaped by ${firstHalfTop.title}. The second by ${secondHalfTop.title}.`;
  } else if (isBestMonth) {
    opening = `${thisMonthXp} XP earned. ${N} moments logged. Your most engaged month yet.`;
  } else if (isMostEvents) {
    opening = `You showed up ${N} times this month. More than any month before.`;
  } else {
    opening = `${N} moments this month. ${top3.length > 0 ? `${top3[0].title} led the way.` : 'Spread across everything.'}`;
  }

  // ── Body 1 — biggest movement ──
  let body1 = '';
  const { TRAITS } = require('./traitUtils');
  const monthTrait = profile?.unlockedTraits?.find(t => isSameMonth(new Date(t.unlockedAt), now));

  if (top3.length > 0 && (monthOppXp[top3[0].id] || 0) > 0) {
    const lvLabel = getPathLevel(top3[0].game_xp || 0, top3[0].path || 'default').fullLabel;
    body1 = `${top3[0].title} grew more than anything else — ${monthOppXp[top3[0].id]} XP this month. ${lvLabel}. It shows.`;
  }
  if (!body1 && monthTrait) {
    const td = TRAITS.find(x => x.id === monthTrait.traitId);
    if (td) body1 = `${td.name} emerged this month. The conditions were met — not quickly, but honestly.`;
  }

  // ── Body 2 — honest observation ──
  const sitBosses = activeSituationBosses(events, situations);
  const oppBossesActive = activeOppBosses(events, opportunities);
  let body2 = '';

  if (sitBosses.length > 0) {
    body2 = `${sitBosses[0].sit.title} is still unresolved. ${sitBosses[0].sit.title} appeared ${monthEvs.filter(e => e.situation_id === sitBosses[0].sit.id).length} times this month.`;
  } else if (oppBossesActive.length > 0) {
    const ob = oppBossesActive[0];
    const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const run = oppFailureRun(ob.opp.id, sorted);
    body2 = `${ob.opp.title} is under pressure. The trend over ${run} events hasn't turned yet.`;
  } else {
    body2 = 'Nothing is winning against you right now. That\'s not nothing.';
  }

  if (realRatio < 0.4 && N > 0) {
    body2 += ' More thinking than acting this month. The reflection is real — so is the imbalance.';
  }

  // ── Body 3 — growth edge ──
  let body3 = '';
  const loginStreak = profile?.loginStreak || 0;
  const LOGIN_MILESTONES = new Set([7, 30, 100, 365]);

  // Opportunity within 10% of next level label
  for (const opp of opportunities) {
    const lvInfo = getPathLevel(opp.game_xp || 0, opp.path || 'default');
    if (lvInfo.xpToNext && lvInfo.xpForLevel > 0 && lvInfo.xpToNext <= 0.1 * lvInfo.xpForLevel) {
      body3 = `${opp.title} is close to ${lvInfo.nextLabel}. ${lvInfo.xpToNext} more XP and it moves.`;
      break;
    }
  }
  // Opportunity with zero events all month
  if (!body3) {
    for (const opp of opportunities) {
      const hasMonthEvents = monthEvs.some(e =>
        Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
      );
      const totalOppEvents = events.filter(e =>
        Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
      ).length;
      if (!hasMonthEvents && totalOppEvents > 0) {
        body3 = `${opp.title} was quiet this month. Not lost — just waiting.`;
        break;
      }
    }
  }
  // Login milestone passed this month
  if (!body3 && LOGIN_MILESTONES.has(loginStreak)) {
    body3 = `${loginStreak} consecutive days. The practice is becoming structural.`;
  }

  // ── Closing ──
  let closing = '';
  const sorted2 = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const hasAttemptStreak = opportunities.some(o => oppAttemptStreak(o.id, sorted2) > 0);
  const hasRecovery = sitBosses.length > 0 || oppBossesActive.length > 0;

  if (realRatio > 0.65 && !hasRecovery && hasAttemptStreak) {
    closing = 'This month you were someone who faced things and kept going.';
  } else if (hasRecovery && hasAttemptStreak && realRatio > 0.5) {
    closing = 'This month you were someone in a real fight, who kept showing up anyway.';
  } else if (monthTrait) {
    const td = TRAITS.find(x => x.id === monthTrait.traitId);
    if (td) closing = 'This month was more reflection than action — but something crystallized that couldn\'t have come any other way.';
  } else {
    closing = 'This is one month of your record. It is exactly what it is.';
  }

  return [opening, body1, body2, body3, closing].filter(Boolean).join(' ');
}
