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
    shortcuts: [
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
    toast("Bezig: " + s.label + " openen…");
    // Goes through runTool, not runMacro, so the tile gets the same
    // "is there actually a class?" probe as the titlebar buttons. runMacro
    // would navigate this tab first and only discover the problem afterwards.
    chrome.runtime.sendMessage(
      { action: "runTool", tool: s.id },
      function (res) {
        if (chrome.runtime.lastError) { toast("Kon de helper niet starten"); return; }
        if (!res) { toast("Geen antwoord van de helper"); return; }
        if (res.ok) { toast("✓ " + s.label + " geopend"); return; }
        // No class of this type today: nothing was opened, so explain it
        // properly in a dialog rather than a toast that slides away.
        if (res.noClass) { showNoClass(res.type || config.selectedType, s.label, res.filterName); return; }
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
  function showNoClass(type, label, rosterFilter) {
    var weekday = new Date().toLocaleDateString("nl-NL", { weekday: "long" });
    var body = $("#noClassBody");
    body.innerHTML =
      '<p class="noclass-lead">Er staat vandaag (<b>' + escapeHtml(weekday) + '</b>) geen les van het type ' +
      '<b>' + escapeHtml(type) + '</b> in het rooster.</p>' +
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
    document.title = config.gymName + " · Trainer Dashboard";
  }

  function renderTiles() {
    var grid = $("#grid");
    grid.innerHTML = "";
    config.shortcuts.forEach(function (s, i) {
      var accent = ACCENTS.indexOf(s.accent) >= 0 ? s.accent : "blue";
      var hasMacro = !!(s.macro && Array.isArray(s.macro.steps) && s.macro.steps.length);
      var fallbackUrl = hasMacro ? (s.macro.startUrl || s.url) : s.url;
      var hasRosterPickerEarly = Array.isArray(s.rosterOptions) && s.rosterOptions.length;
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
      if (s.contextMode === "today") contextChip = '<span class="tile-context">Vandaag · ' + escapeHtml(config.selectedType) + "</span>";
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
        if (hasMacro && IS_EXT) { if (e) e.preventDefault(); runMacro(s); return; }
        if (hasMacro && !IS_EXT) { toast("Installeer de Chrome-extensie voor de 1-klik dieplink — nu open ik de startpagina"); return; }
        if (fallbackUrl && IS_EXT) { if (e) e.preventDefault(); openUrl(fallbackUrl); return; }
        if (!fallbackUrl) { if (e) e.preventDefault(); toast("Geen URL ingesteld — open Instellingen"); }
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

        var hitArea = tile.querySelector(".tile-body");
        tile.classList.add("tile-has-picker");
        tile.querySelector(".tile-top").addEventListener("click", activate);
        hitArea.addEventListener("click", activate);
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

  function renderTypeSelect() {
    var sel = $("#typeSelect");
    if (!sel) return;
    sel.innerHTML = "";
    config.classTypes.forEach(function (name) {
      var opt = el("option", { value: name }, name);
      if (name === config.selectedType) opt.selected = true;
      sel.appendChild(opt);
    });
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
  function openSettings() {
    buildSettingsForm();
    show("#settingsModal");
  }
  function buildSettingsForm() {
    var body = $("#settingsBody");
    body.innerHTML = "";

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

    var ahWrap = el("label", { "class": "set-check" });
    var ah = el("input", { type: "checkbox" });
    ah.checked = !!config.titlebarAutoHide;
    ah.addEventListener("change", function () { config.titlebarAutoHide = ah.checked; });
    ahWrap.appendChild(ah);
    ahWrap.appendChild(el("span", null,
      "Menubalk automatisch verbergen (schuift weg; kom met de muis naar de bovenrand). " +
      "De balk staat óók op de TV, dus dit houdt het Coachboard vrij."));
    rm.appendChild(ahWrap);
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
    renderTypeSelect();
    renderTiles();
  }

  function init() {
    renderAll();
    // Snapshot today's roster now, while the session is most likely still on
    // "Alle roosters". That snapshot is what keeps Coachboard accurate later,
    // even after the Rooster tile narrows the view to one zaal.
    if (IS_EXT) {
      try {
        chrome.runtime.sendMessage({ action: "warmRoster" }, function () { void chrome.runtime.lastError; });
      } catch (e) {}
    }
    tickClock();
    setInterval(tickClock, 1000 * 15);

    $("#btnFullscreen").addEventListener("click", toggleFullscreen);
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnCastHelp").addEventListener("click", function () { buildCastHelp(); show("#castModal"); });
    $("#hintCast").addEventListener("click", function () { buildCastHelp(); show("#castModal"); });

    $("#typeSelect").addEventListener("change", function () {
      config.selectedType = $("#typeSelect").value;
      saveConfig(config);
      renderTiles(); // refresh the "Vandaag · <type>" chips
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
