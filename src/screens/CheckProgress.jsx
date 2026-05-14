import { useState, useEffect, useRef } from 'react';
import { dbHelpers, db, ANTAGONIST_HP_POOLS, ANTAGONIST_LEVEL_LABELS } from '../database/db';
import { PATHS, getPathLevel, getRebirthInfo, getRebirthSymbols } from '../utils/pathUtils';
import { TRAITS, computeUnlockedTraitIds } from '../utils/traitUtils';
import { consumePendingEvent, storeBossSnapshot, getPrevBossSnapshot } from '../utils/animationState';
import { computeOppStreaks, computeBosses } from '../utils/bossUtils';
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

  // Sort opportunities by level (via game_xp) desc, then game_xp desc as tiebreaker
  const sortedOpps = [...opportunities].sort((a, b) => {
    const aInfo = getPathLevel(a.game_xp || 0, a.path || 'default');
    const bInfo = getPathLevel(b.game_xp || 0, b.path || 'default');
    if (bInfo.rebirths !== aInfo.rebirths) return bInfo.rebirths - aInfo.rebirths;
    if (bInfo.level !== aInfo.level) return bInfo.level - aInfo.level;
    return (b.game_xp || 0) - (a.game_xp || 0);
  });

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

// ─── Antagonist card ──────────────────────────────────────────────────────────
const ANT_RED = '#8b2020';
const ANT_RED_DIM = 'rgba(139,32,32,0.15)';

function AntagonistCard({ antagonist, taggedTitles = [], lastHitDaysAgo, recentChange, barReady }) {
  const maxHP = ANTAGONIST_HP_POOLS[antagonist.currentLevel] || 1;
  const hpPct = Math.min(100, Math.max(0, (antagonist.currentHP / maxHP) * 100));
  const label = ANTAGONIST_LEVEL_LABELS[antagonist.currentLevel] || '';
  const createdDays = Math.floor((Date.now() - new Date(antagonist.createdAt).getTime()) / 86400000);
  const levelsCleared = antagonist.startingLevel - antagonist.currentLevel;

  const [expanded, setExpanded] = useState(false);
  const [fading, setFading] = useState(false);

  // Level crossfade
  const prevLabel = recentChange?.levelChanged ? ANTAGONIST_LEVEL_LABELS[recentChange.oldLevel] : null;
  const [displayLabel, setDisplayLabel] = useState(prevLabel || label);
  const [labelAnimClass, setLabelAnimClass] = useState(prevLabel ? 'label-fade-out' : '');

  useEffect(() => {
    if (prevLabel) {
      const t1 = setTimeout(() => { setDisplayLabel(label); setLabelAnimClass('label-fade-in'); }, 330);
      const t2 = setTimeout(() => setLabelAnimClass(''), 800);
      if (recentChange?.levelChanged && navigator.vibrate) navigator.vibrate(60);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []); // intentionally runs only on mount

  useEffect(() => {
    if (recentChange?.defeated) {
      const t = setTimeout(() => setFading(true), 100);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div
      style={{
        background: GM.bgCard,
        border: `1px solid ${ANT_RED}33`,
        borderLeft: `3px solid ${ANT_RED}`,
        borderRadius: 8,
        padding: '13px 15px',
        marginBottom: 8,
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 1.5s ease' : undefined,
      }}
    >
      {/* Clickable header */}
      <div onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: GM.text }}>
              ⚔ {antagonist.name}
            </div>
            <div style={{ marginTop: 3, fontSize: '0.75rem', color: ANT_RED, fontWeight: 600 }}>
              <span className={labelAnimClass}>{displayLabel}</span>
              <span style={{ color: GM.textDim, fontWeight: 400, marginLeft: 6 }}>Lv.{antagonist.currentLevel}</span>
            </div>
          </div>
          <span style={{ color: GM.textDim, fontSize: '0.72rem', marginLeft: 8 }}>
            {expanded ? '▲' : '▶'}
          </span>
        </div>

        {/* HP bar */}
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 8, background: 'rgba(139,32,32,0.15)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: barReady ? `${hpPct}%` : '0%',
              background: ANT_RED,
              borderRadius: 4,
              transition: barReady ? 'width 0.6s ease' : 'none',
            }} />
          </div>
          <div style={{ marginTop: 4, fontSize: '0.7rem', color: GM.textDim, display: 'flex', justifyContent: 'space-between' }}>
            <span>{antagonist.currentHP} / {maxHP} HP</span>
            <span>{Math.round(hpPct)}%</span>
          </div>
        </div>

        {/* Collapsed stats row */}
        <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: '0.72rem', color: GM.textDim, flexWrap: 'wrap' }}>
          <span>{antagonist.totalDamageDealt} total damage dealt</span>
          <span>Fighting {createdDays}d</span>
          {lastHitDaysAgo !== null && (
            <span>Last hit: {lastHitDaysAgo === 0 ? 'today' : `${lastHitDaysAgo}d ago`}</span>
          )}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${GM.border}`, paddingTop: 14, fontSize: '0.8rem', color: GM.textDim }}>
          {antagonist.description && (
            <p style={{ margin: '0 0 10px 0', fontStyle: 'italic' }}>{antagonist.description}</p>
          )}
          {taggedTitles.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: GM.text, marginBottom: 4 }}>Tagged situations:</div>
              {taggedTitles.map(t => (
                <div key={t} style={{ paddingLeft: 8, marginBottom: 2 }}>· {t}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: '0.72rem' }}>
            <span>Started: {new Date(antagonist.createdAt).toLocaleDateString()}</span>
            <span>Starting level: {antagonist.startingLevel} ({ANTAGONIST_LEVEL_LABELS[antagonist.startingLevel]})</span>
            {levelsCleared > 0 && (
              <span style={{ color: '#27ae60' }}>Levels cleared: {levelsCleared}</span>
            )}
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
  const [sectionsExpanded, setSectionsExpanded] = useState({ opportunities: false, antagonists: false, frontier: false });

  // Antagonist state
  const [antagonists, setAntagonists]               = useState([]);
  const [antagonistChanges, setAntagonistChanges]   = useState(null); // { [antagonistId]: impact }
  const [antagonistSituations, setAntagonistSituations] = useState({}); // { sitId → title }
  const [antagonistLastHits, setAntagonistLastHits] = useState({}); // { antagonistId → daysAgo }

  useEffect(() => {
    (async () => {
      try {
        await dbHelpers.backfillGameXp();

        const [opportunities, events, situations, profile,
               bossThreshold, bossDiss, breadthTarget, masteryMin, oppBossWindow] = await Promise.all([
          db.opportunities.filter(o => !o.archived).toArray(),
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
        const { affectedOppIds, levelChanges: lc, antagonistChanges: ac } = consumePendingEvent();
        if (affectedOppIds && affectedOppIds.length > 0) {
          setPulsingOpps(new Set(affectedOppIds));
        }
        if (lc && lc.length > 0) {
          setLevelChanges(Object.fromEntries(lc.map(c => [c.oppId, { prevLabel: c.prevLabel }])));
        }

        // Load antagonists and compute last-hit times
        const [activeAnts, allEventsForAnts, allSitsForAnts] = await Promise.all([
          dbHelpers.getAntagonists(),
          db.events.toArray(),
          db.situations.toArray(),
        ]);
        setAntagonists(activeAnts);

        // Build sitId → title map
        const sitTitleMap = Object.fromEntries(allSitsForAnts.map(s => [s.id, s.title]));
        setAntagonistSituations(sitTitleMap);

        // Compute last-hit for each antagonist: days since last positive game XP event on any tagged situation
        const lastHits = {};
        const now2 = Date.now();
        for (const ant of activeAnts) {
          const taggedIds = new Set(ant.taggedSituationIds || []);
          const positiveHits = allEventsForAnts.filter(
            ev => taggedIds.has(ev.situation_id) && (ev.game_xp_change || 0) > 0
          );
          if (positiveHits.length > 0) {
            const latest = Math.max(...positiveHits.map(ev => new Date(ev.timestamp).getTime()));
            lastHits[ant.id] = Math.floor((now2 - latest) / 86400000);
          } else {
            lastHits[ant.id] = null;
          }
        }
        setAntagonistLastHits(lastHits);

        // Store antagonist pending changes indexed by antagonistId
        if (ac && ac.length > 0) {
          setAntagonistChanges(Object.fromEntries(ac.map(c => [c.antagonistId, c])));
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
      <div style={{ marginTop: 16, borderTop: `1px solid ${GM.border}`, paddingTop: 12 }}>
        <button
          onClick={() => setSectionsExpanded(s => ({ ...s, opportunities: !s.opportunities }))}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: '4px 0 8px', cursor: 'pointer', color: GM.textDim }}
        >
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Opportunities</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
            <span>{sortedOpps.length}</span>
            <span style={{ fontSize: '0.65rem' }}>{sectionsExpanded.opportunities ? '▼' : '▶'}</span>
          </span>
        </button>
        {sectionsExpanded.opportunities && (
          <>
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
          </>
        )}
      </div>

      {/* Section 3 — Declared Antagonists */}
      {antagonists.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${GM.border}`, paddingTop: 12 }}>
          <button
            onClick={() => setSectionsExpanded(s => ({ ...s, antagonists: !s.antagonists }))}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: '4px 0 8px', cursor: 'pointer', color: GM.textDim }}
          >
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Declared Antagonists</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
              <span>{antagonists.length}</span>
              <span style={{ fontSize: '0.65rem' }}>{sectionsExpanded.antagonists ? '▼' : '▶'}</span>
            </span>
          </button>
          {sectionsExpanded.antagonists && antagonists.map(ant => {
            const taggedTitles = (ant.taggedSituationIds || [])
              .map(id => antagonistSituations[id])
              .filter(Boolean);
            return (
              <AntagonistCard
                key={ant.id}
                antagonist={ant}
                taggedTitles={taggedTitles}
                lastHitDaysAgo={antagonistLastHits[ant.id] ?? null}
                recentChange={antagonistChanges ? antagonistChanges[ant.id] : null}
                barReady={barsReady}
              />
            );
          })}
        </div>
      )}

      {/* Section 4 — The Frontier */}
      {(bosses.length > 0 || dissolvingBosses.length > 0 || (randomChallenge && randomChallenge.type !== 'edge')) && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${GM.border}`, paddingTop: 12 }}>
          <button
            onClick={() => setSectionsExpanded(s => ({ ...s, frontier: !s.frontier }))}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: '4px 0 8px', cursor: 'pointer', color: GM.textDim }}
          >
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>The Frontier</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
              <span>{bosses.length + dissolvingBosses.length}</span>
              <span style={{ fontSize: '0.65rem' }}>{sectionsExpanded.frontier ? '▼' : '▶'}</span>
            </span>
          </button>
          {sectionsExpanded.frontier && (
            <>
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
            </>
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
  const [sortBy, setSortBy] = useState('level');
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
