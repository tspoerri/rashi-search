// Stress placement — spec §4: ta'amim override everything; otherwise
// morph-class-driven defaults via a pattern classifier + high-frequency table
// (the "mini-classifier" standing in for the source engine's lexicon).

import type { Syllable } from "havarotjs/syllable";
import type { Word } from "havarotjs/word";

const TAAMIM_RE = /[֑-֯]/g;
const NIKUD_RE = /[ְ-ׇ]/g;

// NFD gives canonical combining-mark order, so pointed strings compare reliably.
const strip = (s: string) => s.normalize("NFD").replace(TAAMIM_RE, "").replace(/[ֽֿ]/g, "");
const consonantsOnly = (s: string) => s.replace(NIKUD_RE, "").replace(TAAMIM_RE, "");

/** High-frequency mil'eil words (pointed, no taamim) → penultimate stress. */
const MILEIL_TABLE = new Set(
  [
    "לַיְלָה", "לָיְלָה", "עֶרֶב", "בֹּקֶר", "מֶלֶךְ", "יֶלֶד", "סֵפֶר", "דֶּרֶךְ",
    "אֶרֶץ", "אָרֶץ", "קֹדֶשׁ", "חֹדֶשׁ", "נַעַר", "שַׁעַר", "זֶרַע", "פֶּסַח",
    // directional-he forms
    "הַבַּיְתָה", "אַרְצָה", "מִצְרַיְמָה", "יָמָּה", "צָפוֹנָה", "נֶגְבָּה", "הַחוּצָה", "שָׁמַיְמָה",
  ].map(strip),
);

const SEGOLATE_FINAL_VOWELS = new Set(["SEGOL", "PATAH"]);
const GUTTURAL_FINALS = new Set(["ח", "ע", "ה"]);

// Suffixes pre-normalized to NFD so endsWith matches strip() output.
const VERB_SUFFIXES = ["תִּי", "ְתָּ", "ְנוּ"].map((s) => s.normalize("NFD"));

function isVerbPersonSuffix(word: Word): boolean {
  const c = consonantsOnly(word.text);
  const pointed = strip(word.text);
  // 1sg כָּתַבְתִּי / 2ms כָּתַבְתָּ / 1pl כָּתַבְנוּ
  if (pointed.endsWith(VERB_SUFFIXES[0]) && c.length >= 4) return true;
  return VERB_SUFFIXES.slice(1).some((suf) => pointed.endsWith(suf));
}

function isSegolateShape(syllables: Syllable[]): boolean {
  if (syllables.length < 2) return false;
  const final = syllables[syllables.length - 1];
  const finalVowel = final.vowelNames[0];
  if (!finalVowel || !SEGOLATE_FINAL_VOWELS.has(finalVowel)) return false;
  if (!final.isClosed) return false;
  // Segolates: מֶלֶךְ (segol-segol), סֵפֶר (tsere-segol), נַעַר (patach w/ guttural).
  if (finalVowel === "PATAH") {
    const lastCons = final.consonants[final.consonants.length - 1];
    if (!GUTTURAL_FINALS.has(lastCons ?? "")) return false;
  }
  const penult = syllables[syllables.length - 2];
  const pv = penult.vowelNames[0];
  if (pv === undefined || pv === "SHEVA") return false;
  // Segolate penults are plain short syllables — a mater (עֲלֵיכֶם's tsere-yod)
  // means a suffixed milra word, not a segolate.
  return penult.clusters.every((c) => !c.isMater);
}

/** בַּיִת / מַיִם / עַיִן pattern: final syllable = yod+hiriq after patach/qamats. */
function isAyiPattern(syllables: Syllable[]): boolean {
  if (syllables.length < 2) return false;
  const final = syllables[syllables.length - 1];
  const penult = syllables[syllables.length - 2];
  return (
    final.vowelNames[0] === "HIRIQ" &&
    final.consonants[0] === "י" &&
    (penult.vowelNames[0] === "PATAH" || penult.vowelNames[0] === "QAMATS")
  );
}

/** Furtive patach: word-final ח/ע with patach — stress stays on the previous vowel. */
function hasFurtivePatah(syllables: Syllable[]): boolean {
  if (syllables.length < 2) return false;
  const final = syllables[syllables.length - 1];
  const lastCons = final.consonants[final.consonants.length - 1];
  return (
    final.vowelNames[0] === "PATAH" &&
    (lastCons === "ח" || lastCons === "ע") &&
    final.consonants.length === 1 // the syllable is just the guttural + its patach
  );
}

/**
 * Returns the stressed syllable index for a word.
 * Processing is strictly per-word — the source engine's cross-word stress
 * bleed (spec §7) is avoided by construction.
 */
export function determineStress(word: Word): number {
  const syllables = word.syllables;
  if (syllables.length === 0) return 0;
  const last = syllables.length - 1;

  // 1. Ta'amim override — direct mark position, first mark wins (spec §4).
  for (let i = 0; i < syllables.length; i++) {
    if (syllables[i].taamim.length > 0) return i;
  }

  // 2. High-frequency table (incl. directional-he forms).
  if (MILEIL_TABLE.has(strip(word.text).replace(/־$/, ""))) {
    return Math.max(0, last - 1);
  }

  // 3. Shape classifier.
  if (isSegolateShape(syllables)) return last - 1;
  if (isAyiPattern(syllables)) return last - 1;
  if (hasFurtivePatah(syllables)) return last - 1;
  if (isVerbPersonSuffix(word)) return Math.max(0, last - 1);

  // 4. Default: milra.
  return last;
}
