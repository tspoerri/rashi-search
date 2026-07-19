// Vendored from ../chipus v0.1 (src/engine.js) — do not edit here.
// To pick up upstream changes, re-copy from ../chipus/src/.

// chipus — the search engine: a tiny in-memory index over phonetic keys.
//
// Architecture (deliberately simple — built for corpora of ~10⁴ short docs,
// entirely client-side, zero dependencies):
//
//   * Index time: every field of every doc is tokenized; each token folds to
//     its phonetic key(s) (see fold.js) and lands in an inverted index
//     Map<key, postings>. Postings record (doc, field, word-position) so
//     scoring can reward phrase adjacency and apps can highlight matches.
//   * Query time: each query token folds to candidate keys, which are
//     matched in tiers — exact key, key prefix, then bounded edit distance
//     over the key VOCABULARY (a few thousand unique keys, not the corpus),
//     so typo tolerance costs almost nothing.
//   * Tier scores are fixed so that a true exact match always outranks a
//     prefix match, which outranks a fuzzy match; field weights and phrase/
//     coverage bonuses stack on top.
//
// Fuzzy matching runs on phonetic keys, not raw text — an edit distance of 1
// on a vowel-free consonant skeleton is a much stronger signal than edit
// distance 1 on raw letters, and folding has already absorbed the entire
// spelling-variant space (nikud, ktiv male/chaser, Ashkenazi/Sephardi,
// Yiddish orthography) before edit distance is ever consulted.

import { foldToken, tokenize } from "./fold.js";

// EXACT is set so that an exact match in a weight-1 field still outranks a
// fuzzy match in a weight-3 field (150 > 40×3) — fuzziness should never
// beat the real word, whatever the field weights.
const TIER = {
  EXACT: 150,
  PREFIX: 55,
  FUZZY1: 40, // edit distance 1, key length >= 3
  FUZZY2: 25, // edit distance 2, key length >= 6
};

const PREFIX_MIN_KEY = 2;    // don't prefix-expand ultra-short keys
const PREFIX_MAX_EXPANSIONS = 40;
const ADJACENCY_BONUS = 30;  // consecutive query tokens adjacent in a field
const ALL_TOKENS_FACTOR = 1.5;

export class ChipusIndex {
  /**
   * @param {object} [opts]
   * @param {{name: string, weight?: number}[]} [opts.fields]
   *   Which properties of each doc to index, with relative weights.
   *   Defaults to a single field `text` at weight 1.
   */
  constructor(opts = {}) {
    this.fields = (opts.fields || [{ name: "text", weight: 1 }]).map((f) => ({
      name: f.name,
      weight: f.weight ?? 1,
    }));
    this.docs = [];
    this.postings = new Map(); // key -> flat int array [docIdx, fieldIdx, wordIdx, ...]
    this._vocab = null;        // sorted key array, built lazily
    this._byLength = null;     // Map<keyLength, key[]> for fuzzy scans
  }

  /** Add one doc or an array of docs. Fields are read by name; missing/empty fields are fine. */
  add(docOrDocs) {
    const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
    for (const doc of docs) {
      const docIdx = this.docs.length;
      this.docs.push(doc);
      for (let f = 0; f < this.fields.length; f++) {
        const text = doc[this.fields[f].name];
        if (!text) continue;
        const tokens = tokenize(String(text));
        for (let w = 0; w < tokens.length; w++) {
          for (const key of foldToken(tokens[w])) {
            let arr = this.postings.get(key);
            if (!arr) this.postings.set(key, (arr = []));
            arr.push(docIdx, f, w);
          }
        }
      }
    }
    this._vocab = null;
    this._byLength = null;
  }

  /**
   * Search. Query may freely mix Hebrew, transliteration, Yiddish, digits.
   * @returns {{doc: object, score: number, matches: {token, key, field, wordIndex, tier}[]}[]}
   */
  search(query, { limit = 20, fuzzy = true } = {}) {
    const qtokens = tokenize(query);
    if (!qtokens.length) return [];
    this._ensureVocab();

    // Per token: best match tier per (doc, field), plus positions for
    // adjacency scoring.
    const perToken = qtokens.map((tok) => this._matchToken(tok, fuzzy));

    // Combine: doc -> score
    const docScores = new Map(); // docIdx -> {score, tokensMatched, matches, byToken}
    perToken.forEach((tokenHits, tIdx) => {
      for (const [docIdx, hit] of tokenHits) {
        let e = docScores.get(docIdx);
        if (!e) docScores.set(docIdx, (e = { score: 0, tokensMatched: 0, matches: [], byToken: new Map() }));
        e.tokensMatched++;
        e.score += hit.tier * this.fields[hit.field].weight;
        e.matches.push({ token: qtokens[tIdx], key: hit.key, field: this.fields[hit.field].name, wordIndex: hit.wordIndex, tier: hit.tier });
        e.byToken.set(tIdx, hit.positions);
      }
    });

    const results = [];
    for (const [docIdx, e] of docScores) {
      // Phrase bonus: consecutive query tokens matched at consecutive word
      // positions in the same field. All positions at the matched tier are
      // considered, so a repeated word ("לך לך") earns its adjacency even
      // though both query tokens share one key.
      for (const [tIdx, positions] of e.byToken) {
        const next = e.byToken.get(tIdx + 1);
        if (!next) continue;
        const adjacent = positions.some(([f, w]) =>
          next.some(([f2, w2]) => f2 === f && w2 === w + 1)
        );
        if (adjacent) e.score += ADJACENCY_BONUS;
      }
      if (e.tokensMatched === qtokens.length && qtokens.length > 1) {
        e.score *= ALL_TOKENS_FACTOR;
      }
      results.push({ doc: this.docs[docIdx], score: e.score, matches: e.matches });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // --- internals ---------------------------------------------------------

  // For one query token, return Map<docIdx, {tier, field, wordIndex, key,
  // positions}> keeping the best-scoring hit per doc (best tier, then best
  // field weight) for scoring, plus every position seen at that best tier
  // (capped) for phrase-adjacency checks.
  _matchToken(token, fuzzy) {
    const MAX_POSITIONS = 16;
    const keys = foldToken(token);
    const hits = new Map();
    const record = (postings, tier, key) => {
      for (let i = 0; i < postings.length; i += 3) {
        const docIdx = postings[i], field = postings[i + 1], wordIndex = postings[i + 2];
        const prev = hits.get(docIdx);
        if (!prev || tier > prev.tier) {
          hits.set(docIdx, { tier, field, wordIndex, key, positions: [[field, wordIndex]] });
        } else if (tier === prev.tier) {
          if (this.fields[field].weight > this.fields[prev.field].weight) {
            prev.field = field;
            prev.wordIndex = wordIndex;
            prev.key = key;
          }
          if (prev.positions.length < MAX_POSITIONS) prev.positions.push([field, wordIndex]);
        }
      }
    };

    for (const key of keys) {
      const exact = this.postings.get(key);
      if (exact) record(exact, TIER.EXACT, key);

      // digits: exact only
      if (/^\d+$/.test(key)) continue;

      if (key.length >= PREFIX_MIN_KEY) {
        let expanded = 0;
        for (const vkey of this._vocabRange(key)) {
          if (vkey === key) continue;
          record(this.postings.get(vkey), TIER.PREFIX, vkey);
          if (++expanded >= PREFIX_MAX_EXPANSIONS) break;
        }
      }

      if (fuzzy && key.length >= 3) {
        const maxD = key.length >= 6 ? 2 : 1;
        const bucketRange = this._lengthNeighbors(key.length, maxD);
        for (const vkey of bucketRange) {
          if (vkey === key || vkey.startsWith(key)) continue; // already tiered
          const d = boundedEditDistance(key, vkey, maxD);
          if (d === 1) record(this.postings.get(vkey), TIER.FUZZY1, vkey);
          else if (d === 2) record(this.postings.get(vkey), TIER.FUZZY2, vkey);
        }
      }
    }
    return hits;
  }

  _ensureVocab() {
    if (this._vocab) return;
    this._vocab = [...this.postings.keys()].sort();
    this._byLength = new Map();
    for (const key of this._vocab) {
      let bucket = this._byLength.get(key.length);
      if (!bucket) this._byLength.set(key.length, (bucket = []));
      bucket.push(key);
    }
  }

  // All vocab keys starting with `prefix` (binary search on the sorted array).
  *_vocabRange(prefix) {
    const v = this._vocab;
    let lo = 0, hi = v.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < v.length && v[i].startsWith(prefix); i++) yield v[i];
  }

  *_lengthNeighbors(len, maxD) {
    for (let l = Math.max(1, len - maxD); l <= len + maxD; l++) {
      const bucket = this._byLength.get(l);
      if (bucket) yield* bucket;
    }
  }
}

// Two-row Levenshtein with early abort; returns Infinity when distance > maxD.
export function boundedEditDistance(a, b, maxD) {
  if (Math.abs(a.length - b.length) > maxD) return Infinity;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxD) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] <= maxD ? prev[b.length] : Infinity;
}
