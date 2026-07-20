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
have **no** Coachboard option. Specialty classes are enumerated individually
(`Specialty class 60+/Calisthenics/TRX/Yoga`) — there is no generic "Specialty
classes" bucket, and Booty/Kettlebell are not among them.

**This does not affect the shipping macro**, which never touches
`sel_programma` — the coachboard URL is per-event, so Program and Class arrive
already set. It only matters if someone later adds a `change` step on it; the
`setValue` fix below makes that fail loudly rather than casting the wrong class.

### ⚠️ The roster is filtered to ONE location by default

The gym has **six** rosters: `Alle roosters`, `De machinekamer`,
`Gym - KidsFit / TeenFit`, `The Outdoor Project!`, `Gym - beneden`,
`Gym - bokszaal`. The page defaults to a single one, and the URL does not change
with the filter, so it must be set actively.

Measured on 2026-07-20: `Gym - beneden` showed **16 tiles / 6 types**;
`Alle roosters` showed **34 tiles / 13 types**. A Kickboksen class in the
bokszaal is simply invisible under the default filter — the Coachboard macro
would have reported "no class today" for a class that was running. **This was by
far the biggest source of user-facing failures.**

The macro therefore opens with click-open + click-option on the location picker
(it is a `mat-select`, not a native `<select>`, so a `change` step will not work).

### Roster class names ≠ Dexos type names

`{{TYPE}}` comes from the Dexos programming list; the roster names classes more
coarsely. Hence the `{{TYPE_BASE}}` fallback (first word of the type) as a second
candidate selector. Verified live against today's roster:

Resolution order is `{{TYPE_ROSTER}}` (alias, else the Dexos name) then
`{{TYPE_BASE}}` (first word):

| Dashboard type | Roster tile | Resolves via |
|---|---|---|
| `Kickboksen` | `Boksen` | alias (confirmed by Koen) |
| `Hyrox strength` | `Hyrox strength` | direct — it has its own tile |
| `Hyrox daluren` | `Hyrox` | TYPE_BASE |
| `TRX Daluren` | `Trx` | TYPE_BASE |
| `Crossfit Daluren` | `CrossFit` | TYPE_BASE |
| `Booty` | `Booty` | direct — Wed/Thu evenings only (summer schedule) |

`config.rosterAliases` in `app.js` holds the aliases and survives config
export/import. Add to it as more mismatches surface.

### ⚠️ Class names NEST — substring matching alone picks the wrong class

Real cases: `Boksen` ⊂ `Kickboksen` ⊂ `TeenFit kickboksen`, and `Hyrox` ⊂
`Hyrox strength`. On Wednesday the teens class runs **18:00** and the adult
Boksen **19:00**, so plain substring + nearest-upcoming would send an adult
coach to a room full of teenagers.

`findNearestUpcoming` therefore extracts the tile's **leading class name**
(tiles read `"<name><start time>…"`) and prefers an exact name match over a
substring hit, falling back to substring when nothing matches exactly. This also
means the roster's own name must be the primary search term — searching the
Dexos name `Kickboksen` would exact-match nothing and then substring-match
`TeenFit kickboksen`. Hence `{{TYPE_ROSTER}}` before `{{TYPE_BASE}}`.

Four tests pin this down; **do not reorder those candidates or drop the exact
preference.**

### Soft stops — not every miss is a failure

When `clickNearest` finds nothing, the roster tab is already open **and already
switched to Alle roosters**, so the trainer can simply pick the class by hand.
That result carries `soft: true` and the dashboard shows the reason alone —
no step number, no "mislukt". Reserve hard failures for genuine breakage.

### 🚫 Presentatie-modus can never be clicked by a macro (worked around)

`Presentatie-modus` opens the Coachboard with `window.open()`, which requires
**transient user activation**. A content script's synthetic `MouseEvent` is
`isTrusted:false` and grants no activation, so Chrome's popup blocker silently
drops it — verified live: a real mouse click opened the tab, an identical
scripted click did nothing, no error.

**Worked around by not clicking it.** The event id *is* the coachboard id, so the
new `deriveNavigate` step reads the id out of the current URL and navigates the
same tab (never popup-blocked):

```
/web/nl/events/110649  ->  /cbm/coachboard/110649/
```

Confirmed: that URL opens with Program and Class already set to the clicked
class. **If you ever add another step that opens a new window, it will hit this
same wall** — derive the URL instead.

### 🐛 Fixed — `setValue` failed silently on an unmatched option

`background.js` ~line 232:

```js
if (idx >= 0) el.selectedIndex = idx;
el.dispatchEvent(new Event("input", { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

When no option matches, it skipped the assignment **but still fired `change`**, so
the step "succeeded" with the previous value selected. `setValue` now returns a
boolean and the `change` step fails with `optie "X" bestaat niet in deze lijst`.

### New engine steps

- **`clickNearest`** — of the elements matching a `has/` selector that also carry
  a `HH:MM`, clicks the one starting soonest; after the last class of the day it
  falls back to the latest. Used by Coachboard.

  ⚠️ It narrows to **leaf-most** matches before comparing times. A day-column
  wrapper contains every tile in that column, so it matches `{{TYPE}}` through a
  child while its own first time belongs to a different class — live, the Avond
  wrapper read `OpenGym 17:00` and would have beaten the real 18:00 CrossFit.
  `innermost()` alone does not save you here: the container wins the *time*
  comparison before innermost is ever applied. **Keep the leaf filter first.**

- **`deriveNavigate {from, to}`** — regex the current URL, substitute `$1…`, and
  **return** `{navigateTo, remaining}` for `runMacro` to act on. Waits for the SPA
  route change. Exists to dodge the popup blocker (above).

  ⚠️ It must NOT assign `location.href` itself. `chrome.scripting.executeScript`
  awaits the injected function's promise; navigating from inside tears down that
  execution context before it resolves, so the extension gets `null` and toasts a
  **false failure** while the page actually moved correctly. `runMacro` now does
  the hop via `chrome.tabs.update` and re-injects any remaining steps (max 5 hops).
  **Any future step that navigates must follow this pattern.**

### Status

| Tile | How | Verified |
|---|---|---|
| Training aanpassen | Dexos macro, 7 steps | ✅ live, CrossFit + Hyrox |
| Coachboard | roster → `clickNearest` → `deriveNavigate` | ✅ live end-to-end (Hyrox 10:35 → `/cbm/coachboard/110635/`, Program Hyrox, Class 19:00 — correctly skipped the passed 09:00) |
| Weekprogramma | Dexos macro, Weekoverzicht | ✅ live (week 30 grid, full workout text per day) |
| Rooster | plain URL `/web/nl/events` | ✅ day view — no week toggle or type filter exists on this screen, so there is nothing to automate |
| Kassa | plain URL `/cbm/kassa/` | ✅ unchanged |

**Note:** macros only run in the **Chrome extension** (the engine lives in
`background.js`). The standalone HTML carries the macro definitions but has no
engine — tiles there fall back to `url`.

**Failure toasts now show the engine's reason** (`geen les van dit type
vandaag`, `optie "X" bestaat niet in deze lijst`) instead of the old generic
"neem de flow opnieuw op", which was wrong advice for built-in macros.

### Regression tests — `docs/test/engine-tests.html`

17 checks covering every bug found so far. They load **the real
`background.js`** and run `replayInPage` against DOM fixtures copied from the
live site — no hand-copied engine, so the tests cannot drift from the source.

```bash
python3 -m http.server 8791      # from the repo root
# open http://localhost:8791/docs/test/engine-tests.html
```

Green = all pass. `window.__testSummary` holds `{pass, fail}` for scripting.
It needs a server because `file://` blocks the `<script src>` cross-origin read.

`background.js` registers its `chrome.*` listeners behind an `IS_EXTENSION`
guard purely so this page can load it. Keep that guard.

Covered: the CSS-uppercased tab, uppercase-in-data Hyrox blocks, exact-vs-
substring type matching, the `setValue` silent failure, the day-column-wrapper
trap in `clickNearest` (all four time-of-day branches), clean failure when the
type has no class today, and `deriveNavigate` returning rather than navigating.

Three traps if you extend the fixtures — each one cost a debugging round:
- **Detach inactive fixtures, don't `display:none` them.** `textContent`
  includes hidden descendants, so a hidden fixture leaks its words into the
  visible wrapper and turns should-fail cases green.
- **Freeze only `new Date()`, never `Date.now()`.** `waitFor` times out on
  `Date.now() - start`; freezing it makes no-match cases spin forever.
- **Never render results into the page while tests run.** The engine searches
  the whole document, and result lines contain the same words and clock times as
  the fixtures — so a live results panel becomes a match candidate and the engine
  clicks its own report. (Seen: `has/Hyrox` resolving to
  `<span class="fail">FAIL "Hyrox strength" … 19:00</span>`.) Progress goes to
  `document.title` and the console, which the selectors cannot reach.

### The one untested link: loading the extension

Every macro has been verified by running the engine's exact logic in the live
page, and `runMacro`'s navigation hop has been reviewed, but **the extension has
never actually been loaded**. Chrome blocks scripting of `chrome://extensions`,
so this last step needs a human:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → pick this folder
3. Click the toolbar icon, then each tile

Expect: Coachboard → today's next class of the selected type on the TV;
Weekprogramma → that type's week grid; Training aanpassen → the editor pop-up.
If a tile fails, the toast now names the step and the reason.

`build-standalone.mjs` had `/home/user/...` hardcoded and could not run outside
the cloud sandbox; it now resolves paths relative to itself.

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
