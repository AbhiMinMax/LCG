// Chains (spec §4): relations between situations, recalculated from event
// history. Pure functions; nothing is stored. Only completed logical days
// count, and a situation is never chained to itself.

import { logicalDayKey, normalizeDayStartHour } from './dayUtils';

export const CHAIN_DEFAULTS = {
  chainsEnabled: true,
  dayStartHour: 4,
  batchMinutes: 5,
  chainMinCount: 3,
  chainMinRate: 0.4,
  chainMinLift: 1.5,
  helpsMinCases: 3,
  helpsMinGap: 0.25,
  chainAfterLogLine: true,
};

// Thresholds are inclusive (≥). Rates/lifts are ratios of integers, so a
// value that is mathematically equal to a threshold can land a hair under it
// in floating point (CH1: 0.6 / 0.4 = 1.4999999999999998).
const EPS = 1e-9;
const atLeast = (value, threshold) => value >= threshold - EPS;

const isSuccess = c => c === 3 || c === 4;

/**
 * Analyse all events once. Returns query helpers for the UI.
 * `now` decides which logical day is "today" (ignored by every count).
 */
export function analyzeChains(events, config = {}, now = new Date()) {
  const cfg = { ...CHAIN_DEFAULTS, ...config };
  const dayStart = normalizeDayStartHour(cfg.dayStartHour);
  const batchMs = Number(cfg.batchMinutes) * 60000;
  const today = logicalDayKey(now, dayStart);

  // Completed-day events, grouped by logical day
  const evs = [];
  for (const e of events || []) {
    if (e.situation_id == null || !e.timestamp) continue;
    const day = logicalDayKey(e.timestamp, dayStart);
    if (day >= today) continue;
    evs.push({ sit: e.situation_id, t: new Date(e.timestamp).getTime(), day, ok: isSuccess(e.choice_value) });
  }
  const byDay = new Map();
  for (const e of evs) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }

  // For each event: situations logged on the same day more than batchMinutes later
  const followedBy = new Map(); // event → Set(sit)
  for (const dayEvs of byDay.values()) {
    for (const a of dayEvs) {
      const set = new Set();
      for (const b of dayEvs) if (b.t - a.t > batchMs) set.add(b.sit);
      followedBy.set(a, set);
    }
  }

  const sits = [...new Set(evs.map(e => e.sit))];
  const nOf = {};
  for (const e of evs) nOf[e.sit] = (nOf[e.sit] || 0) + 1;

  // base(B): among non-B events, the fraction followed by B
  const base = {};
  for (const B of sits) {
    let denom = 0, num = 0;
    for (const e of evs) {
      if (e.sit === B) continue;
      denom++;
      if (followedBy.get(e).has(B)) num++;
    }
    base[B] = denom > 0 ? num / denom : 0;
  }

  // Sequence chains A → B
  const sequence = []; // passing only
  const seqPass = new Set(); // "A>B"
  for (const A of sits) {
    const aEvs = evs.filter(e => e.sit === A);
    for (const B of sits) {
      if (A === B || base[B] === 0) continue;
      const follows = aEvs.filter(e => followedBy.get(e).has(B)).length;
      const n = aEvs.length;
      const rate = follows / n;
      const lift = rate / base[B];
      if (follows >= cfg.chainMinCount && atLeast(rate, cfg.chainMinRate) && atLeast(lift, cfg.chainMinLift)) {
        sequence.push({ from: A, to: B, follows, n, rate, lift });
        seqPass.add(`${A}>${B}`);
      }
    }
  }

  // Same-day relations A & B (unordered)
  const daysWith = {};
  for (const [day, dayEvs] of byDay) {
    for (const s of new Set(dayEvs.map(e => e.sit))) (daysWith[s] ||= new Set()).add(day);
  }
  const D = byDay.size;
  const sameDay = [];
  for (let i = 0; i < sits.length; i++) {
    for (let j = i + 1; j < sits.length; j++) {
      const A = sits[i], B = sits[j];
      if (seqPass.has(`${A}>${B}`) || seqPass.has(`${B}>${A}`)) continue;
      const dA = daysWith[A].size, dB = daysWith[B].size;
      let dAB = 0;
      for (const d of daysWith[A]) if (daysWith[B].has(d)) dAB++;
      if (dAB === 0) continue;
      const lift = (dAB * D) / (dA * dB);
      if (dAB >= cfg.chainMinCount && atLeast(dAB / Math.min(dA, dB), cfg.chainMinRate) && atLeast(lift, cfg.chainMinLift)) {
        sameDay.push({ a: A, b: B, days: dAB, lift });
      }
    }
  }

  // Helps: A (success) helps B
  const helps = [];
  for (const B of sits) {
    const bEvs = evs.filter(e => e.sit === B);
    for (const A of sits) {
      if (A === B) continue;
      let withN = 0, withOk = 0, withoutN = 0, withoutOk = 0;
      for (const b of bEvs) {
        const dayEvs = byDay.get(b.day);
        const helped = dayEvs.some(a => a.sit === A && a.ok && b.t - a.t > batchMs);
        if (helped) { withN++; if (b.ok) withOk++; } else { withoutN++; if (b.ok) withoutOk++; }
      }
      if (withN < cfg.helpsMinCases || withoutN < cfg.helpsMinCases) continue;
      const gap = withOk / withN - withoutOk / withoutN;
      if (atLeast(gap, cfg.helpsMinGap)) {
        helps.push({ from: A, to: B, withOk, withN, withoutOk, withoutN, gap });
      }
    }
  }

  const byStrength = (x, y) => y.rate - x.rate || y.follows - x.follows;

  return {
    sequence,
    sameDay,
    helps,
    nOf,

    // "Comes with" for one situation (spec §4.6)
    comesWith(sitId) {
      return {
        before: sequence.filter(c => c.to === sitId).sort(byStrength),
        after: sequence.filter(c => c.from === sitId).sort(byStrength),
        sameDay: sameDay
          .filter(r => r.a === sitId || r.b === sitId)
          .map(r => ({ other: r.a === sitId ? r.b : r.a, days: r.days, lift: r.lift }))
          .sort((x, y) => y.days - x.days || y.lift - x.lift),
        helps: helps.filter(h => h.to === sitId).sort((x, y) => y.gap - x.gap || y.withN - x.withN),
      };
    },

    // Strongest passing A → B for the after-log line (highest rate, then follows)
    strongestAfter(sitId) {
      return sequence.filter(c => c.from === sitId).sort(byStrength)[0] || null;
    },

    // Routes among a set of situations (spec §4.5): paths of ≥2 passing
    // sequence edges, no repeats, up to 4 situations, maximal only, top `limit`
    // by their weakest edge (smallest follows).
    routes(sitIds, limit = 3) {
      const allowed = new Set(sitIds);
      const edges = sequence.filter(c => allowed.has(c.from) && allowed.has(c.to));
      const out = {};
      for (const e of edges) (out[e.from] ||= []).push(e);
      const paths = [];
      const walk = (path, minFollows) => {
        const last = path[path.length - 1];
        if (path.length >= 3) paths.push({ path: [...path], minFollows });
        if (path.length === 4) return;
        for (const e of out[last] || []) {
          if (path.includes(e.to)) continue;
          walk([...path, e.to], Math.min(minFollows, e.follows));
        }
      };
      for (const e of edges) walk([e.from, e.to], e.follows);
      const key = p => p.join('>');
      const contains = (long, short) => long.length > short.length && key(long).includes(key(short)) &&
        long.some((_, i) => short.every((s, k) => long[i + k] === s));
      const maximal = paths.filter(p => !paths.some(q => contains(q.path, p.path)));
      return maximal
        .sort((x, y) => y.minFollows - x.minFollows || y.path.length - x.path.length)
        .slice(0, limit);
    },
  };
}
