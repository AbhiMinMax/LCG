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

// Total game XP that constitutes one full path cycle (entering level 21 = Mastered III)
// Reaching this threshold earns one rebirth star and resets the cycle.
export const REBIRTH_XP = LEVEL_THRESHOLDS[20]; // 38600

// game_xp at which path locks (level 3 threshold)
export const PATH_LOCK_THRESHOLD = LEVEL_THRESHOLDS[2]; // 700

// ─── Per-path rebirth symbols ─────────────────────────────────────────────────
// Three tiers: first rebirth, second, third-and-beyond.
// ★ is intentionally excluded — it is used elsewhere for mastery streaks.
export const REBIRTH_SYMBOLS = {
  default:    ['🔱', '💠', '👑'],
  cognitive:  ['💡', '🔮', '🌌'],
  emotional:  ['🌿', '🌸', '🦋'],
  behavioral: ['⚡', '⚙️', '🏆'],
  physical:   ['🔥', '🌊', '⚡'],
};

/**
 * Returns the accumulated rebirth symbol string for display next to a label.
 * Rebirths 1–3 show one new symbol each; beyond 3 all three symbols + ×N suffix.
 * e.g. rebirths=2, path='cognitive' → '💡🔮'
 */
export function getRebirthSymbols(rebirths, path = 'default') {
  if (!rebirths || rebirths <= 0) return '';
  const syms = REBIRTH_SYMBOLS[path] || REBIRTH_SYMBOLS.default;
  const show = Math.min(rebirths, 3);
  let str = syms.slice(0, show).join('');
  if (rebirths > 3) str += `×${rebirths}`;
  return str;
}

/**
 * Returns the single symbol earned at a specific rebirth count.
 * Used for "Rebirth!" notifications to show what was just earned.
 */
export function getNewRebirthSymbol(rebirths, path = 'default') {
  if (!rebirths || rebirths <= 0) return '';
  const syms = REBIRTH_SYMBOLS[path] || REBIRTH_SYMBOLS.default;
  return syms[Math.min(rebirths - 1, syms.length - 1)];
}

/**
 * Decompose total accumulated game XP into rebirth count and current-cycle XP.
 * rebirths — number of times the full path has been completed (each = one star)
 * cycleXp  — XP within the current cycle (0 to REBIRTH_XP - 1)
 */
export function getRebirthInfo(gameXp) {
  const xp = Math.max(0, gameXp || 0);
  const rebirths = Math.floor(xp / REBIRTH_XP);
  const cycleXp  = xp % REBIRTH_XP;
  return { rebirths, cycleXp };
}

/**
 * Compute path level info from accumulated game XP.
 *
 * Uses cycleXp (game_xp % REBIRTH_XP) for level position so the path
 * resets to level 1 after each rebirth.
 *
 * Returns:
 *   level       — 1-21 within the current cycle
 *   labelIndex  — 0-6 (index into path labels array)
 *   roman       — 'I' | 'II' | 'III'
 *   label       — e.g. 'Aware'
 *   fullLabel   — e.g. 'Aware I'
 *   xpIntoLevel — XP earned within current level
 *   xpForLevel  — total XP span of current level
 *   progressPct — 0-100 percentage through current level
 *   rebirths    — number of completed full cycles (shown as stars)
 *   nextLabel   — full label of next level, or null at cycle cap
 *   xpToNext    — XP to next level, or null at cycle cap
 *   isPrestige  — always false (kept for call-site compatibility)
 */
export function getPathLevel(gameXp, path = 'default') {
  const { rebirths, cycleXp } = getRebirthInfo(gameXp);
  const xp = cycleXp;
  const labels = PATHS[path]?.labels || PATHS.default.labels;

  // Determine which level (1-21) within this cycle
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  // Cap at 21 — cycle resets before level can exceed 21
  if (level > 21) level = 21;

  const labelIndex = Math.floor((level - 1) / 3); // 0-6
  const romanIndex = (level - 1) % 3;              // 0-2
  const roman      = ROMAN[romanIndex];
  const label      = labels[labelIndex];
  const fullLabel  = `${label} ${roman}`;

  const xpStart   = LEVEL_THRESHOLDS[level - 1];
  // Level 21 spans from its threshold to REBIRTH_XP (end of cycle)
  const xpEnd     = level < 21 ? LEVEL_THRESHOLDS[level] : REBIRTH_XP;
  const xpForLevel  = xpEnd - xpStart;
  const xpIntoLevel = xp - xpStart;
  const xpToNext    = level < 21 ? xpForLevel - xpIntoLevel : null;

  // Next level label (null when at the cap of this cycle)
  let nextLabel = null;
  if (level < 21) {
    const nextLabelIndex = Math.floor(level / 3);
    const nextRomanIndex = level % 3;
    nextLabel = `${labels[nextLabelIndex]} ${ROMAN[nextRomanIndex]}`;
  }

  return {
    level,
    labelIndex,
    roman,
    label,
    fullLabel,
    xpIntoLevel,
    xpForLevel,
    progressPct: xpForLevel > 0 ? Math.round((xpIntoLevel / xpForLevel) * 100) : 100,
    rebirths,
    nextLabel,
    xpToNext,
    isPrestige: false, // kept for compatibility; rebirth stars replace prestige
  };
}
