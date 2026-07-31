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
  SCORE_CHANGE: "score:change"
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
    this.hintIndex = 0;
    this.attemptsLeft = config.maxAttempts;
    this.guessesUsedOnHint = 0;
    this.hintShownAt = 0;
    this.score = 0;
    this.roundLocked = false;

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

  /** Starts a new round with a random not-yet-used person, or emits GAME_COMPLETE. */
  startNewRound() {
    const remaining = this.persons.filter(p => !this.usedIds.has(p._id));
    if (remaining.length === 0) {
      this.emit(EVENTS.GAME_COMPLETE, { score: this.score });
      return;
    }
    const person = remaining[Math.floor(Math.random() * remaining.length)];
    this.usedIds.add(person._id);

    this.currentPerson = person;
    this.hintIndex = 0;
    this.attemptsLeft = this.config.maxAttempts;
    this.guessesUsedOnHint = 0;
    this.roundLocked = false;
    this.hintShownAt = Date.now();

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

    const correct = this.matchFn(guess, aliases, this.config.fuzzyMinSimilarity);

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
    this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
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
    this.emit(EVENTS.ROUND_FAILED, { person: this.currentPerson });
  }

  /** Resets score + used-person tracking, keeps the same person pool. */
  reset() {
    this.usedIds.clear();
    this.score = 0;
    this.emit(EVENTS.SCORE_CHANGE, { score: this.score });
  }
}
