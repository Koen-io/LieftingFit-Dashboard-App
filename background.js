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
    args: [steps]
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
function replayInPage(steps) {
  return new Promise(function (resolve) {
    var STEP_TIMEOUT = 15000;
    var SETTLE = 450;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function candidatesOf(step) {
      // Chrome Recorder: step.selectors = [[sel, ...], [sel, ...]]  (flatten)
      var out = [];
      var sels = step.selectors || [];
      for (var i = 0; i < sels.length; i++) {
        var group = sels[i];
        if (Array.isArray(group)) { for (var j = 0; j < group.length; j++) out.push(group[j]); }
        else if (typeof group === "string") out.push(group);
      }
      return out;
    }

    function visible(el) {
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function resolveOne(sel) {
      try {
        if (sel.indexOf("aria/") === 0) {
          var name = sel.slice(5);
          var all = document.querySelectorAll("button,a,[role],input,span,div,td,th,li,label,i");
          for (var i = 0; i < all.length; i++) {
            var e = all[i];
            var lbl = e.getAttribute && (e.getAttribute("aria-label") || e.getAttribute("title"));
            if (lbl === name) return e;
            if ((e.textContent || "").trim() === name && visible(e)) return e;
          }
          return null;
        }
        if (sel.indexOf("text/") === 0) {
          var t = sel.slice(5).trim();
          var nodes = document.querySelectorAll("button,a,span,div,td,th,li,label,i,strong,b,p");
          for (var k = 0; k < nodes.length; k++) {
            if ((nodes[k].textContent || "").trim() === t && visible(nodes[k])) return nodes[k];
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
      el.scrollIntoView({ block: "center", inline: "center" });
      var opts = { bubbles: true, cancelable: true, view: window };
      ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (type) {
        try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e) {}
      });
      try { el.click(); } catch (e) {}
    }

    function setValue(el, value) {
      var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
        : el.tagName === "SELECT" ? window.HTMLSelectElement.prototype
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
          setValue(f, step.value != null ? step.value : "");
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
