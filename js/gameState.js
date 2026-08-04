/**
 * gameState.js
 * -----------------------------------------------------------------------
 * All game rules and state live here, completely decoupled from the DOM.
 * ui.js listens to events this class emits and renders accordingly.
 *
 * Phase 2 note: this class's shape (state + methods + emitted events)
 * maps cleanly onto:
 *   - a React custom hook (`useGameState`) using useReducer internally, or
 *   - a NestJS `GameSessionService` if you want server-authoritative state
 *     (recommended eventually, so scores/attempts can't be tampered with
 *     client-side, and so speed-bonus timing can't be spoofed either).
 * Either way, the EVENT NAMES below are a stable contract worth keeping.
 * -----------------------------------------------------------------------
 */

export const EVENTS = {
  ROUND_START: "round:start",
  HINT_ADVANCE: "hint:advance",
  GUESS_WRONG: "guess:wrong",
  ROUND_SOLVED: "round:solved",
  ROUND_FAILED: "round:failed",
  GAME_COMPLETE: "game:complete",
  SCORE_CHANGE: "score:change",
  STREAK_CHANGE: "streak:change"
};

export class GameState {
  /**
   * @param {Array<Object>} persons
   * @param {Object} config
   * @param {(guess:string, aliases:string[], minSim:number) => boolean} matchFn
   */
  constructor(persons, config, matchFn) {
    this.persons = persons;
    this.config = config;
    this.matchFn = matchFn;

    this.usedIds = new Set();
    this.currentPerson = null;
    this._sortedClueTexts = [];
    this.hintIndex = 0;
    this.attemptsLeft = config.maxAttempts;
    this.guessesUsedOnHint = 0;
    this.hintShownAt = 0;
    this.roundFuzzyMinSimilarity = config.fuzzyMinSimilarity;
    this.score = 0;
    this.roundLocked = false;

    // Stats — purely for the end-of-session summary. Not used for scoring logic.
    this.stats = {
      solvedCount: 0,
      failedCount: 0,
      hintIndexCounts: new Array(config.maxHints).fill(0), // solves per hint index
      bestHintIndex: null, // lowest hint index a correct solve happened on (fewest clues used)
      streak: 0,
      bestStreak: 0
    };

    this._listeners = {};
  }

  on(event, callback) {
    (this._listeners[event] ||= []).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, payload) {
    (this._listeners[event] || []).forEach(cb => cb(payload));
  }

  get isLastHint() {
    return this.hintIndex === this.config.maxHints - 1;
  }

  get maxGuessesThisHint() {
    return 1 + (this.isLastHint ? (this.config.extraGuessesOnLastHint || 0) : 0);
  }

  get attemptsUsed() {
    return this.config.maxAttempts - this.attemptsLeft;
  }

  /**
   * Returns the clue text for a given hint index, ordered by each clue's
   * `level` field (not by its raw position in the JSON array) — so
   * reordering which clue shows first/second/etc. is purely a data change
   * (edit `level` values in persons.json), never a code change.
   * Falls back to the last available clue if a person has fewer clues
   * than config.maxHints.
   * @param {number} index - 0-based hint index
   * @returns {string}
   */
  getClueText(index) {
    const sorted = this._sortedClueTexts;
    if (!sorted || sorted.length === 0) return "";
    return sorted[index] ?? sorted[sorted.length - 1];
  }

  /** Builds and caches the level-sorted clue text list for the current person. */
  _cacheSortedClues(person) {
    const clues = person?.clues || [];
    this._sortedClueTexts = [...clues]
      .sort((a, b) => a.level - b.level)
      .map(c => c.text);
  }

  /**
   * Starts a new round with a random not-yet-used person, or emits GAME_COMPLETE.
   * The very first round of a brand-new session (nothing played yet) picks
   * from `config.easyFirstCaseIds` if provided, so new players get a
   * confident first win instead of a coin-flip on an obscure name.
   */
  startNewRound() {
    const remaining = this.persons.filter(p => !this.usedIds.has(p._id));
    if (remaining.length === 0) {
      this.emit(EVENTS.GAME_COMPLETE, { score: this.score, stats: { ...this.stats } });
      return;
    }

    let person;
    const isVeryFirstRound = this.usedIds.size === 0;
    const easyIds = this.config.easyFirstCaseIds;
    if (isVeryFirstRound && easyIds?.length) {
      const easyPool = remaining.filter(p => easyIds.includes(p._id));
      person = easyPool.length
        ? easyPool[Math.floor(Math.random() * easyPool.length)]
        : remaining[Math.floor(Math.random() * remaining.length)];
    } else {
      person = remaining[Math.floor(Math.random() * remaining.length)];
    }

    this.usedIds.add(person._id);

    this.currentPerson = person;
    this._cacheSortedClues(person);
    this.hintIndex = 0;
    this.attemptsLeft = this.config.maxAttempts;
    this.guessesUsedOnHint = 0;
    this.roundLocked = false;
    this.hintShownAt = Date.now();
    // Snapshot difficulty-sensitive values now — a settings change mid-round
    // must not retroactively affect the round already in progress.
    this.roundFuzzyMinSimilarity = this.config.fuzzyMinSimilarity;

    this.emit(EVENTS.ROUND_START, {
      person,
      caseNumber: this.usedIds.size,
      totalCases: this.persons.length,
      hintIndex: this.hintIndex,
      attemptsUsed: this.attemptsUsed
    });
  }

  /**
   * Submit a guess for the current hint. Normally 1 submission per hint,
   * except the last hint which allows `config.extraGuessesOnLastHint` more.
   * @param {string} guessText
   */
  submitGuess(guessText) {
    if (this.roundLocked) return;
    if (this.guessesUsedOnHint >= this.maxGuessesThisHint) return;

    const guess = (guessText || "").trim();
    if (!guess) return;

    this.guessesUsedOnHint += 1;

    const aliases = this.currentPerson.aliases?.length
      ? this.currentPerson.aliases
      : [this.currentPerson.name];

    const correct = this.matchFn(guess, aliases, this.roundFuzzyMinSimilarity);

    if (correct) {
      this._solveRound();
      return;
    }

    this.attemptsLeft -= 1;
    const guessesRemainingThisHint = this.maxGuessesThisHint - this.guessesUsedOnHint;
    const canRetrySameHint = guessesRemainingThisHint > 0 && this.attemptsLeft > 0;

    this.emit(EVENTS.GUESS_WRONG, {
      attemptsLeft: this.attemptsLeft,
      attemptsUsed: this.attemptsUsed,
      canRetrySameHint,
      guessesRemainingThisHint
    });

    if (this.attemptsLeft <= 0) {
      this._failRound();
      return;
    }

    // Last hint, guesses exhausted, and no further hints to advance to.
    if (!canRetrySameHint && this.isLastHint) {
      this._failRound();
    }
  }

  /** Move to next hint without guessing, or fails the round if hints are exhausted. */
  advanceHint() {
    if (this.roundLocked) return;
    if (this.attemptsLeft <= 0) return;

    this.hintIndex += 1;
    if (this.hintIndex >= this.config.maxHints) {
      this._failRound();
      return;
    }
    this.guessesUsedOnHint = 0;
    this.hintShownAt = Date.now();
    this.emit(EVENTS.HINT_ADVANCE, { hintIndex: this.hintIndex });
  }

  /** Player concedes the round voluntarily — reveals the answer immediately, same as running out of attempts. */
  giveUp() {
    if (this.roundLocked) return;
    this._failRound();
  }

  _solveRound() {
    this.roundLocked = true;
    const basePoints = this.config.pointsByHint[this.hintIndex]
      ?? this.config.pointsByHint[this.config.pointsByHint.length - 1];

    const elapsedMs = Date.now() - this.hintShownAt;
    const speedBonusApplied = this.config.speedBonusWindowSeconds > 0
      && elapsedMs <= this.config.speedBonusWindowSeconds * 1000;
    const bonus = speedBonusApplied ? this.config.speedBonusPoints : 0;
    const points = basePoints + bonus;

    this.score += points;

    this.stats.solvedCount += 1;
    this.stats.hintIndexCounts[this.hintIndex] = (this.stats.hintIndexCounts[this.hintIndex] || 0) + 1;
    if (this.stats.bestHintIndex === null || this.hintIndex < this.stats.bestHintIndex) {
      this.stats.bestHintIndex = this.hintIndex;
    }
    this.stats.streak += 1;
    const isNewBest = this.stats.streak > this.stats.bestStreak;
    if (isNewBest) this.stats.bestStreak = this.stats.streak;

    this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
    this.emit(EVENTS.STREAK_CHANGE, { streak: this.stats.streak, bestStreak: this.stats.bestStreak, isNewBest });
    this.emit(EVENTS.ROUND_SOLVED, {
      person: this.currentPerson,
      points,
      basePoints,
      bonus,
      speedBonusApplied,
      hintIndex: this.hintIndex
    });
  }

  _failRound() {
    this.roundLocked = true;
    this.stats.failedCount += 1;
    this.stats.streak = 0;
    this.emit(EVENTS.STREAK_CHANGE, { streak: 0, bestStreak: this.stats.bestStreak, isNewBest: false });
    this.emit(EVENTS.ROUND_FAILED, { person: this.currentPerson });
  }

  /** Resets score, stats, and used-person tracking, keeps the same person pool. */
  reset() {
    this.usedIds.clear();
    this.score = 0;
    this.stats = {
      solvedCount: 0,
      failedCount: 0,
      hintIndexCounts: new Array(this.config.maxHints).fill(0),
      bestHintIndex: null,
      streak: 0,
      bestStreak: 0
    };
    this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
    this.emit(EVENTS.STREAK_CHANGE, { streak: 0, bestStreak: 0, isNewBest: false });
  }

  /**
   * Serializes the minimal state needed to resume a session after a reload.
   * @returns {Object}
   */
  toSnapshot() {
    return {
      score: this.score,
      usedIds: [...this.usedIds],
      personId: this.currentPerson?._id || null,
      hintIndex: this.hintIndex,
      attemptsLeft: this.attemptsLeft,
      guessesUsedOnHint: this.guessesUsedOnHint,
      roundLocked: this.roundLocked,
      stats: { ...this.stats, hintIndexCounts: [...this.stats.hintIndexCounts] }
    };
  }

  /**
   * Restores state from a snapshot produced by toSnapshot(). Falls back to
   * starting a fresh round if the saved person no longer exists in the
   * current dataset (e.g. persons.json changed since the snapshot was saved).
   * @param {Object} saved
   * @returns {boolean} true if restore succeeded, false if it fell back to a fresh round
   */
  restore(saved) {
    if (!saved || !saved.personId) return false;
    const person = this.persons.find(p => p._id === saved.personId);
    if (!person) {
      this.startNewRound();
      return false;
    }

    this.usedIds = new Set(saved.usedIds || []);
    this.usedIds.add(person._id);
    this.score = saved.score || 0;
    if (saved.stats) {
      this.stats = {
        solvedCount: saved.stats.solvedCount || 0,
        failedCount: saved.stats.failedCount || 0,
        hintIndexCounts: saved.stats.hintIndexCounts || new Array(this.config.maxHints).fill(0),
        bestHintIndex: saved.stats.bestHintIndex ?? null,
        streak: saved.stats.streak || 0,
        bestStreak: saved.stats.bestStreak || 0
      };
    }

    // The snapshot was taken right after that round already ended (mid-overlay,
    // before "Next Person" was clicked) — don't replay a finished round, just
    // carry the restored score/usedIds/stats forward into a fresh one.
    if (saved.roundLocked) {
      this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
      this.startNewRound();
      return true;
    }

    this.currentPerson = person;
    this._cacheSortedClues(person);
    this.hintIndex = saved.hintIndex || 0;
    this.attemptsLeft = saved.attemptsLeft ?? this.config.maxAttempts;
    this.guessesUsedOnHint = saved.guessesUsedOnHint || 0;
    this.roundLocked = false;
    this.hintShownAt = Date.now(); // can't know real elapsed time across a reload — restart the speed-bonus clock fairly
    this.roundFuzzyMinSimilarity = this.config.fuzzyMinSimilarity;

    this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
    this.emit(EVENTS.ROUND_START, {
      person,
      caseNumber: this.usedIds.size,
      totalCases: this.persons.length,
      hintIndex: this.hintIndex,
      attemptsUsed: this.attemptsUsed
    });
    return true;
  }
}
