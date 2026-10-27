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

// Roman suffix repeated inside each label word. A cycle is
// LABEL_COUNT × ROMAN.length levels, so lengthening this array is how you buy
// more levels per rebirth star: 7 words × 4 = 28. Append 'V' for 35. The
// numerals must stay contiguous from I.
export const ROMAN = ['I', 'II', 'III', 'IV'];

// Levels sharing one label word, e.g. Aware I–IV.
export const LEVELS_PER_LABEL = ROMAN.length;

// Label words per path. Every path in PATHS supplies this many; getPathLevel
// clamps defensively if one ever supplies fewer.
export const LABEL_COUNT = PATHS.default.labels.length; // 7

// ─── Level cost ───────────────────────────────────────────────────────────────
// Every level costs the SAME amount of XP. This is deliberate.
//
// XP income has no level-scaled component: calculateGameXpChange awards a flat
// ±2/±4 by choice, optionally × the *situation's* difficulty (2 ** (level - 3))
// and ×2 for real (non-meta) situations — so the most an event can ever pay is
// 32, whatever path level you're on. An escalating cost curve against flat
// income is a pure tax on later levels, and it models growth as monotonic
// acceleration, which life isn't: behaviour and circumstance move in both
// directions and plateau for long stretches. A flat cost keeps a level-up worth
// the same effort at Mastered IV as at Aware I, and lets a long plateau read as
// a plateau rather than as falling behind a curve.
//
// Tuning: at a typical +8 (well done, real situation) a level is ~25 events and
// a full 28-level cycle ~700. XP_PER_LEVEL re-paces how fast levels arrive;
// ROMAN's length sets how many levels a rebirth star costs. Those two are the
// only dials — every other constant here derives from them.
export const XP_PER_LEVEL = 200;

// Total levels in one cycle (7 label words × 4 roman steps each)
export const MAX_LEVEL = LABEL_COUNT * LEVELS_PER_LABEL;

// Cumulative XP required to START each level (index = level - 1, so index 0 = level 1)
// Derived from the flat cost; kept exported so the schedule can be displayed.
export const LEVEL_THRESHOLDS = Array.from(
  { length: MAX_LEVEL },
  (_, i) => i * XP_PER_LEVEL
);

// Total game XP that constitutes one full path cycle. A cycle spans every
// level, so the last one (Mastered IV) is a real level you occupy and fill —
// completing it earns one rebirth star and resets the cycle.
export const REBIRTH_XP = MAX_LEVEL * XP_PER_LEVEL; // 5600

// game_xp at which path locks (level 3 threshold)
export const PATH_LOCK_THRESHOLD = LEVEL_THRESHOLDS[2]; // 400

// ─── Per-path rebirth symbols ─────────────────────────────────────────────────
// Three tiers: first rebirth, second, third-and-beyond.
// ★ is intentionally excluded — it is used elsewhere for mastery streaks.
export const REBIRTH_SYMBOLS = {
  default:    ['🌱','🌳','🌠','🧿','🔯','⚝','🔱','💠','👑','⚜️'],
  cognitive:  ['🔮','🧩','🔭','🧬','🌐','🔬','📐','💫', '🌌','🌀'],
  emotional:  ['🌺','🌙','💎','🦚','🌻','🌿', '🌸', '🦋', '🕊️', '🌈'],
  behavioral: ['🎯','🔩','🧱','⚒','🧲','⛏','🏹', '⚙️', '🏆', '🛡️'],
  physical:   ['💥','🔥', '🌊', '🌪','🏔','🦁','🐉','🌋','🦅', '⚔️'],
};

/**
 * Returns the accumulated rebirth symbol string for display next to a label.
 * Rebirths 1–3 show one new symbol each; beyond 3 all three symbols + ×N suffix.
 * e.g. rebirths=2, path='cognitive' → '💡🔮'
 */
export function getRebirthSymbols(rebirths, path = 'default') {
  if (!rebirths || rebirths <= 0) return '';
  const syms = REBIRTH_SYMBOLS[path] || REBIRTH_SYMBOLS.default;
  const show = Math.min(rebirths, 10);
  let str = syms.slice(0, show).join('');
  if (rebirths > 10) str += `×${rebirths}`;
  return str;
}

/**
 * Returns the single symbol earned at a specific rebirth count.
 * Used for "Rebirth!" notifications to show what was just earned.
 */
export function getNewRebirthSymbol(rebirths, path = 'default') {
  if (!rebirths || rebirths <= 0) return '';
  const syms = REBIRTH_SYMBOLS[path] || REBIRTH_SYMBOLS.default;
  return syms[Math.min(rebirths - 1, 9)];
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
 *   level       — 1..MAX_LEVEL within the current cycle
 *   labelIndex  — index into the path's labels array
 *   roman       — one of ROMAN, e.g. 'I' … 'IV'
 *   label       — e.g. 'Aware'
 *   fullLabel   — e.g. 'Aware I'
 *   xpIntoLevel — XP earned within current level
 *   xpForLevel  — total XP span of current level
 *   progressPct — 0-100 percentage through current level
 *   rebirths    — number of completed full cycles (shown as stars)
 *   nextLabel   — full label of next level, or null at cycle cap
 *   xpToNext    — XP to next level, or null at cycle cap
 *   atCap       — true while sitting on the final level of the cycle
 *   xpToRebirth — XP until the next rebirth (always a number)
 *   isPrestige  — always false (kept for call-site compatibility)
 */
export function getPathLevel(gameXp, path = 'default') {
  const { rebirths, cycleXp } = getRebirthInfo(gameXp);
  const xp = cycleXp;
  const labels = PATHS[path]?.labels || PATHS.default.labels;

  // Flat cost ⇒ the level is plain division. cycleXp < REBIRTH_XP already
  // guarantees level ≤ MAX_LEVEL; the clamp guards against a corrupt gameXp.
  const level = Math.min(MAX_LEVEL, Math.floor(xp / XP_PER_LEVEL) + 1);

  // Clamped so a path supplying fewer words than LABEL_COUNT degrades to its
  // last word instead of rendering "undefined IV".
  const labelIndex = Math.min(
    Math.floor((level - 1) / LEVELS_PER_LABEL),
    labels.length - 1
  );
  const romanIndex = (level - 1) % LEVELS_PER_LABEL;
  const roman      = ROMAN[romanIndex];
  const label      = labels[labelIndex];
  const fullLabel  = `${label} ${roman}`;

  const atCap       = level === MAX_LEVEL;
  const xpForLevel  = XP_PER_LEVEL;
  const xpIntoLevel = xp - (level - 1) * XP_PER_LEVEL;
  // Null at the cap — there is no next level in this cycle, only a rebirth.
  // Call sites rely on that to tell "about to level up" from "about to rebirth".
  const xpToNext    = atCap ? null : xpForLevel - xpIntoLevel;
  // Always a number, including at the cap, where it drives the rebirth display.
  const xpToRebirth = REBIRTH_XP - xp;

  // Next level label (null when at the cap of this cycle)
  let nextLabel = null;
  if (!atCap) {
    const nextLabelIndex = Math.min(
      Math.floor(level / LEVELS_PER_LABEL),
      labels.length - 1
    );
    const nextRomanIndex = level % LEVELS_PER_LABEL;
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
    progressPct: Math.round((xpIntoLevel / xpForLevel) * 100),
    rebirths,
    nextLabel,
    xpToNext,
    atCap,
    xpToRebirth,
    isPrestige: false, // kept for compatibility; rebirth stars replace prestige
  };
}
