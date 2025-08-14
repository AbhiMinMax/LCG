// Offline-first database using Dexie (IndexedDB wrapper)
import Dexie from 'dexie';

export class LifeProgressDB extends Dexie {
  constructor() {
    super('LifeProgressDB');
    
    this.version(1).stores({
      situations: '++id, title, description, tags, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, situation_id, event_description, choice_value, xp_change, timestamp, affected_opportunities'
    });

    // Version 2: Add title field to events
    this.version(2).stores({
      situations: '++id, title, description, tags, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, timestamp, affected_opportunities'
    }).upgrade(tx => {
      // Add title field to existing events based on choice value
      return tx.events.toCollection().modify(event => {
        if (!event.title) {
          const choiceLabels = {
            1: 'Misguided Response',
            2: 'Avoided Challenge', 
            3: 'Attempted Response',
            4: 'Excellent Response'
          };
          event.title = choiceLabels[event.choice_value] || 'Life Event';
        }
      });
    });
  }
}

// Create database instance
export const db = new LifeProgressDB();

// Database helper functions
export const dbHelpers = {
  // Initialize with sample data
  async initializeSampleData() {
    const situationCount = await db.situations.count();
    if (situationCount > 0) return; // Already initialized

    // Sample situations
    const situations = [
      {
        title: "Work Meeting Conflict",
        description: "A disagreement arose during an important team meeting",
        tags: ["work", "conflict", "team"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Health Challenge",
        description: "Faced with a decision about diet, exercise, or wellness",
        tags: ["health", "wellness", "personal"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Relationship Communication",
        description: "A communication challenge with family, friend, or partner",
        tags: ["relationships", "communication", "personal"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Learning Opportunity",
        description: "Encountered a chance to learn something new or challenging",
        tags: ["learning", "growth", "education"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Financial Decision",
        description: "Had to make an important financial choice or investment",
        tags: ["finance", "money", "planning"],
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    // Sample opportunities
    const opportunities = [
      {
        title: "Leadership",
        description: "Ability to guide and inspire others effectively",
        tags: ["leadership", "management", "soft-skills"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Communication",
        description: "Clear and effective verbal and written communication",
        tags: ["communication", "soft-skills", "interpersonal"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Health & Wellness",
        description: "Physical and mental health maintenance and improvement",
        tags: ["health", "fitness", "mental-health"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Continuous Learning",
        description: "Commitment to ongoing personal and professional development",
        tags: ["learning", "growth", "education"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Financial Intelligence",
        description: "Smart money management and financial planning skills",
        tags: ["finance", "planning", "money-management"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Problem Solving",
        description: "Creative and analytical approach to challenges",
        tags: ["problem-solving", "creativity", "analytical"],
        current_xp: 0,
        current_level: 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    // Insert sample data
    const situationIds = await db.situations.bulkAdd(situations, { allKeys: true });
    const opportunityIds = await db.opportunities.bulkAdd(opportunities, { allKeys: true });

    // Create sample links between situations and opportunities
    const links = [
      // Work Meeting Conflict -> Leadership, Communication, Problem Solving
      { situation_id: situationIds[0], opportunity_id: opportunityIds[0] },
      { situation_id: situationIds[0], opportunity_id: opportunityIds[1] },
      { situation_id: situationIds[0], opportunity_id: opportunityIds[5] },
      
      // Health Challenge -> Health & Wellness, Problem Solving
      { situation_id: situationIds[1], opportunity_id: opportunityIds[2] },
      { situation_id: situationIds[1], opportunity_id: opportunityIds[5] },
      
      // Relationship Communication -> Communication, Leadership
      { situation_id: situationIds[2], opportunity_id: opportunityIds[1] },
      { situation_id: situationIds[2], opportunity_id: opportunityIds[0] },
      
      // Learning Opportunity -> Continuous Learning, Problem Solving
      { situation_id: situationIds[3], opportunity_id: opportunityIds[3] },
      { situation_id: situationIds[3], opportunity_id: opportunityIds[5] },
      
      // Financial Decision -> Financial Intelligence, Problem Solving
      { situation_id: situationIds[4], opportunity_id: opportunityIds[4] },
      { situation_id: situationIds[4], opportunity_id: opportunityIds[5] }
    ];

    await db.situation_opportunities.bulkAdd(links);
  },

  // Get all situations with linked opportunities
  async getSituationsWithOpportunities() {
    const situations = await db.situations.toArray();
    const result = [];

    for (const situation of situations) {
      const links = await db.situation_opportunities
        .where('situation_id')
        .equals(situation.id)
        .toArray();
      
      const opportunityIds = links.map(link => link.opportunity_id);
      const opportunities = await db.opportunities
        .where('id')
        .anyOf(opportunityIds)
        .toArray();

      result.push({
        ...situation,
        opportunities
      });
    }

    return result;
  },

  // Get opportunities linked to a specific situation
  async getOpportunitiesForSituation(situationId) {
    const links = await db.situation_opportunities
      .where('situation_id')
      .equals(situationId)
      .toArray();
    
    const opportunityIds = links.map(link => link.opportunity_id);
    return await db.opportunities
      .where('id')
      .anyOf(opportunityIds)
      .toArray();
  },

  // XP and Level calculation
  calculateXpChange(choiceValue) {
    const xpMap = {
      1: -5, // Poor response
      2: -2, // Below average
      3: 2,  // Good response
      4: 5   // Excellent response
    };
    return xpMap[choiceValue] || 0;
  },

  // Update opportunity XP and handle level progression
  async updateOpportunityXp(opportunityId, xpChange) {
    const opportunity = await db.opportunities.get(opportunityId);
    if (!opportunity) return null;

    let newXp = opportunity.current_xp + xpChange;
    let newLevel = opportunity.current_level;

    // Handle negative XP (cannot go below 0)
    if (newXp < 0) {
      newXp = 0;
    }

    // Handle level progression (XP >= 100)
    while (newXp >= 100) {
      newLevel++;
      newXp -= 100;
    }

    const updatedOpportunity = {
      ...opportunity,
      current_xp: newXp,
      current_level: newLevel,
      updated_at: new Date()
    };

    await db.opportunities.update(opportunityId, updatedOpportunity);
    return updatedOpportunity;
  },

  // Add new event and update all linked opportunities
  async addEvent(situationId, eventDescription, choiceValue, eventTitle = null) {
    const xpChange = this.calculateXpChange(choiceValue);
    const opportunities = await this.getOpportunitiesForSituation(situationId);
    const affectedOpportunityIds = opportunities.map(opp => opp.id);

    // Generate title if not provided
    const choiceLabels = {
      1: 'Misguided Response',
      2: 'Avoided Challenge', 
      3: 'Attempted Response',
      4: 'Excellent Response'
    };
    const title = eventTitle || choiceLabels[choiceValue] || 'Life Event';

    // Create event record
    const eventId = await db.events.add({
      title,
      situation_id: situationId,
      event_description: eventDescription,
      choice_value: choiceValue,
      xp_change: xpChange,
      timestamp: new Date(),
      affected_opportunities: affectedOpportunityIds
    });

    // Update all linked opportunities
    const updatedOpportunities = [];
    for (const opportunity of opportunities) {
      const updated = await this.updateOpportunityXp(opportunity.id, xpChange);
      if (updated) updatedOpportunities.push(updated);
    }

    return {
      eventId,
      xpChange,
      updatedOpportunities
    };
  },

  // Get events with situation details (for history)
  async getEventsWithDetails() {
    const events = await db.events.orderBy('timestamp').reverse().toArray();
    const result = [];

    for (const event of events) {
      const situation = await db.situations.get(event.situation_id);
      result.push({
        ...event,
        situation
      });
    }

    return result;
  },

  // Get all opportunities sorted by different criteria
  async getOpportunitiesSorted(sortBy = 'alphabetical') {
    let opportunities = await db.opportunities.toArray();

    switch (sortBy) {
      case 'alphabetical':
        opportunities.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'xp_percentage':
        opportunities.sort((a, b) => b.current_xp - a.current_xp);
        break;
      case 'level':
        opportunities.sort((a, b) => {
          if (b.current_level !== a.current_level) {
            return b.current_level - a.current_level;
          }
          return b.current_xp - a.current_xp;
        });
        break;
    }

    return opportunities;
  },

  // Get all unique tags from situations
  async getAllSituationTags() {
    const situations = await db.situations.toArray();
    const allTags = situations
      .filter(s => s.tags && Array.isArray(s.tags))
      .flatMap(s => s.tags);
    return [...new Set(allTags)].sort();
  },

  // Get all unique tags from opportunities
  async getAllOpportunityTags() {
    const opportunities = await db.opportunities.toArray();
    const allTags = opportunities
      .filter(o => o.tags && Array.isArray(o.tags))
      .flatMap(o => o.tags);
    return [...new Set(allTags)].sort();
  },

  // Filter situations by tags
  async getSituationsByTags(tags) {
    if (!tags || tags.length === 0) {
      return await db.situations.toArray();
    }
    
    const situations = await db.situations.toArray();
    return situations.filter(situation => 
      situation.tags && 
      Array.isArray(situation.tags) &&
      tags.some(tag => situation.tags.includes(tag))
    );
  },

  // Filter opportunities by tags
  async getOpportunitiesByTags(tags) {
    if (!tags || tags.length === 0) {
      return await db.opportunities.toArray();
    }
    
    const opportunities = await db.opportunities.toArray();
    return opportunities.filter(opportunity => 
      opportunity.tags && 
      Array.isArray(opportunity.tags) &&
      tags.some(tag => opportunity.tags.includes(tag))
    );
  },

  // Create a new situation
  async createSituation(title, description, tags = []) {
    const situation = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const id = await db.situations.add(situation);
    return { ...situation, id };
  },

  // Update an existing situation
  async updateSituation(id, title, description, tags = []) {
    const updates = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      updated_at: new Date()
    };
    
    await db.situations.update(id, updates);
    return await db.situations.get(id);
  },

  // Create a new opportunity
  async createOpportunity(title, description, tags = [], initialLevel = 1) {
    const level = Math.max(1, Math.min(100, parseInt(initialLevel) || 1));
    const opportunity = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      current_xp: 0,
      current_level: level,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const id = await db.opportunities.add(opportunity);
    return { ...opportunity, id };
  },

  // Update an existing opportunity
  async updateOpportunity(id, title, description, tags = [], newLevel = null) {
    const updates = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      updated_at: new Date()
    };
    
    // If newLevel is provided, update the current level
    if (newLevel !== null) {
      const level = Math.max(1, Math.min(100, parseInt(newLevel) || 1));
      updates.current_level = level;
    }
    
    await db.opportunities.update(id, updates);
    return await db.opportunities.get(id);
  },

  // Delete a situation and its links
  async deleteSituation(id) {
    await db.situation_opportunities.where('situation_id').equals(id).delete();
    await db.events.where('situation_id').equals(id).delete();
    await db.situations.delete(id);
  },

  // Delete an opportunity and its links
  async deleteOpportunity(id) {
    await db.situation_opportunities.where('opportunity_id').equals(id).delete();
    await db.opportunities.delete(id);
  },

  // Link a situation to opportunities
  async linkSituationToOpportunities(situationId, opportunityIds) {
    // Remove existing links
    await db.situation_opportunities.where('situation_id').equals(situationId).delete();
    
    // Add new links
    const links = opportunityIds.map(opportunityId => ({
      situation_id: situationId,
      opportunity_id: opportunityId
    }));
    
    if (links.length > 0) {
      await db.situation_opportunities.bulkAdd(links);
    }
  },

  // Export all data as JSON
  async exportAllData() {
    try {
      const [situations, opportunities, situationOpportunities, events] = await Promise.all([
        db.situations.toArray(),
        db.opportunities.toArray(),
        db.situation_opportunities.toArray(),
        db.events.toArray()
      ]);

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        data: {
          situations,
          opportunities,
          situation_opportunities: situationOpportunities,
          events
        }
      };

      return exportData;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  },

  // Import data from JSON
  async importAllData(importData) {
    try {
      // Validate import data structure
      if (!importData || !importData.data) {
        throw new Error('Invalid import data format');
      }

      const { situations, opportunities, situation_opportunities, events } = importData.data;

      // Clear existing data
      await Promise.all([
        db.events.clear(),
        db.situation_opportunities.clear(),
        db.opportunities.clear(),
        db.situations.clear()
      ]);

      // Import data in correct order to maintain relationships
      if (situations && situations.length > 0) {
        await db.situations.bulkAdd(situations);
      }
      
      if (opportunities && opportunities.length > 0) {
        await db.opportunities.bulkAdd(opportunities);
      }
      
      if (situation_opportunities && situation_opportunities.length > 0) {
        await db.situation_opportunities.bulkAdd(situation_opportunities);
      }
      
      if (events && events.length > 0) {
        await db.events.bulkAdd(events);
      }

      return {
        situationsCount: situations?.length || 0,
        opportunitiesCount: opportunities?.length || 0,
        linksCount: situation_opportunities?.length || 0,
        eventsCount: events?.length || 0
      };
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  },

  // Get data statistics for export confirmation
  async getDataStats() {
    try {
      const [situationCount, opportunityCount, linkCount, eventCount] = await Promise.all([
        db.situations.count(),
        db.opportunities.count(),
        db.situation_opportunities.count(),
        db.events.count()
      ]);

      return {
        situations: situationCount,
        opportunities: opportunityCount,
        links: linkCount,
        events: eventCount
      };
    } catch (error) {
      console.error('Error getting data stats:', error);
      throw error;
    }
  }
};

// Initialize database when imported
dbHelpers.initializeSampleData().catch(console.error);