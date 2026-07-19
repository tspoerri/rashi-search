// Gematria (Hebrew letters as numerals) helpers — useful alongside search
// when queries contain addresses like "בראשית כא ג" or a daf like "יב:".
//
// Gematria tokens are numerals, not words: none of the phonetic-folding
// machinery applies to them (never fold a gematria address). Adapted from
// Tamar's sefaria-era-fonts project (src/lib/hebrewSearch.js).

const GEMATRIA_VALUES = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
  // Final forms carry their base value (the rare 500-900 sofit convention
  // isn't used in chapter/verse addresses).
  ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90,
};

function letterValues(token) {
  return [...(token || "")]
    .filter((ch) => GEMATRIA_VALUES[ch] !== undefined)
    .map((ch) => GEMATRIA_VALUES[ch]);
}

/** Sum a gematria token's value ("יב" → 12). Returns 0 if no numeral letters. */
export function gematriaToNumber(token) {
  return letterValues(token).reduce((sum, v) => sum + v, 0);
}

/**
 * Conventional gematria runs largest place value first ("כא" = 21, never
 * "אכ"). A token violating that is more likely a word than a numeral —
 * callers can use this to decide whether to treat a token as an address.
 */
export function isValidGematriaOrder(token) {
  const values = letterValues(token);
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) return false;
  }
  return true;
}
