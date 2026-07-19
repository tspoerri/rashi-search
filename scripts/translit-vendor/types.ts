// Core types for the transliteration engine.
// Pipeline per transliteration-engine-spec.md: syllabify → determine stress → render.

export type ConsonantName =
  | "ALEF" | "BET" | "GIMEL" | "DALET" | "HE" | "VAV" | "ZAYIN" | "HET"
  | "TET" | "YOD" | "KAF" | "LAMED" | "MEM" | "NUN" | "SAMEKH" | "AYIN"
  | "PE" | "TSADI" | "QOF" | "RESH" | "SHIN" | "SIN" | "TAV";

export type VowelName =
  | "PATAH" | "QAMATS" | "QAMATS_QATAN" | "TSERE" | "SEGOL" | "HIRIQ"
  | "HOLAM" | "HOLAM_HASER" | "QUBUTS" | "SHUREQ" | "SHEVA"
  | "HATAF_PATAH" | "HATAF_SEGOL" | "HATAF_QAMATS";

/** A consonant entry: single string, or split by begadkefat/dagesh status. */
export type ConsonantEntry = string | { dagesh: string; plain: string };

export type AccentMode = "none" | "bold" | "underline" | "capitalize" | "auto";

export type SyllableMode = "none" | "hyphen" | "dot";

/** How a style renders the stressed syllable (per-style `auto` behavior, spec §5). */
export type StressRenderMode =
  | "ignore"
  | "bold_tag"
  | "bold_all"          // 075: every syllable bolded in auto mode
  | "underline"
  | "capitalize"
  | "diacritic_acute"   // Spanish/Russian: acute over the vowel
  | "ipa_stress_symbol" // ˈ before the syllable
  | "auto_economical";  // 000: mark only when stress deviates from milra default

export interface StyleDef {
  id: string;
  name: string;
  /** Direct letter→cell mapping (310_braille); bypasses the phonetic pipeline. */
  letterMode?: boolean;
  /** Uppercase every rendered syllable (060_super_simple). */
  uppercase?: boolean;
  consonants: Record<ConsonantName, ConsonantEntry>;
  vowels: Record<VowelName, string>;
  /** Vocal-sheva rendering (silent sheva renders as "" or guttural apostrophe). */
  vocalSheva: string;
  /** Mark long vowels with ː (IPA). */
  longVowelMark?: string;
  /** What each accent mode does in this style. `auto` varies per style (spec §5). */
  stressRender: Record<AccentMode, StressRenderMode>;
  /** Combining/precomposed acute strategy for diacritic_acute styles. */
  acute?: "precomposed" | "combining";
}

/** One rendered syllable: structured, so unclosed-tag bugs are impossible by construction. */
export interface RenderedSyllable {
  text: string;
  stressed: boolean;
  /** True when stress deviates from the milra (final-syllable) default. */
  nonDefaultStress: boolean;
}

export interface RenderedWord {
  syllables: RenderedSyllable[];
  /** Joined to the next word by maqaf. */
  maqafNext: boolean;
}

export interface TransliterateOptions {
  style: string;
  syllableMode?: SyllableMode;
  accentMode?: AccentMode;
}

export interface TransliterateResult {
  /** Plain text output (stress via capitalize/diacritic/ˈ only; no tags). */
  text: string;
  /** HTML output with <strong>/<u> stress tags — always well-formed. */
  html: string;
  words: RenderedWord[];
}
