#!/usr/bin/env node
// Eval harness: runs eval/queries.json through the REAL search pipeline
// extracted live from index.html (smartParse -> resolveSoft -> search),
// and reports rank statistics for the expected Rashi record on each query.
//
// Run: node scripts/eval.mjs [--json]
//
// How it works: the inline <script type="module"> is regexed out of
// index.html, its chipus import is rewritten to an absolute file:// path,
// live-binding exports are appended so we can call its internal functions,
// and it's written to a temp .mjs file and dynamically imported. DOM globals
// (document.*, Option) are stubbed as permissive no-ops before import since
// the script touches them at module top-level. fetch() is stubbed: the
// "data/rashi.json" request resolves with our own parsed copy of the data,
// and the Sefaria calendar request is made to reject so weekBoost stays 0
// (matches "offline" behavior the page already handles via try/catch).

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
const QUERIES_PATH = path.join(REPO_ROOT, 'eval/queries.json');
const RESULTS_PATH = path.join(REPO_ROOT, 'eval/results-baseline.json');
const DATA_PATH = path.join(REPO_ROOT, 'data/rashi.json');

const wantJson = process.argv.includes('--json');

// ---- DOM / fetch stubs ----
function makeFakeElement() {
  const store = {
    value: '', innerHTML: '', textContent: '', className: '',
    options: [], length: 0, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'addEventListener' || prop === 'removeEventListener') return () => {};
      if (prop === 'querySelectorAll') return () => [];
      if (prop === 'querySelector') return () => null;
      if (prop === 'add') return (opt) => { target.options.push(opt); };
      if (prop === 'dispatchEvent') return () => true;
      if (prop === 'focus' || prop === 'setSelectionRange') return () => {};
      if (prop === 'closest') return () => null;
      if (typeof prop === 'symbol') return undefined;
      return () => makeFakeElement();
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function installStubs(rashiData) {
  const elCache = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elCache.has(id)) elCache.set(id, makeFakeElement());
      return elCache.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement() { return makeFakeElement(); },
  };
  globalThis.Option = class Option {
    constructor(text, value) { this.text = text; this.value = value; }
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = (url) => {
    const u = String(url);
    if (u.includes('data/rashi.json')) {
      return Promise.resolve({ json: () => Promise.resolve(rashiData) });
    }
    return Promise.reject(new Error('network disabled in eval harness'));
  };
  return () => { globalThis.fetch = origFetch; };
}

// ---- extract & prep the page's module script ----
function extractPageModule() {
  const html = fs.readFileSync(INDEX_HTML, 'utf-8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Could not find inline <script type="module"> in index.html');
  let code = m[1];

  const chipusAbs = pathToFileURL(path.join(REPO_ROOT, 'lib/chipus/src/index.js')).href;
  code = code.replace('./lib/chipus/src/index.js', chipusAbs);

  code += '\nexport { smartParse, resolveSoft, search, DB, NORM, chipusIndex };\n';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rashi-eval-'));
  const tmpFile = path.join(tmpDir, 'page-module.mjs');
  fs.writeFileSync(tmpFile, code);
  return tmpFile;
}

async function loadPipeline() {
  const rashiData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const restoreFetch = installStubs(rashiData);
  const tmpFile = extractPageModule();
  const ns = await import(pathToFileURL(tmpFile).href);
  for (let i = 0; i < 200 && !ns.chipusIndex; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!ns.chipusIndex) throw new Error('chipusIndex never initialized — check fetch/DOM stubs');
  restoreFetch();
  return ns;
}

// ---- ranking ----
function findExpectedIndex(DB, expected) {
  return DB.findIndex(
    (r) => r.b === expected.b && r.c === expected.c && r.v === expected.v && r.i === expected.i,
  );
}

function rankQuery(ns, query) {
  const q = ns.resolveSoft(ns.smartParse(query.query));
  const hits = q._softHits || ns.search(q);
  const targetIdx = findExpectedIndex(ns.DB, query.expected);
  const targetHit = hits.find((h) => h.i === targetIdx);
  const topHit = hits[0] ? ns.DB[hits[0].i] : null;

  if (!targetHit) {
    return { rank: Infinity, tie: 0, topHitRef: topHit ? refOf(topHit) : null, hitsReturned: hits.length };
  }
  const strictRank = 1 + hits.filter((h) => h.score > targetHit.score).length;
  const tie = hits.filter((h) => h.score === targetHit.score).length;
  return { rank: strictRank, tie, topHitRef: topHit ? refOf(topHit) : null, hitsReturned: hits.length };
}

function refOf(r) {
  return `${r.b} ${r.c}:${r.v}#${r.i}`;
}

function bucketFor(n) {
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  return '5+';
}

// ---- stats aggregation ----
function newAgg() {
  return { n: 0, top1: 0, top1tied: 0, top3: 0, mrrSum: 0, miss: 0 };
}
function addToAgg(agg, r) {
  agg.n++;
  if (r.rank === Infinity) { agg.miss++; return; }
  if (r.rank === 1 && r.tie === 1) agg.top1++;
  if (r.rank === 1) agg.top1tied++;
  if (r.rank <= 3) agg.top3++;
  agg.mrrSum += 1 / r.rank;
}
function fmtAgg(label, agg) {
  const pct = (x) => (agg.n ? ((x / agg.n) * 100).toFixed(1) + '%' : 'n/a');
  const mrr = agg.n ? (agg.mrrSum / agg.n).toFixed(3) : 'n/a';
  return [label, agg.n, pct(agg.top1), pct(agg.top1tied), pct(agg.top3), mrr, pct(agg.miss)];
}

function printTable(rows) {
  const headers = ['group', 'n', 'top1', 'top1-tied', 'top3', 'MRR', 'miss'];
  const all = [headers, ...rows].map((r) => r.map(String));
  const widths = headers.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  for (const r of all) {
    console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '));
  }
}

// ---- reusable: run a query set through the (already-loaded) pipeline and
// aggregate stats. Used both by the CLI main() below and by scripts/sweep.mjs,
// which sweeps chipus v3 ranking opts (coverageWeight, refineWeightLatin) by
// mutating them directly on the live ns.chipusIndex between runs — the index
// only needs to be built once since search() reads those fields fresh. ----
function runOnQueries(ns, queries) {
  const results = [];
  for (const query of queries) {
    const r = rankQuery(ns, query);
    results.push({ ...query, ...r });
  }

  const overall = newAgg();
  const byStyle = {};
  const byVariant = {};
  const byBucket = {};
  for (const r of results) {
    addToAgg(overall, r);
    (byStyle[r.style] ??= newAgg());
    addToAgg(byStyle[r.style], r);
    (byVariant[r.variant] ??= newAgg());
    addToAgg(byVariant[r.variant], r);
    const b = bucketFor(r.dhWords);
    (byBucket[b] ??= newAgg());
    addToAgg(byBucket[b], r);
  }

  const worst = [...results]
    .sort((a, b) => {
      const ra = a.rank === Infinity ? 1e9 : a.rank;
      const rb = b.rank === Infinity ? 1e9 : b.rank;
      return rb - ra;
    })
    .slice(0, 15);

  return { results, overall, byStyle, byVariant, byBucket, worst };
}

function printReport(label, agg) {
  console.log(`\n${label}: ${agg.results.length} queries\n`);
  const rows = [fmtAgg('overall', agg.overall)];
  for (const style of Object.keys(agg.byStyle).sort()) rows.push(fmtAgg('style:' + style, agg.byStyle[style]));
  for (const variant of Object.keys(agg.byVariant).sort()) rows.push(fmtAgg('variant:' + variant, agg.byVariant[variant]));
  for (const b of ['1-2', '3-4', '5+']) if (agg.byBucket[b]) rows.push(fmtAgg('dhWords:' + b, agg.byBucket[b]));
  printTable(rows);

  console.log('\n15 worst queries:\n');
  for (const w of agg.worst) {
    const rankStr = w.rank === Infinity ? 'MISS' : `#${w.rank}${w.tie > 1 ? ` (tie of ${w.tie})` : ''}`;
    console.log(
      `  [${rankStr}] "${w.query}" (${w.style}/${w.variant}) expected=${refOf(w.expected)} top=${w.topHitRef ?? 'n/a'}`,
    );
  }
}

// ---- main (CLI entry point; only runs when this file is executed
// directly, not when imported by a sweep driver) ----
async function main() {
  const ns = await loadPipeline();
  const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf-8'));

  const agg = runOnQueries(ns, queries);
  printReport('Eval results', agg);

  if (wantJson) {
    fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(agg.results, null, 2));
    console.log(`\nFull per-query results written to ${RESULTS_PATH}`);
  }
}

const isMainModule = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export {
  loadPipeline, rankQuery, findExpectedIndex, refOf, bucketFor,
  newAgg, addToAgg, fmtAgg, printTable, runOnQueries, printReport,
  QUERIES_PATH, REPO_ROOT,
};
