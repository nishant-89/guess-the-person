/**
 * api.js
 * -----------------------------------------------------------------------
 * Data access layer. This is the ONLY module in the app that knows how
 * persons data is actually fetched — everything else just calls
 * PersonsAPI.getAll() and works with plain JS objects.
 *
 * Phase 1 (now):   reads a static data/persons.json file, standing in
 *                   for a real backend.
 * Phase 2 (later):  swap the body of getAll() to:
 *                     const res = await fetch('/api/persons');
 *                   pointed at your NestJS controller (which reads from
 *                   MongoDB). No other file in this app needs to change,
 *                   since gameState.js and ui.js only depend on this
 *                   function's return shape, never on where data comes
 *                   from.
 *
 * Expected document shape (maps 1:1 to a Mongoose schema):
 *   {
 *     _id: string,
 *     name: string,
 *     aliases: string[],   // accepted guess variants for fuzzy matching
 *     clues: string[],     // 3-5 progressively revealing hints
 *     imageUrl: string
 *   }
 * -----------------------------------------------------------------------
 */

const DATA_URL = "data/persons.json";

export const PersonsAPI = {
  /**
   * Fetch all persons available for the game.
   * @returns {Promise<Array<Object>>}
   */
  async getAll() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load persons data (${res.status})`);
    }
    return res.json();
  }
};
