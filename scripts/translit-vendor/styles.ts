// The 15 style substitution tables, transcribed from transliteration-engine-spec.md §5–6.
// Styles are expressed as deltas over the 000_simple_sefardi baseline, mirroring
// how the spec documents them.

import type { ConsonantEntry, ConsonantName, StyleDef, VowelName } from "./types.ts";

type ConsMap = Record<ConsonantName, ConsonantEntry>;
type VowelMap = Record<VowelName, string>;

const baseConsonants: ConsMap = {
  ALEF: "", BET: { dagesh: "b", plain: "v" }, GIMEL: "g", DALET: "d",
  HE: "h", VAV: "v", ZAYIN: "z", HET: "ch", TET: "t", YOD: "y",
  KAF: { dagesh: "k", plain: "ch" }, LAMED: "l", MEM: "m", NUN: "n",
  SAMEKH: "s", AYIN: "", PE: { dagesh: "p", plain: "f" }, TSADI: "tz",
  QOF: "k", RESH: "r", SHIN: "sh", SIN: "s", TAV: "t",
};

const baseVowels: VowelMap = {
  PATAH: "a", QAMATS: "a", QAMATS_QATAN: "o", TSERE: "e", SEGOL: "e",
  HIRIQ: "i", HOLAM: "o", HOLAM_HASER: "o", QUBUTS: "u", SHUREQ: "u",
  SHEVA: "e", HATAF_PATAH: "a", HATAF_SEGOL: "e", HATAF_QAMATS: "o",
};

type StyleOverrides = Omit<Partial<StyleDef>, "consonants" | "vowels"> & {
  consonants?: Partial<ConsMap>;
  vowels?: Partial<VowelMap>;
};

function style(id: string, name: string, overrides: StyleOverrides = {}): StyleDef {
  return {
    id,
    name,
    vocalSheva: "e",
    stressRender: {
      none: "ignore",
      bold: "bold_tag",
      underline: "underline",
      capitalize: "capitalize",
      auto: "auto_economical",
    },
    ...overrides,
    consonants: { ...baseConsonants, ...(overrides.consonants ?? {}) },
    vowels: { ...baseVowels, ...(overrides.vowels ?? {}) },
  };
}

const simpleSefardi = style("000_simple_sefardi", "Simple Sefardi (Modern Israeli)");

const simpleAshkenazi = style("010_simple_ashkenazi", "Simple Ashkenazi", {
  // Ashkenazi preserves the qamats/patach split; sof without dagesh = "s".
  consonants: { TAV: { dagesh: "t", plain: "s" } },
  vowels: { QAMATS: "o" },
});

const superSimple = style("060_super_simple", "Super Simple (ALL CAPS)", {
  uppercase: true,
  // Phonetic spelling blocks (AH/EH/EE/OH/OO); qamats = "AH" (Modern, spec §6).
  vowels: {
    PATAH: "ah", QAMATS: "ah", QAMATS_QATAN: "oh", TSERE: "eh", SEGOL: "eh",
    HIRIQ: "ee", HOLAM: "oh", HOLAM_HASER: "oh", QUBUTS: "oo", SHUREQ: "oo",
    SHEVA: "eh", HATAF_PATAH: "ah", HATAF_SEGOL: "eh", HATAF_QAMATS: "oh",
  },
  vocalSheva: "eh",
});

// 070 observed byte-identical to 010 (spec §6/§7) — alias, not a separate table.
const artscroll: StyleDef = { ...simpleAshkenazi, id: "070_artscroll", name: "Artscroll" };

const artscrollSephardic = style("075_artscroll_sephardic", "Artscroll Sephardic (beta)", {
  consonants: { HET: "ḥ", TSADI: "ṣ" },
  vowels: { QAMATS: "a" },
  stressRender: {
    none: "ignore", bold: "bold_tag", underline: "underline",
    capitalize: "capitalize", auto: "bold_all", // beta quirk: auto bolds every syllable
  },
});

const sblAcademic = style("110_sbl_academic", "SBL Academic", {
  consonants: {
    ALEF: "ʾ", AYIN: "ʿ",
    BET: { dagesh: "b", plain: "b̲" }, GIMEL: { dagesh: "g", plain: "g̲" },
    DALET: { dagesh: "d", plain: "d̲" }, KAF: { dagesh: "k", plain: "k̲" },
    PE: { dagesh: "p", plain: "p̲" }, TAV: { dagesh: "t", plain: "t̲" },
    HET: "ḥ", TET: "ṭ", TSADI: "ṣ", QOF: "q", SHIN: "š", SIN: "ś", VAV: "w",
  },
  vowels: {
    QAMATS: "ā", TSERE: "ē", HOLAM: "ō", HOLAM_HASER: "ō", SHUREQ: "û",
    SHEVA: "ə", HATAF_PATAH: "ă", HATAF_SEGOL: "ĕ", HATAF_QAMATS: "ŏ",
  },
  vocalSheva: "ə",
});

const sblGeneral = style("120_sbl_general", "SBL General", {
  consonants: {
    ALEF: "", AYIN: "",
    GIMEL: { dagesh: "g", plain: "gh" }, DALET: { dagesh: "d", plain: "dh" },
    KAF: { dagesh: "k", plain: "kh" }, TAV: { dagesh: "t", plain: "th" },
    HET: "kh", // merged with plain kaf (Tiberian SBL convention, spec §6)
    TSADI: "ts", QOF: "q", VAV: "v",
  },
});

const brill = style("130_brill", "Brill Simple", {
  consonants: {
    ALEF: "'",        // straight apostrophe
    AYIN: "‘",   // curly opening quote — deliberately distinct (spec §6)
    HET: "ḥ",         // kept distinct from...
    KAF: { dagesh: "k", plain: "kh" }, // ...plain kaf digraph
    TSADI: "ts", QOF: "q", SHIN: "sh", SIN: "s",
  },
});

const ipa = style("140_ipa", "IPA", {
  consonants: {
    ALEF: "ʔ", AYIN: "ʔ",
    HET: "χ", KAF: { dagesh: "k", plain: "χ" }, // merged uvular fricative
    RESH: "ʁ", SHIN: "ʃ", TSADI: "ts", YOD: "j", QOF: "k", VAV: "v",
  },
  vowels: { SHEVA: "ə" },
  vocalSheva: "ə",
  longVowelMark: "ː",
  stressRender: {
    none: "ignore", bold: "bold_tag", underline: "underline",
    capitalize: "capitalize", auto: "ipa_stress_symbol",
    // NOTE: the source engine appends a spurious unclosed </strong> here 100% of
    // the time (spec §7). We intentionally do NOT reproduce that bug.
  },
});

const iso259 = style("150_iso_259_2", "ISO 259-2", {
  // Pure letter transliteration: begadkefat spirantization explicitly ignored.
  consonants: {
    ALEF: "ʾ", AYIN: "ʿ",
    BET: "b", GIMEL: "g", DALET: "d", KAF: "k", PE: "p", TAV: "t",
    HET: "ḥ", TET: "ṭ", TSADI: "ṣ", QOF: "q", SHIN: "š", SIN: "ś", VAV: "w",
  },
  vowels: {
    QAMATS: "ā", TSERE: "ē", HOLAM: "ō", HOLAM_HASER: "ō",
    SHEVA: "ə", HATAF_PATAH: "ă", HATAF_SEGOL: "ĕ", HATAF_QAMATS: "ŏ",
  },
  vocalSheva: "ə",
});

const spanish = style("210_spanish", "Spanish", {
  consonants: {
    HET: "j", KAF: { dagesh: "k", plain: "j" }, // both collapse to jota
    VAV: "w",
  },
  stressRender: {
    none: "ignore", bold: "bold_tag", underline: "underline",
    capitalize: "capitalize", auto: "diacritic_acute",
  },
  acute: "precomposed", // á í ú...
});

const german = style("220_german", "German", {
  consonants: {
    BET: { dagesh: "b", plain: "w" }, // German w = /v/
    VAV: "w", YOD: "j", TSADI: "z",   // German z = /ts/
    SHIN: "sch",
  },
});

const russian = style("230_russian", "Russian (Cyrillic)", {
  consonants: {
    ALEF: "", AYIN: "",
    BET: { dagesh: "б", plain: "в" }, GIMEL: "г", DALET: "д", HE: "г",
    VAV: "в", ZAYIN: "з", HET: "х", TET: "т", YOD: "й",
    KAF: { dagesh: "к", plain: "х" }, LAMED: "л", MEM: "м", NUN: "н",
    SAMEKH: "с", PE: { dagesh: "п", plain: "ф" }, TSADI: "ц", QOF: "к",
    RESH: "р", SHIN: "ш", SIN: "с", TAV: "т",
  },
  vowels: {
    PATAH: "а", QAMATS: "а", QAMATS_QATAN: "о", TSERE: "е", SEGOL: "е",
    HIRIQ: "и", HOLAM: "о", HOLAM_HASER: "о", QUBUTS: "у", SHUREQ: "у",
    SHEVA: "е", HATAF_PATAH: "а", HATAF_SEGOL: "е", HATAF_QAMATS: "о",
  },
  vocalSheva: "е",
  stressRender: {
    none: "ignore", bold: "bold_tag", underline: "underline",
    capitalize: "capitalize", auto: "diacritic_acute",
  },
  acute: "combining", // U+0301 over the Cyrillic vowel
});

const finnish = style("240_finnish", "Finnish", {
  consonants: {
    ALEF: "ʾ", AYIN: "ʿ",
    HET: "ḥ", QOF: "q", TSADI: "ṣ", // kept distinct via diacritics
    KAF: { dagesh: "k", plain: "kh" },
    SHIN: "š", YOD: "j",
  },
  stressRender: {
    none: "ignore", bold: "bold_tag", underline: "underline",
    capitalize: "capitalize", auto: "ignore", // auto shows nothing (spec §5)
  },
});

// 310_braille: direct letter→cell mapping (North American Braille ASCII), not phonetic.
// Vowel-cell coverage is partial — only cells confirmed by the spec's evidence
// (qamats "<", holam male "O", shuruq "U") are emitted; other points pass silently.
const braille = style("310_braille", "Braille ASCII", {
  letterMode: true,
  consonants: {
    ALEF: "A", BET: "V", GIMEL: "G", DALET: "D", HE: "E", VAV: "W", ZAYIN: "Z",
    HET: "H", TET: "T", YOD: "J", KAF: "*", LAMED: "L", MEM: "M", NUN: "N",
    SAMEKH: "S", AYIN: "$", PE: "F", TSADI: "!", QOF: "Q", RESH: "R",
    SHIN: "%", SIN: "%", TAV: "\\",
  },
  vowels: {
    PATAH: "", QAMATS: "<", QAMATS_QATAN: "<", TSERE: "", SEGOL: "",
    HIRIQ: "", HOLAM: "O", HOLAM_HASER: "", QUBUTS: "", SHUREQ: "U",
    SHEVA: "", HATAF_PATAH: "", HATAF_SEGOL: "", HATAF_QAMATS: "",
  },
  vocalSheva: "",
  stressRender: {
    none: "ignore", bold: "ignore", underline: "ignore",
    capitalize: "ignore", auto: "ignore",
  },
});

export const STYLES: StyleDef[] = [
  simpleSefardi, simpleAshkenazi, superSimple, artscroll, artscrollSephardic,
  sblAcademic, sblGeneral, brill, ipa, iso259,
  spanish, german, russian, finnish, braille,
];

export const STYLE_MAP: Record<string, StyleDef> = Object.fromEntries(
  STYLES.map((s) => [s.id, s]),
);
