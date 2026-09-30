// CorpusStore: lazy per-unit shard loading, chunked indexing, and scoring for
// one corpus (Torah / Nach / Bavli). All corpus-specific behaviour comes from
// the corpus config (lib/rashi/corpora/*.js); this file has no DOM access so it
// runs unchanged in node tests.
"use strict";
import { normalize, skel, wordMatch, popBoost } from "./text.js";

export const INDEX_CHUNK = 600;   // records per yield while normalizing + indexing

// Winning chipus v3 ranking opts from the 2026-07-19 sweep (chipus
// DESIGN-v3.md "Sweep results"). Overridable via globalThis.CHIPUS_OPTS so the
// eval/sweep harness can test other configs without editing this file.
export function defaultChipusOpts() {
  return globalThis.CHIPUS_OPTS || { coverageWeight: 20, refineWeightLatin: 40 };
}

export class CorpusStore {
  // deps: { ChipusIndex, fetchJson(url), yieldFn(), now() }
  constructor(cfg, deps) {
    this.cfg = cfg;
    this.deps = deps;
    this.units = [];            // [{id, he, file, count, ord, ...}] canonical order
    this.DB = [];               // records in memory (union of loaded units)
    this.NORM = [];             // {dh, dhS, t} per record, parallel to DB
    this.ORD = [];              // canonical sort key per DB row, parallel to DB
    this.LOADED = new Set();
    this.INFLIGHT = new Map();
    this.total = 0;
    this.fullLoaded = false;
    this.loadingAll = false;
    this.indexMs = 0;
    this.ready = false;
    this.chipusIndex = null;
    this.docIndex = new Map();  // record -> DB index
    this.state = {};            // corpus-owned scratch space
  }

  async init() {
    const cfg = this.cfg;
    let units;
    if (cfg.manifestUrl) {
      units = cfg.parseManifest(await this.deps.fetchJson(cfg.manifestUrl));
    } else {
      units = cfg.staticUnits;
    }
    units.forEach((u, ord) => {
      this.units.push({ ...u, ord });
      this.total += u.count || 0;
    });
    this.chipusIndex = new this.deps.ChipusIndex({
      fields: [
        { name: "dh", weight: 3 },
        { name: "t", weight: 1 },
        { name: "vt", weight: 1 },
      ],
      ...defaultChipusOpts(),
    });
    if (cfg.setup) cfg.setup(this);
    this.ready = true;
  }

  unit(id) { return this.units.find((u) => u.id === id); }

  // Load one unit's shard. Idempotent and safe to call concurrently: a second
  // call for a unit already in flight awaits the first instead of re-indexing.
  ensureUnit(id, onProgress) {
    if (this.LOADED.has(id)) return Promise.resolve();
    const inflight = this.INFLIGHT.get(id);
    if (inflight) return inflight;
    const u = this.unit(id);
    if (!u) return Promise.resolve();
    const p = (async () => {
      if (onProgress) onProgress("Loading " + (u.he || u.id) + "…");
      const arr = await this.deps.fetchJson(this.cfg.dataDir + u.file);
      await this.addShard(u, arr, onProgress);
      this.LOADED.add(id);
    })();
    const tracked = p.finally(() => this.INFLIGHT.delete(id));
    this.INFLIGHT.set(id, tracked);
    return tracked;
  }

  // Normalize + index one shard in INDEX_CHUNK slices, yielding between them so
  // the main thread (and iOS Safari's watchdog) stays responsive.
  async addShard(u, arr, onProgress) {
    const t0 = this.deps.now();
    // Canonical sort key: manifest order, then position within the shard, so
    // result ordering never depends on which units happened to load first.
    const base = u.ord * 1e6;
    for (let s = 0; s < arr.length; s += INDEX_CHUNK) {
      const chunk = arr.slice(s, s + INDEX_CHUNK);
      for (let k = 0; k < chunk.length; k++) {
        const r = chunk[k];
        this.docIndex.set(r, this.DB.length);
        this.DB.push(r);
        this.ORD.push(base + s + k);
        // Only dh, dhS and t are read by search(); free text goes through
        // chipus, which indexes vt itself from the raw record.
        const dh = normalize(r.dh);
        this.NORM.push({ dh, dhS: skel(dh), t: normalize(r.t) });
      }
      this.chipusIndex.add(chunk);
      if (onProgress) {
        onProgress("Indexing " + (u.he || u.id) + " — " +
          Math.min(s + INDEX_CHUNK, arr.length).toLocaleString("en") + "/" +
          arr.length.toLocaleString("en") + "…");
      }
      await this.deps.yieldFn();
    }
    this.indexMs += this.deps.now() - t0;
  }

  // Stream every shard in canonical order. onEach(done, total) fires after each.
  async ensureAll(onProgress, onEach) {
    if (this.loadingAll || this.fullLoaded) return;
    this.loadingAll = true;
    let done = 0;
    try {
      for (const u of this.units) {
        await this.ensureUnit(u.id, (msg) =>
          onProgress && onProgress(msg + " (" + (done + 1) + "/" + this.units.length + ")"));
        done++;
        if (onEach) onEach(done, this.units.length);
      }
      this.fullLoaded = true;
      if (this.cfg.onFullyLoaded) this.cfg.onFullyLoaded(this);
    } finally {
      this.loadingAll = false;
    }
  }

  stats(heapMB = null) {
    return { records: this.DB.length, total: this.total, indexMs: Math.round(this.indexMs),
             loaded: [...this.LOADED], fullLoaded: this.fullLoaded, heapMB };
  }

  // q: corpus-shaped query plus dh/kw (normalized strings).
  search(q) {
    const { cfg, DB, NORM, ORD } = this;
    const dhToks = q.dh ? q.dh.split(" ") : [];
    const dhS = skel(q.dh || "");
    const hits = [];

    // Free-text (kw) scoring is delegated to chipus: Hebrew, transliteration
    // and typo tolerance in one pass across dh/t/vt.
    let chipusHits = null;
    if (q.kw && this.chipusIndex) {
      chipusHits = new Map();
      for (const res of this.chipusIndex.search(q.kw, { limit: Math.max(1, DB.length) })) {
        const idx = this.docIndex.get(res.doc);
        if (idx !== undefined) chipusHits.set(idx, res);
      }
    }

    for (let i = 0; i < DB.length; i++) {
      const r = DB[i], n = NORM[i];
      if (!cfg.filter(r, q)) continue;
      let score = 0;
      if (dhToks.length) {
        if (n.dh === q.dh) score += 1000;
        else if (n.dh.startsWith(q.dh)) score += 600;
        else if (n.dh.includes(q.dh)) score += 400;
        else if (n.dhS === dhS) score += 800;          // ktiv-insensitive
        else if (n.dhS.startsWith(dhS)) score += 450;
        else if (n.dhS.includes(dhS)) score += 300;
        else {
          let all = true, any = false;
          for (const t of dhToks) {
            if (wordMatch(n.dh, t) !== -1) { score += 120; any = true; }
            else if (wordMatch(n.dhS, skel(t)) !== -1) { score += 80; any = true; }
            else if (wordMatch(n.t, t) !== -1) { score += 15; all = false; }
            else if (n.t.includes(t)) { score += 8; all = false; }
            else { all = false; }
          }
          if (!any && score === 0) continue;
          if (all) score += 100;
        }
      }
      if (q.kw) {
        const hit = chipusHits && chipusHits.get(i);
        if (hit) {
          score += hit.score;
        } else if (cfg.pinned(q)) {
          // an exact chapter:verse / daf:amud pin keeps that spot's Rashis
          // visible even when the free-text terms match nothing
          score = Math.max(score, 1);
        } else {
          continue;
        }
      }
      if (!dhToks.length && !q.kw) score = 1;  // pure filter browse
      if (score > 0) hits.push({ i, score: score + (cfg.boost ? cfg.boost(r, this) : 0) + popBoost(r) });
    }
    // Tie-break on canonical position, not DB index: with lazy loading the DB
    // index depends on load order, and ordering must not.
    hits.sort((a, b) => b.score - a.score || ORD[a.i] - ORD[b.i]);
    return hits.slice(0, 60);
  }

  // A transliterated unit capture is only a hypothesis: rerun the whole query
  // as free text and keep the filter only if the corpus agrees (top unfiltered
  // hit lands inside the captured scope). Needs every unit in memory, so under
  // lazy loading we trust the alias until the user opts into a full load.
  resolveSoft(q) {
    const cfg = this.cfg;
    if (!q._softToks || cfg.softSkip(q)) return q;
    if (!this.fullLoaded) return q;
    if (!q.kw && !q._softFuzzy) return q;   // exact alias, nothing to verify against
    const alt = cfg.emptyQuery();
    alt.kw = (q._softToks.join(" ") + " " + q.kw).trim();
    const altHits = this.search(alt);
    if (!altHits.length) return q;
    if (cfg.softAgrees(q, this.DB[altHits[0].i])) return q;
    alt._softHits = altHits;
    return alt;
  }
}
