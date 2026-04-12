import { useState, useEffect } from 'react';
import { dbHelpers, db } from '../database/db';
import { PATHS, getPathLevel } from '../utils/pathUtils';
import './ProgressStyles.css';

// ─── Standard mode sort options ───────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'alphabetical', label: 'A-Z' },
  { value: 'xp_percentage', label: 'XP %' },
  { value: 'level', label: 'Level' }
];

// ─── Game-mode colour tokens ──────────────────────────────────────────────────
const GM = {
  bg:      '#1a1f2e',
  bgCard:  '#232940',
  bgDeep:  '#161b29',
  text:    '#e8e4dc',
  textDim: '#8a8578',
  accent:  '#4a7fa5',
  gold:    '#c8a84b',
  border:  'rgba(255,255,255,0.07)',
  bar:     'rgba(255,255,255,0.10)',
};

// ─── Compute all game-mode stats from raw DB rows ─────────────────────────────
function computeGameStats(opportunities, events, situations) {
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

  // Meta-skill badges: opportunities that reached prestige
  const badges = opportunities
    .filter(o => getPathLevel(o.game_xp || 0, o.path || 'default').isPrestige)
    .map(o => ({
      opp: o,
      pathInfo: PATHS[o.path || 'default'],
      levelInfo: getPathLevel(o.game_xp || 0, o.path || 'default'),
    }));

  return { depthXP, archetype, top3, breadth: breadthSet.size, realStreak, badges, sortedOpps };
}

// ─── Character header ─────────────────────────────────────────────────────────
function CharacterHeader({ archetype, depthXP, badges, breadth, realStreak, top3, expanded, onToggle }) {
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
          {badges.map(({ opp, pathInfo, levelInfo }) => (
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
              {pathInfo.icon} {opp.title} — {levelInfo.fullLabel}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: '0.8rem', color: GM.textDim }}>
        <span>
          Breadth: <strong style={{ color: GM.text }}>{breadth}</strong>
          <span style={{ fontSize: '0.7rem', marginLeft: 3 }}>this week</span>
        </span>
        {realStreak > 0 && (
          <span>
            Real: <strong style={{ color: GM.text }}>{realStreak}</strong>
          </span>
        )}
      </div>

      {/* Expanded archetype detail */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${GM.border}`, paddingTop: 14 }}>
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
        </div>
      )}
    </div>
  );
}

// ─── Opportunity card (game mode) ─────────────────────────────────────────────
function GameOppCard({ opp, expanded, onToggle }) {
  const pathKey  = opp.path || 'default';
  const pathInfo = PATHS[pathKey];
  const lvInfo   = getPathLevel(opp.game_xp || 0, pathKey);
  const barPct   = lvInfo.xpForLevel > 0
    ? Math.round((lvInfo.xpIntoLevel / lvInfo.xpForLevel) * 100)
    : 100;
  const barColor = lvInfo.isPrestige ? GM.gold : GM.accent;

  return (
    <div
      style={{
        background: GM.bgCard,
        border: `1px solid ${GM.border}`,
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
            <span style={{ fontWeight: 600, color: GM.text }}>{lvInfo.fullLabel}</span>
            {lvInfo.isPrestige && (
              <span style={{ marginLeft: 6, color: GM.gold, fontSize: '0.72rem' }}>
                sub {lvInfo.prestigeSub}
              </span>
            )}
          </div>
        </div>
        <span style={{ color: GM.textDim, fontSize: '0.72rem', marginLeft: 8, marginTop: 2 }}>
          {expanded ? '▲' : '▶'}
        </span>
      </div>

      {/* XP bar */}
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 2, background: GM.bar, borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 1 }} />
        </div>
        <div style={{
          marginTop: 4,
          fontSize: '0.7rem',
          color: GM.textDim,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>{lvInfo.xpIntoLevel} / {lvInfo.xpForLevel} XP</span>
          {!lvInfo.isPrestige && lvInfo.nextLabel && (
            <span style={{ opacity: 0.7 }}>→ {lvInfo.nextLabel}</span>
          )}
        </div>
      </div>

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
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [expandedOpp, setExpandedOpp]   = useState(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Backfill game_xp for any events logged before game mode was enabled
        await dbHelpers.backfillGameXp();

        const [opportunities, events, situations] = await Promise.all([
          db.opportunities.toArray(),
          db.events.toArray(),
          db.situations.toArray(),
        ]);
        setStats(computeGameStats(opportunities, events, situations));
      } catch (error) {
        console.error('[GameProgress] loadData error:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ background: GM.bg, minHeight: '100vh', padding: 20, color: GM.textDim }}>
        Loading…
      </div>
    );
  }

  const { depthXP, archetype, top3, breadth, realStreak, badges, sortedOpps } = stats;

  return (
    <div style={{ background: GM.bg, minHeight: '100vh', padding: '16px 16px 80px', boxSizing: 'border-box' }}>

      {/* Section 1 — Character header */}
      <CharacterHeader
        archetype={archetype}
        depthXP={depthXP}
        badges={badges}
        breadth={breadth}
        realStreak={realStreak}
        top3={top3}
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
          />
        ))}
        {sortedOpps.length === 0 && (
          <div style={{ color: GM.textDim, fontSize: '0.9rem', textAlign: 'center', padding: '40px 20px' }}>
            No opportunities yet. Add some in Customize.
          </div>
        )}
      </div>

      {/* Section 3 — The Frontier (bosses and challenges added in later features) */}
      {sortedOpps.length > 0 && (
        <div style={{
          marginTop: 28,
          borderTop: `1px solid ${GM.border}`,
          paddingTop: 20,
        }}>
          {/* Boss encounters and random challenges will appear here */}
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
