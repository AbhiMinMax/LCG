// Offline-first database using Dexie (IndexedDB wrapper)
import Dexie from 'dexie';
import { PATH_LOCK_THRESHOLD } from '../utils/pathUtils';

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
      return tx.situations.toCollection().modify(situation => {
        if (situation.challenging_level === undefined) {
          situation.challenging_level = 3;
        }
        if (!situation.back_thoughts) {
          situation.back_thoughts = [];
        }
        if (!situation.forth_thoughts) {
          situation.forth_thoughts = [];
        }
      });
    });

    // Version 4: Replace back_thoughts/forth_thoughts with thought_pairs [{back, forth}]
    // Each entry is {back: string|null, forth: string|null}
    // null means no thought on that side (solo thought)
    this.version(4).stores({
      situations: '++id, title, description, tags, challenging_level, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value'
    }).upgrade(tx => {
      return tx.situations.toCollection().modify(situation => {
        if (!situation.thought_pairs) {
          const back = situation.back_thoughts || [];
          const forth = situation.forth_thoughts || [];
          const len = Math.max(back.length, forth.length);
          situation.thought_pairs = Array.from({ length: len }, (_, i) => ({
            back: back[i] || null,
            forth: forth[i] || null,
          }));
        }
      });
    });

    // Version 5: Add isMeta to situations, game_xp to opportunities, game_xp_change to events
    this.version(5).stores({
      situations: '++id, title, description, tags, isMeta, challenging_level, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, game_xp, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, game_xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value'
    }).upgrade(tx => {
      return Promise.all([
        tx.situations.toCollection().modify(situation => {
          if (situation.isMeta === undefined) situation.isMeta = false;
        }),
        tx.opportunities.toCollection().modify(opp => {
          if (opp.game_xp === undefined) opp.game_xp = 0;
        }),
      ]);
    });

    // Version 6: Add path and path_locked to opportunities
    this.version(6).stores({
      situations: '++id, title, description, tags, isMeta, challenging_level, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, game_xp, path, path_locked, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, game_xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value'
    }).upgrade(tx => {
      return tx.opportunities.toCollection().modify(opp => {
        if (!opp.path) opp.path = 'default';
        if (opp.path_locked === undefined) opp.path_locked = false;
      });
    });

    // Version 7: Add archived field to opportunities
    this.version(7).stores({
      situations: '++id, title, description, tags, isMeta, challenging_level, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, game_xp, path, path_locked, archived, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, game_xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value'
    }).upgrade(tx => {
      return tx.opportunities.toCollection().modify(opp => {
        if (opp.archived === undefined) opp.archived = false;
      });
    });

    // Version 8: Add antagonists table
    this.version(8).stores({
      situations: '++id, title, description, tags, isMeta, challenging_level, created_at, updated_at',
      opportunities: '++id, title, description, tags, current_xp, game_xp, path, path_locked, archived, current_level, created_at, updated_at',
      situation_opportunities: '[situation_id+opportunity_id], situation_id, opportunity_id',
      events: '++id, title, situation_id, event_description, choice_value, xp_change, game_xp_change, selected_back_thought, selected_forth_thought, timestamp, affected_opportunities',
      config: '++id, key, value',
      antagonists: '++id, name, status, createdAt'
    });
  }
}

// Create database instance
export const db = new LifeProgressDB();

// Antagonist system constants
export const ANTAGONIST_HP_POOLS = {
  10: 200, 9: 250, 8: 300, 7: 350, 6: 400,
  5: 450,  4: 500, 3: 550, 2: 600, 1: 650,
};

export const ANTAGONIST_LEVEL_LABELS = {
  10: 'Sovereign', 9: 'Titan',    8: 'Tyrant', 7: 'Force',
  6:  'Weight',    5: 'Presence', 4: 'Fracture', 3: 'Ruin',
  2:  'Husk',      1: 'Ash',
};

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
    
    // Fix existing situations without challenging_level
    await this.fixLegacySituations();
    
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

  // Fix legacy situations that don't have new fields
  async fixLegacySituations() {
    try {
      const allSituations = await db.situations.toArray();
      const situationsToUpdate = allSituations.filter(situation =>
        situation.challenging_level === undefined ||
        !situation.thought_pairs
      );

      if (situationsToUpdate.length > 0) {
        const updates = situationsToUpdate.map(situation => {
          const back = situation.back_thoughts || [];
          const forth = situation.forth_thoughts || [];
          const len = Math.max(back.length, forth.length);
          return {
            key: situation.id,
            changes: {
              challenging_level: situation.challenging_level || 3,
              thought_pairs: situation.thought_pairs || Array.from({ length: len }, (_, i) => ({
                back: back[i] || null,
                forth: forth[i] || null,
              })),
              updated_at: new Date()
            }
          };
        });

        await db.situations.bulkUpdate(updates);
        console.log(`Fixed ${situationsToUpdate.length} legacy situations with new fields`);
      }
    } catch (error) {
      console.error('Error fixing legacy situations:', error);
    }
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
        thought_pairs: [
          { back: "Just stay quiet and avoid confrontation", forth: "Speaking up professionally shows leadership and integrity" },
          { back: "This will only make things worse and people will dislike me", forth: "Constructive dialogue leads to better solutions for everyone" }
        ],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Health Challenge",
        description: "Faced with a decision about diet, exercise, or wellness",
        tags: ["health", "wellness", "personal"],
        challenging_level: 3,
        thought_pairs: [
          { back: "It's too much work to change my habits now", forth: "Small consistent steps create lasting change over time" },
          { back: "I don't have time for this and it won't make a difference anyway", forth: "Investing in my health now pays dividends for my entire future" }
        ],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Relationship Communication",
        description: "A communication challenge with family, friend, or partner",
        tags: ["relationships", "communication", "personal"],
        challenging_level: 5,
        thought_pairs: [
          { back: "Avoiding this conversation will keep the peace", forth: "Honest communication, even when difficult, strengthens relationships" },
          { back: "They won't understand my perspective anyway, so why try", forth: "I can express my perspective with empathy and create mutual understanding" }
        ],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Learning Opportunity",
        description: "Encountered a chance to learn something new or challenging",
        tags: ["learning", "growth", "education"],
        challenging_level: 2,
        thought_pairs: [
          { back: "I'm not smart enough", forth: "Every expert was once a beginner" },
          { back: "This is too complicated", forth: "Growth happens outside comfort zone" }
        ],
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: "Financial Decision",
        description: "Had to make an important financial choice or investment",
        tags: ["finance", "money", "planning"],
        challenging_level: 4,
        thought_pairs: [
          { back: "Play it safe", forth: "Calculated risks lead to growth" },
          { back: "What if I lose money?", forth: "Research and make informed decisions" }
        ],
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
              thought_pairs: [
                { back: "This daily task isn't really important", forth: "Small daily actions build the foundation of strong character" },
                { back: "I can just deal with it later when I feel like it", forth: "How I handle small challenges shapes how I'll handle big ones" }
              ],
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
              thought_pairs: [
                { back: "I should avoid any awkwardness and keep this brief", forth: "Authentic connections create meaningful relationships" },
                { back: "They probably don't want to talk to me anyway", forth: "Showing genuine interest in others enriches both our lives" }
              ],
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
              thought_pairs: [
                { back: "I'm too busy", forth: "Growth requires learning" },
                { back: "I already know enough", forth: "Knowledge is power" }
              ],
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
              thought_pairs: [
                { back: "One time won't hurt", forth: "Health is wealth" },
                { back: "I'll start tomorrow", forth: "Consistency creates results" }
              ],
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
      const opportunities = (await db.opportunities
        .where('id')
        .anyOf(opportunityIds)
        .toArray()).filter(o => !o.archived);

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
    const opps = await db.opportunities.where('id').anyOf(opportunityIds).toArray();
    return opps.filter(o => !o.archived);
  },

  // Game mode XP calculation (separate from standard mode XP).
  // Dynamic XP (difficulty multiplier) and game mode (real-event doubling) are
  // independent features that can be enabled separately or together:
  //   - isDynamicXp only  → difficulty multiplier applied, no doubling
  //   - game mode only    → real-event doubling applied, no difficulty multiplier
  //   - both              → difficulty multiplier first, then real-event doubling
  //   - neither           → static base values (caller should use calculateXpChange instead)
  // Negative XP (didnt_try, misguided) is never doubled regardless of flags.
  calculateGameXpChange(choiceValue, isMeta = false, challengingLevel = 3, isDynamicXp = false) {
    const baseXpMap = {
      1: -10,  // Misguided Action
      2: -5,   // Didnt Try
      3: 5,    // Tried
      4: 10,   // Well Done!
    };
    let xp = baseXpMap[choiceValue] ?? 0;
    // Apply difficulty multiplier only when Dynamic XP is also enabled
    if (isDynamicXp && challengingLevel) {
      const multiplier = (challengingLevel + 1) / 4;
      xp = Math.round(xp * multiplier);
    }
    if (xp > 0 && !isMeta) xp *= 2;
    return xp;
  },

  // XP and Level calculation
  calculateXpChange(choiceValue, challengingLevel = 3, isDynamicXp = false) {
    const baseXpMap = {
      1: -10, // Misguided Action
      2: -5,  // Didnt Try
      3: 5,   // Tried
      4: 10   // Well Done!
    };

    let xp = baseXpMap[choiceValue] || 0;

    if (isDynamicXp && challengingLevel) {
      const multiplier = (challengingLevel + 1) / 4; // Level 1=0.5x, 3=1x, 5=1.5x
      xp = Math.round(xp * multiplier);
    }
    
    return xp;
  },

  // ─── Login streak ──────────────────────────────────────────────────────────

  // Read the stored game profile (no side effects).
  async getGameProfile() {
    return this.getConfig('gameProfile', {
      loginStreak: 0,
      lastLoginDate: null,
      longestLoginStreak: 0,
      unlockedTraits: [],
    });
  },

  // Check computed unlocked trait IDs against what's stored in the profile.
  // Persists newly unlocked traits with their unlock timestamp.
  // Returns { newlyUnlocked: string[], storedTraits: [{traitId, unlockedAt}] }
  async checkAndStoreTraits(unlockedIds) {
    try {
      const profile = await this.getGameProfile();
      const stored = profile.unlockedTraits || [];
      const storedIdSet = new Set(stored.map(t => t.traitId));

      const newlyUnlocked = unlockedIds.filter(id => !storedIdSet.has(id));

      let storedTraits = stored;
      if (newlyUnlocked.length > 0) {
        const now = new Date().toISOString();
        const newEntries = newlyUnlocked.map(traitId => ({ traitId, unlockedAt: now }));
        storedTraits = [...stored, ...newEntries];
        await this.setConfig('gameProfile', { ...profile, unlockedTraits: storedTraits });
        console.log(`[checkAndStoreTraits] newly unlocked: ${newlyUnlocked.join(', ')}`);
      }

      return { newlyUnlocked, storedTraits };
    } catch (error) {
      console.error('[checkAndStoreTraits] error:', error);
      return { newlyUnlocked: [], storedTraits: [] };
    }
  },

  // Check today's login. Updates streak, awards daily XP (1 per active opp)
  // and milestone bonus XP. Safe to call multiple times per day — idempotent.
  async checkLoginStreak() {
    try {
      const isGameMode = await this.getConfig('gameModeEnabled', false);
      if (!isGameMode) return null;

      const profile = await this.getGameProfile();
      const today = new Date().toDateString(); // e.g. "Thu Apr 16 2026"

      if (profile.lastLoginDate === today) {
        // Already processed today — return current state without changes.
        return {
          loginStreak: profile.loginStreak,
          longestLoginStreak: profile.longestLoginStreak,
          milestoneHit: null,
          milestoneXp: 0,
          alreadyLoggedIn: true,
        };
      }

      // Determine new streak value.
      let newStreak;
      if (profile.lastLoginDate) {
        const diffDays = Math.round(
          (new Date(today) - new Date(profile.lastLoginDate)) / (1000 * 60 * 60 * 24)
        );
        newStreak = diffDays === 1 ? (profile.loginStreak || 0) + 1 : 1;
      } else {
        newStreak = 1;
      }

      const newLongest = Math.max(newStreak, profile.longestLoginStreak || 0);

      // Milestone bonus XP (awarded to every active opportunity).
      const MILESTONES = { 7: 25, 30: 100, 100: 300, 365: 1000 };
      const milestoneXp = MILESTONES[newStreak] || 0;
      const milestoneHit = milestoneXp > 0 ? newStreak : null;

      // Collect active opportunity IDs (at least one event in last 30 days).
      const ms30 = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const events = await db.events.toArray();
      const activeOppIds = new Set();
      for (const ev of events) {
        if (
          now - new Date(ev.timestamp).getTime() <= ms30 &&
          Array.isArray(ev.affected_opportunities)
        ) {
          for (const id of ev.affected_opportunities) activeOppIds.add(id);
        }
      }

      // Award 1 XP (daily) + milestone bonus to each active opportunity.
      const xpPerOpp = 1 + milestoneXp;
      if (activeOppIds.size > 0) {
        const allOpps = await db.opportunities.toArray();
        const oppUpdates = allOpps
          .filter(o => activeOppIds.has(o.id))
          .map(o => ({
            key: o.id,
            changes: { game_xp: Math.max(0, (o.game_xp || 0) + xpPerOpp) },
          }));
        if (oppUpdates.length > 0) {
          await db.opportunities.bulkUpdate(oppUpdates);
        }
      }

      // Persist updated profile.
      await this.setConfig('gameProfile', {
        ...profile,
        loginStreak: newStreak,
        lastLoginDate: today,
        longestLoginStreak: newLongest,
      });

      console.log(
        `[checkLoginStreak] streak=${newStreak} longest=${newLongest} milestone=${milestoneHit} xpPerOpp=${xpPerOpp} activeOpps=${activeOppIds.size}`
      );

      return { loginStreak: newStreak, longestLoginStreak: newLongest, milestoneHit, milestoneXp, alreadyLoggedIn: false };
    } catch (error) {
      console.error('[checkLoginStreak] error:', error);
      return null;
    }
  },

  // Narrative storage
  async getNarratives() {
    return this.getConfig('narratives', { daily: [], weekly: [], monthly: [] });
  },
  async saveNarratives(narratives) {
    return this.setConfig('narratives', narratives);
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
    // Get situation details for challenging level and isMeta
    const situation = await db.situations.get(situationId);
    const challengingLevel = situation ? situation.challenging_level : 3;
    const isMeta = situation ? (situation.isMeta === true) : false;

    // Check enabled features
    const [isDynamicXp, isGameMode] = await Promise.all([
      this.getConfig('dynamicXpEnabled', false),
      this.getConfig('gameModeEnabled', false),
    ]);

    const xpChange = this.calculateXpChange(choiceValue, challengingLevel, isDynamicXp);
    const gameXpChange = isGameMode ? this.calculateGameXpChange(choiceValue, isMeta, challengingLevel, isDynamicXp) : null;

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
      game_xp_change: gameXpChange,
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
      if (updated) {
        // Also accumulate game XP when game mode is on
        if (isGameMode && gameXpChange !== null) {
          const newGameXp = Math.max(0, (opportunity.game_xp || 0) + gameXpChange);
          const pathUpdates = { game_xp: newGameXp };
          // Lock path permanently once level 3 threshold is crossed
          if (!opportunity.path_locked && newGameXp >= PATH_LOCK_THRESHOLD) {
            pathUpdates.path_locked = true;
          }
          await db.opportunities.update(opportunity.id, pathUpdates);
          updated.game_xp = newGameXp;
          if (pathUpdates.path_locked) updated.path_locked = true;
        }
        updatedOpportunities.push(updated);
      }
    }

    // Apply damage/recovery to active antagonists tagged to this situation
    let antagonistImpacts = [];
    if (isGameMode && gameXpChange !== null) {
      const activeAntagonists = await this.getAntagonists();
      const tagged = activeAntagonists.filter(
        a => Array.isArray(a.taggedSituationIds) && a.taggedSituationIds.includes(situationId)
      );
      for (const antagonist of tagged) {
        const result = await this.applyAntagonistDamage(antagonist.id, gameXpChange);
        if (result) {
          antagonistImpacts.push({
            antagonistId: antagonist.id,
            antagonistName: antagonist.name,
            hpDelta: -gameXpChange, // positive XP = negative HP change
            levelAtTime: result.oldLevel,
            newLevel: result.newLevel,
            levelChanged: result.levelChanged,
            defeated: result.defeated,
          });
        }
      }
      if (antagonistImpacts.length > 0) {
        await db.events.update(eventId, { antagonistImpacts });
      }
    }

    return {
      eventId,
      xpChange,
      gameXpChange,
      challengingLevel,
      updatedOpportunities,
      antagonistImpacts,
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

  // Get past events for a specific situation, optionally filtered by choice values
  async getEventsForSituation(situationId, choiceValues = null) {
    let collection = db.events.where('situation_id').equals(situationId);
    let events = await collection.toArray();

    if (choiceValues && choiceValues.length > 0) {
      events = events.filter(e => choiceValues.includes(e.choice_value));
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return events;
  },

  // Delete a single event by id
  async deleteEvent(eventId) {
    await db.events.delete(eventId);
  },

  // Get event counts keyed by situation_id: { [situationId]: count }
  async getEventCountsPerSituation() {
    const events = await db.events.toArray();
    const counts = {};
    for (const event of events) {
      counts[event.situation_id] = (counts[event.situation_id] || 0) + 1;
    }
    return counts;
  },

  // Get event counts keyed by opportunity_id: { [oppId]: count }
  async getEventCountsPerOpportunity() {
    const events = await db.events.toArray();
    const counts = {};
    for (const event of events) {
      if (Array.isArray(event.affected_opportunities)) {
        for (const oppId of event.affected_opportunities) {
          counts[oppId] = (counts[oppId] || 0) + 1;
        }
      }
    }
    return counts;
  },

  // Get all opportunities sorted by different criteria
  async getOpportunitiesSorted(sortBy = 'alphabetical') {
    let opportunities = (await db.opportunities.toArray()).filter(o => !o.archived);

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
  // thoughtPairs: [{back: string|null, forth: string|null}] — null means no thought on that side
  async createSituation(title, description, tags = [], challengingLevel = 3, thoughtPairs = [], isMeta = false) {
    const situation = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      isMeta: !!isMeta,
      challenging_level: Math.max(1, Math.min(5, parseInt(challengingLevel) || 3)),
      thought_pairs: Array.isArray(thoughtPairs)
        ? thoughtPairs.filter(p => (p.back && p.back.trim()) || (p.forth && p.forth.trim()))
            .map(p => ({ back: p.back?.trim() || null, forth: p.forth?.trim() || null }))
        : [],
      created_at: new Date(),
      updated_at: new Date()
    };

    const id = await db.situations.add(situation);
    return { ...situation, id };
  },

  // Update an existing situation
  async updateSituation(id, title, description, tags = [], challengingLevel = null, thoughtPairs = null, isMeta = null) {
    const updates = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      updated_at: new Date()
    };

    if (challengingLevel !== null) {
      updates.challenging_level = Math.max(1, Math.min(5, parseInt(challengingLevel) || 3));
    }

    if (thoughtPairs !== null) {
      updates.thought_pairs = Array.isArray(thoughtPairs)
        ? thoughtPairs.filter(p => (p.back && p.back.trim()) || (p.forth && p.forth.trim()))
            .map(p => ({ back: p.back?.trim() || null, forth: p.forth?.trim() || null }))
        : [];
    }

    if (isMeta !== null) {
      updates.isMeta = !!isMeta;
    }

    await db.situations.update(id, updates);
    return await db.situations.get(id);
  },

  // Create a new opportunity
  async createOpportunity(title, description, tags = [], initialLevel = 1, path = 'default') {
    const level = Math.max(1, Math.min(100, parseInt(initialLevel) || 1));
    const opportunity = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      current_xp: 0,
      game_xp: 0,
      current_level: level,
      path: path || 'default',
      path_locked: false,
      created_at: new Date(),
      updated_at: new Date()
    };

    const id = await db.opportunities.add(opportunity);
    return { ...opportunity, id };
  },

  // Retroactively compute and store game_xp for events logged before game mode was enabled.
  // Only processes events where game_xp_change is null/undefined (pre-game-mode events).
  // Safe to call multiple times — skips events already processed.
  async backfillGameXp() {
    try {
      const [events, situations, opportunities] = await Promise.all([
        db.events.toArray(),
        db.situations.toArray(),
        db.opportunities.toArray(),
      ]);

      const sitMap = Object.fromEntries(situations.map(s => [s.id, s]));

      const unprocessed = events.filter(e => e.game_xp_change === null || e.game_xp_change === undefined);
      if (unprocessed.length === 0) return;

      const oppDelta = {};
      const eventUpdates = [];

      for (const ev of unprocessed) {
        const sit = sitMap[ev.situation_id];
        const isMeta = sit ? (sit.isMeta === true) : false;
        const gxp = this.calculateGameXpChange(ev.choice_value, isMeta);
        eventUpdates.push({ key: ev.id, changes: { game_xp_change: gxp } });
        if (Array.isArray(ev.affected_opportunities)) {
          for (const oppId of ev.affected_opportunities) {
            oppDelta[oppId] = (oppDelta[oppId] || 0) + gxp;
          }
        }
      }

      await db.events.bulkUpdate(eventUpdates);

      const oppUpdates = [];
      for (const opp of opportunities) {
        const delta = oppDelta[opp.id] || 0;
        if (delta !== 0) {
          const newGameXp = Math.max(0, (opp.game_xp || 0) + delta);
          const changes = { game_xp: newGameXp };
          if (!opp.path_locked && newGameXp >= PATH_LOCK_THRESHOLD) {
            changes.path_locked = true;
          }
          oppUpdates.push({ key: opp.id, changes });
        }
      }

      if (oppUpdates.length > 0) {
        await db.opportunities.bulkUpdate(oppUpdates);
      }

      console.log(`[backfillGameXp] processed ${unprocessed.length} events, updated ${oppUpdates.length} opportunities`);
    } catch (error) {
      console.error('[backfillGameXp] error:', error);
    }
  },

  // Update path for an opportunity (only if not locked)
  async updateOpportunityPath(id, path) {
    const opp = await db.opportunities.get(id);
    if (!opp) return null;
    if (opp.path_locked) return opp; // silently no-op if locked
    await db.opportunities.update(id, { path, updated_at: new Date() });
    return await db.opportunities.get(id);
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

  // Archive an opportunity (hidden from active views, history preserved)
  async archiveOpportunity(id) {
    await db.opportunities.update(id, { archived: true, updated_at: new Date() });
  },

  // Unarchive an opportunity
  async unarchiveOpportunity(id) {
    await db.opportunities.update(id, { archived: false, updated_at: new Date() });
  },

  // Merge mergedId into survivorId: combine XP, redirect event links, delete merged record
  async mergeOpportunities(survivorId, mergedId) {
    const [survivor, merged] = await Promise.all([
      db.opportunities.get(survivorId),
      db.opportunities.get(mergedId),
    ]);
    if (!survivor || !merged) throw new Error('Opportunity not found');

    // Combine standard XP (flattened then re-leveled)
    const survivorTotal = survivor.current_xp + (survivor.current_level - 1) * 100;
    const mergedTotal   = merged.current_xp   + (merged.current_level   - 1) * 100;
    const combined      = survivorTotal + mergedTotal;
    const newLevel      = Math.floor(combined / 100) + 1;
    const newXp         = combined % 100;

    // Combine game XP
    const newGameXp = (survivor.game_xp || 0) + (merged.game_xp || 0);

    // Update survivor
    await db.opportunities.update(survivorId, {
      current_xp: newXp,
      current_level: newLevel,
      game_xp: newGameXp,
      updated_at: new Date(),
    });

    // Redirect event links: replace mergedId with survivorId in affected_opportunities
    const affectedEvents = await db.events.toArray();
    const toUpdate = affectedEvents.filter(
      ev => Array.isArray(ev.affected_opportunities) && ev.affected_opportunities.includes(mergedId)
    );
    for (const ev of toUpdate) {
      const newIds = ev.affected_opportunities
        .map(id => (id === mergedId ? survivorId : id))
        .filter((id, idx, arr) => arr.indexOf(id) === idx); // deduplicate
      await db.events.update(ev.id, { affected_opportunities: newIds });
    }

    // Redirect situation_opportunity links
    const mergedLinks = await db.situation_opportunities.where('opportunity_id').equals(mergedId).toArray();
    for (const link of mergedLinks) {
      const existing = await db.situation_opportunities
        .where('[situation_id+opportunity_id]')
        .equals([link.situation_id, survivorId])
        .first();
      if (!existing) {
        await db.situation_opportunities.add({ situation_id: link.situation_id, opportunity_id: survivorId });
      }
    }
    await db.situation_opportunities.where('opportunity_id').equals(mergedId).delete();

    // Delete merged record
    await db.opportunities.delete(mergedId);
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

  // ─── Antagonist helpers ────────────────────────────────────────────────────

  // Returns all active (non-defeated) antagonists.
  async getAntagonists() {
    try {
      return db.antagonists.where('status').equals('active').toArray();
    } catch (error) {
      console.error('[getAntagonists] error:', error);
      return [];
    }
  },

  // Returns all antagonists including defeated ones.
  async getAllAntagonists() {
    try {
      return db.antagonists.toArray();
    } catch (error) {
      console.error('[getAllAntagonists] error:', error);
      return [];
    }
  },

  async createAntagonist(name, description, startingLevel, taggedSituationIds) {
    try {
      const level = Math.max(1, Math.min(10, parseInt(startingLevel) || 5));
      const antagonist = {
        name: name.trim(),
        description: (description || '').trim(),
        startingLevel: level,
        currentLevel: level,
        currentHP: ANTAGONIST_HP_POOLS[level],
        taggedSituationIds: Array.isArray(taggedSituationIds) ? taggedSituationIds : [],
        status: 'active',
        totalDamageDealt: 0,
        createdAt: new Date(),
        defeatedAt: null,
      };
      const id = await db.antagonists.add(antagonist);
      console.log(`[createAntagonist] created "${name}" at level ${level}`);
      return { ...antagonist, id };
    } catch (error) {
      console.error('[createAntagonist] error:', error);
      throw error;
    }
  },

  async updateAntagonist(id, changes) {
    try {
      await db.antagonists.update(id, changes);
      return db.antagonists.get(id);
    } catch (error) {
      console.error('[updateAntagonist] error:', error);
      throw error;
    }
  },

  async deleteAntagonist(id) {
    try {
      await db.antagonists.delete(id);
    } catch (error) {
      console.error('[deleteAntagonist] error:', error);
      throw error;
    }
  },

  // Applies a game XP change as damage/recovery to an antagonist.
  // Positive gameXpChange = damage (HP decreases).
  // Negative gameXpChange = recovery (HP increases).
  // Returns { levelChanged, defeated, oldLevel, newLevel, newHP } or null if antagonist not found/already defeated.
  async applyAntagonistDamage(antagonistId, gameXpChange) {
    try {
      const antagonist = await db.antagonists.get(antagonistId);
      if (!antagonist || antagonist.status === 'defeated') return null;

      let { currentLevel, currentHP, totalDamageDealt } = antagonist;
      const oldLevel = currentLevel;
      let levelChanged = false;
      let defeated = false;

      if (gameXpChange > 0) {
        totalDamageDealt += gameXpChange;
        currentHP -= gameXpChange;

        // Handle level-down cascade (clearing multiple levels in one hit)
        while (currentHP <= 0) {
          if (currentLevel === 1) {
            defeated = true;
            currentHP = 0;
            break;
          }
          const overflow = Math.abs(currentHP);
          currentLevel--;
          levelChanged = true;
          currentHP = ANTAGONIST_HP_POOLS[currentLevel] - overflow;
          if (currentHP < 0) currentHP = 0;
        }
      } else if (gameXpChange < 0) {
        currentHP += Math.abs(gameXpChange);
        const levelUpThreshold = ANTAGONIST_HP_POOLS[currentLevel] * 1.5;

        if (currentHP >= levelUpThreshold && currentLevel < 10) {
          const overflow = currentHP - levelUpThreshold;
          currentLevel++;
          levelChanged = true;
          currentHP = Math.max(0, ANTAGONIST_HP_POOLS[currentLevel] - overflow);
        }
      }

      const updates = { currentLevel, currentHP, totalDamageDealt };
      if (defeated) {
        updates.status = 'defeated';
        updates.defeatedAt = new Date();
      }

      await db.antagonists.update(antagonistId, updates);
      console.log(
        `[applyAntagonistDamage] id=${antagonistId} xp=${gameXpChange} hp=${currentHP} lv=${currentLevel} defeated=${defeated}`
      );
      return { levelChanged, defeated, oldLevel, newLevel: currentLevel, newHP: currentHP };
    } catch (error) {
      console.error('[applyAntagonistDamage] error:', error);
      return null;
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