#!/bin/bash
# LieftingFit Dashboard — automatische update
#
# Haalt de nieuwste code van GitHub op. Draait via launchd (zie install-updater.sh),
# standaard elke dag. De trainer hoeft daarna alleen Chrome opnieuw te starten.
#
# Ontwerpkeuzes die hier bewust in zitten:
#  - `git reset --hard` in plaats van `git pull`: op een gym-laptop wil je nooit
#    een merge-conflict of een half-gemergde staat. De laptop is een KOPIE, geen
#    werkplek. Lokale wijzigingen gaan dus verloren — dat is de bedoeling.
#  - Er wordt alleen iets gedaan als er echt iets veranderd is, zodat het log
#    leesbaar blijft.
#  - Alles wordt gelogd; zonder log is een stille fout niet te vinden.

set -uo pipefail

REPO="${LF_REPO:-/Users/macminiks/Code/LieftingFit Dashboard App}"
BRANCH="${LF_BRANCH:-main}"
LOG="${HOME}/Library/Logs/lieftingfit-update.log"

mkdir -p "$(dirname "$LOG")"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"; }

if [ ! -d "$REPO/.git" ]; then
  log "FOUT: geen git-repo op $REPO — update overgeslagen"
  exit 1
fi

cd "$REPO" || { log "FOUT: kan niet naar $REPO"; exit 1; }

# Netwerk kan er even niet zijn (laptop net aan). Geen drama: morgen weer.
if ! git fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
  log "Geen verbinding met GitHub — later opnieuw"
  exit 0
fi

LOCAL="$(git rev-parse HEAD 2>/dev/null)"
REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null)"

# Laat altijd zien DAT er gecontroleerd is. Zonder dit is "stil" niet te
# onderscheiden van "stuk" — precies de reden dat dit de eerste keer leek te
# falen terwijl er simpelweg niets te doen was. Het dashboard leest dit bestand
# en toont het onder Instellingen.
write_status() {
  printf '{"checked":"%s","installed":"%s","result":"%s"}\n' \
    "$(date '+%Y-%m-%d %H:%M')" \
    "$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null || echo '?')" \
    "$1" > "$REPO/.update-status" 2>/dev/null || true
}

if [ "$LOCAL" = "$REMOTE" ]; then
  write_status "actueel"
  exit 0                      # niets te doen, en geen ruis in het log
fi

# VEILIGHEID: nooit ongepubliceerd werk weggooien.
#
# Dit script doet `reset --hard`, wat op een gym-laptop precies goed is (die is
# een kopie) maar op een ontwikkelmachine werk kan vernietigen. Staat er iets
# ongecommit klaar, of zitten we op een andere branch met eigen commits, dan
# stopt de update en zegt het waarom.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  log "OVERGESLAGEN: er staan lokale wijzigingen klaar — niets aangeraakt"
  write_status "overgeslagen (lokale wijzigingen)"
  exit 0
fi
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ] && [ -n "$(git log --oneline "origin/$BRANCH..HEAD" 2>/dev/null)" ]; then
  log "OVERGESLAGEN: branch '$CURRENT_BRANCH' heeft eigen commits — niets aangeraakt"
  write_status "overgeslagen (eigen commits op $CURRENT_BRANCH)"
  exit 0
fi

log "Update gevonden: ${LOCAL:0:7} -> ${REMOTE:0:7}"

# Zorg dat we op de juiste branch staan en gooi lokale rommel weg.
git checkout --quiet "$BRANCH" 2>>"$LOG" || log "WAARSCHUWING: checkout $BRANCH mislukt"
if git reset --hard --quiet "origin/$BRANCH" 2>>"$LOG"; then
  NEW_VERSION="$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null || echo '?')"
  log "Bijgewerkt naar versie $NEW_VERSION"

  # Chrome laadt een unpacked extensie pas opnieuw bij het opstarten. We
  # herstarten Chrome NIET automatisch: dat zou een les kunnen onderbreken die
  # op de TV staat. In plaats daarvan laten we een vlag achter; het dashboard
  # meldt zelf dat er een update klaarstaat.
  printf '%s' "$NEW_VERSION" > "$REPO/.update-ready" 2>/dev/null || true
  write_status "bijgewerkt naar $NEW_VERSION — herstart Chrome"
else
  log "FOUT: bijwerken mislukt"
  write_status "mislukt"
  exit 1
fi
