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
      b.className = "lf-btn";
      b.textContent = t.label;
      b.addEventListener("click", function () {
        flash(t.label + "…");
        send({ action: "runTool", tool: t.id }, function (res) {
          if (!res) return;                       // navigation usually kills us first
          if (res.ok) { flash(""); return; }
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

  function attach() {
    if (!document.body) return;
    if (document.getElementById(BAR_ID)) return;
    document.body.appendChild(build());
    document.documentElement.classList.add("lf-has-titlebar");
  }

  // Sportbit is Angular and Dexos is jQuery; both re-render large parts of the
  // page on navigation and can drop nodes appended to <body>. Re-attach whenever
  // the bar goes missing instead of assuming a single injection survives.
  function watch() {
    var mo = new MutationObserver(function () {
      if (!document.getElementById(BAR_ID)) attach();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // Belt and braces: a re-render that both removes and re-adds within one
    // microtask batch can slip past the observer callback's guard.
    setInterval(function () { if (!document.getElementById(BAR_ID)) attach(); }, 2000);
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
        });
      } catch (e) { attach(); watch(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
