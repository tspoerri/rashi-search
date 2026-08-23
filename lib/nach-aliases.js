// Nach (Prophets + Writings) book-name alias table.
//
// Mirrors the alias architecture used by bavli.html (TRACTATE_EXACT / fold /
// fuzzy tiers, AMBIG sentinel) and chumash.html (book-name matching). See
// bavli.html's TRACTATE_EXACT comment for why an exact lowercase-spelling
// map must be consulted BEFORE any folded/fuzzy lookup: folding collapses
// vowels and merges consonants, so distinct curated spellings can collide
// on the same folded key (e.g. here "yoel"/"iyov" or "ezra"/"ezrah" family
// spellings) — that collision must never be allowed to swallow a literal,
// unambiguous spelling a user actually typed.
//
// This module only builds the data + a small AMBIG-aware registration
// helper; it intentionally does NOT depend on lib/chipus (kept standalone
// per the task brief) and does NOT implement its own fold function — a
// consuming nach.html should reuse chipus's `foldToken` (as bavli.html and
// chumash.html both do) for the folded/fuzzy tiers, feeding it these alias
// maps in place of TRACTATE_ALIAS1/2 or BOOK_ALIAS.

"use strict";

// A folded/exact key claimed by two different books identifies nothing.
// Same sentinel pattern as bavli.html/chumash.html's AMBIG.
export const AMBIG = Symbol("ambiguous-alias");

function aliasSet(map, key, val) {
  if (!key) return;
  const cur = map.get(key);
  map.set(key, cur === undefined || cur === val ? val : AMBIG);
}

// ---------------------------------------------------------------------
// 1. Canonical inventory, Tanach order (Nevi'im then Kesuvim). English
//    titles match Sefaria exactly (see build2.py BOOKS); Hebrew names are
//    the plain (non-final-yud, no-gershayim) spelling used as canonical.
// ---------------------------------------------------------------------
export const NACH_BOOKS = [
  // Nevi'im Rishonim
  { en: "Joshua",        he: "יהושע" },
  { en: "Judges",        he: "שופטים" },
  { en: "I Samuel",      he: "שמואל א" },
  { en: "II Samuel",     he: "שמואל ב" },
  { en: "I Kings",       he: "מלכים א" },
  { en: "II Kings",      he: "מלכים ב" },
  // Nevi'im Acharonim
  { en: "Isaiah",        he: "ישעיהו" },
  { en: "Jeremiah",      he: "ירמיהו" },
  { en: "Ezekiel",       he: "יחזקאל" },
  // Trei Asar
  { en: "Hosea",         he: "הושע" },
  { en: "Joel",          he: "יואל" },
  { en: "Amos",          he: "עמוס" },
  { en: "Obadiah",       he: "עובדיה" },
  { en: "Jonah",         he: "יונה" },
  { en: "Micah",         he: "מיכה" },
  { en: "Nahum",         he: "נחום" },
  { en: "Habakkuk",      he: "חבקוק" },
  { en: "Zephaniah",     he: "צפניה" },
  { en: "Haggai",        he: "חגי" },
  { en: "Zechariah",     he: "זכריה" },
  { en: "Malachi",       he: "מלאכי" },
  // Kesuvim
  { en: "Psalms",        he: "תהילים" },
  { en: "Proverbs",      he: "משלי" },
  { en: "Job",           he: "איוב" },
  { en: "Song of Songs", he: "שיר השירים" },
  { en: "Ruth",          he: "רות" },
  { en: "Lamentations",  he: "איכה" },
  { en: "Ecclesiastes",  he: "קהלת" },
  { en: "Esther",        he: "אסתר" },
  { en: "Daniel",        he: "דניאל" },
  { en: "Ezra",          he: "עזרא" },
  { en: "Nehemiah",      he: "נחמיה" },
  { en: "I Chronicles",  he: "דברי הימים א" },
  { en: "II Chronicles", he: "דברי הימים ב" },
];

// ---------------------------------------------------------------------
// 4. Paired books (Shmuel, Melachim, Divrei Hayamim) split into I/II.
//    DECISION: an unqualified "shmuel" / "melachim" / "divrei hayamim"
//    (no aleph/bet, no I/II) is genuinely ambiguous between the two
//    halves and is registered as AMBIG, same treatment bavli.html gives a
//    fold-collision between two distinct tractates — NOT resolved to "both
//    books as a filter". Rationale:
//      - The two halves are large, separately-paginated works; silently
//        picking one (or unioning both) would surprise a user who typed a
//        book name expecting it to behave like every other exact book name.
//      - AMBIG is exactly the mechanism this codebase already has for "the
//        token is real but under-specified" — reusing it keeps behavior
//        consistent with bavli.html's shabbos/shevuos case rather than
//        inventing a second disambiguation strategy.
//      - A consuming UI can catch the AMBIG case and prompt "which one?"
//        (aleph/bet) the same way a fuzzy-tie miss would be handled.
//    The qualified forms (shmuel aleph, shmuel a, shmuel 1, I Samuel, ...)
//    are of course registered unambiguously to their own half below.
export const PAIRED_BOOKS = {
  "Samuel":         { I: "I Samuel",      II: "II Samuel" },
  "Kings":          { I: "I Kings",       II: "II Kings" },
  "Chronicles":     { I: "I Chronicles",  II: "II Chronicles" },
};

// ---------------------------------------------------------------------
// 2. Hebrew alias phrases (full strings, space-separated words) per book.
//    Spelling variants covered: final yud (ישעיה/ישעיהו), extra ה
//    (ירמיה/ירמיהו already covered by final-yud pair), aleph/bet spelled
//    as "א"/"ב", as "אלף"/"בית", with/without gershayim, and rabbinic
//    abbreviations (דה"א, דה"ב, שמ"א, שמ"ב, מל"א, מל"ב).
// ---------------------------------------------------------------------
const HEBREW_ALIASES = {
  "Joshua":        ["יהושע"],
  "Judges":        ["שופטים"],
  "I Samuel":      ["שמואל א", "שמואל א'", "שמואל אלף", "שמ\"א", "שמואל 1", "שמואל ראשון"],
  "II Samuel":     ["שמואל ב", "שמואל ב'", "שמואל בית", "שמ\"ב", "שמואל 2", "שמואל שני"],
  "I Kings":       ["מלכים א", "מלכים א'", "מלכים אלף", "מל\"א", "מלכים 1", "מלכים ראשון"],
  "II Kings":      ["מלכים ב", "מלכים ב'", "מלכים בית", "מל\"ב", "מלכים 2", "מלכים שני"],
  "Isaiah":        ["ישעיהו", "ישעיה"],
  "Jeremiah":      ["ירמיהו", "ירמיה"],
  "Ezekiel":       ["יחזקאל"],
  "Hosea":         ["הושע"],
  "Joel":          ["יואל"],
  "Amos":          ["עמוס"],
  "Obadiah":       ["עובדיה", "עבדיה"],
  "Jonah":         ["יונה"],
  "Micah":         ["מיכה"],
  "Nahum":         ["נחום"],
  "Habakkuk":      ["חבקוק"],
  "Zephaniah":     ["צפניה", "צפניהו"],
  "Haggai":        ["חגי"],
  "Zechariah":     ["זכריה", "זכריהו"],
  "Malachi":       ["מלאכי"],
  "Psalms":        ["תהילים", "תהלים"],
  "Proverbs":      ["משלי"],
  "Job":           ["איוב"],
  "Song of Songs": ["שיר השירים", "שיר השירים לשלמה"],
  "Ruth":          ["רות"],
  "Lamentations":  ["איכה", "קינות"],
  "Ecclesiastes":  ["קהלת"],
  "Esther":        ["אסתר", "מגילת אסתר"],
  "Daniel":        ["דניאל"],
  "Ezra":          ["עזרא"],
  "Nehemiah":      ["נחמיה"],
  "I Chronicles":  ["דברי הימים א", "דברי הימים א'", "דברי הימים אלף", "דה\"א", "דברי הימים 1", "דברי הימים ראשון"],
  "II Chronicles": ["דברי הימים ב", "דברי הימים ב'", "דברי הימים בית", "דה\"ב", "דברי הימים 2", "דברי הימים שני"],
};

// Unqualified paired-book Hebrew tokens -> AMBIG (see PAIRED_BOOKS above).
const HEBREW_AMBIGUOUS_PHRASES = ["שמואל", "מלכים", "דברי הימים", "דה\"י"];

// ---------------------------------------------------------------------
// 3. Latin exact-spelling map: lowercase transliterations (Ashkenazi +
//    Sephardi) and common English titles. Style matches bavli.html's
//    TRACTATE_ALIASES (extra spellings beyond the plain English name,
//    which is registered automatically for every book).
// ---------------------------------------------------------------------
const LATIN_ALIASES = {
  "Joshua":        ["yehoshua", "yehoshuah", "y'hoshua"],
  "Judges":        ["shoftim", "shofetim"],
  "I Samuel":      ["shmuel aleph", "shmuel a", "shmuel 1", "samuel 1", "samuel i", "shmuel alef", "1 samuel"],
  "II Samuel":     ["shmuel bet", "shmuel b", "shmuel 2", "samuel 2", "samuel ii", "shmuel beis", "2 samuel"],
  "I Kings":       ["melachim aleph", "melachim a", "melachim alef", "melochim aleph", "kings 1", "kings i", "1 kings"],
  "II Kings":      ["melachim bet", "melachim b", "melochim bet", "melachim beis", "kings 2", "kings ii", "2 kings"],
  "Isaiah":        ["yeshaya", "yeshayahu", "yishayahu", "yishaya", "isaiah", "isaias"],
  "Jeremiah":      ["yirmiya", "yirmiyahu", "yirmiyohu", "jeremiah", "jeremias"],
  "Ezekiel":       ["yechezkel", "yechezkiel", "ezekiel", "yehezkel"],
  "Hosea":         ["hoshea", "hosea", "oshea"],
  "Joel":          ["yoel", "joel"],
  "Amos":          ["amos"],
  "Obadiah":       ["ovadia", "ovadiah", "obadiah", "avadia"],
  "Jonah":         ["yonah", "yona", "jonah"],
  "Micah":         ["micha", "michah", "michoh", "micah"],
  "Nahum":         ["nachum", "nachoom", "nahum"],
  "Habakkuk":      ["chavakuk", "havakuk", "habakkuk", "chabakuk"],
  "Zephaniah":     ["tzefania", "tzefaniah", "zephaniah", "tzephania"],
  "Haggai":        ["chagai", "haggai", "chaggai"],
  "Zechariah":     ["zecharia", "zechariah", "zecharya"],
  "Malachi":       ["malachi", "malachy"],
  "Psalms":        ["tehillim", "tehilim", "tehillim", "psalms", "psalm"],
  "Proverbs":      ["mishlei", "mishley", "proverbs"],
  "Job":           ["iyov", "iyov", "iov", "job"],
  "Song of Songs": ["shir hashirim", "shir ha-shirim", "shir hashirim lishlomo", "songofsongs", "song of songs", "canticles", "song of solomon"],
  "Ruth":          ["rus", "ruth"],
  "Lamentations":  ["eicha", "eichah", "aicha", "lamentations", "kinnos"],
  "Ecclesiastes":  ["koheles", "kohelet", "qoheles", "ecclesiastes"],
  "Esther":        ["esther", "ester", "megillas esther", "megillat esther"],
  "Daniel":        ["daniel", "doniel"],
  "Ezra":          ["ezra", "ezrah"],
  "Nehemiah":      ["nechemia", "nechemiah", "nehemiah", "nechemyah"],
  "I Chronicles":  ["divrei hayamim aleph", "divrei hayamim a", "dh\"a", "d.h.a", "chronicles 1", "chronicles i", "1 chronicles", "divrei hayamim alef"],
  "II Chronicles": ["divrei hayamim bet", "divrei hayamim b", "dh\"b", "d.h.b", "chronicles 2", "chronicles ii", "2 chronicles", "divrei hayamim beis"],
};

// Unqualified paired-book Latin tokens/phrases -> AMBIG (see PAIRED_BOOKS).
const LATIN_AMBIGUOUS_PHRASES = [
  "shmuel", "samuel",
  "melachim", "melochim", "kings",
  "divrei hayamim", "chronicles", "divrei hayomim",
];

// ---------------------------------------------------------------------
// Build the alias maps. Two tiers, matching bavli.html's shape:
//   NACH_EXACT      — exact lowercase (Latin) / literal (Hebrew) spelling,
//                      full phrase as typed, consulted first.
//   NACH_ALIAS1/2   — folded key(s) -> book en, for single-/two-word
//                      phrases, to be fed through the consuming page's own
//                      foldToken() for the fuzzy/typo-tolerant tier. This
//                      module stores the *un-folded* words split out so the
//                      caller can fold them with whatever foldToken it has
//                      in scope (chipus's), keeping this module dependency
//                      free. Use buildFoldedAliases(foldToken) below.
// ---------------------------------------------------------------------
export const NACH_EXACT = new Map(); // lowercase/literal phrase -> en | AMBIG

function registerExact(phrase, en) {
  aliasSet(NACH_EXACT, phrase.trim().toLowerCase(), en);
}

export function buildExactAliases() {
  NACH_EXACT.clear();
  for (const b of NACH_BOOKS) {
    // Hebrew canonical + variants
    for (const he of [b.he, ...(HEBREW_ALIASES[b.en] || [])]) registerExact(he, b.en);
    // English canonical (Sefaria title) + Latin variants
    for (const en of [b.en, ...(LATIN_ALIASES[b.en] || [])]) registerExact(en, b.en);
  }
  for (const phrase of HEBREW_AMBIGUOUS_PHRASES) aliasSet(NACH_EXACT, phrase.trim().toLowerCase(), AMBIG);
  for (const phrase of LATIN_AMBIGUOUS_PHRASES) aliasSet(NACH_EXACT, phrase.trim().toLowerCase(), AMBIG);
  return NACH_EXACT;
}

// Word-level phrase lists per book, for callers building their own folded
// ALIAS1 ("single word" -> en) / ALIAS2 ("word1|word2" -> en) maps the same
// way bavli.html's registerTractatePhrase does. Returned as plain phrase
// strings (Hebrew + Latin combined); caller runs its own foldToken.
export function allPhrasesFor(en) {
  const heCanonical = NACH_BOOKS.find((b) => b.en === en)?.he;
  return [
    ...(heCanonical ? [heCanonical] : []),
    ...(HEBREW_ALIASES[en] || []),
    en,
    ...(LATIN_ALIASES[en] || []),
  ];
}

/**
 * Build folded ALIAS1/ALIAS2 maps using a caller-supplied foldToken (e.g.
 * chipus's `foldToken`), the same shape bavli.html's registerTractatePhrase
 * produces. Returns { alias1, alias2 } Maps. AMBIG-phrase words are NOT
 * folded in here (they are exact-only, matching bavli.html's treatment of
 * the exact-map AMBIG entries which don't get a folded counterpart either).
 */
export function buildFoldedAliases(foldToken) {
  const alias1 = new Map();
  const alias2 = new Map();
  for (const b of NACH_BOOKS) {
    for (const phrase of allPhrasesFor(b.en)) {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        for (const k of foldToken(words[0])) aliasSet(alias1, k, b.en);
      } else if (words.length === 2) {
        for (const k1 of foldToken(words[0])) {
          for (const k2 of foldToken(words[1])) aliasSet(alias2, k1 + "|" + k2, b.en);
        }
      }
      // 3+ word phrases (e.g. "shir hashirim lishlomo") intentionally have
      // no folded registration; the exact map and the 2-word head
      // ("shir hashirim") cover them.
    }
  }
  return { alias1, alias2 };
}
