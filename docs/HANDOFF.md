# Handoff / technical notes

State of the LieftingFit trainer dashboard + Chrome Helper, and what's left.

## ▶ CONTINUE HERE (local session) — read this first

Koen is switching to a **local Claude Code session** (see `LOCAL-SETUP.md`) so a
browser tool (Playwright MCP) can drive Chrome and inspect the real Sportbit /
Dexos pages. Pick up exactly here:

**Live status:** the extension installs and runs. Koen tested **Training
aanpassen** on the real site and it failed at **Step 3 = the "WORKOUT
PROGRAMMERING" tab click** ("Stap 3 mislukt"). Working theory: that tab's label
is uppercased by CSS, so the real DOM text is `Workout Programmering` and the old
exact match missed it.

**Already applied (verify, don't assume):** `background.js` now matches text
**case-insensitively + whitespace-normalized** via a `norm()` helper (used by
`text/`, `has/`, `aria/`, `selopt/`, and `<select>` option matching). This was
NOT verified against the real site (the cloud mock got corrupted during testing).
**First job: confirm the Dexos macro end-to-end on the real page** and fix
whatever step still fails (the toast/`runMacro` reports the exact failed step).

**Fast iteration loop (local):**
1. Open `https://lieftingfit.sportbitapp.nl/dexos/` via the browser tool; Koen
   logs in once.
2. Planning → Workout Programmering. Inspect the REAL DOM for:
   - the **WORKOUT PROGRAMMERING** tab element + its true text/case,
   - the **view** and **type** controls — confirm they're real `<select>`s (if
     custom dropdowns, swap the two `change` steps for click-open + click-option),
   - a **day block** (how the date/type are encoded — should contain `ddmmyyyy`),
   - the **Bekijk / Wijzig** button label (exact text).
3. Adjust the `dexos` macro in `app.js` → `DEFAULT_CONFIG.shortcuts` and reload
   the unpacked extension (or just drive the flow directly to validate selectors).

**Then build the two remaining macros** (Koen's original descriptions):
- **Coachboard** (`contextMode: today`, casts to TV): Sportbit roster → click
  **today's class block of `{{TYPE}}`** → the **Presentatie-modus** button →
  opens the Coachboard (`/cbm/coachboard/<id>/`; example id 110634). Roster/login
  at `/web/nl/login`. Find the logged-in roster URL + the type filter + how a
  block maps to its Presentatie-modus button.
- **Rooster** (`contextMode: week`): Sportbit roster, **week** view of `{{TYPE}}`.
  Original note: month view has a lesson-type selector **left of the Exporteer
  button**; here we want the week view for the selected type.
- **Kassa**: already done — plain URL `/cbm/kassa/`, no clicks.

Add both macros to `DEFAULT_CONFIG`, then `node build-standalone.mjs` and push.

Selector tokens available in the engine: `text/`, `has/` (`a&&b` = all present),
`selopt/` (a `<select>` by an option's text), `aria/`, `xpath/`, `pierce/`, CSS.
Context placeholders: `{{TYPE}}`, `{{TODAY_ISO}}`, `{{TODAY_DMY}}` (ddmmyyyy),
`{{TODAY_D}}`, `{{TIME}}`, `{{WEEKDAY}}`.

Note: the cloud `scratchpad/` (uploaded Dexos HTML/video + test mocks) is NOT in
the repo. Re-derive mocks locally, or better, validate against the live site.

## What works

- **Dashboard** (`index.html` / `app.css` / `app.js`): branded, dark, fullscreen,
  keyboard shortcuts, settings, export/import config. Runs as a plain page, a
  standalone single file, or the Chrome extension.
- **Active class-type dropdown** (all 41 LieftingFit types) is the global context.
  Tiles show `Vandaag · <type>` / `Deze week · <type>` chips. Selection persists.
- **Chrome extension** (`manifest.json` + `background.js`): MV3. Toolbar icon
  opens the dashboard. A tile with a `macro` runs a click-replay in a new tab,
  reusing the trainer's Sportbit login.
- **Replay engine** (`background.js` → `replayInPage`): resolves selectors
  `text/`, `has/` (substring; supports `a&&b` = all present), `selopt/` (the
  `<select>` containing an option with this text), `aria/`, `xpath/`, `pierce/`,
  and CSS. Innermost-match so we click the link, not a wrapper. Single click
  (no double-fire). `change` on a `<select>` picks the option by **visible text**
  (option values are numeric ids). Waits (≤15s) for async/AJAX elements per step.
  Reports the exact failed step. Placeholder substitution from live context:
  `{{TYPE}}`, `{{TODAY_ISO}}`, `{{TODAY_DMY}}` (ddmmyyyy), `{{TODAY_D}}`,
  `{{TIME}}`, `{{WEEKDAY}}`.
- **`Training aanpassen` (dexos) macro** — built-in default in `app.js`
  `DEFAULT_CONFIG`. Verified end-to-end against a high-fidelity mock
  (`scratchpad/dexos-mock.html`, `test-dexos.mjs`) for CrossFit and Hyrox,
  including the async grid reload on type change.

## Dexos = jQuery admin ("Onderhoud systeem"), everything is Type B

Navigation is `dexos.openModule(...)`; no URL changes; pop-ups via
`dexos.popup.js`. Reverse-engineered from a screen recording:

**Training aanpassen flow** (start `https://lieftingfit.sportbitapp.nl/dexos/`):
1. Left menu **Planning** → `dexos.openModule(13,13,calender.init,…)`
2. Tab **WORKOUT PROGRAMMERING**
3. Toolbar: **Maandoverzicht** `<select>` + **class-type** `<select>` (shows
   "CrossFit", left of the **Exporteer** button)
4. Month grid `Lesprogramma <MONTH YEAR>`. Each day cell = a red block whose text
   embeds the date as **ddmmyyyy** and lines like `CrossFit Warm Up 05072026`.
5. Click the day block → right **Informatie** panel shows the date + workouts +
   **Acties: Bekijk / Wijzig** (and Maak kopie).
6. **Bekijk / Wijzig** → the editor pop-up ("Programma").

Current macro steps (in `app.js`): click `text/Planning` → click
`text/WORKOUT PROGRAMMERING` → set `selopt/Maandoverzicht`=Maandoverzicht → set
`selopt/CrossFit`=`{{TYPE}}` → click `has/{{TODAY_DMY}}&&{{TYPE}}` → click
`text/Bekijk / Wijzig`.

### Risks to verify on the real site
- Are the view/type controls real `<select>`s? (assumed yes — the option list
  screenshot looked native). If they're custom dropdowns, replace the `change`
  steps with click-open + click-option (add a `click text/{{TYPE}}` step).
- Exact button label — assumed `Bekijk / Wijzig` (spaces around `/`). Fallback
  `has/Bekijk` included.
- If today has no class of the selected type, step 6 fails cleanly ("kon knop
  niet vinden") — that's correct behaviour, but confirm the message is clear.

## TODO (needs Sportbit-roster capture or a local browser session)

1. **Coachboard = today's class of `{{TYPE}}` on the TV.** Different app (Sportbit
   `/web` or `/cbm`, not Dexos). Flow described by Koen: roster → class block →
   **Presentatie-modus** → Coachboard (`/cbm/coachboard/<id>/`). Need a recording
   or DOM of the Sportbit roster to build the macro (filter type, pick today,
   click Presentatie-modus). Mirror the Dexos approach.
2. **Rooster = week view of `{{TYPE}}`.** Sportbit roster, week view, type filter.
   Same capture need.
3. After building, add both macros to `DEFAULT_CONFIG` and rebuild the standalone
   (`node build-standalone.mjs`).

## Test harness

- `scratchpad/dexos-mock.html` — faithful mock (2 selects, type-filtered grid
  that AJAX-reloads, date-embedded blocks, Bekijk/Wijzig panel).
- `scratchpad/test-dexos.mjs` — runs the shipping macro for CrossFit + Hyrox and
  asserts the right (type, day) editor opened.
- `scratchpad/engine-test*.mjs` — unit tests for the engine (async elements,
  failure reporting, click-target correctness).

Run: `node <file>.mjs` (Playwright + `/opt/pw-browsers/chromium`).

## Note
`scratchpad/` holds Koen's uploaded internal Dexos HTML/video and derived frames
— kept local, **not committed** (internal gym data).
