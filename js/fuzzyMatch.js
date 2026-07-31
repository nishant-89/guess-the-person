/**
 * fuzzyMatch.js
 * -----------------------------------------------------------------------
 * Pure string-matching utilities — no DOM, no game state, no I/O.
 * Safe to import unchanged into a NestJS service (for server-side
 * answer validation) or a React component, since it's plain JS logic.
 * -----------------------------------------------------------------------
 */

export function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

/**
 * @param {string} guess
 * @param {string[]} acceptableAnswers
 * @param {number} minSimilarity 0..1
 * @returns {boolean}
 */
export function isFuzzyMatch(guess, acceptableAnswers, minSimilarity = 0.72) {
  const g = normalize(guess);
  if (!g) return false;
  for (const ans of acceptableAnswers) {
    const a = normalize(ans);
    if (g === a) return true;
    if (similarity(g, a) >= minSimilarity) return true;
    // allow first-name-only / last-name-only guesses
    if (a.includes(g) && g.length >= 3) return true;
  }
  return false;
}
