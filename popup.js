const $ = id => document.getElementById(id);

const STATUS_MAP = {
  ok:       { label: "Сесія жива",            dot: "ok"       },
  relogged: { label: "Щойно перелогінились",  dot: "relogged" },
  error:    { label: "Помилка входу",          dot: "error"    },
  off:      { label: "Вимкнено",              dot: ""         },
  idle:     { label: "Очікує перевірки",       dot: ""         },
  logout:   { label: "Вийшли вручну",          dot: "logout"   },
};

(async () => {
  const d = await chrome.storage.local.get(["user","pass","enabled","autoReload","lastStatus","lastStatusTime","manualLogout"]);
  $("user").value       = d.user || "";
  $("pass").value       = d.pass || "";
  $("enabled").checked  = d.enabled  !== false;
  $("autoReload").checked = d.autoReload !== false;
  renderStatus(d.lastStatus, d.lastStatusTime);
  renderLogoutWarn(d.manualLogout, d.lastStatus);
})();

$("save").onclick = async () => {
  await chrome.storage.local.set({
    user:       $("user").value.trim(),
    pass:       $("pass").value,
    enabled:    $("enabled").checked,
    autoReload: $("autoReload").checked,
  });
  chrome.runtime.sendMessage({ type: "RESET_MANUAL_LOGOUT" }, () => {});
  $("logoutWarn").style.display = "none";
  $("save").textContent = "Збережено ✓";
  setTimeout(() => { $("save").textContent = "Зберегти"; }, 1800);
};

$("enabled").onchange  = () => chrome.storage.local.set({ enabled:    $("enabled").checked  });
$("autoReload").onchange = () => chrome.storage.local.set({ autoReload: $("autoReload").checked });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lastStatus || changes.lastStatusTime || changes.manualLogout) {
    chrome.storage.local.get(["lastStatus","lastStatusTime","manualLogout"], d => {
      renderStatus(d.lastStatus, d.lastStatusTime);
      renderLogoutWarn(d.manualLogout, d.lastStatus);
    });
  }
});

function renderStatus(status, time) {
  const cfg  = STATUS_MAP[status] || STATUS_MAP.idle;
  $("statusLabel").textContent = cfg.label;
  $("statusTime").textContent  = time ? new Date(time).toLocaleTimeString("uk-UA") : "";
  const dot = $("statusDot");
  dot.className = "status-dot" + (cfg.dot ? " " + cfg.dot : "");
}

function renderLogoutWarn(manualLogout, status) {
  $("logoutWarn").style.display = (manualLogout || status === "logout") ? "block" : "none";
}
