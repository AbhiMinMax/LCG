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
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

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
  const [chartView, setChartView] = useState('overview'); // overview, detailed, comparison
  const [selectedMetric, setSelectedMetric] = useState('all');

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
      const [opportunities, events, stats, situations] = await Promise.all([
        dbHelpers.getOpportunitiesSorted('level'),
        dbHelpers.getEventsWithDetails(),
        dbHelpers.getDataStats(),
        dbHelpers.getSituationsWithOpportunities()
      ]);

      setAnalyticsData({
        opportunities,
        events,
        stats,
        situations
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
      </div>
    </div>
  );
}

export default Analytics;