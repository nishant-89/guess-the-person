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

## Known gap

99 of 100 `imageUrl` values are still placeholders until you run
`scripts/fetch-images.mjs` (see above). The UI gracefully falls back to
a "No photo on file" state when an image fails to load.
