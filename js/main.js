/**
 * main.js
 * -----------------------------------------------------------------------
 * Entry point. Wires the data layer, game logic, and UI together.
 * Phase 2 note: this is roughly your React app's top-level component
 * bootstrap (e.g. App.jsx calling a data-fetch hook and rendering
 * child components) — the wiring pattern carries over even if the
 * implementation becomes JSX.
 * -----------------------------------------------------------------------
 */

import { CONFIG } from "./config.js";
import { PersonsAPI } from "./api.js";
import { GameState } from "./gameState.js";
import { isFuzzyMatch } from "./fuzzyMatch.js";
import { UI } from "./ui.js";
import { SessionPersistence } from "./sessionPersistence.js";

async function bootstrap() {
  let persons = [];
  try {
    persons = await PersonsAPI.getAll();
  } catch (err) {
    console.error(err);
    document.getElementById("clueText").textContent =
      "Could not load the case file (data/persons.json). If you opened this file directly in a browser, try running a local server instead, e.g. `python3 -m http.server` in this folder.";
    return;
  }

  const gameState = new GameState(persons, CONFIG, isFuzzyMatch);
  const savedSession = SessionPersistence.load();
  new UI(gameState, CONFIG, { savedSession });
  // Game officially starts once the user submits the landing modal (see ui.js).
}

bootstrap();
