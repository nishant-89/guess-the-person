# Guess The Person — Phase 1

A single-page "guess the celebrity from witty clues" game, built as a
detective case-file. This phase is plain HTML/CSS/JS (ES modules), but
structured so it ports cleanly into a NestJS + React (Vite) + MongoDB
stack later.

## Run locally

Browsers block `fetch()` on `file://` pages, so serve the folder instead
of double-clicking `index.html`:

```bash
cd guess-the-person
python3 -m http.server
```

Then open `http://localhost:8000`. If you're not seeing recent changes,
hard-refresh (Cmd+Shift+R / Ctrl+Shift+R) to bypass browser cache.

## Project structure

```
guess-the-person/
├── index.html          # structure only, no inline style/script
├── css/
│   └── styles.css       # all styling
├── js/
│   ├── config.js         # tunable settings (hints, attempts, scoring, fuzzy threshold, pacing, bonuses)
│   ├── api.js             # data access layer — swap this for real REST calls later
│   ├── fuzzyMatch.js       # pure string-matching utils (Levenshtein-based)
│   ├── nameMask.js          # pure single-letter name masking utility
│   ├── wordbank.js           # codename generator for the landing screen
│   ├── gameState.js           # game rules/state, framework-agnostic, pub/sub events
│   ├── ui.js                   # the ONLY file that touches the DOM
│   └── main.js                  # bootstraps api → gameState → ui
├── scripts/
│   └── fetch-images.mjs   # one-time Node script to populate real image URLs
└── data/
    └── persons.json      # 100 persons: _id, name, aliases, clues, imageUrl
```

## Phase 2 migration map

| Phase 1 (now)                  | Phase 2 (NestJS + React/Vite + MongoDB)                          |
|---------------------------------|--------------------------------------------------------------------|
| `data/persons.json`             | MongoDB `persons` collection — schema already matches (`_id`, `name`, `aliases`, `clues`, `imageUrl`) |
| `api.js` → `fetch('data/persons.json')` | `fetch('/api/persons')` hitting a NestJS controller. Only this one function changes. |
| `config.js`                     | Could stay static, or become a `/api/config` response from a settings service/collection. |
| `fuzzyMatch.js`                 | Copy-paste unchanged into a NestJS service if you want server-side answer validation (recommended, so answers and speed-bonus timing can't be read/spoofed from client code). |
| `gameState.js`                  | Logic maps onto a React custom hook (`useGameState`, likely `useReducer` under the hood) or a server-authoritative `GameSessionService`. Event names in `EVENTS` are a stable contract worth preserving. |
| `ui.js`                         | Fully replaced by React components (e.g. `<DossierCard/>`, `<ClueTag/>`, `<StampOverlay/>`, `<LandingModal/>`). Everything it depends on carries over untouched. |
| `wordbank.js`                   | Can stay client-side, or move to a `GET /api/codename` endpoint if you want guaranteed-unique codenames across concurrent users. |

## Configurable gameplay (js/config.js)

- `maxHints` (default 5)
- `maxAttempts` (default 3)
- `pointsByHint` (default `[100, 80, 60, 40, 20]`)
- `fuzzyMinSimilarity` (default `0.72`)
- `countdownSeconds` / `countdownIntervalMs` (fail-screen auto-advance timing)
- `photoBlurPx` (default `32`) — blur strength applied throughout play
- `photoScrimOpacity` (default `0.42`) — dark overlay, a second independent layer of obfuscation on top of blur
- `photoRevealOnRoundEnd` (default `true`) — reveal full clarity only when a round ends
- `nameMaskStartHintIndex` (default `3`, i.e. clue 4) — exactly ONE letter is revealed from this hint onward; it does not progress further on the final clue
- `minHintViewSeconds` (default `5`) — a wrong guess force-unlocks "Next Clue" immediately regardless of this timer
- `speedBonusWindowSeconds` / `speedBonusPoints` (default `5` / `20`)
- `extraGuessesOnLastHint` (default `1`, i.e. 2 total guesses on the last clue)

## Sourcing real images (data/persons.json)

`imageUrl` values start as `PLACEHOLDER_WIKIMEDIA_URL` for everyone except
Amitabh Bachchan (set directly from a confirmed example). To fill in the
rest with real, verified Wikipedia portrait images:

```bash
node scripts/fetch-images.mjs
```

Requires Node 18+ (uses built-in `fetch`). This queries Wikipedia's public
REST API per person (`/api/rest_v1/page/summary/<title>`) and writes the
returned thumbnail URL into `data/persons.json`. It's safe to re-run —
by default it only fills in entries still showing the placeholder. Pass
`--force` to re-fetch and overwrite everyone. Any failures (e.g. an
ambiguous or missing Wikipedia title) are printed at the end so you can
fix that one entry by hand.

## Changelog — obfuscation + navigation fixes (latest)

- **Real blur, verified**: the previous version relied on opacity/grayscale
  only, which visibly failed to hide identity (confirmed via screenshots —
  faces were clearly recognizable on clue 1). Now uses `blur(32px)` +
  a `rgba(10,9,7,0.42)` dark scrim as two independent obfuscation layers.
  Verified with a headless-browser test asserting the computed CSS filter
  actually includes `blur(32px)` and the scrim renders at full opacity —
  screenshot comparison showed a fully sharp photo before, and a fully
  unrecognizable one after.
- **5s pacing (was 10s)**: `minHintViewSeconds` lowered to 5.
- **Wrong guess force-unlocks Next Clue**: a miss immediately enables
  "Next Clue" regardless of remaining wait time.
- **Name mask now clue 4+, single letter only**: starts at
  `nameMaskStartHintIndex: 3` (clue 4), reveals exactly one letter, and
  does NOT reveal more on the final clue (previously progressed and
  started at clue 3).
- **Previous Clue button**: browse back through hints you've already
  seen (view-only — guessing is only allowed at the live frontier hint).
  Hints you've already passed the wait timer on stay unlocked even after
  navigating away and back to them.

## Changelog — earlier gameplay improvisations

- **Photo obfuscation**: photo is for engagement only, never a valid way
  to guess (see above for the current, verified implementation).
- **Speed bonus**: a correct guess within `speedBonusWindowSeconds` of
  the hint appearing earns `speedBonusPoints` extra.
- **Last-clue extra guess**: the final hint allows
  `extraGuessesOnLastHint` additional submissions before the round ends.

All of the above are tunable in `js/config.js`.

## Changelog — landing screen rules

Added a collapsible "How to play" disclosure inside the landing modal,
right below the codename field. Collapsed by default — new players can
expand it, repeat players can ignore it entirely with zero extra clicks
or state to manage. Built with native `<details>/<summary>` (no JS): free
accessibility, and a clean 1:1 mapping to a React `<details>` or a simple
`useState` toggle later.

## Changelog — #1 Session persistence

A refresh or accidental tab close no longer wipes progress. On every
round-start, hint-advance, wrong guess, and round-end, the current score,
used-person list, in-progress hint/attempt state, and stats are saved to
`sessionStorage` (session-scoped by design — closing the tab and coming
back later is treated as a fresh visit, consistent with how the rest of
the game works).

- On page load, if a resumable session is found, the landing modal
  changes: codename is pre-filled, the button reads **"Resume
  Investigation →"**, and a secondary **"Start a New Investigation
  Instead"** button appears to discard it and start clean.
- Refreshing mid-overlay (right after solving/failing, before clicking
  "Next Person") won't replay the just-finished round — it correctly
  resumes into a fresh one, carrying the score/stats forward.
- Session is cleared automatically once all 100 persons are completed.

New file: `js/sessionPersistence.js` (thin sessionStorage wrapper).
`gameState.js` gained `toSnapshot()` / `restore()`.

Two more modules are already in the repo but **not yet wired up** —
`js/personalBest.js` and `js/soundManager.js` — reserved for the stats
(#5) and feedback-polish (#3) passes we'll do next.

## Changelog — #2 Player agency (Give Up + Settings)

- **Give Up button**: ends the current round immediately (same fail-reveal
  flow as running out of attempts/hints), for when you know you don't
  know it and don't want to burn through every hint.
- **Settings panel** (gear icon, top right): sound on/off, and a
  difficulty selector (Easy/Normal/Hard, presets in
  `config.difficultyPresets`). Difficulty changes are deliberately
  **deferred until the next case** — changing it mid-round does not
  retroactively alter attempts or fuzzy-match strictness for the round
  already in progress. This is enforced at the `gameState` level
  (`roundFuzzyMinSimilarity` is snapshotted per round), not just in the
  UI copy, and is covered by an automated test.
- Difficulty and sound-mute preferences persist in `localStorage`
  (`guessThePerson:difficulty`, via `SoundManager`'s own storage) across
  sessions.

## Changelog — #3 Feedback polish

- **Shake animation** on the dossier card on every wrong guess.
- **Sound cues** via `js/soundManager.js` (Web Audio, no external audio
  files) for: a hint appearing, a wrong guess, a solve, and a fail.
  Muteable from the top bar or the settings panel; state stays in sync
  between both.
- **Streak toast**: a small callout ("3 in a row!" / "New best streak!")
  appears when you solve 2+ consecutive rounds without a failure, and
  resets silently on any failed round.

## Changelog — #4 Onboarding

- **Easy first case**: this was already in place from earlier work —
  the very first round of any fresh session picks from
  `config.easyFirstCaseIds` (Sachin Tendulkar, Ronaldo, Michael Jackson,
  Muhammad Ali, Amitabh Bachchan) instead of a fully random person, so a
  new player's opening round is winnable rather than a coin-flip on an
  obscure name. Verified: first clue rendered was Einstein's "My tongue
  is more famous than most of my equations."
- **One-time wrong-guess tip** (new): on a player's very first wrong
  guess ever — across all sessions, tracked via `localStorage` — a small
  dashed-gold note appears: *"spelling doesn't need to be exact, and
  just the last name works too."* It never shows again after that,
  even across page reloads or brand-new sessions on the same browser.

Known minor gap surfaced while testing this: resuming a saved session
(#1) restarts the "Next Clue" pacing timer from scratch, even if it had
already been force-unlocked by a wrong guess before the refresh. Cosmetic
only — worst case is a few extra seconds of wait, not a stuck state. Not
fixed yet; flag if you'd like it tightened up.

## Changelog — resume-timer edge case (fixed)

Resuming a saved session now correctly remembers whether the current
hint's "Next Clue" wait had already been force-unlocked by a wrong guess
before the refresh — it no longer restarts that wait from scratch. If the
hint genuinely hadn't been unlocked yet before the refresh, the timer
still correctly applies (verified both directions with automated tests).
Implementation: the unlock state is now included in the persisted session
snapshot and consumed exactly once on resume, without affecting a
genuinely fresh round (e.g. when the saved round had already ended).

## Changelog — #5 Stats & personal best

- **End-of-session summary**: the "FILE COMPLETE" screen now shows
  Solved (X/Y), Fastest Solve (which clue number, or "—" if never
  solved), and Best Streak for that session.
- **Personal best**: tracked in `localStorage` (`js/personalBest.js`,
  survives across visits — deliberately not sessionStorage). Shown in
  the top bar from the moment the page loads (`Best: 0` for a first-time
  player), updates the moment a session's final score beats it, and a
  "🏆 New personal best!" banner appears on the end screen specifically
  when that happens (and correctly does not appear otherwise — verified
  both cases).

## Changelog — difficulty scope fix

Difficulty now ONLY affects guess-matching leniency (`fuzzyMinSimilarity`:
0.60 easy / 0.72 normal / 0.82 hard). `maxAttempts` (always 3) and
`minHintViewSeconds` (always 5) are fixed constants regardless of
difficulty — they're no longer part of `difficultyPresets` at all.

This also explains and fixes a reported bug: if the settings panel's
difficulty had ever been set to "Hard" during testing, its old preset
(`minHintViewSeconds: 8`) would persist in `localStorage` and silently
apply on every future visit, making "Next Clue" wait 8s instead of 5s
even for players who never touched settings themselves. Verified fixed
in both a fresh browser and one with a stale `difficulty: hard` value
already saved — both now correctly show 5s and 3 attempts.

## Known gap

99 of 100 `imageUrl` values are still placeholders until you run
`scripts/fetch-images.mjs` (see above). The UI gracefully falls back to
a "No photo on file" state when an image fails to load.
