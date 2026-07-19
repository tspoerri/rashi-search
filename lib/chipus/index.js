// Vendored from ../chipus v0.1 (src/index.js) — do not edit here.
// To pick up upstream changes, re-copy from ../chipus/src/.

// chipus (חיפוש) — fast, typo-tolerant search for Hebrew text and English
// transliteration. Zero dependencies; browser and Node. See README.md.

export {
  foldToken,
  foldHebrew,
  foldLatin,
  tokenize,
  stripNikud,
  isHebrewText,
} from "./fold.js";

export { ChipusIndex, boundedEditDistance } from "./engine.js";

export { gematriaToNumber, isValidGematriaOrder } from "./gematria.js";
