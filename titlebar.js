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

  /* ---- "Bezig…" cover ----
   * Hides the mechanics of a macro: the page it lands on, the menus it opens,
   * the dropdowns it changes. The background owns the busy flag (per tab), so
   * the cover can be re-drawn on the next page too — a single in-page overlay
   * would die with the first navigation.
   */
  var BUSY_ID = "lf-busy";

  function showBusy(label) {
    if (document.getElementById(BUSY_ID)) {
      var t = document.querySelector("#" + BUSY_ID + " .lf-busy-text");
      if (t && label) t.textContent = label;
      return;
    }
    var ov = document.createElement("div");
    ov.id = BUSY_ID;
    ov.innerHTML =
      '<div class="lf-busy-box">' +
        '<div class="lf-busy-spinner" aria-hidden="true"></div>' +
        '<div class="lf-busy-text">' + (label || "Bezig…") + "</div>" +
        '<div class="lf-busy-sub">Een moment geduld</div>' +
      "</div>";
    (document.body || document.documentElement).appendChild(ov);
  }

  function hideBusy() {
    var n = document.getElementById(BUSY_ID);
    if (!n) return;
    n.classList.add("lf-busy-out");            // fade rather than snap
    setTimeout(function () { if (n.parentNode) n.remove(); }, 180);
  }

  function syncBusy() {
    send({ action: "amIBusy" }, function (res) {
      if (res && res.busy) showBusy(res.label); else hideBusy();
    });
  }

  // Same message as the dashboard's dialog, injected over the page. Content
  // scripts cannot reach the dashboard's DOM, so it is rebuilt here.
  function showNoClass(type, label, rosterFilter) {
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

    if (rosterFilter) {
      var p3 = document.createElement("p");
      p3.className = "lf-nc-warn";
      p3.textContent = "Let op: het rooster staat op “" + rosterFilter + "”. Een les in een " +
                       "andere zaal is dan niet zichtbaar. Zet het rooster op “Alle roosters”.";
      box.appendChild(p3);
    }

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

  /* ---- Spotlight on "Deelnemer toevoegen" ----
   *
   * Dexos shows that dialog on top of the full admin UI: the week grid, the
   * event popup behind it, the whole left menu. A trainer only needs the one
   * box. So everything around it is blacked out and a titlebar naming the class
   * is placed above it.
   *
   * Masked with FOUR panels around the dialog's rectangle rather than by
   * restyling the dialog itself. Dexos owns that node — moving it, or fighting
   * its z-index inside nested .inner_overlay stacking contexts, risks breaking
   * its own scripts. Four rectangles touch nothing.
   *
   * The dialog grows as options are chosen (member search results, extra
   * fields), so the rectangles are recomputed continuously.
   */
  var FOCUS_ID = "lf-focus";
  var focusRO = null;

  // The SMALLEST box that still starts with "Deelnemer toevoegen".
  //
  // Document order is not reliable here: the dialog sits inside nested
  // .inner_overlay wrappers, and taking the last one could return an outer
  // shell that spans most of the page — which is why the mask looked loose and
  // the titlebar ended up below everything. Smallest-area is what "just this
  // dialog" actually means.
  function findDeelnemerDialog() {
    var best = null, bestArea = Infinity;
    var nodes = document.querySelectorAll("div, section, form");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Deelnemer toevoegen/i.test(t)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 100) continue;   // a label, not the box
      var area = r.width * r.height;
      if (area < bestArea) { bestArea = area; best = el; }
    }
    return best;
  }

  function focusEls() {
    var host = document.getElementById(FOCUS_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = FOCUS_ID;
    ["top", "right", "bottom", "left"].forEach(function (side) {
      var d = document.createElement("div");
      d.className = "lf-mask lf-mask-" + side;
      host.appendChild(d);
    });
    var bar = document.createElement("div");
    bar.className = "lf-focus-bar";
    bar.innerHTML = '<span class="lf-focus-title"></span><span class="lf-focus-sub"></span>';
    host.appendChild(bar);
    document.body.appendChild(host);
    return host;
  }

  function clearFocus() {
    var host = document.getElementById(FOCUS_ID);
    if (host) host.remove();
    if (focusRO) { try { focusRO.disconnect(); } catch (e) {} focusRO = null; }
  }

  function paintFocus() {
    var dlg = findDeelnemerDialog();
    if (!dlg) { clearFocus(); return; }

    var host = focusEls();
    var r = dlg.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var pad = 8;                     // a little breathing room around the box
    var top = Math.max(0, r.top - pad), left = Math.max(0, r.left - pad);
    var right = Math.min(vw, r.right + pad), bottom = Math.min(vh, r.bottom + pad);

    function set(sel, s) {
      var n = host.querySelector(sel); if (!n) return;
      Object.keys(s).forEach(function (k) { n.style.setProperty(k, s[k], "important"); });
    }
    set(".lf-mask-top",    { top: "0px", left: "0px", width: vw + "px", height: top + "px" });
    set(".lf-mask-bottom", { top: bottom + "px", left: "0px", width: vw + "px", height: Math.max(0, vh - bottom) + "px" });
    set(".lf-mask-left",   { top: top + "px", left: "0px", width: left + "px", height: (bottom - top) + "px" });
    set(".lf-mask-right",  { top: top + "px", left: right + "px", width: Math.max(0, vw - right) + "px", height: (bottom - top) + "px" });

    // Titlebar always sits ABOVE the box. If there is not enough room it is
    // clamped to just under the room titlebar — never pushed to the bottom of
    // the screen, which is where it ended up before and read as "detached".
    var barH = 46;
    var barTop = Math.max(barTopMin(), top - barH - 6);
    set(".lf-focus-bar", {
      top: barTop + "px", left: left + "px",
      width: Math.max(240, right - left) + "px", height: barH + "px"
    });

    // Keep it observing this dialog even as it resizes.
    if (!focusRO && window.ResizeObserver) {
      focusRO = new ResizeObserver(function () { paintFocus(); });
      try { focusRO.observe(dlg); } catch (e) {}
    }
  }
  function barTopMin() { return (document.getElementById(BAR_ID) && !autoHide) ? 58 : 6; }

  function setFocusLabel(titel, start) {
    var host = document.getElementById(FOCUS_ID);
    if (!host) return;
    var t = host.querySelector(".lf-focus-title");
    var s = host.querySelector(".lf-focus-sub");
    if (t) t.textContent = "Leden toevoegen — " + (titel || "les");
    if (s) s.textContent = start ? start : "";
  }

  function syncFocus() {
    var dlg = findDeelnemerDialog();
    if (!dlg) { clearFocus(); return; }
    paintFocus();
    // The class being edited comes from the background, which resolved it from
    // the roster when the button was pressed — more trustworthy than scraping
    // it back out of the Dexos markup.
    send({ action: "ledenFocus" }, function (res) {
      if (res && res.titel) setFocusLabel(res.titel, res.start);
      else setFocusLabel(null, null);
    });
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
        showBusy(t.label + " openen…");           // cover immediately, before anything moves
        flash(t.label + "…");
        send({ action: "runTool", tool: t.id }, function (res) {
          if (!res) return;                       // navigation usually kills us first
          if (res.ok) {
            hideBusy();
            // Say WHICH class was opened — a coach can spot a wrong pick before
            // it is on the TV.
            flash(res.klas ? res.klas + (res.start ? " " + res.start : "") : "");
            return;
          }
          hideBusy();
          // Nothing was opened because there is no such class today — the same
          // dialog the dashboard shows, so the trainer gets one consistent
          // explanation wherever they clicked.
          if (res.noClass) { flash(""); showNoClass(res.type, t.label, res.filterName); return; }
          flash(res.reason || res.error || "Mislukt", !res.soft);
        });
      });
      bar.appendChild(b);
    });

    // Filled in by refreshNextClass() once we know what follows.
    var nextBtn = document.createElement("button");
    nextBtn.className = "lf-btn lf-next";
    nextBtn.hidden = true;
    bar.appendChild(nextBtn);

    var status = document.createElement("span");
    status.className = "lf-status";
    bar.appendChild(status);

    return bar;
  }

  /* On a Coachboard, offer the class that follows this one.
   *
   * During a busy evening a coach would otherwise go back to the dashboard,
   * re-pick the type and click again between every class. The id is already
   * known from the roster snapshot, so this is a single instant navigation.
   */
  function refreshNextClass() {
    var btn = document.querySelector("#" + BAR_ID + " .lf-next");
    if (!btn) return;
    var onCoachboard = /\/cbm\/coachboard\//.test(location.pathname);
    if (!onCoachboard) { btn.hidden = true; return; }

    // Which class is on screen? The URL carries its id.
    var m = /\/cbm\/coachboard\/(\d+)/.exec(location.pathname);
    var shownId = m ? parseInt(m[1], 10) : null;

    send({ action: "dayInfo" }, function (res) {
      if (!res || !res.ok) { btn.hidden = true; return; }
      // "What is on after the one I am showing" — walk the whole day, not just
      // the selected type, because the coach may hand over to another class.
      var next = res.anyNext;
      var cur = res.anyCurrent;
      var target = (cur && cur.id !== shownId) ? cur : next;
      if (!target || target.id === shownId) { btn.hidden = true; return; }
      btn.hidden = false;
      btn.textContent = "Volgende: " + target.titel + " " + target.start + " →";
      btn.onclick = function () {
        showBusy(target.titel + " openen…");
        send({ action: "openClass", id: target.id }, function () { hideBusy(); });
      };
    });
  }

  /* Keep the zaal in the browser tab title.
   *
   * Three cast tabs otherwise read "Coachboard", "Rooster", "DEX - Onderhoud
   * systeem" — nothing tells the trainer which TV they are driving. Sportbit is
   * an SPA and rewrites document.title on every route change, so this is
   * re-applied rather than set once. */
  function stampTitle() {
    if (!zaal) return;
    var prefix = "Zaal " + zaal + " · ";
    if (document.title.indexOf(prefix) === 0) return;      // already ours
    var base = document.title.replace(/^Zaal [^·]*· /, "");
    document.title = prefix + base;
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
    syncBusy();          // a macro may still be mid-flight on this tab
    refreshNextClass();
    stampTitle();
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
      stampTitle();
    }, 2000);

    // The dialog appears, grows and closes entirely under Dexos's control, so
    // the mask is re-measured often. Each pass is four style writes.
    setInterval(syncFocus, 350);
    window.addEventListener("resize", paintFocus);
    window.addEventListener("scroll", paintFocus, true);

    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (evt) {
      document.addEventListener(evt, syncFullscreen);
    });

    // The background clears the cover when a macro finishes.
    try {
      chrome.runtime.onMessage.addListener(function (msg) {
        if (msg && msg.action === "busyDone") { hideBusy(); refreshNextClass(); }
      });
    } catch (e) {}

    // Classes roll over during the evening — keep "Volgende" honest without
    // needing a reload.
    setInterval(refreshNextClass, 60000);
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
