/* LieftingFit Trainer Dashboard — background service worker
 *
 * Opens the dashboard when the toolbar icon is clicked, and runs "Type B"
 * macros: it opens the start page in a new tab (reusing the trainer's existing
 * Sportbit login) and replays a recorded click-sequence to land on the deep
 * destination — the pop-up that a plain link can't reach.
 */

// Open the dashboard in its own tab when the toolbar icon is clicked.
chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.action === "runMacro") {
    runMacro(msg).then(sendResponse).catch(function (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    });
    return true; // keep the message channel open for the async response
  }
  return false;
});

async function runMacro(msg) {
  var startUrl = msg.startUrl;
  var steps = Array.isArray(msg.steps) ? msg.steps : [];
  if (!startUrl) return { ok: false, error: "Geen start-URL voor deze macro." };

  var tab = await chrome.tabs.create({ url: startUrl, active: true });
  await waitForTabComplete(tab.id, 20000);

  var results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: replayInPage,
    args: [steps, msg.context || {}]
  });
  var res = results && results[0] ? results[0].result : null;
  return res || { ok: false, error: "Geen resultaat van de pagina." };
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { finish(); }, timeoutMs || 20000);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch (e) {}
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    // In case it is already complete
    chrome.tabs.get(tabId, function (t) {
      if (chrome.runtime.lastError) return;
      if (t && t.status === "complete") finish();
    });
  });
}

/* ---- Injected into the Sportbit page: replays the recorded steps ---- */
/* This function is serialized and runs in the page context. Keep it
   self-contained (no external references). */
function replayInPage(steps, context) {
  return new Promise(function (resolve) {
    var STEP_TIMEOUT = 15000;
    var SETTLE = 450;
    context = context || {};

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // Replace {{TYPE}}, {{TODAY_ISO}}, {{TODAY_D}}, {{TIME}}, {{WEEKDAY}} with the
    // live context so one recording follows the dropdown + current date.
    function subst(str) {
      if (typeof str !== "string") return str;
      return str
        .replace(/\{\{TYPE\}\}/g, context.type || "")
        .replace(/\{\{TODAY_ISO\}\}/g, context.todayISO || "")
        .replace(/\{\{TODAY_DMY\}\}/g, context.todayDMY || "")
        .replace(/\{\{TODAY_D\}\}/g, context.dayOfMonth || "")
        .replace(/\{\{TIME\}\}/g, context.time || "")
        .replace(/\{\{WEEKDAY\}\}/g, context.weekday || "");
    }

    function candidatesOf(step) {
      // Chrome Recorder: step.selectors = [[sel, ...], [sel, ...]]  (flatten)
      var out = [];
      var sels = step.selectors || [];
      for (var i = 0; i < sels.length; i++) {
        var group = sels[i];
        if (Array.isArray(group)) { for (var j = 0; j < group.length; j++) out.push(subst(group[j])); }
        else if (typeof group === "string") out.push(subst(group));
      }
      return out;
    }

    function visible(el) {
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    // Of several matching elements, return the innermost (so we click the actual
    // link/button, not a wrapper div that shares the same text).
    function innermost(matches) {
      for (var x = 0; x < matches.length; x++) {
        var inner = true;
        for (var y = 0; y < matches.length; y++) {
          if (x !== y && matches[x].contains(matches[y])) { inner = false; break; }
        }
        if (inner) return matches[x];
      }
      return matches[0] || null;
    }

    function resolveOne(sel) {
      try {
        if (sel.indexOf("aria/") === 0) {
          var name = sel.slice(5);
          var all = document.querySelectorAll("button,a,[role],input,span,div,td,th,li,label,i");
          for (var i = 0; i < all.length; i++) {
            var lbl = all[i].getAttribute && (all[i].getAttribute("aria-label") || all[i].getAttribute("title"));
            if (lbl === name && visible(all[i])) return all[i];
          }
          var am = [];
          for (var i2 = 0; i2 < all.length; i2++) {
            if ((all[i2].textContent || "").trim() === name && visible(all[i2])) am.push(all[i2]);
          }
          return innermost(am);
        }
        if (sel.indexOf("text/") === 0) {
          var t = sel.slice(5).trim();
          var nodes = document.querySelectorAll("button,a,span,div,td,th,li,label,i,strong,b,p");
          var tm = [];
          for (var k = 0; k < nodes.length; k++) {
            if ((nodes[k].textContent || "").trim() === t && visible(nodes[k])) tm.push(nodes[k]);
          }
          return innermost(tm);
        }
        if (sel.indexOf("has/") === 0) {
          // innermost visible element whose textContent CONTAINS all needles.
          // Multiple needles joined with "&&" must ALL be present, e.g.
          // has/19072026&&Hyrox targets today's block of the right type even
          // while a stale block of another type is still on screen.
          var raw = sel.slice(4);
          if (!raw) return null;
          var needles = raw.split("&&").map(function (s) { return s.trim(); }).filter(Boolean);
          var cand = document.querySelectorAll("a,button,div,td,li,tr,span,p");
          var matches = [];
          for (var m = 0; m < cand.length; m++) {
            var txt = cand[m].textContent || "";
            var all = true;
            for (var n = 0; n < needles.length; n++) { if (txt.indexOf(needles[n]) < 0) { all = false; break; } }
            if (all && visible(cand[m])) matches.push(cand[m]);
          }
          return innermost(matches);
        }
        if (sel.indexOf("selopt/") === 0) {
          // the <select> element that contains an <option> whose text matches —
          // used to find the Dexos view/type dropdowns without a fixed id
          var want = sel.slice(7).trim();
          var selects = document.querySelectorAll("select");
          for (var si = 0; si < selects.length; si++) {
            var ops = selects[si].options;
            for (var oi = 0; oi < ops.length; oi++) {
              if ((ops[oi].textContent || "").trim().indexOf(want) >= 0) return selects[si];
            }
          }
          return null;
        }
        if (sel.indexOf("xpath/") === 0 || sel.indexOf("//") === 0) {
          var xp = sel.replace(/^xpath\//, "");
          var r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return r.singleNodeValue || null;
        }
        if (sel.indexOf("pierce/") === 0) {
          return document.querySelector(sel.slice(7));
        }
        return document.querySelector(sel);
      } catch (e) { return null; }
    }

    function resolveEl(cands) {
      for (var i = 0; i < cands.length; i++) {
        var el = resolveOne(cands[i]);
        if (el) return el;
      }
      return null;
    }

    async function waitFor(cands) {
      var start = Date.now();
      while (Date.now() - start < STEP_TIMEOUT) {
        var el = resolveEl(cands);
        if (el && visible(el)) return el;
        await sleep(200);
      }
      return resolveEl(cands); // last try, even if not visible
    }

    function realClick(el) {
      // Click events bubble, so clicking the innermost matched element also
      // triggers handlers on clickable ancestors (a/button/cell).
      el.scrollIntoView({ block: "center", inline: "center" });
      var opts = { bubbles: true, cancelable: true, view: window };
      // Dispatch a pointer/mouse sequence WITHOUT a synthetic "click", then call
      // the native .click() exactly once (avoids double-firing handlers).
      ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"].forEach(function (type) {
        try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e) {}
      });
      try { el.click(); } catch (e) {}
    }

    function setValue(el, value) {
      // For <select>, pick the option by VISIBLE TEXT (the option's value attr is
      // often a numeric id that differs from the label like "CrossFit").
      if (el.tagName === "SELECT") {
        var ops = el.options, idx = -1, i;
        for (i = 0; i < ops.length; i++) { if ((ops[i].textContent || "").trim() === value) { idx = i; break; } }
        if (idx < 0) for (i = 0; i < ops.length; i++) { if ((ops[i].textContent || "").trim().indexOf(value) >= 0) { idx = i; break; } }
        if (idx >= 0) el.selectedIndex = idx;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value");
      if (setter && setter.set) setter.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function run() {
      await sleep(700); // let the SPA settle after load
      var acted = 0;
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        var type = step.type;
        if (type === "setViewport" || type === "close" || type === "navigate") continue;

        var cands = candidatesOf(step);
        if (type === "click" || type === "doubleClick") {
          var el = await waitFor(cands);
          if (!el) return done({ ok: false, failedStep: i + 1, reason: "kon knop niet vinden", label: firstText(cands) });
          realClick(el);
          if (type === "doubleClick") realClick(el);
          acted++;
          await sleep(SETTLE);
        } else if (type === "change") {
          var f = await waitFor(cands);
          if (!f) return done({ ok: false, failedStep: i + 1, reason: "kon veld niet vinden", label: firstText(cands) });
          setValue(f, step.value != null ? subst(String(step.value)) : "");
          acted++;
          await sleep(200);
        } else if (type === "waitForElement") {
          await waitFor(cands);
        } else if (type === "keyDown" || type === "keyUp" || type === "hover") {
          // handled implicitly by change/click; skip
        }
      }
      return done({ ok: true, acted: acted });
    }

    function firstText(cands) {
      for (var i = 0; i < cands.length; i++) {
        if (cands[i].indexOf("aria/") === 0) return cands[i].slice(5);
        if (cands[i].indexOf("text/") === 0) return cands[i].slice(5);
      }
      return cands[0] || "";
    }

    function done(v) { resolve(v); return v; }

    run();
  });
}
