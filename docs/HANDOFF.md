# Handoff / technical notes

State of the LieftingFit trainer dashboard + Chrome Helper, and what's left.

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
