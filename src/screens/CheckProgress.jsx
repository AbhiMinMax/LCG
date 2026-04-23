import { useState, useEffect, useRef } from 'react';
import { dbHelpers, db } from '../database/db';
import { PATHS, getPathLevel, getRebirthInfo, getRebirthSymbols } from '../utils/pathUtils';
import { TRAITS, computeUnlockedTraitIds } from '../utils/traitUtils';
import { consumePendingEvent, storeBossSnapshot, getPrevBossSnapshot } from '../utils/animationState';
import './ProgressStyles.css';

// ─── Inline sparkline ────────────────────────────────────────────────────────
function Sparkline({ values, width = 60, height = 18, color = '#4a7fa5' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0, opacity: 0.7 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Standard mode sort options ───────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'alphabetical', label: 'A-Z' },
  { value: 'xp_percentage', label: 'XP %' },
  { value: 'level', label: 'Level' }
];

// ─── Game-mode colour tokens ──────────────────────────────────────────────────
// Structural colours defer to the active theme via CSS variables.
// Semantic game colours (gold for milestones, accent for XP bars) stay fixed
// because they carry meaning regardless of light/dark mode.
const GM = {
  bg:      'var(--bg-primary)',
  bgCard:  'var(--bg-secondary)',
  bgDeep:  'var(--bg-tertiary)',
  text:    'var(--text-primary)',
  textDim: 'var(--text-secondary)',
  accent:  '#4a7fa5',           // game XP bar / attempt streak — intentional blue
  gold:    '#c8a84b',           // rebirth stars / milestones / grip — intentional amber
  border:  'var(--border-color)',
  bar:     'rgba(128,128,128,0.18)', // XP bar empty track — neutral in both themes
};

// ─── Per-opportunity streak computation ──────────────────────────────────────
// Returns { attemptStreak, masteryStreak, failureRun, recoveryStreak, recoveryBest }
function computeOppStreaks(oppId, sortedEvents /* newest first */) {
  const evs = sortedEvents.filter(
    e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(oppId)
  );

  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;

  // Attempt streak: consecutive success newest → oldest
  let attemptStreak = 0;
  for (const ev of evs) {
    if (isSuccess(ev.choice_value)) attemptStreak++;
    else break;
  }

  // Mastery streak: consecutive well_done (4) newest → oldest
  let masteryStreak = 0;
  for (const ev of evs) {
    if (ev.choice_value === 4) masteryStreak++;
    else break;
  }

  // Failure run: consecutive failure newest → oldest
  let failureRun = 0;
  for (const ev of evs) {
    if (isFailure(ev.choice_value)) failureRun++;
    else break;
  }

  // Recovery streak: after most recent failure, count consecutive successes
  // Also compute personal best recovery streak across all history
  let recoveryStreak = 0;
  let recoveryBest = 0;

  // Find index of most recent failure
  const firstFailIdx = evs.findIndex(e => isFailure(e.choice_value));
  if (firstFailIdx > 0) {
    // There are successes before the failure (newest first) → those are the current recovery
    recoveryStreak = firstFailIdx; // count of successes before first failure
  }

  // Compute all recovery runs for personal best
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

// ─── Boss computation ─────────────────────────────────────────────────────────
// sorted        = all events newest → oldest (pre-sorted by caller)
// sitMap        = { id → situation }
// failThreshold = consecutive failures to spawn a situation boss (default 5)
// dissThreshold = consecutive successes to dissolve a boss (default 5)
// oppWindow     = events to look back for opportunity boss XP trend (default 20)
function computeBosses(opportunities, sorted, sitMap, failThreshold = 5, dissThreshold = 5, oppWindow = 20) {
  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;
  const bosses = [];

  // ── Situation bosses ──────────────────────────────────────────────────────
  const seenSitIds = [...new Set(sorted.map(e => e.situation_id))];

  for (const sitId of seenSitIds) {
    const sit = sitMap[sitId];
    if (!sit) continue;

    const sitEvs = sorted.filter(e => e.situation_id === sitId);
    if (sitEvs.length === 0) continue;

    // Count consecutive successes at the head of history (newest → oldest)
    let successStreak = 0;
    for (const ev of sitEvs) {
      if (isSuccess(ev.choice_value)) successStreak++;
      else break;
    }

    // Count the failure run that immediately precedes the success streak
    let failureRun = 0;
    for (const ev of sitEvs.slice(successStreak)) {
      if (isFailure(ev.choice_value)) failureRun++;
      else break;
    }

    if (failureRun < failThreshold) continue;          // Boss not triggered
    if (successStreak >= dissThreshold) continue;      // Boss dissolved — don't show

    const state = successStreak >= 1 ? 'weakening' : 'active';

    // Last success timestamp (for display and grip calculation)
    const lastSuccessEv = sitEvs.find(e => isSuccess(e.choice_value));
    const lastSuccessDaysAgo = lastSuccessEv
      ? Math.floor((Date.now() - new Date(lastSuccessEv.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Grip: failure run magnitude + time pressure + difficulty
    const diff = sit.challenging_level || 3;
    const timePressure = lastSuccessDaysAgo !== null ? Math.min(lastSuccessDaysAgo * 0.5, 15) : 15;
    const grip = failureRun * 1.5 + timePressure + (diff - 1) * 0.5;

    // Resistance: recovery successes
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

  // ── Opportunity bosses ────────────────────────────────────────────────────
  for (const opp of opportunities) {
    const oppEvs = sorted.filter(
      e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
    );

    if (oppEvs.length < oppWindow) continue; // Need ≥ oppWindow events

    const last20 = oppEvs.slice(0, oppWindow);
    const netXp = last20.reduce((s, e) => s + (e.game_xp_change || 0), 0);

    if (netXp >= 0) continue; // Net positive — no boss

    // Attempt streak for dissolution check (same 5+5 rule)
    let successStreak = 0;
    for (const ev of oppEvs) {
      if (isSuccess(ev.choice_value)) successStreak++;
      else break;
    }
    if (successStreak >= dissThreshold * 2) continue; // Dissolved (weakening + dissolution)

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

// ─── Random challenge computation ─────────────────────────────────────────────
// Priority: Reversal > Edge > Resurgence. Returns one challenge or null.
// sortedNewestFirst = all events newest → oldest (already sorted by caller)
function computeRandomChallenge(opportunities, sortedNewestFirst, situations, oppStreaks) {
  const now = Date.now();
  const ms21 = 21 * 24 * 60 * 60 * 1000;

  // 1. Reversal: failure run exactly 5 on any situation
  const seenSitIds = [...new Set(sortedNewestFirst.map(e => e.situation_id))];
  for (const sitId of seenSitIds) {
    const sitEvs = sortedNewestFirst.filter(e => e.situation_id === sitId);
    let run = 0;
    for (const ev of sitEvs) {
      if (ev.choice_value === 1 || ev.choice_value === 2) run++;
      else break;
    }
    if (run === 5) return { type: 'reversal', text: 'This one keeps winning.' };
  }
  // Reversal: failure run exactly 5 on any opportunity
  for (const opp of opportunities) {
    if ((oppStreaks[opp.id]?.failureRun || 0) === 5) {
      return { type: 'reversal', text: 'This one keeps winning.' };
    }
  }

  // 2. Edge: opportunity within 10% of next level label
  let edgeOppId = null;
  let minPct = 1;
  for (const opp of opportunities) {
    const lvInfo = getPathLevel(opp.game_xp || 0, opp.path || 'default');
    if (lvInfo.xpToNext && lvInfo.xpForLevel > 0) {
      const pct = lvInfo.xpToNext / lvInfo.xpForLevel;
      if (pct <= 0.1 && pct < minPct) { minPct = pct; edgeOppId = opp.id; }
    }
  }
  if (edgeOppId) return { type: 'edge', oppId: edgeOppId };

  // 3. Resurgence: situation not logged in ≥ 21 days
  const lastSitTs = {};
  for (const ev of sortedNewestFirst) {
    if (!lastSitTs[ev.situation_id]) lastSitTs[ev.situation_id] = new Date(ev.timestamp).getTime();
  }
  for (const sit of situations) {
    const last = lastSitTs[sit.id];
    if (last && now - last >= ms21) {
      return { type: 'resurgence', text: `${sit.title} hasn't come up in a while. It's probably still out there.` };
    }
  }

  return null;
}

// ─── Compute all game-mode stats from raw DB rows ─────────────────────────────
function computeGameStats(opportunities, events, situations, cfg = {}) {
  const {
    bossThreshold   = 5,
    bossDiss        = 5,
    breadthTarget   = 7,
    masteryMin      = 3,
    oppBossWindow   = 20,
  } = cfg;
  const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));
  const now = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms7  =  7 * 24 * 60 * 60 * 1000;

  let depthXP = 0;
  const oppGain30 = {};
  const breadthSet = new Set();

  for (const ev of events) {
    const sit = sitMap[ev.situation_id];
    const diff = sit ? (sit.challenging_level || 3) : 3;
    const w = 1 + (diff - 1) * 0.15;
    const gxp = ev.game_xp_change || 0;

    if (gxp > 0) depthXP += Math.round(gxp * w);

    const age = now - new Date(ev.timestamp).getTime();

    if (age <= ms30 && gxp > 0 && Array.isArray(ev.affected_opportunities)) {
      for (const id of ev.affected_opportunities) {
        oppGain30[id] = (oppGain30[id] || 0) + gxp;
      }
    }

    if (age <= ms7 && (ev.choice_value === 3 || ev.choice_value === 4)) {
      breadthSet.add(ev.situation_id);
    }
  }

  // Archetype: top 3 opportunities by 30-day game XP gain
  const top3 = [...opportunities]
    .sort((a, b) => (oppGain30[b.id] || 0) - (oppGain30[a.id] || 0))
    .slice(0, 3)
    .filter(o => (oppGain30[o.id] || 0) > 0);
  const archetype = top3[0]?.title ?? (opportunities[0]?.title ?? '—');

  // Real streak: consecutive real events newest → oldest
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  let realStreak = 0;
  for (const ev of sorted) {
    const sit = sitMap[ev.situation_id];
    if (sit && !sit.isMeta) realStreak++;
    else break;
  }

  // Per-opportunity streaks
  const oppStreaks = {};
  for (const opp of opportunities) {
    oppStreaks[opp.id] = computeOppStreaks(opp.id, sorted);
  }

  // Sort opportunities: most recently active first
  const lastActive = {};
  for (const ev of events) {
    const t = new Date(ev.timestamp).getTime();
    if (Array.isArray(ev.affected_opportunities)) {
      for (const id of ev.affected_opportunities) {
        if (!lastActive[id] || t > lastActive[id]) lastActive[id] = t;
      }
    }
  }
  const sortedOpps = [...opportunities].sort((a, b) =>
    (lastActive[b.id] || new Date(b.created_at).getTime()) -
    (lastActive[a.id] || new Date(a.created_at).getTime())
  );

  // Per-opportunity sparkline: game XP gain bucketed into 8 weekly slots (oldest → newest)
  const oppSparklines = {};
  const weekMs8 = 7 * 24 * 60 * 60 * 1000;
  for (const opp of opportunities) {
    const vals = Array(8).fill(0);
    for (const ev of events) {
      if (!Array.isArray(ev.affected_opportunities) || !ev.affected_opportunities.includes(opp.id)) continue;
      const wIdx = Math.floor((now - new Date(ev.timestamp).getTime()) / weekMs8);
      if (wIdx >= 0 && wIdx < 8) vals[7 - wIdx] += ev.game_xp_change || 0;
    }
    oppSparklines[opp.id] = vals;
  }

  // Meta-skill badges: opportunities that have completed at least one full cycle (rebirth ≥ 1)
  const badges = opportunities
    .filter(o => getRebirthInfo(o.game_xp || 0).rebirths >= 1)
    .map(o => ({
      opp: o,
      pathInfo: PATHS[o.path || 'default'],
      levelInfo: getPathLevel(o.game_xp || 0, o.path || 'default'),
      rebirths: getRebirthInfo(o.game_xp || 0).rebirths,
    }));

  const bosses = computeBosses(opportunities, sorted, sitMap, bossThreshold, bossDiss, oppBossWindow);
  const randomChallenge = computeRandomChallenge(opportunities, sorted, situations, oppStreaks);

  return { depthXP, archetype, top3, breadth: breadthSet.size, breadthTarget, realStreak, badges, sortedOpps, oppStreaks, oppSparklines, bosses, masteryMin, randomChallenge };
}

// ─── Tension meter ───────────────────────────────────────────────────────────
// Amber grip from left, slate-blue resistance from right; ratio reflects dominance.
const RES_COLOR = '#4a6fa5';

function TensionMeter({ grip, resistance }) {
  const total = Math.max(grip + resistance, 0.01);
  const gripPct = Math.round((grip / total) * 100);
  const resPct = 100 - gripPct;

  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: 4 }}>
        <span style={{ color: GM.gold }}>Grip</span>
        <span style={{ color: RES_COLOR }}>Resistance</span>
      </div>
      {/* Single bar: grip fills from left (amber), resistance from right (slate-blue) */}
      <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', background: GM.bar }}>
        <div style={{ width: `${gripPct}%`, background: GM.gold, transition: 'width 0.4s ease' }} />
        <div style={{ width: `${resPct}%`, background: RES_COLOR, transition: 'width 0.4s ease', marginLeft: 'auto' }} />
      </div>
    </div>
  );
}

// ─── Boss card ────────────────────────────────────────────────────────────────
function BossCard({ boss, dissolving }) {
  const isWeakening = boss.state === 'weakening';

  const subtitle = boss.type === 'situation'
    ? `${boss.title} is winning.`
    : `Your ${boss.title} is under pressure.`;

  return (
    <div
      className={dissolving ? 'boss-dissolving' : ''}
      style={{
        background: GM.bgDeep,
        border: `1px solid rgba(200,168,75,${isWeakening ? '0.15' : '0.3'})`,
        borderLeft: `3px solid ${isWeakening ? 'rgba(200,168,75,0.3)' : GM.gold}`,
        borderRadius: 8,
        padding: '13px 15px',
        marginBottom: 10,
        opacity: isWeakening ? 0.75 : 1,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isWeakening ? GM.textDim : GM.text }}>
          {subtitle}
        </div>
        <div style={{ fontSize: '0.7rem', color: GM.textDim, marginTop: 2 }}>
          {boss.type === 'situation' ? 'Situation' : 'Opportunity'} boss
          {isWeakening && (
            <span style={{ marginLeft: 8, color: RES_COLOR }}>weakening</span>
          )}
        </div>
      </div>

      {/* Tension meter */}
      <TensionMeter grip={boss.grip} resistance={boss.resistance} />

      {/* Stats row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: GM.textDim, marginTop: 4 }}>
        <span>
          {boss.type === 'situation'
            ? `Failure run: ${boss.failureRun}`
            : `Net XP (last 20): ${boss.netXp}`}
        </span>
        {boss.type === 'situation' && boss.lastSuccessDaysAgo !== null && (
          <span>
            Last well done: {boss.lastSuccessDaysAgo === 0 ? 'today' : `${boss.lastSuccessDaysAgo}d ago`}
          </span>
        )}
        {boss.type === 'situation' && boss.lastSuccessDaysAgo === null && (
          <span>No successes yet</span>
        )}
      </div>

      {/* Attempt streak (for context) */}
      {boss.successStreak > 0 && (
        <div style={{ fontSize: '0.7rem', color: RES_COLOR, marginTop: 5 }}>
          ↑ {boss.successStreak} consecutive success{boss.successStreak !== 1 ? 'es' : ''} — keep going
        </div>
      )}
    </div>
  );
}

// ─── Character header ─────────────────────────────────────────────────────────
function CharacterHeader({ archetype, depthXP, badges, breadth, breadthTarget, realStreak, loginStreak, top3, storedTraits, newlyUnlockedTraitIds, expanded, onToggle }) {
  // storedTraits: [{traitId, unlockedAt}] sorted newest first — show max 4 chips
  const traitMap = Object.fromEntries(TRAITS.map(t => [t.id, t]));
  const newSet = new Set(newlyUnlockedTraitIds || []);
  const sortedTraits = [...storedTraits].sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt));
  const visibleChips = sortedTraits.slice(0, 4);

  return (
    <div
      onClick={onToggle}
      style={{
        background: GM.bgCard,
        border: `1px solid ${GM.border}`,
        borderRadius: 8,
        padding: '16px 18px',
        marginBottom: 10,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: GM.text, letterSpacing: '0.02em' }}>
            {archetype}
          </div>
          <div style={{ fontSize: '0.78rem', color: GM.textDim, marginTop: 3 }}>
            Depth {depthXP.toLocaleString()} XP
          </div>
        </div>
        <span style={{ color: GM.textDim, fontSize: '0.75rem', marginTop: 2 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Meta-skill badges */}
      {badges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {badges.map(({ opp, pathInfo, levelInfo, rebirths }) => (
            <span
              key={opp.id}
              style={{
                whiteSpace: 'nowrap',
                background: 'rgba(200,168,75,0.12)',
                color: GM.gold,
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: '0.73rem',
                fontWeight: 500,
                border: '1px solid rgba(200,168,75,0.2)',
              }}
            >
              {pathInfo.icon} {opp.title} {getRebirthSymbols(rebirths, opp.path)}
            </span>
          ))}
        </div>
      )}

      {/* Trait chips (max 4, most recently earned) */}
      {visibleChips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {visibleChips.map(({ traitId }) => {
            const t = traitMap[traitId];
            return t ? (
              <span
                key={traitId}
                className={newSet.has(traitId) ? 'trait-chip-new' : ''}
                style={{
                  fontSize: '0.72rem',
                  color: GM.textDim,
                  background: 'rgba(128,128,128,0.12)',
                  border: `1px solid ${GM.border}`,
                  borderRadius: 10,
                  padding: '2px 9px',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.name}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: '0.8rem', color: GM.textDim, flexWrap: 'wrap' }}>
        <span>
          Breadth: <strong style={{ color: breadth >= breadthTarget ? GM.gold : GM.text }}>{breadth}</strong>
          <span style={{ fontSize: '0.7rem', marginLeft: 3 }}>/ {breadthTarget} this week</span>
        </span>
        {realStreak > 0 && (
          <span>
            Real: <strong style={{ color: GM.text }}>{realStreak}</strong>
          </span>
        )}
        {loginStreak > 0 && (
          <span>
            Login: <strong style={{ color: loginStreak >= 7 ? GM.gold : GM.text }}>{loginStreak}</strong>
            <span style={{ fontSize: '0.7rem', marginLeft: 3 }}>day{loginStreak !== 1 ? 's' : ''}</span>
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${GM.border}`, paddingTop: 14 }}>
          {/* Archetype */}
          <div style={{ fontSize: '0.75rem', color: GM.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Archetype shaped by
          </div>
          {top3.length > 0 ? top3.map((o, i) => (
            <div key={o.id} style={{ fontSize: '0.85rem', color: GM.text, marginBottom: 4 }}>
              {i + 1}. {o.title}
            </div>
          )) : (
            <div style={{ fontSize: '0.85rem', color: GM.textDim }}>
              Log events to define your archetype.
            </div>
          )}

          {/* Full trait list */}
          {sortedTraits.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: '0.75rem', color: GM.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Traits
              </div>
              {sortedTraits.map(({ traitId, unlockedAt }) => {
                const t = traitMap[traitId];
                if (!t) return null;
                const dateStr = new Date(unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={traitId} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: GM.text }}>{t.name}</div>
                    <div style={{ fontSize: '0.8rem', color: GM.textDim, marginTop: 2, fontStyle: 'italic' }}>
                      {t.statement}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: GM.textDim, opacity: 0.6, marginTop: 2 }}>
                      {dateStr}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Opportunity card (game mode) ─────────────────────────────────────────────
function GameOppCard({ opp, expanded, onToggle, streaks, masteryMin = 3, shouldPulse, levelChange, barReady, isEdgeOpp, sparklineValues }) {
  const pathKey  = opp.path || 'default';
  const pathInfo = PATHS[pathKey];
  const lvInfo   = getPathLevel(opp.game_xp || 0, pathKey);
  const { rebirths } = getRebirthInfo(opp.game_xp || 0);
  const barPct   = lvInfo.xpForLevel > 0
    ? Math.round((lvInfo.xpIntoLevel / lvInfo.xpForLevel) * 100)
    : 100;
  const barColor = rebirths > 0 ? GM.gold : GM.accent;
  const { attemptStreak = 0, masteryStreak = 0, failureRun = 0, recoveryStreak = 0, recoveryBest = 0 } = streaks || {};

  // Level label crossfade: start with prevLabel if a change occurred
  const shouldCrossfade = levelChange && levelChange.prevLabel !== lvInfo.fullLabel;
  const [displayLabel, setDisplayLabel] = useState(
    shouldCrossfade ? levelChange.prevLabel : lvInfo.fullLabel
  );
  const [labelAnimClass, setLabelAnimClass] = useState(shouldCrossfade ? 'label-fade-out' : '');

  // Card pulse
  const cardRef = useRef(null);

  useEffect(() => {
    if (shouldCrossfade) {
      const t1 = setTimeout(() => {
        setDisplayLabel(lvInfo.fullLabel);
        setLabelAnimClass('label-fade-in');
      }, 330);
      const t2 = setTimeout(() => setLabelAnimClass(''), 800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []); // intentionally runs only on mount

  useEffect(() => {
    if (!shouldPulse || !cardRef.current) return;
    cardRef.current.classList.add('opp-card-pulse');
    const t = setTimeout(() => {
      if (cardRef.current) cardRef.current.classList.remove('opp-card-pulse');
    }, 900);
    return () => clearTimeout(t);
  }, [shouldPulse]);

  return (
    <div
      ref={cardRef}
      style={{
        background: GM.bgCard,
        border: `1px solid ${GM.border}`,
        borderLeft: isEdgeOpp ? `3px solid ${GM.accent}` : `1px solid ${GM.border}`,
        borderRadius: 8,
        padding: '13px 15px',
        marginBottom: 8,
      }}
    >
      {/* Clickable header */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{pathInfo.icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: GM.text }}>
              {opp.title}
            </span>
            {opp.path_locked && (
              <span style={{ fontSize: '0.68rem', color: GM.gold, opacity: 0.8 }}>🔒</span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: '0.76rem', color: GM.textDim }}>
            {pathInfo.name}
            <span style={{ margin: '0 5px', opacity: 0.4 }}>·</span>
            <span className={labelAnimClass} style={{ fontWeight: 600, color: GM.text }}>
              {displayLabel}
            </span>
            {rebirths > 0 && (
              <span style={{ marginLeft: 6, color: GM.gold, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                {getRebirthSymbols(rebirths, pathKey)}
              </span>
            )}
          </div>
        </div>
        <span style={{ color: GM.textDim, fontSize: '0.72rem', marginLeft: 8, marginTop: 2 }}>
          {expanded ? '▲' : '▶'}
        </span>
      </div>

      {/* XP bar — animates from 0% to actual width when barReady transitions to true */}
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 2, background: GM.bar, borderRadius: 1, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: barReady ? `${barPct}%` : '0%',
            background: barColor,
            borderRadius: 1,
            transition: barReady ? 'width 0.6s ease' : 'none',
          }} />
        </div>
        <div style={{ marginTop: 4, fontSize: '0.7rem', color: GM.textDim, display: 'flex', justifyContent: 'space-between' }}>
          <span>{lvInfo.xpIntoLevel} / {lvInfo.xpForLevel} XP</span>
          {!lvInfo.isPrestige && lvInfo.nextLabel && (
            <span style={{ opacity: 0.7 }}>→ {lvInfo.nextLabel}</span>
          )}
        </div>
      </div>

      {/* XP history sparkline */}
      {sparklineValues && sparklineValues.some(v => v !== 0) && (
        <div style={{ marginTop: 6 }}>
          <Sparkline values={sparklineValues} width={80} height={18} color={barColor} />
        </div>
      )}

      {/* Streak indicators (collapsed view) */}
      {(attemptStreak > 0 || failureRun > 0 || (masteryStreak >= masteryMin)) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: '0.72rem', flexWrap: 'wrap' }}>
          {attemptStreak > 0 && (
            <span style={{ color: GM.accent }}>↑ Attempt: {attemptStreak}</span>
          )}
          {masteryStreak >= masteryMin && (
            <span style={{ color: GM.gold }}>★ Mastery: {masteryStreak}</span>
          )}
          {failureRun > 0 && (
            <span style={{ color: GM.accentAlt ?? '#c8a84b', opacity: 0.85 }}>↓ Run: {failureRun}</span>
          )}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{
          marginTop: 14,
          borderTop: `1px solid ${GM.border}`,
          paddingTop: 14,
          fontSize: '0.8rem',
          color: GM.textDim,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div>
            <span style={{ color: GM.text, fontWeight: 500 }}>Total game XP </span>
            {opp.game_xp || 0}
          </div>
          {!lvInfo.isPrestige && (
            <div>
              <span style={{ color: GM.text, fontWeight: 500 }}>XP to {lvInfo.nextLabel} </span>
              {lvInfo.xpToNext}
            </div>
          )}

          {/* Full streak details */}
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${GM.border}`, paddingTop: 8 }}>
            <div style={{ fontSize: '0.72rem', color: GM.textDim, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Streaks</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>↑ Attempt streak</span>
              <span style={{ color: attemptStreak > 0 ? GM.accent : GM.textDim }}>{attemptStreak}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>★ Mastery streak</span>
              <span style={{ color: masteryStreak >= masteryMin ? GM.gold : GM.textDim }}>{masteryStreak >= masteryMin ? masteryStreak : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>↺ Recovery best</span>
              <span style={{ color: recoveryBest > 0 ? GM.text : GM.textDim }}>{recoveryBest > 0 ? recoveryBest : '—'}</span>
            </div>
            {failureRun > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Failure run</span>
                <span style={{ color: GM.gold }}>{failureRun}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 4 }}>
            <div style={{ color: GM.text, fontWeight: 500, marginBottom: 3 }}>{pathInfo.name} path</div>
            <div>{pathInfo.philosophy}</div>
          </div>
          <div style={{ fontSize: '0.68rem', opacity: 0.55, marginTop: 2 }}>
            {pathInfo.labels.join(' → ')}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game mode progress page ──────────────────────────────────────────────────
function GameProgress() {
  const [stats, setStats]                       = useState(null);
  const [loginStreak, setLoginStreak]           = useState(0);
  const [storedTraits, setStoredTraits]         = useState([]);
  const [newlyUnlockedTraitIds, setNewlyUnlockedTraitIds] = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [barsReady, setBarsReady]               = useState(false);
  const [pulsingOpps, setPulsingOpps]           = useState(null);     // Set<oppId>
  const [levelChanges, setLevelChanges]         = useState(null);     // { [oppId]: { prevLabel } }
  const [dissolvingBosses, setDissolvingBosses] = useState([]);
  const [expandedOpp, setExpandedOpp]           = useState(null);
  const [headerExpanded, setHeaderExpanded]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await dbHelpers.backfillGameXp();

        const [opportunities, events, situations, profile,
               bossThreshold, bossDiss, breadthTarget, masteryMin, oppBossWindow] = await Promise.all([
          db.opportunities.toArray(),
          db.events.toArray(),
          db.situations.toArray(),
          dbHelpers.getGameProfile(),
          dbHelpers.getConfig('situationBossThreshold', 5),
          dbHelpers.getConfig('bossDissolutionThreshold', 5),
          dbHelpers.getConfig('breadthWeeklyTarget', 7),
          dbHelpers.getConfig('masteryStreakMinDisplay', 3),
          dbHelpers.getConfig('opportunityBossWindow', 20),
        ]);

        const gameStats = computeGameStats(
          opportunities, events, situations,
          { bossThreshold, bossDiss, breadthTarget, masteryMin, oppBossWindow }
        );
        setStats(gameStats);
        setLoginStreak(profile.loginStreak || 0);

        // Traits
        const unlockedIds = computeUnlockedTraitIds(opportunities, events, situations, gameStats.oppStreaks);
        const { newlyUnlocked, storedTraits: traits } = await dbHelpers.checkAndStoreTraits(unlockedIds);
        setStoredTraits(traits);
        setNewlyUnlockedTraitIds(newlyUnlocked);
        if (newlyUnlocked.length > 0 && navigator.vibrate) navigator.vibrate(100);

        // Boss dissolution — detect bosses that disappeared since last render
        const prevSnap = getPrevBossSnapshot();
        if (prevSnap) {
          const currentKeys = new Set(gameStats.bosses.map(b => `${b.type}-${b.id}`));
          const dissolved = Object.values(prevSnap).filter(b => !currentKeys.has(`${b.type}-${b.id}`));
          if (dissolved.length > 0) {
            setDissolvingBosses(dissolved);
            setTimeout(() => setDissolvingBosses([]), 1600);
          }
        }
        storeBossSnapshot(gameStats.bosses);

        // Consume pending event animation state (from AddEvent)
        const { affectedOppIds, levelChanges: lc } = consumePendingEvent();
        if (affectedOppIds && affectedOppIds.length > 0) {
          setPulsingOpps(new Set(affectedOppIds));
        }
        if (lc && lc.length > 0) {
          setLevelChanges(Object.fromEntries(lc.map(c => [c.oppId, { prevLabel: c.prevLabel }])));
        }
      } catch (error) {
        console.error('[GameProgress] loadData error:', error);
      } finally {
        setLoading(false);
      }
      // Animate XP bars: render at 0% first, then transition to actual width after paint
      requestAnimationFrame(() => setBarsReady(true));
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ background: GM.bg, minHeight: '100vh', padding: 20, color: GM.textDim }}>
        Loading…
      </div>
    );
  }

  const { depthXP, archetype, top3, breadth, breadthTarget, realStreak, badges, sortedOpps, oppStreaks, oppSparklines, bosses, masteryMin, randomChallenge } = stats;

  return (
    <div style={{ background: GM.bg, minHeight: '100vh', padding: '16px 16px 80px', boxSizing: 'border-box' }}>

      {/* Section 1 — Character header */}
      <CharacterHeader
        archetype={archetype}
        depthXP={depthXP}
        badges={badges}
        breadth={breadth}
        breadthTarget={breadthTarget}
        realStreak={realStreak}
        loginStreak={loginStreak}
        top3={top3}
        storedTraits={storedTraits}
        newlyUnlockedTraitIds={newlyUnlockedTraitIds}
        expanded={headerExpanded}
        onToggle={() => setHeaderExpanded(e => !e)}
      />

      {/* Section 2 — Opportunities */}
      <div style={{ marginTop: 16 }}>
        {sortedOpps.map(opp => (
          <GameOppCard
            key={opp.id}
            opp={opp}
            expanded={expandedOpp === opp.id}
            onToggle={() => setExpandedOpp(id => id === opp.id ? null : opp.id)}
            streaks={oppStreaks[opp.id]}
            masteryMin={masteryMin}
            shouldPulse={!!(pulsingOpps && pulsingOpps.has(opp.id))}
            levelChange={levelChanges ? levelChanges[opp.id] : null}
            barReady={barsReady}
            isEdgeOpp={!!(randomChallenge?.type === 'edge' && randomChallenge.oppId === opp.id)}
            sparklineValues={oppSparklines ? oppSparklines[opp.id] : null}
          />
        ))}
        {sortedOpps.length === 0 && (
          <div style={{ color: GM.textDim, fontSize: '0.9rem', textAlign: 'center', padding: '40px 20px' }}>
            No opportunities yet. Add some in Customize.
          </div>
        )}
      </div>

      {/* Section 3 — The Frontier */}
      {(bosses.length > 0 || dissolvingBosses.length > 0 || (randomChallenge && randomChallenge.type !== 'edge')) && (
        <div style={{
          marginTop: 28,
          borderTop: `1px solid ${GM.border}`,
          paddingTop: 20,
        }}>
          {dissolvingBosses.map(boss => (
            <BossCard key={`dissolving-${boss.type}-${boss.id}`} boss={boss} dissolving={true} />
          ))}
          {bosses.map(boss => (
            <BossCard key={`${boss.type}-${boss.id}`} boss={boss} />
          ))}
          {randomChallenge && randomChallenge.type !== 'edge' && (
            <div style={{ fontSize: '0.85rem', color: GM.textDim, marginTop: bosses.length > 0 ? 12 : 0, padding: '0 4px', fontStyle: 'italic' }}>
              {randomChallenge.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Standard mode progress page (unchanged) ──────────────────────────────────
function StandardProgress() {
  const [opportunities, setOpportunities] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [sortBy, setSortBy] = useState('alphabetical');
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [filterHasEvents, setFilterHasEvents] = useState(false);
  const [eventCountsPerOpp, setEventCountsPerOpp] = useState({});

  useEffect(() => {
    loadOpportunities();
    loadTags();
    loadEventCounts();
  }, []);

  const loadEventCounts = async () => {
    try {
      const counts = await dbHelpers.getEventCountsPerOpportunity();
      setEventCountsPerOpp(counts);
    } catch (error) {
      console.error('[StandardProgress] loadEventCounts error:', error);
    }
  };

  useEffect(() => {
    let filtered = allOpportunities;

    if (selectedTags.length > 0) {
      filtered = filtered.filter(opp =>
        opp.tags && Array.isArray(opp.tags) &&
        selectedTags.some(tag => opp.tags.includes(tag))
      );
    }

    if (filterHasEvents) {
      filtered = filtered.filter(opp => (eventCountsPerOpp[opp.id] || 0) > 0);
    }

    switch (sortBy) {
      case 'alphabetical':
        filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'xp_percentage':
        filtered = [...filtered].sort((a, b) => b.current_xp - a.current_xp);
        break;
      case 'level':
        filtered = [...filtered].sort((a, b) =>
          b.current_level !== a.current_level
            ? b.current_level - a.current_level
            : b.current_xp - a.current_xp
        );
        break;
    }

    setOpportunities(filtered);
  }, [sortBy, selectedTags, filterHasEvents, eventCountsPerOpp, allOpportunities]);

  const loadOpportunities = async () => {
    try {
      const data = await dbHelpers.getOpportunitiesSorted('alphabetical');
      setAllOpportunities(data);
    } catch (error) {
      console.error('[StandardProgress] loadOpportunities error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const tags = await dbHelpers.getAllOpportunityTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('[StandardProgress] loadTags error:', error);
    }
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const getProgressPercentage = (xp) => Math.min((xp / 100) * 100, 100);

  const getProgressColor = (pct) => {
    if (pct < 25) return '#dc3545';
    if (pct < 50) return '#fd7e14';
    if (pct < 75) return '#ffc107';
    return '#28a745';
  };

  const getTotalLevel  = () => allOpportunities.reduce((t, o) => t + o.current_level, 0);
  const getTotalXP     = () => allOpportunities.reduce((t, o) => t + o.current_xp, 0);
  const getAverageLevel = () =>
    allOpportunities.length === 0 ? 0 : (getTotalLevel() / allOpportunities.length).toFixed(1);

  if (loading) {
    return (
      <div className="screen">
        <div className="card"><p>Loading progress...</p></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>📊 Progress Overview</h2>

      {/* Summary Stats */}
      <div className="card">
        <h3>🏆 Overall Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{getTotalLevel()}</div>
            <div className="stat-label">Total Levels</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{getTotalXP()}</div>
            <div className="stat-label">Total XP</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{getAverageLevel()}</div>
            <div className="stat-label">Avg Level</div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="card">
        <div className="sort-controls">
          <label htmlFor="sort" className="form-label">Sort by:</label>
          <select
            id="sort"
            className="form-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: '12px' }}>
          <button
            className={`btn ${filterHasEvents ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85em', padding: '6px 12px' }}
            onClick={() => setFilterHasEvents(f => !f)}
          >
            📋 Event Logged {filterHasEvents ? `(${opportunities.length})` : ''}
          </button>
        </div>
      </div>

      {/* Tag Filter */}
      {availableTags.length > 0 && (
        <div className="card">
          <h3>🏷️ Filter by Tags</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '6px 12px',
                  border: selectedTags.includes(tag) ? '2px solid #1976d2' : '1px solid #ccc',
                  borderRadius: '16px',
                  background: selectedTags.includes(tag) ? 'rgba(25,118,210,0.15)' : 'var(--bg-tertiary)',
                  color: selectedTags.includes(tag) ? '#2196f3' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: selectedTags.includes(tag) ? 'bold' : 'normal',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <button
                onClick={() => setSelectedTags([])}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #dc3545',
                  borderRadius: '12px',
                  background: 'rgba(220,53,69,0.15)',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                Clear Filters
              </button>
              <span style={{ marginLeft: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Showing {opportunities.length} of {allOpportunities.length} opportunities
              </span>
            </div>
          )}
        </div>
      )}

      {/* Opportunities List */}
      <div className="opportunities-list">
        {opportunities.map(opportunity => {
          const progressPercentage = getProgressPercentage(opportunity.current_xp);
          const progressColor      = getProgressColor(progressPercentage);

          return (
            <div key={opportunity.id} className="card opportunity-card">
              <div
                className="opportunity-header"
                onClick={() => setSelectedOpportunity(
                  selectedOpportunity?.id === opportunity.id ? null : opportunity
                )}
              >
                <div className="opportunity-info">
                  <h3 className="opportunity-title">{opportunity.title}</h3>
                  <div className="opportunity-meta">
                    <span className="level-badge">Level {opportunity.current_level}</span>
                    <span className="xp-text">{opportunity.current_xp}/100 XP</span>
                    {(eventCountsPerOpp[opportunity.id] || 0) > 0 && (
                      <span style={{
                        background: 'rgba(25,118,210,0.15)',
                        color: '#2196f3',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        📋 {eventCountsPerOpp[opportunity.id]} event{eventCountsPerOpp[opportunity.id] !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {opportunity.tags && opportunity.tags.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      {opportunity.tags.map(tag => (
                        <span key={tag} style={{
                          display: 'inline-block',
                          background: 'rgba(25,118,210,0.15)',
                          color: '#2196f3',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          marginRight: '4px',
                          marginBottom: '4px',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="expand-icon">
                  {selectedOpportunity?.id === opportunity.id ? '▼' : '▶'}
                </div>
              </div>

              <div className="progress-section">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progressPercentage}%`, backgroundColor: progressColor }}
                  />
                </div>
                <div className="progress-percentage">{progressPercentage.toFixed(0)}%</div>
              </div>

              {selectedOpportunity?.id === opportunity.id && (
                <div className="opportunity-details">
                  <div className="detail-section">
                    <h4>📋 Description</h4>
                    <p>{opportunity.description}</p>
                  </div>
                  <div className="detail-section">
                    <h4>📈 Progress Details</h4>
                    <div className="progress-details">
                      <div className="detail-item">
                        <span className="detail-label">Current Level:</span>
                        <span className="detail-value">{opportunity.current_level}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">XP Progress:</span>
                        <span className="detail-value">{opportunity.current_xp}/100</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">XP to Next Level:</span>
                        <span className="detail-value">{100 - opportunity.current_xp}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Created:</span>
                        <span className="detail-value">
                          {new Date(opportunity.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Last Updated:</span>
                        <span className="detail-value">
                          {new Date(opportunity.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {opportunities.length === 0 && (
        <div className="card empty-state">
          <h3>No Opportunities Found</h3>
          <p>Go to Customize to add some opportunities to track!</p>
        </div>
      )}
    </div>
  );
}

// ─── Root: pick standard or game mode ────────────────────────────────────────
function CheckProgress() {
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [modeChecked, setModeChecked] = useState(false);

  useEffect(() => {
    dbHelpers.getConfig('gameModeEnabled', false)
      .then(v => { setGameModeEnabled(!!v); setModeChecked(true); })
      .catch(err => { console.error('[CheckProgress] getConfig error:', err); setModeChecked(true); });
  }, []);

  if (!modeChecked) return null;

  return gameModeEnabled ? <GameProgress /> : <StandardProgress />;
}

export default CheckProgress;
