/**
 * sessionPersistence.js
 * -----------------------------------------------------------------------
 * Saves/restores gameplay progress (score, used persons, current round,
 * stats) to sessionStorage so a page refresh or accidental tab close
 * doesn't wipe progress. Deliberately session-scoped, not permanent —
 * closing the tab and coming back later is a "new session" by design,
 * matching how the rest of the game already treats a fresh visit.
 *
 * This module knows nothing about GameState internals beyond the plain
 * snapshot shape from `gameState.toSnapshot()` / `gameState.restore()`,
 * and nothing about the DOM — it's a thin, swappable persistence layer.
 *
 * Phase 2 note: if you want cross-device resume, this is the file to
 * replace with a call to a NestJS endpoint backed by MongoDB, keyed by
 * a logged-in user or a persistent anonymous session id.
 * -----------------------------------------------------------------------
 */

const STORAGE_KEY = "guessThePerson:session:v1";

export const SessionPersistence = {
  /**
   * @param {Object} snapshot - shape from gameState.toSnapshot(), plus agentName
   */
  save(snapshot) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      // sessionStorage can throw in private-browsing modes or when full —
      // losing resume capability is an acceptable degradation, not fatal.
      console.warn("Could not save session progress:", err);
    }
  },

  load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("Could not load saved session progress:", err);
      return null;
    }
  },

  clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // no-op — nothing to clean up if storage is unavailable
    }
  }
};
