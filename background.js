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

    // Normalize text for matching: collapse whitespace, drop case. Handles CSS
    // text-transform:uppercase (DOM says "Workout Programmering", screen shows
    // "WORKOUT PROGRAMMERING"), &nbsp;, and stray newlines/indentation.
    function norm(s) {
      return (s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
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
          var nname = norm(name);
          var am = [];
          for (var i2 = 0; i2 < all.length; i2++) {
            if (norm(all[i2].textContent) === nname && visible(all[i2])) am.push(all[i2]);
          }
          return innermost(am);
        }
        if (sel.indexOf("text/") === 0) {
          var t = norm(sel.slice(5));
          var nodes = document.querySelectorAll("button,a,span,div,td,th,li,label,i,strong,b,p");
          var tm = [];
          for (var k = 0; k < nodes.length; k++) {
            if (norm(nodes[k].textContent) === t && visible(nodes[k])) tm.push(nodes[k]);
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
          var needles = raw.split("&&").map(function (s) { return norm(s); }).filter(Boolean);
          var cand = document.querySelectorAll("a,button,div,td,li,tr,span,p");
          var matches = [];
          for (var m = 0; m < cand.length; m++) {
            var txt = norm(cand[m].textContent);
            var all = true;
            for (var n = 0; n < needles.length; n++) { if (txt.indexOf(needles[n]) < 0) { all = false; break; } }
            if (all && visible(cand[m])) matches.push(cand[m]);
          }
          return innermost(matches);
        }
        if (sel.indexOf("selopt/") === 0) {
          // the <select> element that contains an <option> whose text matches —
          // used to find the Dexos view/type dropdowns without a fixed id
          var want = norm(sel.slice(7));
          var selects = document.querySelectorAll("select");
          for (var si = 0; si < selects.length; si++) {
            var ops = selects[si].options;
            for (var oi = 0; oi < ops.length; oi++) {
              if (norm(ops[oi].textContent).indexOf(want) >= 0) return selects[si];
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

    // Returns true if the value was applied, false if a <select> had no matching
    // option. Callers MUST check: firing "change" without having set the option
    // would leave the previous selection active while the step reports success —
    // e.g. casting the wrong class to the Coachboard TV. The Coachboard's
    // sel_programma has only 12 coarse groups vs the dashboard's 41 class types,
    // so "no matching option" is a real, reachable case.
    function setValue(el, value) {
      // For <select>, pick the option by VISIBLE TEXT (the option's value attr is
      // often a numeric id that differs from the label like "CrossFit").
      if (el.tagName === "SELECT") {
        var ops = el.options, idx = -1, i, nv = norm(value);
        // Exact before substring: the type lists contain prefix collisions
        // ("Hyrox" vs "Hyrox daluren", "CrossFit" vs "CrossFit open"). Do not
        // reorder these two loops.
        for (i = 0; i < ops.length; i++) { if (norm(ops[i].textContent) === nv) { idx = i; break; } }
        if (idx < 0) for (i = 0; i < ops.length; i++) { if (norm(ops[i].textContent).indexOf(nv) >= 0) { idx = i; break; } }
        if (idx < 0) return false;
        el.selectedIndex = idx;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value");
      if (setter && setter.set) setter.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // Of the elements matching `cands` that also carry a clock time, return the
    // one whose class starts soonest from now; once every class of the day has
    // started, fall back to the last one. Used by the Coachboard macro, where
    // today may hold several classes of the same type (07:00 / 18:00 / 20:00)
    // and a coach almost always wants the session they are about to run.
    function findNearestUpcoming(cands) {
      var TIME_RE = /(\d{1,2}):(\d{2})/;
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var pool = [];

      for (var c = 0; c < cands.length; c++) {
        var sel = cands[c];
        if (sel.indexOf("has/") !== 0) continue;
        var needles = sel.slice(4).split("&&").map(function (s) { return norm(s); }).filter(Boolean);
        var nodes = document.querySelectorAll("a,button,div,td,li,tr,span,p");
        for (var i = 0; i < nodes.length; i++) {
          var txt = norm(nodes[i].textContent);
          var ok = true;
          for (var n = 0; n < needles.length; n++) { if (txt.indexOf(needles[n]) < 0) { ok = false; break; } }
          if (!ok || !visible(nodes[i])) continue;
          var m = TIME_RE.exec(nodes[i].textContent);
          if (!m) continue; // the bare label span carries no time — skip it
          pool.push({ el: nodes[i], min: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) });
        }
        if (pool.length) break; // first candidate selector that matched wins
      }
      if (!pool.length) return null;

      // Narrow to leaf-most matches BEFORE comparing times. A day-column wrapper
      // contains every tile in that column, so it matches {{TYPE}} via a child
      // while its own first time belongs to some *other* class (e.g. the Avond
      // column reads "OpenGym 17:00 ..." but contains the 18:00 CrossFit). Left
      // in the pool it would win "nearest" with a time that isn't ours, so drop
      // any candidate that contains another candidate.
      var leaves = pool.filter(function (p) {
        return !pool.some(function (q) { return q.el !== p.el && p.el.contains(q.el); });
      });
      if (leaves.length) pool = leaves;

      var upcoming = pool.filter(function (p) { return p.min >= nowMin; });
      var best = upcoming.length
        ? Math.min.apply(null, upcoming.map(function (p) { return p.min; }))
        : Math.max.apply(null, pool.map(function (p) { return p.min; }));

      // Several nested elements share the winning time (tile > column > span);
      // innermost() picks the tightest one, and the click bubbles to the handler.
      return innermost(pool.filter(function (p) { return p.min === best; }).map(function (p) { return p.el; }));
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
        } else if (type === "clickNearest") {
          // wait for the list to render, then pick the nearest upcoming entry
          await waitFor(cands);
          var near = findNearestUpcoming(cands);
          if (!near) return done({ ok: false, failedStep: i + 1, reason: "geen les van dit type vandaag", label: firstText(cands) });
          realClick(near);
          acted++;
          await sleep(SETTLE);
        } else if (type === "change") {
          var f = await waitFor(cands);
          if (!f) return done({ ok: false, failedStep: i + 1, reason: "kon veld niet vinden", label: firstText(cands) });
          var wanted = step.value != null ? subst(String(step.value)) : "";
          if (!setValue(f, wanted)) {
            return done({ ok: false, failedStep: i + 1, reason: 'optie "' + wanted + '" bestaat niet in deze lijst', label: firstText(cands) });
          }
          acted++;
          await sleep(200);
        } else if (type === "deriveNavigate") {
          // Same-tab navigation to a URL derived from the CURRENT url.
          //
          // Why this exists: the Coachboard is reached in the UI via the
          // "Presentatie-modus" button, which calls window.open(). That needs
          // transient user activation, and a content script's synthetic
          // MouseEvent is isTrusted:false — Chrome's popup blocker silently
          // drops it, so clicking that button from a macro can never work.
          // Luckily the event id IS the coachboard id
          // (/web/nl/events/110649 -> /cbm/coachboard/110649/), so we skip the
          // button and navigate directly. Same-tab nav is never popup-blocked.
          var re = new RegExp(step.from);
          var start = Date.now(), mm = null;
          while (Date.now() - start < STEP_TIMEOUT) {
            mm = re.exec(location.href);
            if (mm) break;
            await sleep(200); // the SPA route change is async
          }
          if (!mm) return done({ ok: false, failedStep: i + 1, reason: "verwachte pagina niet bereikt", label: step.from });
          var dest = step.to.replace(/\$(\d)/g, function (_, d) { return mm[Number(d)] || ""; });
          location.href = dest;
          acted++;
          await sleep(SETTLE);
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
