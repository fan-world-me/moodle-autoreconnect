const BASE = "https://moodle.econom.zp.ua";
const HOST_PATTERN = "https://moodle.econom.zp.ua/*";
const ALARM_NAME = "keepalive";
const INTERVAL_MIN = 10; // держим с большим запасом от sessiontimeout=3600 (60 мин)

// ---------- утилиты ----------

async function getSettings() {
  const d = await chrome.storage.local.get(["user", "pass", "enabled", "tries", "lastStatus"]);
  return {
    user: d.user || "",
    pass: d.pass || "",
    enabled: d.enabled !== false, // по умолчанию включено
    tries: d.tries || [],
    lastStatus: d.lastStatus || "idle"
  };
}

async function setStatus(status) {
  await chrome.storage.local.set({ lastStatus: status, lastStatusTime: Date.now() });
  updateBadge(status);
}

function updateBadge(status) {
  const map = {
    ok: { text: "", color: "#00c851" },
    relogged: { text: "↻", color: "#00c851" },
    error: { text: "!", color: "#ff4444" },
    idle: { text: "", color: "#888888" },
    off: { text: "off", color: "#888888" }
  };
  const cfg = map[status] || map.idle;
  chrome.action.setBadgeText({ text: cfg.text });
  chrome.action.setBadgeBackgroundColor({ color: cfg.color });
}

async function hasMoodleTabOpen() {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  return tabs.length > 0;
}

async function notifyTabs() {
  const tabs = await chrome.tabs.query({ url: HOST_PATTERN });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: "SESSION_RELOGGED" }).catch(() => {});
  }
}

// ---------- основная логика ----------

async function isLoggedIn() {
  const res = await fetch(`${BASE}/my/`, { credentials: "include", redirect: "follow" });
  return !res.url.includes("/login/index.php");
}

async function login() {
  const { user, pass, tries } = await getSettings();
  if (!user || !pass) {
    await setStatus("error");
    return false;
  }

  const now = Date.now();
  const recent = tries.filter(t => now - t < 120000);
  if (recent.length >= 3) {
    await setStatus("error"); // защита от блокировки аккаунта за перебор
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

    // проверяем, что сервер реально принял сессию
    const okNow = !res.url.includes("/login/index.php") || (await isLoggedIn());
    await setStatus(okNow ? "relogged" : "error");
    if (okNow) notifyTabs();
    return okNow;
  } catch (e) {
    console.error("moodle-relogin: login failed", e);
    await setStatus("error");
    return false;
  }
}

async function tick() {
  const { enabled } = await getSettings();
  if (!enabled) { await setStatus("off"); return; }

  // если ни одной вкладки moodle не открыто - сессия никому не нужна, ничего не делаем
  if (!(await hasMoodleTabOpen())) return;

  try {
    const ok = await isLoggedIn(); // сам факт запроса уже продлевает сессию на сервере
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

// ---------- события ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  tick();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  tick();
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM_NAME) tick(); });

// Коли відкривається/оновлюється вкладка moodle — перевіряємо (не чекаємо 10 хвилин).
// Debounce 3 с: при швидкій навігації між сторінками tick() викликається лише раз,
// а не на кожен "complete" event підряд.
let _tickDebounceTimer = null;
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.url && tab.url.startsWith(BASE)) {
    clearTimeout(_tickDebounceTimer);
    _tickDebounceTimer = setTimeout(tick, 3000);
  }
});

// сообщения от content.js (страница без сессии на главной) и popup.js (сохранить/статус)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "NO_SESSION_DETECTED") {
    login().then(ok => sendResponse({ ok }));
    return true; // асинхронный ответ
  }
  if (msg?.type === "FORCE_CHECK") {
    tick().then(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "GET_STATUS") {
    getSettings().then(s => sendResponse(s));
    return true;
  }
});
