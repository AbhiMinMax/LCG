// Utility functions for analytics calculations

import { getPathLevel, getRebirthInfo, MAX_LEVEL } from './pathUtils';

// ─── Progress accessors ───────────────────────────────────────────────────────
// Two XP systems coexist in the database. Classic mode stores a position on a
// flat 100-XP-per-level ladder in current_xp/current_level. Game mode stores
// lifetime game_xp and derives level, bar position and rebirth stars from the
// path curve in pathUtils; its current_xp/current_level columns are still
// written but describe the *other* system and must not be shown in game mode.
//
// Analytics is the one screen that has to read opportunities and events under
// either system, so every level/XP figure there goes through an accessor below
// instead of touching a column directly. Each takes the gameMode flag the
// screen already loads from config.

const CLASSIC_XP_PER_LEVEL = 100;

// Level as the rest of the app displays it. In game mode that is the level
// WITHIN the current rebirth cycle — matching the Lv.N on the progress screen —
// so an opportunity that has rebirthed reads as a low level again, by design.
export function oppLevel(opp, gameMode) {
  if (gameMode) return getPathLevel(opp.game_xp || 0, opp.path || 'default').level;
  return opp.current_level || 1;
}

// XP banked inside the current level: the progress bar's numerator.
export function oppXpIntoLevel(opp, gameMode) {
  if (gameMode) return getPathLevel(opp.game_xp || 0, opp.path || 'default').xpIntoLevel;
  return opp.current_xp || 0;
}

// Lifetime XP, including everything spent on levels already completed and, in
// game mode, on completed rebirth cycles. Use for totals and for ranking.
export function oppTotalXp(opp, gameMode) {
  if (gameMode) return opp.game_xp || 0;
  return ((opp.current_level || 1) - 1) * CLASSIC_XP_PER_LEVEL + (opp.current_xp || 0);
}

// Levels earned since level 1, counting every completed cycle in game mode.
export function oppLevelsGained(opp, gameMode) {
  if (gameMode) {
    const { rebirths } = getRebirthInfo(opp.game_xp || 0);
    return rebirths * MAX_LEVEL + (oppLevel(opp, true) - 1);
  }
  return (opp.current_level || 1) - 1;
}

// An event's XP delta in whichever system is active. Events logged before game
// mode existed have no game_xp_change, so fall back to xp_change for those —
// the same rule CheckHistory uses when listing them.
export function eventXp(event, gameMode) {
  if (gameMode && event.game_xp_change != null) return event.game_xp_change;
  return event.xp_change || 0;
}

export const analyticsUtils = {
  // Calculate XP growth rate over time
  calculateGrowthRate(events, days = 30, gameMode = false) {
    if (events.length < 2) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentEvents = events.filter(event => new Date(event.timestamp) >= cutoffDate);

    if (recentEvents.length === 0) return 0;

    const totalXpChange = recentEvents.reduce((sum, event) => sum + eventXp(event, gameMode), 0);
    return totalXpChange / days;
  },

  // Get streak information
  calculateStreak(events) {
    if (events.length === 0) return { current: 0, longest: 0 };
    
    const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const today = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    let currentStreak = 0;
    let longestStreak = 0;
    let currentStreakCount = 0;
    let maxStreakCount = 0;
    
    // Group events by date
    const eventsByDate = {};
    sortedEvents.forEach(event => {
      const date = new Date(event.timestamp).toDateString();
      if (!eventsByDate[date]) {
        eventsByDate[date] = [];
      }
      eventsByDate[date].push(event);
    });
    
    const uniqueDates = Object.keys(eventsByDate).sort((a, b) => new Date(b) - new Date(a));
    
    // Calculate current streak
    for (let i = 0; i < uniqueDates.length; i++) {
      const eventDate = new Date(uniqueDates[i]);
      const daysDiff = Math.floor((today - eventDate) / oneDayMs);
      
      if (i === 0 && daysDiff <= 1) {
        currentStreakCount = 1;
      } else if (i > 0) {
        const prevDate = new Date(uniqueDates[i - 1]);
        const daysBetween = Math.floor((prevDate - eventDate) / oneDayMs);
        
        if (daysBetween === 1) {
          currentStreakCount++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    // Calculate longest streak
    let tempStreak = 0;
    for (let i = 0; i < uniqueDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        const daysBetween = Math.floor((prevDate - currentDate) / oneDayMs);
        
        if (daysBetween === 1) {
          tempStreak++;
        } else {
          maxStreakCount = Math.max(maxStreakCount, tempStreak);
          tempStreak = 1;
        }
      }
    }
    maxStreakCount = Math.max(maxStreakCount, tempStreak);
    
    return {
      current: currentStreakCount,
      longest: maxStreakCount
    };
  },

  // Calculate improvement trends
  calculateImprovementTrend(opportunities, gameMode = false) {
    if (opportunities.length === 0) return 'stable';

    // Simple trend calculation based on current levels
    const highLevelOpps = opportunities.filter(opp => oppLevel(opp, gameMode) >= 3).length;
    const lowLevelOpps = opportunities.filter(opp => oppLevel(opp, gameMode) === 1).length;

    if (highLevelOpps > lowLevelOpps) return 'improving';
    if (lowLevelOpps > highLevelOpps) return 'declining';
    return 'stable';
  },

  // Get activity patterns
  getActivityPatterns(events) {
    const patterns = {
      hourlyDistribution: {},
      dayOfWeekDistribution: {},
      monthlyDistribution: {}
    };

    events.forEach(event => {
      const date = new Date(event.timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay(); // 0 = Sunday
      const month = date.getMonth(); // 0 = January

      patterns.hourlyDistribution[hour] = (patterns.hourlyDistribution[hour] || 0) + 1;
      patterns.dayOfWeekDistribution[dayOfWeek] = (patterns.dayOfWeekDistribution[dayOfWeek] || 0) + 1;
      patterns.monthlyDistribution[month] = (patterns.monthlyDistribution[month] || 0) + 1;
    });

    return patterns;
  },

  // Calculate performance metrics
  getPerformanceMetrics(events, gameMode = false) {
    if (events.length === 0) {
      return {
        averageChoiceValue: 0,
        excellenceRate: 0,
        improvementRate: 0,
        consistencyScore: 0
      };
    }

    const choiceValues = events.map(e => e.choice_value).filter(v => v !== null && v !== undefined);
    const averageChoiceValue = choiceValues.reduce((sum, val) => sum + val, 0) / choiceValues.length;
    
    const excellentChoices = events.filter(e => e.choice_value >= 3).length;
    const excellenceRate = (excellentChoices / events.length) * 100;
    
    // Calculate improvement rate (positive XP changes vs negative)
    const positiveXpEvents = events.filter(e => eventXp(e, gameMode) > 0).length;
    const improvementRate = (positiveXpEvents / events.length) * 100;
    
    // Calculate consistency score (how regularly events are logged)
    const eventDates = events.map(e => new Date(e.timestamp).toDateString());
    const uniqueDates = new Set(eventDates);
    const dayRange = events.length > 1 
      ? Math.ceil((new Date(Math.max(...events.map(e => new Date(e.timestamp)))) - 
                   new Date(Math.min(...events.map(e => new Date(e.timestamp))))) / (1000 * 60 * 60 * 24))
      : 1;
    const consistencyScore = Math.min((uniqueDates.size / dayRange) * 100, 100);

    return {
      averageChoiceValue: Math.round(averageChoiceValue * 10) / 10,
      excellenceRate: Math.round(excellenceRate * 10) / 10,
      improvementRate: Math.round(improvementRate * 10) / 10,
      consistencyScore: Math.round(consistencyScore * 10) / 10
    };
  },

  // Generate insights based on data
  generateInsights(opportunities, events, gameMode = false) {
    const insights = [];
    
    // Streak insights
    const streak = this.calculateStreak(events);
    if (streak.current > 0) {
      insights.push({
        type: 'streak',
        message: `🔥 You're on a ${streak.current}-day streak! Keep it up!`,
        priority: 'high'
      });
    }
    
    // Performance insights
    const metrics = this.getPerformanceMetrics(events, gameMode);
    if (metrics.excellenceRate > 75) {
      insights.push({
        type: 'performance',
        message: `⭐ Excellent! ${metrics.excellenceRate}% of your choices are high quality.`,
        priority: 'high'
      });
    } else if (metrics.excellenceRate < 50) {
      insights.push({
        type: 'improvement',
        message: `💡 Focus on making better choices. Currently at ${metrics.excellenceRate}% excellence rate.`,
        priority: 'medium'
      });
    }
    
    // Growth insights
    const growthRate = this.calculateGrowthRate(events, 30, gameMode);
    if (growthRate > 1) {
      insights.push({
        type: 'growth',
        message: `📈 Great progress! You're gaining ${Math.round(growthRate * 10) / 10} XP per day on average.`,
        priority: 'medium'
      });
    }
    
    // Opportunity insights
    // Copied before sorting — the caller's array is React state elsewhere.
    const topOpportunity = [...opportunities]
      .sort((a, b) => oppTotalXp(b, gameMode) - oppTotalXp(a, gameMode))[0];
    if (topOpportunity && oppLevelsGained(topOpportunity, gameMode) > 0) {
      insights.push({
        type: 'achievement',
        message: `🏆 ${topOpportunity.title} is your strongest area at level ${oppLevel(topOpportunity, gameMode)}!`,
        priority: 'low'
      });
    }
    
    return insights.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
};