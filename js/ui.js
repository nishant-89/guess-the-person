/**
 * ui.js
 * -----------------------------------------------------------------------
 * The ONLY module that touches the DOM. It subscribes to GameState events
 * and renders accordingly; it never contains game rules itself.
 *
 * Navigation model: `this.viewIndex` is which hint is currently DISPLAYED
 * (0..gs.hintIndex). `gs.hintIndex` is the real game "frontier" — the
 * hint actually being played, which only advances via real game actions
 * (a wrong guess, or clicking Next Clue while at the frontier). Browsing
 * back to an earlier hint with "Previous" is purely a review — no
 * guessing there, and no re-imposed wait timer, since that hint's timer
 * already ran out once.
 *
 * Phase 2 note: this entire file is what gets replaced by React
 * components (e.g. <DossierCard/>, <ClueTag/>, <StampOverlay/>) when you
 * port to Vite/React. GameState, api.js, fuzzyMatch.js, nameMask.js, and
 * config.js would carry over with little to no change.
 * -----------------------------------------------------------------------
 */

import { EVENTS } from "./gameState.js";
import { generateCodename } from "./wordbank.js";
import { buildNameMask } from "./nameMask.js";

export class UI {
  /**
   * @param {import('./gameState.js').GameState} gameState
   * @param {Object} config
   */
  constructor(gameState, config) {
    this.gs = gameState;
    this.config = config;
    this.agentName = generateCodename();
    this._nextHintTimer = null;
    this.viewIndex = 0;
    this._unlockedHints = new Set(); // hint indices whose wait timer has completed or been force-unlocked

    this._cacheDom();
    this._wireEvents();
    this._wireGameStateListeners();
  }

  _cacheDom() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      agentName: byId("agentName"),
      scoreTag: byId("scoreTag"),
      personImg: byId("personImg"),
      noPhoto: byId("noPhoto"),
      photoScrim: byId("photoScrim"),
      redactTop: document.querySelector(".redact-strip.top"),
      redactBottom: document.querySelector(".redact-strip.bottom"),
      caseCounter: byId("caseCounter"),
      attemptsDots: byId("attemptsDots"),
      clueIndex: byId("clueIndex"),
      clueText: byId("clueText"),
      nameMask: byId("nameMask"),
      hintDots: byId("hintDots"),
      feedback: byId("feedback"),
      guessInput: byId("guessInput"),
      submitBtn: byId("submitBtn"),
      prevHintBtn: byId("prevHintBtn"),
      nextHintBtn: byId("nextHintBtn"),
      successOverlay: byId("successOverlay"),
      successName: byId("successName"),
      successPoints: byId("successPoints"),
      nextPersonBtn: byId("nextPersonBtn"),
      failOverlay: byId("failOverlay"),
      failName: byId("failName"),
      failCountdown: byId("failCountdown"),
      endOverlay: byId("endOverlay"),
      endScore: byId("endScore"),
      playAgainBtn: byId("playAgainBtn"),
      modalBackdrop: byId("modalBackdrop"),
      agentInput: byId("agentInput"),
      proceedBtn: byId("proceedBtn")
    };
  }

  _wireEvents() {
    this.el.submitBtn.addEventListener("click", () => this._submit());
    this.el.guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submit();
    });
    this.el.prevHintBtn.addEventListener("click", () => this._goToPreviousHint());
    this.el.nextHintBtn.addEventListener("click", () => this._goToNextHint());
    this.el.nextPersonBtn.addEventListener("click", () => this.gs.startNewRound());
    this.el.playAgainBtn.addEventListener("click", () => {
      this.gs.reset();
      this.gs.startNewRound();
    });

    this.el.agentInput.value = this.agentName;
    this.el.proceedBtn.addEventListener("click", () => {
      const name = this.el.agentInput.value.trim() || generateCodename();
      this.agentName = name;
      this.el.agentName.textContent = name;
      this.el.modalBackdrop.classList.add("hidden");
      this.gs.startNewRound();
    });
    this.el.agentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.el.proceedBtn.click();
    });
  }

  _wireGameStateListeners() {
    this.gs.on(EVENTS.ROUND_START, (payload) => this._onRoundStart(payload));
    this.gs.on(EVENTS.HINT_ADVANCE, () => this._onHintAdvance());
    this.gs.on(EVENTS.GUESS_WRONG, (payload) => this._onGuessWrong(payload));
    this.gs.on(EVENTS.ROUND_SOLVED, (payload) => this._onRoundSolved(payload));
    this.gs.on(EVENTS.ROUND_FAILED, (payload) => this._onRoundFailed(payload));
    this.gs.on(EVENTS.GAME_COMPLETE, (payload) => this._onGameComplete(payload));
    this.gs.on(EVENTS.SCORE_CHANGE, (payload) => this._onScoreChange(payload));
  }

  _submit() {
    if (this.el.guessInput.disabled) return;
    this.gs.submitGuess(this.el.guessInput.value);
  }

  /* ---------- Prev / Next hint navigation ---------- */

  _goToPreviousHint() {
    if (this.viewIndex <= 0) return;
    this.viewIndex -= 1;
    this._renderClueAt(this.viewIndex);
    this._updateInteractivity();
    this._updateNavButtons();
  }

  _goToNextHint() {
    if (this.viewIndex < this.gs.hintIndex) {
      // Browsing forward through already-seen hints — free, no timer.
      this.viewIndex += 1;
      this._renderClueAt(this.viewIndex);
      this._updateInteractivity();
      this._updateNavButtons();
    } else {
      // At the frontier — this is a real game action, gated by the wait timer.
      this.gs.advanceHint();
    }
  }

  /* ---------- Renderers ---------- */

  _onRoundStart({ person, caseNumber, totalCases }) {
    this._hideAllOverlays();
    this._loadImage(person.imageUrl);
    this._resetPhotoReveal();
    this.el.caseCounter.textContent = `Case ${caseNumber} of ${totalCases}`;
    this.viewIndex = this.gs.hintIndex;
    this._unlockedHints.clear();
    this._renderClueAt(this.viewIndex);
    this._renderAttempts();
    this._renderHintDots();
    this._clearFeedback();
    this._updateInteractivity();
    this._updateNavButtons();
  }

  _onHintAdvance() {
    this.viewIndex = this.gs.hintIndex;
    this._renderClueAt(this.viewIndex);
    this._renderHintDots();
    this._clearFeedback();
    this._updateInteractivity();
    this._updateNavButtons();
  }

  _onGuessWrong({ attemptsUsed, canRetrySameHint, guessesRemainingThisHint }) {
    this._renderAttempts();
    this._applyPhotoReveal(attemptsUsed);

    // A wrong guess force-unlocks "Next Clue" immediately, regardless of the wait timer.
    this._unlockedHints.add(this.gs.hintIndex);
    this._clearNextHintTimer();

    if (canRetrySameHint) {
      this.el.feedback.textContent = `Not a match — one more guess on this clue (${guessesRemainingThisHint} left).`;
      this.el.feedback.classList.add("wrong");
      this.el.guessInput.value = "";
      this.el.guessInput.focus();
    } else {
      this.el.feedback.textContent = "Not a match — logged as a miss.";
      this.el.feedback.classList.add("wrong");
      this.el.guessInput.disabled = true;
      this.el.submitBtn.disabled = true;
    }

    this._updateNavButtons();
  }

  _onRoundSolved({ person, points, bonus, speedBonusApplied, hintIndex }) {
    this._disableAllInputs();
    this._clearNextHintTimer();
    this._revealPhotoFully();
    this.el.successName.textContent = person.name;
    const bonusText = speedBonusApplied ? ` (includes +${bonus} speed bonus)` : "";
    this.el.successPoints.textContent = `+${points} points — solved on clue ${hintIndex + 1}${bonusText}`;
    this.el.successOverlay.classList.add("show");
  }

  _onRoundFailed({ person }) {
    this._disableAllInputs();
    this._clearNextHintTimer();
    this._revealPhotoFully();
    this.el.failName.textContent = `It was: ${person.name}`;
    this.el.failOverlay.classList.add("show");
    this._runCountdown();
  }

  _onGameComplete({ score }) {
    this._hideAllOverlays();
    this._disableAllInputs();
    this._clearNextHintTimer();
    this.el.endScore.textContent = `Final score: ${score}`;
    this.el.endOverlay.classList.add("show");
  }

  _onScoreChange({ score }) {
    this.el.scoreTag.textContent = `Score: ${score}`;
  }

  /* ---------- Small render helpers ---------- */

  /** Renders the clue text + name mask for an arbitrary hint index (browsing-aware). */
  _renderClueAt(index) {
    const p = this.gs.currentPerson;
    this.el.clueIndex.textContent = String(index + 1).padStart(2, "0");
    this.el.clueText.textContent = p.clues[index] || p.clues[p.clues.length - 1];

    const mask = buildNameMask(p.name, index, this.config.nameMaskStartHintIndex);
    if (mask) {
      this.el.nameMask.textContent = mask.split("").join(" ");
      this.el.nameMask.classList.remove("hidden");
    } else {
      this.el.nameMask.textContent = "";
      this.el.nameMask.classList.add("hidden");
    }
  }

  /** Enables/disables guessing based on whether the user is viewing the live frontier or reviewing a past hint. */
  _updateInteractivity() {
    const atFrontier = this.viewIndex === this.gs.hintIndex;
    if (!atFrontier) {
      this.el.guessInput.disabled = true;
      this.el.submitBtn.disabled = true;
      this.el.feedback.textContent = "Reviewing a past clue — go to the latest clue to guess.";
      this.el.feedback.classList.remove("wrong");
      return;
    }
    const guessAvailable = !this.gs.roundLocked
      && this.gs.guessesUsedOnHint < this.gs.maxGuessesThisHint;
    this.el.guessInput.disabled = !guessAvailable;
    this.el.submitBtn.disabled = !guessAvailable;
    if (guessAvailable) {
      this._clearFeedback();
      this.el.guessInput.value = "";
      this.el.guessInput.focus();
    }
  }

  /** Updates Previous/Next button state based on browsing position vs. the real frontier. */
  _updateNavButtons() {
    this.el.prevHintBtn.disabled = this.viewIndex <= 0;

    if (this.viewIndex < this.gs.hintIndex) {
      // Browsing a past hint — Next is always free (already passed its wait).
      this._clearNextHintTimer();
      this.el.nextHintBtn.disabled = false;
      this.el.nextHintBtn.textContent = "Next Clue →";
    } else {
      // At the frontier — gated by the pacing timer (unless already unlocked).
      this._startNextHintTimer(this.viewIndex);
    }
  }

  _renderAttempts() {
    this.el.attemptsDots.innerHTML = "";
    const { maxAttempts } = this.config;
    for (let i = 0; i < maxAttempts; i++) {
      const d = document.createElement("div");
      d.className = "dot" + (i < maxAttempts - this.gs.attemptsLeft ? " filled" : "");
      this.el.attemptsDots.appendChild(d);
    }
  }

  _renderHintDots() {
    this.el.hintDots.innerHTML = "";
    const { maxHints } = this.config;
    for (let i = 0; i < maxHints; i++) {
      const s = document.createElement("span");
      if (i < this.gs.hintIndex) s.className = "past";
      else if (i === this.gs.hintIndex) s.className = "current";
      this.el.hintDots.appendChild(s);
    }
  }

  _loadImage(url) {
    this.el.noPhoto.classList.add("hidden");
    this.el.personImg.classList.remove("hidden");
    this.el.personImg.onerror = () => {
      this.el.personImg.classList.add("hidden");
      this.el.noPhoto.classList.remove("hidden");
    };
    this.el.personImg.src = url;
  }

  /** Resets photo to its fully-obscured base state at the start of each round. */
  _resetPhotoReveal() {
    this.el.personImg.classList.remove("revealed");
    this.el.photoScrim.classList.remove("revealed");
    this.el.redactTop.style.opacity = "";
    this.el.redactBottom.style.opacity = "";
  }

  /**
   * Wrong guesses only drop the cosmetic redaction bars for engagement —
   * they never reduce the blur/scrim, so the photo can't give away the
   * answer mid-round. Real clarity only happens in _revealPhotoFully().
   */
  _applyPhotoReveal(attemptsUsed) {
    if (attemptsUsed >= 1) this.el.redactTop.style.opacity = "0";
    if (attemptsUsed >= 2) this.el.redactBottom.style.opacity = "0";
  }

  /** Called only when a round ends (solved or failed) — the one moment the photo is allowed to be clear. */
  _revealPhotoFully() {
    if (!this.config.photoRevealOnRoundEnd) return;
    this.el.personImg.classList.add("revealed");
    this.el.photoScrim.classList.add("revealed");
    this.el.redactTop.style.opacity = "0";
    this.el.redactBottom.style.opacity = "0";
  }

  _clearFeedback() {
    this.el.feedback.textContent = "";
    this.el.feedback.classList.remove("wrong");
  }

  _disableAllInputs() {
    this.el.guessInput.disabled = true;
    this.el.submitBtn.disabled = true;
    this.el.prevHintBtn.disabled = true;
    this.el.nextHintBtn.disabled = true;
  }

  _hideAllOverlays() {
    this.el.successOverlay.classList.remove("show");
    this.el.failOverlay.classList.remove("show");
    this.el.endOverlay.classList.remove("show");
  }

  /** Enforces the minimum-view pacing rule for the FRONTIER hint only. Past hints (browsing) skip this entirely. */
  _startNextHintTimer(hintIndex) {
    this._clearNextHintTimer();

    if (this._unlockedHints.has(hintIndex)) {
      this.el.nextHintBtn.disabled = false;
      this.el.nextHintBtn.textContent = "Next Clue →";
      return;
    }

    const seconds = this.config.minHintViewSeconds || 0;
    if (seconds <= 0) {
      this._unlockedHints.add(hintIndex);
      this.el.nextHintBtn.disabled = false;
      this.el.nextHintBtn.textContent = "Next Clue →";
      return;
    }

    let remaining = seconds;
    this.el.nextHintBtn.disabled = true;
    this.el.nextHintBtn.textContent = `Next Clue (${remaining}s)`;
    this._nextHintTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this._clearNextHintTimer();
        this._unlockedHints.add(hintIndex);
        this.el.nextHintBtn.disabled = false;
        this.el.nextHintBtn.textContent = "Next Clue →";
      } else {
        this.el.nextHintBtn.textContent = `Next Clue (${remaining}s)`;
      }
    }, 1000);
  }

  _clearNextHintTimer() {
    if (this._nextHintTimer) {
      clearInterval(this._nextHintTimer);
      this._nextHintTimer = null;
    }
  }

  _runCountdown() {
    let n = this.config.countdownSeconds;
    this.el.failCountdown.textContent = n;
    const timer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(timer);
        this.gs.startNewRound();
      } else {
        this.el.failCountdown.textContent = n;
      }
    }, this.config.countdownIntervalMs);
  }

  showErrorInClue(message) {
    this.el.clueText.textContent = message;
  }
}
