// chipus — phonetic folding: one shared key space for Hebrew script and
// Latin transliteration.
//
// Every token — Hebrew, Aramaic, Yiddish (Hebrew script), or a Latin-script
// transliteration in any convention (Ashkenazi "Shabbos", Sephardi "Shabbat",
// YIVO "shabes") — folds down to a short consonant-class key, so that all
// spellings of the same word land on the same key:
//
//     שַׁבָּת · shabbat · shabbos · shabes      → $BT / $BS
//     בְּרֵאשִׁית · bereshit · Bereishis · b'reyshis → BR$T / BR$S
//     מִצְוָה · mitzvah · mitsve                → MCB
//
// Design (see README for the full story):
//   * The INDEX side is ideally vocalized Hebrew — nikud resolves the two
//     genuinely ambiguous letters (shin vs. sin, consonant-vav vs. mater-vav),
//     so indexed keys are (mostly) canonical and unambiguous.
//   * The QUERY side is sloppy by nature, so ambiguity is handled by
//     EXPANSION: a token folds to a small set of candidate keys (Latin "s"
//     could be samekh/sin OR an Ashkenazi sav; bare unvocalized ש could be
//     shin or sin), and the engine tries all of them. Expanding queries
//     against a canonical index is far more precise than symmetrically
//     merging every confusable class into one.
//   * Vowels carry no signal across transliteration conventions and are
//     dropped on both sides; gemination marking differs between scripts
//     (dagesh chazak vs. doubled Latin letters), so consecutive identical
//     class characters collapse to one.
//
// Key alphabet: B G D Z C T S $ K L M N R plus digits.
//   B  ב פ  + consonantal ו      b p f v w ph
//   G  ג                          g
//   D  ד                          d
//   Z  ז                          z (also expands to C)
//   C  צ                          tz ts
//   T  ת ט                        t th (Latin s also expands here — Ashkenazi sav)
//   S  ס שׂ                       s
//   $  שׁ                         sh sch
//   K  ק כ ח                      k q c ck ch kh
//   dropped: א ע ה י, Latin h j y and all vowels.
//
// Rule order in foldLatin is pinned — digraphs must be consumed before their
// component letters (sh before s, tz before t/z, ch before c/h), and h/j/y
// deletion must run after every digraph that contains them.
//
// Folding rules descend from src/lib/fold.js in Tamar's sefaria-era-fonts
// project (production-tested against Sefaria's 45k-title index), extended
// here with Hebrew-script folding, nikud-aware disambiguation, and
// query-side expansion.

const COMBINING_LATIN = /[̀-ͯ]/g;
const APOSTROPHES = /['‘’.׳-]/g; // incl. Hebrew geresh U+05F3

export const HEBREW_LETTER_RE = /[א-ײ]/;

export function isHebrewText(s) {
  return HEBREW_LETTER_RE.test(s || "");
}

// Nikud + teamim (cantillation), excluding maqaf (U+05BE) and sof pasuq
// (U+05C3), which are word separators, not marks on a letter.
const MARKS_RE = /[֑-ֽֿ-ׂׄ-ׇ]/g;

export function stripNikud(s) {
  return (s || "").replace(MARKS_RE, "");
}

// --- Hebrew-side folding -------------------------------------------------

const HEB_CLASS = {
  // dropped: gutturals and yud — silent or vowel-like in every tradition
  "א": "", "ע": "", "ה": "", "י": "",
  "ב": "B", "פ": "B", "ף": "B",
  "ג": "G", "ד": "D",
  "ז": "Z", "צ": "C", "ץ": "C",
  "ט": "T", "ת": "T", "ס": "S",
  "כ": "K", "ך": "K", "ק": "K", "ח": "K",
  "ל": "L", "מ": "M", "ם": "M", "נ": "N", "ן": "N", "ר": "R",
  // Yiddish ligatures: double-vav is the consonant v; the diphthong
  // ligatures ay/oy are vowels.
  "װ": "B", "ױ": "", "ײ": "",
};

const SHIN_DOT = "ׁ";
const SIN_DOT = "ׂ";
const DAGESH = "ּ";
const HOLAM = /[ֹֺ]/;
// Any vowel point that, sitting on a vav, proves the vav is a consonant
// (sheva through qamats; holam/shuruk excluded — those ARE the vav's vowel).
const VOWEL_ON_VAV = /[ְ-ָֻ]/;

function isMark(ch) {
  return ch >= "֑" && ch <= "ׇ" && ch !== "־" && ch !== "׃";
}

/**
 * Fold one Hebrew-script token (nikud optional) to its candidate keys.
 * Vocalized input usually yields a single canonical key; unvocalized input
 * expands at the genuinely ambiguous letters (bare ש, bare mid-word ו).
 * Returns a deduplicated array, best guess first, capped at `cap` variants.
 */
export function foldHebrew(token, cap = 8) {
  // slots: each entry is a string (resolved) or an array of alternatives
  const slots = [];
  const chars = [...token];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isMark(ch)) continue;
    if (ch >= "0" && ch <= "9") { slots.push(ch); continue; }
    const marks = [];
    for (let j = i + 1; j < chars.length && isMark(chars[j]); j++) marks.push(chars[j]);
    const markStr = marks.join("");

    if (ch === "ש") {
      if (markStr.includes(SHIN_DOT)) slots.push("$");
      else if (markStr.includes(SIN_DOT)) slots.push("S");
      else slots.push(["$", "S"]); // unvocalized: shin far more common
      continue;
    }
    if (ch === "ו") {
      const isFirstLetter = slots.length === 0;
      const nextIsBareVav = chars[i + 1] === "ו";
      if (nextIsBareVav) {
        // doubled vav (Hebrew or Yiddish spelling) = one consonant v
        slots.push("B");
        i++; // consume the second vav
      } else if (VOWEL_ON_VAV.test(markStr)) {
        slots.push("B"); // vav carrying its own vowel = consonant
      } else if (HOLAM.test(markStr) || markStr.includes(DAGESH)) {
        slots.push(""); // holam male / shuruk = mater lectionis
      } else if (isFirstLetter) {
        slots.push("B"); // bare word-initial vav is a consonant (-ו prefix, Yiddish)
      } else {
        slots.push(["", "B"]); // bare mid-word vav: usually a mater
      }
      continue;
    }
    const cls = HEB_CLASS[ch];
    if (cls !== undefined) slots.push(cls);
    // anything else (stray punctuation) is dropped
  }
  return expandSlots(slots, cap);
}

// --- Refined (vowel-aware) folding for v2 ranking -------------------------
//
// See DESIGN-v2.md. Recall is decided entirely by the coarse fold above;
// refined keys only re-rank the candidates the coarse key already recalled.
// Same consonant classes, but weak-signal letters become lowercase markers
// instead of being dropped: matres lectionis and nikud vowels fold to a/i/u,
// and the gutturals split into ʔ (א/ע) and h (non-final ה) — word-final ה
// stays the vowel marker 'a'.

const NIKUD_VOWEL_CLASS = {
  "ַ": "a", "ָ": "a", "ֶ": "a", "ֵ": "a", "ְ": "a", "ֱ": "a", "ֲ": "a", "ֳ": "a",
  "ִ": "i",
  "ֹ": "u", "ֺ": "u", "ֻ": "u",
};

function nikudVowelFor(markStr) {
  for (const ch of markStr) {
    const cls = NIKUD_VOWEL_CLASS[ch];
    if (cls) return cls;
  }
  return "";
}

function collapseRuns(s) {
  return s.replace(/(.)\1+/g, "$1");
}

/** Fold one Hebrew-script token to its single best-guess refined key. */
export function foldHebrewRefined(token) {
  const chars = [...token];
  let lastIdx = -1;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!isMark(chars[i])) { lastIdx = i; break; }
  }
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isMark(ch)) continue;
    if (ch >= "0" && ch <= "9") { out += ch; continue; }
    const marks = [];
    for (let j = i + 1; j < chars.length && isMark(chars[j]); j++) marks.push(chars[j]);
    const markStr = marks.join("");

    if (ch === "א" || ch === "ע") { out += "ʔ"; continue; }
    if (ch === "ה") { out += i === lastIdx ? "a" : "h"; continue; }
    if (ch === "י") { out += "i"; continue; }

    if (ch === "ש") {
      out += markStr.includes(SIN_DOT) ? "S" : "$";
      out += nikudVowelFor(markStr);
      continue;
    }
    if (ch === "ו") {
      const isFirstLetter = out === "";
      const nextIsBareVav = chars[i + 1] === "ו";
      if (nextIsBareVav) { out += "B"; i++; }
      else if (VOWEL_ON_VAV.test(markStr)) out += "B" + nikudVowelFor(markStr);
      else if (HOLAM.test(markStr) || markStr.includes(DAGESH)) out += "u";
      else if (isFirstLetter) out += "B";
      else out += "u";
      continue;
    }
    const cls = HEB_CLASS[ch];
    if (cls) out += cls + nikudVowelFor(markStr);
    // anything else (punctuation, ױ/ײ vowel ligatures) dropped
  }
  return collapseRuns(out);
}

const HEB_PREFIX = new Set(["ה", "ו", "ב", "ל", "כ", "מ", "ש"]);

/**
 * Prefix-stripped surface variants of a nikud-stripped Hebrew token. Used
 * ONLY to widen the refined-key variant set for re-ranking — never fed back
 * into coarse recall (see DESIGN-v2.md open question 1: deliberately not
 * done — prefix-stripping must not widen recall).
 */
export function hebrewPrefixVariants(strippedSurface) {
  const out = [strippedSurface];
  const chars = [...strippedSurface];
  if (chars.length >= 3 && HEB_PREFIX.has(chars[0])) {
    out.push(chars.slice(1).join(""));
    if (chars.length >= 4 && HEB_PREFIX.has(chars[1])) {
      out.push(chars.slice(2).join(""));
    }
  }
  return out;
}

// --- Latin-side folding --------------------------------------------------

// Placeholders for query-side ambiguity, expanded by expandSlots below:
const S_AMBIG = ""; // s → S (samekh/sin) or T (Ashkenazi sav: "Shabbos")
const Z_AMBIG = ""; // z → Z (zayin) or C (tzadi: "mizrach"/"mitzrach")

/**
 * Fold one Latin-script token to its candidate keys (array, best first).
 * Handles Ashkenazi/Sephardi/YIVO conventions, diacritics, apostrophes,
 * doubled letters, and silent h.
 */
export function foldLatin(token, cap = 8) {
  let s = token.toLowerCase().normalize("NFD").replace(COMBINING_LATIN, "");
  s = s.replace(APOSTROPHES, "");
  s = s.replace(/x/g, "ks");
  // Digraphs first — pinned order (see header comment):
  s = s.replace(/sch|sh/g, "$");
  s = s.replace(/th/g, "T");
  s = s.replace(/tz|ts/g, "C");
  s = s.replace(/ch|kh|ck|q|k|c/g, "K");
  s = s.replace(/ph|f|v|w|b|p/g, "B");
  // Every h left over was a vowel-carrier ("Torah", "Ohr"); j/y are
  // consonantal yud, which Hebrew-side folding also drops.
  s = s.replace(/[hjy]/g, "");
  s = s.replace(/t/g, "T");
  s = s.replace(/s/g, S_AMBIG);
  s = s.replace(/z/g, Z_AMBIG);
  s = s.replace(/g/g, "G").replace(/d/g, "D").replace(/l/g, "L")
       .replace(/m/g, "M").replace(/n/g, "N").replace(/r/g, "R");
  s = s.replace(/[aeiou]/g, "");
  s = s.replace(/[^A-Z$ 0-9]/g, "");

  const slots = [...s].map((ch) =>
    ch === S_AMBIG ? ["S", "T"] : ch === Z_AMBIG ? ["Z", "C"] : ch
  );
  return expandSlots(slots, cap);
}

/**
 * Fold any token — script is auto-detected, so mixed Hebrew/Latin queries
 * work token by token. Pure-digit tokens pass through unchanged.
 */
export function foldToken(token, cap = 8) {
  if (isHebrewText(token)) return foldHebrew(token, cap);
  if (/[a-z]/i.test(token)) return foldLatin(token, cap);
  return token ? [token] : [];
}

/**
 * Fold one Latin-script token to its candidate refined keys (array, best
 * guess first). Carries the coarse folder's s/z query-side ambiguity into
 * the refined alphabet too — without it, "shabbos" pins to ʔaSaBaS while
 * שבת needs ʔaTaBaT, and the two never align well (DESIGN-v2.md).
 */
export function foldLatinRefined(token, cap = 8) {
  let s = token.toLowerCase().normalize("NFD").replace(COMBINING_LATIN, "");
  s = s.replace(APOSTROPHES, "");
  s = s.replace(/x/g, "ks");
  s = s.replace(/sch|sh/g, "$");
  s = s.replace(/th/g, "T");
  s = s.replace(/tz|ts/g, "C");
  s = s.replace(/ch|kh|ck|q|k|c/g, "K");
  s = s.replace(/ph|f|v|w|b|p/g, "B");
  // h is a silent vowel-carrier, dropped; j is a rare consonant, dropped;
  // y is treated as vocalic here (unlike the coarse folder, which drops it).
  s = s.replace(/[hj]/g, "");
  s = s.replace(/y/g, "i");
  s = s.replace(/t/g, "T");
  s = s.replace(/s/g, S_AMBIG);
  s = s.replace(/z/g, Z_AMBIG);
  s = s.replace(/g/g, "G").replace(/d/g, "D").replace(/l/g, "L")
       .replace(/m/g, "M").replace(/n/g, "N").replace(/r/g, "R");
  s = s.replace(/[ae]/g, "a").replace(/[ou]/g, "u");
  s = s.replace(/[^A-Za-z$ 0-9]/g, "");

  const slots = [...s].map((ch) =>
    ch === S_AMBIG ? ["S", "T"] : ch === Z_AMBIG ? ["Z", "C"] : ch
  );
  // Word-initial vowel implies a Hebrew א/ע/ה: prepend the weak-consonant
  // marker so it aligns with the Hebrew-side ʔ (DESIGN-v2.md).
  return expandSlots(slots, cap).map((v) => (/^[aiu]/.test(v) ? "ʔ" + v : v));
}

/**
 * Fold any token to its candidate refined keys (array). Hebrew tokens also
 * get their prefix-stripped surface variants folded in (widens the refined
 * variant set only — see hebrewPrefixVariants).
 */
export function foldTokenRefined(token) {
  if (isHebrewText(token)) {
    const stripped = stripNikud(token);
    const variants = new Set([foldHebrewRefined(token)]);
    for (const v of hebrewPrefixVariants(stripped)) {
      if (v !== stripped) variants.add(foldHebrewRefined(v));
    }
    return [...variants].filter(Boolean);
  }
  if (/[a-z]/i.test(token)) return foldLatinRefined(token);
  return token ? [token] : [];
}

// Cartesian-expand ambiguous slots into whole-key variants (first
// alternative = best guess, so variant 0 is always the most likely key),
// then collapse consecutive duplicate classes and dedupe.
function expandSlots(slots, cap) {
  let variants = [""];
  for (const slot of slots) {
    const alts = Array.isArray(slot) ? slot : [slot];
    const next = [];
    for (const v of variants) {
      for (const alt of alts) {
        next.push(v + alt);
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    variants = next;
  }
  const seen = new Set();
  const out = [];
  for (const v of variants) {
    const collapsed = v.replace(/(.)\1+/g, "$1");
    if (collapsed && !seen.has(collapsed)) {
      seen.add(collapsed);
      out.push(collapsed);
    }
  }
  return out;
}

// --- Tokenization --------------------------------------------------------

// A Hebrew token starts with a letter and may contain nikud/teamim and
// geresh/gershayim (so רש"י stays one token); maqaf and sof pasuq separate
// tokens. NB: JS \b does not treat Latin→Hebrew transitions as a word
// boundary, which is why tokenization is explicit rather than regex-\b-based.
const TOKEN_RE =
  /[א-ײ][֑-ֽֿ-ׂׄ-ׇא-״]*|[a-zÀ-ɏ][a-zÀ-ɏ'’]*|\d+/gi;

/** Split raw text (any mix of scripts) into foldable tokens. */
export function tokenize(text) {
  return (text || "").match(TOKEN_RE) || [];
}
