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
import { SessionPersistence } from "./sessionPersistence.js";
import { SoundManager } from "./soundManager.js";
import { PersonalBest } from "./personalBest.js";

const DIFFICULTY_STORAGE_KEY = "guessThePerson:difficulty";
const FIRST_WRONG_TIP_KEY = "guessThePerson:hasSeenWrongGuessTip";
const FIRST_WRONG_TIP_TEXT = "💡 Tip: spelling doesn't need to be exact, and just the last name works too.";

export class UI {
  /**
   * @param {import('./gameState.js').GameState} gameState
   * @param {Object} config
   * @param {Object} [options]
   * @param {Object|null} [options.savedSession] - snapshot from SessionPersistence.load(), or null
   */
  constructor(gameState, config, options = {}) {
    this.gs = gameState;
    this.config = config;
    this.savedSession = options.savedSession || null;
    this.agentName = this.savedSession?.agentName || generateCodename();
    this._nextHintTimer = null;
    this._streakToastTimer = null;
    this.viewIndex = 0;
    this._unlockedHints = new Set(); // hint indices whose wait timer has completed or been force-unlocked
    this._pendingResumeHintUnlock = false;
    this._roundMinHintViewSeconds = this.config.minHintViewSeconds; // snapshotted per round, see _onRoundStart

    this.sound = new SoundManager();
    this._pendingDifficulty = this._loadDifficultyPref();
    this._applyDifficultyPreset(this._pendingDifficulty); // safe pre-round-1: nothing is in progress yet

    this._cacheDom();
    this._wireEvents();
    this._wireGameStateListeners();
    this.el.bestTag.textContent = `Best: ${PersonalBest.get()}`;
  }

  _loadDifficultyPref() {
    try {
      return localStorage.getItem(DIFFICULTY_STORAGE_KEY) || "normal";
    } catch (err) {
      return "normal";
    }
  }

  _saveDifficultyPref(value) {
    try {
      localStorage.setItem(DIFFICULTY_STORAGE_KEY, value);
    } catch (err) {
      // no-op — losing the persisted preference isn't fatal
    }
  }

  _hasSeenFirstWrongTip() {
    try {
      return localStorage.getItem(FIRST_WRONG_TIP_KEY) === "true";
    } catch (err) {
      return true; // if storage is unavailable, don't risk showing it repeatedly
    }
  }

  _markFirstWrongTipSeen() {
    try {
      localStorage.setItem(FIRST_WRONG_TIP_KEY, "true");
    } catch (err) {
      // no-op
    }
  }

  /** Applies a difficulty preset to the shared config object. Safe to call repeatedly (idempotent). */
  _applyDifficultyPreset(key) {
    const preset = this.config.difficultyPresets?.[key];
    if (!preset) return;
    Object.assign(this.config, preset);
  }

  /**
   * Starts the next round, applying any pending difficulty change first.
   * Use this instead of calling gs.startNewRound() directly from UI actions,
   * so a settings change made mid-round only takes effect from here on —
   * never retroactively on the round already in progress.
   */
  _beginNextRound() {
    this._applyDifficultyPreset(this._pendingDifficulty);
    this.gs.startNewRound();
  }

  _cacheDom() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      agentName: byId("agentName"),
      scoreTag: byId("scoreTag"),
      bestTag: byId("bestTag"),
      dossier: byId("dossier"),
      soundToggleBtn: byId("soundToggleBtn"),
      settingsBtn: byId("settingsBtn"),
      settingsBackdrop: byId("settingsBackdrop"),
      settingsSoundBtn: byId("settingsSoundBtn"),
      difficultySelect: byId("difficultySelect"),
      closeSettingsBtn: byId("closeSettingsBtn"),
      streakToast: byId("streakToast"),
      giveUpBtn: byId("giveUpBtn"),
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
      firstWrongTip: byId("firstWrongTip"),
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
      endStats: byId("endStats"),
      playAgainBtn: byId("playAgainBtn"),
      modalBackdrop: byId("modalBackdrop"),
      modalTitle: byId("modalTitle"),
      modalSub: byId("modalSub"),
      agentInput: byId("agentInput"),
      proceedBtn: byId("proceedBtn"),
      newSessionBtn: byId("newSessionBtn")
    };
  }

  _wireEvents() {
    this.el.submitBtn.addEventListener("click", () => this._submit());
    this.el.guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submit();
    });
    this.el.prevHintBtn.addEventListener("click", () => this._goToPreviousHint());
    this.el.nextHintBtn.addEventListener("click", () => this._goToNextHint());
    this.el.nextPersonBtn.addEventListener("click", () => this._beginNextRound());
    this.el.playAgainBtn.addEventListener("click", () => {
      this.gs.reset();
      this._beginNextRound();
    });

    this.el.giveUpBtn.addEventListener("click", () => this.gs.giveUp());

    // --- Sound toggle (top bar quick-access) ---
    this._syncSoundButtons();
    this.el.soundToggleBtn.addEventListener("click", () => this._toggleSound());
    this.el.settingsSoundBtn.addEventListener("click", () => this._toggleSound());

    // --- Settings panel ---
    this.el.settingsBtn.addEventListener("click", () => {
      this.el.difficultySelect.value = this._pendingDifficulty;
      this._syncSoundButtons();
      this.el.settingsBackdrop.classList.remove("hidden");
    });
    this.el.closeSettingsBtn.addEventListener("click", () => {
      this.el.settingsBackdrop.classList.add("hidden");
    });
    this.el.difficultySelect.addEventListener("change", (e) => {
      this._pendingDifficulty = e.target.value;
      this._saveDifficultyPref(this._pendingDifficulty);
      // Not applied yet — see _beginNextRound(). Deliberately does not touch
      // the round currently in progress, matching the note shown in the panel.
    });

    this.el.agentInput.value = this.agentName;

    if (this.savedSession) {
      this.el.modalSub.textContent = "Welcome back, agent. You have a case in progress — pick up where you left off, or start fresh.";
      this.el.proceedBtn.textContent = "Resume Investigation →";
      this.el.newSessionBtn.classList.remove("hidden");
    }

    this.el.proceedBtn.addEventListener("click", () => {
      const name = this.el.agentInput.value.trim() || generateCodename();
      this.agentName = name;
      this.el.agentName.textContent = name;
      this.el.modalBackdrop.classList.add("hidden");
      if (this.savedSession) {
        // Only meaningful for a true mid-round resume — if the saved round
        // had already ended (roundLocked), restore() starts a fresh round
        // internally and this flag correctly should not apply there.
        this._pendingResumeHintUnlock = !this.savedSession.roundLocked && !!this.savedSession.hintUnlocked;
        this.gs.restore(this.savedSession);
      } else {
        this._beginNextRound();
      }
    });
    this.el.agentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.el.proceedBtn.click();
    });

    this.el.newSessionBtn.addEventListener("click", () => {
      SessionPersistence.clear();
      this.savedSession = null;
      const name = this.el.agentInput.value.trim() || generateCodename();
      this.agentName = name;
      this.el.agentName.textContent = name;
      this.el.modalBackdrop.classList.add("hidden");
      this._beginNextRound();
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
    this.gs.on(EVENTS.STREAK_CHANGE, (payload) => this._onStreakChange(payload));
  }

  _submit() {
    if (this.el.guessInput.disabled) return;
    this.gs.submitGuess(this.el.guessInput.value);
  }

  /** Saves current progress so a refresh/tab-close can resume later. */
  _persistSession() {
    SessionPersistence.save({
      ...this.gs.toSnapshot(),
      agentName: this.agentName,
      hintUnlocked: this._unlockedHints.has(this.gs.hintIndex)
    });
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
    if (this._pendingResumeHintUnlock) {
      this._unlockedHints.add(this.gs.hintIndex);
      this._pendingResumeHintUnlock = false;
    }
    this._roundMinHintViewSeconds = this.config.minHintViewSeconds;
    this.el.giveUpBtn.disabled = false;
    this._renderClueAt(this.viewIndex);
    this._renderAttempts();
    this._renderHintDots();
    this._clearFeedback();
    this._updateInteractivity();
    this._updateNavButtons();
    this._persistSession();
    this.sound.playHintAppear();
  }

  _onHintAdvance() {
    this.viewIndex = this.gs.hintIndex;
    this._renderClueAt(this.viewIndex);
    this._renderHintDots();
    this._clearFeedback();
    this._updateInteractivity();
    this._updateNavButtons();
    this._persistSession();
    this.sound.playHintAppear();
  }

  _onGuessWrong({ attemptsUsed, canRetrySameHint, guessesRemainingThisHint }) {
    this._renderAttempts();
    this._applyPhotoReveal(attemptsUsed);
    this.sound.playWrong();
    this._triggerShake();

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

    if (!this._hasSeenFirstWrongTip()) {
      this.el.firstWrongTip.textContent = FIRST_WRONG_TIP_TEXT;
      this.el.firstWrongTip.classList.remove("hidden");
      this._markFirstWrongTipSeen();
    }

    this._updateNavButtons();
    this._persistSession();
  }

  _onRoundSolved({ person, points, bonus, speedBonusApplied, hintIndex }) {
    this._disableAllInputs();
    this._clearNextHintTimer();
    this._revealPhotoFully();
    this.sound.playSolved();
    this.el.successName.textContent = person.name;
    const bonusText = speedBonusApplied ? ` (includes +${bonus} speed bonus)` : "";
    this.el.successPoints.textContent = `+${points} points — solved on clue ${hintIndex + 1}${bonusText}`;
    this.el.successOverlay.classList.add("show");
    this._persistSession();
  }

  _onRoundFailed({ person }) {
    this._disableAllInputs();
    this._clearNextHintTimer();
    this._revealPhotoFully();
    this.sound.playFailed();
    this.el.failName.textContent = `It was: ${person.name}`;
    this.el.failOverlay.classList.add("show");
    this._runCountdown();
    this._persistSession();
  }

  _onGameComplete({ score, stats }) {
    this._hideAllOverlays();
    this._disableAllInputs();
    this._clearNextHintTimer();
    SessionPersistence.clear();

    this.el.endScore.textContent = `Final score: ${score}`;
    this._renderEndStats(stats);

    const isNewBest = PersonalBest.update(score);
    this.el.bestTag.textContent = `Best: ${PersonalBest.get()}`;
    this._renderBestBanner(isNewBest, PersonalBest.get());

    this.el.endOverlay.classList.add("show");
  }

  _renderEndStats(stats) {
    const totalRounds = (stats?.solvedCount || 0) + (stats?.failedCount || 0);
    const bestSolveLabel = stats?.bestHintIndex != null ? `Clue ${stats.bestHintIndex + 1}` : "—";

    this.el.endStats.innerHTML = `
      <div class="stat-tile">
        <span class="stat-value">${stats?.solvedCount || 0}/${totalRounds}</span>
        <span class="stat-label">Solved</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value">${bestSolveLabel}</span>
        <span class="stat-label">Fastest Solve</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value">${stats?.bestStreak || 0}</span>
        <span class="stat-label">Best Streak</span>
      </div>
    `;
  }

  _renderBestBanner(isNewBest, bestScore) {
    let banner = this.el.endOverlay.querySelector(".best-banner");
    if (isNewBest) {
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "best-banner";
        this.el.endStats.insertAdjacentElement("afterend", banner);
      }
      banner.textContent = `🏆 New personal best: ${bestScore}!`;
    } else if (banner) {
      banner.remove();
    }
  }

  _onScoreChange({ score }) {
    this.el.scoreTag.textContent = `Score: ${score}`;
  }

  /* ---------- Small render helpers ---------- */

  /** Renders the clue text + name mask for an arbitrary hint index (browsing-aware). */
  _renderClueAt(index) {
    const p = this.gs.currentPerson;
    this.el.clueIndex.textContent = String(index + 1).padStart(2, "0");
    this.el.clueText.textContent = this.gs.getClueText(index);

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
    this.el.firstWrongTip.classList.add("hidden");
  }

  _disableAllInputs() {
    this.el.guessInput.disabled = true;
    this.el.submitBtn.disabled = true;
    this.el.prevHintBtn.disabled = true;
    this.el.nextHintBtn.disabled = true;
    this.el.giveUpBtn.disabled = true;
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

    const seconds = this._roundMinHintViewSeconds || 0;
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
        this._beginNextRound();
      } else {
        this.el.failCountdown.textContent = n;
      }
    }, this.config.countdownIntervalMs);
  }

  showErrorInClue(message) {
    this.el.clueText.textContent = message;
  }

  /* ---------- Sound ---------- */

  _toggleSound() {
    const muted = this.sound.toggleMute();
    this._syncSoundButtons(muted);
  }

  _syncSoundButtons(mutedOverride) {
    const muted = mutedOverride ?? this.sound.isMuted();
    this.el.soundToggleBtn.textContent = muted ? "🔇" : "🔊";
    this.el.soundToggleBtn.classList.toggle("muted", muted);
    this.el.settingsSoundBtn.textContent = muted ? "Sound: Off" : "Sound: On";
  }

  /* ---------- Wrong-guess shake ---------- */

  _triggerShake() {
    this.el.dossier.classList.remove("shake");
    // Force reflow so the animation can re-trigger on consecutive wrong guesses.
    void this.el.dossier.offsetWidth;
    this.el.dossier.classList.add("shake");
  }

  /* ---------- Streak toast ---------- */

  _onStreakChange({ streak, isNewBest }) {
    if (streak < 2) return; // not worth celebrating a streak of 0 or 1
    this.el.streakToast.textContent = isNewBest
      ? `New best streak: ${streak}!`
      : `${streak} in a row!`;
    this.el.streakToast.classList.add("show");
    clearTimeout(this._streakToastTimer);
    this._streakToastTimer = setTimeout(() => {
      this.el.streakToast.classList.remove("show");
    }, 2200);
  }
}
