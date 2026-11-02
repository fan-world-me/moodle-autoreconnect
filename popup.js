const $ = id => document.getElementById(id);

const STATUS_MAP = {
  ok:       { label: "Сесія жива",            dot: "ok"       },
  relogged: { label: "Щойно перелогінились",  dot: "relogged" },
  error:    { label: "Помилка входу",          dot: "error"    },
  off:      { label: "Вимкнено",              dot: ""         },
  idle:     { label: "Очікує перевірки",       dot: ""         },
  logout:   { label: "Вийшли вручну",          dot: "logout"   },
};

// user/pass зберігаються в storage.sync — виживають після видалення/перевстановлення
// решта (enabled, autoReload, статус) — в storage.local

(async () => {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(["user", "pass"]),
    chrome.storage.local.get(["enabled", "autoReload", "lastStatus", "lastStatusTime", "manualLogout"])
  ]);
  $("user").value         = sync.user  || "";
  $("pass").value         = sync.pass  || "";
  $("enabled").checked    = local.enabled    !== false;
  $("autoReload").checked = local.autoReload !== false;
  renderStatus(local.lastStatus, local.lastStatusTime);
  renderLogoutWarn(local.manualLogout, local.lastStatus);
})();

$("save").onclick = async () => {
  await Promise.all([
    chrome.storage.sync.set({
      user: $("user").value.trim(),
      pass: $("pass").value,
    }),
    chrome.storage.local.set({
      enabled:    $("enabled").checked,
      autoReload: $("autoReload").checked,
    })
  ]);
  chrome.runtime.sendMessage({ type: "RESET_MANUAL_LOGOUT" }, () => {});
  $("logoutWarn").style.display = "none";
  $("save").textContent = "Збережено ✓";
  setTimeout(() => { $("save").textContent = "Зберегти"; }, 1800);
};

$("enabled").onchange    = () => chrome.storage.local.set({ enabled:    $("enabled").checked    });
$("autoReload").onchange = () => chrome.storage.local.set({ autoReload: $("autoReload").checked });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.lastStatus || changes.lastStatusTime || changes.manualLogout)) {
    chrome.storage.local.get(["lastStatus", "lastStatusTime", "manualLogout"], d => {
      renderStatus(d.lastStatus, d.lastStatusTime);
      renderLogoutWarn(d.manualLogout, d.lastStatus);
    });
  }
});

function renderStatus(status, time) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.idle;
  $("statusLabel").textContent = cfg.label;
  $("statusTime").textContent  = time ? new Date(time).toLocaleTimeString("uk-UA") : "";
  const dot = $("statusDot");
  dot.className = "status-dot" + (cfg.dot ? " " + cfg.dot : "");
}

function renderLogoutWarn(manualLogout, status) {
  $("logoutWarn").style.display = (manualLogout || status === "logout") ? "block" : "none";
}
