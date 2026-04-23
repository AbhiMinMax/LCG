import { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Radar, PolarArea } from 'react-chartjs-2';
import { dbHelpers, db } from '../database/db';
import { useTheme } from '../hooks/useTheme';
import { analyticsUtils } from '../utils/analyticsUtils';
import { generateDailyNarrative, generateWeeklyNarrative, generateMonthlyNarrative } from '../utils/narrativeUtils';
import './Analytics.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ─── Sparkline (inline SVG mini-chart) ───────────────────────────────────────
function Sparkline({ values, width = 80, height = 24, color = '#4a7fa5' }) {
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
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Game analytics computation ───────────────────────────────────────────────
function computeGameAnalyticsData(rawEvents, rawOpps, rawSits, profile) {
  const sortedAsc  = [...rawEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const sortedDesc = [...sortedAsc].reverse();
  const sitMap = Object.fromEntries(rawSits.map(s => [s.id, s]));

  // Overall
  const totalEvents = rawEvents.length;
  const totalGameXP = rawEvents.reduce((s, e) => s + (e.game_xp_change || 0), 0);
  const loginStreak = profile.loginStreak || 0;
  const realCount = rawEvents.filter(e => sitMap[e.situation_id] && !sitMap[e.situation_id].isMeta).length;
  const realPct = totalEvents > 0 ? Math.round((realCount / totalEvents) * 100) : 0;
  const depthXP = rawEvents.reduce((s, e) => {
    const sit = sitMap[e.situation_id];
    const diff = sit ? (sit.challenging_level || 3) : 3;
    const w = 1 + (diff - 1) * 0.15;
    const gxp = e.game_xp_change || 0;
    return gxp > 0 ? s + Math.round(gxp * w) : s;
  }, 0);

  // Per opportunity — event count, 8-week sparkline, streaks
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const isSuccess = v => v === 3 || v === 4;
  const isFailure = v => v === 1 || v === 2;

  const oppData = rawOpps.map(opp => {
    const evs = sortedDesc.filter(
      e => Array.isArray(e.affected_opportunities) && e.affected_opportunities.includes(opp.id)
    );
    if (evs.length === 0) return null;

    const weekXP = Array(8).fill(0);
    for (const ev of evs) {
      const wIdx = Math.floor((now - new Date(ev.timestamp).getTime()) / weekMs);
      if (wIdx >= 0 && wIdx < 8) weekXP[7 - wIdx] += ev.game_xp_change || 0;
    }

    let attemptStreak = 0, masteryStreak = 0, failureRun = 0, recoveryStreak = 0, recoveryBest = 0;
    for (const ev of evs) { if (isSuccess(ev.choice_value)) attemptStreak++; else break; }
    for (const ev of evs) { if (ev.choice_value === 4) masteryStreak++; else break; }
    for (const ev of evs) { if (isFailure(ev.choice_value)) failureRun++; else break; }
    const firstFailIdx = evs.findIndex(e => isFailure(e.choice_value));
    if (firstFailIdx > 0) recoveryStreak = firstFailIdx;
    let curRun = 0, inRec = false;
    for (let i = evs.length - 1; i >= 0; i--) {
      const cv = evs[i].choice_value;
      if (isFailure(cv)) { if (inRec && curRun > recoveryBest) recoveryBest = curRun; curRun = 0; inRec = true; }
      else if (inRec) curRun++;
    }
    if (inRec && curRun > recoveryBest) recoveryBest = curRun;

    return { opp, eventCount: evs.length, sparklineValues: weekXP, streaks: { attemptStreak, masteryStreak, failureRun, recoveryStreak, recoveryBest } };
  }).filter(Boolean);

  // Per situation — encounter count, choice distribution, current streak state
  const sitData = rawSits.map(sit => {
    const evs = sortedDesc.filter(e => e.situation_id === sit.id);
    if (evs.length === 0) return null;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const ev of evs) { if (ev.choice_value >= 1 && ev.choice_value <= 4) counts[ev.choice_value]++; }
    const pcts = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / evs.length) * 100)]));
    let currentStreak = 0, currentFailRun = 0;
    for (const ev of evs) { if (isSuccess(ev.choice_value)) currentStreak++; else break; }
    for (const ev of evs) { if (isFailure(ev.choice_value)) currentFailRun++; else break; }
    return { sit, encounterCount: evs.length, choicePcts: pcts, currentStreak, currentFailRun };
  }).filter(Boolean);

  // Breadth — distinct situations with tried/well_done per week (last 8 weeks)
  const breadthWeeks = Array.from({ length: 8 }, (_, i) => {
    const wStart = now - (8 - i) * weekMs;
    const wEnd = wStart + weekMs;
    const ids = new Set();
    for (const ev of rawEvents) {
      const t = new Date(ev.timestamp).getTime();
      if (t >= wStart && t < wEnd && isSuccess(ev.choice_value)) ids.add(ev.situation_id);
    }
    return ids.size;
  });

  // Boss history — situation bosses that were spawned and then dissolved
  const BOSS_THRESH = 5, DISS_THRESH = 5;
  const bossHistory = [];
  const sst = {};
  for (const ev of sortedAsc) {
    const sid = ev.situation_id;
    if (!sst[sid]) sst[sid] = { failRun: 0, active: false, startTs: null, dissStreak: 0 };
    const s = sst[sid];
    if (isFailure(ev.choice_value)) {
      s.failRun++;
      s.dissStreak = 0;
      if (!s.active && s.failRun >= BOSS_THRESH) {
        s.active = true;
        s.startTs = new Date(ev.timestamp).getTime();
      }
    } else if (isSuccess(ev.choice_value)) {
      s.failRun = 0;
      if (s.active) {
        s.dissStreak++;
        if (s.dissStreak >= DISS_THRESH) {
          const endTs = new Date(ev.timestamp).getTime();
          const durationDays = Math.round((endTs - s.startTs) / (1000 * 60 * 60 * 24));
          const sit = sitMap[sid];
          bossHistory.push({ title: sit?.title || '(deleted)', startTs: s.startTs, endTs, durationDays, dissolutionChoice: ev.choice_value });
          s.active = false;
          s.dissStreak = 0;
        }
      }
    }
  }
  bossHistory.sort((a, b) => b.endTs - a.endTs);

  return { totalEvents, totalGameXP, loginStreak, realPct, depthXP, oppData, sitData, breadthWeeks, bossHistory };
}

// ─── Game mode stats section ──────────────────────────────────────────────────
const CHOICE_LABELS = { 1: 'Misguided', 2: "Didn't try", 3: 'Tried', 4: 'Well done' };
const CHOICE_COLORS = { 1: '#c0392b', 2: '#e67e22', 3: '#27ae60', 4: '#2980b9' };

function GameStatsSection({ rawEvents, rawOpps, rawSits, profile }) {
  const [expanded, setExpanded] = useState({ overall: true, opportunities: false, situations: false, breadth: false, bossHistory: false });
  const toggle = key => setExpanded(s => ({ ...s, [key]: !s[key] }));

  const data = useMemo(
    () => computeGameAnalyticsData(rawEvents, rawOpps, rawSits, profile),
    [rawEvents, rawOpps, rawSits, profile]
  );

  const SectionRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  const SectionHeader = ({ sectionKey, label, count }) => (
    <div
      onClick={() => toggle(sectionKey)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', cursor: 'pointer',
        borderTop: '1px solid var(--border-color)',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
        {label}
        {count !== undefined && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6, fontSize: '0.78rem' }}>({count})</span>}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{expanded[sectionKey] ? '▲' : '▼'}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 18px', marginBottom: 18 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Stats
      </div>

      {/* Overall */}
      <SectionHeader sectionKey="overall" label="Overall" />
      {expanded.overall && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0 4px' }}>
          <SectionRow label="Total events" value={data.totalEvents} />
          <SectionRow label="Total game XP" value={data.totalGameXP.toLocaleString()} />
          <SectionRow label="Login streak" value={`${data.loginStreak} day${data.loginStreak !== 1 ? 's' : ''}`} />
          <SectionRow label="Real / meta split" value={`${data.realPct}% real`} />
          <SectionRow label="Depth XP" value={data.depthXP.toLocaleString()} />
        </div>
      )}

      {/* Per opportunity */}
      <SectionHeader sectionKey="opportunities" label="Opportunities" count={data.oppData.length} />
      {expanded.opportunities && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
          {data.oppData.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No events logged yet.</div>}
          {data.oppData.map(({ opp, eventCount, sparklineValues, streaks }) => (
            <div key={opp.id} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', flex: 1, marginRight: 8 }}>{opp.title}</span>
                <Sparkline values={sparklineValues} width={60} height={20} color="#4a7fa5" />
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: '0.76rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>Events: <strong style={{ color: 'var(--text-primary)' }}>{eventCount}</strong></span>
                {streaks.attemptStreak > 0 && <span style={{ color: '#4a7fa5' }}>↑ {streaks.attemptStreak}</span>}
                {streaks.masteryStreak > 0 && <span style={{ color: '#c8a84b' }}>★ {streaks.masteryStreak}</span>}
                {streaks.failureRun > 0 && <span style={{ color: '#c0392b' }}>↓ run {streaks.failureRun}</span>}
                {streaks.recoveryBest > 0 && <span>↺ best {streaks.recoveryBest}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per situation */}
      <SectionHeader sectionKey="situations" label="Situations" count={data.sitData.length} />
      {expanded.situations && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
          {data.sitData.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No situations with events yet.</div>}
          {data.sitData.map(({ sit, encounterCount, choicePcts, currentStreak, currentFailRun }) => (
            <div key={sit.id} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{sit.title}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{encounterCount}×</span>
              </div>
              {/* Choice distribution bar */}
              <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 5, gap: 1 }}>
                {[1, 2, 3, 4].map(cv => choicePcts[cv] > 0 ? (
                  <div key={cv} title={`${CHOICE_LABELS[cv]}: ${choicePcts[cv]}%`} style={{ width: `${choicePcts[cv]}%`, background: CHOICE_COLORS[cv], minWidth: 2 }} />
                ) : null)}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4].map(cv => choicePcts[cv] > 0 ? (
                  <span key={cv} style={{ color: CHOICE_COLORS[cv] }}>{CHOICE_LABELS[cv]}: {choicePcts[cv]}%</span>
                ) : null)}
                {currentStreak > 0 && <span style={{ color: '#27ae60', marginLeft: 4 }}>↑ {currentStreak} streak</span>}
                {currentFailRun > 0 && <span style={{ color: '#c0392b', marginLeft: 4 }}>↓ {currentFailRun} run</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly breadth */}
      <SectionHeader sectionKey="breadth" label="Weekly breadth" />
      {expanded.breadth && (
        <div style={{ padding: '10px 0 4px' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Distinct situations with tried/well done per week (last 8 weeks)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
            {data.breadthWeeks.map((val, i) => {
              const maxVal = Math.max(...data.breadthWeeks, 1);
              const h = Math.max(Math.round((val / maxVal) * 42), val > 0 ? 4 : 2);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2, height: '100%' }}>
                  <div style={{ width: '100%', height: h, background: '#4a7fa5', borderRadius: 2, opacity: 0.5 + (i / 8) * 0.5 }} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{val}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', color: 'var(--text-secondary)', marginTop: 2, opacity: 0.6 }}>
            <span>8w ago</span><span>this week</span>
          </div>
        </div>
      )}

      {/* Boss history */}
      <SectionHeader sectionKey="bossHistory" label="Boss history" count={data.bossHistory.length} />
      {expanded.bossHistory && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0 4px' }}>
          {data.bossHistory.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No bosses defeated yet.</div>
          )}
          {data.bossHistory.map((boss, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, borderLeft: '2px solid rgba(200,168,75,0.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{boss.title}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                  {new Date(boss.endTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                {boss.durationDays} day{boss.durationDays !== 1 ? 's' : ''} · broke with{' '}
                <span style={{ color: CHOICE_COLORS[boss.dissolutionChoice] }}>{CHOICE_LABELS[boss.dissolutionChoice]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Analytics() {
  const { theme } = useTheme();
  const [analyticsData, setAnalyticsData] = useState({
    opportunities: [],
    events: [],
    stats: null,
    situations: []
  });
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all'); // all, 30days, 7days, custom
  const [situationFilter, setSituationFilter] = useState('all');
  const [opportunityFilter, setOpportunityFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [chartView, setChartView] = useState('detailed'); // overview, detailed, comparison
  const [selectedMetric, setSelectedMetric] = useState('all');
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [narratives, setNarratives] = useState({ daily: [], weekly: [], monthly: [] });
  const [narrativeTab, setNarrativeTab] = useState('daily');
  const [gameRawData, setGameRawData] = useState(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered data based on current filters
  const filteredData = useMemo(() => {
    let filteredEvents = [...analyticsData.events];
    let filteredOpportunities = [...analyticsData.opportunities];

    // Time filtering
    if (timeFilter !== 'all') {
      if (timeFilter === 'custom' && customDateRange.start && customDateRange.end) {
        const startDate = new Date(customDateRange.start);
        const endDate = new Date(customDateRange.end);
        filteredEvents = filteredEvents.filter(event => {
          const eventDate = new Date(event.timestamp);
          return eventDate >= startDate && eventDate <= endDate;
        });
      } else if (timeFilter !== 'custom') {
        const daysAgo = timeFilter === '30days' ? 30 : timeFilter === '7days' ? 7 : timeFilter === '3months' ? 90 : 365;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        filteredEvents = filteredEvents.filter(event => new Date(event.timestamp) >= cutoffDate);
      }
    }

    // Situation filtering
    if (situationFilter !== 'all') {
      filteredEvents = filteredEvents.filter(event => event.situation_id === parseInt(situationFilter));
    }

    // Opportunity filtering (filter opportunities that are linked to selected situation)
    if (opportunityFilter !== 'all') {
      filteredOpportunities = filteredOpportunities.filter(opp => opp.id === parseInt(opportunityFilter));
    }

    return {
      events: filteredEvents,
      opportunities: filteredOpportunities,
      situations: analyticsData.situations
    };
  }, [analyticsData, timeFilter, situationFilter, opportunityFilter, customDateRange]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const [opportunities, events, stats, situations, isGameMode] = await Promise.all([
        dbHelpers.getOpportunitiesSorted('level'),
        dbHelpers.getEventsWithDetails(),
        dbHelpers.getDataStats(),
        dbHelpers.getSituationsWithOpportunities(),
        dbHelpers.getConfig('gameModeEnabled', false),
      ]);

      setAnalyticsData({ opportunities, events, stats, situations });
      setGameModeEnabled(!!isGameMode);

      if (isGameMode) {
        const [rawEvents, rawOpps, rawSits, profile, stored] = await Promise.all([
          db.events.toArray(),
          db.opportunities.toArray(),
          db.situations.toArray(),
          dbHelpers.getGameProfile(),
          dbHelpers.getNarratives(),
        ]);

        const now = new Date();
        const todayStr = now.toDateString();
        const thisWeekMon = (() => {
          const d = new Date(now);
          d.setDate(d.getDate() - d.getDay());
          d.setHours(0,0,0,0);
          return d.toISOString().slice(0,10);
        })();
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

        // Generate daily if not yet generated today
        const lastDaily = stored.daily[0]?.generatedAt;
        if (!lastDaily || new Date(lastDaily).toDateString() !== todayStr) {
          const text = generateDailyNarrative(rawEvents, rawSits, rawOpps, profile);
          if (text) stored.daily.unshift({ text, generatedAt: now.toISOString() });
        }
        // Generate weekly if not yet generated this week
        const lastWeekly = stored.weekly[0]?.generatedAt;
        const lastWeeklyWk = lastWeekly
          ? (() => { const d = new Date(lastWeekly); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); })()
          : null;
        if (lastWeeklyWk !== thisWeekMon) {
          const text = generateWeeklyNarrative(rawEvents, rawSits, rawOpps, profile);
          if (text) stored.weekly.unshift({ text, generatedAt: now.toISOString() });
        }
        // Generate monthly if not yet generated this month
        const lastMonthly = stored.monthly[0]?.generatedAt;
        const lastMonthKey = lastMonthly
          ? (() => { const d = new Date(lastMonthly); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })()
          : null;
        if (lastMonthKey !== thisMonthKey) {
          const text = generateMonthlyNarrative(rawEvents, rawSits, rawOpps, profile);
          if (text) stored.monthly.unshift({ text, generatedAt: now.toISOString() });
        }

        await dbHelpers.saveNarratives(stored);
        setNarratives(stored);
        setGameRawData({ rawEvents, rawOpps, rawSits, profile });
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Chart theme colors
  const getChartColors = () => {
    if (theme === 'dark') {
      return {
        primary: '#646cff',
        secondary: '#535bf2',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
        text: '#e2e8f0',
        grid: '#374151'
      };
    }
    return {
      primary: '#646cff',
      secondary: '#535bf2',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#2563eb',
      text: '#1f2937',
      grid: '#d1d5db'
    };
  };

  const colors = getChartColors();

  // Opportunities Level Distribution Chart
  const getOpportunityLevelsChart = () => {
    const levelCounts = {};
    filteredData.opportunities.forEach(opp => {
      levelCounts[opp.current_level] = (levelCounts[opp.current_level] || 0) + 1;
    });

    return {
      labels: Object.keys(levelCounts).sort((a, b) => Number(a) - Number(b)),
      datasets: [{
        label: 'Opportunities by Level',
        data: Object.keys(levelCounts).sort((a, b) => Number(a) - Number(b)).map(level => levelCounts[level]),
        backgroundColor: colors.primary,
        borderColor: colors.secondary,
        borderWidth: 2,
        borderRadius: 6,
      }]
    };
  };

  // XP Progress Chart
  const getXPProgressChart = () => {
    return {
      labels: filteredData.opportunities.map(opp => opp.title),
      datasets: [{
        label: 'Current XP',
        data: filteredData.opportunities.map(opp => opp.current_xp),
        backgroundColor: colors.success,
        borderColor: colors.success,
        borderWidth: 2,
        borderRadius: 6,
      }]
    };
  };

  // Events Timeline Chart
  const getEventsTimelineChart = () => {
    const eventsByDate = {};
    filteredData.events.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString();
      eventsByDate[date] = (eventsByDate[date] || 0) + 1;
    });

    const sortedDates = Object.keys(eventsByDate).sort((a, b) => new Date(a) - new Date(b));

    return {
      labels: sortedDates,
      datasets: [{
        label: 'Events per Day',
        data: sortedDates.map(date => eventsByDate[date]),
        fill: false,
        borderColor: colors.info,
        backgroundColor: colors.info,
        tension: 0.4,
        pointBackgroundColor: colors.info,
        pointBorderColor: colors.text,
        pointRadius: 4,
      }]
    };
  };

  // Choice Quality Distribution
  const getChoiceQualityChart = () => {
    const qualityLabels = {
      1: 'Poor (1)',
      2: 'Below Average (2)',
      3: 'Good (3)',
      4: 'Excellent (4)'
    };

    const qualityCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    filteredData.events.forEach(event => {
      if (event.choice_value >= 1 && event.choice_value <= 4) {
        qualityCounts[event.choice_value]++;
      }
    });

    return {
      labels: Object.keys(qualityCounts).map(key => qualityLabels[key]),
      datasets: [{
        data: Object.values(qualityCounts),
        backgroundColor: [colors.danger, colors.warning, colors.success, colors.primary],
        borderColor: colors.text,
        borderWidth: 1,
      }]
    };
  };

  // Top Performing Opportunities
  const getTopOpportunitiesChart = () => {
    const topOpps = [...filteredData.opportunities]
      .sort((a, b) => (b.current_level * 100 + b.current_xp) - (a.current_level * 100 + a.current_xp))
      .slice(0, 6);

    return {
      labels: topOpps.map(opp => opp.title),
      datasets: [{
        label: 'Total Progress',
        data: topOpps.map(opp => opp.current_level * 100 + opp.current_xp),
        backgroundColor: [
          colors.primary,
          colors.secondary,
          colors.success,
          colors.info,
          colors.warning,
          colors.danger
        ],
        borderWidth: 0,
      }]
    };
  };

  // Activity by day of week chart
  const getActivityByDayChart = () => {
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayActivity = new Array(7).fill(0);
    
    filteredData.events.forEach(event => {
      const dayOfWeek = new Date(event.timestamp).getDay();
      dayActivity[dayOfWeek]++;
    });

    return {
      labels: dayLabels,
      datasets: [{
        label: 'Events by Day',
        data: dayActivity,
        backgroundColor: colors.info,
        borderColor: colors.primary,
        borderWidth: 2,
        borderRadius: 6,
      }]
    };
  };

  // New chart types
  const getOpportunityRadarChart = () => {
    const topOpps = filteredData.opportunities.slice(0, 6);
    return {
      labels: topOpps.map(opp => opp.title),
      datasets: [{
        label: 'Current Level',
        data: topOpps.map(opp => opp.current_level),
        backgroundColor: colors.primary + '40',
        borderColor: colors.primary,
        borderWidth: 2,
        pointBackgroundColor: colors.primary,
      }]
    };
  };

  const getMonthlyProgressChart = () => {
    const monthlyData = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    filteredData.events.forEach(event => {
      const month = new Date(event.timestamp).getMonth();
      const year = new Date(event.timestamp).getFullYear();
      const key = `${monthNames[month]} ${year}`;
      if (!monthlyData[key]) {
        monthlyData[key] = { events: 0, totalXp: 0 };
      }
      monthlyData[key].events++;
      monthlyData[key].totalXp += event.xp_change || 0;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
      const [monthA, yearA] = a.split(' ');
      const [monthB, yearB] = b.split(' ');
      const dateA = new Date(`${monthA} 1, ${yearA}`);
      const dateB = new Date(`${monthB} 1, ${yearB}`);
      return dateA - dateB;
    });

    return {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Events',
          data: sortedMonths.map(month => monthlyData[month].events),
          backgroundColor: colors.primary,
          borderColor: colors.primary,
          borderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Total XP',
          data: sortedMonths.map(month => monthlyData[month].totalXp),
          backgroundColor: colors.success,
          borderColor: colors.success,
          borderWidth: 2,
          type: 'line',
          yAxisID: 'y1',
        }
      ]
    };
  };

  const getHourlyHeatmapChart = () => {
    const hours = Array.from({length: 24}, (_, i) => i);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const heatmapData = [];
    
    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        const count = filteredData.events.filter(event => {
          const eventDate = new Date(event.timestamp);
          return eventDate.getDay() === dayIndex && eventDate.getHours() === hour;
        }).length;
        
        heatmapData.push({
          x: hour,
          y: day,
          v: count
        });
      });
    });

    return {
      datasets: [{
        label: 'Activity',
        data: heatmapData,
        backgroundColor: (ctx) => {
          const value = ctx.parsed.v;
          const alpha = Math.min(value / 5, 1); // Normalize to max activity
          return `${colors.primary}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        },
        borderColor: colors.text,
        borderWidth: 1,
        width: ({chart}) => (chart.chartArea || {}).width / 24,
        height: ({chart}) => (chart.chartArea || {}).height / 7,
      }]
    };
  };

  const getSituationBreakdownChart = () => {
    const situationCounts = {};
    filteredData.events.forEach(event => {
      const situationTitle = event.situation?.title || 'Unknown';
      situationCounts[situationTitle] = (situationCounts[situationTitle] || 0) + 1;
    });

    return {
      labels: Object.keys(situationCounts),
      datasets: [{
        data: Object.values(situationCounts),
        backgroundColor: [
          colors.primary,
          colors.secondary,
          colors.success,
          colors.warning,
          colors.danger,
          colors.info,
        ],
        borderWidth: 2,
        borderColor: colors.text,
      }]
    };
  };

  const getXPTrendChart = () => {
    const dailyXP = {};
    filteredData.events.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString();
      dailyXP[date] = (dailyXP[date] || 0) + (event.xp_change || 0);
    });

    const sortedDates = Object.keys(dailyXP).sort((a, b) => new Date(a) - new Date(b));
    
    // Calculate cumulative XP
    let cumulativeXP = 0;
    const cumulativeData = sortedDates.map(date => {
      cumulativeXP += dailyXP[date];
      return cumulativeXP;
    });

    return {
      labels: sortedDates,
      datasets: [
        {
          label: 'Daily XP',
          data: sortedDates.map(date => dailyXP[date]),
          backgroundColor: colors.info + '60',
          borderColor: colors.info,
          borderWidth: 2,
          type: 'bar',
        },
        {
          label: 'Cumulative XP',
          data: cumulativeData,
          backgroundColor: 'transparent',
          borderColor: colors.success,
          borderWidth: 3,
          type: 'line',
          fill: false,
          tension: 0.4,
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: colors.text,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: colors.text,
        },
        grid: {
          color: colors.grid,
        },
      },
      y: {
        ticks: {
          color: colors.text,
        },
        grid: {
          color: colors.grid,
        },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: colors.text,
          padding: 20,
        },
      },
    },
  };

  const radarOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: colors.text,
        },
      },
    },
    scales: {
      r: {
        beginAtZero: true,
        ticks: {
          color: colors.text,
        },
        grid: {
          color: colors.grid,
        },
        pointLabels: {
          color: colors.text,
        },
      },
    },
  };

  const dualAxisOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: colors.text,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: colors.text,
        },
        grid: {
          color: colors.grid,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        ticks: {
          color: colors.text,
        },
        grid: {
          color: colors.grid,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        ticks: {
          color: colors.text,
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="loading-spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h2>📈 Analytics Dashboard</h2>

        {/* Section 1 — Narrative (game mode only) */}
        {gameModeEnabled && (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '16px 18px',
            marginBottom: 18,
          }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {['daily', 'weekly', 'monthly'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setNarrativeTab(tab)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: narrativeTab === tab ? 600 : 400,
                    background: narrativeTab === tab ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: narrativeTab === tab ? '#fff' : 'var(--text-secondary)',
                    textTransform: 'capitalize',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Current narrative */}
            {(() => {
              const entries = narratives[narrativeTab] || [];
              if (entries.length === 0) {
                const minMap = { daily: 1, weekly: 3, monthly: 10 };
                return (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontStyle: 'italic' }}>
                    Not enough events yet for a {narrativeTab} narrative (minimum {minMap[narrativeTab]}).
                  </p>
                );
              }
              const current = entries[0];
              return (
                <div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}>
                    {current.text}
                  </p>
                  <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {new Date(current.generatedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })()}

            {/* Archive */}
            {(narratives[narrativeTab] || []).length > 1 && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Archive
                </div>
                {narratives[narrativeTab].slice(1).map((entry, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7, marginBottom: 3 }}>
                      {new Date(entry.generatedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
                      {entry.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 2 — Game stats */}
        {gameModeEnabled && gameRawData && (
          <GameStatsSection
            rawEvents={gameRawData.rawEvents}
            rawOpps={gameRawData.rawOpps}
            rawSits={gameRawData.rawSits}
            profile={gameRawData.profile}
          />
        )}

        {/* Enhanced Filter Controls */}
        <div className="analytics-filters">
          <div className="filter-group">
            <label>Time Range:</label>
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="3months">Last 3 Months</option>
              <option value="1year">Last Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {timeFilter === 'custom' && (
            <div className="filter-group custom-date-range">
              <input
                type="date"
                value={customDateRange.start}
                onChange={(e) => setCustomDateRange({...customDateRange, start: e.target.value})}
                className="filter-input"
              />
              <span>to</span>
              <input
                type="date"
                value={customDateRange.end}
                onChange={(e) => setCustomDateRange({...customDateRange, end: e.target.value})}
                className="filter-input"
              />
            </div>
          )}

          <div className="filter-group">
            <label>Situation:</label>
            <select 
              value={situationFilter} 
              onChange={(e) => setSituationFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Situations</option>
              {analyticsData.situations.map(situation => (
                <option key={situation.id} value={situation.id}>
                  {situation.title}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Opportunity:</label>
            <select 
              value={opportunityFilter} 
              onChange={(e) => setOpportunityFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Opportunities</option>
              {analyticsData.opportunities.map(opportunity => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.title}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>View:</label>
            <select 
              value={chartView} 
              onChange={(e) => setChartView(e.target.value)}
              className="filter-select"
            >
              <option value="overview">Overview</option>
              <option value="detailed">Detailed</option>
              <option value="comparison">Comparison</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <h3>{analyticsData.stats?.opportunities || 0}</h3>
            <p>Opportunities</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-content">
            <h3>{filteredData.events.length}</h3>
            <p>Events {timeFilter !== 'all' ? `(${timeFilter})` : 'Logged'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <h3>
              {filteredData.opportunities.length > 0 
                ? Math.round(filteredData.opportunities.reduce((sum, opp) => sum + opp.current_level, 0) / filteredData.opportunities.length * 10) / 10
                : 0
              }
            </h3>
            <p>Avg Level</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <h3>
              {analyticsUtils.calculateStreak(filteredData.events).current}
            </h3>
            <p>Day Streak</p>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="insights-section">
        <h3>💡 Insights & Recommendations</h3>
        <div className="insights-grid">
          {analyticsUtils.generateInsights(filteredData.opportunities, filteredData.events).map((insight, index) => (
            <div key={index} className={`insight-card ${insight.priority}`}>
              <div className="insight-content">
                <p>{insight.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* XP Progress Bar Chart */}
        <div className="chart-card">
          <h3>🚀 XP Progress by Opportunity</h3>
          <div className="chart-wrapper">
            <Bar data={getXPProgressChart()} options={chartOptions} />
          </div>
        </div>

        {/* Level Distribution */}
        <div className="chart-card">
          <h3>📊 Level Distribution</h3>
          <div className="chart-wrapper">
            <Bar data={getOpportunityLevelsChart()} options={chartOptions} />
          </div>
        </div>

        {/* Events Timeline */}
        <div className="chart-card wide">
          <h3>📅 Events Timeline</h3>
          <div className="chart-wrapper">
            <Line data={getEventsTimelineChart()} options={chartOptions} />
          </div>
        </div>

        {/* Choice Quality Distribution */}
        <div className="chart-card">
          <h3>🎯 Choice Quality Distribution</h3>
          <div className="chart-wrapper">
            <Doughnut data={getChoiceQualityChart()} options={pieOptions} />
          </div>
        </div>

        {/* Top Opportunities */}
        <div className="chart-card">
          <h3>🏆 Top Performing Opportunities</h3>
          <div className="chart-wrapper">
            <Pie data={getTopOpportunitiesChart()} options={pieOptions} />
          </div>
        </div>

        {/* Activity by Day */}
        <div className="chart-card">
          <h3>📅 Activity by Day of Week</h3>
          <div className="chart-wrapper">
            <Bar data={getActivityByDayChart()} options={chartOptions} />
          </div>
        </div>

        {/* Progress Summary */}
        <div className="chart-card progress-summary">
          <h3>📈 Progress Summary</h3>
          <div className="summary-content">
            <div className="summary-item">
              <span className="summary-label">Total XP Earned:</span>
              <span className="summary-value">
                {filteredData.opportunities.reduce((sum, opp) => sum + opp.current_xp, 0)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Levels Gained:</span>
              <span className="summary-value">
                {filteredData.opportunities.reduce((sum, opp) => sum + (opp.current_level - 1), 0)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Most Active Area:</span>
              <span className="summary-value">
                {analyticsData.opportunities.length > 0 
                  ? [...analyticsData.opportunities].sort((a, b) => b.current_xp - a.current_xp)[0]?.title || 'N/A'
                  : 'N/A'
                }
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Excellence Rate:</span>
              <span className="summary-value">
                {analyticsData.events.length > 0 
                  ? Math.round((analyticsData.events.filter(e => e.choice_value >= 3).length / analyticsData.events.length) * 100) + '%'
                  : '0%'
                }
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Current Streak:</span>
              <span className="summary-value">
                {analyticsUtils.calculateStreak(analyticsData.events).current} days
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Longest Streak:</span>
              <span className="summary-value">
                {analyticsUtils.calculateStreak(analyticsData.events).longest} days
              </span>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        {/* Active View Indicator */}
        <div style={{ 
          padding: '12px 20px', 
          backgroundColor: 'var(--card-bg)', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '2px solid var(--accent-color)',
          textAlign: 'center',
          fontWeight: 'bold',
          color: 'var(--accent-color)'
        }}>
          📊 Current View: {chartView.charAt(0).toUpperCase() + chartView.slice(1)} Mode
        </div>

        <div className="charts-grid">
          {/* Conditional Chart Rendering Based on View */}
          {chartView === 'overview' && (
            <>
              {/* XP Progress Bar Chart */}
              <div className="chart-card">
                <h3>🚀 XP Progress by Opportunity</h3>
                <div className="chart-wrapper">
                  <Bar data={getXPProgressChart()} options={chartOptions} />
                </div>
              </div>

              {/* Level Distribution */}
              <div className="chart-card">
                <h3>📊 Level Distribution</h3>
                <div className="chart-wrapper">
                  <Bar data={getOpportunityLevelsChart()} options={chartOptions} />
                </div>
              </div>

              {/* Choice Quality Distribution */}
              <div className="chart-card">
                <h3>🎯 Choice Quality Distribution</h3>
                <div className="chart-wrapper">
                  <Doughnut data={getChoiceQualityChart()} options={pieOptions} />
                </div>
              </div>

              {/* Activity by Day */}
              <div className="chart-card">
                <h3>📅 Activity by Day of Week</h3>
                <div className="chart-wrapper">
                  <Bar data={getActivityByDayChart()} options={chartOptions} />
                </div>
              </div>
            </>
          )}

          {chartView === 'detailed' && (
            <>
              {/* Radar Chart for Opportunities */}
              <div className="chart-card">
                <h3>🎯 Opportunity Levels Radar</h3>
                <div className="chart-wrapper">
                  <Radar data={getOpportunityRadarChart()} options={radarOptions} />
                </div>
              </div>

              {/* Monthly Progress Chart */}
              <div className="chart-card wide">
                <h3>📈 Monthly Progress Trend</h3>
                <div className="chart-wrapper">
                  <Bar data={getMonthlyProgressChart()} options={dualAxisOptions} />
                </div>
              </div>

              {/* XP Trend Chart */}
              <div className="chart-card wide">
                <h3>📈 XP Trend Analysis</h3>
                <div className="chart-wrapper">
                  <Bar data={getXPTrendChart()} options={chartOptions} />
                </div>
              </div>

              {/* Situation Breakdown */}
              <div className="chart-card">
                <h3>🌐 Situation Breakdown</h3>
                <div className="chart-wrapper">
                  <PolarArea data={getSituationBreakdownChart()} options={pieOptions} />
                </div>
              </div>
            </>
          )}

          {chartView === 'comparison' && (
            <>
              {/* Events Timeline */}
              <div className="chart-card wide">
                <h3>📅 Events Timeline</h3>
                <div className="chart-wrapper">
                  <Line data={getEventsTimelineChart()} options={chartOptions} />
                </div>
              </div>

              {/* Top Opportunities */}
              <div className="chart-card">
                <h3>🏆 Top Performing Opportunities</h3>
                <div className="chart-wrapper">
                  <Pie data={getTopOpportunitiesChart()} options={pieOptions} />
                </div>
              </div>

              {/* Performance Metrics Comparison */}
              <div className="chart-card wide">
                <h3>📊 Performance Metrics</h3>
                <div className="metrics-comparison">
                  <div className="metric-item">
                    <span className="metric-label">Excellence Rate:</span>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ 
                          width: `${analyticsUtils.getPerformanceMetrics(filteredData.events).excellenceRate}%`,
                          backgroundColor: colors.success 
                        }}
                      ></div>
                      <span className="metric-value">
                        {analyticsUtils.getPerformanceMetrics(filteredData.events).excellenceRate}%
                      </span>
                    </div>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Improvement Rate:</span>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ 
                          width: `${analyticsUtils.getPerformanceMetrics(filteredData.events).improvementRate}%`,
                          backgroundColor: colors.primary 
                        }}
                      ></div>
                      <span className="metric-value">
                        {analyticsUtils.getPerformanceMetrics(filteredData.events).improvementRate}%
                      </span>
                    </div>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Consistency Score:</span>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ 
                          width: `${analyticsUtils.getPerformanceMetrics(filteredData.events).consistencyScore}%`,
                          backgroundColor: colors.info 
                        }}
                      ></div>
                      <span className="metric-value">
                        {analyticsUtils.getPerformanceMetrics(filteredData.events).consistencyScore}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Comparison Charts */}
              <div className="chart-card">
                <h3>📊 Level Distribution</h3>
                <div className="chart-wrapper">
                  <Bar data={getOpportunityLevelsChart()} options={chartOptions} />
                </div>
              </div>

              <div className="chart-card">
                <h3>🎯 Choice Quality Distribution</h3>
                <div className="chart-wrapper">
                  <Doughnut data={getChoiceQualityChart()} options={pieOptions} />
                </div>
              </div>
            </>
          )}

          {/* Progress Summary - Always visible */}
          <div className="chart-card progress-summary">
            <h3>📈 Progress Summary</h3>
            <div className="summary-content">
              <div className="summary-item">
                <span className="summary-label">Total XP Earned:</span>
                <span className="summary-value">
                  {filteredData.opportunities.reduce((sum, opp) => sum + opp.current_xp, 0)}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Levels Gained:</span>
                <span className="summary-value">
                  {filteredData.opportunities.reduce((sum, opp) => sum + (opp.current_level - 1), 0)}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Most Active Area:</span>
                <span className="summary-value">
                  {filteredData.opportunities.length > 0 
                    ? [...filteredData.opportunities].sort((a, b) => b.current_xp - a.current_xp)[0]?.title || 'N/A'
                    : 'N/A'
                  }
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Excellence Rate:</span>
                <span className="summary-value">
                  {filteredData.events.length > 0 
                    ? Math.round((filteredData.events.filter(e => e.choice_value >= 3).length / filteredData.events.length) * 100) + '%'
                    : '0%'
                  }
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Current Streak:</span>
                <span className="summary-value">
                  {analyticsUtils.calculateStreak(filteredData.events).current} days
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Longest Streak:</span>
                <span className="summary-value">
                  {analyticsUtils.calculateStreak(filteredData.events).longest} days
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;