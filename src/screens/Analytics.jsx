import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { dbHelpers } from '../database/db';
import { useTheme } from '../hooks/useTheme';
import { analyticsUtils } from '../utils/analyticsUtils';
import './Analytics.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function Analytics() {
  const { theme } = useTheme();
  const [analyticsData, setAnalyticsData] = useState({
    opportunities: [],
    events: [],
    stats: null
  });
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all'); // all, 30days, 7days

  useEffect(() => {
    loadAnalyticsData();
  }, [timeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const [opportunities, events, stats] = await Promise.all([
        dbHelpers.getOpportunitiesSorted('level'),
        dbHelpers.getEventsWithDetails(),
        dbHelpers.getDataStats()
      ]);

      // Filter events by time if needed
      let filteredEvents = events;
      if (timeFilter !== 'all') {
        const daysAgo = timeFilter === '30days' ? 30 : 7;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        filteredEvents = events.filter(event => new Date(event.timestamp) >= cutoffDate);
      }

      setAnalyticsData({
        opportunities,
        events: filteredEvents,
        stats
      });
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
    analyticsData.opportunities.forEach(opp => {
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
      labels: analyticsData.opportunities.map(opp => opp.title),
      datasets: [{
        label: 'Current XP',
        data: analyticsData.opportunities.map(opp => opp.current_xp),
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
    analyticsData.events.forEach(event => {
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
    analyticsData.events.forEach(event => {
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
    const topOpps = [...analyticsData.opportunities]
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
    
    analyticsData.events.forEach(event => {
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
        <div className="time-filter">
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Time</option>
            <option value="30days">Last 30 Days</option>
            <option value="7days">Last 7 Days</option>
          </select>
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
            <h3>{analyticsData.events.length}</h3>
            <p>Events Logged</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <h3>
              {analyticsData.opportunities.length > 0 
                ? Math.round(analyticsData.opportunities.reduce((sum, opp) => sum + opp.current_level, 0) / analyticsData.opportunities.length * 10) / 10
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
              {analyticsUtils.calculateStreak(analyticsData.events).current}
            </h3>
            <p>Day Streak</p>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="insights-section">
        <h3>💡 Insights & Recommendations</h3>
        <div className="insights-grid">
          {analyticsUtils.generateInsights(analyticsData.opportunities, analyticsData.events).map((insight, index) => (
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
                {analyticsData.opportunities.reduce((sum, opp) => sum + opp.current_xp, 0)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Levels Gained:</span>
              <span className="summary-value">
                {analyticsData.opportunities.reduce((sum, opp) => sum + (opp.current_level - 1), 0)}
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
      </div>
    </div>
  );
}

export default Analytics;