// chipus (חיפוש) — fast, typo-tolerant search for Hebrew text and English
// transliteration. Zero dependencies; browser and Node. See README.md.

export {
  foldToken,
  foldHebrew,
  foldLatin,
  foldTokenRefined,
  foldHebrewRefined,
  foldLatinRefined,
  hebrewPrefixVariants,
  tokenize,
  stripNikud,
  isHebrewText,
} from "./fold.js";

export {
  ChipusIndex,
  boundedEditDistance,
  refinedDistance,
  refinedSimilarity,
} from "./engine.js";

export { gematriaToNumber, isValidGematriaOrder } from "./gematria.js";
