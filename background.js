const BASE = "https://moodle.econom.zp.ua";
const HOST_PATTERN = "https://moodle.econom.zp.ua/*";
const ALARM_NAME = "keepalive";
const INTERVAL_MIN = 10;

// ---------- утилиты ----------

async function getSettings() {
  const d = await chrome.storage.local.get(["user", "pass", "enabled", "tries", "lastStatus", "autoReload", "manualLogout"]);
  return {
    user: d.user || "",
    pass: d.pass || "",
    enabled: d.enabled !== false,
    tries: d.tries || [],
    lastStatus: d.lastStatus || "idle",
    autoReload: d.autoReload !== false, // по умолчанию включено
    manualLogout: d.manualLogout === true // по умолчанию false
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
  chrome.action.setBadgeText({ text: cfg.text });
  chrome.action.setBadgeBackgroundColor({ color: cfg.color });
}

async function hasMoodleTabOpen() {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  return tabs.length > 0;
}

async function notifyTabs(autoReload) {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  for (const tab of tabs) {
    // не перезавантажуємо вкладку якщо вона зараз на сторінці логіну
    // (там content.js сам зробить submit і редірект)
    if (tab.url && tab.url.includes("/login/")) continue;
    chrome.tabs.sendMessage(tab.id, { type: "SESSION_RELOGGED", autoReload }).catch(() => {});
  }
}

// ---------- основна логіка ----------

async function isLoggedIn() {
  const res = await fetch(`${BASE}/my/`, { credentials: "include", redirect: "follow" });
  return !res.url.includes("/login/index.php");
}

async function login() {
  const { user, pass, tries, autoReload } = await getSettings();
  if (!user || !pass) {
    await setStatus("error");
    return false;
  }

  const now = Date.now();
  const recent = tries.filter(t => now - t < 120000);
  if (recent.length >= 3) {
    await setStatus("error");
    return false;
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
    if (okNow) notifyTabs(autoReload);
    return okNow;
  } catch (e) {
    console.error("moodle-relogin: login failed", e);
    await setStatus("error");
    return false;
  }
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
  const { enabled, manualLogout } = await getSettings();
  if (!enabled || manualLogout) return;

  let wantsUrl = null;
  try {
    const u = new URL(url);
    wantsUrl = u.searchParams.get("wantsurl");
  } catch (_) { return; }

  if (!wantsUrl) return;

  // Показуємо overlay в цій вкладці
  chrome.tabs.sendMessage(tabId, { type: "LOGIN_REDIRECT_START" }).catch(() => {});

  // Логінимось в фоні
  const ok = await login();
  if (ok) {
    // Після успішного логіну — відправляємо на потрібну сторінку
    const target = wantsUrl.startsWith("http") ? wantsUrl : BASE + wantsUrl;
    chrome.tabs.update(tabId, { url: target });
  } else {
    // Якщо не вдалось — прибираємо overlay
    chrome.tabs.sendMessage(tabId, { type: "LOGIN_REDIRECT_DONE" }).catch(() => {});
  }
}

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
    chrome.storage.local.set({ manualLogout: true });
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
