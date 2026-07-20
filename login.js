/* LieftingFit auto-login
 *
 * Fills and submits the Sportbit login form so a tool button opened from a room
 * tab glides straight through instead of dead-ending on a login screen.
 *
 * SCOPE / SAFETY
 * - Runs only on https://*.sportbitapp.nl/* (manifest match). It must never be
 *   widened: this script types a stored password into a form.
 * - It matches the whole origin rather than /web/nl/login because Sportbit is an
 *   SPA — a client-side route change to the login view does not re-run a
 *   path-scoped content script. So it re-checks on DOM changes instead.
 * - Because of that it can meet OTHER password fields (a change-password form,
 *   say). looksLikeLogin() therefore demands exactly ONE visible password field
 *   plus a username field, and either a /login URL or a login-worded submit
 *   button. A change-password form has two or three password fields and fails
 *   this test.
 * - Credentials live in their own chrome.storage.local key, never in the config
 *   object, so "Exporteer config" cannot write them into a shared file.
 *
 * The selectors are deliberately generic: the live login form could not be
 * inspected (the account was already authenticated, and logging it out to look
 * was not acceptable), so this detects a login form by shape rather than by
 * pinned ids. If auto-login misbehaves, that is the first thing to check.
 */
(function () {
  var ATTEMPT_FLAG = "lf-login-attempted";   // per page load, survives SPA routing
  var CREDS_KEY = "credentials";
  var attempted = false;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function passwordFields() {
    return [].slice.call(document.querySelectorAll('input[type="password"]')).filter(visible);
  }

  function userFieldNear(pw) {
    // The username input is whatever visible text/email/tel input precedes the
    // password field in document order — more robust than guessing at names,
    // which differ between Sportbit's own form and Dexos's.
    var all = [].slice.call(document.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],input:not([type])'
    )).filter(visible);
    var chosen = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) chosen = all[i];
    }
    return chosen || all[0] || null;
  }

  function submitControl(scope) {
    var root = scope || document;
    var cands = [].slice.call(root.querySelectorAll('button,input[type="submit"]')).filter(visible);
    var worded = cands.filter(function (b) {
      var t = ((b.textContent || b.value || "") + " " + (b.getAttribute("aria-label") || "")).toLowerCase();
      return /inloggen|aanmelden|log ?in|sign ?in|verder/.test(t);
    });
    if (worded.length) return worded[0];
    var typed = cands.filter(function (b) { return (b.getAttribute("type") || "").toLowerCase() === "submit"; });
    return typed[0] || null;
  }

  // Guard against acting on anything that is not a sign-in form.
  function looksLikeLogin() {
    var pws = passwordFields();
    if (pws.length !== 1) return null;           // 2+ => change-password form
    var pw = pws[0];
    var user = userFieldNear(pw);
    if (!user) return null;
    var form = pw.closest("form");
    var submit = submitControl(form || document);
    var urlSaysLogin = /\/login\b|\/inloggen\b/i.test(location.pathname);
    if (!urlSaysLogin && !submit) return null;
    return { pw: pw, user: user, form: form, submit: submit };
  }

  // Angular/React track their own value state; assigning .value alone is not
  // observed. Use the native setter, then fire input+change.
  function setNative(el, value) {
    var proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
                                          : window.HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, "value");
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function alreadyAttempted() {
    if (attempted) return true;
    try { return sessionStorage.getItem(ATTEMPT_FLAG) === "1"; } catch (e) { return false; }
  }
  function markAttempted() {
    attempted = true;
    try { sessionStorage.setItem(ATTEMPT_FLAG, "1"); } catch (e) {}
  }

  function tell(text, bad) {
    // Reuse the titlebar's status line if it is present.
    var s = document.querySelector("#lf-titlebar .lf-status");
    if (s) { s.textContent = text; s.className = "lf-status" + (bad ? " lf-status-bad" : ""); }
  }

  function tryLogin() {
    if (alreadyAttempted()) return;
    var f = looksLikeLogin();
    if (!f) return;

    chrome.storage.local.get(CREDS_KEY, function (r) {
      void chrome.runtime.lastError;
      var creds = r && r[CREDS_KEY];
      if (!creds || !creds.user || !creds.pass) return;   // nothing stored: leave the form alone
      if (alreadyAttempted()) return;

      // Mark BEFORE submitting. If the submit navigates or the app re-renders
      // mid-flight, we must not come back around and submit a second time —
      // repeated bad logins are how accounts get locked.
      markAttempted();
      tell("Automatisch inloggen…");

      setNative(f.user, creds.user);
      setNative(f.pw, creds.pass);

      setTimeout(function () {
        if (f.submit) f.submit.click();
        else if (f.form) f.form.requestSubmit ? f.form.requestSubmit() : f.form.submit();
      }, 120);

      // If we are still looking at a login form a few seconds later, the stored
      // credentials are probably wrong. Say so once and stop — never retry.
      setTimeout(function () {
        if (looksLikeLogin()) {
          tell("Automatisch inloggen mislukt — controleer de inloggegevens in Instellingen", true);
        }
      }, 6000);
    });
  }

  function start() {
    tryLogin();
    // SPA route changes can swap the login view in without a page load.
    var mo = new MutationObserver(function () { tryLogin(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  var IS_EXT = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);

  if (IS_EXT) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  } else {
    // Loaded by docs/test/engine-tests.html. Expose the guard so the
    // "refuses a change-password form" behaviour is covered by a test rather
    // than by inspection — it is the check standing between a stored password
    // and the wrong form.
    window.__lfLoginGuard = looksLikeLogin;
  }
})();
