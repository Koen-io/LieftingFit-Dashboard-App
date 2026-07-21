# Installatie op een gym-laptop

## Snelste manier: de installer

Dubbelklik **`tools/LieftingFit Installer.app`** (uit de uitgepakte zip). Die
haalt de code op, stelt automatische updates in en plaatst de snelkoppeling —
achter een nette voortgangsbalk. Daarna wijst hij je door de twee dingen die
alleen een mens kan doen: de extensie laden en inloggen.

- Eerste keer: rechtermuisknop → **Open** → **Open** (macOS-waarschuwing over een
  niet-ondertekende app).
- Vraagt macOS om ontwikkelaarstools? Klik **Installeer**, wacht, en start de
  installer opnieuw. Dat is eenmalig per laptop en niet te omzeilen — het is de
  prompt van Apple zelf.

Waarom de extensie laden en inloggen niet automatisch gaan: Chrome staat het om
veiligheidsredenen niet toe dat software zelf een extensie laadt of inlogt. Geen
enkele installer kan daar omheen. De installer maakt beide zo kort mogelijk (pad
staat al op het klembord, de juiste pagina's gaan vanzelf open).

---

## Of handmatig, stap voor stap

Ongeveer 10 minuten per laptop. Doe stap 1 t/m 6 in volgorde.

> **Belangrijk:** gebruik `git clone`, niet de zip. De automatische update haalt
> nieuwe versies op met git — een uitgepakte zip is een momentopname en krijgt
> nooit meer een update. De zip is alleen bedoeld als noodoplossing zonder
> internet (zie onderaan).

---

## 1. De map ophalen

Open **Terminal** (⌘-spatie → "Terminal") en plak:

```bash
mkdir -p ~/Code && cd ~/Code
git clone https://github.com/Koen-io/LieftingFit-Dashboard-App.git "LieftingFit Dashboard App"
```

Vraagt hij om een Xcode/ontwikkelaarstool te installeren? Klik **Installeer** en
herhaal daarna het commando.

De map staat nu op:

```
/Users/<gebruikersnaam>/Code/LieftingFit Dashboard App
```

## 2. De extensie in Chrome laden

1. Open Chrome → ga naar `chrome://extensions`
2. Zet rechtsboven **Ontwikkelaarsmodus** aan
3. Klik **Uitgepakte extensie laden**
4. Kies de map uit stap 1

De extensie krijgt op elke laptop hetzelfde ID
(`odppaoogblejdfldnlfacbeiomckheej`), dus de snelkoppeling uit stap 4 werkt
overal zonder aanpassing.

## 3. Inloggen bij Sportbit

1. Ga naar <https://lieftingfit.sportbitapp.nl/web/nl/login>
2. Klik **Inloggen voor leden**, log in met het trainersaccount
3. Zet **Inlog onthouden** aan

## 4. Inloggegevens opslaan (automatisch inloggen)

1. Open het dashboard (klik op het extensie-icoon in de Chrome-werkbalk)
2. **Instellingen** (tandwiel) → **Geavanceerde instellingen** → bevestig
3. Vul onder *Automatisch inloggen* gebruikersnaam en wachtwoord in
4. **Inloggegevens opslaan** → **Opslaan**

> Het wachtwoord staat **onversleuteld** op de laptop en geeft toegang tot de
> ledenadministratie. Alleen doen op gym-laptops. Gaat een laptop weg? Eerst
> **Wis inloggegevens**.

## 5. Snelkoppeling op het bureaublad

```bash
cp -R ~/Code/"LieftingFit Dashboard App/tools/LieftingFit Dashboard.app" ~/Desktop/
```

Eerste keer openen: rechtermuisknop → **Open** → **Open** (macOS waarschuwt
eenmalig over een niet-ondertekende app).

## 6. Automatische updates aanzetten

```bash
~/Code/"LieftingFit Dashboard App/tools/install-updater.command"
```

Of dubbelklik dat bestand in Finder. Vanaf nu haalt de laptop elke 5 minuten
nieuwe versies op. Het dashboard past ze zelf toe via **Instellingen →
Controleer op updates**.

---

## Controleren of alles werkt

| Check | Verwacht |
|---|---|
| Bureaubladicoon | Chrome opent op het dashboard |
| Zaal A / B / C | Drie aparte tabbladen, elk met "Zaal X" in de tabtitel |
| Coachboard | Opent de les die nu of zo draait |
| Instellingen → Onderhoud | Versie + "laatst gecontroleerd" met tijdstip |
| Uitloggen bij Sportbit | Logt zichzelf weer in, zonder typen |

## Casten naar de TV

Per zaal **één keer**: open het Zaal-tabblad → Chrome-menu (⋮) → **Casten** →
kies de TV van die zaal. Chrome onthoudt dit, en alles wat daarna in dat tabblad
opent verschijnt op die TV.

Cast een **tabblad**, niet het hele scherm — dan blijft de laptop vrij bruikbaar.

## Bijwerken (na de installatie)

Niets doen. De laptop haalt updates zelf op; het dashboard meldt het en past ze
toe. Handmatig kan altijd via **Instellingen → Controleer op updates**.

---

## Noodoplossing: installeren zonder git

Alleen als git echt niet kan. Pak de zip uit naar een **vaste** map (niet
Downloads) en ga verder vanaf stap 2.

**Let op:** stap 6 werkt dan niet — een uitgepakte zip is geen git-repo, dus die
laptop krijgt **geen automatische updates**. Je moet hem dan met de hand
bijwerken door een nieuwe zip uit te pakken.
