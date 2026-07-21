/* LieftingFit Trainer Dashboard
 * Self-contained, no build step. Configuration lives in localStorage so each
 * gym laptop can be set up once (and shared via Export/Import config).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "lieftingfit.dashboard.config.v1";

  // ----- Icons (inline SVG paths) -----
  var ICONS = {
    present:  '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    edit:     '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    cart:     '<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    users:    '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    dumbbell: '<svg viewBox="0 0 24 24"><path d="M6 6v12M3 8v8M18 6v12M21 8v8M6 12h12"/></svg>',
    link:     '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
    cast:     '<svg viewBox="0 0 24 24"><path d="M2 20h.01M2 16a6 6 0 0 1 6 6M2 12a10 10 0 0 1 10 10M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6"/></svg>',
    bolt:     '<svg viewBox="0 0 24 24"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>'
  };

  // Running as the LieftingFit Chrome extension? (enables Type B one-click deep links)
  var IS_EXT = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  var ACCENTS = ["blue", "green", "amber", "purple", "cyan", "red"];

  // ----- Default configuration -----
  // The active class type drives the context-aware tiles:
  //   contextMode "today" -> today's class of the selected type
  //   contextMode "week"  -> that type's whole week
  //   contextMode "none"  -> ignores the selected type
  var DEFAULT_CONFIG = {
    gymName: "LieftingFit",
    tvName: "", // optional Chromecast / TV name, shown in cast help
    selectedType: "CrossFit",
    classTypes: [
      "60+ training", "Advanced Kickboxing", "Base builder", "Booty", "Booty daluren",
      "brazilian jiu jitsu", "Calisthenics", "Calisthenics Kids & Teens", "Challenge",
      "Core", "CoreFit", "CrossFit", "Crossfit Daluren", "CrossFit open", "Events",
      "FitnessFit", "Hyrox", "Hyrox daluren", "Hyrox strength", "Junior Powerliften",
      "Kettlebell Training", "Kickboksen", "Kickboksen (daluren)", "KidsFit",
      "Olympic weightlifting", "Powerliften", "PRVN Burn", "Sparren (kickboksen)",
      "Specialty class: Pilates", "Strength", "TeenFit Calisthenics", "TeenFit kickboksen",
      "The Outdoor Project - Castricum", "The Outdoor project - Uitgeest", "The Run Club",
      "TRX", "Trx / Booty mix", "TRX Daluren", "Trx training", "Yoga",
      "zaal verhuurd voor event"
    ],
    // Dexos programming type -> the name the Sportbit roster uses for the same
    // class. Only needed where the two genuinely differ; most types match.
    // Confirmed by Koen: roster "Boksen" is the adult class that Dexos calls
    // "Kickboksen". ("Booty" needs no alias — it is spelled the same and simply
    // does not run every weekday.)
    rosterAliases: {
      "Kickboksen": "Boksen",
      "Kickboksen (daluren)": "Boksen"
    },
    // One Chrome tab per room. Chrome casts a whole tab, so this is the only
    // way three TVs can show different things at once.
    rooms: ["A", "B", "C"],
    // The titlebar is cast to the TV along with everything else; auto-hide slides
    // it away so it does not sit over the Coachboard during a class.
    titlebarAutoHide: false,
    // On arrival, preselect the class type that is running or starts next.
    autoSelectType: true,
    // Which Sportbit roster (zaal) this dashboard is for. The gym's TVs are all
    // downstairs, so "Gym - beneden" is the sensible default — but the other
    // rosters stay selectable rather than being ruled out.
    selectedRooster: "Gym - beneden",
    // Seed of "which classes run in which zaal". Measured from the live roster;
    // the extension keeps learning and merges what it sees, so this only has to
    // be roughly right. Editable in Settings.
    // Seeded from what was actually OBSERVED in Sportbit, not guessed — a wrong
    // guess here shows a trainer downstairs a class that only runs upstairs,
    // which is exactly what this list exists to prevent. Anything not yet
    // placed appears under "Overig" rather than being silently lost, and the
    // extension overwrites these lists with what it learns from the live
    // roster. Editable in Settings → Lestypes per zaal.
    rosterTypes: {
      "Gym - beneden": [
        "60+ training", "CrossFit", "Crossfit Daluren", "CrossFit open",
        "Hyrox", "Hyrox daluren", "Hyrox strength", "OpenGym"
      ],
      "Gym - bokszaal": [
        "Advanced Kickboxing", "Boksen", "brazilian jiu jitsu", "Kickboksen",
        "Kickboksen (daluren)", "Sparren (kickboksen)", "Trx", "Yoga"
      ],
      "Gym - KidsFit / TeenFit": [
        "Calisthenics Kids & Teens", "Junior Powerliften", "KidsFit",
        "TeenFit Calisthenics", "TeenFit kickboksen"
      ],
      "The Outdoor Project!": [
        "The Outdoor Project - Castricum", "The Outdoor project - Uitgeest", "The Run Club"
      ],
      "De machinekamer": []
    },
    shortcuts: [
      {
        // Ignores the class-type dropdown entirely: opens whatever is running
        // in the gym right now (or starts next). The fewest decisions for a
        // trainer who is about to start coaching.
        id: "nubezig", label: "Nu bezig", sub: "Direct de les die nu draait",
        icon: "present", accent: "red", cast: true, contextMode: "none",
        url: "https://lieftingfit.sportbitapp.nl/web/nl/events"
      },
      {
        id: "coachboard", label: "Coachboard", sub: "Sportbit · Presentatie-modus",
        icon: "present", accent: "green", cast: true, contextMode: "today",
        // Fallback only. A coachboard URL is per-EVENT (/cbm/coachboard/<eventId>/)
        // and the id changes every day, so this link goes stale — the macro below
        // is the real path. Bare /cbm/coachboard/ is just an idle splash screen.
        url: "https://lieftingfit.sportbitapp.nl/web/nl/events",
        // Roster (Angular SPA, day view) -> today's class of {{TYPE}} -> Coachboard.
        //
        // clickNearest picks the class starting soonest, because today can hold
        // several of the same type (CrossFit runs 07:00 / 18:00 / 20:00).
        //
        // The last step deliberately does NOT click "Presentatie-modus": that
        // button uses window.open(), which a synthetic click cannot trigger
        // (popup blocker — see deriveNavigate in background.js). The event id is
        // the same id the coachboard uses, so we navigate straight there.
        macro: {
          startUrl: "https://lieftingfit.sportbitapp.nl/web/nl/events",
          steps: [
            { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/web/nl/events" },
            // The roster defaults to ONE location (e.g. "Gym - beneden") and the
            // gym has six. A class in the bokszaal / KidsFit zaal / Outdoor
            // Project is simply absent under that filter, so the macro would say
            // "geen les van dit type vandaag" for a class that is running.
            // Switching to "Alle roosters" took today from 16 tiles / 6 types to
            // 34 tiles / 13 types. It is a mat-select, not a native <select>, so
            // it needs click-open + click-option rather than a `change` step.
            { type: "click", selectors: [["mat-select"]] },
            { type: "click", selectors: [["text/Alle roosters"]] },
            // {{TYPE_ROSTER}} first: the roster's own name for the class (via
            // rosterAliases), falling back to the Dexos name when they agree.
            // {{TYPE_BASE}} (first word) then rescues the coarser cases —
            // "TRX Daluren" -> "Trx", "Hyrox strength" -> "HYROX" on days when
            // only the plain class runs.
            { type: "clickNearest", selectors: [["has/{{TYPE_ROSTER}}"], ["has/{{TYPE_BASE}}"]] },
            {
              type: "deriveNavigate",
              from: "/events/(\\d+)",
              to: "https://lieftingfit.sportbitapp.nl/cbm/coachboard/$1/"
            }
          ]
        }
      },
      {
        id: "dexos", label: "Training aanpassen", sub: "Dexos · Workout Programmering",
        icon: "edit", accent: "amber", cast: false, contextMode: "today",
        url: "https://lieftingfit.sportbitapp.nl/dexos/",
        // Built-in Type B flow (reverse-engineered from the Workout Programmering
        // screen): Planning -> WORKOUT PROGRAMMERING -> Maandoverzicht + type
        // dropdown -> today's block of that type -> Bekijk / Wijzig.
        // {{TYPE}} follows the class-type dropdown; {{TODAY_DMY}} = ddmmyyyy.
        macro: {
          startUrl: "https://lieftingfit.sportbitapp.nl/dexos/",
          steps: [
            { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/dexos/" },
            { type: "click", selectors: [["text/Planning"]] },
            { type: "click", selectors: [["text/WORKOUT PROGRAMMERING"], ["has/WORKOUT PROGRAMMERING"]] },
            { type: "change", value: "Maandoverzicht", selectors: [["selopt/Maandoverzicht"]] },
            { type: "change", value: "{{TYPE}}", selectors: [["selopt/CrossFit"]] },
            { type: "click", selectors: [["has/{{TODAY_DMY}}&&{{TYPE}}"], ["has/{{TODAY_DMY}}"]] },
            { type: "click", selectors: [["text/Bekijk / Wijzig"], ["has/Bekijk"]] }
          ]
        }
      },
      {
        id: "weekprogramma", label: "Weekprogramma", sub: "Dexos · Weekoverzicht",
        icon: "calendar", accent: "blue", cast: false, contextMode: "week",
        url: "https://lieftingfit.sportbitapp.nl/dexos/",
        // Same path as Training aanpassen, but Weekoverzicht instead of
        // Maandoverzicht and no day-block click: shows the whole week's workout
        // content for {{TYPE}} on one screen.
        macro: {
          startUrl: "https://lieftingfit.sportbitapp.nl/dexos/",
          steps: [
            { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/dexos/" },
            { type: "click", selectors: [["text/Planning"]] },
            { type: "click", selectors: [["text/WORKOUT PROGRAMMERING"], ["has/WORKOUT PROGRAMMERING"]] },
            { type: "change", value: "{{TYPE}}", selectors: [["selopt/CrossFit"]] },
            { type: "change", value: "Weekoverzicht", selectors: [["selopt/Weekoverzicht"]] }
          ]
        }
      },
      {
        id: "rooster", label: "Rooster", sub: "Sportbit · Lesrooster (vandaag)",
        icon: "calendar", accent: "blue", cast: false,
        // Deliberately "none": this tile does NOT follow the global class-type
        // dropdown. It has its own roster picker below, because which room's
        // schedule you want to see is a separate question from which class type
        // you are coaching.
        contextMode: "none",
        url: "https://lieftingfit.sportbitapp.nl/web/nl/events",
        // Mirrors the mat-select on /web/nl/events. Read live from the page on
        // 2026-07-20; refresh with "Ververs roosters" in Settings if the gym
        // adds a location.
        rosterOptions: [
          "Alle roosters",
          "LieftingFit - De machinekamer",
          "LieftingFit - Gym - KidsFit / TeenFit",
          "LieftingFit - The Outdoor Project!",
          "LieftingFit - Gym - beneden",
          "LieftingFit - Gym - bokszaal"
        ],
        selectedRoster: "Alle roosters",
        // Same click-open + click-option shape the Coachboard macro uses: it is
        // an Angular Material mat-select, so a `change` step cannot drive it.
        macro: {
          startUrl: "https://lieftingfit.sportbitapp.nl/web/nl/events",
          steps: [
            { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/web/nl/events" },
            { type: "click", selectors: [["mat-select"]] },
            { type: "click", selectors: [["text/{{ROSTER}}"]] }
          ]
        }
      },
      {
        // Members are managed in Dexos, not the web portal: Planning →
        // Groepslessen → select the class → Bekijk / Wijzig → Deelnemers.
        // The dropdown below picks WHICH class (today only, of the selected
        // type), so the trainer lands on the right one.
        id: "leden", label: "Leden toevoegen", sub: "Dexos · Deelnemers beheren",
        icon: "users", accent: "cyan", cast: false, contextMode: "none",
        url: "https://lieftingfit.sportbitapp.nl/dexos/",
        classPicker: true,          // filled at render time from today's roster
        macro: {
          startUrl: "https://lieftingfit.sportbitapp.nl/dexos/",
          steps: [
            { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/dexos/" },
            { type: "click", selectors: [["text/Planning"]] },
            { type: "click", selectors: [["text/GROEPSLESSEN"], ["has/GROEPSLESSEN"]] }
          ]
        }
      },
      {
        id: "kassa", label: "Kassa", sub: "Sportbit · Afrekenen",
        icon: "cart", accent: "purple", cast: false, contextMode: "none",
        url: "https://lieftingfit.sportbitapp.nl/cbm/kassa/"
      }
    ]
  };

  // ----- Config load / save -----
  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_CONFIG);
      var parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch (e) {
      return clone(DEFAULT_CONFIG);
    }
  }
  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    mirrorConfig(cfg);
  }
  // The titlebar runs as a content script on sportbitapp.nl and cannot read this
  // page's localStorage. Mirror the config into chrome.storage.local so the
  // background can resolve a titlebar button to its macro.
  function mirrorConfig(cfg) {
    if (!IS_EXT) return;
    try { chrome.storage.local.set({ config: cfg }); } catch (e) {}
    backupConfig(cfg);
  }

  /* Rolling back-ups. Someone will eventually change a setting they did not
   * understand, and "restore the last version that worked" should not depend on
   * them having exported a file first. Keeps the last 10, newest first, and
   * skips writing when nothing actually changed so a reload cannot flush the
   * history out with identical copies. */
  var BACKUPS_KEY = "configBackups";
  function backupConfig(cfg) {
    if (!IS_EXT) return;
    try {
      chrome.storage.local.get(BACKUPS_KEY, function (r) {
        void chrome.runtime.lastError;
        var list = (r && r[BACKUPS_KEY]) || [];
        var json = JSON.stringify(cfg);
        if (list.length && list[0].json === json) return;      // no change
        list.unshift({ at: Date.now(), json: json });
        chrome.storage.local.set(function () {
          var o = {}; o[BACKUPS_KEY] = list.slice(0, 10); return o;
        }());
      });
    } catch (e) {}
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalize(cfg) {
    var base = clone(DEFAULT_CONFIG);
    cfg = cfg || {};
    base.gymName = cfg.gymName || base.gymName;
    base.tvName = typeof cfg.tvName === "string" ? cfg.tvName : base.tvName;
    // Merge saved shortcuts with the built-in ones by id, rather than letting a
    // saved array replace them wholesale.
    //
    // Without this, ANY config saved by an older build permanently shadows new
    // built-in tiles: reloading the extension would restore the old dashboard
    // (no Weekprogramma, no Rooster picker, the stale hardcoded Coachboard id)
    // and no amount of updating the defaults would show through.
    //
    // Rule: built-ins are refreshed from DEFAULT_CONFIG but keep the user's own
    // per-tile choices; shortcuts the user added themselves are preserved as-is.
    if (Array.isArray(cfg.shortcuts)) {
      var savedById = {};
      cfg.shortcuts.forEach(function (s) { if (s && s.id) savedById[s.id] = s; });
      var builtinIds = {};
      base.shortcuts.forEach(function (b) {
        builtinIds[b.id] = true;
        var saved = savedById[b.id];
        if (!saved) return;
        // User-owned fields survive an upgrade; everything else (macro steps,
        // urls, labels) comes from the new build.
        if (typeof saved.selectedRoster === "string" && Array.isArray(b.rosterOptions)
            && b.rosterOptions.indexOf(saved.selectedRoster) >= 0) {
          b.selectedRoster = saved.selectedRoster;
        }
        if (typeof saved.accent === "string") b.accent = saved.accent;
      });
      cfg.shortcuts.forEach(function (s) {
        if (s && s.id && !builtinIds[s.id]) base.shortcuts.push(s); // custom tile
      });
    }
    if (Array.isArray(cfg.classTypes) && cfg.classTypes.length) base.classTypes = cfg.classTypes;
    if (typeof cfg.selectedType === "string") base.selectedType = cfg.selectedType;
    if (cfg.rosterAliases && typeof cfg.rosterAliases === "object") base.rosterAliases = cfg.rosterAliases;
    if (Array.isArray(cfg.rooms) && cfg.rooms.length) base.rooms = cfg.rooms;
    if (typeof cfg.titlebarAutoHide === "boolean") base.titlebarAutoHide = cfg.titlebarAutoHide;
    if (typeof cfg.autoSelectType === "boolean") base.autoSelectType = cfg.autoSelectType;
    if (typeof cfg.selectedRooster === "string") base.selectedRooster = cfg.selectedRooster;
    if (cfg.rosterTypes && typeof cfg.rosterTypes === "object") base.rosterTypes = cfg.rosterTypes;
    if (base.classTypes.indexOf(base.selectedType) < 0) base.selectedType = base.classTypes[0];
    return base;
  }

  var config = loadConfig();
  mirrorConfig(config); // so the titlebar works even before the first save

  // Which room's tab this is. Kept in the URL rather than storage keyed by tab
  // id: a reload, a restart, or a restored session all preserve the query
  // string, whereas a tab id does not survive any of them.
  var ZAAL = (function () {
    try { return new URLSearchParams(location.search).get("zaal") || null; }
    catch (e) { return null; }
  })();

  // ----- Helpers -----
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function openUrl(url) {
    if (!url) { toast("Geen URL ingesteld — open Instellingen"); return; }
    // Navigate THIS tab, not a new one. The trainer cast this tab to the room's
    // TV; a new tab would open somewhere that isn't being cast. The injected
    // titlebar is what gets them back.
    if (IS_EXT) { location.href = url; return; }
    window.open(url, "_blank", "noopener");
  }
  // Words that identify no class on their own. A base of "The" would happily
  // match any tile containing it.
  function normType(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Has the trainer chosen a zaal/lestype by hand in this tab?
  var MANUAL_KEY = "lf.manualPick";
  function manualPick() {
    try { return sessionStorage.getItem(MANUAL_KEY) === "1"; } catch (e) { return false; }
  }
  function markManualPick() {
    try { sessionStorage.setItem(MANUAL_KEY, "1"); } catch (e) {}
  }

  var BASE_STOPWORDS = ["the", "de", "het", "een", "van", "voor", "en", "zaal"];
  function typeBaseOf(type) {
    var first = String(type || "").split(/[\s(\/-]+/)[0] || "";
    if (first.length < 3) return "";                                  // "TRX" is 3, keep it
    if (BASE_STOPWORDS.indexOf(first.toLowerCase()) >= 0) return "";
    return first;
  }

  function buildContext() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return {
      type: config.selectedType,
      contextMode: null, // filled per shortcut below
      // The roster's own name for this class. Falls back to the Dexos name when
      // no alias is configured. This is the PRIMARY search term — searching the
      // Dexos name directly would match the wrong tile where names nest
      // ("Kickboksen" is a substring of "TeenFit kickboksen").
      typeRoster: (config.rosterAliases && config.rosterAliases[config.selectedType]) || config.selectedType,
      // First word of the class type. The Sportbit roster names classes more
      // coarsely than Dexos does, so "Hyrox strength" / "TRX Daluren" have to
      // fall back to "Hyrox" / "TRX" to find a tile at all.
      //
      // Suppressed when that first word carries no identity of its own — "The
      // Outdoor Project - Castricum" would otherwise fall back to "The". Better
      // to stop softly than to match on a filler word.
      typeBase: typeBaseOf(config.selectedType),
      roster: "", // filled per shortcut from its own picker (Rooster tile)
      todayISO: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
      todayDMY: pad(d.getDate()) + pad(d.getMonth() + 1) + d.getFullYear(), // ddmmyyyy, e.g. 19072026 (Dexos block ids)
      dayOfMonth: String(d.getDate()),
      weekday: d.toLocaleDateString("nl-NL", { weekday: "long" }),
      time: pad(d.getHours()) + ":" + pad(d.getMinutes())
    };
  }

  function runMacro(s) {
    showBusy(s.label + " openen…");
    // Goes through runTool, not runMacro, so the tile gets the same
    // "is there actually a class?" probe as the titlebar buttons. runMacro
    // would navigate this tab first and only discover the problem afterwards.
    chrome.runtime.sendMessage(
      // classId travels WITH the click rather than through the config.
      // normalize() rebuilds built-in shortcuts from defaults on every load and
      // only carries a few user fields across, so a class id parked on the
      // shortcut was silently dropped — the background then saw "no class
      // chosen". It is per-day state anyway and has no business in saved config.
      { action: "runTool", tool: s.id, classId: s.selectedClassId || null },
      function (res) {
        // Every path below must drop the cover — an overlay left up after a
        // failure would look like a freeze.
        if (chrome.runtime.lastError) { hideBusy(); toast("Kon de helper niet starten"); return; }
        if (!res) { hideBusy(); toast("Geen antwoord van de helper"); return; }
        if (res.ok) {
          hideBusy();
          toast(res.klas ? "✓ " + res.klas + (res.start ? " " + res.start : "") : "✓ " + s.label + " geopend");
          return;
        }
        hideBusy();
        // No class of this type today: nothing was opened, so explain it
        // properly in a dialog rather than a toast that slides away.
        if (res.noClass) { showNoClass(res.type || config.selectedType, s.label, res.filterName, res.reason); return; }
        // A "soft" stop is not a breakage: the page the trainer needs is already
        // open, there just was not one obvious class to jump to. Show the hint on
        // its own — no step number, no alarm.
        if (res.soft && res.reason) { toast(res.reason); return; }
        // Prefer the engine's specific reason ("geen les van dit type vandaag")
        // over the generic advice — for the built-in macros, re-recording is not
        // the fix, and the reason usually points straight at what to change.
        var why = res.reason || res.error;
        toast("Stap " + (res.failedStep || "?") + " mislukt"
          + (why ? ": " + why : "")
          + (res.label ? " (" + res.label + ")" : ""));
      }
    );
  }

  // Nothing was opened — say why, and make picking another type the obvious
  // next step. Deliberately a dialog, not a toast: a toast that vanishes after
  // 2.6s is the wrong shape for "the thing you asked for does not exist today".
  function showNoClass(type, label, rosterFilter, reason) {
    $("#noClassTitle").textContent = "Geen les gevonden";
    $("#noClassOk").textContent = "Ander lestype kiezen";
    var weekday = new Date().toLocaleDateString("nl-NL", { weekday: "long" });
    var body = $("#noClassBody");
    body.innerHTML =
      // Use the engine's own reason when it gave one. Hard-coding "geen les
      // vandaag" told trainers a class did not exist when the real problem was
      // something else entirely — e.g. no class picked in the dropdown yet.
      '<p class="noclass-lead">' + (reason
        ? escapeHtml(reason)
        : "Er staat vandaag (<b>" + escapeHtml(weekday) + "</b>) geen les van het type <b>" +
          escapeHtml(type) + "</b> in het rooster.") + "</p>" +
      '<p class="help-text">Daarom is <b>' + escapeHtml(label) + '</b> niet geopend — je zou anders op een ' +
      'leeg of verkeerd scherm uitkomen.</p>' +
      // Only one location was visible, so be explicit rather than implying the
      // class does not exist anywhere.
      (rosterFilter
        ? '<p class="help-text help-warn">Let op: het rooster staat nu op <b>' + escapeHtml(rosterFilter) +
          '</b>. Een les in een andere zaal is dan niet zichtbaar. Zet het rooster op ' +
          '<b>Alle roosters</b> om alles mee te nemen.</p>'
        : "") +
      '<p class="help-text">Kies hieronder een ander lestype en probeer het opnieuw.</p>';

    var pick = el("select", { "class": "type-select noclass-select", "aria-label": "Kies een ander lestype" });
    config.classTypes.forEach(function (name) {
      var opt = el("option", { value: name }, escapeHtml(name));
      if (name === config.selectedType) opt.selected = true;
      pick.appendChild(opt);
    });
    pick.addEventListener("change", function () {
      config.selectedType = pick.value;
      saveConfig(config);
      renderAll();
      toast("Lestype: " + pick.value);
    });
    body.appendChild(pick);
    show("#noClassModal");
  }

  // ----- Busy cover -----
  function showBusy(label) {
    var b = $("#busy");
    if (!b) return;
    $("#busyText").textContent = label || "Bezig…";
    b.hidden = false;
  }
  function hideBusy() { var b = $("#busy"); if (b) b.hidden = true; }

  // ----- Nu / Hierna -----
  //
  // Turns the dashboard into something worth leaving on screen: the trainer can
  // see at a glance what is running and what is next, without opening anything.
  var dayCache = null;

  function refreshDayInfo(cb) {
    if (!IS_EXT) { if (cb) cb(null); return; }
    try {
      chrome.runtime.sendMessage({
        action: "dayInfo",
        type: config.selectedType,
        rooster: config.selectedRooster
      }, function (res) {
        if (chrome.runtime.lastError) { if (cb) cb(null); return; }
        dayCache = res && res.ok ? res : null;
        renderRoosterSelect();  // the live zaal list may have just arrived
        renderTypeSelect();     // …and with it, which types that zaal runs
        renderNowNext();
        renderTiles();          // the "Nu bezig" tile depends on this too
        if (cb) cb(dayCache);
      });
    } catch (e) { if (cb) cb(null); }
  }

  function renderNowNext() {
    var box = $("#nowNext");
    if (!box) return;
    if (!IS_EXT || !dayCache) { box.hidden = true; return; }
    var ft = dayCache.forType;
    box.hidden = false;
    box.innerHTML = "";

    var lead = el("div", { "class": "nn-lead" },
      '<span class="nn-type">' + escapeHtml(config.selectedType) + "</span>");
    box.appendChild(lead);

    function slot(kind, ev) {
      var d = el("div", { "class": "nn-slot nn-" + kind });
      if (!ev) {
        d.innerHTML = '<span class="nn-k">' + (kind === "now" ? "Nu" : "Hierna") + "</span>" +
                      '<span class="nn-empty">—</span>';
        return d;
      }
      d.innerHTML = '<span class="nn-k">' + (kind === "now" ? "Nu" : "Hierna") + "</span>" +
                    '<span class="nn-t">' + escapeHtml(ev.start) + "</span>" +
                    '<span class="nn-n">' + escapeHtml(ev.titel) + "</span>" +
                    (ev.ruimte ? '<span class="nn-r">' + escapeHtml(ev.ruimte) + "</span>" : "");
      d.classList.add("nn-clickable");
      d.addEventListener("click", function () { openClass(ev); });
      return d;
    }

    // Nu / Hierna describe the ROOM, not the selected type.
    //
    // These used to show the current and next class of the selected type only,
    // so after a CrossFit class "Hierna" skipped the HYROX that actually
    // follows and jumped to the next CrossFit — or showed nothing. A trainer
    // reading this strip wants to know what is happening in their zaal next,
    // whatever it is. The zaal filter still applies, so nothing from upstairs
    // appears.
    var nowEv = dayCache.anyCurrent;
    var nextEv = dayCache.anyNext;
    if (!nowEv && !nextEv) {
      box.appendChild(el("div", { "class": "nn-none" },
        "Vandaag staat er niets meer in dit rooster."));
    } else {
      box.appendChild(slot("now", nowEv));
      box.appendChild(slot("next", nextEv));
    }
    // Still tell them where the selected type sits, if it runs today at all.
    if (ft && ft.count && ft.next) {
      box.appendChild(el("div", { "class": "nn-type-hint" },
        "Volgende " + escapeHtml(config.selectedType) + ": " + escapeHtml(ft.next.start)));
    }

    if (dayCache.filterName) {
      box.appendChild(el("div", { "class": "nn-warn" },
        "Rooster staat op " + escapeHtml(dayCache.filterName)));
    }
  }

  function openClass(ev) {
    if (!ev || !IS_EXT) return;
    showBusy(ev.titel + " " + ev.start + " openen…");
    chrome.runtime.sendMessage({ action: "openClass", id: ev.id }, function () {
      void chrome.runtime.lastError;
      hideBusy();
    });
  }

  /* ---- Feedback (Web3Forms) ----
   * A trainer who hits something odd should be able to say so from the screen
   * they hit it on, rather than remembering to mention it later. */
  var WEB3FORMS_KEY = "dce1a844-e56d-4064-9ad8-cb95b79dc9ad";

  function openFeedback() {
    var body = $("#feedbackBody");
    body.innerHTML =
      '<p class="help-text">Werkt er iets niet, of mis je iets? Laat het hier achter — ' +
      "het komt rechtstreeks bij Koen terecht.</p>";

    // Name is required: without it a report cannot be followed up, and in a gym
    // with several trainers "het werkt niet" from nobody in particular is not
    // actionable.
    var nameWrap = el("label", { "class": "set-field" });
    nameWrap.appendChild(el("span", null, 'Je naam <span class="req">*</span>'));
    var nameIn = el("input", { type: "text", id: "fbName", autocomplete: "name",
                               placeholder: "Bijv. Jan Jansen" });
    nameWrap.appendChild(nameIn);
    body.appendChild(nameWrap);

    var mailWrap = el("label", { "class": "set-field" });
    mailWrap.appendChild(el("span", null, 'E-mailadres <span class="opt">(optioneel)</span>'));
    var mailIn = el("input", { type: "email", id: "fbMail", autocomplete: "email",
                               placeholder: "Alleen als je antwoord wilt" });
    mailWrap.appendChild(mailIn);
    body.appendChild(mailWrap);

    var msgWrap = el("label", { "class": "set-field" });
    msgWrap.appendChild(el("span", null, 'Je bericht <span class="req">*</span>'));
    var ta = el("textarea", { "class": "types-textarea", id: "fbMsg", rows: "6",
                              placeholder: "Wat ging er mis, of wat zou je willen?" });
    msgWrap.appendChild(ta);
    body.appendChild(msgWrap);

    body.appendChild(el("div", { "class": "fb-error", id: "fbError" }, ""));

    // Context the trainer should not have to type out themselves.
    body.appendChild(el("p", { "class": "help-text" },
      "Automatisch meegestuurd: zaal, rooster, lestype en versie."));
    show("#feedbackModal");
    setTimeout(function () { nameIn.focus(); }, 50);
  }

  function fbError(msg, focusId) {
    var e = $("#fbError");
    if (e) e.textContent = msg || "";
    if (focusId && $("#" + focusId)) $("#" + focusId).focus();
  }

  function sendFeedback() {
    var who = ($("#fbName") && $("#fbName").value || "").trim();
    var mail = ($("#fbMail") && $("#fbMail").value || "").trim();
    var msg = ($("#fbMsg") && $("#fbMsg").value || "").trim();

    if (!who) { fbError("Vul je naam in, zodat we weten wie het meldt.", "fbName"); return; }
    if (!msg) { fbError("Vul een bericht in.", "fbMsg"); return; }
    // Only validated when given — the field is optional and a typo should not
    // silently produce an unreplyable message.
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      fbError("Dat e-mailadres lijkt niet te kloppen.", "fbMail"); return;
    }
    fbError("");

    var btn = $("#btnFeedbackSend");
    btn.disabled = true;
    btn.textContent = "Versturen…";

    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: "LieftingFit Dashboard — feedback van " + who,
        from_name: who,
        // Web3Forms uses `email` as the reply-to when present.
        email: mail || undefined,
        message: msg,
        zaal: ZAAL || "—",
        rooster: config.selectedRooster || "—",
        lestype: config.selectedType || "—",
        versie: IS_EXT ? chrome.runtime.getManifest().version : "web"
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.success) {
          hide("#feedbackModal");
          toast("Bedankt! Je feedback is verstuurd.");
        } else {
          toast("Versturen mislukt — probeer het later opnieuw");
        }
      })
      .catch(function () { toast("Versturen mislukt — geen verbinding?"); })
      .then(function () { btn.disabled = false; btn.textContent = "Versturen"; });
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ----- Render dashboard -----
  function renderBindings() {
    document.querySelectorAll("[data-bind]").forEach(function (node) {
      var key = node.getAttribute("data-bind");
      if (config[key]) node.textContent = config[key];
    });
    // Lead with the zaal so the browser tab strip is readable at a glance —
    // three identical "LieftingFit · Trainer Dashboard" tabs are useless when
    // each one drives a different TV.
    document.title = ZAAL
      ? "Zaal " + ZAAL + " · " + config.gymName
      : config.gymName + " · Trainer Dashboard";
  }

  function renderTiles() {
    var grid = $("#grid");
    grid.innerHTML = "";
    config.shortcuts.forEach(function (s, i) {
      var accent = ACCENTS.indexOf(s.accent) >= 0 ? s.accent : "blue";
      var hasMacro = !!(s.macro && Array.isArray(s.macro.steps) && s.macro.steps.length);
      var fallbackUrl = hasMacro ? (s.macro.startUrl || s.url) : s.url;
      // ANY tile carrying a dropdown must not be an <a>: clicking a <select>
      // inside a link activates the link, so the dropdown never opens. The
      // Leden-toevoegen tile was missed here first time round, which is why its
      // picker jumped straight to Dexos.
      var hasRosterPickerEarly = (Array.isArray(s.rosterOptions) && s.rosterOptions.length) ||
                                 (s.classPicker && IS_EXT);
      var attrs = { "class": "tile acc-" + accent };
      // A tile with its own picker must NOT be an <a>. A <select> inside an
      // anchor cannot be used: the browser activates the link on click, so the
      // dropdown never opens and the trainer is thrown straight to the Rooster.
      // stopPropagation does not help — link activation is the browser's default
      // action, not a bubbling listener. So those tiles become a <div> whose
      // body is clickable, with the select as a sibling of the clickable part.
      if (!hasRosterPickerEarly && fallbackUrl) {
        attrs.href = fallbackUrl;
        if (!IS_EXT) { attrs.target = "_blank"; attrs.rel = "noopener"; }
      } else if (!hasRosterPickerEarly) {
        attrs.href = "#";
      }
      var tile = el(hasRosterPickerEarly ? "div" : "a", attrs);
      var badge = "";
      if (hasMacro) badge = '<span class="tile-cast tile-macro">' + ICONS.bolt + " 1-klik dieplink</span>";
      else if (s.cast) badge = '<span class="tile-cast">' + ICONS.cast + " Casten naar TV</span>";
      var contextChip = "";
      if (s.id === "nubezig") {
        // Show the class this button would actually open, so it is never a
        // leap of faith.
        var t0 = dayCache && (dayCache.anyCurrent || dayCache.anyNext);
        contextChip = '<span class="tile-context">' +
          (t0 ? escapeHtml(t0.titel) + " · " + escapeHtml(t0.start) : "Niets gevonden") + "</span>";
      }
      else if (s.contextMode === "today") contextChip = '<span class="tile-context">Vandaag · ' + escapeHtml(config.selectedType) + "</span>";
      else if (s.contextMode === "week") contextChip = '<span class="tile-context">Deze week · ' + escapeHtml(config.selectedType) + "</span>";
      var hasRosterPicker = Array.isArray(s.rosterOptions) && s.rosterOptions.length;
      tile.innerHTML =
        '<div class="tile-top">' +
          '<span class="tile-icon">' + (ICONS[s.icon] || ICONS.link) + "</span>" +
          (i < 9 ? '<span class="tile-num">' + (i + 1) + "</span>" : "") +
        "</div>" +
        '<div class="tile-body">' +
          '<div class="tile-label">' + escapeHtml(s.label) + "</div>" +
          (s.sub ? '<div class="tile-sub">' + escapeHtml(s.sub) + "</div>" : "") +
          contextChip +
          badge +
        "</div>";

      function activate(e) {
        // "Nu bezig" resolves against live roster data rather than a macro.
        if (s.id === "nubezig" && IS_EXT) {
          if (e) e.preventDefault();
          var target = dayCache && (dayCache.anyCurrent || dayCache.anyNext);
          if (target) { openClass(target); return; }
          refreshDayInfo(function (d) {
            var t = d && (d.anyCurrent || d.anyNext);
            if (t) openClass(t);
            else toast("Er draait nu niets en er volgt vandaag niets meer.");
          });
          return;
        }
        if (hasMacro && IS_EXT) { if (e) e.preventDefault(); runMacro(s); return; }
        if (hasMacro && !IS_EXT) { toast("Installeer de Chrome-extensie voor de 1-klik dieplink — nu open ik de startpagina"); return; }
        if (fallbackUrl && IS_EXT) { if (e) e.preventDefault(); openUrl(fallbackUrl); return; }
        if (!fallbackUrl) { if (e) e.preventDefault(); toast("Geen URL ingesteld — open Instellingen"); }
      }

      // "Leden toevoegen" carries a picker of TODAY's classes of the selected
      // type — same look as the Rooster picker. Times come from the live roster,
      // so a class that is not on today's schedule can never be offered.
      if (s.classPicker && IS_EXT) {
        var classes = (dayCache && dayCache.forType && dayCache.forType.all) || [];
        var cp = el("select", { "class": "tile-roster", "aria-label": "Kies les" });
        if (!classes.length) {
          cp.appendChild(el("option", { value: "" }, "Geen les vandaag"));
          cp.disabled = true;
        } else {
          classes.forEach(function (c) {
            var label = c.titel + " · " + c.start + (c.eind ? "–" + c.eind : "");
            var opt = el("option", { value: String(c.id) }, escapeHtml(label));
            if (String(s.selectedClassId) === String(c.id)) opt.selected = true;
            cp.appendChild(opt);
          });
          if (!s.selectedClassId || !classes.some(function (c) { return String(c.id) === String(s.selectedClassId); })) {
            // Default to what is running now, else the next one.
            var pref = (dayCache.forType.current || dayCache.forType.next || classes[0]);
            s.selectedClassId = pref.id;
            cp.value = String(pref.id);
          }
        }
        cp.addEventListener("change", function (e) {
          e.stopPropagation();
          s.selectedClassId = cp.value;
          saveConfig(config);
          toast("Les gekozen: " + cp.options[cp.selectedIndex].textContent);
        });
        ["click", "mousedown", "keydown"].forEach(function (evt) {
          cp.addEventListener(evt, function (e) { e.stopPropagation(); });
        });
        // Listen on the WHOLE tile, not just .tile-top/.tile-body. Those two
        // leave the tile's padding and the gap between them dead, which is why
        // the button appeared to need several clicks. The tile is a <div> here,
        // so there is no link to suppress — stopping propagation on the select
        // is enough to keep the dropdown usable.
        tile.classList.add("tile-has-picker");
        tile.addEventListener("click", function (e) {
          if (e.target === cp || cp.contains(e.target)) return;
          activate(e);
        });
        tile.appendChild(cp);
        grid.appendChild(tile);
        return;                     // handled — skip the generic wiring below
      }

      // The Rooster tile carries its own picker instead of the {{TYPE}} chip.
      // Only the tile BODY opens the roster; the picker is a sibling, so using
      // it never triggers navigation.
      if (hasRosterPicker) {
        var pick = el("select", { "class": "tile-roster", "aria-label": "Kies rooster" });
        s.rosterOptions.forEach(function (name) {
          var opt = el("option", { value: name }, escapeHtml(name));
          if (name === s.selectedRoster) opt.selected = true;
          pick.appendChild(opt);
        });
        pick.addEventListener("change", function (e) {
          e.stopPropagation();
          s.selectedRoster = pick.value;
          saveConfig(config);
          toast("Rooster ingesteld: " + pick.value);
        });
        // Belt and braces if the markup is ever nested again.
        ["click", "mousedown", "keydown"].forEach(function (evt) {
          pick.addEventListener(evt, function (e) { e.stopPropagation(); });
        });

        // Same reasoning as the class picker above: whole tile is the hit area.
        tile.classList.add("tile-has-picker");
        tile.addEventListener("click", function (e) {
          if (e.target === pick || pick.contains(e.target)) return;
          activate(e);
        });
        tile.appendChild(pick);   // sibling of .tile-body, NOT inside it
      } else {
        tile.addEventListener("click", activate);
      }
      grid.appendChild(tile);
    });
  }

  var ROOM_ICONS = { A: "🅰", B: "🅱", C: "🅲" };

  function renderZaalBar() {
    var bar = $("#zaalBar");
    if (!bar) return;
    // Only meaningful inside the extension: opening/focusing a per-room tab
    // needs chrome.tabs, which a plain web page does not have.
    if (!IS_EXT) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = "";

    var label = el("div", { "class": "zaal-label" }, "Zaal");
    bar.appendChild(label);

    (config.rooms || []).forEach(function (z) {
      var b = el("button", {
        "class": "zaal-btn" + (z === ZAAL ? " is-current" : ""),
        "type": "button",
        "title": z === ZAAL ? "Dit is de tab van Zaal " + z : "Open of ga naar de tab van Zaal " + z
      });
      b.innerHTML = '<span class="zaal-ico">' + (ROOM_ICONS[z] || "▪") + '</span>' +
                    '<span class="zaal-name">Zaal ' + escapeHtml(z) + '</span>';
      b.addEventListener("click", function () {
        chrome.runtime.sendMessage({ action: "openRoom", zaal: z }, function (res) {
          if (chrome.runtime.lastError) { toast("Kon de helper niet starten"); return; }
          if (!res || !res.ok) { toast((res && res.error) || "Kon Zaal " + z + " niet openen"); return; }
          toast(res.reused ? "Zaal " + z + " naar voren gehaald" : "Zaal " + z + " geopend — cast deze tab één keer naar de TV");
        });
      });
      bar.appendChild(b);
    });

    var hint = el("div", { "class": "zaal-hint" },
      ZAAL
        ? "Deze tab is <b>Zaal " + escapeHtml(ZAAL) + "</b>. Cast hem één keer; alles wat je hierna opent blijft op die TV."
        : "Kies een zaal — elke zaal krijgt een eigen tab die je één keer naar zijn TV cast.");
    bar.appendChild(hint);
  }

  function renderRoomBadge() {
    var badge = $("#roomBadge");
    if (!badge) return;
    if (!ZAAL) { badge.hidden = true; return; }
    badge.hidden = false;
    badge.textContent = (ROOM_ICONS[ZAAL] || "▪") + " Zaal " + ZAAL;
  }

  // Step 1 — which zaal this dashboard is for.
  function renderRoosterSelect() {
    var sel = $("#roosterSelect");
    if (!sel) return;
    var names = ["Alle roosters"];
    // Prefer the live list; fall back to whatever the config knows so the
    // picker is never empty before the roster API answers.
    var live = (dayCache && dayCache.rosters) || [];
    if (live.length) live.forEach(function (r) { if (names.indexOf(r.naam) < 0) names.push(r.naam); });
    else Object.keys(config.rosterTypes || {}).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });

    if (names.indexOf(config.selectedRooster) < 0) names.push(config.selectedRooster);
    sel.innerHTML = "";
    names.forEach(function (name) {
      var opt = el("option", { value: name }, escapeHtml(name));
      if (name === config.selectedRooster) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // The class types available in the selected zaal. Falls back to the full list
  // for "Alle roosters", or when nothing is known about a zaal yet — better a
  // long list than an empty one.
  // Types belonging to the chosen zaal, and everything not yet assigned to any
  // zaal. The second group is kept reachable (as "Overig") rather than hidden:
  // a class nobody has categorised yet should not become unreachable.
  function typesForCurrentRooster() {
    var r = config.selectedRooster;
    if (!r || /^alle/i.test(r)) return { zaal: config.classTypes, overig: [] };

    var known = (dayCache && dayCache.zaalTypes) || (config.rosterTypes && config.rosterTypes[r]) || [];
    if (!known.length) return { zaal: config.classTypes, overig: [] };

    var set = {};
    known.forEach(function (t) { set[normType(t)] = true; });
    function inZaal(t) {
      if (set[normType(t)]) return true;
      var alias = config.rosterAliases && config.rosterAliases[t];
      return !!(alias && set[normType(alias)]);
    }

    // Assigned to SOME zaal — used to work out what is still uncategorised.
    var assigned = {};
    Object.keys(config.rosterTypes || {}).forEach(function (z) {
      (config.rosterTypes[z] || []).forEach(function (t) { assigned[normType(t)] = true; });
    });

    var zaal = [], overig = [];
    config.classTypes.forEach(function (t) {
      if (inZaal(t)) { zaal.push(t); return; }
      var alias = config.rosterAliases && config.rosterAliases[t];
      var isAssigned = assigned[normType(t)] || (alias && assigned[normType(alias)]);
      if (!isAssigned) overig.push(t);
    });
    if (!zaal.length && !overig.length) return { zaal: config.classTypes, overig: [] };
    return { zaal: zaal, overig: overig };
  }

  // Step 2 — the class type, narrowed to what runs in the chosen zaal.
  function renderTypeSelect() {
    var sel = $("#typeSelect");
    if (!sel) return;
    var groups = typesForCurrentRooster();
    var all = groups.zaal.concat(groups.overig);
    if (all.indexOf(config.selectedType) < 0) {
      config.selectedType = all[0];       // the old pick is not offered here
    }
    sel.innerHTML = "";
    function addOpts(parent, names) {
      names.forEach(function (name) {
        var opt = el("option", { value: name }, escapeHtml(name));
        if (name === config.selectedType) opt.selected = true;
        parent.appendChild(opt);
      });
    }
    if (groups.overig.length && groups.zaal.length) {
      var g1 = el("optgroup", { label: config.selectedRooster });
      addOpts(g1, groups.zaal);
      sel.appendChild(g1);
      var g2 = el("optgroup", { label: "Overig (nog niet ingedeeld)" });
      addOpts(g2, groups.overig);
      sel.appendChild(g2);
    } else {
      addOpts(sel, all);
    }
    var hint = $("#contextHint");
    if (hint) {
      hint.textContent = /^alle/i.test(config.selectedRooster || "")
        ? "De knoppen hieronder werken op de les van dit type."
        : "Alleen lessen uit " + config.selectedRooster + ".";
    }
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ----- Clock -----
  function tickClock() {
    var now = new Date();
    $("#clockTime").textContent = now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    $("#clockDate").textContent = now.toLocaleDateString("nl-NL", {
      weekday: "long", day: "numeric", month: "long"
    });
  }

  // ----- Fullscreen -----
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  // ----- Settings modal -----
  // Expertmodus is per visit to Settings, never remembered — the warning should
  // be seen every time, not dismissed once and forgotten.
  var expertUnlocked = false;

  function openSettings() {
    expertUnlocked = false;
    buildSettingsForm();
    show("#settingsModal");
  }

  function restoreBackup() {
    if (!IS_EXT) { toast("Alleen beschikbaar in de extensie"); return; }
    chrome.storage.local.get(BACKUPS_KEY, function (r) {
      void chrome.runtime.lastError;
      var list = (r && r[BACKUPS_KEY]) || [];
      // [0] is the config as it is now, so the first meaningful restore is [1].
      var prev = list[1] || list[0];
      if (!prev) { toast("Nog geen back-up beschikbaar"); return; }
      var when = new Date(prev.at).toLocaleString("nl-NL");
      if (!confirm("Instellingen terugzetten naar de versie van " + when + "?")) return;
      try {
        config = normalize(JSON.parse(prev.json));
        saveConfig(config);
        buildSettingsForm();
        renderAll();
        toast("Back-up van " + when + " teruggezet");
      } catch (e) { toast("Back-up kon niet worden gelezen"); }
    });
  }

  /* ---- Updates ----
   * The extension is loaded unpacked, so Chrome will never update it. Compare
   * the manifest version against the one on GitHub and tell the trainer to pull
   * — that is the honest limit of what an unpacked extension can do for itself.
   */
  var VERSION_URL =
    "https://raw.githubusercontent.com/Koen-io/LieftingFit-Dashboard-App/main/manifest.json";

  function cmpVersions(a, b) {
    var pa = String(a).split("."), pb = String(b).split(".");
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i] || "0", 10), y = parseInt(pb[i] || "0", 10);
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  // The extension cannot write into the repo folder, so its own checks are
  // recorded here. Settings shows whichever ran most recently — the nightly
  // script or this — which is why the line used to look frozen after pressing
  // the button: only the script ever wrote a timestamp.
  var LASTCHECK_KEY = "lastUpdateCheck";
  function recordCheck(result) {
    if (!IS_EXT) return;
    var stamp = new Date().toLocaleString("nl-NL",
      { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    try {
      chrome.storage.local.set({ lastUpdateCheck: { checked: stamp, result: result } }, function () {
        void chrome.runtime.lastError;
        renderUpdateStatus();
      });
    } catch (e) {}
  }

  // Shows whichever check ran most recently: the nightly script (which writes
  // .update-status into the folder) or the in-app button (chrome.storage).
  function renderUpdateStatus() {
    var n = $("#updStatus");
    if (!n) return;
    if (!IS_EXT) { n.textContent = ""; return; }

    function paint(scriptSt, appSt) {
      var lines = [];
      if (appSt && appSt.checked) lines.push("Laatst gecontroleerd: " + appSt.checked + " — " + (appSt.result || ""));
      if (scriptSt && scriptSt.checked) lines.push("Automatische update: " + scriptSt.checked + " — " + (scriptSt.result || ""));
      else lines.push("Automatische update: nog niet gedraaid (installeer tools/install-updater.command).");
      n.innerHTML = lines.map(escapeHtml).join("<br>");
    }

    chrome.storage.local.get("lastUpdateCheck", function (r) {
      void chrome.runtime.lastError;
      var appSt = r && r.lastUpdateCheck;
      fetch(chrome.runtime.getURL(".update-status"), { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (scriptSt) { paint(scriptSt, appSt); })
        .catch(function () { paint(null, appSt); });
    });
  }

  function checkForUpdates(manual) {
    if (!IS_EXT) { if (manual) toast("Alleen beschikbaar in de extensie"); return; }
    var mine = chrome.runtime.getManifest().version;   // version Chrome LOADED
    if (manual) toast("Zoeken naar updates…");

    // First: has the nightly script already pulled a newer version onto this
    // laptop? The extension can read its own folder, so the manifest ON DISK
    // tells us — and if it differs from the loaded one, the update is here and
    // only needs Chrome to restart. That is the common case once the updater
    // is installed, and it needs no network at all.
    fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (disk) {
        // A newer version is already on disk — APPLY it. chrome.runtime.reload()
        // restarts the extension, which re-reads every file from the folder.
        // No manual reload, no Chrome restart: the update simply takes effect.
        if (disk && disk.version && cmpVersions(disk.version, mine) > 0) {
          applyUpdate(disk.version);
          return null;                                  // stop here
        }
        return fetch(VERSION_URL, { cache: "no-store" }).then(function (r) { return r.json(); });
      })
      .then(function (j) {
        if (!j) return;                                 // already handled above
        var theirs = j.version;
        if (!theirs) throw new Error("geen versie");
        if (cmpVersions(theirs, mine) > 0) {
          // GitHub is ahead but this laptop has not pulled yet. The updater
          // runs every 5 minutes, so this resolves itself; say so plainly
          // instead of sending the trainer to Terminal.
          recordCheck("versie " + theirs + " wordt opgehaald");
          showUpdateComing(mine, theirs);
        } else {
          recordCheck("actueel (" + mine + ")");
          if (manual) toast("Je hebt de nieuwste versie (" + mine + ")");
        }
      })
      .catch(function () {
        recordCheck("controle mislukt");
        if (manual) toast("Kon niet controleren op updates");
      });
  }

  /* Apply an update that is already on disk.
   *
   * chrome.runtime.reload() restarts the extension and re-reads its files, so
   * an unpacked extension CAN update itself in place — no chrome://extensions,
   * no Chrome restart. The dashboard tab reloads itself a moment later so the
   * trainer lands on the new version rather than a dead page.
   */
  function applyUpdate(newVersion) {
    recordCheck("bijgewerkt naar " + newVersion);
    showBusy("Update naar " + newVersion + " wordt toegepast…");
    // chrome.runtime.reload() also tears down this page, so the tab would be
    // left on a dead chrome-extension:// URL. Leave a note in storage.local
    // (which survives the restart) and the service worker reopens this exact
    // dashboard — same zaal — as soon as it comes back up.
    try {
      chrome.storage.local.set({
        pendingReopen: { url: location.href, at: Date.now() }
      });
    } catch (e) {}
    setTimeout(function () {
      try { chrome.runtime.reload(); } catch (e) {
        hideBusy();
        toast("Bijwerken mislukt — herstart Chrome");
      }
    }, 700);
  }

  // The update is already on the laptop; Chrome just has not loaded it.
  function showRestartNeeded(mine, ready) {
    $("#noClassTitle").textContent = "Update klaar";
    $("#noClassOk").textContent = "Begrepen";
    $("#noClassBody").innerHTML =
      '<p class="noclass-lead">Versie <b>' + escapeHtml(ready) + "</b> staat klaar op deze laptop " +
      "(je gebruikt nu " + escapeHtml(mine) + ").</p>" +
      '<p class="help-text">Sluit Chrome helemaal af en start hem opnieuw — dan is de ' +
      "update actief. Verder hoef je niets te doen.</p>" +
      '<p class="help-text">Staat er een les op de TV? Doe het dan na afloop; ' +
      "het dashboard blijft gewoon werken.</p>";
    show("#noClassModal");
  }

  // GitHub is ahead of this laptop. The updater pulls every 5 minutes and the
  // dashboard applies it by itself, so this is information, not a task list.
  function showUpdateComing(mine, theirs) {
    $("#noClassTitle").textContent = "Update onderweg";
    $("#noClassOk").textContent = "Begrepen";
    $("#noClassBody").innerHTML =
      '<p class="noclass-lead">Versie <b>' + escapeHtml(theirs) + "</b> staat klaar op GitHub " +
      "(jij gebruikt " + escapeHtml(mine) + ").</p>" +
      '<p class="help-text">Deze laptop haalt hem automatisch op — meestal binnen ' +
      "vijf minuten. Daarna wordt de update vanzelf toegepast; je hoeft niets te doen.</p>" +
      '<p class="help-text">Haast? Klik straks nog een keer op <b>Controleer op updates</b>.</p>';
    show("#noClassModal");
  }

  function buildSettingsForm() {
    var body = $("#settingsBody");
    body.innerHTML = "";

    /* Two audiences, one screen.
     *
     * A trainer needs three things: the two toggles and the update button.
     * Everything else — names, zalen, class-type lists, shortcut internals,
     * stored credentials — can break the dashboard if changed carelessly, and
     * is only ever touched by Koen. So the default view is deliberately small,
     * and the rest sits behind one confirmed door. */

    // ---------- Always visible ----------
    var basic = el("div", { "class": "set-section" }, "<h3>Weergave</h3>");

    var ahWrap = el("label", { "class": "set-check" });
    var ah = el("input", { type: "checkbox" });
    ah.checked = !!config.titlebarAutoHide;
    ah.addEventListener("change", function () { config.titlebarAutoHide = ah.checked; });
    ahWrap.appendChild(ah);
    ahWrap.appendChild(el("span", null,
      "Menubalk automatisch verbergen (schuift weg; kom met de muis naar de bovenrand). " +
      "De balk staat óók op de TV, dus dit houdt het Coachboard vrij."));
    basic.appendChild(ahWrap);

    var asWrap = el("label", { "class": "set-check" });
    var as = el("input", { type: "checkbox" });
    as.checked = !!config.autoSelectType;
    as.addEventListener("change", function () { config.autoSelectType = as.checked; });
    asWrap.appendChild(as);
    asWrap.appendChild(el("span", null,
      "Lestype automatisch kiezen bij openen — zet het actieve lestype op de les die " +
      "nu draait of zo begint. Handig als je vlak voor je les binnenkomt."));
    basic.appendChild(asWrap);
    body.appendChild(basic);

    // Updates — the one maintenance action a trainer may legitimately need.
    var up = el("div", { "class": "set-section" }, "<h3>Onderhoud</h3>");
    up.appendChild(el("div", { "class": "help-text" },
      "Versie " + escapeHtml(IS_EXT ? chrome.runtime.getManifest().version : "—")));
    // Proof the nightly updater is alive. It is silent when there is nothing to
    // do, which reads exactly like "broken" — so show when it last looked.
    up.appendChild(el("div", { "class": "help-text", id: "updStatus" }, ""));
    renderUpdateStatus();

    var upRow = el("div", { "class": "set-row-btns" });
    var btnUpd = el("button", { "class": "btn btn-ghost", "type": "button" }, "Controleer op updates");
    btnUpd.addEventListener("click", function () { checkForUpdates(true); });
    upRow.appendChild(btnUpd);
    up.appendChild(upRow);
    body.appendChild(up);

    // ---------- Behind the door ----------
    if (!expertUnlocked) {
      var gate = el("div", { "class": "set-section" });
      gate.appendChild(el("p", { "class": "help-text" },
        "Alle overige instellingen (zalen, lestypes, knoppen, inloggegevens) staan " +
        "onder geavanceerde instellingen. Die hoef je normaal niet aan te raken."));
      var openExpert = el("button", { "class": "btn btn-ghost", "type": "button" },
        "Geavanceerde instellingen");
      openExpert.addEventListener("click", function () { show("#expertModal"); });
      gate.appendChild(openExpert);
      body.appendChild(gate);
      return;                        // nothing below is built for trainers
    }

    body.appendChild(el("div", { "class": "set-section" },
      '<p class="help-text help-warn">⚠️ Geavanceerde instellingen actief. ' +
      "Wijzigingen hieronder kunnen het dashboard onbruikbaar maken. " +
      "Er is automatisch een back-up bewaard.</p>"));

    // General
    var gen = el("div", { "class": "set-section" }, "<h3>Algemeen</h3>");
    gen.appendChild(fieldInput("Naam sportschool", "gymName", config.gymName));
    gen.appendChild(fieldInput("Naam TV / Chromecast (optioneel)", "tvName", config.tvName));
    body.appendChild(gen);

    // Rooms
    var rm = el("div", { "class": "set-section" }, "<h3>Zalen</h3>");
    rm.appendChild(el("p", { "class": "help-text" },
      "Eén zaal per regel. Elke zaal krijgt een eigen Chrome-tab die je één keer " +
      "naar de TV van die zaal cast — Chrome cast een hele tab, dus meerdere TV's " +
      "met verschillende beelden kan alleen zó."));
    var rta = el("textarea", { "class": "types-textarea", rows: "3", spellcheck: "false" });
    rta.value = (config.rooms || []).join("\n");
    rta.addEventListener("input", function () {
      config.rooms = rta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    });
    rm.appendChild(rta);
    body.appendChild(rm);

    // Shortcuts
    var sc = el("div", { "class": "set-section" }, "<h3>Snelkoppelingen</h3>");
    var scList = el("div", { id: "scList" });
    config.shortcuts.forEach(function (s, i) { scList.appendChild(shortcutCard(s, i)); });
    sc.appendChild(scList);
    var addSc = el("button", { "class": "add-row", "type": "button" }, "+ Snelkoppeling toevoegen");
    addSc.addEventListener("click", function () {
      config.shortcuts.push({ id: "custom" + Date.now(), label: "Nieuwe knop", sub: "", icon: "link", accent: ACCENTS[config.shortcuts.length % ACCENTS.length], cast: false, url: "" });
      buildSettingsForm();
    });
    sc.appendChild(addSc);
    body.appendChild(sc);

    // Back-up restore lives with the advanced settings — it only makes sense
    // next to the things that can break.
    var bk = el("div", { "class": "set-section" }, "<h3>Back-up</h3>");
    var bkRow = el("div", { "class": "set-row-btns" });
    var btnRestore = el("button", { "class": "btn btn-ghost", "type": "button" }, "Herstel back-up");
    btnRestore.addEventListener("click", restoreBackup);
    bkRow.appendChild(btnRestore);
    bk.appendChild(bkRow);
    body.appendChild(bk);

    // Which classes belong to which zaal — the list that narrows step 2.
    var rt = el("div", { "class": "set-section" }, "<h3>Lestypes per zaal</h3>");
    rt.appendChild(el("p", { "class": "help-text" },
      "Bepaalt welke lestypes je kunt kiezen per rooster. De extensie vult dit " +
      "zelf aan zodra ze een zaal in Sportbit ziet — hier kun je het bijsturen. " +
      "Eén lestype per regel."));
    var zaalPick = el("select", { "class": "type-select" });
    var zaalNames = Object.keys(config.rosterTypes || {});
    (dayCache && dayCache.rosters || []).forEach(function (r) {
      if (zaalNames.indexOf(r.naam) < 0) zaalNames.push(r.naam);
    });
    zaalNames.forEach(function (n) { zaalPick.appendChild(el("option", { value: n }, escapeHtml(n))); });
    rt.appendChild(zaalPick);
    var zaalTa = el("textarea", { "class": "types-textarea", rows: "7", spellcheck: "false" });
    function loadZaal() {
      zaalTa.value = ((config.rosterTypes || {})[zaalPick.value] || []).join("\n");
    }
    zaalPick.addEventListener("change", loadZaal);
    zaalTa.addEventListener("input", function () {
      if (!config.rosterTypes) config.rosterTypes = {};
      config.rosterTypes[zaalPick.value] = zaalTa.value.split("\n")
        .map(function (s) { return s.trim(); }).filter(Boolean);
    });
    loadZaal();
    rt.appendChild(zaalTa);
    body.appendChild(rt);

    // Auto-login. Deliberately NOT part of `config`: it is stored under its own
    // chrome.storage.local key so "Exporteer config" can never write the
    // password into a file that gets moved between devices or shared.
    if (IS_EXT) {
      var lg = el("div", { "class": "set-section" }, "<h3>Automatisch inloggen</h3>");
      lg.appendChild(el("p", { "class": "help-text" },
        "Eén Sportbit-login geldt voor álle knoppen (Dexos hoort bij hetzelfde account). " +
        "Vul je gegevens hier in en de extensie logt zelf in zodra een knop op het inlogscherm uitkomt."));
      lg.appendChild(el("p", { "class": "help-text help-warn" },
        "⚠ Let op: dit wachtwoord wordt <b>onversleuteld</b> op deze laptop bewaard en geeft toegang " +
        "tot de ledenadministratie. Gebruik dit alleen op een gym-laptop waar je bij kunt, en wis het " +
        "als de laptop weggaat. Het staat niet in de geëxporteerde configuratie."));

      var uWrap = el("label", { "class": "set-field" });
      uWrap.appendChild(el("span", null, "Gebruikersnaam / e-mail"));
      var uIn = el("input", { type: "text", autocomplete: "off", spellcheck: "false" });
      uWrap.appendChild(uIn);
      lg.appendChild(uWrap);

      var pWrap = el("label", { "class": "set-field" });
      pWrap.appendChild(el("span", null, "Wachtwoord"));
      var pIn = el("input", { type: "password", autocomplete: "new-password" });
      pWrap.appendChild(pIn);
      lg.appendChild(pWrap);

      var lgStatus = el("div", { "class": "help-text" }, "");
      lg.appendChild(lgStatus);

      // Load what is stored (password shown blank; typing replaces it).
      chrome.storage.local.get("credentials", function (r) {
        var c = r && r.credentials;
        if (c && c.user) {
          uIn.value = c.user;
          lgStatus.innerHTML = "Opgeslagen voor <b>" + escapeHtml(c.user) + "</b>. Laat het wachtwoordveld leeg om het te behouden.";
        } else {
          lgStatus.textContent = "Nog niets opgeslagen — automatisch inloggen staat uit.";
        }
      });

      var lgRow = el("div", { "class": "set-row-btns" });
      var lgSave = el("button", { "class": "btn btn-ghost", "type": "button" }, "Inloggegevens opslaan");
      lgSave.addEventListener("click", function () {
        var user = uIn.value.trim();
        if (!user) { lgStatus.textContent = "Vul eerst een gebruikersnaam in."; return; }
        chrome.storage.local.get("credentials", function (r) {
          var prev = (r && r.credentials) || {};
          var pass = pIn.value || prev.pass || "";
          if (!pass) { lgStatus.textContent = "Vul ook een wachtwoord in."; return; }
          chrome.storage.local.set({ credentials: { user: user, pass: pass } }, function () {
            pIn.value = "";
            lgStatus.innerHTML = "Opgeslagen voor <b>" + escapeHtml(user) + "</b>.";
            toast("Inloggegevens opgeslagen");
          });
        });
      });
      var lgClear = el("button", { "class": "btn btn-ghost btn-danger", "type": "button" }, "Wis inloggegevens");
      lgClear.addEventListener("click", function () {
        chrome.storage.local.remove("credentials", function () {
          uIn.value = ""; pIn.value = "";
          lgStatus.textContent = "Gewist — automatisch inloggen staat uit.";
          toast("Inloggegevens gewist");
        });
      });
      lgRow.appendChild(lgSave);
      lgRow.appendChild(lgClear);
      lg.appendChild(lgRow);
      body.appendChild(lg);
    }

    // Class types (the dropdown on the main page)
    var lt = el("div", { "class": "set-section" }, "<h3>Lestypes (dropdown hoofdscherm)</h3>");
    lt.appendChild(el("p", { "class": "help-text" },
      "Eén lestype per regel. Dit vult de dropdown op het hoofdscherm; het gekozen type stuurt de context-knoppen aan."));
    var ta = el("textarea", { "class": "types-textarea", rows: "8", spellcheck: "false" });
    ta.value = config.classTypes.join("\n");
    ta.addEventListener("input", function () {
      config.classTypes = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    });
    lt.appendChild(ta);
    body.appendChild(lt);
  }

  function fieldInput(label, key, value) {
    var f = el("div", { "class": "field" });
    f.appendChild(el("label", null, escapeHtml(label)));
    var inp = el("input", { type: "text", value: value == null ? "" : value });
    inp.addEventListener("input", function () { config[key] = inp.value; });
    f.appendChild(inp);
    return f;
  }

  function shortcutCard(s, i) {
    var card = el("div", { "class": "row-card" });
    var head = el("div", { "class": "row-head" });
    head.appendChild(el("strong", null, escapeHtml(s.label || "Knop")));
    var del = el("button", { "class": "mini-btn", "type": "button" }, "Verwijder");
    del.addEventListener("click", function () { config.shortcuts.splice(i, 1); buildSettingsForm(); });
    head.appendChild(del);
    card.appendChild(head);

    var grid = el("div", { "class": "row-grid" });
    grid.appendChild(bindField("Label", s, "label"));
    grid.appendChild(bindField("Ondertitel", s, "sub"));
    card.appendChild(grid);

    var urlF = bindField("URL", s, "url");
    card.appendChild(urlF);

    var grid2 = el("div", { "class": "row-grid" });
    // icon select
    grid2.appendChild(selectField("Icoon", s, "icon", Object.keys(ICONS)));
    grid2.appendChild(selectField("Kleur", s, "accent", ACCENTS));
    card.appendChild(grid2);

    // cast toggle
    var castF = el("div", { "class": "field" });
    var lbl = el("label", null, "");
    var cb = el("input", { type: "checkbox" });
    cb.checked = !!s.cast;
    cb.style.width = "auto"; cb.style.marginRight = "8px"; cb.style.verticalAlign = "middle";
    cb.addEventListener("change", function () { s.cast = cb.checked; });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode("Toon 'Casten naar TV' badge"));
    castF.appendChild(lbl);
    card.appendChild(castF);

    // Type B macro (recorded click-sequence deep link)
    card.appendChild(macroField(s));
    return card;
  }

  function macroField(s) {
    var wrap = el("div", { "class": "macro-field" });
    var has = !!(s.macro && Array.isArray(s.macro.steps) && s.macro.steps.length);
    var status = el("div", { "class": "macro-status" });
    status.innerHTML = has
      ? '<span class="macro-on">' + ICONS.bolt + " 1-klik dieplink actief · " + s.macro.steps.length + " stappen</span>"
      : '<span class="macro-off">Type B dieplink: nog geen opname</span>';
    wrap.appendChild(status);

    var row = el("div", { "class": "macro-row" });
    var pick = el("button", { "class": "mini-btn", "type": "button" }, has ? "Vervang opname" : "Importeer Chrome-opname");
    var file = el("input", { type: "file", accept: "application/json", hidden: "hidden" });
    pick.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importRecordingForShortcut(s, e.target.files[0]);
      e.target.value = "";
    });
    row.appendChild(pick);
    row.appendChild(file);

    if (has) {
      var clr = el("button", { "class": "mini-btn", "type": "button" }, "Wis opname");
      clr.addEventListener("click", function () { delete s.macro; buildSettingsForm(); });
      row.appendChild(clr);
    }
    wrap.appendChild(row);
    wrap.appendChild(el("p", { "class": "help-text" },
      "Neem de flow op met Chrome ⋮ → Meer hulpprogramma's → Recorder, exporteer als JSON en importeer hier. Bij één klik doorloopt de helper dan alle stappen tot het eindscherm."));
    return wrap;
  }

  function importRecordingForShortcut(s, fileObj) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rec = JSON.parse(reader.result);
        var steps = Array.isArray(rec.steps) ? rec.steps : (Array.isArray(rec) ? rec : null);
        if (!steps || !steps.length) { toast("Geen stappen gevonden in dit bestand"); return; }
        var startUrl = "";
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].type === "navigate" && steps[i].url) { startUrl = steps[i].url; break; }
        }
        s.macro = { startUrl: startUrl || s.url, steps: steps };
        buildSettingsForm();
        toast("Opname geïmporteerd · " + steps.length + " stappen");
      } catch (e) {
        toast("Ongeldig opnamebestand (verwacht Chrome Recorder JSON)");
      }
    };
    reader.readAsText(fileObj);
  }

  function bindField(label, obj, key) {
    var f = el("div", { "class": "field" });
    f.appendChild(el("label", null, escapeHtml(label)));
    var inp = el("input", { type: "text", value: obj[key] == null ? "" : obj[key] });
    inp.addEventListener("input", function () { obj[key] = inp.value; });
    f.appendChild(inp);
    return f;
  }

  function selectField(label, obj, key, options) {
    var f = el("div", { "class": "field" });
    f.appendChild(el("label", null, escapeHtml(label)));
    var sel = el("select");
    sel.style.width = "100%";
    sel.style.padding = "11px 13px";
    sel.style.borderRadius = "10px";
    sel.style.border = "1px solid var(--border)";
    sel.style.background = "var(--bg-2)";
    sel.style.color = "var(--text)";
    sel.style.fontFamily = "inherit";
    options.forEach(function (o) {
      var opt = el("option", { value: o }, o);
      if (obj[key] === o) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { obj[key] = sel.value; });
    f.appendChild(sel);
    return f;
  }

  function saveSettings() {
    config.gymName = (config.gymName || "LieftingFit").trim() || "LieftingFit";
    saveConfig(config);
    renderAll();
    hide("#settingsModal");
    toast("Instellingen opgeslagen");
  }

  function resetSettings() {
    if (!confirm("Alle snelkoppelingen en instellingen terugzetten naar standaard?")) return;
    config = clone(DEFAULT_CONFIG);
    saveConfig(config);
    renderAll();
    buildSettingsForm();
    toast("Standaardinstellingen hersteld");
  }

  // ----- Import / Export config -----
  function exportConfig() {
    var blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "lieftingfit-dashboard-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Configuratie geëxporteerd");
  }
  function importConfig(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        config = normalize(parsed);
        saveConfig(config);
        renderAll();
        buildSettingsForm();
        toast("Configuratie geïmporteerd");
      } catch (e) {
        toast("Ongeldig configuratiebestand");
      }
    };
    reader.readAsText(file);
  }

  // ----- Cast help -----
  function buildCastHelp() {
    var tv = config.tvName ? ("<b>" + escapeHtml(config.tvName) + "</b>") : "de TV van de zaal";
    $("#castBody").innerHTML =
      "<ol class=\"cast-steps\">" +
        "<li>Klik op een knop (bijv. <b>Coachboard</b>) — die opent in een nieuw tabblad in Chrome.</li>" +
        "<li>Klik rechtsboven in Chrome op het menu <b>⋮</b> en kies <b>Casten…</b> (of het cast-icoon).</li>" +
        "<li>Kies " + tv + " in de lijst met apparaten.</li>" +
        "<li>Kies <b>Bronnen ▾ → Tabblad casten</b> zodat het Coachboard op het scherm verschijnt.</li>" +
      "</ol>" +
      "<div class=\"cast-note\">Chrome onthoudt je keuze meestal, dus de volgende keer cast je met één klik. " +
      "<b>Tip:</b> laat het te presenteren tabblad op de voorgrond staan tijdens het casten.</div>";
  }

  // ----- Modal utils -----
  function show(sel) { $(sel).hidden = false; }
  function hide(sel) { $(sel).hidden = true; }

  // ----- Wire up -----
  function renderAll() {
    renderBindings();
    renderZaalBar();
    renderRoomBadge();
    renderRoosterSelect();
    renderTypeSelect();
    renderNowNext();
    renderTiles();
  }

  function init() {
    renderAll();
    // Snapshot today's roster now, while the session is most likely still on
    // "Alle roosters". That snapshot is what keeps Coachboard accurate later,
    // even after the Rooster tile narrows the view to one zaal.
    if (IS_EXT) {
      try {
        chrome.runtime.sendMessage({ action: "warmRoster" }, function () {
          void chrome.runtime.lastError;
          refreshDayInfo(function (d) {
            // A coach arriving at 17:55 wants the 18:00 class, not whatever was
            // left selected yesterday. Preselect what is running or starting
            // next — but only on arrival, so it never yanks the dropdown out
            // from under someone who has just chosen deliberately.
            if (!config.autoSelectType) return;
            // Never override a deliberate choice.
            //
            // Coming back from Weekprogramma reloads this page, which re-ran
            // auto-select and silently swapped "Advanced Kickboxing" for
            // whatever was running. The flag lives in sessionStorage, so it is
            // per TAB and survives navigating out to Dexos and back, while a
            // genuinely new tab (or a new day's session) still gets the
            // convenience of a sensible default.
            if (manualPick()) return;
            if (!d || !d.suggestTitle) return;
            var match = null;
            config.classTypes.forEach(function (t) {
              if (!match && normType(t) === normType(d.suggestTitle)) match = t;
            });
            // Fall back to an alias pointing at the roster's name.
            if (!match) {
              Object.keys(config.rosterAliases || {}).forEach(function (k) {
                if (!match && normType(config.rosterAliases[k]) === normType(d.suggestTitle)) match = k;
              });
            }
            if (match && match !== config.selectedType) {
              config.selectedType = match;
              saveConfig(config);
              renderAll();
              refreshDayInfo();
              toast("Lestype automatisch op " + match);
            }
          });
        });
      } catch (e) {}
      // Keep Nu/Hierna honest as classes roll over.
      setInterval(function () { refreshDayInfo(); }, 60000);
      // Unpacked extensions never auto-update, so check on every start.
      setTimeout(function () { checkForUpdates(false); }, 2500);
    }
    tickClock();
    setInterval(tickClock, 1000 * 15);

    $("#btnFullscreen").addEventListener("click", toggleFullscreen);
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnCastHelp").addEventListener("click", function () { buildCastHelp(); show("#castModal"); });
    $("#hintCast").addEventListener("click", function () { buildCastHelp(); show("#castModal"); });

    $("#roosterSelect").addEventListener("change", function () {
      markManualPick();
      config.selectedRooster = $("#roosterSelect").value;
      saveConfig(config);
      renderTypeSelect();     // step 2 depends on step 1
      renderTiles();
      refreshDayInfo();       // Nu/Hierna must follow the chosen zaal
      toast("Rooster: " + config.selectedRooster);
    });

    $("#typeSelect").addEventListener("change", function () {
      markManualPick();
      config.selectedType = $("#typeSelect").value;
      saveConfig(config);
      renderTiles(); // refresh the "Vandaag · <type>" chips
      refreshDayInfo();
    });

    $("#btnFeedback").addEventListener("click", openFeedback);
    $("#btnFeedbackSend").addEventListener("click", sendFeedback);
    $("#btnExpertConfirm").addEventListener("click", function () {
      expertUnlocked = true;
      hide("#expertModal");
      buildSettingsForm();
    });

    $("#btnSave").addEventListener("click", saveSettings);
    $("#btnReset").addEventListener("click", resetSettings);
    $("#btnExport").addEventListener("click", exportConfig);
    $("#btnImport").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importConfig(e.target.files[0]);
      e.target.value = "";
    });

    // close buttons / overlay click
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () {
        hide("#settingsModal"); hide("#castModal"); hide("#noClassModal");
        hide("#expertModal"); hide("#feedbackModal");
        $("#noClassTitle").textContent = "Geen les gevonden";   // shared dialog
      });
    });
    document.querySelectorAll(".modal-overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.hidden = true; });
    });

    // keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      if (isTyping(e.target)) return;
      if (e.key === "Escape") { hide("#settingsModal"); hide("#castModal"); return; }
      if (e.key === "f" || e.key === "F") { toggleFullscreen(); return; }
      if (e.key === "s" || e.key === "S") { openSettings(); return; }
      if (/^[1-9]$/.test(e.key)) {
        var idx = parseInt(e.key, 10) - 1;
        if (config.shortcuts[idx]) openUrl(config.shortcuts[idx].url);
      }
    });
  }
  function isTyping(t) {
    return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
