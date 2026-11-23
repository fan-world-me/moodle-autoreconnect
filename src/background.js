const BASE = "https://moodle.econom.zp.ua";
const HOST_PATTERN = "https://moodle.econom.zp.ua/*";
const ALARM_NAME = "keepalive";
const INTERVAL_MIN = 10;

// ---------- утилиты ----------

// user/pass — в storage.sync (зберігається після видалення розширення, синхронізується між пристроями)
// решта    — в storage.local (статус, tries, флаги)

async function getCredentials() {
  // Основне сховище — storage.local
  // Відновлення з localStorage moodle відбувається в content.js при кожному завантаженні сторінки
  const d = await chrome.storage.local.get(["user", "pass"]);
  // Fallback: спробувати sync (якщо є акаунт Chrome)
  if (!d.user) {
    try {
      const s = await chrome.storage.sync.get(["user", "pass"]);
      if (s.user) {
        await chrome.storage.local.set({ user: s.user, pass: s.pass });
        return { user: s.user, pass: s.pass || "" };
      }
    } catch (_) {}
  }
  return { user: d.user || "", pass: d.pass || "" };
}

async function getSettings() {
  const [creds, d] = await Promise.all([
    getCredentials(),
    chrome.storage.local.get(["enabled", "tries", "lastStatus", "autoReload", "manualLogout"])
  ]);
  return {
    user: creds.user,
    pass: creds.pass,
    enabled: d.enabled !== false,
    tries: d.tries || [],
    lastStatus: d.lastStatus || "idle",
    autoReload: d.autoReload !== false,
    manualLogout: d.manualLogout === true
  };
}

async function setStatus(status) {
  await chrome.storage.local.set({ lastStatus: status, lastStatusTime: Date.now() });
  updateBadge(status);
}

function updateBadge(status) {
  const map = {
    ok:          { text: "",    color: "#00c851" },
    relogged:    { text: "↻",   color: "#00c851" },
    error:       { text: "!",   color: "#ff4444" },
    idle:        { text: "",    color: "#888888" },
    off:         { text: "off", color: "#888888" },
    logout:      { text: "!",   color: "#ff4444" }
  };
  const cfg = map[status] || map.idle;
  // Chrome MV3 -> chrome.action, Firefox MV2 -> chrome.browserAction
  const act = chrome.action || chrome.browserAction;
  if (!act) return;
  try {
    act.setBadgeText({ text: cfg.text });
    act.setBadgeBackgroundColor({ color: cfg.color });
  } catch (_) {}
}

async function hasMoodleTabOpen() {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  return tabs.length > 0;
}

async function notifyTabs(autoReload) {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  for (const tab of tabs) {
    // ці вкладки чекають у early.js і самі підуть на потрібну сторінку
    if (_pendingTabs.has(tab.id)) continue;
    // не перезавантажуємо вкладку якщо вона зараз на сторінці логіну
    // (там content.js сам зробить submit і редірект)
    if (tab.url && tab.url.includes("/login/")) continue;
    chrome.tabs.sendMessage(tab.id, { type: "SESSION_RELOGGED", autoReload }).catch(() => {});
  }
}

// ---------- основна логіка ----------

async function isLoggedIn() {
  const res = await fetch(`${BASE}/my/`, { credentials: "include", redirect: "follow" });
  try { res.body && res.body.cancel(); } catch (_) {}
  return !res.url.includes("/login/index.php");
}

async function markVerified() {
  await chrome.storage.local.set({ verifiedAt: Date.now() });
}

async function login() {
  return (await loginDetailed()).ok;
}

// Повертає { ok, url } — url це сторінка, куди Moodle редіректнув після входу
// (тобто початкова wantsurl, якщо вона була збережена в сесії).
async function loginDetailed() {
  const { user, pass, tries, autoReload } = await getSettings();
  if (!user || !pass) {
    await setStatus("error");
    return { ok: false, url: "" };
  }

  const now = Date.now();
  const recent = tries.filter(t => now - t < 120000);
  if (recent.length >= 3) {
    await setStatus("error");
    return { ok: false, url: "" };
  }
  recent.push(now);
  await chrome.storage.local.set({ tries: recent });

  try {
    const page = await fetch(`${BASE}/login/index.php`, { credentials: "include" });
    const html = await page.text();
    const token = (html.match(/name="logintoken" value="([^"]+)"/) || [])[1] || "";

    const res = await fetch(`${BASE}/login/index.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: user, password: pass, logintoken: token })
    });

    const okNow = !res.url.includes("/login/index.php") || (await isLoggedIn());
    await setStatus(okNow ? "relogged" : "error");
    if (okNow) {
      await markVerified();
      notifyTabs(autoReload);
    } else {
      await chrome.storage.local.set({ verifiedAt: 0 });
    }
    const dest = res.url && !res.url.includes("/login/") && res.url.startsWith(BASE) ? res.url : "";
    return { ok: okNow, url: dest };
  } catch (e) {
    console.error("moodle-relogin: login failed", e);
    await setStatus("error");
    return { ok: false, url: "" };
  }
}

// ---------- гарантія сесії (викликається ДО рендеру сторінки) ----------
// Вкладки, які зараз чекають у early.js / на блокуючому запиті.
const _pendingTabs = new Set();
let _ensurePromise = null;
const FAST_TTL_MS = 30000; // стільки секунд сесія вважається перевіреною

// -> { ok, relogged, url?, reason? }
function ensureSession(tabId) {
  if (tabId != null && tabId >= 0) _pendingTabs.add(tabId);
  if (_ensurePromise) return _ensurePromise;

  _ensurePromise = (async () => {
    const s = await getSettings();
    if (!s.enabled)      return { ok: false, reason: "disabled" };
    if (s.manualLogout)  return { ok: false, reason: "manualLogout" };
    if (!s.user || !s.pass) return { ok: false, reason: "nocreds" };

    const { verifiedAt = 0 } = await chrome.storage.local.get(["verifiedAt"]);
    if (Date.now() - verifiedAt < FAST_TTL_MS) return { ok: true, relogged: false, cached: true };

    try {
      if (await isLoggedIn()) {
        await markVerified();
        await setStatus("ok");
        return { ok: true, relogged: false };
      }
    } catch (e) {
      return { ok: false, reason: "network" };
    }

    const r = await loginDetailed();
    return r.ok ? { ok: true, relogged: true, url: r.url } : { ok: false, reason: "loginfailed" };
  })().finally(() => {
    _ensurePromise = null;
    // дати notifyTabs час відпрацювати, потім очистити
    setTimeout(() => _pendingTabs.clear(), 1500);
  });

  return _ensurePromise;
}

async function tick() {
  const { enabled, manualLogout } = await getSettings();
  if (!enabled) { await setStatus("off"); return; }

  // Якщо юзер вийшов вручну — не логінимось, показуємо стан logout
  if (manualLogout) { await setStatus("logout"); return; }

  if (!(await hasMoodleTabOpen())) return;

  try {
    const ok = await isLoggedIn();
    if (ok) {
      await markVerified();
      await setStatus("ok");
    } else {
      await login();
    }
  } catch (e) {
    console.error("moodle-relogin: check failed", e);
    await setStatus("error");
  }
}

// ---------- перехват редіректу на логін ----------
// Коли браузер збирається відкрити /login/index.php?wantsurl=... — перехоплюємо,
// логінимось в фоні і кидаємо вкладку на оригінальний URL.
chrome.webNavigation && chrome.webNavigation.onBeforeNavigate
  ? null
  : null; // webNavigation нема в MV3 без декларації — використовуємо tabs.onUpdated

async function handleLoginRedirect(tabId, url) {
  // Запасний варіант: основну роботу робить early.js ще до рендеру.
  const { enabled, manualLogout } = await getSettings();
  if (!enabled || manualLogout) return;

  let wantsUrl = null;
  try {
    const u = new URL(url);
    wantsUrl = u.searchParams.get("wantsurl");
  } catch (_) { return; }

  if (!wantsUrl) return;

  chrome.tabs.sendMessage(tabId, { type: "LOGIN_REDIRECT_START" }).catch(() => {});

  const r = await ensureSession(tabId);
  if (r.ok) {
    // early.js міг вже перекинути вкладку — не чіпаємо її вдруге
    const cur = await chrome.tabs.get(tabId).catch(() => null);
    if (!cur || !cur.url || !cur.url.includes("/login/index.php")) return;
    const target = wantsUrl.startsWith("http") ? wantsUrl : BASE + wantsUrl;
    chrome.tabs.update(tabId, { url: target });
  } else {
    chrome.tabs.sendMessage(tabId, { type: "LOGIN_REDIRECT_DONE" }).catch(() => {});
  }
}

// ---------- Firefox: справжня пауза завантаження ----------
// У Firefox (MV2) блокуючий webRequest може асинхронно утримати запит сторінки,
// поки ми не переконались, що сесія жива (або не залогінились).
// У Chrome MV3 так зробити не можна — там працює early.js (ховає сторінку).
(function setupBlockingGate() {
  try {
    const mf = chrome.runtime.getManifest();
    if (mf.manifest_version !== 2 || !chrome.webRequest || !chrome.webRequest.onBeforeRequest) return;

    const SKIP = /^\/(pluginfile\.php|draftfile\.php|tokenpluginfile\.php|webservice\/|lib\/ajax\/|login\/|theme\/|repository\/)/;
    const api = typeof browser !== "undefined" ? browser : chrome;

    api.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.method !== "GET" || details.tabId < 0) return {};
        let path = "";
        try { path = new URL(details.url).pathname; } catch (_) { return {}; }
        if (SKIP.test(path)) return {};
        // не тримаємо сторінку довше 8 секунд
        const timeout = new Promise(res => setTimeout(res, 8000));
        return Promise.race([ensureSession(details.tabId).catch(() => null), timeout]).then(() => ({}));
      },
      { urls: [HOST_PATTERN], types: ["main_frame"] },
      ["blocking"]
    );
  } catch (e) {
    console.error("moodle-relogin: blocking gate not available", e);
  }
})();

// ---------- події ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  tick();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  tick();
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM_NAME) tick(); });

let _tickDebounceTimer = null;
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  if (!tab.url.startsWith(BASE)) return;

  // Перехват редіректу: вкладка потрапила на /login/index.php?wantsurl=...
  if (tab.url.includes("/login/index.php") && tab.url.includes("wantsurl=")) {
    handleLoginRedirect(tabId, tab.url);
    return;
  }

  clearTimeout(_tickDebounceTimer);
  _tickDebounceTimer = setTimeout(tick, 600);
});

// Повідомлення від content.js і popup.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "NO_SESSION_DETECTED") {
    login().then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg?.type === "ENSURE_SESSION") {
    ensureSession(sender.tab && sender.tab.id).then(sendResponse).catch(() => sendResponse({ ok: false, reason: "error" }));
    return true;
  }
  if (msg?.type === "FORCE_CHECK") {
    tick().then(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "GET_STATUS") {
    getSettings().then(s => sendResponse(s));
    return true;
  }
  // Юзер вручну натиснув "Вийти" на сайті
  if (msg?.type === "MANUAL_LOGOUT") {
    chrome.storage.local.set({ manualLogout: true, verifiedAt: 0 });
    setStatus("logout");
    sendResponse({ ok: true });
    return true;
  }
  // Юзер знову зберіг пароль або вмикає розширення — скидаємо manual logout
  if (msg?.type === "RESET_MANUAL_LOGOUT") {
    chrome.storage.local.set({ manualLogout: false });
    tick().then(() => sendResponse({ done: true }));
    return true;
  }
});
