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

    // Version 3: Add challenging_level, back_thoughts, forth_thoughts to situations and selected_back_thought, selected_forth_thought to events
    this.version(3).stores({
      situations: '++id, title, description, tags, challenging_level, back_thoughts, forth_thoughts, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value'
    }).upgrade(tx => {
      // Add default challenging_level and thought arrays to existing situations
      return tx.situations.toCollection().modify(situation => {
        if (situation.challenging_level === undefined) {
          situation.challenging_level = 3; // Default medium challenging level
        }
        if (!situation.back_thoughts) {
          situation.back_thoughts = [];
        }
        if (!situation.forth_thoughts) {
          situation.forth_thoughts = [];
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
    await this.ensureDefaultData();
  },

  // Ensure we always have basic default situations and opportunities
  async ensureDefaultData() {
    const [situationCount, opportunityCount] = await Promise.all([
      db.situations.count(),
      db.opportunities.count()
    ]);
    
    // If no data exists, create full sample data
    if (situationCount === 0 && opportunityCount === 0) {
      await this.createInitialSampleData();
      return;
    }
    
    // Ensure we have at least basic default situations
    await this.ensureDefaultSituations();
    
    // Ensure we have at least basic default opportunities
    await this.ensureDefaultOpportunities();
  },

  // Create comprehensive initial sample data
  async createInitialSampleData() {

    // Sample situations
    const situations = [
      {
        title: "Work Meeting Conflict",
        description: "A disagreement arose during an important team meeting",
        tags: ["work", "conflict", "team"],
        challenging_level: 4,
        back_thoughts: ["Just stay quiet and avoid confrontation", "This will only make things worse and people will dislike me"],
        forth_thoughts: ["Speaking up professionally shows leadership and integrity", "Constructive dialogue leads to better solutions for everyone"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Health Challenge",
        description: "Faced with a decision about diet, exercise, or wellness",
        tags: ["health", "wellness", "personal"],
        challenging_level: 3,
        back_thoughts: ["It's too much work to change my habits now", "I don't have time for this and it won't make a difference anyway"],
        forth_thoughts: ["Small consistent steps create lasting change over time", "Investing in my health now pays dividends for my entire future"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Relationship Communication",
        description: "A communication challenge with family, friend, or partner",
        tags: ["relationships", "communication", "personal"],
        challenging_level: 5,
        back_thoughts: ["Avoiding this conversation will keep the peace", "They won't understand my perspective anyway, so why try"],
        forth_thoughts: ["Honest communication, even when difficult, strengthens relationships", "I can express my perspective with empathy and create mutual understanding"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Learning Opportunity",
        description: "Encountered a chance to learn something new or challenging",
        tags: ["learning", "growth", "education"],
        challenging_level: 2,
        back_thoughts: ["I'm not smart enough", "This is too complicated"],
        forth_thoughts: ["Every expert was once a beginner", "Growth happens outside comfort zone"],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Financial Decision",
        description: "Had to make an important financial choice or investment",
        tags: ["finance", "money", "planning"],
        challenging_level: 4,
        back_thoughts: ["Play it safe", "What if I lose money?"],
        forth_thoughts: ["Calculated risks lead to growth", "Research and make informed decisions"],
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

  // Ensure we always have essential default situations
  async ensureDefaultSituations() {
    const existingSituations = await db.situations.toArray();
    const defaultSituationTitles = [
      "Daily Challenge",
      "Social Interaction", 
      "Learning Opportunity",
      "Health Decision"
    ];
    
    const missingDefaults = defaultSituationTitles.filter(title => 
      !existingSituations.some(s => s.title === title)
    );
    
    if (missingDefaults.length > 0) {
      const defaultSituations = [];
      
      for (const title of missingDefaults) {
        let situationData;
        
        switch (title) {
          case "Daily Challenge":
            situationData = {
              title,
              description: "An everyday situation that tests your character and decision-making",
              tags: ["daily", "general", "personal"],
              challenging_level: 3,
              back_thoughts: ["This daily task isn't really important", "I can just deal with it later when I feel like it"],
              forth_thoughts: ["Small daily actions build the foundation of strong character", "How I handle small challenges shapes how I'll handle big ones"],
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Social Interaction":
            situationData = {
              title,
              description: "Interactions with family, friends, colleagues, or strangers",
              tags: ["social", "relationships", "communication"],
              challenging_level: 3,
              back_thoughts: ["I should avoid any awkwardness and keep this brief", "They probably don't want to talk to me anyway"],
              forth_thoughts: ["Authentic connections create meaningful relationships", "Showing genuine interest in others enriches both our lives"],
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Learning Opportunity":
            situationData = {
              title,
              description: "Chances to acquire new knowledge, skills, or experiences",
              tags: ["learning", "growth", "education"],
              challenging_level: 2,
              back_thoughts: ["I'm too busy", "I already know enough"],
              forth_thoughts: ["Growth requires learning", "Knowledge is power"],
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Health Decision":
            situationData = {
              title,
              description: "Choices related to physical and mental well-being",
              tags: ["health", "wellness", "self-care"],
              challenging_level: 3,
              back_thoughts: ["One time won't hurt", "I'll start tomorrow"],
              forth_thoughts: ["Health is wealth", "Consistency creates results"],
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
        }
        
        if (situationData) {
          defaultSituations.push(situationData);
        }
      }
      
      if (defaultSituations.length > 0) {
        await db.situations.bulkAdd(defaultSituations);
      }
    }
  },

  // Ensure we always have essential default opportunities
  async ensureDefaultOpportunities() {
    const existingOpportunities = await db.opportunities.toArray();
    const defaultOpportunityTitles = [
      "Personal Growth",
      "Communication",
      "Self-Discipline",
      "Problem Solving"
    ];
    
    const missingDefaults = defaultOpportunityTitles.filter(title => 
      !existingOpportunities.some(o => o.title === title)
    );
    
    if (missingDefaults.length > 0) {
      const defaultOpportunities = [];
      
      for (const title of missingDefaults) {
        let opportunityData;
        
        switch (title) {
          case "Personal Growth":
            opportunityData = {
              title,
              description: "Developing self-awareness, emotional intelligence, and character",
              tags: ["growth", "self-awareness", "character"],
              current_xp: 0,
              current_level: 1,
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Communication":
            opportunityData = {
              title,
              description: "Effective verbal and non-verbal expression with others",
              tags: ["communication", "interpersonal", "social"],
              current_xp: 0,
              current_level: 1,
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Self-Discipline":
            opportunityData = {
              title,
              description: "The ability to control impulses and maintain consistent beneficial habits",
              tags: ["discipline", "habits", "willpower"],
              current_xp: 0,
              current_level: 1,
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
            
          case "Problem Solving":
            opportunityData = {
              title,
              description: "Analytical thinking and creative solutions to challenges",
              tags: ["problem-solving", "analytical", "creativity"],
              current_xp: 0,
              current_level: 1,
              created_at: new Date(),
              updated_at: new Date()
            };
            break;
        }
        
        if (opportunityData) {
          defaultOpportunities.push(opportunityData);
        }
      }
      
      if (defaultOpportunities.length > 0) {
        await db.opportunities.bulkAdd(defaultOpportunities);
        
        // Link default situations to default opportunities
        await this.linkDefaultSituationsToOpportunities();
      }
    }
  },

  // Create links between default situations and opportunities
  async linkDefaultSituationsToOpportunities() {
    const situations = await db.situations.toArray();
    const opportunities = await db.opportunities.toArray();
    
    const links = [];
    
    // Link each default situation to relevant default opportunities
    const situationOpportunityMap = {
      "Daily Challenge": ["Personal Growth", "Self-Discipline"],
      "Social Interaction": ["Communication", "Personal Growth"],
      "Learning Opportunity": ["Personal Growth", "Problem Solving"],
      "Health Decision": ["Self-Discipline", "Personal Growth"]
    };
    
    for (const [situationTitle, opportunityTitles] of Object.entries(situationOpportunityMap)) {
      const situation = situations.find(s => s.title === situationTitle);
      
      if (situation) {
        for (const oppTitle of opportunityTitles) {
          const opportunity = opportunities.find(o => o.title === oppTitle);
          
          if (opportunity) {
            // Check if link already exists
            const existingLink = await db.situation_opportunities
              .where('[situation_id+opportunity_id]')
              .equals([situation.id, opportunity.id])
              .first();
              
            if (!existingLink) {
              links.push({
                situation_id: situation.id,
                opportunity_id: opportunity.id
              });
            }
          }
        }
      }
    }
    
    if (links.length > 0) {
      await db.situation_opportunities.bulkAdd(links);
    }
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
  calculateXpChange(choiceValue, challengingLevel = 3, isDynamicXp = false) {
    const baseXpMap = {
      1: -5, // Poor response
      2: -2, // Below average
      3: 2,  // Good response
      4: 5   // Excellent response
    };
    
    let xp = baseXpMap[choiceValue] || 0;
    
    if (isDynamicXp && challengingLevel) {
      // Apply challenging level multiplier (1-5 scale)
      const multiplier = challengingLevel / 3; // Base level 3 = 1x multiplier
      xp = Math.round(xp * multiplier);
    }
    
    return xp;
  },

  // Get configuration value
  async getConfig(key, defaultValue = null) {
    try {
      const config = await db.config.where('key').equals(key).first();
      return config ? JSON.parse(config.value) : defaultValue;
    } catch (error) {
      console.error('Error getting config:', error);
      return defaultValue;
    }
  },

  // Set configuration value
  async setConfig(key, value) {
    try {
      const existing = await db.config.where('key').equals(key).first();
      const configData = {
        key,
        value: JSON.stringify(value)
      };
      
      if (existing) {
        await db.config.update(existing.id, configData);
      } else {
        await db.config.add(configData);
      }
      
      return true;
    } catch (error) {
      console.error('Error setting config:', error);
      return false;
    }
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
  async addEvent(situationId, eventDescription, choiceValue, eventTitle = null, selectedBackThought = null, selectedForthThought = null) {
    // Get situation details for challenging level
    const situation = await db.situations.get(situationId);
    const challengingLevel = situation ? situation.challenging_level : 3;
    
    // Check if dynamic XP is enabled
    const isDynamicXp = await this.getConfig('dynamicXpEnabled', false);
    
    const xpChange = this.calculateXpChange(choiceValue, challengingLevel, isDynamicXp);
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
      selected_back_thought: selectedBackThought,
      selected_forth_thought: selectedForthThought,
      timestamp: new Date(),
      affected_opportunities: affectedOpportunityIds
    });

    // Update situation challenging level based on choice (auto-adjust feature)
    if (situation && isDynamicXp) {
      let newChallengingLevel = situation.challenging_level;
      
      // Increase challenging level on excellent responses, decrease on poor responses
      if (choiceValue >= 4) {
        newChallengingLevel = Math.min(5, newChallengingLevel + 0.1);
      } else if (choiceValue <= 2) {
        newChallengingLevel = Math.max(1, newChallengingLevel - 0.1);
      }
      
      // Only update if there's a significant change
      if (Math.abs(newChallengingLevel - situation.challenging_level) >= 0.1) {
        await db.situations.update(situationId, {
          challenging_level: Math.round(newChallengingLevel * 10) / 10,
          updated_at: new Date()
        });
      }
    }

    // Update all linked opportunities
    const updatedOpportunities = [];
    for (const opportunity of opportunities) {
      const updated = await this.updateOpportunityXp(opportunity.id, xpChange);
      if (updated) updatedOpportunities.push(updated);
    }

    return {
      eventId,
      xpChange,
      challengingLevel,
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
  async createSituation(title, description, tags = [], challengingLevel = 3, backThoughts = [], forthThoughts = []) {
    const situation = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      challenging_level: Math.max(1, Math.min(5, parseInt(challengingLevel) || 3)),
      back_thoughts: Array.isArray(backThoughts) ? backThoughts.filter(t => t.trim()) : [],
      forth_thoughts: Array.isArray(forthThoughts) ? forthThoughts.filter(t => t.trim()) : [],
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const id = await db.situations.add(situation);
    return { ...situation, id };
  },

  // Update an existing situation
  async updateSituation(id, title, description, tags = [], challengingLevel = null, backThoughts = null, forthThoughts = null) {
    const updates = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      updated_at: new Date()
    };
    
    if (challengingLevel !== null) {
      updates.challenging_level = Math.max(1, Math.min(5, parseInt(challengingLevel) || 3));
    }
    
    if (backThoughts !== null) {
      updates.back_thoughts = Array.isArray(backThoughts) ? backThoughts.filter(t => t.trim()) : [];
    }
    
    if (forthThoughts !== null) {
      updates.forth_thoughts = Array.isArray(forthThoughts) ? forthThoughts.filter(t => t.trim()) : [];
    }
    
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

// Also check for default data periodically (e.g., after imports or data operations)
export const ensureDefaultData = () => {
  return dbHelpers.ensureDefaultData().catch(console.error);
};