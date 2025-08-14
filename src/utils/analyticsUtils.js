// Utility functions for analytics calculations

export const analyticsUtils = {
  // Calculate XP growth rate over time
  calculateGrowthRate(events, days = 30) {
    if (events.length < 2) return 0;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentEvents = events.filter(event => new Date(event.timestamp) >= cutoffDate);
    
    if (recentEvents.length === 0) return 0;
    
    const totalXpChange = recentEvents.reduce((sum, event) => sum + (event.xp_change || 0), 0);
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
  calculateImprovementTrend(opportunities) {
    if (opportunities.length === 0) return 'stable';
    
    const totalProgress = opportunities.reduce((sum, opp) => 
      sum + (opp.current_level * 100 + opp.current_xp), 0);
    const avgProgress = totalProgress / opportunities.length;
    
    // Simple trend calculation based on current levels
    const highLevelOpps = opportunities.filter(opp => opp.current_level >= 3).length;
    const lowLevelOpps = opportunities.filter(opp => opp.current_level === 1).length;
    
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
  getPerformanceMetrics(events) {
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
    const positiveXpEvents = events.filter(e => e.xp_change > 0).length;
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
  generateInsights(opportunities, events) {
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
    const metrics = this.getPerformanceMetrics(events);
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
    const growthRate = this.calculateGrowthRate(events);
    if (growthRate > 1) {
      insights.push({
        type: 'growth',
        message: `📈 Great progress! You're gaining ${Math.round(growthRate * 10) / 10} XP per day on average.`,
        priority: 'medium'
      });
    }
    
    // Opportunity insights
    const topOpportunity = opportunities
      .sort((a, b) => (b.current_level * 100 + b.current_xp) - (a.current_level * 100 + a.current_xp))[0];
    if (topOpportunity && topOpportunity.current_level > 1) {
      insights.push({
        type: 'achievement',
        message: `🏆 ${topOpportunity.title} is your strongest area at level ${topOpportunity.current_level}!`,
        priority: 'low'
      });
    }
    
    return insights.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
};