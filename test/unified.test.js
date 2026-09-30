// Shared engine + per-corpus query grammar for the unified app. Runs headless in
// node against the real shards under data/ (same files the browser loads).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ChipusIndex } from "../lib/chipus/src/index.js";
import { CorpusStore, INDEX_CHUNK } from "../lib/rashi/store.js";
import { createTorah } from "../lib/rashi/corpora/torah.js";
import { createNach } from "../lib/rashi/corpora/nach.js";
import { createBavli } from "../lib/rashi/corpora/bavli.js";
import { normalize, parseHebNum, toHebNum } from "../lib/rashi/text.js";
import { CORPUS_IDS, PAGE_TO_CORPUS } from "../lib/rashi/corpora/index.js";

const root = new URL("../", import.meta.url);
function makeStore(cfg, log = []) {
  return new CorpusStore(cfg, {
    ChipusIndex, offline: true,
    fetchJson: async (url) => { log.push(url); return JSON.parse(readFileSync(new URL(url, root), "utf8")); },
    yieldFn: async () => { log.yields = (log.yields || 0) + 1; },
    now: () => Date.now(),
  });
}

test("text: gematria round-trips, and 90 is tsadi (nach.html used peh)", () => {
  assert.equal(toHebNum(90), "צ");
  assert.equal(toHebNum(119), "קיט");
  for (const n of [1, 6, 15, 16, 23, 90, 119, 150]) assert.equal(parseHebNum(toHebNum(n)), n);
  assert.equal(normalize("בְּרֵאשִׁ֖ית, בָּרָ֣א"), "בראשית ברא");
});

test("registry: three corpora; legacy pages map to them", () => {
  assert.deepEqual(CORPUS_IDS, ["torah", "nach", "bavli"]);
  assert.deepEqual(PAGE_TO_CORPUS, { "chumash.html": "torah", "nach.html": "nach", "bavli.html": "bavli" });
});

/* ---------------- Nach ---------------- */
test("nach: lazy load fetches only the named book, idempotently", async () => {
  const log = [];
  const s = makeStore(createNach(), log);
  await s.init();
  assert.deepEqual(log, ["data/nach/manifest.json"]);           // boot = manifest only
  assert.equal(s.units.length, 34);
  const q = s.cfg.smartParse("isaiah 6");
  assert.equal(q.book, "Isaiah"); assert.equal(q.perek, 6);
  assert.equal(s.cfg.unitToLoad(q), "Isaiah");
  await Promise.all([s.ensureUnit("Isaiah"), s.ensureUnit("Isaiah")]);   // concurrent callers share one fetch
  await s.ensureUnit("Isaiah");
  assert.equal(log.filter((u) => u.endsWith("Isaiah.json")).length, 1);
  assert.equal(log.length, 2);
  assert.equal(s.DB.length, s.unit("Isaiah").count);
  const hits = s.search(q);
  assert.ok(hits.length > 20);
  assert.ok(hits.every((h) => s.DB[h.i].b === "Isaiah" && s.DB[h.i].c === 6));
});

test("nach: chunked indexing yields between INDEX_CHUNK slices", async () => {
  const log = [];
  const s = makeStore(createNach(), log);
  await s.init();
  await s.ensureUnit("Isaiah");
  assert.equal(log.yields, Math.ceil(s.unit("Isaiah").count / INDEX_CHUNK));
});

test("nach: Hebrew and Latin book names agree (ישעיהו ו == yeshaya 6)", async () => {
  const s = makeStore(createNach()); await s.init();
  const a = s.cfg.smartParse("ישעיהו ו"), b = s.cfg.smartParse("yeshaya 6");
  assert.equal(a.book, "Isaiah"); assert.equal(b.book, "Isaiah");
  assert.equal(a.perek, 6); assert.equal(b.perek, 6);
  assert.equal(s.cfg.smartParse("תהילים כג").book, "Psalms");
});

test("nach: Nahum/Nehemiah fold collision resolves via the exact tier", async () => {
  const s = makeStore(createNach()); await s.init();
  assert.equal(s.cfg.smartParse("nachum 1").book, "Nahum");
  assert.equal(s.cfg.smartParse("nechemia 1").book, "Nehemiah");
});

test("nach: unqualified paired books are ambiguous, qualified ones are not", async () => {
  const s = makeStore(createNach()); await s.init();
  const amb = s.cfg.smartParse("shmuel");
  assert.equal(amb.book, ""); assert.equal(amb.ambigFamily, "Samuel");
  assert.match(s.cfg.ambigHtml(amb), /I Samuel/);
  const ok = s.cfg.smartParse("shmuel aleph 1");
  assert.equal(ok.book, "I Samuel"); assert.equal(ok.perek, 1);
  assert.equal(s.cfg.smartParse("shmuel 1").book, "I Samuel");   // "1" qualifies the half, not the perek
  assert.equal(s.cfg.applyAmbig("shmuel foo", "II Samuel"), "II Samuel foo");
});

test("nach: result order is independent of load order", async () => {
  const run = async (order) => {
    const s = makeStore(createNach()); await s.init();
    for (const b of order) await s.ensureUnit(b);
    return s.search({ ...s.cfg.emptyQuery(), kw: "משה" }).map((h) => { const r = s.DB[h.i]; return r.b + r.c + ":" + r.v + "." + r.i; });
  };
  const a = await run(["Joshua", "Isaiah", "Psalms"]);
  const b = await run(["Psalms", "Joshua", "Isaiah"]);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

test("nach: pseudo-Rashi note only on cx records", async () => {
  const s = makeStore(createNach()); await s.init();
  assert.ok(s.cfg.note({ cx: 1 }));
  assert.equal(s.cfg.note({}), null);
});

/* ---------------- Bavli ---------------- */
test("bavli: located query resolves a tractate before any shard loads", async () => {
  const log = [];
  const s = makeStore(createBavli(), log); await s.init();
  assert.deepEqual(log, ["data/bavli/manifest.json"]);
  for (const [raw, en, daf, amud] of [
    ["ברכות ב.", "Berakhot", 2, 1], ["שבת כא:", "Shabbat", 21, 2],
    ["brachos 2a", "Berakhot", 2, 1], ["bava kamma 3b", "Bava Kamma", 3, 2],
  ]) {
    const q = s.cfg.smartParse(raw);
    assert.equal(q.tractate, en, raw); assert.equal(q.daf, daf, raw); assert.equal(q.amud, amud, raw);
  }
  assert.equal(log.length, 1);
});

test("bavli: exact spellings survive fold collisions (shabbos/shevuos, yoma)", async () => {
  const s = makeStore(createBavli()); await s.init();
  assert.equal(s.cfg.smartParse("shabbos 5").tractate, "Shabbat");
  assert.equal(s.cfg.smartParse("shevuos 5").tractate, "Shevuot");
  assert.equal(s.cfg.smartParse("yoma 5").tractate, "Yoma");
});

test("bavli: one shard search, and no cross-Shas load without opt-in", async () => {
  const log = [];
  const s = makeStore(createBavli(), log); await s.init();
  const q = s.cfg.smartParse("ברכות ב");
  await s.ensureUnit(s.cfg.unitToLoad(q));
  const hits = s.search(q);
  assert.ok(hits.length > 10);
  assert.ok(hits.every((h) => s.DB[h.i].b === "Berakhot" && s.DB[h.i].d === 2));
  assert.equal(s.fullLoaded, false);
  assert.equal(s.cfg.unitToLoad(s.cfg.smartParse("נר חנוכה")), "");   // no unit -> app shows opt-in
  assert.match(s.cfg.optInHtml(s.cfg.smartParse("נר חנוכה"), s), /load-all/);
});

test("bavli: authorship notes (Nedarim whole tractate; Bava Batra via cx)", async () => {
  const s = makeStore(createBavli()); await s.init();
  assert.ok(s.cfg.note({ b: "Nedarim", d: 3, a: 1 }));
  assert.equal(s.cfg.note({ b: "Berakhot", d: 3, a: 1 }), null);
  assert.ok(s.cfg.note({ b: "Bava Batra", d: 40, a: 1, cx: 1 }));
  assert.equal(s.cfg.note({ b: "Bava Batra", d: 40, a: 1 }), null);
  assert.match(s.cfg.sefariaUrl({ b: "Bava Batra", cx: 1, d: 30, a: 1, l: 2, i: 3 }), /Rashbam_on_Bava_Batra\.30a\.2\.3/);
});

/* ---------------- Torah ---------------- */
test("torah: single shard, aliases built from data, references", async () => {
  const s = makeStore(createTorah()); await s.init();
  assert.equal(s.units.length, 1);
  await s.ensureAll();
  assert.equal(s.fullLoaded, true);
  assert.equal(s.DB.length, 7816);
  const q = s.cfg.smartParse("bereishis 3 14");
  assert.equal(q.book, "Genesis"); assert.equal(q.perek, 3); assert.equal(q.passuk, 14);
  assert.equal(s.cfg.smartParse("lech lecha").parsha.length > 0, true);
  const hits = s.search(s.cfg.smartParse("בראשית ג יד"));
  assert.ok(hits.length > 0 && hits.every((h) => s.DB[h.i].c === 3 && s.DB[h.i].v === 14));
  assert.equal(s.cfg.unitToLoad(q), null);   // eager corpus: never gated
  assert.equal(s.cfg.refHe(s.DB[hits[0].i]).endsWith("ג:יד"), true);
});

test("torah: soft-transliteration guard keeps or rejects the filter", async () => {
  const s = makeStore(createTorah()); await s.init(); await s.ensureAll();
  const q = s.cfg.smartParse("toldos");
  assert.ok(q._softToks);
  assert.equal(s.resolveSoft(q).parsha, q.parsha);       // exact alias, no extra kw: trusted
});
