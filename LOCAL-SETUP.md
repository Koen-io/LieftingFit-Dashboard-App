# Local setup — let Claude drive your Chrome

Run Claude Code on your Mac with a browser tool, so Claude can open Dexos in a
browser, inspect the exact elements, and test the automation live with you. This
is the most hands-off way to finish the Coachboard/Rooster deep links.

> Everything is already pushed to GitHub, so a fresh local session loses no work.

## 1. Install Claude Code (no Node/Homebrew needed)

Open **Terminal** (⌘-space → "Terminal") and run:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Check it worked:

```bash
claude --version
```

## 2. Log in with your Claude account

```bash
claude
```

On first launch it opens your browser to sign in (your Claude Pro/Max
subscription is enough — no API key). If the browser doesn't open, press `c` in
the Terminal to copy the login URL and paste it into Chrome. After signing in,
return to the Terminal.

## 3. Add the browser tool (Playwright MCP)

In Terminal (not inside `claude`):

```bash
claude mcp add playwright -- npx -y @playwright/mcp@latest
```

If Chrome isn't found later, install the browser once:

```bash
npx playwright install chrome
```

## 4. Get the project

```bash
git clone https://github.com/Koen-io/LieftingFit-Dashboard-App.git
cd LieftingFit-Dashboard-App
git checkout claude/crossfit-hyrox-gym-p9cawx
```

### Keep the Dexos login between sessions (recommended)

So you only log into Sportbit once, create a file called **`.mcp.json`** in the
project folder with this content (it stores the browser session in a local
`playwright-profile/` folder):

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--user-data-dir", "./playwright-profile"]
    }
  }
}
```

## 5. Start Claude and hand it the task

```bash
claude
```

Then tell it something like:

> Open https://lieftingfit.sportbitapp.nl/dexos/ in the browser. I'll log in.
> Then go to Planning → Workout Programmering and inspect the type dropdown, a
> day block, and the "Bekijk / Wijzig" button so we can finalize the
> `dexos` macro in `app.js`. The current macro and engine are in `background.js`
> and `docs/HANDOFF.md`.

On the first browser action Claude may ask permission — click **Approve**.

## Gotchas

- `claude mcp list` should show `playwright - Connected`. If it says *failed*,
  wait ~15s (it's downloading) and check again.
- Don't run two Claude sessions in the same folder — they share one browser
  profile and will conflict.
- To reset the login, delete the `playwright-profile/` folder.

*(Setup steps reflect the current Claude Code docs; if a flag has changed since,
`claude` will tell you and the docs at code.claude.com/docs cover it.)*
