# Strategy — a generic search engine for any set of Hebrew texts

*Drafted 2026-08-23, distilled from building and fixing rashi-search (Chumash/Nach/Bavli). Nothing here is built; this is the plan for a separate, new repo.*

## Why a separate repo, not another milestone on rashi-search

rashi-search is genuinely Rashi-shaped: dibbur-hamaschil-and-body records, daf/amud and chapter:verse locations, parsha/daf-yomi timeliness, authorship disclaimers for pseudo-Rashi sections. Those are real, worth keeping there. But three sibling apps in that repo also proved out something corpus-agnostic: a search *engine* (chipus) plus a set of loading/scaling patterns that have nothing to do with Rashi specifically. This doc generalizes the second part into something that could index any Hebrew/Aramaic corpus — a different commentary, responsa, poetry, correspondence — not just Rashi on three things.

## What carries over as-is

- **chipus** (`lib/chipus`, github.com/tspoerri/chipus) — the search engine itself: Hebrew/Aramaic/Yiddish/Latin-transliteration folding to a shared phonetic key space, tiered exact→prefix→fuzzy matching, adjacency/coverage scoring. Nothing about it is Rashi-specific. Pull it in as a submodule unchanged.
- **The build-script caching pattern** — every fetch from a remote source lands in a local cache file first; re-running the build is free. Trivial but load-bearing at any real corpus size.
- **Chunked, yielding indexing** — index in batches of ~600 records with an `await new Promise(r => setTimeout(r))` between batches, so the main thread never stalls long enough to trip a mobile watchdog.
- **The measured scaling numbers** — carry these forward as priors, not gospel; re-measure per corpus:
  - Raw text → indexed heap blowup: **~9–14x** (Nach: 12 MB → ~112 MB; Bavli: 80 MB → ~1.15 GB).
  - Below roughly **15–20 MB raw text**, eager-load-everything is safe on mobile (Chumash+Nach combined, ~17 MB, projects to ~150 MB heap — fine). Above that, eager loading is not an option; verify, don't assume, before committing either way for a new corpus.

## What does NOT carry over as-is

- The record schema (`dh`/`t`/`vt`) — meaningful for lemma-based commentary, meaningless for other genres (poetry, letters, halachic responsa). Needs a generic replacement (below).
- Daf/amud and chapter:verse location parsing — real, reusable as two *instances* of a location-scheme plugin, not as the only two schemes that will ever exist.
- Parsha/daf-yomi timeliness and the authorship-disclaimer mechanism — Sefaria-calendar-specific and Rashi-specific respectively. The *pattern* ("boost by a time-sensitive rule," "annotate a record with a provenance note") generalizes; the specific rules don't.

## Architecture

**Generic record schema:**
```
{ corpus: string, locScheme: string, loc: [...], fields: { [name]: text }, meta: { popularity?, provenance? } }
```
`loc` is opaque outside its scheme's parser/formatter — `[chapter, verse]`, `[daf, amud]`, `[siman, seif]`, whatever the corpus needs. `fields` replaces the hardcoded `dh`/`t`/`vt` with a named, per-corpus-configured set (a poetry corpus might have just `text`; a commentary corpus might keep something dh-shaped).

**Corpus config, one object per corpus, registered centrally:**
- location parser + formatter (recognizes the corpus's citation syntax; formats a `loc` back to a display ref and a source URL)
- alias table (name variants, transliterations, common typos)
- size class: `eager` (always resident) or `lazy` (shard-index-narrowed, loaded on demand) — decided from the measured raw-text size, not guessed
- boost rules: popularity source (if any), timeliness rules (calendar-API-driven and/or a curated static table), both optional

**Build pipeline** (source-ingestion kept as its own boundary, so a non-Sefaria source can plug in later without touching anything downstream):
1. Ingest raw texts from a source adapter → clean/normalize → shard by the corpus's natural unit (book, tractate, whatever) → write shards + a manifest, exactly like `build_bavli.py`/`build_nach.py` do today.
2. For every corpus marked `lazy`, run one shared Node script that imports `foldToken` directly from chipus's `fold.js` (not a reimplementation — this is the step that avoids the drift risk flagged during the rashi-search work) over the already-built shards, and emits a folded-key → shard-id map. This index only ever narrows *which shards to fetch*; it never ranks anything — chipus stays the sole scoring authority, always run over whatever full records actually get fetched.

**Client behavior:**
- A citation-shaped query (recognized syntactically, per the matching corpus's location parser) routes directly to one shard — cheap, whether that corpus is eager or lazy.
- Unlocated free text searches everything by default: score the eager pool instantly, and in parallel fold the query and AND-intersect its shard-index candidates across lazy corpora, fetch+index only the narrowed shards (streaming results in as each resolves), then merge and re-rank the combined hit list. (Full flow diagrammed in the rashi-search conversation this doc was distilled from — same shape, corpus-agnostic.)
- Bounded memory: LRU-evict lazily-loaded shards once resident record count passes a budget. IndexedDB caches the *built* (folded/tokenized) shard data across page loads, since indexing cost dominates fetch cost.
- Boosts (popularity, timeliness) apply uniformly to the merged hit list, after retrieval, regardless of which path a record came in through.

## Milestones

- **M0 — skeleton.** chipus submodule in; config-driven corpus registration; no real data yet. Prove the plumbing with a tiny synthetic corpus.
- **M1 — first real corpus, small.** Eager-loaded, single corpus. Proves the config-driven UI end to end against real text.
- **M2 — second corpus, still small.** Proves location-routing between corpora and the merged-small-pool free-text path.
- **M3 — first large corpus.** Forces the lazy path: shard-index build, AND-intersect narrowing, streaming, LRU eviction. This is where rashi-search's Bavli fix numbers become the acceptance bar, not just a reference point.
- **M4 — boosts.** Popularity + timeliness wired through the generic per-corpus config, at least one dynamic (API-driven) and one static (curated table) rule each, to prove the mechanism handles both.
- **M5 — mobile validation.** Live-measured at a real mobile viewport (375×812 or similar): boot time, index-build time, located-query time, free-text time, peak `performance.memory.usedJSHeapSize`. No milestone is "done" on the strength of desktop testing alone — that was the exact mistake that shipped the original Bavli crash.

## Must verify per corpus before choosing eager vs. lazy

1. Actual raw text size and a *measured* (not assumed) blowup ratio — build it, load it, read `performance.memory`, don't extrapolate from Bavli's ratio blindly.
2. Whether the corpus's citations are even location-shaped. Talmud/Tanakh/Mishnah are; correspondence or prose may need a fallback scheme (`corpus + arbitrary sequential id`, no structured `loc`).
3. Source licensing — rashi-search itself still has this as an open, unresolved question for its own bundled text; don't inherit that ambiguity silently into a new repo.

---

## Init prompt — paste into a fresh Claude Code session to start the new repo

```
I'm starting a new repo: a client-side search engine over one or more Hebrew/
Aramaic text corpora (commentary, responsa, poetry — whatever the first real
corpus turns out to be). This is a generalization of a sibling project,
rashi-search, which proved out the underlying techniques on Rashi's
commentaries specifically. Read the strategy doc first — I'll paste it below
[paste the full contents of GENERIC-SEARCH-STRATEGY.md here] — it explains
what's reusable (chipus itself, the build-caching pattern, the chunked-
yielding indexer, the measured scaling numbers) versus what's corpus-specific
in the old repo and must NOT be copied as-is (the dh/t/vt schema, daf/amud
parsing, parsha/daf-yomi boosts, the authorship-disclaimer mechanism).

Start with M0 from the doc: add chipus (github.com/tspoerri/chipus) as a git
submodule, then build the config-driven corpus-registration skeleton — the
generic record schema, a per-corpus config object (location parser/
formatter, alias table, size class, boost rules), and a minimal client that
can register one synthetic tiny corpus and search it. No real data yet;
prove the plumbing first, matching the doc's location-scheme and
eager/lazy-size-class design exactly. Once that's solid, tell me and we'll
pick the first real corpus for M1.
```
