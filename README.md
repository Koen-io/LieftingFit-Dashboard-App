# LieftingFit Trainer Dashboard

A fast, professional shortcut dashboard for the trainers of **LieftingFit
CrossFit / HYROX**. One screen with big, colour-coded buttons that jump
straight to the tools you use during a class — so you spend less time
clicking through menus and more time coaching.

![Dashboard](assets/liftingfit-black.png)

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
index.html            # the dashboard
app.css               # styling (dark, brand-matched)
app.js                # logic + default configuration
manifest.webmanifest  # PWA install metadata
assets/               # LieftingFit logo (black/white transparent) + app icons
```

Brand assets in `assets/` were generated from the official
`Beeldmerk_LieftingFit` logo: transparent black (for light backgrounds),
transparent white (used in the dark UI), and app icons.
