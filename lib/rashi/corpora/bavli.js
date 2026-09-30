// Corpus config: Rashi on Talmud Bavli (36 tractates, one shard per tractate).
"use strict";
import { foldToken } from "../../chipus/src/index.js";
import { AMBIG, aliasSet, fuzzyAlias } from "../aliases.js";
import { NIKUD_RE, normalize, parseHebNum, toHebNum, esc } from "../text.js";

// Ashkenazi/Sephardi/academic transliteration variants beyond the plain
// English name (which is registered automatically for every tractate).
export const TRACTATE_ALIASES = {
  "Berakhot": ["berachos", "brachos", "berakhot", "brachot"],
  "Shabbat": ["shabbos", "shabbat"],
  "Eruvin": ["eiruvin"],
  "Pesachim": ["psachim"],
  "Rosh Hashanah": ["rosh hashana"],
  "Yoma": [],
  "Sukkah": ["succah", "sukka"],
  "Beitzah": ["beitza", "beitsa"],
  "Taanit": ["taanis"],
  "Megillah": ["megilla"],
  "Moed Katan": ["moed kattan"],
  "Chagigah": ["chagiga"],
  "Yevamot": ["yevamos"],
  "Ketubot": ["kesubos", "ksubos", "kesuvot", "kethuboth"],
  "Nedarim": [],
  "Nazir": [],
  "Sotah": ["sota"],
  "Gittin": [],
  "Kiddushin": ["kidushin"],
  "Bava Kamma": ["bava kama"],
  "Bava Metzia": ["bava metziah"],
  "Bava Batra": ["bava basra"],
  "Sanhedrin": [],
  "Makkot": ["makkos"],
  "Shevuot": ["shevuos"],
  "Avodah Zarah": ["avoda zara"],
  "Horayot": ["horayos"],
  "Zevachim": [],
  "Menachot": ["menachos"],
  "Chullin": ["chulin"],
  "Bekhorot": ["bechoros"],
  "Arakhin": ["arachin"],
  "Temurah": [],
  "Keritot": ["kerisos"],
  "Meilah": [],
  "Tamid": [],
  "Niddah": ["nidda"],
};

// Tokenize, keeping "." / ":" and a trailing Latin a/b as amud hints — the
// general normalize() strips those as punctuation, but here they carry meaning
// ("שבת כא." = 21a, "כא:" = 21b, "21b" = 21b).
export function smartTokenize(raw) {
  let s = raw.replace(/־/g, " ").replace(NIKUD_RE, "");
  s = s.replace(/[״"׳'!?()\[\]{};,]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  const rawToks = s.split(" ").filter(Boolean);
  const toks = [];
  for (let t of rawToks) {
    let amud = 0;
    if (t.length > 1 && t.endsWith(".")) { amud = 1; t = t.slice(0, -1); }
    else if (t.length > 1 && t.endsWith(":")) { amud = 2; t = t.slice(0, -1); }
    else {
      const m = /^(\d+)([abAB])$/.exec(t);
      if (m) { t = m[1]; amud = m[2].toLowerCase() === "a" ? 1 : 2; }
    }
    if (t) toks.push({ raw: t, amud });
  }
  return toks;
}

export function createBavli() {
  let TRACTATES = [];
  const DAFYOMI = { tractate: "", daf: 0 };
  const ALIAS1 = new Map();   // folded key -> tractate en (single-word)
  const ALIAS2 = new Map();   // "key1|key2" -> tractate en (two-word)
  // Exact lowercase spelling -> tractate en, consulted BEFORE any folded/fuzzy
  // lookup: a curated spelling must never be lost to a fold collision with a
  // different tractate ("shabbos"/"shevuos" both fold to the same key).
  const EXACT = new Map();

  function registerPhrase(phrase, en) {
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    aliasSet(EXACT, words.join(" ").toLowerCase(), en);
    if (words.length === 1) {
      for (const k of foldToken(words[0])) aliasSet(ALIAS1, k, en);
    } else if (words.length === 2) {
      for (const k1 of foldToken(words[0])) {
        for (const k2 of foldToken(words[1])) aliasSet(ALIAS2, k1 + "|" + k2, en);
      }
    }
  }

  function smartParse(raw) {
    const q = { tractate: "", daf: 0, amud: 0, dh: "", kw: "" };
    const toks = smartTokenize(raw);
    const rest = [];
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      const tok = t.raw;
      const next = toks[i + 1];
      const isLatin = /[a-z]/i.test(tok);
      const two = next ? tok + " " + next.raw : null;

      // two-word Hebrew tractate name (בבא קמא, ראש השנה, מועד קטן, עבודה זרה…)
      if (!q.tractate && two) {
        const t2 = TRACTATES.find((tr) => tr.he === two);
        if (t2) { q.tractate = t2.en; i += 2; continue; }
      }
      // transliterated two-word tractate alias ("bava kamma", "rosh hashana"…)
      if (!q.tractate && isLatin && next && i === 0) {
        const exactHit = EXACT.get((tok + " " + next.raw).toLowerCase());
        let found = exactHit && exactHit !== AMBIG ? exactHit : null;
        let fuzzy = false;
        if (!found) {
          outer: for (const k1 of foldToken(tok)) {
            for (const k2 of foldToken(next.raw)) {
              const hit = ALIAS2.get(k1 + "|" + k2);
              if (hit && hit !== AMBIG) { found = hit; break outer; }
            }
          }
        }
        if (!found) {
          const cands = [];
          for (const k1 of foldToken(tok)) for (const k2 of foldToken(next.raw)) cands.push(k1 + "|" + k2);
          found = fuzzyAlias(ALIAS2, cands);
          fuzzy = !!found;
        }
        if (found) {
          (q._softToks ||= []).push(tok, next.raw);
          if (fuzzy) q._softFuzzy = true;
          q.tractate = found; i += 2; continue;
        }
      }
      // "מסכת X" prefix
      if (!q.tractate && tok === "מסכת" && next) {
        const twoWord = toks[i + 2] ? next.raw + " " + toks[i + 2].raw : null;
        const tr = TRACTATES.find((tr) => tr.he === next.raw) ||
                   (twoWord && TRACTATES.find((tr) => tr.he === twoWord));
        if (tr) {
          q.tractate = tr.en;
          i += 1 + tr.he.split(" ").length;
          continue;
        }
      }
      // single-word Hebrew tractate exact match
      if (!q.tractate && i === 0) {
        const t1 = TRACTATES.find((tr) => tr.he === tok);
        if (t1) { q.tractate = t1.en; i++; continue; }
      }
      // transliterated single-word tractate alias ("brachos", "shabbos"…)
      if (!q.tractate && isLatin && i === 0) {
        // Exact curated spelling first. Also rescues short names like "yoma"
        // (folds to a 1-char key the length>=3 guard below would refuse).
        const exactHit = EXACT.get(tok.toLowerCase());
        let found = exactHit && exactHit !== AMBIG ? exactHit : null;
        let wasExact = !!found;
        if (!found) {
          for (const k of foldToken(tok)) {
            if (k.length < 3) continue;
            const hit = ALIAS1.get(k);
            if (hit && hit !== AMBIG) { found = hit; wasExact = true; break; }
          }
        }
        if (!found) found = fuzzyAlias(ALIAS1, foldToken(tok));
        if (found) {
          (q._softToks ||= []).push(tok);
          if (!wasExact) q._softFuzzy = true;
          q.tractate = found; i++; continue;
        }
      }
      // standalone amud markers: "עמוד ב" / "עמוד א", or ע"א/ע"ב
      if (tok === "עמוד" && next && (next.raw === "א" || next.raw === "ב")) {
        q.amud = next.raw === "א" ? 1 : 2; i += 2; continue;
      }
      if ((tok === "עא" || tok === "עב") && (q.tractate || q.daf)) {
        q.amud = tok === "עא" ? 1 : 2; i++; continue;
      }
      // daf number (Arabic or gematria) — only meaningful once a tractate is known
      if (q.daf === 0 && q.tractate) {
        const n = parseHebNum(tok);
        if (n !== null) {
          q.daf = n;
          if (t.amud) q.amud = t.amud;
          i++; continue;
        }
      }
      rest.push(tok); i++;
    }
    q.kw = rest.join(" ");
    return q;
  }

  // Today's daf yomi via Sefaria's calendar (skipped if offline). The ref is a
  // bare daf, e.g. "Avodah Zarah 51".
  async function fetchDafYomi() {
    try {
      const d = new Date();
      const j = await (await fetch("https://www.sefaria.org/api/calendars?year=" +
        d.getFullYear() + "&month=" + (d.getMonth() + 1) + "&day=" + d.getDate())).json();
      const item = j.calendar_items.find((i) => i.title.en === "Daf Yomi");
      if (!item || !item.ref) return;
      const m = /^(.+?)\s+(\d+)$/.exec(item.ref.trim());
      if (!m) return;
      const tr = TRACTATES.find((t) => t.en === m[1].trim());
      if (tr) { DAFYOMI.tractate = tr.en; DAFYOMI.daf = parseInt(m[2], 10); }
    } catch (e) { /* offline: no daf-yomi boost */ }
  }

  return {
    id: "bavli", he: 'ש"ס', url: "bavli.html",
    title: "Rashi on Bavli Search", h1: 'חיפוש רש"י על הש"ס',
    manifestUrl: "data/bavli/manifest.json", dataDir: "data/bavli/",
    parseManifest: (j) => (j.tractates || []).map((t) => ({
      id: t.en, en: t.en, he: t.he, file: t.file, count: t.count || 0,
      note: t.note || null, noteFrom: t.noteFrom || null })),
    eager: false,
    unitNoun: "masechet", unitNounPlural: "masechtos", allLabel: "all of Shas",

    smartPlaceholder: "שבת כא עמוד ב נר חנוכה",
    hint: "Combine masechet, daf and amud (Hebrew letters or numbers) with words from the dibbur hamatchil or the Rashi text — in any order.",
    fields: [
      { id: "dh", label: 'ד"ה', kind: "text", ph: "מאימתי" },
      { id: "tractate", label: "מסכת", kind: "datalist", ph: "All" },
      { id: "daf", label: "דף", kind: "text", ph: "כא / 21" },
      { id: "amud", label: "עמוד", kind: "select" },
      { id: "kw", label: "מילים", kind: "text", ph: "in the Rashi text" },
    ],
    fieldOptions(id, store) {
      if (id === "tractate") return store.units.map((u) => ({ v: u.he, l: u.he }));
      if (id === "amud") return [{ v: "", l: "All" }, { v: "1", l: "א" }, { v: "2", l: "ב" }];
      return [];
    },
    queryFromFields(get, store) {
      const val = (get("tractate") || "").trim();
      const hit = val && store.units.find((t) => t.he === val || t.en.toLowerCase() === val.toLowerCase());
      return {
        tractate: hit ? hit.en : "",
        daf: parseHebNum((get("daf") || "").trim()) || 0,
        amud: parseInt(get("amud"), 10) || 0,
        dh: normalize(get("dh")), kw: normalize(get("kw")),
      };
    },

    setup(store) {
      TRACTATES = store.units;
      for (const tr of TRACTATES) {
        for (const ph of [tr.en, ...(TRACTATE_ALIASES[tr.en] || [])]) registerPhrase(ph, tr.en);
      }
      if (!store.deps.offline) fetchDafYomi();  // fire and forget; no boost until it resolves
    },
    smartParse,
    emptyQuery: () => ({ tractate: "", daf: 0, amud: 0, dh: "", kw: "" }),
    hasCriteria: (q) => !!(q.tractate || q.daf || q.amud || q.dh || q.kw),
    unitToLoad: (q) => q.tractate,
    filter(r, q) {
      return !(q.tractate && r.b !== q.tractate) && !(q.daf && r.d !== q.daf) && !(q.amud && r.a !== q.amud);
    },
    pinned: (q) => !!(q.daf && q.amud),
    softSkip: (q) => !!q.daf,
    softAgrees: (q, top) => top.b === q.tractate,
    // Sized below the vowel-evidence quantum: 8 for today's daf (both amudim),
    // 4 for the adjacent dapim — a tie-breaker, never a vote.
    boost(r) {
      if (!DAFYOMI.tractate || r.b !== DAFYOMI.tractate) return 0;
      const dd = Math.abs(r.d - DAFYOMI.daf);
      return dd === 0 ? 8 : dd === 1 ? 4 : 0;
    },

    optInHtml(q, store) {
      const what = q.kw ? "Free-text search across all of Shas" : "Searching every masechet";
      return esc(what) + " needs all " + store.total.toLocaleString("en") +
        " Rashis in memory — all " + store.units.length + " masechtos, ~80 MB of data " +
        "that measures around 1.3 GB of heap once indexed. Treat it as desktop-only; " +
        "a phone will most likely run out of memory.<br><br>" +
        'Name a masechet — e.g. <b>ברכות ב.</b> or <b>brachos 2a</b> — to search just that one, ' +
        "or load everything:<br><br>" +
        '<button id="load-all" class="bigbtn">Search all of Shas</button>';
    },

    refHe: (r) => r.bh + " " + toHebNum(r.d) + ' ע"' + (r.a === 1 ? "א" : "ב"),
    refExtra: (r) => " · " + esc(r.bh),
    // Nedarim/Nazir carry a whole-tractate disclaimer; Bava Batra/Makkot hand
    // off to Rashbam/Rivan partway through (noteFrom = [daf, amud], inclusive).
    note(r) {
      const tr = TRACTATES.find((t) => t.en === r.b);
      if (!tr || !tr.note) return null;
      if (!tr.noteFrom) return tr.note;
      if (r.cx) return tr.note;   // provenance flag beats the daf threshold
      const [nd, na] = tr.noteFrom;
      if (tr.en === "Bava Batra") return null;  // non-cx BB records are Rashi even at daf 29
      return (r.d > nd || (r.d === nd && r.a >= na)) ? tr.note : null;
    },
    sefariaUrl(r) {
      // r.cx: continuation text Sefaria files separately (Bava Batra 29a+ = Rashbam)
      const title = r.cx ? "Rashbam on " + r.b : "Rashi on " + r.b;
      return "https://www.sefaria.org/" + title.replace(/ /g, "_") + "." +
        r.d + (r.a === 1 ? "a" : "b") + "." + r.l + "." + r.i;
    },
  };
}
