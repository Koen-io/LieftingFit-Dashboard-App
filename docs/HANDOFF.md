# Handoff / technical notes

State of the LieftingFit trainer dashboard + Chrome Helper, and what's left.

## ▶ CONTINUE HERE (local session) — read this first

**Dexos macro: VERIFIED on the live site (2026-07-20, local session).** All 7
steps of `Training aanpassen` were resolved against the real DOM for **both
CrossFit and Hyrox**, using a faithful in-page copy of the `background.js`
resolver. Details in "Verified selectors" below. Remaining work is Coachboard +
Rooster.

### Verified selectors (live DOM, 2026-07-20)

| Step | Selector | Resolves to |
|---|---|---|
| 2 | `text/Planning` | `SPAN` "Planning" (left menu) |
| 3 | `text/WORKOUT PROGRAMMERING` | `A` → `dexos.openModule(13, 13, whiteboard.initProgramSearch, {'custom_id':3,'view':'overzicht'}, 16)` |
| 4 | `selopt/Maandoverzicht` | `select#sel_overzicht` (2 opts: Weekoverzicht, Maandoverzicht) |
| 5 | `selopt/CrossFit` | `select#sel_eventtypeId` (41 opts) |
| 6 | `has/{{TODAY_DMY}}&&{{TYPE}}` | `div.m-program` → `whiteboard.selecteerProgrammering(<id>)` |
| 7 | `text/Bekijk / Wijzig` | `BUTTON` → `whiteboard.openGeselecteerdeProgrammering(<id>)` |

**Why step 3 failed, precisely:** the real DOM text is `Workout programmering` —
**sentence case** (lowercase `p`), not the `Workout Programmering` title case the
cloud session guessed. CSS `text-transform: uppercase` renders it as
`WORKOUT PROGRAMMERING`. The `norm()` fix handles it; the old exact match did not.

**Second bug the `norm()` fix silently fixed (step 6, Hyrox only):** Hyrox day
blocks have DOM text `HYROX 20072026` — **genuinely uppercase in the data**, with
`text-transform: none`. The type dropdown supplies `Hyrox`. So case-sensitive
`has/` would have failed for *every* Hyrox class. CrossFit blocks are title case
(`CrossFit Warm Up 20072026`), which is why this never showed up in testing.

**Both toolbar controls are real native `<select>`s** — no custom-dropdown
rewrite needed. The `change` steps work as written.

**Prefix collisions in the 41 types** — `CrossFit` / `Crossfit Daluren` /
`CrossFit open`, and `Hyrox` / `Hyrox daluren` / `Hyrox strength`. Safe because
the `change` handler tries **exact match before substring** (`background.js`
~line 230). Verified: selecting `Hyrox` picks index 16 `Hyrox`, not `Hyrox
daluren`. **Do not reorder those two loops.**

Residual edge case (not hit today): on a day with both `HYROX 20072026` and
`HYROX Long 20072026`, `has/20072026&&Hyrox` matches both and `innermost()` picks
one arbitrarily. Only matters if you need Long specifically.

### Coachboard — flow mapped live (2026-07-20)

**The roster is an Angular SPA.** `/cbm/` redirects to `/web/nl/events` (already
authenticated). Class tiles are `app-event-tile > div.calendar-card`
(`cursor:pointer`, **no `href`/`onclick`** — Angular event binding). A real click
works, and because the handler sits on an ancestor, clicking the inner `has/`
match bubbles up correctly.

**The event id IS the coachboard id.** Clicking a tile goes to
`/web/nl/events/110634`; Presentatie-modus opens `/cbm/coachboard/110634/`.
(110634 is the id currently hardcoded in `app.js` — it is *today's 07:00
CrossFit*, so **the hardcoded Coachboard URL silently goes stale every day**.)

**`Presentatie-modus` only exists on the event detail page**, not on the roster.
It is an `A` (no href) in `div.header__top__nav`; `text/Presentatie-modus`
resolves cleanly. **It opens a NEW TAB** — relevant to `runMacro`, which drives a
single tab. Fine as a terminal step; nothing can follow it in the same macro.

**`/cbm/coachboard/` with no id** loads a branded idle splash with **no toolbar
and no selectors** — not usable as a generic entry point. An event id is
required, so the roster → tile → Presentatie-modus path is unavoidable.

**The Coachboard has its own toolbar** — three native `<select>`s plus
`button#fullscreen-btn` → `coachboard.openFullscreen()`:

| Control | id | Options |
|---|---|---|
| Program | `sel_programma` | **12 groups**: CrossFit, Fitness, OpenGym, Hyrox, Daluren, Specialty class 60+/Calisthenics/TRX/Yoga, The Outdoor Project, brazilian jiu jitsu, + one blank |
| Class | `sel_les` | today's start times for that program (e.g. 07:00, 18:00, 20:00) |
| View | *(none)* | Coachboard, WOD presentation |

⚠️ **12-vs-41 mismatch.** `sel_programma` is a coarser grouping than the
dashboard's 41 class types. `Hyrox strength`, `Booty`, `Kettlebell Training` etc.
have **no** Coachboard option. Combined with the `setValue` bug below, a
`{{TYPE}}` with no match casts the *wrong* class to the TV and still reports
success.

### 🐛 Open bug — `setValue` fails silently on an unmatched option

`background.js` ~line 232:

```js
if (idx >= 0) el.selectedIndex = idx;
el.dispatchEvent(new Event("input", { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

When no option matches, it skips the assignment **but still fires `change`**, so
the step "succeeds" with the previous value selected. A `change` step should fail
loudly like a click step does. This did not bite the Dexos macro (all 41 types
exist in `sel_eventtypeId`) but it *will* bite the Coachboard.

### Still to decide / build

- **Coachboard** — flow is known (above). Open question: which class when today
  has several of `{{TYPE}}` (07:00 / 18:00 / 20:00)? Suggest nearest-upcoming.
- **Rooster** (`contextMode: week`) — **ambiguous, needs Koen.** The original note
  ("month view has a lesson-type selector left of the Exporteer button; we want
  the week view") describes the **Dexos Workout Programmering** toolbar exactly —
  `sel_overzicht` has `Weekoverzicht`/`Maandoverzicht` and sits left of
  **Exporteer**. If so, Rooster = the `dexos` macro with `Weekoverzicht` and no
  day-block click. The alternative reading is the Sportbit member roster week view.
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
