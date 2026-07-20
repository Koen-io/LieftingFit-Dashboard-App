# Build spec — Room console (Zaal A/B/C, single-tab shell, titlebar, Rooster dropdown, auto-login)

Requirements from Koen (2026-07-20) for the next iteration. Build these on this
branch. Keep all currently-verified macros (Dexos, Coachboard, Weekprogramma) —
this mostly changes **where** they run (same tab, not a new tab) and adds shell
UI around them. Verify against the live site + real TVs where noted.

Guiding principle Koen stated: *"otherwise the dashboard is more hassle than
convenience."* Everything a trainer clicks must appear on that room's TV without
extra casting steps.

---

## 1. Zaal A / B / C — three room tabs, independent casting

**Why separate browser tabs:** Chrome casts a whole browser tab to one
Chromecast; it cannot cast part of a page. Three TVs that show different things
at once therefore require **three separate Chrome tabs**, each cast once to its
room's TV. In-page sub-tabs cannot be cast independently — do not use them.

**Build:**
- Three big tabs/buttons across the top of the dashboard: **Zaal A**, **Zaal B**,
  **Zaal C** (names/count editable in Settings; default these three).
- Clicking a Zaal **opens or focuses a dedicated Chrome tab** for that room.
  Track `zaal -> tabId` in the background service worker (and/or encode the room
  in the dashboard URL, e.g. `index.html?zaal=A`). If that room's tab already
  exists, focus it instead of opening a duplicate (`chrome.tabs.update(tabId,
  {active:true})`; if `chrome.tabs.get` says it's gone, open a new one).
- The trainer casts each Zaal tab to its TV **once** per session (Chrome
  remembers). Because tab-casting **follows the tab across in-tab navigations**,
  everything opened inside that tab then lands on that room's TV. **Verify this
  persistence on a real Chromecast** — it's the load-bearing assumption.
- The active room is shown in the titlebar (item 2), e.g. `🅰 Zaal A`.

Persist the room on the tab so a reload/navigation still knows which Zaal it is
(URL param is the most robust; storage keyed by tabId is fragile across restarts).

---

## 2. Single-tab shell + persistent titlebar

Today `runMacro` (background.js) does `chrome.tabs.create({url:startUrl})` — it
opens a **new** tab. Change the model so tools open **inside the current Zaal
tab**, with a persistent titlebar for navigation.

**Titlebar contents (left → right):**
- Room badge: `🅰 Zaal A` (+ small LieftingFit mark).
- **Terug naar Dashboard** — returns the tab to `index.html?zaal=X`.
- **Coachboard · Training aanpassen · Weekprogramma Dexos · Rooster Sportbit ·
  Kassa** — each runs that tool's macro/navigation **in this same tab**.

**How to keep everything in-tab:**
- `runMacro` should run against the **sender's tab** (`sender.tab.id`) instead of
  creating a new one: `chrome.tabs.update(sender.tab.id, {url:startUrl})`, wait
  for load, then `inject(sender.tab.id, steps, context)`. The dashboard page and
  the injected titlebar both send their own tab context.
- Inject the titlebar as a **content script** on `*://*.sportbitapp.nl/*` (fixed
  position, top, high z-index, dark theme matching the dashboard). The dashboard
  page renders the same bar natively. Content scripts can't call `chrome.tabs`,
  so titlebar buttons **message the background** (`{action:'runTool', zaal, tool}`
  or `{action:'goDashboard', zaal}`) and background drives the current tab.
- Sportbit/Dexos are SPAs (Angular / jQuery). The titlebar must **survive
  in-app route changes** — inject at `document_idle` and re-attach via a
  `MutationObserver` (or re-inject on `chrome.webNavigation.onHistoryStateUpdated`)
  so it doesn't disappear after the app re-renders.
- Do **not** try to iframe the tools — Sportbit/Dexos send frame-blocking headers
  (X-Frame-Options / CSP). Same-tab navigation avoids iframes entirely and is
  what makes casting work.

**TV consideration (flag for Koen):** because the whole tab casts, the titlebar
is visible on the TV too. Keep it **slim**, and add an option to **auto-hide**
(slide up, reveal on hover / mouse-to-top) so it doesn't cover the Coachboard
during a class. Default: visible; setting to auto-hide.

---

## 3. Rooster button → its own dropdown (independent of the class-type dropdown)

- Remove the `Vandaag · {{TYPE}}` chip from the **Rooster** tile. Give that tile
  its **own dropdown** in the same visual style as the class-type dropdown.
- This dropdown is **completely separate** from the global class-type selector —
  it only drives the Rooster button.
- Populate it from the **upper-right dropdown on `/web/nl/events`** (the mat-select
  the Coachboard macro already interacts with — the one where you switch to
  "Alle roosters"). Enumerate its real options live and store them as the Rooster
  options (label + how to select). Include "Alle roosters" and each individual
  roster/location.
- Selecting an option + clicking Rooster opens `/web/nl/events` in the Zaal tab
  and sets that mat-select to the chosen option (macro: `click mat-select` →
  `click text/<option>`, mirroring the Coachboard macro's location switch). It's
  a mat-select, not a native `<select>`, so use click-open + click-option.
- `contextMode` for this tile becomes `none` (it no longer uses `{{TYPE}}`); it
  uses its own selected roster instead. Consider a `rosterOptions` array on the
  shortcut and a `{{ROSTER}}` placeholder resolved from the tile's own dropdown.

*(Koen offered a screenshot of this dropdown; the local session can also read the
option list directly from the live mat-select.)*

---

## 4. Auto-login (Koen's preference: no popup, pre-filled)

All tools are same-origin (`sportbitapp.nl`, Dexos included), so **one Sportbit
login authenticates every button** for the session.

**Chosen approach (confirm the tradeoff with Koen before shipping):**
- Store the shared trainer credentials in `chrome.storage.local` (entered once in
  Settings — add fields + a "Wis inloggegevens" button).
- A content script on the login page (`/web/nl/login`, and detect the login form
  generally) **auto-fills and submits** so any button that hits the login glides
  straight through — no popup.
- **Guard against loops:** only auto-submit once per page load; if login fails
  (still on the login page after submit, or an error is shown), stop and surface
  a clear message instead of resubmitting.
- **Security note for Koen:** the password lives on the gym laptop in extension
  storage (local, not synced). Acceptable for a shared gym account on a gym
  device — but it is stored. Keep the "clear credentials" control obvious.

**Fallback (if Koen prefers not to store it):** rely on Chrome's own password
manager (store nothing); the trainer clicks login once per session.

Either way: **no per-tool logins** — the session cookie covers all buttons.

---

## Build order (suggested)

1. **Single-tab shell:** make macros run in the current tab (`sender.tab.id`),
   add the titlebar content script + dashboard titlebar, wire Terug naar
   Dashboard + the five tool buttons. This is the core; get one tool staying
   in-tab with the bar first, then the rest.
2. **Zaal A/B/C tabs:** separate tabs, focus-or-open, room badge, room persisted
   in the URL. Verify independent casting on real TVs.
3. **Rooster dropdown:** enumerate the live mat-select options, own dropdown on
   the tile, `{{ROSTER}}` selection macro.
4. **Auto-login:** credentials in Settings + login-page content script (with the
   confirm + clear + loop-guard).
5. **Re-verify** the existing Coachboard/Dexos/Weekprogramma macros still work
   now that they run in-tab, and confirm the titlebar persists across their SPA
   navigations.

## Acceptance criteria

- Opening Zaal A/B/C gives three independent tabs, each castable to its own TV.
- Inside a Zaal tab, Coachboard/Dexos/etc. open **in that tab** (appear on that
  room's TV); the titlebar stays put; **Terug naar Dashboard** returns.
- The titlebar shows the correct room badge per tab.
- Rooster tile's own dropdown opens the chosen roster.
- With credentials saved, hitting any tool while logged out lands logged in,
  no popup, no resubmit loop.
