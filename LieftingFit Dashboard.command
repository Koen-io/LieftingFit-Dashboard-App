#!/bin/bash
# LieftingFit Trainer Dashboard — bureaubladsnelkoppeling
#
# Dubbelklik dit bestand om Chrome te openen op het dashboard.
#
# Waarom dit werkt op elke laptop: manifest.json bevat een vaste "key", dus de
# extensie krijgt overal hetzelfde id. Zonder die key verzint Chrome per map een
# nieuw id en zou deze snelkoppeling op de ene laptop wel en op de andere niet
# werken.
EXT_ID="odppaoogblejdfldnlfacbeiomckheej"
URL="chrome-extension://${EXT_ID}/index.html"

# --new-window zodat het dashboard niet tussen bestaande tabbladen verdwijnt.
open -na "Google Chrome" --args --new-window "$URL"

# Als er niets gebeurt: is de extensie geladen via chrome://extensions →
# "Load unpacked" → deze map? Zie docs/PATHS.md.
