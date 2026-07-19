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
    shortcuts: [
      {
        id: "coachboard", label: "Coachboard", sub: "Sportbit · Presentatie-modus",
        icon: "present", accent: "green", cast: true, contextMode: "today",
        url: "https://lieftingfit.sportbitapp.nl/cbm/coachboard/110634/"
      },
      {
        id: "dexos", label: "Training aanpassen", sub: "Dexos · Workout Programmering",
        icon: "edit", accent: "amber", cast: false, contextMode: "today",
        url: "https://lieftingfit.sportbitapp.nl/dexos/"
      },
      {
        id: "rooster", label: "Rooster", sub: "Sportbit · Lesrooster",
        icon: "calendar", accent: "blue", cast: false, contextMode: "week",
        url: "https://lieftingfit.sportbitapp.nl/web/nl/login"
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
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalize(cfg) {
    var base = clone(DEFAULT_CONFIG);
    cfg = cfg || {};
    base.gymName = cfg.gymName || base.gymName;
    base.tvName = typeof cfg.tvName === "string" ? cfg.tvName : base.tvName;
    if (Array.isArray(cfg.shortcuts)) base.shortcuts = cfg.shortcuts;
    if (Array.isArray(cfg.classTypes) && cfg.classTypes.length) base.classTypes = cfg.classTypes;
    if (typeof cfg.selectedType === "string") base.selectedType = cfg.selectedType;
    if (base.classTypes.indexOf(base.selectedType) < 0) base.selectedType = base.classTypes[0];
    return base;
  }

  var config = loadConfig();

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
    window.open(url, "_blank", "noopener");
  }
  function buildContext() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return {
      type: config.selectedType,
      contextMode: null, // filled per shortcut below
      todayISO: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
      dayOfMonth: String(d.getDate()),
      weekday: d.toLocaleDateString("nl-NL", { weekday: "long" }),
      time: pad(d.getHours()) + ":" + pad(d.getMinutes())
    };
  }

  function runMacro(s) {
    var startUrl = (s.macro && s.macro.startUrl) || s.url;
    var ctx = buildContext();
    ctx.contextMode = s.contextMode || "none";
    toast("Bezig: " + s.label + " openen…");
    chrome.runtime.sendMessage(
      { action: "runMacro", startUrl: startUrl, steps: s.macro.steps, context: ctx },
      function (res) {
        if (chrome.runtime.lastError) { toast("Kon de helper niet starten"); return; }
        if (!res) { toast("Geen antwoord van de helper"); return; }
        if (res.ok) toast("✓ " + s.label + " geopend");
        else toast("Stap " + (res.failedStep || "?") + " mislukt" + (res.label ? " (" + res.label + ")" : "") + " — neem de flow opnieuw op");
      }
    );
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
      var attrs = { "class": "tile acc-" + accent };
      if (fallbackUrl) { attrs.href = fallbackUrl; attrs.target = "_blank"; attrs.rel = "noopener"; }
      else { attrs.href = "#"; }
      var tile = el("a", attrs);
      var badge = "";
      if (hasMacro) badge = '<span class="tile-cast tile-macro">' + ICONS.bolt + " 1-klik dieplink</span>";
      else if (s.cast) badge = '<span class="tile-cast">' + ICONS.cast + " Casten naar TV</span>";
      var contextChip = "";
      if (s.contextMode === "today") contextChip = '<span class="tile-context">Vandaag · ' + escapeHtml(config.selectedType) + "</span>";
      else if (s.contextMode === "week") contextChip = '<span class="tile-context">Deze week · ' + escapeHtml(config.selectedType) + "</span>";
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
      tile.addEventListener("click", function (e) {
        if (hasMacro && IS_EXT) { e.preventDefault(); runMacro(s); return; }
        if (hasMacro && !IS_EXT) { toast("Installeer de Chrome-extensie voor de 1-klik dieplink — nu open ik de startpagina"); return; }
        if (!fallbackUrl) { e.preventDefault(); toast("Geen URL ingesteld — open Instellingen"); }
      });
      grid.appendChild(tile);
    });
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
    renderTypeSelect();
    renderTiles();
  }

  function init() {
    renderAll();
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
        hide("#settingsModal"); hide("#castModal");
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
