/**
 * personalBest.js
 * -----------------------------------------------------------------------
 * Tracks the player's all-time best score for this browser. Deliberately
 * localStorage (durable, survives closing the tab) rather than
 * sessionStorage (used for in-progress game state) — a personal best is
 * meant to persist across visits, not just within one sitting.
 * -----------------------------------------------------------------------
 */

const STORAGE_KEY = "guessThePerson:personalBestScore";

export const PersonalBest = {
  get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch (err) {
      return 0;
    }
  },

  /**
   * @param {number} score
   * @returns {boolean} true if this score is a new personal best
   */
  update(score) {
    const current = this.get();
    if (score <= current) return false;
    try {
      localStorage.setItem(STORAGE_KEY, String(score));
    } catch (err) {
      // no-op — losing the persisted best isn't fatal
    }
    return true;
  }
};
