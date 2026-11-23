const $ = id => document.getElementById(id);

const EXT_QUAZ = 'mcmcmdaeegfgjnmfpmadlhkebkabgomb';
const EXT_VSG  = 'hmenegnhakdjkeaklnndapfbphecimai';

function checkRelatedProjects() {
  if (!chrome.management) return;
  chrome.management.getAll((exts) => {
    if (chrome.runtime.lastError) return;
    const ids = new Set(exts.filter(e => e.enabled).map(e => e.id));
    const map = { 'proj-quaz': EXT_QUAZ, 'proj-vsg': EXT_VSG };
    for (const [elId, extId] of Object.entries(map)) {
      const el = document.getElementById(elId);
      if (el) el.style.display = ids.has(extId) ? 'none' : '';
    }
  });
}

checkRelatedProjects();

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
    chrome.storage.sync.get(["user", "pass"]).catch(() => ({})),
    chrome.storage.local.get(["user", "pass", "enabled", "autoReload", "lastStatus", "lastStatusTime", "manualLogout", "gate", "splash"])
  ]);
  // local має пріоритет (туди вже відновлено з localStorage moodle), sync як fallback
  $("user").value         = local.user  || sync.user  || "";
  $("pass").value         = local.pass  || sync.pass  || "";
  $("enabled").checked    = local.enabled    !== false;
  $("autoReload").checked = local.autoReload !== false;
  $("gate").checked       = local.gate       !== false;
  $("splash").checked     = local.splash     !== false;
  renderStatus(local.lastStatus, local.lastStatusTime);
  renderLogoutWarn(local.manualLogout, local.lastStatus);
})();

$("save").onclick = async () => {
  const user = $("user").value.trim();
  const pass = $("pass").value;
  await Promise.all([
    chrome.storage.local.set({ user, pass, enabled: $("enabled").checked, autoReload: $("autoReload").checked, gate: $("gate").checked, splash: $("splash").checked }),
    // sync як додатковий резерв (працює якщо є акаунт Chrome)
    chrome.storage.sync.set({ user, pass }).catch(() => {})
  ]);
  // Просимо content script записати в localStorage moodle
  chrome.tabs.query({ url: "https://moodle.econom.zp.ua/*" }, tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "SAVE_TO_LS", user, pass }).catch(() => {});
    }
  });
  chrome.runtime.sendMessage({ type: "RESET_MANUAL_LOGOUT" }, () => {});
  $("logoutWarn").style.display = "none";
  $("save").textContent = "Збережено ✓";
  setTimeout(() => { $("save").textContent = "Зберегти"; }, 1800);
};

$("enabled").onchange    = () => chrome.storage.local.set({ enabled:    $("enabled").checked    });
$("autoReload").onchange = () => chrome.storage.local.set({ autoReload: $("autoReload").checked });
$("gate").onchange       = () => chrome.storage.local.set({ gate:       $("gate").checked       });
$("splash").onchange     = () => chrome.storage.local.set({ splash:     $("splash").checked     });

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
