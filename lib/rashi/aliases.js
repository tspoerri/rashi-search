// Alias-table helpers shared by every corpus's smart-query parser.
"use strict";
import { boundedEditDistance } from "../chipus/src/index.js";

// A folded/exact key claimed by two different units identifies nothing.
export const AMBIG = Symbol("ambiguous-alias");

export function aliasSet(map, key, val) {
  if (!key) return;
  const cur = map.get(key);
  map.set(key, cur === undefined || cur === val ? val : AMBIG);
}

// Typo fallback for alias lookup: only called after an exact-key lookup misses.
// Closest folded key within a bounded edit distance; a tie between two
// different values is "ambiguous" (returns null) rather than guessed at.
export function fuzzyAlias(map, keyCandidates) {
  let bestD = Infinity, bestVal = null, ambiguous = false;
  for (const cand of keyCandidates) {
    if (cand.length < 3) continue;
    const maxD = cand.length >= 6 ? 2 : 1;
    for (const [key, val] of map) {
      const d = boundedEditDistance(cand, key, maxD);
      if (d === Infinity) continue;
      if (d < bestD) { bestD = d; bestVal = val === AMBIG ? null : val; ambiguous = val === AMBIG; }
      else if (d === bestD && (val === AMBIG || val !== bestVal)) ambiguous = true;
    }
  }
  return ambiguous ? null : bestVal;
}
