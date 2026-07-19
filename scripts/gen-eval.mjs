#!/usr/bin/env node
// Synthetic-calibration eval generator.
// Run: node --experimental-strip-types scripts/gen-eval.mjs [--seed 1] [--n 60]
//
// 1. Loads data/rashi.json, filters to records with >=1 usable dh word.
// 2. Stratified sample: dh word-count bucket (1-2, 3-4, 5+) x lk tercile.
// 3. Recovers the VOCALIZED dibbur by matching each dh token's consonant
//    skeleton against tokens from vt (then t).
// 4. Transliterates via the vendored engine in 3 styles.
// 5. Emits clean/sloppy query variants -> eval/queries.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transliterate } from './translit-vendor/engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/rashi.json');
const OUT_DIR = path.join(__dirname, '../eval');
const OUT_PATH = path.join(OUT_DIR, 'queries.json');
const README_PATH = path.join(OUT_DIR, 'README.md');

// ---- CLI args ----
const args = process.argv.slice(2);
let seed = 1;
let N = 60;
let partialMode = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed' && i + 1 < args.length) { seed = parseInt(args[++i], 10); }
  else if (args[i] === '--n' && i + 1 < args.length) { N = parseInt(args[++i], 10); }
  else if (args[i] === '--partial') { partialMode = true; }
}

// ---- Seeded RNG (copied from scripts/sample-rashis.mjs) ----
class SeededRandom {
  constructor(seed) {
    this.seed = seed === null ? Date.now() : seed;
  }
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
const rng = new SeededRandom(seed);

// ---- Hebrew helpers ----
const HEB_LETTER_RE = /[א-ת]/;
const NIKUD_FULL_RE = /[֑-ׇ]/g;   // taamim + nikud (full skeleton strip)
const TAAMIM_ONLY_RE = /[֑-֯]/g;  // cantillation only (keep nikud 05B0-05C7)
const MAQAF = '־';
const PLACEHOLDERS = new Set(["וגו'", 'וגו׳', "וכו'", 'וכו׳']);

function normApost(tok) {
  return tok.replace(/[’׳]/g, "'"); // normalize geresh variants to '
}

function isUsableDhToken(tok) {
  const n = normApost(tok);
  if (PLACEHOLDERS.has(n)) return false;
  return HEB_LETTER_RE.test(tok);
}

function stripTrailingPunct(tok) {
  return tok.replace(/[׳'"״]+$/g, '');
}

function skeleton(s) {
  return s.normalize('NFD').replace(NIKUD_FULL_RE, '').replace(new RegExp(MAQAF, 'g'), '').trim();
}

function tokenizeDh(dh) {
  return dh.split(/[\s־]+/).filter(Boolean);
}

function tokenizeVocalized(s) {
  // split on space and maqaf; strip cantillation but KEEP nikud
  return s
    .split(/[\s־]+/)
    .filter(Boolean)
    .map((t) => t.normalize('NFD').replace(TAAMIM_ONLY_RE, ''));
}

/** Recover vocalized dibbur tokens by skeleton-matching against vt then t. */
function recoverVocalizedDibbur(record, usableDhTokens) {
  const vtToks = tokenizeVocalized(record.vt || '');
  const tToks = tokenizeVocalized(record.t || '');
  const out = [];
  for (const raw of usableDhTokens) {
    const stripped = stripTrailingPunct(raw);
    const skel = skeleton(stripped);
    let match = vtToks.find((vt) => skeleton(vt) === skel);
    if (!match) match = tToks.find((t) => skeleton(t) === skel);
    if (!match) return null; // alignment failure
    out.push(match);
  }
  return out;
}

// ---- Load & filter ----
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

const usableRecords = [];
for (const r of data) {
  const dhToks = tokenizeDh(r.dh || '');
  const usable = dhToks.filter(isUsableDhToken);
  if (usable.length >= 1) usableRecords.push({ r, usableDhToks: usable });
}

function bucketFor(n) {
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  return '5+';
}

const buckets = { '1-2': [], '3-4': [], '5+': [] };
for (const rec of usableRecords) {
  buckets[bucketFor(rec.usableDhToks.length)].push(rec);
}

const perBucket = Math.round(N / 3);

// Build a spread-ordered candidate list per bucket (tercile-interleaved),
// mirroring sample-rashis.mjs's --spread approach.
function spreadOrder(list) {
  const sorted = [...list].sort((a, b) => (b.r.lk || 0) - (a.r.lk || 0));
  const thirdSize = Math.ceil(sorted.length / 3);
  const high = rng.shuffle(sorted.slice(0, thirdSize));
  const mid = rng.shuffle(sorted.slice(thirdSize, 2 * thirdSize));
  const low = rng.shuffle(sorted.slice(2 * thirdSize));
  const order = [];
  const maxLen = Math.max(high.length, mid.length, low.length);
  for (let i = 0; i < maxLen; i++) {
    if (high[i]) order.push(high[i]);
    if (mid[i]) order.push(mid[i]);
    if (low[i]) order.push(low[i]);
  }
  return order;
}

let skippedAlignment = 0;
const skippedLog = [];
const sampledRecords = [];

for (const bucketName of ['1-2', '3-4', '5+']) {
  const order = spreadOrder(buckets[bucketName]);
  let taken = 0;
  for (const cand of order) {
    if (taken >= perBucket) break;
    const vocalTokens = recoverVocalizedDibbur(cand.r, cand.usableDhToks);
    if (!vocalTokens) {
      skippedAlignment++;
      skippedLog.push(`${cand.r.b} ${cand.r.c}:${cand.r.v}#${cand.r.i} dh="${cand.r.dh}"`);
      continue;
    }
    sampledRecords.push({
      record: cand.r,
      dhWords: cand.usableDhToks.length,
      vocalizedDibbur: vocalTokens.join(' '),
    });
    taken++;
  }
  if (taken < perBucket) {
    console.warn(`WARNING: bucket ${bucketName} only found ${taken}/${perBucket} usable records.`);
  }
}

// ---- Transliterate & build query variants ----
const STYLES = ['000_simple_sefardi', '075_artscroll_sephardic', '010_simple_ashkenazi'];

function cleanVariantForPartial(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

if (partialMode) {
  // Simulate a user who only typed the FIRST TWO words of a long (5+ word)
  // dibbur — expected doc has LOW dh coverage, guarding D2 against
  // over-rewarding full-field coverage of some other short dh.
  const PARTIAL_OUT_PATH = path.join(OUT_DIR, 'queries-partial.json');
  const longBucket = sampledRecords.filter((s) => s.dhWords >= 5);
  const partialQueries = [];
  for (const { record, dhWords, vocalizedDibbur } of longBucket) {
    const firstTwo = vocalizedDibbur.split(' ').slice(0, 2).join(' ');
    if (!firstTwo) continue;
    const result = transliterate(firstTwo, {
      style: '075_artscroll_sephardic',
      syllableMode: 'none',
      accentMode: 'none',
    });
    const clean = cleanVariantForPartial(result.text);
    if (!clean) continue;
    partialQueries.push({
      id: `${record.b}.${record.c}.${record.v}.${record.i}__075_artscroll_sephardic__partial`,
      query: clean,
      style: '075_artscroll_sephardic',
      variant: 'partial',
      expected: { b: record.b, c: record.c, v: record.v, i: record.i },
      dhWords,
      lk: record.lk || 0,
    });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PARTIAL_OUT_PATH, JSON.stringify(partialQueries, null, 2));
  console.log(`Partial queries (first-two-words of 5+ word dibbur): ${partialQueries.length}`);
  console.log(`Output: ${PARTIAL_OUT_PATH}`);
  process.exit(0);
}

function cleanVariant(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sloppyVariant(clean) {
  return clean.replace(/'/g, '').replace(/([a-z])\1+/g, '$1');
}

const queries = [];
for (const { record, dhWords, vocalizedDibbur } of sampledRecords) {
  const seenQueries = new Set();
  for (const style of STYLES) {
    const result = transliterate(vocalizedDibbur, {
      style,
      syllableMode: 'none',
      accentMode: 'none',
    });
    const clean = cleanVariant(result.text);
    const sloppy = sloppyVariant(clean);
    const variants = [
      { variant: 'clean', query: clean },
      { variant: 'sloppy', query: sloppy },
    ];
    for (const { variant, query } of variants) {
      if (!query || seenQueries.has(query)) continue;
      seenQueries.add(query);
      queries.push({
        id: `${record.b}.${record.c}.${record.v}.${record.i}__${style}__${variant}`,
        query,
        style,
        variant,
        expected: { b: record.b, c: record.c, v: record.v, i: record.i },
        dhWords,
        lk: record.lk || 0,
      });
    }
  }
}

// ---- Write output ----
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(queries, null, 2));

const readme = `# eval/

This directory holds the synthetic-calibration eval set for transliterated search. \`queries.json\` is generated by \`scripts/gen-eval.mjs\`: it samples Rashi records stratified by dibbur-hamaschil word count and popularity (likes), recovers the vocalized (niqud) form of each dibbur by matching consonant skeletons against the record's vocalized verse/commentary text, and transliterates that vocalized dibbur through the vendored transliteration engine (\`scripts/translit-vendor/\`) in three styles (Sefardi, Ashkenazi, Artscroll), each in a "clean" and "sloppy" (typo-tolerant) variant. Each query record's \`expected\` field is the {book, chapter, verse, comment-index} of the Rashi it was derived from, so a search harness can check whether that record is recovered and at what rank.

To regenerate: \`node --experimental-strip-types scripts/gen-eval.mjs --seed 1 --n 60\` (defaults shown). The queries are entirely synthetic (machine-transliterated), not real user input — real queries collected from calibration sessions with a human transliterating by hand can be appended to \`queries.json\` manually, using \`style: "human"\` to distinguish them from the generated styles.
`;
fs.writeFileSync(README_PATH, readme);

console.log(`Records sampled: ${sampledRecords.length}`);
console.log(`Records skipped (alignment failure): ${skippedAlignment}`);
if (skippedLog.length) {
  console.log('Skipped examples:');
  for (const s of skippedLog.slice(0, 10)) console.log(`  - ${s}`);
}
console.log(`Total queries written: ${queries.length}`);
console.log(`Output: ${OUT_PATH}`);
