const $ = id => document.getElementById(id);

(async () => {
  const d = await chrome.storage.local.get(["user", "pass", "enabled", "lastStatus", "lastStatusTime"]);
  $("user").value = d.user || "";
  $("pass").value = d.pass || "";
  $("enabled").checked = d.enabled !== false;
  renderStatus(d.lastStatus, d.lastStatusTime);
})();

$("save").onclick = async () => {
  await chrome.storage.local.set({
    user: $("user").value.trim(),
    pass: $("pass").value,
    enabled: $("enabled").checked
  });
  $("status").textContent = "Збережено ✓";
  chrome.runtime.sendMessage({ type: "FORCE_CHECK" });
};

$("enabled").onchange = async () => {
  await chrome.storage.local.set({ enabled: $("enabled").checked });
};

function renderStatus(status, time) {
  const labels = {
    ok: "Сесія жива",
    relogged: "Щойно перелогінились",
    error: "Помилка входу",
    off: "Вимкнено",
    idle: "Очікує перевірки"
  };
  const text = labels[status] || labels.idle;
  const when = time ? new Date(time).toLocaleTimeString("uk-UA") : "";
  $("status").textContent = when ? `${text} · ${when}` : text;
}
