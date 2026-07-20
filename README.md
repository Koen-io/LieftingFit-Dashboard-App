# LieftingFit Trainer Dashboard

A fast, professional shortcut dashboard for the trainers of **LieftingFit
CrossFit / HYROX**. One screen with big, colour-coded buttons that jump
straight to the tools you use during a class — so you spend less time
clicking through menus and more time coaching.

![Dashboard](assets/liftingfit-black.png)

---

## 🌅 Koen — begin hier (ochtend-update)

Terwijl je sliep heb ik de **1-klik "Training aanpassen"** gebouwd én getest. Zo probeer je hem:

1. **Installeer de extensie** (eenmalig). Download deze map en laad hem in Chrome:
   `https://github.com/Koen-io/LieftingFit-Dashboard-App/archive/refs/heads/claude/crossfit-hyrox-gym-p9cawx.zip`
   → `chrome://extensions` → **Ontwikkelaarsmodus** aan → **Uitgepakte extensie laden** → kies de map (met `manifest.json`) → klik het 🏋️ icoon om het dashboard te openen.
2. **Log één keer in** bij Sportbit/Dexos in diezelfde Chrome.
3. Kies bovenaan een **lestype** (bijv. CrossFit) en klik **Training aanpassen**.
   De helper doet nu automatisch: Planning → Workout Programmering → Maandoverzicht → lestype instellen → **de les van vandaag** aanklikken → **Bekijk / Wijzig** openen. 🎬

**Werkt een stap niet?** Het dashboard laat precies zien *welke* stap misging (bijv. "Stap 6 mislukt"). Stuur me dat bericht — dan pas ik die stap aan. Kleine verschillen in de website-tekst kunnen de eerste keer roet in het eten gooien; dat is snel op te lossen.

> De knoppen **Coachboard** (vandaag op de TV) en **Rooster** (week per lestype) staan klaar met de lestype-context, maar hun automatische flow moet ik nog bouwen — daarvoor heb ik dezelfde soort opname/inzage van de **Sportbit-roster** nodig als bij Dexos. Zie `docs/HANDOFF.md`.

Wil je dat ik het écht zelf in de browser doe en test? Volg dan **[`LOCAL-SETUP.md`](LOCAL-SETUP.md)** — dan draai je Claude Code lokaal en bestuur ik Chrome mee.

---

## What it does

| Button | Opens | Notes |
|--------|-------|-------|
| **Coachboard** | Sportbit presenter mode | The screen you cast to the TV during class |
| **Rooster** | Sportbit lesson roster | Plus a month-view selector per lesson type (see below) |
| **Training aanpassen** | Dexos · Workout Programmering | Edit the workout of a class |
| **Kassa** | Sportbit checkout | Point of sale |

Extra:

- 🖥️ **Fullscreen (kiosk) mode** — press `F`, ideal for the gym laptop.
- ⌨️ **Keyboard shortcuts** — press `1`–`9` to open a button, `S` for settings.
- 🗓️ **Month-view roster per lesson type** — a dropdown (CrossFit, HYROX,
  Weightlifting, Open Gym, …) that opens the pre-filtered month view.
- ⚙️ **Everything is configurable** — labels, colours, icons and URLs. No code
  needed. Set it up once and **Export config** to a file, then **Import** it on
  every other gym laptop so they're all identical.
- 🇳🇱 Dutch interface.

## About casting to the TV (important)

The Coachboard is a **logged-in, interactive web page**. Chromecast can only
put that on the TV by **mirroring a Chrome tab** (or the whole screen) — a
Chromecast can't just "open the URL" itself, because it wouldn't have your
Sportbit login.

That's why this dashboard is built to run **inside Google Chrome**: every
button opens the tool in a Chrome tab, so your existing one-click **Chrome →
Cast → Tab casten** flow keeps working. The `?` button top-right shows the exact
steps, and you can save the TV's name under Settings so the instructions name
your screen.

> A standalone/Electron app was considered, but a custom app **cannot** mirror a
> tab to Chromecast (that feature is proprietary to Google Chrome). Staying in
> Chrome is what keeps casting one click. If you'd rather have an all-in-one
> desktop app and cast the whole screen instead, that's a possible next step —
> see "Ideas / next steps".

## How to use it

### Option A — open it directly (simplest)

1. Download this repo (green **Code → Download ZIP** on GitHub, then unzip).
2. Double-click **`index.html`** — it opens in your default browser. Use Chrome.
3. Press `F` for fullscreen. Done.

### Option B — install it as a Chrome app (recommended for the gym laptop)

1. Host the folder (e.g. GitHub Pages) **or** just open `index.html` in Chrome.
2. Chrome menu **⋮ → Cast, save and share → Install page as app** (or the
   install icon in the address bar). It gets its own icon in the dock/taskbar
   and opens without browser chrome — clean for the gym.

No server, database or build step is required. It's plain HTML/CSS/JS.

## Configuring the shortcuts

Click the ⚙️ (or press `S`). You can edit:

- **Naam sportschool / TV** — used in the header and cast instructions.
- **Snelkoppelingen** — the big buttons: label, subtitle, URL, icon, colour, and
  whether to show the "Casten naar TV" badge. Add or remove as many as you like.
- **Lestypes** — the roster month-view dropdown.

### Getting the deep-link URLs (the part that needs you)

Some shortcuts currently point at the login page because their exact URL lives
behind your Sportbit login, which the dashboard doesn't have. You can wire them
up perfectly in a minute — no password sharing needed:

1. **Roster month view per lesson type**
   In Sportbit, open the roster, switch to **maandweergave**, pick a lesson type
   in the selector left of the **Exporteer** button, then copy the URL from the
   address bar and paste it into that lesson type under Settings.
   *(If Sportbit doesn't put the filter in the URL, tell me — a small Chrome
   extension can set the filter for you instead.)*

2. **Dexos "Event Wijzigen"**
   Navigate Planning → Workout Programmering → class block → Acties →
   Bekijk/Wijzig → Event Wijzigen. If that popup has its own URL, paste it into
   the **Training aanpassen** shortcut. If it's a popup without a stable URL,
   that's a good candidate for the Chrome-extension one-click automation below.

3. **Coachboard**
   `…/cbm/coachboard/110634/` is one specific board. If you want the button to
   always open *today's* class board, I need to know how a class block maps to
   its coachboard ID — share a couple of examples and I'll make it dynamic.

## One-click deep links (the Chrome Helper / extension)

Some destinations can't be reached by a plain link — e.g. Dexos **Event
Wijzigen** opens a pop-up that doesn't change the web address ("Type B"). For
those, install this project as a **Chrome extension**: clicking a tile then
**replays your recorded clicks automatically** and lands on the final screen.

Because the extension runs inside your own Chrome, it reuses your existing
**Sportbit login** — no password is ever stored in the app.

### Install the extension (one time, per laptop)

1. Download this repo folder to the laptop.
2. Open Chrome → `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this project folder.
5. The LieftingFit icon appears in the toolbar — click it to open the dashboard.

### Turn a multi-step flow into a one-click tile

1. In Chrome, go to the page where the flow starts (e.g. `…/dexos/`) while
   **logged into Sportbit**.
2. Open **⋮ → More tools → Recorder → Start new recording**, give it a name.
3. Do your clicks (Planning → Workout Programmering → class block → Acties →
   Bekijk/Wijzig → Event Wijzigen), then **End recording**.
4. Click **Export ⭳ → JSON** and save the file.
5. In the dashboard, open **Settings (⚙️)**, find the tile (e.g. *Training
   aanpassen*), click **Importeer Chrome-opname**, and pick that JSON.
6. Save. The tile now shows a **⚡ 1-klik dieplink** badge — clicking it runs the
   whole sequence for you.

If a step can't be found later (the site changed, or the class block was
date-specific), the dashboard tells you exactly which step failed — just
re-record that flow. Class blocks that differ per day may need the recording
tweaked to match by class name/time instead of an exact cell; send me a failing
recording and I'll adjust the matching.

## Ideas / next steps

- **Chrome extension** that collapses the 6-step Dexos navigation
  (Planning → … → Event Wijzigen) into a single click by scripting the clicks
  on the page. Needs a look at the actual Sportbit/Dexos page to build reliably.
- **Dynamic "today's Coachboard"** button, once we know the roster → board-ID
  mapping.
- **All-in-one desktop app** (Electron) that embeds the tools and casts the
  whole screen, if you'd prefer that over the Chrome-tab approach.

## Project layout

```
index.html            # the dashboard (also the extension's page)
app.css               # styling (dark, brand-matched)
app.js                # logic, default config, macro (Type B) support
manifest.json         # Chrome extension manifest (MV3)
background.js         # extension service worker + click-replay engine
manifest.webmanifest  # PWA install metadata (for the non-extension/hosted use)
build-standalone.mjs  # inlines everything into one downloadable HTML file
lieftingfit-dashboard-standalone.html  # generated single-file version
assets/               # LieftingFit logo (black/white transparent) + app icons
```

The same folder works three ways: open `index.html` in Chrome (or the hosted
link) as a plain dashboard, share `lieftingfit-dashboard-standalone.html` as one
file, or **Load unpacked** the folder as the Chrome extension to unlock the
one-click deep links.

Brand assets in `assets/` were generated from the official
`Beeldmerk_LieftingFit` logo: transparent black (for light backgrounds),
transparent white (used in the dark UI), and app icons.
