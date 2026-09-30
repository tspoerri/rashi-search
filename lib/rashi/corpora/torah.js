// Corpus config: Rashi on Chumash (5 books, ~7.8K records, one 5 MB shard).
"use strict";
import { foldToken, tokenize } from "../../chipus/src/index.js";
import { AMBIG, aliasSet, fuzzyAlias } from "../aliases.js";
import { normalize, parseHebNum, toHebNum, esc } from "../text.js";

export function createTorah() {
  const WEEK = { cur: new Set(), adj: new Set() };   // this week's / adjacent parshas
  let BOOKS = [];       // [{en, he}]
  let PARSHAS = [];     // [{en, he, book}]
  const BOOK_ALIAS = new Map();     // folded key -> book {en, he}
  const PARSHA_ALIAS1 = new Map();  // folded key -> parsha (single-word names)
  const PARSHA_ALIAS2 = new Map();  // "key1|key2" -> parsha (two-word, e.g. "lech lecha")

  function registerParshaAliases(words, p) {
    if (words.length === 1) {
      for (const k of foldToken(words[0])) aliasSet(PARSHA_ALIAS1, k, p);
    } else if (words.length === 2) {
      for (const k1 of foldToken(words[0])) {
        for (const k2 of foldToken(words[1])) aliasSet(PARSHA_ALIAS2, k1 + "|" + k2, p);
      }
    }
  }
  function buildAliases() {
    for (const b of BOOKS) {
      for (const k of foldToken(b.he)) aliasSet(BOOK_ALIAS, k, b);
      for (const w of tokenize(b.en)) for (const k of foldToken(w)) aliasSet(BOOK_ALIAS, k, b);
    }
    for (const p of PARSHAS) {
      registerParshaAliases(tokenize(p.he), p);
      registerParshaAliases(tokenize(p.en), p);
    }
  }

  // this / last / next week's parsha, via Sefaria's calendar (skipped if offline)
  async function fetchWeek() {
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
    for (const off of [0, -7, 7]) {
      try {
        const d = new Date(Date.now() + off * 864e5);
        const j = await (await fetch("https://www.sefaria.org/api/calendars?year=" +
          d.getFullYear() + "&month=" + (d.getMonth() + 1) + "&day=" + d.getDate())).json();
        const item = j.calendar_items.find((i) => i.title.en === "Parashat Hashavua");
        for (const part of item.displayValue.en.split("-")) {
          const p = PARSHAS.find((p) => norm(p.en) === norm(part)) || { en: part.trim() };
          (off === 0 ? WEEK.cur : WEEK.adj).add(p.en);
        }
      } catch (e) { /* offline: no parsha boost */ }
    }
  }

  function smartParse(raw) {
    const q = { book: "", parsha: "", perek: 0, passuk: 0, dh: "", kw: "" };
    const toks = normalize(raw).split(" ").filter(Boolean);
    const rest = [];
    const nums = [];
    let i = 0;
    while (i < toks.length) {
      const tok = toks[i];
      const two = toks[i + 1] !== undefined ? tok + " " + toks[i + 1] : null;
      const isLatin = /[a-z]/i.test(tok);
      // parsha (2-word names first: לך לך, חיי שרה, כי תשא…)
      const p2 = two && PARSHAS.find((p) => normalize(p.he) === two);
      if (!q.parsha && p2) { q.parsha = p2.en; q.book = p2.book; i += 2; continue; }
      // transliterated 2-word parsha names ("lech lecha", "chayei sara")
      if (!q.parsha && !q.book && isLatin && toks[i + 1] !== undefined) {
        let found = null;
        outer: for (const k1 of foldToken(tok)) {
          for (const k2 of foldToken(toks[i + 1])) {
            const hit = PARSHA_ALIAS2.get(k1 + "|" + k2);
            if (hit && hit !== AMBIG) { found = hit; break outer; }
          }
        }
        let fuzzy = false;
        if (!found) {
          const cands = [];
          for (const k1 of foldToken(tok)) for (const k2 of foldToken(toks[i + 1])) cands.push(k1 + "|" + k2);
          found = fuzzyAlias(PARSHA_ALIAS2, cands);
          fuzzy = !!found;
        }
        if (found) {
          (q._softToks ||= []).push(tok, toks[i + 1]);
          if (fuzzy) q._softFuzzy = true;
          q.parsha = found.en; q.book = found.book; i += 2; continue;
        }
      }
      if (tok === "פרשת" && toks[i + 1]) {
        const pn = PARSHAS.find((p) => normalize(p.he) === toks[i + 1] ||
          (toks[i + 2] && normalize(p.he) === toks[i + 1] + " " + toks[i + 2]));
        if (pn) {
          q.parsha = pn.en; q.book = pn.book;
          i += 1 + normalize(pn.he).split(" ").length; continue;
        }
      }
      const b = BOOKS.find((b) => b.he === tok);
      if (!q.book && !q.parsha && b && i === 0) { q.book = b.en; i++; continue; }
      // transliterated book name at the start of the query
      if (!q.book && !q.parsha && isLatin && i === 0) {
        let found = null;
        for (const k of foldToken(tok)) {
          if (k.length < 3) continue;
          const hit = BOOK_ALIAS.get(k);
          if (hit && hit !== AMBIG) { found = hit; break; }
        }
        const wasExact = !!found;
        if (!found) found = fuzzyAlias(BOOK_ALIAS, foldToken(tok));
        if (found) {
          (q._softToks ||= []).push(tok);
          if (!wasExact) q._softFuzzy = true;
          q.book = found.en; i++; continue;
        }
      }
      const p1 = PARSHAS.find((p) => normalize(p.he) === tok);
      if (!q.parsha && !q.book && p1 && i === 0) { q.parsha = p1.en; q.book = p1.book; i++; continue; }
      // transliterated single-word parsha name ("noach", "toldos", "bereishis")
      if (!q.parsha && !q.book && isLatin && i === 0) {
        let found = null;
        for (const k of foldToken(tok)) {
          if (k.length < 3) continue;
          const hit = PARSHA_ALIAS1.get(k);
          if (hit && hit !== AMBIG) { found = hit; break; }
        }
        const wasExact = !!found;
        if (!found) found = fuzzyAlias(PARSHA_ALIAS1, foldToken(tok));
        if (found) {
          (q._softToks ||= []).push(tok);
          if (!wasExact) q._softFuzzy = true;
          q.parsha = found.en; q.book = found.book; i++; continue;
        }
      }
      const n = parseHebNum(tok);
      if (n !== null && nums.length < 2 && (q.book || q.parsha || nums.length === 1)) {
        nums.push(n); i++; continue;
      }
      rest.push(tok); i++;
    }
    if (nums.length >= 1) q.perek = nums[0];
    if (nums.length >= 2) q.passuk = nums[1];
    q.kw = rest.join(" ");
    return q;
  }

  return {
    id: "torah", he: "תורה", url: "chumash.html",
    title: "Rashi Search", h1: 'חיפוש רש"י על התורה',
    manifestUrl: null, dataDir: "data/",
    staticUnits: [{ id: "all", en: "all", he: "תורה", file: "rashi.json", count: 7816 }],
    eager: true,        // one 5 MB shard; loaded as soon as the corpus is selected
    unitNoun: "book", unitNounPlural: "books", allLabel: "all of Torah",

    smartPlaceholder: "בראשית ג יד עפר תאכל",
    hint: "Combine sefer, parsha, perek and passuk (Hebrew letters or numbers) with words from the dibbur hamatchil or the Rashi text — in any order.",
    fields: [
      { id: "dh", label: 'ד"ה', kind: "text", ph: "ויאמר" },
      { id: "book", label: "Sefer", kind: "select" },
      { id: "parsha", label: "Parsha", kind: "select" },
      { id: "perek", label: "Perek", kind: "text", ph: "ג / 3" },
      { id: "passuk", label: "Passuk", kind: "text", ph: "יד / 14" },
      { id: "kw", label: "מילים", kind: "text", ph: "in the Rashi text" },
    ],
    fieldOptions(id, store, get) {
      if (id === "book") return [{ v: "", l: "All" }, ...BOOKS.map((b) => ({ v: b.en, l: b.he }))];
      if (id === "parsha") {
        const book = get("book");
        return [{ v: "", l: "All" },
          ...PARSHAS.filter((p) => !book || p.book === book).map((p) => ({ v: p.en, l: p.he }))];
      }
      return [];
    },
    // Picking a parsha also selects its book.
    onFieldChange(id, get, set) {
      if (id === "parsha") {
        const p = PARSHAS.find((p) => p.en === get("parsha"));
        if (p) set("book", p.book);
      }
    },
    queryFromFields(get) {
      return {
        book: get("book"), parsha: get("parsha"),
        perek: parseHebNum((get("perek") || "").trim()) || 0,
        passuk: parseHebNum((get("passuk") || "").trim()) || 0,
        dh: normalize(get("dh")), kw: normalize(get("kw")),
      };
    },

    // Book/parsha lists come from the data itself, so aliases and the parsha
    // calendar are set up once the (single) shard has loaded.
    onFullyLoaded(store) {
      BOOKS = []; PARSHAS = [];
      for (const r of store.DB) {
        if (!BOOKS.some((b) => b.en === r.b)) BOOKS.push({ en: r.b, he: r.bh });
        if (!PARSHAS.some((p) => p.en === r.p)) PARSHAS.push({ en: r.p, he: r.ph, book: r.b });
      }
      buildAliases();
      if (!store.deps.offline) fetchWeek();
    },
    smartParse,
    emptyQuery: () => ({ book: "", parsha: "", perek: 0, passuk: 0, dh: "", kw: "" }),
    hasCriteria: (q) => !!(q.book || q.parsha || q.perek || q.passuk || q.dh || q.kw),
    unitToLoad: () => null,
    filter(r, q) {
      return !(q.book && r.b !== q.book) && !(q.parsha && r.p !== q.parsha) &&
             !(q.perek && r.c !== q.perek) && !(q.passuk && r.v !== q.passuk);
    },
    pinned: (q) => !!(q.perek && q.passuk),
    softSkip: (q) => !!(q.perek || q.passuk),
    softAgrees: (q, top) => (q.parsha ? top.p === q.parsha : top.b === q.book),
    // Sized below the vowel-evidence quantum: breaks true ties without letting
    // a current-parsha skeleton-mate leapfrog a vowel-perfect match.
    boost(r) {
      if (WEEK.cur.has(r.p)) return 8;
      if (WEEK.adj.has(r.p)) return 4;
      return 0;
    },

    refHe: (r) => r.bh + " " + toHebNum(r.c) + ":" + toHebNum(r.v),
    refExtra: (r) => " · " + esc(r.ph),
    note: () => null,
    sefariaUrl: (r) => "https://www.sefaria.org/Rashi_on_" + r.b + "." + r.c + "." + r.v + "." + r.i + "?lang=he",
  };
}
