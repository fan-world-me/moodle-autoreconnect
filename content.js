(async () => {
  const { enabled } = await chrome.storage.local.get(["enabled"]);
  if (enabled === false) return;

  injectStyles();

  const REPO_URL = "https://github.com/fan-world-me/moodle-autoreconnect";

  injectHeaderWidget();
  hideFooter();
  await handleLoginPageIfNeeded();
  checkSessionAndReact();

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === "SESSION_RELOGGED") showToast();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.lastStatus) updateDot();
  });

  // ---------- страница логина: страховка ----------
  async function handleLoginPageIfNeeded() {
    const onLoginPage = location.pathname.startsWith("/login/index.php");
    const loginForm = document.querySelector("form#login");
    if (!onLoginPage || !loginForm) return;

    const { user, pass } = await chrome.storage.local.get(["user", "pass"]);
    if (!user || !pass) return;
    if (document.querySelector("#loginerrormessage, .loginerrors, .alert-danger")) return;

    const now = Date.now();
    // Використовуємо той самий ключ "tries", що й background.js — спільний лімит 3 спроби за 2 хв.
    // Це запобігає ситуації, коли content.js та background.js разом роблять 3+3=6 спроб.
    const d = await chrome.storage.local.get(["tries"]);
    let tries = (d.tries || []).filter(t => now - t < 120000);
    if (tries.length >= 3) return;
    tries.push(now);
    await chrome.storage.local.set({ tries });

    const u = document.querySelector("#username");
    const p = document.querySelector("#password");
    if (!u || !p) return;
    u.value = user;
    p.value = pass;
    loginForm.submit();
  }

  // ---------- любая другая страница: детект разлогина ----------
  // ---------- будь-яка інша сторінка: детект розлогіна ----------
  // На /login/ немає .usermenu за визначенням — handleLoginPageIfNeeded() вже обробляє цей кейс.
  // Паралельне NO_SESSION_DETECTED звідси спричинило б подвійну спробу логіна з background.js.
  function checkSessionAndReact() {
    if (location.pathname.startsWith("/login/")) return;
    const loggedOut = !document.querySelector(".usermenu, [data-region='user-menu']");
    if (loggedOut) {
      chrome.runtime.sendMessage({ type: "NO_SESSION_DETECTED" });
    }
  }

  // ---------- виджет в шапке ----------
  function injectHeaderWidget() {
    if (document.getElementById("__mar_widget")) return;

    const header = findHeaderContainer();
    if (!header) return;

    const wrap = document.createElement("div");
    wrap.id = "__mar_widget";
    wrap.innerHTML = `
      <span class="__mar_dot" id="__mar_dot"></span>
      <span class="__mar_label">Авто-реконект</span>
      <a href="${REPO_URL}" target="_blank" rel="noopener" class="__mar_gh" title="GitHub репозиторій">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
          0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
          -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07
          -1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12
          0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27
          1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15
          0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2
          0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
    `;
    header.appendChild(wrap);
    updateDot();
  }

  function findHeaderContainer() {
    const selectors = [
      "#page-header .headerandnav",
      "#page-header .d-flex.flex-wrap",
      "header#page-header",
      "#page-header",
      ".page-header-headings",
      "nav.navbar .container-fluid"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function updateDot() {
    const dot = document.getElementById("__mar_dot");
    if (!dot) return;
    const s = await chrome.storage.local.get(["lastStatus"]);
    const map = { ok: "#00e5ff", relogged: "#00e5ff", error: "#ff4444", off: "#6f8791", idle: "#6f8791" };
    dot.style.background = map[s.lastStatus] || map.idle;
  }

  function hideFooter() {
    const footer = document.getElementById("page-footer");
    if (footer) {
      footer.style.display = "none";
    } else {
      // Якщо футер ще не в DOM — чекаємо
      const observer = new MutationObserver(() => {
        const f = document.getElementById("page-footer");
        if (f) { f.style.display = "none"; observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function showToast() {
    if (document.getElementById("__mar_toast")) return;
    const t = document.createElement("div");
    t.id = "__mar_toast";
    t.textContent = "Сесія Moodle оновлена — оновіть сторінку";
    t.onclick = () => location.reload();
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 8000);
  }

  function injectStyles() {
    if (document.getElementById("__mar_style")) return;
    const s = document.createElement("style");
    s.id = "__mar_style";
    s.textContent = `
      #__mar_widget {
        display: inline-flex; align-items: center; gap: 6px;
        margin-left: 12px; padding: 5px 10px;
        background: rgba(6,20,36,0.55);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(77,220,255,0.3);
        border-radius: 999px;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 11px; font-weight: 600; color: #9fe8ff;
        box-shadow: 0 2px 10px rgba(0,229,255,0.15);
        white-space: nowrap; vertical-align: middle;
      }
      .__mar_dot { width: 7px; height: 7px; border-radius: 50%; background:#6f8791; box-shadow: 0 0 6px currentColor; flex-shrink:0; }
      .__mar_label { line-height: 1; }
      .__mar_gh { display:flex; align-items:center; color:#9fe8ff; opacity:.8; transition:opacity .15s; }
      .__mar_gh:hover { opacity:1; }
      #__mar_toast {
        position: fixed; bottom: 20px; right: 20px; z-index: 999999;
        background: rgba(6,20,36,0.92); backdrop-filter: blur(14px);
        border: 1px solid rgba(0,229,255,0.4);
        color: #e6f7ff; font-size: 12px; padding: 10px 16px;
        border-radius: 12px; cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      }
    `;
    document.head.appendChild(s);
  }
})();
