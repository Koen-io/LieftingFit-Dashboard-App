/* LieftingFit Trainer Dashboard — background service worker
 *
 * Opens the dashboard when the toolbar icon is clicked, and runs "Type B"
 * macros: it opens the start page in a new tab (reusing the trainer's existing
 * Sportbit login) and replays a recorded click-sequence to land on the deep
 * destination — the pop-up that a plain link can't reach.
 */

// Guarded so this file can also be loaded by docs/test/engine-tests.html, which
// exercises replayInPage against DOM fixtures. Chrome forbids attaching a
// debugger to chrome-extension:// pages, so the extension UI cannot be driven
// by tooling — testing the REAL source in a plain page is the only way to keep
// the engine covered without hand-copying it (and letting the copy drift).
var IS_EXTENSION = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);

if (IS_EXTENSION) {
  // Open the dashboard in its own tab when the toolbar icon is clicked.
  chrome.action.onClicked.addListener(function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  });

  // Forget a room's tab when it is closed, so the next click opens a fresh one
  // instead of trying to focus a dead tab id.
  chrome.tabs.onRemoved.addListener(function (tabId) {
    getRooms().then(function (rooms) {
      var changed = false;
      Object.keys(rooms).forEach(function (z) { if (rooms[z] === tabId) { delete rooms[z]; changed = true; } });
      if (changed) setRooms(rooms);
    });
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.action) return false;
    var tabId = sender && sender.tab ? sender.tab.id : null;

    if (msg.action === "runMacro") {
      // Runs in the SENDER's tab — see runMacro().
      runMacro(msg, tabId).then(sendResponse).catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
      return true; // keep the message channel open for the async response
    }
    if (msg.action === "openRoom") {
      openRoom(msg.zaal).then(sendResponse).catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
      return true;
    }
    if (msg.action === "whoAmI") {
      // The titlebar content script cannot know its own room; only the
      // background holds the tab -> room mapping.
      roomForTab(tabId).then(function (zaal) { sendResponse({ zaal: zaal }); });
      return true;
    }
    if (msg.action === "runTool") {
      runTool(msg.tool, tabId, msg.classId).then(sendResponse).catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
      return true;
    }
    if (msg.action === "ledenFocus") {
      // Which class the open "Deelnemer toevoegen" dialog belongs to, so the
      // spotlight titlebar can name it.
      chrome.storage.session.get("ledenFocus").then(function (r) {
        var map = (r && r.ledenFocus) || {};
        sendResponse(map[String(tabId)] || {});
      }).catch(function () { sendResponse({}); });
      return true;
    }
    if (msg.action === "maximizeMe") {
      // Chrome ignores --start-maximized when it is already running, so the
      // desktop icon could not guarantee a full-size window on its own. Doing
      // it here covers every route in: desktop app, toolbar icon, zaal button,
      // and the reload after a self-update.
      //
      // state "fullscreen" is the WINDOW fullscreen — macOS's green button. It
      // hides the Mac menubar while Chrome keeps its tab strip and toolbar, so
      // casting stays reachable. Not to be confused with the page-level
      // Fullscreen API, which would hide the tabs.
      if (sender && sender.tab && sender.tab.windowId != null) {
        chrome.windows.get(sender.tab.windowId).then(function (w) {
          // Only grow a NORMAL window. Chrome's own "fullscreen" state is the
          // presentation one that hides the tab strip, so it is never set from
          // here; the desktop app puts the window into macOS fullscreen via
          // AXFullScreen instead. A window already in either state is left
          // alone so this cannot undo that.
          if (w.state === "normal") {
            return chrome.windows.update(sender.tab.windowId, { state: "maximized" });
          }
        }).catch(function () {}).then(function () { sendResponse({ ok: true }); });
        return true;
      }
      sendResponse({ ok: false });
      return true;
    }
    if (msg.action === "amIBusy") {
      isBusy(tabId).then(function (v) { sendResponse({ busy: !!v, label: v ? v.label : "" }); });
      return true;
    }
    if (msg.action === "dayInfo") {
      dayInfo(msg.type, msg.rooster).then(sendResponse).catch(function () { sendResponse({ ok: false }); });
      return true;
    }
    if (msg.action === "openClass") {
      // Straight to a known coachboard id — used by "Nu bezig" and "Volgende les".
      openClassById(msg.id, tabId).then(sendResponse).catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
      return true;
    }
    if (msg.action === "warmRoster") {
      // Snapshot today's full roster while the session is still unfiltered, so
      // a later check made after the Rooster tile narrows the location is still
      // accurate. Fire-and-forget.
      getTodayEvents().then(function (d) {
        sendResponse({ ok: !!d, complete: !!(d && d.complete) });
      }).catch(function () { sendResponse({ ok: false }); });
      return true;
    }
    if (msg.action === "goDashboard") {
      goDashboard(tabId).then(sendResponse).catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
      return true;
    }
    return false;
  });
}

/* After chrome.runtime.reload() the extension restarts and every extension page
 * is torn down, leaving its tab on a dead URL. The dashboard writes where it
 * was just before triggering the update; this reopens it as soon as the worker
 * comes back. Guarded by a timestamp so an ordinary worker wake-up (which
 * happens constantly) can never resurrect a stale tab. */
if (IS_EXTENSION) {
  (async function reopenAfterUpdate() {
    try {
      var r = await chrome.storage.local.get("pendingReopen");
      var p = r && r.pendingReopen;
      if (!p || !p.url) return;
      await chrome.storage.local.remove("pendingReopen");
      if (Date.now() - (p.at || 0) > 60000) return;       // too old to be ours
      var tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("index.html") + "*" });
      if (tabs && tabs.length) await chrome.tabs.update(tabs[0].id, { url: p.url, active: true });
      else await chrome.tabs.create({ url: p.url, active: true });
    } catch (e) {}
  })();
}

/* Re-inject into tabs that were already open.
 *
 * Declared content scripts only run when a page LOADS. After the extension
 * reloads — which it now does to apply its own updates — every Sportbit tab
 * that was already open is left with dead scripts: no titlebar, and no
 * auto-login on a login page sitting right there. Sweeping the open tabs once
 * at startup restores both without waiting for a refresh.
 *
 * Both scripts guard against running twice, so a tab that also gets the normal
 * declarative injection is unaffected.
 */
if (IS_EXTENSION) {
  (async function reinjectOpenTabs() {
    try {
      var tabs = await chrome.tabs.query({ url: "https://*.sportbitapp.nl/*" });
      for (var i = 0; i < tabs.length; i++) {
        try {
          await chrome.scripting.insertCSS({ target: { tabId: tabs[i].id }, files: ["titlebar.css"] });
          await chrome.scripting.executeScript({ target: { tabId: tabs[i].id }, files: ["titlebar.js", "login.js"] });
        } catch (e) { /* tab may be mid-navigation or restricted */ }
      }
    } catch (e) {}
  })();
}

/* Keep the Sportbit session alive.
 *
 * The dashboard sits idle on a gym laptop for hours, so the session quietly
 * expires and the next button press lands on the login page — which is what
 * auto-login then has to rescue. Preventing the logout is better than
 * recovering from it. Sportbit's own front-end pings this endpoint; doing the
 * same from the service worker keeps the cookie fresh with one tiny request.
 */
if (IS_EXTENSION) {
  var HEARTBEAT_URL = "https://lieftingfit.sportbitapp.nl/cbm/api/data/heartbeat/?taalIso=nl";
  function beat() {
    fetch(HEARTBEAT_URL, { credentials: "include", cache: "no-store" }).catch(function () {});
  }
  try {
    chrome.alarms.create("lfHeartbeat", { periodInMinutes: 10 });
    chrome.alarms.onAlarm.addListener(function (a) { if (a.name === "lfHeartbeat") beat(); });
  } catch (e) {}
  beat();
}

/* ---------------- Room tabs ----------------
 * Chrome casts a whole TAB, so three TVs showing different things need three
 * separate tabs, each cast once. The mapping lives in storage.session (not a
 * module variable) because an MV3 service worker is torn down when idle and
 * would otherwise forget which tab belongs to which room.
 */
async function getRooms() {
  try { return (await chrome.storage.session.get("rooms")).rooms || {}; }
  catch (e) { return {}; }
}
async function setRooms(rooms) {
  try { await chrome.storage.session.set({ rooms: rooms }); } catch (e) {}
}
async function roomForTab(tabId) {
  if (tabId == null) return null;
  var rooms = await getRooms();
  var found = null;
  Object.keys(rooms).forEach(function (z) { if (rooms[z] === tabId) found = z; });
  return found;
}

function dashboardUrl(zaal) {
  return chrome.runtime.getURL("index.html") + (zaal ? "?zaal=" + encodeURIComponent(zaal) : "");
}

// Focus this room's tab if it still exists, otherwise open one. Re-using the
// tab is what makes casting stick: the trainer casts it once and every later
// navigation inside it stays on that TV.
async function openRoom(zaal) {
  if (!zaal) return { ok: false, error: "Geen zaal opgegeven." };
  var rooms = await getRooms();
  var existing = rooms[zaal];
  if (existing != null) {
    try {
      await chrome.tabs.get(existing);           // throws if the tab is gone
      await chrome.tabs.update(existing, { active: true });
      var t = await chrome.tabs.get(existing);
      try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
      return { ok: true, tabId: existing, reused: true };
    } catch (e) { /* fall through and open a new one */ }
  }
  var tab = await chrome.tabs.create({ url: dashboardUrl(zaal), active: true });
  // Maximise the window a zaal opens in. The trainer needs the Chrome tab strip
  // and the cast menu, so this is a maximised WINDOW — not fullscreen, which
  // would hide exactly the controls they came for.
  try { await chrome.windows.update(tab.windowId, { state: "maximized" }); } catch (e) {}
  rooms[zaal] = tab.id;
  await setRooms(rooms);
  return { ok: true, tabId: tab.id, reused: false };
}

async function goDashboard(tabId) {
  if (tabId == null) return { ok: false, error: "Geen tab." };
  var zaal = await roomForTab(tabId);
  await chrome.tabs.update(tabId, { url: dashboardUrl(zaal) });
  return { ok: true };
}

/* ---------------- "Bezig…" state ----------------
 * A macro navigates the tab and then replays clicks, so the trainer would
 * otherwise watch menus opening and dropdowns changing by themselves. A cover
 * screen hides that — but it cannot simply live in the page, because the very
 * first thing a macro does is navigate away and destroy it.
 *
 * So the state lives here, keyed by tab. Every injected titlebar asks "is this
 * tab busy?" on load and re-draws the cover if so; the background clears it
 * when the macro finishes. storage.session survives the service worker being
 * torn down mid-macro.
 */
async function getBusyMap() {
  try { return (await chrome.storage.session.get("busy")).busy || {}; }
  catch (e) { return {}; }
}
async function setBusy(tabId, label) {
  if (tabId == null) return;
  var map = await getBusyMap();
  map[String(tabId)] = { label: label || "Bezig…", since: Date.now() };
  try { await chrome.storage.session.set({ busy: map }); } catch (e) {}
}
async function clearBusy(tabId) {
  if (tabId == null) return;
  var map = await getBusyMap();
  delete map[String(tabId)];
  try { await chrome.storage.session.set({ busy: map }); } catch (e) {}
  // Tell the page that is showing the cover to drop it. It may not exist yet
  // (still loading) — the content script also asks on load, so this is just the
  // fast path.
  try { chrome.tabs.sendMessage(tabId, { action: "busyDone" }, function () { void chrome.runtime.lastError; }); } catch (e) {}
}
async function isBusy(tabId) {
  if (tabId == null) return null;
  var map = await getBusyMap();
  var v = map[String(tabId)];
  if (!v) return null;
  // Safety valve: never trap a trainer behind a cover that outlived its macro.
  if (Date.now() - v.since > 30000) { await clearBusy(tabId); return null; }
  return v;
}

/* The titlebar lives in a content script, which has no access to the dashboard
 * page's localStorage. app.js mirrors its config into chrome.storage.local so
 * the background can resolve a tool id to its macro on the titlebar's behalf. */
async function loadConfigForBackground() {
  try { return (await chrome.storage.local.get("config")).config || null; }
  catch (e) { return null; }
}


/* Is there a class of this type today? Answered by ASKING THE API, not by
 * driving a page.
 *
 * The first attempt at this opened a background tab and replayed the roster
 * macro in it. That was wrong on every count: the tab was visible in the strip,
 * it lingered while the macro waited, and the "no class" dialog only appeared
 * once it went away. Sportbit's own Angular front-end reads
 * /cbm/api/web/rooster/, and the service worker can call it with the trainer's
 * session cookie — instantly, invisibly, and with no tab at all.
 *
 * Response shape:
 *   { events: { ochtend:[…], middag:[…], avond:[…] },
 *     roosters: [{id,naam}], geselecteerdRoosterId }
 * Each event: { id, start:"18:00", eind, titel:"CrossFit", type, ruimte, … }
 * `id` is the same id the Coachboard uses: /cbm/coachboard/<id>/.
 */
var ROSTER_API = "https://lieftingfit.sportbitapp.nl/cbm/api/web/rooster/";

async function fetchTodayRoster() {
  var res = await fetch(ROSTER_API, { credentials: "include" });
  if (!res.ok) throw new Error("rooster-API gaf " + res.status);
  var j = await res.json();
  var out = [];
  ["ochtend", "middag", "avond"].forEach(function (part) {
    var list = j.events && j.events[part];
    if (Array.isArray(list)) list.forEach(function (e) { out.push(e); });
  });
  return {
    events: out,
    // null means "Alle roosters"; anything else means we are only seeing one
    // location and a class elsewhere would be invisible to this check.
    selectedRoosterId: j.geselecteerdRoosterId,
    roosters: j.roosters || []
  };
}

function normName(s) {
  return String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
// `start` arrives as a full ISO stamp ("2026-07-20T18:00:00+02:00"); prefer the
// time right after the T so a date component can never be misread as a clock.
function startMinutes(e) {
  var s = String(e.start || "");
  var m = /T(\d{2}):(\d{2})/.exec(s) || /(\d{1,2}):(\d{2})/.exec(s);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
function endMinutes(e) {
  var s = String(e.eind || "");
  var m = /T(\d{2}):(\d{2})/.exec(s) || /(\d{1,2}):(\d{2})/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  var st = startMinutes(e);
  return st == null ? null : st + 60;      // assume an hour if the API omits it
}
function nowMinutes() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function hhmm(mins) {
  if (mins == null) return "";
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return p(Math.floor(mins / 60)) + ":" + p(mins % 60);
}

// Every class of this type today, in start order.
function classesOfType(events, ctx) {
  var wanted = [ctx.typeRoster, ctx.typeBase].map(normName).filter(Boolean);
  for (var w = 0; w < wanted.length; w++) {
    var hits = events.filter(function (e) { return normName(e.titel) === wanted[w]; });
    if (hits.length) {
      return hits.slice().sort(function (a, b) { return (startMinutes(a) || 0) - (startMinutes(b) || 0); });
    }
  }
  return [];
}

// What is running right now, and what follows it. `list` must be start-sorted.
function nowAndNext(list) {
  var n = nowMinutes(), current = null, next = null;
  for (var i = 0; i < list.length; i++) {
    var s = startMinutes(list[i]);
    if (s == null) continue;
    var en = endMinutes(list[i]);
    if (s <= n && n < en) { current = list[i]; continue; }
    if (s > n && !next) next = list[i];
  }
  return { current: current, next: next };
}

// Trimmed for messaging — never ship participant data to a content script.
//
// NB: ruimte / trainer / type come back as OBJECTS ({naam: "Hoofdruimte"}),
// not strings. Passing them through rendered a literal "[object Object]" next
// to the class in the Nu/Hierna strip. Always unwrap .naam.
function nameOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v.naam || "";
}
function slimEvent(e) {
  if (!e) return null;
  return {
    id: e.id,
    titel: e.titel,
    start: hhmm(startMinutes(e)),
    eind: hhmm(endMinutes(e)),
    ruimte: nameOf(e.ruimte),
    trainer: nameOf(e.trainer),
    // The API's own class-type id — stabler than matching on names.
    typeId: e.type && e.type.id != null ? e.type.id : null,
    typeNaam: nameOf(e.type),
    kleur: (e.type && e.type.hexkleur) || null
  };
}

/* Same rules as clickNearest, applied to data instead of DOM: the class NAME
 * must match exactly (never a substring — "Strength" must not match "Hyrox
 * strength"), and of those, the one starting soonest wins, falling back to the
 * last once they have all started. */
function findTodaysClass(events, ctx) {
  var wanted = [ctx.typeRoster, ctx.typeBase].map(normName).filter(Boolean);
  for (var w = 0; w < wanted.length; w++) {
    var hits = events.filter(function (e) { return normName(e.titel) === wanted[w]; });
    if (!hits.length) continue;
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var timed = hits.map(function (e) { return { e: e, min: startMinutes(e) }; })
                    .filter(function (x) { return x.min != null; });
    if (!timed.length) return hits[0];
    var upcoming = timed.filter(function (x) { return x.min >= nowMin; });
    var pool = upcoming.length ? upcoming : timed;
    pool.sort(function (a, b) { return upcoming.length ? a.min - b.min : b.min - a.min; });
    return pool[0].e;
  }
  return null;
}

/* The API only ever returns the roster LOCATION selected in the session, and
 * the Rooster tile deliberately changes that. Rather than resetting the
 * trainer's choice (which would undo the location they just picked), remember
 * the complete day whenever we happen to have it.
 *
 * Any unfiltered read — dashboard load, or the moment before the Rooster tile
 * switches location — snapshots today's events. A later check made while
 * filtered then answers from that snapshot instead of guessing. The cache is
 * keyed by date so it can never leak into tomorrow.
 */
var ROSTER_CACHE_KEY = "rosterCache";

function todayKey() {
  var d = new Date();
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

async function readRosterCache() {
  try {
    var v = (await chrome.storage.local.get(ROSTER_CACHE_KEY))[ROSTER_CACHE_KEY];
    return v && v.date === todayKey() ? v : null;
  } catch (e) { return null; }
}

async function writeRosterCache(events) {
  try {
    var obj = {};
    obj[ROSTER_CACHE_KEY] = { date: todayKey(), events: events };
    await chrome.storage.local.set(obj);
  } catch (e) {}
}

function rosterFilterName(roster) {
  if (!roster || roster.selectedRoosterId == null) return null;
  var naam = "";
  (roster.roosters || []).forEach(function (r) { if (r.id === roster.selectedRoosterId) naam = r.naam; });
  return naam || String(roster.selectedRoosterId);
}

/* ---- Which classes belong to which zaal ----
 *
 * The dashboard downstairs should only offer the classes that actually run
 * downstairs. The API cannot be asked "what runs in zaal X" directly — it only
 * ever returns the roster selected in the session — so the mapping is LEARNED:
 * every time a fetch happens with a specific roster selected, the class names it
 * returned are recorded against that roster. It fills itself in as the Rooster
 * tile gets used, and is seeded with a first day's observation.
 *
 * Stored as { "<roosterNaam>": ["CrossFit", "Hyrox", …] }, union-merged so a
 * quiet Monday never deletes what Wednesday taught us.
 */
var ROSTER_TYPES_KEY = "rosterTypeMap";

async function readRosterTypeMap() {
  try { return (await chrome.storage.local.get(ROSTER_TYPES_KEY))[ROSTER_TYPES_KEY] || {}; }
  catch (e) { return {}; }
}

async function learnRosterTypes(roosterNaam, events) {
  if (!roosterNaam || !events || !events.length) return;
  var map = await readRosterTypeMap();
  var have = map[roosterNaam] || [];
  var seen = {};
  have.forEach(function (t) { seen[normName(t)] = t; });
  events.forEach(function (e) {
    var t = e.titel;
    if (t && !seen[normName(t)]) seen[normName(t)] = t;
  });
  map[roosterNaam] = Object.keys(seen).map(function (k) { return seen[k]; }).sort();
  var obj = {}; obj[ROSTER_TYPES_KEY] = map;
  try { await chrome.storage.local.set(obj); } catch (e) {}
}

/* Today's events, plus whether that list is COMPLETE (covers every location).
 * Only a complete list may be used to conclude "this class does not exist". */
async function getTodayEvents() {
  var live = null;
  try { live = await fetchTodayRoster(); } catch (e) { live = null; }

  if (live) await rememberRosters(live.roosters);
  if (live && live.selectedRoosterId != null) {
    // Filtered view — exactly the thing that teaches us this zaal's classes.
    await learnRosterTypes(rosterFilterName(live), live.events);
  }

  if (live && live.selectedRoosterId == null) {
    await writeRosterCache(live.events);           // full view — remember it
    return { events: live.events, complete: true, filterName: null };
  }

  var cached = await readRosterCache();
  if (cached) {
    // Filtered right now, but we saw the whole day earlier — trust that.
    return { events: cached.events, complete: true, fromCache: true, filterName: rosterFilterName(live) };
  }
  if (live) {
    return { events: live.events, complete: false, filterName: rosterFilterName(live) };
  }
  return null;                                     // API unreachable
}


/* Everything the dashboard and titlebar need to show "what's on now".
 * `type` is optional: without it, answers for the gym as a whole ("Nu bezig"). */
async function dayInfo(type, roosterNaam) {
  var cfg = await loadConfigForBackground();
  var day = await getTodayEvents();
  if (!day) return { ok: false };

  // Restrict to the zaal the dashboard is set to. The gym's TVs are all
  // downstairs, so a trainer there should never be offered — or warned about —
  // a class running upstairs. "Alle roosters" (or an unknown zaal) means no
  // filtering, so nothing is ever silently hidden.
  var events = day.events;
  if (roosterNaam && !/^alle/i.test(roosterNaam)) {
    var list = await typesForRooster(cfg, roosterNaam);
    if (list && list.length) {
      var allowed = {};
      list.forEach(function (t) { allowed[normName(t)] = true; });
      events = events.filter(function (e) { return allowed[normName(e.titel)]; });
    }
  }

  // Nu / Hierna is about COACHED classes. OpenGym is unmanned floor time and
  // runs almost continuously downstairs, so leaving it in meant "Nu" was
  // permanently OpenGym and "Hierna" was the next OpenGym slot — burying the
  // classes a trainer actually cares about. Excluded here ONLY: the tiles, the
  // type dropdown and every macro still see it.
  var skip = {};
  ((cfg && cfg.nowNextExclude) || []).forEach(function (t) { skip[normName(t)] = true; });
  var forStrip = events.filter(function (e) { return !skip[normName(e.titel)]; });

  var all = forStrip.slice().sort(function (a, b) {
    return (startMinutes(a) || 0) - (startMinutes(b) || 0);
  });
  var anyNow = nowAndNext(all);

  var forType = null;
  if (type && cfg) {
    var aliases = cfg.rosterAliases || {};
    var ctx = {
      typeRoster: aliases[type] || type,
      typeBase: (function () {
        var first = String(type).split(/[\s(\/-]+/)[0] || "";
        if (first.length < 3) return "";
        if (["the", "de", "het", "een", "van", "voor", "en", "zaal"].indexOf(first.toLowerCase()) >= 0) return "";
        return first;
      })()
    };
    var list = classesOfType(events, ctx);
    var nn = nowAndNext(list);
    forType = {
      count: list.length,
      current: slimEvent(nn.current),
      next: slimEvent(nn.next),
      all: list.map(slimEvent)
    };
  }

  // Which type starts soonest — used to preselect Actief lestype on arrival.
  var upcoming = all.filter(function (e) { return (startMinutes(e) || 0) >= nowMinutes(); });
  return {
    ok: true,
    complete: day.complete,
    filterName: day.filterName || null,
    anyCurrent: slimEvent(anyNow.current),
    anyNext: slimEvent(anyNow.next),
    suggestTitle: (anyNow.current && anyNow.current.titel) || (upcoming[0] && upcoming[0].titel) || null,
    forType: forType,
    // Every class name known for this zaal — the dashboard uses it to narrow
    // the Actief lestype dropdown to what actually runs there.
    zaalTypes: await typesForRooster(cfg, roosterNaam),
    // For the zaal picker itself.
    rosters: (await lastKnownRosters()) || []
  };
}

// Seed (config) ∪ learned (storage) for one zaal; null when unfiltered.
/* Learned data WINS over the seed once it exists.
 *
 * The seed is a hand-written starting point and can be wrong; what the live
 * roster actually returned for a zaal cannot. Unioning the two meant one bad
 * seed entry permanently offered an upstairs class to a downstairs trainer. So
 * the seed only fills in for zalen that have never been observed. */
async function typesForRooster(cfg, roosterNaam) {
  if (!roosterNaam || /^alle/i.test(roosterNaam)) return null;
  var map = await readRosterTypeMap();
  var learned = map[roosterNaam] || [];
  if (learned.length) return learned.slice().sort();
  var seedList = (cfg && cfg.rosterTypes && cfg.rosterTypes[roosterNaam]) || [];
  return seedList.length ? seedList.slice().sort() : null;
}

/* The zaal list comes from the roster API, but the dashboard needs it even when
 * that call is slow or offline — so the last known list is cached. */
var ROSTERS_KEY = "knownRosters";
async function lastKnownRosters() {
  try { return (await chrome.storage.local.get(ROSTERS_KEY))[ROSTERS_KEY] || []; }
  catch (e) { return []; }
}
async function rememberRosters(list) {
  if (!list || !list.length) return;
  var obj = {}; obj[ROSTERS_KEY] = list.map(function (r) { return { id: r.id, naam: r.naam }; });
  try { await chrome.storage.local.set(obj); } catch (e) {}
}

async function openClassById(id, tabId) {
  if (tabId == null || !id) return { ok: false, error: "Geen les." };
  await setBusy(tabId, "Coachboard openen…");
  await chrome.tabs.update(tabId, { url: "https://lieftingfit.sportbitapp.nl/cbm/coachboard/" + id + "/" });
  await waitForTabComplete(tabId, 20000);
  await clearBusy(tabId);
  return { ok: true };
}

async function runTool(toolId, tabId, classIdFromClick) {
  if (tabId == null) return { ok: false, error: "Geen tab." };
  var cfg = await loadConfigForBackground();
  if (!cfg || !Array.isArray(cfg.shortcuts)) {
    return { ok: false, error: "Config nog niet geladen — open eerst het dashboard." };
  }
  var s = null;
  cfg.shortcuts.forEach(function (x) { if (x.id === toolId) s = x; });
  if (!s) return { ok: false, error: "Onbekende knop: " + toolId };

  var ctx = buildContextForBackground(cfg, s);
  ctx.roster = s.selectedRoster || "";

  // Both class-bound buttons are gated on the same question — "is this class on
  // today's roster?" — answered by one API call, before the room tab moves at
  // all. If the API cannot be reached we do NOT block the trainer: fall through
  // and run the macro as before, so a network hiccup degrades to the old
  // behaviour rather than to a dead button.
  if (toolId === "coachboard" || toolId === "dexos") {
    var day = await getTodayEvents();

    if (day) {
      var hit = findTodaysClass(day.events, ctx);

      // Only conclude "no class today" from a COMPLETE list. If we are filtered
      // to one location and have no snapshot of the full day, an empty result
      // means "don't know", so fall through to the macro rather than claiming
      // the class does not exist.
      if (!hit && day.complete) {
        return { ok: false, noClass: true, type: ctx.type, filterName: day.filterName || null,
                 reason: "Er staat vandaag geen les van dit type in het rooster." };
      }

      // Coachboard: the event id IS the coachboard id, so the room tab goes
      // straight there — one navigation, no roster, no extra tab.
      if (hit && toolId === "coachboard") {
        await setBusy(tabId, "Coachboard openen…");
        await chrome.tabs.update(tabId, {
          url: "https://lieftingfit.sportbitapp.nl/cbm/coachboard/" + hit.id + "/"
        });
        await waitForTabComplete(tabId, 20000);
        await clearBusy(tabId);
        return { ok: true, acted: 1, klas: hit.titel, start: hhmm(startMinutes(hit)) };
      }
      // Dexos has no equivalent deep link, so it still replays — but only now
      // that we know the class exists.
    }
  }

  /* --- Leden toevoegen ---
   * Matched by EVENT ID, not by colour/time. Each block in the Dexos
   * Groepslessen grid is a div.les whose onclick is
   *   calender.select(this, {"id":110634, …})
   * and that id is the same one the Sportbit roster API returns. So the class
   * the trainer picked in the dropdown can be located exactly, with no
   * guessing from the legend or the time axis.
   *
   * Chain: Planning → Groepslessen → set zaal → click the block →
   *        Bekijk / Wijzig → Deelnemer toevoegen.
   */
  if (toolId === "leden") {
    var classId = classIdFromClick || s.selectedClassId;
    if (!classId) {
      return { ok: false, noClass: true, type: ctx.type,
               reason: "Kies eerst een les in het uitklapmenu op de knop." };
    }
    // Remember which class this is, for the spotlight titlebar. Resolved from
    // the roster rather than scraped from Dexos afterwards.
    try {
      var dayNow = await getTodayEvents();
      var picked = null;
      if (dayNow) {
        dayNow.events.forEach(function (e) { if (String(e.id) === String(classId)) picked = e; });
      }
      var fr = await chrome.storage.session.get("ledenFocus");
      var fmap = (fr && fr.ledenFocus) || {};
      fmap[String(tabId)] = picked
        ? { titel: picked.titel, start: hhmm(startMinutes(picked)) + (endMinutes(picked) != null ? "–" + hhmm(endMinutes(picked)) : "") }
        : {};
      await chrome.storage.session.set({ ledenFocus: fmap });
    } catch (e) {}

    var zaal = cfg.selectedRooster || "";
    var ledenSteps = [
      { type: "navigate", url: "https://lieftingfit.sportbitapp.nl/dexos/" },
      { type: "click", selectors: [["text/Planning"]] },
      { type: "click", selectors: [["text/GROEPSLESSEN"], ["has/GROEPSLESSEN"]] }
    ];
    // The grid only shows one location at a time, so a block in another zaal
    // simply would not be there. Dexos prefixes its option ("LieftingFit - Gym
    // - beneden"), and setValue falls back to substring, so the plain zaal name
    // matches. Skipped for "Alle roosters", which Dexos has no option for.
    if (zaal && !/^alle/i.test(zaal)) {
      ledenSteps.push({ type: "change", value: zaal, selectors: [["selopt/LieftingFit"]] });
    }
    ledenSteps.push(
      { type: "click", selectors: [['xpath///div[contains(@onclick, \'"id":' + classId + ',\')]']] },
      { type: "click", selectors: [["text/Bekijk / Wijzig"], ["has/Bekijk"]] },
      { type: "click", selectors: [["text/Deelnemer toevoegen"]] }
    );

    await setBusy(tabId, "Deelnemers openen…");
    try {
      return await runMacro({ startUrl: "https://lieftingfit.sportbitapp.nl/dexos/",
                              steps: ledenSteps, context: ctx }, tabId);
    } finally {
      await clearBusy(tabId);
    }
  }

  // The Rooster tile is about to narrow the session to one location, which
  // would blind the Coachboard/Dexos check. Snapshot the full day first, so
  // those buttons keep working afterwards without the trainer losing the
  // location they just chose.
  if (toolId === "rooster") {
    try { await getTodayEvents(); } catch (e) {}
  }

  if (s.macro && Array.isArray(s.macro.steps) && s.macro.steps.length) {
    // Cover the tab for the whole replay: the trainer should never watch menus
    // open and dropdowns change by themselves.
    await setBusy(tabId, s.label ? s.label + " openen…" : "Bezig…");
    try {
      return await runMacro({ startUrl: s.macro.startUrl || s.url, steps: s.macro.steps, context: ctx }, tabId);
    } finally {
      await clearBusy(tabId);
    }
  }
  if (!s.url) return { ok: false, error: "Geen URL voor " + toolId };
  await chrome.tabs.update(tabId, { url: s.url });
  return { ok: true, acted: 0 };
}

// Mirror of app.js buildContext(), for tool runs started from the titlebar
// (where the dashboard page isn't there to build it).
function buildContextForBackground(cfg, shortcut) {
  var d = new Date();
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var type = cfg.selectedType || "";
  var aliases = cfg.rosterAliases || {};
  return {
    type: type,
    typeRoster: aliases[type] || type,
    // NB: keep this list in sync with typeBaseOf() in app.js.
    typeBase: (function () {
      // Mirror of typeBaseOf() in app.js — a base of "The" identifies nothing.
      var first = String(type).split(/[\s(\/-]+/)[0] || "";
      if (first.length < 3) return "";
      if (["the", "de", "het", "een", "van", "voor", "en", "zaal"].indexOf(first.toLowerCase()) >= 0) return "";
      return first;
    })(),
    roster: (shortcut && shortcut.selectedRoster) || "",
    todayISO: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
    todayDMY: pad(d.getDate()) + pad(d.getMonth() + 1) + d.getFullYear(),
    dayOfMonth: String(d.getDate()),
    weekday: d.toLocaleDateString("nl-NL", { weekday: "long" }),
    time: pad(d.getHours()) + ":" + pad(d.getMinutes())
  };
}

/* Runs the macro in the CALLING tab rather than a new one. The whole point of
 * the room model: the trainer cast this tab to the room's TV, so every tool has
 * to land here. Opening a new tab would put the tool on an uncast tab. */
async function runMacro(msg, tabId) {
  var startUrl = msg.startUrl;
  var steps = Array.isArray(msg.steps) ? msg.steps : [];
  if (!startUrl) return { ok: false, error: "Geen start-URL voor deze macro." };
  if (tabId == null) {
    // No sender tab (e.g. invoked from a context without one) — fall back to a
    // new tab so the action still works, just without the casting guarantee.
    var fresh = await chrome.tabs.create({ url: startUrl, active: true });
    tabId = fresh.id;
  } else {
    await chrome.tabs.update(tabId, { url: startUrl });
  }
  await waitForTabComplete(tabId, 20000);

  var res = await inject(tabId, steps, msg.context || {});

  // A step may hand back a URL instead of navigating itself (deriveNavigate).
  // It has to: assigning location.href inside the injected function destroys
  // its execution context mid-flight, so the promise never resolves and the
  // macro reports a false failure even though the page moved. Navigating from
  // here keeps the result intact, then we re-inject whatever steps remain.
  var hops = 0;
  while (res && res.ok && res.navigateTo && hops++ < 5) {
    var acted = res.acted || 0;
    var remaining = res.remaining || [];
    await chrome.tabs.update(tabId, { url: res.navigateTo });
    await waitForTabComplete(tabId, 20000);
    if (!remaining.length) return { ok: true, acted: acted };
    res = await inject(tabId, remaining, msg.context || {});
    if (res) res.acted = (res.acted || 0) + acted;
  }
  return res || { ok: false, error: "Geen resultaat van de pagina." };
}

async function inject(tabId, steps, context) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: replayInPage,
    args: [steps, context]
  });
  return results && results[0] ? results[0].result : null;
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
    // 15s per step made every failure feel like a hang — a type with no class
    // could take a minute to say so. The roster is now checked up front via the
    // API, so a step that cannot find its element is genuinely missing rather
    // than slow. 5s still covers the Dexos grid's AJAX reload (~2-3s observed)
    // with headroom.
    var STEP_TIMEOUT = 5000;
    var SETTLE = 450;
    context = context || {};

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // Replace {{TYPE}}, {{TODAY_ISO}}, {{TODAY_D}}, {{TIME}}, {{WEEKDAY}} with the
    // live context so one recording follows the dropdown + current date.
    function subst(str) {
      if (typeof str !== "string") return str;
      return str
        // Fall back to the full type only when the field is ABSENT (a config
        // saved before these placeholders existed). An empty string is a
        // deliberate "no usable base" — e.g. "The Outdoor Project" suppresses
        // its own base — and must stay empty, or the suppression is undone here.
        .replace(/\{\{TYPE_ROSTER\}\}/g, context.typeRoster != null ? context.typeRoster : (context.type || ""))
        .replace(/\{\{TYPE_BASE\}\}/g, context.typeBase != null ? context.typeBase : (context.type || ""))
        // The Rooster tile's own picker — independent of the class-type dropdown.
        .replace(/\{\{ROSTER\}\}/g, context.roster || "")
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

      // A roster tile reads "<class name><start time>…", e.g. "Boksen19:00 - 20:00".
      // Capturing the leading name lets us prefer an EXACT class match over a
      // mere substring hit, which matters because class names nest:
      // "Boksen" ⊂ "Kickboksen" ⊂ "TeenFit kickboksen", and "Hyrox" ⊂ "Hyrox
      // strength". Without this, asking for Boksen at 17:00 would open the
      // 18:00 TeenFit kickboksen rather than the 19:00 adult class.
      var LEAD_RE = /^(.+?)(\d{1,2}):(\d{2})/;
      var activeNeedles = null;

      for (var c = 0; c < cands.length; c++) {
        var sel = cands[c];
        if (sel.indexOf("has/") !== 0) continue;
        var needles = sel.slice(4).split("&&").map(function (s) { return norm(s); }).filter(Boolean);
        // An empty needle list would match EVERY tile: the loop below never
        // runs, so `ok` stays true for anything carrying a time. That turned an
        // unresolvable type into "open some arbitrary class". Skip the candidate.
        if (!needles.length) continue;
        var nodes = document.querySelectorAll("a,button,div,td,li,tr,span,p");
        for (var i = 0; i < nodes.length; i++) {
          var txt = norm(nodes[i].textContent);
          var ok = true;
          for (var n = 0; n < needles.length; n++) { if (txt.indexOf(needles[n]) < 0) { ok = false; break; } }
          if (!ok || !visible(nodes[i])) continue;
          var m = TIME_RE.exec(nodes[i].textContent);
          if (!m) continue; // the bare label span carries no time — skip it
          var lead = LEAD_RE.exec(nodes[i].textContent.replace(/\s+/g, " ").trim());
          pool.push({
            el: nodes[i],
            min: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
            lead: lead ? norm(lead[1]) : null
          });
        }
        if (pool.length) { activeNeedles = needles; break; } // first matching selector wins
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

      // REQUIRE the tile's class name to BE the requested one — do not settle
      // for a tile that merely contains it.
      //
      // Substring matching as a last resort silently opened the wrong class:
      // "Strength" matched "Hyrox strength", "Core" matched "CoreFit",
      // "TeenFit Calisthenics" matched "TeenFit kickboksen". On a TV in front of
      // a class, the wrong workout is worse than no workout — an empty result
      // stops softly and leaves the trainer on the roster to pick by hand,
      // which is recoverable. A confidently wrong Coachboard is not.
      //
      // Only applies to a single-needle selector; the Dexos grid selector
      // (date && type) has no leading-name shape and keeps substring matching.
      if (activeNeedles && activeNeedles.length === 1) {
        pool = pool.filter(function (p) { return p.lead && p.lead === activeNeedles[0]; });
        if (!pool.length) return null;
      }

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
          // "soft": nothing is broken — the roster tab is open and already
          // switched to Alle roosters, so the trainer can pick the class by
          // hand. Reported as a hint, not a macro failure. Happens when the
          // class is not on today's schedule, or when the Dexos type name has
          // no counterpart on the roster (dashboard "Kickboksen" vs roster
          // "Boksen").
          if (!near) return done({ ok: false, soft: true, failedStep: i + 1, reason: "geen les van dit type vandaag — kies hem hieronder in het rooster", label: firstText(cands) });
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
          // Hand the URL back rather than assigning location.href: navigating
          // from here would tear down this execution context before the promise
          // resolves, and the macro would report a false failure. runMacro
          // navigates the tab and re-injects the steps after this one.
          return done({ ok: true, navigateTo: dest, remaining: steps.slice(i + 1), acted: acted + 1 });
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
