# Where everything lives

Quick reference for finding and reloading things. Written for the gym Mac.

## The one path that matters

```
/Users/macminiks/Code/LieftingFit Dashboard App
```

That folder **is** the git repo and **is** the Chrome extension. Load Chrome from
this folder and every `git pull` is picked up by a single Reload click — no
re-downloading, no unzipping.

Open it in Finder:

```bash
open "/Users/macminiks/Code/LieftingFit Dashboard App"
```

> The folder name contains spaces, so always keep it in quotes in Terminal.

## Reloading the extension after changes

1. Go to `chrome://extensions`
2. Find **LieftingFit Trainer Dashboard**
3. Click the circular **⟳ Reload** icon on the card

That's it — for edits to `app.js`, `background.js`, `titlebar.js`, `login.js`,
`app.css`, `index.html` or `manifest.json`.

**Reload is required** (Chrome does not hot-reload extensions). If a change
seems to have done nothing, you almost certainly skipped this step.

Two things that need more than a reload:
- Changes to `titlebar.js` / `login.js` also need the **Sportbit tab refreshed**
  (F5) — content scripts are injected at page load.
- Changes to `background.js` take effect on reload, but an already-open
  Coachboard tab keeps running the old injected code until you re-trigger it.

## First-time load (or after moving the folder)

1. `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `/Users/macminiks/Code/LieftingFit Dashboard App`

To check where an installed copy is loaded from, expand its card on
`chrome://extensions` — the source path is listed there.

## ⚠️ Stale copies

An unzipped copy previously lived at:

```
/Users/macminiks/Downloads/LieftingFit-Dashboard-App-claude-crossfit-hyrox-gym-p9cawx 2/
```

A ZIP is a **snapshot**, frozen at the moment it was made — it does not update
with `git pull`, and loading it means silently running old code while the repo
moves on. If Chrome is pointed at anything under `Downloads`, remove that
extension and load the repo folder instead. Then delete the Downloads copy so it
cannot be picked up again by mistake.

## Files, and what each is for

| Path | What it is |
|---|---|
| `manifest.json` | Extension definition: permissions, content scripts |
| `background.js` | Service worker — room tabs, macro engine (`replayInPage`) |
| `app.js` | Dashboard page logic, config, tiles |
| `app.css` / `index.html` | Dashboard look and markup |
| `titlebar.js` / `titlebar.css` | The bar injected over Sportbit/Dexos |
| `login.js` | Auto-login content script |
| `build-standalone.mjs` | Builds the single-file HTML version |
| `lieftingfit-dashboard-standalone.html` | Generated — do not edit by hand |
| `docs/HANDOFF.md` | Technical notes: every bug found, and why the fixes look the way they do |
| `docs/ROOM-CONSOLE-SPEC.md` | The room-console requirements |
| `docs/test/engine-tests.html` | Regression tests (see below) |

## Running the tests

```bash
cd "/Users/macminiks/Code/LieftingFit Dashboard App"
python3 -m http.server 8791
```

Then open <http://localhost:8791/docs/test/engine-tests.html>.

Green = all pass. Takes ~40s (some cases wait out a 15s timeout on purpose).
A server is needed because `file://` blocks the cross-origin `<script src>`.
If you edited the tests and the page looks unchanged, add `?v=2` to bust the
cache. Stop the server with Ctrl-C.

## Git

```bash
cd "/Users/macminiks/Code/LieftingFit Dashboard App"
git pull                 # get the latest
git log --oneline -10    # what changed recently
git status               # local edits
```

Branch: `claude/crossfit-hyrox-gym-p9cawx` ·
Remote: <https://github.com/Koen-io/LieftingFit-Dashboard-App>
