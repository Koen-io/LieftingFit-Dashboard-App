#!/bin/bash
# Installeert de automatische update voor het LieftingFit Dashboard.
#
# Dubbelklik dit bestand één keer per laptop. Daarna haalt de laptop elke dag
# zelf de nieuwste versie op en hoeft de trainer alleen Chrome te herstarten.
#
# Verwijderen kan met:  launchctl bootout gui/$(id -u)/nl.lieftingfit.dashboard.update

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="nl.lieftingfit.dashboard.update"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SCRIPT="$REPO/tools/lieftingfit-update.sh"

echo "LieftingFit Dashboard — automatische update installeren"
echo "Map: $REPO"
echo

if [ ! -f "$SCRIPT" ]; then
  echo "FOUT: $SCRIPT niet gevonden."
  read -n 1 -s -r -p "Druk op een toets om te sluiten."; exit 1
fi
chmod +x "$SCRIPT"

mkdir -p "$HOME/Library/LaunchAgents"

# RunAtLoad vangt laptops die 's nachts uit staan: dan draait de update zodra
# de trainer 's ochtends inlogt, in plaats van pas de volgende dag.
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>LF_REPO</key>   <string>${REPO}</string>
    <key>LF_BRANCH</key> <string>main</string>
  </dict>
  <key>RunAtLoad</key>        <true/>
  <!-- Every 5 minutes, not nightly. The dashboard can only APPLY an update that
       is already on disk (chrome.runtime.reload re-reads the folder; it cannot
       fetch). Keeping the folder within ~5 minutes of GitHub is what makes
       "Controleer op updates" actually do something, on every laptop. A git
       fetch with nothing to do is a few KB and finishes in well under a
       second. -->
  <key>StartInterval</key>    <integer>300</integer>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/lieftingfit-update.err.log</string>
</dict>
</plist>
PLISTEOF

# bootout eerst, zodat opnieuw installeren geen dubbele agent oplevert.
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null
if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
  echo "✅ Automatische update geïnstalleerd."
else
  echo "⚠️  Kon de update-taak niet starten. Plist staat wel klaar op:"
  echo "    $PLIST"
fi

echo
echo "Er wordt nu één keer gecontroleerd op updates…"
LF_REPO="$REPO" LF_BRANCH="main" /bin/bash "$SCRIPT"
echo "Klaar. Log: ~/Library/Logs/lieftingfit-update.log"
echo
read -n 1 -s -r -p "Druk op een toets om te sluiten."
