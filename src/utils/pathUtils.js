// Path system definitions and XP level computation

export const PATHS = {
  default: {
    name: 'Default',
    icon: '⭐',
    philosophy: 'Progressive mastery through consistent effort.',
    labels: ['Aware', 'Learning', 'Practicing', 'Capable', 'Skilled', 'Proficient', 'Mastered'],
  },
  cognitive: {
    name: 'Cognitive',
    icon: '🧠',
    philosophy: 'Developing through understanding and reasoning.',
    labels: ['Noticing', 'Questioning', 'Understanding', 'Applying', 'Integrating', 'Internalizing', 'Embodied'],
  },
  emotional: {
    name: 'Emotional',
    icon: '💙',
    philosophy: 'Developing through feeling and processing.',
    labels: ['Reactive', 'Aware', 'Processing', 'Regulating', 'Attuned', 'Integrated', 'Embodied'],
  },
  behavioral: {
    name: 'Behavioral',
    icon: '🔄',
    philosophy: 'Developing through repetition and consistency.',
    labels: ['Attempting', 'Repeating', 'Establishing', 'Consistent', 'Automatic', 'Refined', 'Second nature'],
  },
  physical: {
    name: 'Physical',
    icon: '💪',
    philosophy: 'Developing through body and energy.',
    labels: ['Recovering', 'Building', 'Strengthening', 'Conditioning', 'Robust', 'Peak', 'Vital'],
  },
};

export const PATH_KEYS = ['default', 'cognitive', 'emotional', 'behavioral', 'physical'];

const ROMAN = ['I', 'II', 'III'];

// Cumulative XP required to START each level (index = level - 1, so index 0 = level 1)
// 21 levels total (7 labels × 3 repetitions each)
export const LEVEL_THRESHOLDS = [
  0,      // level 1
  300,    // level 2
  700,    // level 3  ← path locks here
  1200,   // level 4
  1800,   // level 5
  2600,   // level 6
  3600,   // level 7
  4800,   // level 8
  6200,   // level 9
  7800,   // level 10
  9600,   // level 11
  11600,  // level 12
  13800,  // level 13
  16200,  // level 14
  18800,  // level 15
  21600,  // level 16
  24600,  // level 17
  27800,  // level 18
  31200,  // level 19
  34800,  // level 20
  38600,  // level 21  ← prestige entry
];

// XP needed to earn one prestige sub-level after reaching level 21
export const PRESTIGE_SUB_XP = 500;

// game_xp at which path locks (level 3 threshold)
export const PATH_LOCK_THRESHOLD = LEVEL_THRESHOLDS[2]; // 700

/**
 * Compute path level info from accumulated game XP.
 * Returns:
 *   level         — 1-21 (capped at 21 in prestige)
 *   labelIndex    — 0-6 (index into path labels array)
 *   roman         — 'I' | 'II' | 'III'
 *   label         — e.g. 'Aware'
 *   fullLabel     — e.g. 'Aware I'
 *   xpIntoLevel   — XP earned within current level
 *   xpForLevel    — total XP needed for current level
 *   progressPct   — 0-100 percentage through current level
 *   isPrestige    — boolean
 *   prestigeSub   — sub-level number (1+ when prestige, null otherwise)
 *   nextLabel     — full label of next level, or null if prestige
 *   xpToNext      — XP remaining until next level, or null if prestige
 */
export function getPathLevel(gameXp, path = 'default') {
  const xp = Math.max(0, gameXp || 0);
  const labels = PATHS[path]?.labels || PATHS.default.labels;

  // Determine which level (1-21) we're in
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  const isPrestige = level > 21;

  if (isPrestige) {
    const prestigeXp = xp - LEVEL_THRESHOLDS[20];
    const prestigeSub = Math.floor(prestigeXp / PRESTIGE_SUB_XP) + 1;
    const xpIntoLevel = prestigeXp % PRESTIGE_SUB_XP;
    return {
      level: 21,
      labelIndex: 6,
      roman: 'III',
      label: labels[6],
      fullLabel: `${labels[6]} III`,
      xpIntoLevel,
      xpForLevel: PRESTIGE_SUB_XP,
      progressPct: Math.round((xpIntoLevel / PRESTIGE_SUB_XP) * 100),
      isPrestige: true,
      prestigeSub,
      nextLabel: null,
      xpToNext: null,
    };
  }

  const labelIndex = Math.floor((level - 1) / 3); // 0-6
  const romanIndex = (level - 1) % 3;              // 0-2
  const roman = ROMAN[romanIndex];
  const label = labels[labelIndex];
  const fullLabel = `${label} ${roman}`;

  const xpStart = LEVEL_THRESHOLDS[level - 1];
  const xpEnd = level < 21 ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[20] + PRESTIGE_SUB_XP;
  const xpForLevel = xpEnd - xpStart;
  const xpIntoLevel = xp - xpStart;
  const xpToNext = xpForLevel - xpIntoLevel;

  // Next level label
  let nextLabel = null;
  if (level < 21) {
    const nextLevelIndex = level; // 0-based = level (since level is 1-based)
    const nextLabelIndex = Math.floor(nextLevelIndex / 3);
    const nextRomanIndex = nextLevelIndex % 3;
    nextLabel = `${labels[nextLabelIndex]} ${ROMAN[nextRomanIndex]}`;
  } else {
    nextLabel = `${labels[6]} III — sub 1`;
  }

  return {
    level,
    labelIndex,
    roman,
    label,
    fullLabel,
    xpIntoLevel,
    xpForLevel,
    progressPct: Math.round((xpIntoLevel / xpForLevel) * 100),
    isPrestige: false,
    prestigeSub: null,
    nextLabel,
    xpToNext,
  };
}
