/**
 * config.js
 * -----------------------------------------------------------------------
 * Centralized, tunable game settings.
 *
 * Phase 2 note: this whole object could become a `/api/config` response
 * from NestJS (e.g. a GameSettings collection in MongoDB), letting you
 * change scoring/difficulty without redeploying the frontend. For now
 * it's a plain static export.
 * -----------------------------------------------------------------------
 */

export const CONFIG = {
  maxHints: 5,
  maxAttempts: 3,
  pointsByHint: [100, 80, 60, 40, 20], // index 0 = hint 1
  fuzzyMinSimilarity: 0.72,             // 0..1, higher = stricter matching
  countdownSeconds: 3,
  countdownIntervalMs: 900,

  // --- Photo obfuscation ---
  // The photo must NOT be identifiable during play — hints are the only
  // valid way to guess. Blur + a dark scrim stay constant and heavy
  // through all hints; wrong guesses only drop the cosmetic redaction
  // bars (no clarity gain). Full clarity is revealed only when the round
  // ends (solved or failed).
  photoBlurPx: 32,
  photoScrimOpacity: 0.42,
  photoRevealOnRoundEnd: true,

  // --- Name mask (hangman-style blanks) ---
  // 0-indexed hint at which the letter mask starts appearing.
  // Default 3 = starts on clue 4. Exactly ONE letter is revealed and it
  // does NOT progress further on later clues. Set to a number >= maxHints
  // to disable entirely.
  nameMaskStartHintIndex: 3,

  // --- Pacing ---
  // Minimum seconds a hint must be visible before "Next Clue" unlocks.
  // Does NOT block submitting a guess — only blocks skipping ahead.
  // A wrong guess also force-unlocks it immediately, regardless of timer.
  minHintViewSeconds: 5,

  // --- Speed bonus ---
  // Extra points if a CORRECT guess is submitted within this many seconds
  // of the current hint appearing.
  speedBonusWindowSeconds: 5,
  speedBonusPoints: 20,

  // --- Last-clue extra guess ---
  // On the final hint, allow this many guess submissions instead of 1.
  extraGuessesOnLastHint: 1, // i.e. 2 total guesses on the last clue

  // --- Onboarding ---
  // For a brand-new session's very first case, pick from this curated
  // list of well-known, easier persons instead of a fully random pick —
  // gives new players a confident first win instead of a coin-flip on
  // an obscure name. Leave empty to disable and always pick randomly.
  easyFirstCaseIds: ["person_001", "person_011", "person_013", "person_029", "person_033"],

  // --- Difficulty presets ---
  // Applied at runtime by the settings panel; takes effect from the NEXT
  // round, not mid-round. Difficulty ONLY affects how lenient guess
  // matching is — maxAttempts and minHintViewSeconds above are fixed
  // constants regardless of difficulty, not part of these presets.
  difficultyPresets: {
    easy:   { fuzzyMinSimilarity: 0.60 },
    normal: { fuzzyMinSimilarity: 0.72 },
    hard:   { fuzzyMinSimilarity: 0.82 }
  }
};
