(async () => {
  const { enabled } = await chrome.storage.local.get(["enabled"]);
  if (enabled === false) return;

  injectStyles();

  const SITE_URL   = "https://fan-world-me.github.io/";
  const REPO_URL   = "https://github.com/fan-world-me/moodle-autoreconnect";
  const AUTHOR_URL = "https://github.com/fan-world-me";

  injectHeaderWidget();
  hideFooter();
  detectManualLogout();
  await handleLoginPageIfNeeded();
  checkSessionAndReact();

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === "SESSION_RELOGGED") {
      if (msg.autoReload) {
        location.reload();          // миттєво, без затримки
      } else {
        showManualReloadToast();    // плашка «оновити вручну»
      }
    }
    if (msg?.type === "LOGIN_REDIRECT_START") showRedirectOverlay();
    if (msg?.type === "LOGIN_REDIRECT_DONE")  hideRedirectOverlay();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.lastStatus) updateDot();
  });

  // ── детект ручного виходу ─────────────────────────────────────
  function detectManualLogout() {
    document.addEventListener("click", e => {
      const a = e.target.closest("a");
      if (a?.href?.includes("/login/logout.php")) {
        chrome.runtime.sendMessage({ type: "MANUAL_LOGOUT" });
      }
    }, { capture: true });
  }

  // ── сторінка логіну: автозаповнення і submit ──────────────────
  async function handleLoginPageIfNeeded() {
    const onLoginPage = location.pathname.startsWith("/login/index.php");
    const loginForm   = document.querySelector("form#login");
    if (!onLoginPage || !loginForm) return;

    const { user, pass, manualLogout } = await chrome.storage.local.get(["user","pass","manualLogout"]);
    if (!user || !pass || manualLogout) return;
    if (document.querySelector("#loginerrormessage, .loginerrors, .alert-danger")) return;

    const now = Date.now();
    const d   = await chrome.storage.local.get(["tries"]);
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

  // ── детект розлогіна на звичайній сторінці ───────────────────
  function checkSessionAndReact() {
    if (location.pathname.startsWith("/login/")) return;
    if (!document.querySelector(".usermenu, [data-region='user-menu']")) {
      chrome.runtime.sendMessage({ type: "NO_SESSION_DETECTED" });
    }
  }

  // ── overlay «автоматичний вхід…» ─────────────────────────────
  function showRedirectOverlay() {
    if (document.getElementById("__mar_overlay")) return;
    const el = document.createElement("div");
    el.id = "__mar_overlay";
    el.innerHTML = `
      <div class="__mar_ov_card">
        <div class="__mar_ov_spinner"></div>
        <div class="__mar_ov_title">Автоматичний вхід…</div>
        <div class="__mar_ov_sub">Отримуємо сесію та перенаправляємо вас</div>
        <div class="__mar_ov_links">
          <a href="${SITE_URL}"   target="_blank" rel="noopener">Сайт розробника</a>
          <span class="__mar_ov_dot_sep">·</span>
          <a href="${REPO_URL}"   target="_blank" rel="noopener">Проєкт</a>
          <span class="__mar_ov_dot_sep">·</span>
          <a href="${AUTHOR_URL}" target="_blank" rel="noopener">@fan-world-me</a>
        </div>
      </div>`;
    document.body.appendChild(el);
  }

  function hideRedirectOverlay() {
    document.getElementById("__mar_overlay")?.remove();
  }

  // ── тост «оновіть вручну» ─────────────────────────────────────
  function showManualReloadToast() {
    if (document.getElementById("__mar_toast")) return;
    const t = document.createElement("div");
    t.id = "__mar_toast";
    t.innerHTML = `
      <span>🔄 Сесія оновлена</span>
      <button class="__mar_toast_btn" onclick="location.reload()">Оновити</button>
      <button class="__mar_toast_close" id="__mar_toast_x">✕</button>
    `;
    document.body.appendChild(t);
    document.getElementById("__mar_toast_x").onclick = () => t.remove();
    setTimeout(() => t.remove(), 12000);
  }

  // ── виджет у шапці ────────────────────────────────────────────
  function injectHeaderWidget() {
    if (document.getElementById("__mar_widget")) return;
    const header = findHeaderContainer();
    if (!header) return;

    const wrap = document.createElement("div");
    wrap.id = "__mar_widget";
    wrap.innerHTML = `
      <span class="__mar_dot" id="__mar_dot"></span>
      <span class="__mar_label">Авто-реконект</span>
      <a href="${REPO_URL}" target="_blank" rel="noopener" class="__mar_gh" title="GitHub">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
          0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
          -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
          .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
          -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
          1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
          1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
          1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
    `;
    header.appendChild(wrap);
    updateDot();
  }

  function findHeaderContainer() {
    for (const sel of [
      "#page-header .headerandnav",
      "#page-header .d-flex.flex-wrap",
      "header#page-header",
      "#page-header",
      ".page-header-headings",
      "nav.navbar .container-fluid"
    ]) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function updateDot() {
    const dot = document.getElementById("__mar_dot");
    if (!dot) return;
    const { lastStatus } = await chrome.storage.local.get(["lastStatus"]);
    const colors = {
      ok: "#00e5ff", relogged: "#00e5b0",
      error: "#ff4d6a", logout: "#ff4d6a",
      off: "#6f8791", idle: "#6f8791"
    };
    dot.style.background = colors[lastStatus] || colors.idle;
    dot.style.boxShadow  = `0 0 7px ${colors[lastStatus] || colors.idle}`;
  }

  function hideFooter() {
    const footer = document.getElementById("page-footer");
    if (footer) { footer.style.display = "none"; return; }
    const obs = new MutationObserver(() => {
      const f = document.getElementById("page-footer");
      if (f) { f.style.display = "none"; obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── стилі ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("__mar_style")) return;
    const s = document.createElement("style");
    s.id = "__mar_style";
    s.textContent = `
      /* widget */
      #__mar_widget {
        display: inline-flex; align-items: center; gap: 6px;
        margin-left: 12px; padding: 5px 11px;
        background: rgba(6,20,36,0.62);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(100,220,255,0.2);
        border-radius: 999px;
        font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
        font-size: 11px; font-weight: 600; color: #9fe8ff;
        box-shadow: 0 2px 12px rgba(0,200,255,0.12);
        white-space: nowrap; vertical-align: middle;
        transition: border-color .2s;
      }
      #__mar_widget:hover { border-color: rgba(0,229,255,0.4); }
      .__mar_dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #6f8791; box-shadow: 0 0 6px #6f8791;
        flex-shrink: 0; transition: background .3s, box-shadow .3s;
      }
      .__mar_label { line-height: 1; }
      .__mar_gh {
        display: flex; align-items: center;
        color: #9fe8ff; opacity: .75;
        transition: opacity .15s;
        text-decoration: none;
      }
      .__mar_gh:hover { opacity: 1; }

      /* manual-reload toast */
      #__mar_toast {
        position: fixed; bottom: 20px; right: 20px; z-index: 999999;
        display: flex; align-items: center; gap: 10px;
        background: rgba(6,20,36,0.94);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(0,229,255,0.35);
        color: #e6f7ff; font-size: 12px;
        padding: 10px 14px; border-radius: 14px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.45);
        font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
        animation: __mar_slideIn .25s ease;
      }
      .__mar_toast_btn {
        padding: 4px 10px;
        background: linear-gradient(135deg,#7c3aed,#06b6d4);
        border: none; border-radius: 8px;
        color: #fff; font-size: 11px; font-weight: 600;
        font-family: inherit; cursor: pointer;
        transition: opacity .15s;
      }
      .__mar_toast_btn:hover { opacity: .85; }
      .__mar_toast_close {
        background: none; border: none;
        color: #6f8791; font-size: 12px; cursor: pointer;
        padding: 0 2px; line-height: 1;
        transition: color .15s;
      }
      .__mar_toast_close:hover { color: #9fe8ff; }

      /* redirect overlay */
      #__mar_overlay {
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(4,14,22,0.88);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        display: flex; align-items: center; justify-content: center;
        animation: __mar_fadeIn .3s ease;
      }
      .__mar_ov_card {
        display: flex; flex-direction: column; align-items: center; gap: 14px;
        padding: 36px 40px;
        background: rgba(6,20,36,0.72);
        border: 1px solid rgba(100,220,255,0.2);
        border-radius: 24px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,255,0.06);
        text-align: center;
        font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
      }
      .__mar_ov_spinner {
        width: 40px; height: 40px;
        border: 3px solid rgba(0,200,255,0.15);
        border-top-color: #00c8ff;
        border-radius: 50%;
        animation: __mar_spin .8s linear infinite;
      }
      .__mar_ov_title {
        font-size: 16px; font-weight: 700;
        color: #e6f7ff; letter-spacing: .01em;
      }
      .__mar_ov_sub {
        font-size: 12px; color: #9fe8ff; margin-top: -6px;
      }
      .__mar_ov_links {
        display: flex; align-items: center; gap: 8px;
        flex-wrap: wrap; justify-content: center;
        font-size: 11px; margin-top: 4px;
      }
      .__mar_ov_links a {
        color: rgba(0,200,255,0.75); text-decoration: none;
        transition: color .15s;
      }
      .__mar_ov_links a:hover { color: #00e5ff; }
      .__mar_ov_dot_sep { color: rgba(100,220,255,0.3); }

      /* keyframes */
      @keyframes __mar_spin    { to { transform: rotate(360deg); } }
      @keyframes __mar_fadeIn  { from { opacity:0 } to { opacity:1 } }
      @keyframes __mar_slideIn { from { transform: translateY(12px); opacity:0 } to { transform: translateY(0); opacity:1 } }
    `;
    document.head.appendChild(s);
  }
})();
