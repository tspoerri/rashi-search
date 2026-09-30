// Corpus config: Rashi on Nach (34 books, one shard per book).
"use strict";
import { foldToken } from "../../chipus/src/index.js";
import { NACH_BOOKS, PAIRED_BOOKS, buildExactAliases, buildFoldedAliases } from "../../nach-aliases.js";
import { AMBIG, fuzzyAlias } from "../aliases.js";
import { NIKUD_RE, normalize, parseHebNum, toHebNum, esc } from "../text.js";

// Pseudo-Rashi commentary (cx: 1) covers Ezra, Nehemiah, I/II Chronicles — not
// composed by Rashi himself; traditionally attributed to a member of his school.
const PSEUDO_RASHI_NOTE =
  'פירוש זה המיוחס ל"רש"י" בדפוסים אינו מרש"י עצמו, אלא מבית מדרשו.';

function pairedHalf(tok) {
  const t = (tok || "").toLowerCase();
  if (["aleph", "alef", "a", "1", "א", "א'", "ראשון"].includes(t)) return "I";
  if (["bet", "beis", "beit", "b", "2", "ב", "ב'", "שני"].includes(t)) return "II";
  return null;
}
// Which unqualified token an AMBIG hit came from -> PAIRED_BOOKS family key.
const AMBIG_FAMILY = {
  "שמואל": "Samuel", "shmuel": "Samuel", "samuel": "Samuel",
  "מלכים": "Kings", "melachim": "Kings", "melochim": "Kings", "kings": "Kings",
  "דברי הימים": "Chronicles", 'דה"י': "Chronicles",
  "divrei hayamim": "Chronicles", "chronicles": "Chronicles", "divrei hayomim": "Chronicles",
};
const HE_PAIR = { Samuel: ["שמואל א", "שמואל ב"], Kings: ["מלכים א", "מלכים ב"],
                  Chronicles: ["דברי הימים א", "דברי הימים ב"] };

export function smartTokenize(raw) {
  let s = raw.replace(/־/g, " ").replace(NIKUD_RE, "");
  s = s.replace(/[״"׳'!?()\[\]{};,]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.split(" ").filter(Boolean);
}

export function createNach() {
  let BOOK_EXACT = null, BOOK_ALIAS1 = null, BOOK_ALIAS2 = null;

  function smartParse(raw) {
    const q = { book: "", perek: 0, passuk: 0, dh: "", kw: "", ambigFamily: null };
    const toks = smartTokenize(raw);
    const rest = [];
    let i = 0;
    while (i < toks.length) {
      const tok = toks[i];
      const next = toks[i + 1];
      const isLatin = /[a-z]/i.test(tok);
      const two = next ? tok + " " + next : null;

      // two-word book name (exact phrase, Hebrew or Latin), position 0 only
      if (!q.book && !q.ambigFamily && two && i === 0) {
        const exactHit = BOOK_EXACT.get(two.toLowerCase());
        if (exactHit === AMBIG) {
          q.ambigFamily = AMBIG_FAMILY[two.toLowerCase()] || null;
          const half = toks[i + 2] ? pairedHalf(toks[i + 2]) : null;
          if (half && q.ambigFamily) {
            q.book = PAIRED_BOOKS[q.ambigFamily][half];
            q.ambigFamily = null;
            i += 3; continue;
          }
          i += 2; continue;
        }
        if (exactHit) { q.book = exactHit; i += 2; continue; }
      }
      // three-word exact phrase ("divrei hayamim aleph"), position 0 only
      if (!q.book && !q.ambigFamily && i === 0 && toks.length >= 3) {
        const three = tok + " " + toks[1] + " " + toks[2];
        const exactHit3 = BOOK_EXACT.get(three.toLowerCase());
        if (exactHit3 && exactHit3 !== AMBIG) { q.book = exactHit3; i += 3; continue; }
      }
      // single-word exact book name (Hebrew or Latin), position 0 only
      if (!q.book && !q.ambigFamily && i === 0) {
        const exactHit = BOOK_EXACT.get(tok.toLowerCase());
        if (exactHit === AMBIG) {
          q.ambigFamily = AMBIG_FAMILY[tok.toLowerCase()] || null;
          const half = next ? pairedHalf(next) : null;
          if (half && q.ambigFamily) {
            q.book = PAIRED_BOOKS[q.ambigFamily][half];
            q.ambigFamily = null;
            i += 2; continue;
          }
          i++; continue;
        }
        if (exactHit) { q.book = exactHit; i++; continue; }
      }
      // folded two-word alias (typo-tolerant path), position 0 only
      if (!q.book && !q.ambigFamily && isLatin && next && i === 0) {
        let found = null;
        outer: for (const k1 of foldToken(tok)) {
          for (const k2 of foldToken(next)) {
            const hit = BOOK_ALIAS2.get(k1 + "|" + k2);
            if (hit && hit !== AMBIG) { found = hit; break outer; }
          }
        }
        if (!found) {
          const cands = [];
          for (const k1 of foldToken(tok)) for (const k2 of foldToken(next)) cands.push(k1 + "|" + k2);
          found = fuzzyAlias(BOOK_ALIAS2, cands);
        }
        if (found) { q.book = found; i += 2; continue; }
      }
      // folded single-word alias (typo-tolerant path), position 0 only
      if (!q.book && !q.ambigFamily && isLatin && i === 0) {
        let found = null;
        for (const k of foldToken(tok)) {
          if (k.length < 3) continue;
          const hit = BOOK_ALIAS1.get(k);
          if (hit && hit !== AMBIG) { found = hit; break; }
        }
        if (!found) found = fuzzyAlias(BOOK_ALIAS1, foldToken(tok));
        if (found) { q.book = found; i++; continue; }
      }
      // perek number (Arabic or gematria) — only meaningful once a book is known
      if (q.perek === 0 && q.book) {
        const n = parseHebNum(tok);
        if (n !== null) { q.perek = n; i++; continue; }
      }
      // passuk number — only meaningful once a perek is known
      if (q.passuk === 0 && q.perek) {
        const n = parseHebNum(tok);
        if (n !== null) { q.passuk = n; i++; continue; }
      }
      rest.push(tok); i++;
    }
    q.kw = rest.join(" ");
    return q;
  }

  return {
    id: "nach", he: 'נ"ך', url: "nach.html",
    title: "Rashi on Nach Search", h1: 'חיפוש רש"י על נ"ך',
    manifestUrl: "data/nach/manifest.json", dataDir: "data/nach/",
    parseManifest: (j) => (j.books || []).map((b) => ({
      id: b.en, en: b.en, he: b.he, file: b.file, count: b.count || 0 })),
    eager: false,
    unitNoun: "book", unitNounPlural: "books", allLabel: "all of Nach",

    smartPlaceholder: "ישעיהו ו הנני שלחני",
    hint: "Combine sefer, perek and passuk (Hebrew letters or numbers) with words from the dibbur hamatchil or the Rashi text — in any order.",
    fields: [
      { id: "dh", label: 'ד"ה', kind: "text", ph: "ויאמר" },
      { id: "book", label: "ספר", kind: "datalist", ph: "All" },
      { id: "perek", label: "פרק", kind: "text", ph: "ו / 6" },
      { id: "passuk", label: "פסוק", kind: "text", ph: "א / 1" },
      { id: "kw", label: "מילים", kind: "text", ph: "in the Rashi text" },
    ],
    fieldOptions(id, store) {
      return id === "book" ? store.units.map((u) => ({ v: u.he, l: u.he })) : [];
    },
    queryFromFields(get, store) {
      const val = (get("book") || "").trim();
      const hit = val && NACH_BOOKS.find((b) => b.he === val || b.en.toLowerCase() === val.toLowerCase());
      return {
        book: hit ? hit.en : "",
        perek: parseHebNum((get("perek") || "").trim()) || 0,
        passuk: parseHebNum((get("passuk") || "").trim()) || 0,
        dh: normalize(get("dh")), kw: normalize(get("kw")), ambigFamily: null,
      };
    },

    setup() {
      BOOK_EXACT = buildExactAliases();
      const { alias1, alias2 } = buildFoldedAliases(foldToken);
      BOOK_ALIAS1 = alias1; BOOK_ALIAS2 = alias2;
    },
    smartParse,
    emptyQuery: () => ({ book: "", perek: 0, passuk: 0, dh: "", kw: "", ambigFamily: null }),
    hasCriteria: (q) => !!(q.book || q.perek || q.passuk || q.dh || q.kw),
    unitToLoad: (q) => q.book,
    filter(r, q) {
      return !(q.book && r.b !== q.book) && !(q.perek && r.c !== q.perek) && !(q.passuk && r.v !== q.passuk);
    },
    pinned: (q) => !!(q.perek && q.passuk),
    softSkip: () => true,          // nach never captures soft (transliterated) filters
    softAgrees: () => true,

    // "shmuel" alone is ambiguous by design — ask instead of guessing.
    ambigHtml(q) {
      const pair = PAIRED_BOOKS[q.ambigFamily];
      if (!pair) return '<div id="empty">Ambiguous book name — please specify.</div>';
      const [heI, heII] = HE_PAIR[q.ambigFamily] || [pair.I, pair.II];
      return '<div class="ambig">איזה ' + esc(q.ambigFamily) + '? / Which book did you mean?<br>' +
        '<button data-book="' + esc(pair.I) + '">' + esc(heI) + " (" + esc(pair.I) + ")</button>" +
        '<button data-book="' + esc(pair.II) + '">' + esc(heII) + " (" + esc(pair.II) + ")</button></div>";
    },
    applyAmbig(raw, book) {
      return book + " " + smartTokenize(raw).slice(1).join(" ");
    },

    optInHtml(q, store) {
      const what = q.kw || q.dh ? "Searching all of Nach" : "Browsing every book";
      return esc(what) + " needs all " + store.total.toLocaleString("en") + " Rashis in memory — all " +
        store.units.length + " books, ~12 MB of data and roughly 110 MB of heap once indexed. " +
        "Fine on a laptop; on a phone, prefer naming a book.<br><br>" +
        'Name a book — e.g. <b>ישעיהו ו</b> or <b>isaiah 6</b> — to search just that one, or load everything:<br><br>' +
        '<button id="load-all" class="bigbtn">Search all of Nach</button>';
    },

    refHe: (r) => r.bh + " " + toHebNum(r.c) + ":" + toHebNum(r.v),
    refExtra: () => "",
    note: (r) => (r.cx ? PSEUDO_RASHI_NOTE : null),
    sefariaUrl(r) {
      const title = "Rashi on " + r.b;
      return "https://www.sefaria.org/" + encodeURIComponent(title.replace(/ /g, "_")) + "." +
        r.c + "." + r.v + "." + r.i;
    },
  };
}
