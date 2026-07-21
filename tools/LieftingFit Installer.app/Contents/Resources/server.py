#!/usr/bin/env python3
# LieftingFit Dashboard installer — local server + install logic.
#
# Serves the styled UI (ui.html) on 127.0.0.1 and runs the automatable install
# steps in a background thread, reporting progress the UI polls. The two steps
# that a human must do (load the unpacked extension, log in to Sportbit) are
# presented afterwards with buttons that open the right pages and pre-copy the
# folder path — as close to one click as Chrome's security allows.
#
# Standard library only, so it runs on any Mac with the Command Line Tools
# python3 (the same ones that provide git).

import json, os, socket, subprocess, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingMixIn, TCPServer

RES_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
DRY_RUN = os.environ.get("LF_DRYRUN") == "1"       # for testing the UI only

HOME = os.path.expanduser("~")
REPO = os.path.join(HOME, "Code", "LieftingFit Dashboard App")
GIT_URL = "https://github.com/Koen-io/LieftingFit-Dashboard-App.git"
DESKTOP_APP = os.path.join(HOME, "Desktop", "LieftingFit Dashboard.app")
LOGIN_URL = "https://lieftingfit.sportbitapp.nl/web/nl/login"
UPDATER_LABEL = "nl.lieftingfit.dashboard.update"

STEPS = [
    {"id": "tools",   "label": "Ontwikkelaarstools controleren"},
    {"id": "clone",   "label": "Dashboard ophalen van GitHub"},
    {"id": "updater", "label": "Automatische updates instellen"},
    {"id": "shortcut","label": "Snelkoppeling op het bureaublad zetten"},
]

STATE = {
    "phase": "welcome",                             # welcome | installing | manual | done | error
    "steps": [{**s, "state": "pending"} for s in STEPS],
    "error": "",
    "repo": REPO,
}
LOCK = threading.Lock()


def set_step(step_id, state):
    with LOCK:
        for s in STATE["steps"]:
            if s["id"] == step_id:
                s["state"] = state


def run(cmd, **kw):
    if DRY_RUN:
        time.sleep(0.7)
        return 0, "", ""
    p = subprocess.run(cmd, capture_output=True, text=True, **kw)
    return p.returncode, p.stdout, p.stderr


def fail(step_id, msg):
    set_step(step_id, "error")
    with LOCK:
        STATE["phase"] = "error"
        STATE["error"] = msg


# ---- the four automatable steps -------------------------------------------

def step_tools():
    set_step("tools", "active")
    code, _, _ = run(["/usr/bin/xcode-select", "-p"])
    if code != 0 and not DRY_RUN:
        return fail("tools", "Ontwikkelaarstools ontbreken. Start de installer opnieuw.")
    set_step("tools", "done")
    return True


def step_clone():
    set_step("clone", "active")
    os.makedirs(os.path.dirname(REPO), exist_ok=True)
    if os.path.isdir(os.path.join(REPO, ".git")):
        # Already there — bring it up to date rather than fail.
        run(["git", "-C", REPO, "remote", "set-url", "origin", GIT_URL])
        code, _, err = run(["git", "-C", REPO, "fetch", "--quiet", "origin", "main"])
        if code != 0:
            return fail("clone", "Kon updates niet ophalen: " + err.strip()[:200])
        run(["git", "-C", REPO, "checkout", "--quiet", "main"])
        run(["git", "-C", REPO, "reset", "--hard", "--quiet", "origin/main"])
    else:
        code, _, err = run(["git", "clone", "--quiet", GIT_URL, REPO])
        if code != 0:
            return fail("clone", "Klonen mislukt: " + err.strip()[:200])
    set_step("clone", "done")
    return True


def step_updater():
    set_step("updater", "active")
    script = os.path.join(REPO, "tools", "lieftingfit-update.sh")
    if not DRY_RUN:
        try:
            os.chmod(script, 0o755)
        except OSError:
            pass
        plist_dir = os.path.join(HOME, "Library", "LaunchAgents")
        os.makedirs(plist_dir, exist_ok=True)
        plist = os.path.join(plist_dir, UPDATER_LABEL + ".plist")
        with open(plist, "w") as f:
            f.write(_PLIST.format(label=UPDATER_LABEL, script=script, repo=REPO,
                                  logs=os.path.join(HOME, "Library", "Logs")))
        uid = str(os.getuid())
        run(["launchctl", "bootout", "gui/%s/%s" % (uid, UPDATER_LABEL)])
        run(["launchctl", "bootstrap", "gui/%s" % uid, plist])
        run(["/bin/bash", script], env={**os.environ, "LF_REPO": REPO, "LF_BRANCH": "main"})
    set_step("updater", "done")
    return True


def step_shortcut():
    set_step("shortcut", "active")
    src = os.path.join(REPO, "tools", "LieftingFit Dashboard.app")
    if not DRY_RUN:
        run(["rm", "-rf", DESKTOP_APP])
        code, _, err = run(["cp", "-R", src, DESKTOP_APP])
        if code != 0:
            return fail("shortcut", "Kon snelkoppeling niet plaatsen: " + err.strip()[:200])
    set_step("shortcut", "done")
    return True


def install_thread():
    with LOCK:
        STATE["phase"] = "installing"
    for fn in (step_tools, step_clone, step_updater, step_shortcut):
        if not fn():
            return                                  # phase already set to error
        time.sleep(0.25)
    with LOCK:
        STATE["phase"] = "manual"


# ---- manual-step helpers (open pages, pre-copy path) ----------------------

def open_chrome(url):
    if DRY_RUN:
        return
    if subprocess.run(["open", "-a", "Google Chrome", url]).returncode != 0:
        webbrowser.open(url)


def action_open_extensions():
    if not DRY_RUN:
        try:
            subprocess.run(["pbcopy"], input=REPO.encode())      # path ready to paste
        except Exception:
            pass
        subprocess.run(["open", REPO])                           # Finder window
    open_chrome("chrome://extensions/")


def action_open_login():
    open_chrome(LOGIN_URL)


# ---- HTTP -----------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            with open(os.path.join(RES_DIR, "ui.html"), "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        if path == "/logo.png":
            with open(os.path.join(RES_DIR, "logo.png"), "rb") as f:
                return self._send(200, f.read(), "image/png")
        if path == "/api/status":
            with LOCK:
                return self._send(200, json.dumps(STATE))
        if path == "/api/run":
            with LOCK:
                already = STATE["phase"] != "welcome"
            if not already:
                threading.Thread(target=install_thread, daemon=True).start()
            return self._send(200, json.dumps({"ok": True}))
        if path == "/api/open-extensions":
            action_open_extensions();  return self._send(200, json.dumps({"ok": True}))
        if path == "/api/open-login":
            action_open_login();       return self._send(200, json.dumps({"ok": True}))
        if path == "/api/done":
            with LOCK:
                STATE["phase"] = "done"
            return self._send(200, json.dumps({"ok": True}))
        if path == "/api/quit":
            self._send(200, json.dumps({"ok": True}))
            threading.Thread(target=lambda: (time.sleep(0.4), os._exit(0)), daemon=True).start()
            return
        self._send(404, json.dumps({"error": "not found"}))


class Server(ThreadingMixIn, TCPServer):
    allow_reuse_address = True
    daemon_threads = True


_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{label}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>{script}</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>LF_REPO</key><string>{repo}</string><key>LF_BRANCH</key><string>main</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardErrorPath</key><string>{logs}/lieftingfit-update.err.log</string>
</dict>
</plist>
"""


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    srv = Server(("127.0.0.1", port), Handler)
    url = "http://127.0.0.1:%d/" % port
    threading.Thread(target=lambda: (time.sleep(0.4), open_chrome(url)), daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
