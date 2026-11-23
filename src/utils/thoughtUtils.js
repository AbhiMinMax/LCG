// Linked thoughts (spec §2): situation-level thought pairs with stable ids,
// and the stats derived from events that picked them. Pure functions only.

export const isSuccessChoice = c => c === 3 || c === 4;

export function newPairId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'tp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const cleanText = t => (typeof t === 'string' && t.trim() ? t.trim() : null);

/**
 * Normalise a pair list: trimmed text (empty → null), a stable `id`,
 * `archived` flag and `created_at` (creation order, used for "newest first").
 * Pairs with neither side are dropped. Existing ids/created_at are kept.
 * Pairs without created_at get one from `base` + their position, so older
 * lists keep their original order.
 */
export function normalizeThoughtPairs(pairs, base = new Date(0)) {
  if (!Array.isArray(pairs)) return [];
  const baseMs = new Date(base).getTime() || 0;
  const out = [];
  pairs.forEach((p, i) => {
    if (!p) return;
    const back = cleanText(p.back);
    const forth = cleanText(p.forth);
    if (back === null && forth === null) return;
    out.push({
      ...p,
      id: p.id || newPairId(),
      back,
      forth,
      archived: p.archived === true,
      created_at: p.created_at || new Date(baseMs + i).toISOString(),
    });
  });
  return out;
}

// Legacy back_thoughts/forth_thoughts arrays → pairs (index-aligned).
export function pairsFromLegacy(situation) {
  const back = situation.back_thoughts || [];
  const forth = situation.forth_thoughts || [];
  const len = Math.max(back.length, forth.length);
  return Array.from({ length: len }, (_, i) => ({ back: back[i] || null, forth: forth[i] || null }));
}

const ratio = (held, used) => (used > 0 ? held / used : 0);
const ts = d => (d ? new Date(d).getTime() : 0);

/**
 * Build all stats for one situation from its pairs and its events.
 * Picks that don't match a pair id are ignored.
 */
export function buildThoughtStats(pairs, events) {
  const byId = Object.fromEntries((pairs || []).map(p => [p.id, p]));
  const newness = id => ts(byId[id]?.created_at);

  const backStats = {};   // backId → { appeared, held }
  const forthAll = {};    // forthId → { used, held, last } (last use on this situation)
  const forthVs = {};     // backId → forthId → { used, held, last }
  const forthSolo = {};   // forthId → { used, held } (events with no Back pick)
  let anyPick = false;

  for (const e of events || []) {
    const b = byId[e.selected_back_thought] ? e.selected_back_thought : null;
    const f = byId[e.selected_forth_thought] ? e.selected_forth_thought : null;
    if (!b && !f) continue;
    anyPick = true;
    const ok = isSuccessChoice(e.choice_value);
    if (b) {
      const s = (backStats[b] ||= { appeared: 0, held: 0 });
      s.appeared++;
      if (ok) s.held++;
    }
    if (f) {
      const s = (forthAll[f] ||= { used: 0, held: 0, last: 0 });
      s.used++;
      if (ok) s.held++;
      s.last = Math.max(s.last, ts(e.timestamp));
      if (b) {
        const v = ((forthVs[b] ||= {})[f] ||= { used: 0, held: 0, last: 0 });
        v.used++;
        if (ok) v.held++;
        v.last = Math.max(v.last, ts(e.timestamp));
      } else {
        const solo = (forthSolo[f] ||= { used: 0, held: 0 });
        solo.used++;
        if (ok) solo.held++;
      }
    }
  }

  const activeBacks = (pairs || []).filter(p => !p.archived && p.back !== null);
  const activeForths = (pairs || []).filter(p => !p.archived && p.forth !== null);

  // Backs: times selected desc, then newest pair first.
  const backOptions = () =>
    activeBacks
      .map(p => ({ id: p.id, text: p.back, count: backStats[p.id]?.appeared || 0 }))
      .sort((a, b) => b.count - a.count || newness(b.id) - newness(a.id));

  // Forths: against the selected Back if any, else overall.
  const forthOptions = (selectedBackId = null) => {
    const vs = selectedBackId ? forthVs[selectedBackId] || {} : null;
    return activeForths
      .map(p => {
        const all = forthAll[p.id] || { used: 0, held: 0 };
        const rec = vs ? vs[p.id] || { used: 0, held: 0 } : all;
        return { id: p.id, text: p.forth, held: rec.held, used: rec.used, heldAll: all.held };
      })
      .sort((a, b) =>
        vs
          ? b.held - a.held || ratio(b.held, b.used) - ratio(a.held, a.used) || b.heldAll - a.heldAll || newness(b.id) - newness(a.id)
          : b.held - a.held || ratio(b.held, b.used) - ratio(a.held, a.used) || newness(b.id) - newness(a.id)
      );
  };

  // Thoughts view (spec §2.3). Includes archived pairs (marked by the caller).
  const thoughtsView = () => {
    const backs = Object.entries(backStats)
      .map(([id, s]) => {
        const candidates = Object.entries(forthVs[id] || {})
          .filter(([, v]) => v.held >= 1)
          // Ties: higher ratio, then the Forth used most recently on this situation (LT3)
          .sort(([fa, a], [fb, b]) => b.held - a.held || ratio(b.held, b.used) - ratio(a.held, a.used) || forthAll[fb].last - forthAll[fa].last);
        const best = candidates[0]
          ? { id: candidates[0][0], text: byId[candidates[0][0]].forth, archived: byId[candidates[0][0]].archived, held: candidates[0][1].held, used: candidates[0][1].used }
          : null;
        return {
          id,
          text: byId[id].back,
          archived: byId[id].archived,
          appeared: s.appeared,
          held: s.held,
          best,
          noAnswer: !best && s.appeared >= 2,
        };
      })
      .sort((a, b) => b.appeared - a.appeared || newness(b.id) - newness(a.id));
    const solo = Object.entries(forthSolo)
      .map(([id, s]) => ({ id, text: byId[id].forth, archived: byId[id].archived, held: s.held, used: s.used }))
      .sort((a, b) => b.held - a.held || ratio(b.held, b.used) - ratio(a.held, a.used) || newness(b.id) - newness(a.id));
    return { backs, solo };
  };

  return { anyPick, backOptions, forthOptions, thoughtsView };
}

// Pair ids referenced by any event's picks.
export function referencedPairIds(events) {
  const ids = new Set();
  for (const e of events || []) {
    if (e.selected_back_thought) ids.add(e.selected_back_thought);
    if (e.selected_forth_thought) ids.add(e.selected_forth_thought);
  }
  return ids;
}

// Text to show for an event's pick: the pair's current text for that side,
// "(archived)" if archived. Falls back to legacy free-text picks.
export function pickText(situation, pick, side) {
  if (!pick) return null;
  const pair = (situation?.thought_pairs || []).find(p => p.id === pick);
  if (!pair) return typeof pick === 'string' ? { text: pick, archived: false } : null;
  const text = side === 'back' ? pair.back : pair.forth;
  if (text === null || text === undefined) return null;
  return { text, archived: pair.archived === true };
}
