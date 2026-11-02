const $ = id => document.getElementById(id);

(async () => {
  const d = await chrome.storage.local.get(["user", "pass", "enabled", "autoReload", "lastStatus", "lastStatusTime", "manualLogout"]);
  $("user").value = d.user || "";
  $("pass").value = d.pass || "";
  $("enabled").checked = d.enabled !== false;
  $("autoReload").checked = d.autoReload !== false;
  renderStatus(d.lastStatus, d.lastStatusTime);
  renderLogoutWarn(d.manualLogout, d.lastStatus);
})();

$("save").onclick = async () => {
  await chrome.storage.local.set({
    user: $("user").value.trim(),
    pass: $("pass").value,
    enabled: $("enabled").checked,
    autoReload: $("autoReload").checked
  });
  // Якщо юзер зберігає налаштування — скидаємо флаг ручного виходу
  chrome.runtime.sendMessage({ type: "RESET_MANUAL_LOGOUT" }, () => {});
  $("status").textContent = "Збережено ✓";
  $("logout-warn").style.display = "none";
};

$("enabled").onchange = async () => {
  await chrome.storage.local.set({ enabled: $("enabled").checked });
};

$("autoReload").onchange = async () => {
  await chrome.storage.local.set({ autoReload: $("autoReload").checked });
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lastStatus || changes.lastStatusTime || changes.manualLogout) {
    chrome.storage.local.get(["lastStatus", "lastStatusTime", "manualLogout"], d => {
      renderStatus(d.lastStatus, d.lastStatusTime);
      renderLogoutWarn(d.manualLogout, d.lastStatus);
    });
  }
});

function renderStatus(status, time) {
  const labels = {
    ok:       "Сесія жива",
    relogged: "Щойно перелогінились",
    error:    "Помилка входу",
    off:      "Вимкнено",
    idle:     "Очікує перевірки",
    logout:   "Вийшли вручну"
  };
  const text = labels[status] || labels.idle;
  const when = time ? new Date(time).toLocaleTimeString("uk-UA") : "";
  $("status").textContent = when ? `${text} · ${when}` : text;
  $("status").style.color = (status === "error" || status === "logout") ? "#ff7070" : "#89cfe6";
}

function renderLogoutWarn(manualLogout, status) {
  $("logout-warn").style.display = (manualLogout || status === "logout") ? "block" : "none";
}
