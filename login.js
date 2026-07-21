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
  // The background re-injects into already-open tabs after an extension
  // reload; a tab that ALSO gets the declarative injection would
  // otherwise run this twice.
  if (window.__lfLoginLoaded) return;
  window.__lfLoginLoaded = true;

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

  /* The form is NOT on /web/nl/login.
   *
   * That URL shows a chooser — "Inloggen voor leden", "Lid worden", "Proefles
   * volgen" — with no password field anywhere. The script therefore found
   * nothing and correctly did nothing, which is exactly why auto-login appeared
   * to be broken: it never reached a form at all. Clicking through is the
   * missing step.
   */
  function openLoginForm() {
    if (passwordFields().length) return false;          // already on the form
    var link = [].slice.call(document.querySelectorAll("a,button,[role=button]"))
      .filter(visible)
      .filter(function (e) { return /inloggen voor leden/i.test(e.textContent || ""); })[0];
    if (!link) return false;
    var o = { bubbles: true, cancelable: true, view: window };
    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"]
      .forEach(function (t) { try { link.dispatchEvent(new MouseEvent(t, o)); } catch (e) {} });
    try { link.click(); } catch (e) {}
    return true;                                        // form will render shortly
  }

  /* "Inlog onthouden" is unchecked by default, so every session expired on its
   * own schedule and the trainer met the login page again. Ticking it is the
   * single biggest reason they should now stay logged in. */
  function rememberMe() {
    var cb = document.querySelector('input[type="checkbox"]');
    if (!cb || cb.checked) return;
    var lab = cb.closest("mat-checkbox") || cb.closest("label") || cb.parentElement;
    var txt = (lab && lab.textContent || "").toLowerCase();
    if (txt && !/onthoud|remember|ingelogd/i.test(txt)) return;   // not that box
    try { cb.click(); } catch (e) {}
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

  /* The guard has to stop a SUBMIT LOOP without also disabling auto-login for
   * the rest of the tab's life.
   *
   * It used to set a permanent per-tab flag: one attempt, ever. So if a login
   * did not take — a slow form, a session that dropped later in the shift — the
   * trainer was shown the login page and auto-login stayed switched off until
   * they opened a new tab. That is the "sometimes I have to type it again".
   *
   * Now the flag carries a timestamp and expires, so a genuinely new login
   * later on is handled, while two attempts in quick succession still cannot
   * happen. It is also cleared as soon as we are off the login page. */
  var ATTEMPT_TTL = 90000;   // ms

  function alreadyAttempted() {
    if (attempted) return true;
    try {
      var v = parseInt(sessionStorage.getItem(ATTEMPT_FLAG) || "0", 10);
      if (!v) return false;
      if (Date.now() - v > ATTEMPT_TTL) { sessionStorage.removeItem(ATTEMPT_FLAG); return false; }
      return true;
    } catch (e) { return false; }
  }
  function markAttempted() {
    attempted = true;
    try { sessionStorage.setItem(ATTEMPT_FLAG, String(Date.now())); } catch (e) {}
  }
  function clearAttempt() {
    attempted = false;
    try { sessionStorage.removeItem(ATTEMPT_FLAG); } catch (e) {}
  }

  function tell(text, bad) {
    // Reuse the titlebar's status line if it is present.
    var s = document.querySelector("#lf-titlebar .lf-status");
    if (s) { s.textContent = text; s.className = "lf-status" + (bad ? " lf-status-bad" : ""); }
  }

  function onLoginRoute() {
    return /\/login\b|\/inloggen\b/i.test(location.pathname);
  }

  function tryLogin() {
    var f = looksLikeLogin();
    if (!f) {
      // On the login route but no form yet? Click through the chooser.
      if (onLoginRoute() && !alreadyAttempted()) openLoginForm();
      else if (!onLoginRoute()) clearAttempt();   // off the login page → reset
      return;
    }
    if (alreadyAttempted()) return;

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
      rememberMe();     // keeps the session alive between shifts

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
