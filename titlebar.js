/* LieftingFit room-console titlebar
 *
 * Injected into every Sportbit/Dexos page so a trainer never has to leave the
 * room's cast tab. Content scripts cannot call chrome.tabs, so every button
 * messages the background, which drives THIS tab.
 *
 * The bar is visible on the TV too (the whole tab is cast), so it stays slim
 * and can auto-hide.
 */
(function () {
  var BAR_ID = "lf-titlebar";
  var ROOM_ICONS = { A: "🅰", B: "🅱", C: "🅲" };

  var TOOLS = [
    { id: "coachboard",   label: "Coachboard" },
    { id: "dexos",        label: "Training aanpassen" },
    { id: "weekprogramma", label: "Weekprogramma" },
    { id: "rooster",      label: "Rooster" },
    { id: "kassa",        label: "Kassa" }
  ];

  var zaal = null;
  var autoHide = false;

  function send(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        // Reading lastError suppresses "Unchecked runtime.lastError" noise when
        // the service worker was asleep and the channel closed early.
        void chrome.runtime.lastError;
        if (cb) cb(res);
      });
    } catch (e) { /* extension context invalidated (reload) — ignore */ }
  }

  function flash(text, bad) {
    var n = document.getElementById(BAR_ID);
    if (!n) return;
    var s = n.querySelector(".lf-status");
    if (!s) return;
    s.textContent = text || "";
    s.className = "lf-status" + (bad ? " lf-status-bad" : "");
    if (text) setTimeout(function () { if (s.textContent === text) s.textContent = ""; }, 4000);
  }

  // Same message as the dashboard's dialog, injected over the page. Content
  // scripts cannot reach the dashboard's DOM, so it is rebuilt here.
  function showNoClass(type, label) {
    var old = document.getElementById("lf-noclass");
    if (old) old.remove();

    var weekday = new Date().toLocaleDateString("nl-NL", { weekday: "long" });
    var ov = document.createElement("div");
    ov.id = "lf-noclass";

    var box = document.createElement("div");
    box.className = "lf-nc-box";

    var h = document.createElement("div");
    h.className = "lf-nc-title";
    h.textContent = "Geen les gevonden";
    box.appendChild(h);

    var p1 = document.createElement("p");
    p1.className = "lf-nc-lead";
    p1.textContent = "Er staat vandaag (" + weekday + ") geen les van het type “" +
                     (type || "onbekend") + "” in het rooster.";
    box.appendChild(p1);

    var p2 = document.createElement("p");
    p2.className = "lf-nc-sub";
    p2.textContent = "Daarom is " + (label || "deze knop") + " niet geopend. Kies op het " +
                     "dashboard een ander lestype en probeer het opnieuw.";
    box.appendChild(p2);

    var row = document.createElement("div");
    row.className = "lf-nc-row";

    var toDash = document.createElement("button");
    toDash.className = "lf-nc-btn lf-nc-primary";
    toDash.textContent = "Naar het dashboard";
    toDash.addEventListener("click", function () { send({ action: "goDashboard" }); });
    row.appendChild(toDash);

    var close = document.createElement("button");
    close.className = "lf-nc-btn";
    close.textContent = "Sluiten";
    close.addEventListener("click", function () { ov.remove(); });
    row.appendChild(close);

    box.appendChild(row);
    ov.appendChild(box);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  function build() {
    var bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.setAttribute("role", "toolbar");
    bar.className = autoHide ? "lf-autohide" : "";

    var badge = document.createElement("span");
    badge.className = "lf-room";
    badge.textContent = zaal ? (ROOM_ICONS[zaal] || "▪") + " Zaal " + zaal : "LieftingFit";
    bar.appendChild(badge);

    var back = document.createElement("button");
    back.className = "lf-btn lf-back";
    back.textContent = "← Terug naar Dashboard";
    back.addEventListener("click", function () {
      flash("Dashboard openen…");
      send({ action: "goDashboard" });
    });
    bar.appendChild(back);

    var sep = document.createElement("span");
    sep.className = "lf-sep";
    bar.appendChild(sep);

    TOOLS.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "lf-btn lf-tool";   // lf-tool stretches to fill the bar
      b.textContent = t.label;
      b.addEventListener("click", function () {
        flash(t.label + "…");
        send({ action: "runTool", tool: t.id }, function (res) {
          if (!res) return;                       // navigation usually kills us first
          if (res.ok) { flash(""); return; }
          // Nothing was opened because there is no such class today — the same
          // dialog the dashboard shows, so the trainer gets one consistent
          // explanation wherever they clicked.
          if (res.noClass) { flash(""); showNoClass(res.type, t.label); return; }
          flash(res.reason || res.error || "Mislukt", !res.soft);
        });
      });
      bar.appendChild(b);
    });

    var status = document.createElement("span");
    status.className = "lf-status";
    bar.appendChild(status);

    return bar;
  }

  function barHeight() { return autoHide ? 6 : 52; }

  // Push the page's own fixed headers down out from under the bar.
  //
  // padding-top on <body> only moves elements in normal flow. The Coachboard's
  // toolbar is `position: fixed; top: 0`, so it stayed pinned to the viewport
  // and the bar covered it — the WOD-presentation control on the right was
  // invisible and unclickable. Anything fixed above the bar gets nudged down by
  // exactly the bar's height; the original top is remembered so toggling
  // auto-hide (or leaving fullscreen) can re-apply the right offset.
  function nudgeFixedTops() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) return;
    var h = barHeight();
    var nodes = document.body ? document.body.querySelectorAll("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el === bar || bar.contains(el)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== "fixed") continue;
      var recorded = el.getAttribute("data-lf-top");
      var orig = recorded !== null ? parseFloat(recorded) : parseFloat(cs.top);
      if (isNaN(orig)) continue;
      if (recorded === null) {
        if (orig >= h) continue;               // already clear of the bar
        el.setAttribute("data-lf-top", String(orig));
      }
      el.style.setProperty("top", (orig + h) + "px", "important");
    }
  }

  function unnudgeFixedTops() {
    var nodes = document.querySelectorAll("[data-lf-top]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.setProperty("top", nodes[i].getAttribute("data-lf-top") + "px", "important");
    }
  }

  // Presentation mode should be exactly that. When the page goes fullscreen the
  // bar hides completely and the page's own header goes back where it was, so
  // the TV shows the Coachboard and nothing else.
  function syncFullscreen() {
    var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var bar = document.getElementById(BAR_ID);
    if (bar) bar.style.display = fs ? "none" : "";
    document.documentElement.classList.toggle("lf-has-titlebar", !fs);
    if (fs) unnudgeFixedTops(); else nudgeFixedTops();
  }

  function attach() {
    if (!document.body) return;
    if (document.getElementById(BAR_ID)) return;
    document.body.appendChild(build());
    document.documentElement.classList.add("lf-has-titlebar");
    nudgeFixedTops();
    syncFullscreen();
  }

  // Sportbit is Angular and Dexos is jQuery; both re-render large parts of the
  // page on navigation and can drop nodes appended to <body>. Re-attach whenever
  // the bar goes missing instead of assuming a single injection survives.
  function watch() {
    var pending = null;
    var mo = new MutationObserver(function () {
      if (!document.getElementById(BAR_ID)) attach();
      // Debounced: the app can add its own fixed header after we injected, and
      // scanning every element on every mutation would be far too costly.
      if (pending) clearTimeout(pending);
      pending = setTimeout(nudgeFixedTops, 400);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // Belt and braces: a re-render that both removes and re-adds within one
    // microtask batch can slip past the observer callback's guard.
    setInterval(function () {
      if (!document.getElementById(BAR_ID)) attach();
      nudgeFixedTops();
    }, 2000);

    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (evt) {
      document.addEventListener(evt, syncFullscreen);
    });
  }

  function applyAutoHide() {
    var n = document.getElementById(BAR_ID);
    if (n) n.className = autoHide ? "lf-autohide" : "";
    nudgeFixedTops();   // the offset depends on the bar's visible height
  }

  // React to the setting immediately.
  //
  // Previously the value was read only at injection, so ticking "auto-hide" in
  // Settings appeared to do nothing: every already-open Sportbit/Dexos tab kept
  // the state it was injected with, and only a manual refresh picked it up.
  // Content scripts do get storage.onChanged, so just listen.
  function watchSetting() {
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes.config) return;
        var cfg = changes.config.newValue;
        autoHide = !!(cfg && cfg.titlebarAutoHide);
        applyAutoHide();
      });
    } catch (e) {}
  }

  function start() {
    send({ action: "whoAmI" }, function (res) {
      zaal = res && res.zaal ? res.zaal : null;
      try {
        chrome.storage.local.get("config", function (r) {
          void chrome.runtime.lastError;
          var cfg = r && r.config;
          autoHide = !!(cfg && cfg.titlebarAutoHide);
          attach();
          watch();
          watchSetting();
        });
      } catch (e) { attach(); watch(); watchSetting(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
