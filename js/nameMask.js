/**
 * nameMask.js
 * -----------------------------------------------------------------------
 * Pure function, no DOM/state — builds a hangman-style masked version of
 * a name. Starting at `startHintIndex`, exactly ONE letter is revealed
 * (the first alphabetic character in the name) and it does NOT progress
 * further on later hints — it's a single small assist, not a countdown
 * to the full answer.
 * -----------------------------------------------------------------------
 */

/**
 * @param {string} name - full name, e.g. "Sachin Tendulkar"
 * @param {number} hintIndex - current 0-based hint index
 * @param {number} startHintIndex - hint index at which the mask begins
 * @returns {string|null} masked string, or null if masking hasn't started yet
 */
export function buildNameMask(name, hintIndex, startHintIndex) {
  if (hintIndex < startHintIndex) return null;

  const chars = name.split("");
  const isLetter = (c) => /[a-zA-Z]/.test(c);

  const firstLetterIndex = chars.findIndex(isLetter);

  return chars
    .map((c, i) => {
      if (!isLetter(c)) return c; // keep spaces/punctuation as-is
      return i === firstLetterIndex ? c : "_";
    })
    .join("");
}
