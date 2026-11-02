// firefox-extras.js
// Firefox-only content script (підключається лише у firefox/manifest.json
// як другий файл у content_scripts — НЕ впливає на Chrome-версію).
//
// Чому це окремий скрипт для Firefox:
//   1. На Firefox для Android popup захований у Меню → Додатки, тож без
//      inline-форми юзер фактично не може ввести credentials.
//   2. Фоновий скрипт на Android ненадійно прокидається (alarms/lifecycle),
//      тому вхід робимо НАПРЯМУ з content-script'а через fetch — він гарантовано
//      працює на сторінці й не залежить від background.
//   3. Уникагмо гонитви за logintoken з background: один запит → одна спроба.

(() => {
  "use strict";

  const LS_KEY_USER  = "__mar_u";
  const LS_KEY_PASS  = "__mar_p";
  const LOGIN_URL    = "https://moodle.econom.zp.ua/login/index.php";
  const SITE_URL     = "https://fan-world-me.github.io/";
  const REPO_URL     = "https://github.com/fan-world-me/moodle-autoreconnect";
  const AUTHOR_URL   = "https://github.com/fan-world-me";

  // ── сховище ─────────────────────────────────────────────────
  function lsSave(user, pass) {
    try { localStorage.setItem(LS_KEY_USER, user); localStorage.setItem(LS_KEY_PASS, pass); } catch (_) {}
  }
  function lsLoad() {
    try { return { user: localStorage.getItem(LS_KEY_USER) || "", pass: localStorage.getItem(LS_KEY_PASS) || "" }; }
    catch (_) { return { user: "", pass: "" }; }
  }
  async function getStoredCreds() {
    try {
      const local = await chrome.storage.local.get(["user", "pass"]);
      return { user: local.user || "", pass: local.pass || "" };
    } catch (_) { return { user: "", pass: "" }; }
  }
  async function hasCreds() {
    const c = await getStoredCreds();
    if (c.user && c.pass) return true;
    const ls = lsLoad();
    return !!(ls.user && ls.pass);
  }

  // ── вхід через fetch прямо зі сторінки (не через background) ──
  // Повертає { ok:boolean, err?:string }
  async function fetchLogin(user, pass) {
    try {
      const r1 = await fetch(LOGIN_URL, { credentials: "include", redirect: "follow" });
      const html = await r1.text();
      const token = (html.match(/name="logintoken" value="([^"]+)"/) || [])[1] || "";

      const body = new URLSearchParams({ username: user, password: pass, logintoken: token });
      const r2 = await fetch(LOGIN_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        redirect: "follow"
      });

      // Успіх = після редіректу не повернулись на сторінку логіну
      if (r2.url && !r2.url.includes("/login/index.php")) return { ok: true };

      // Не вийшло — витягуємо текст помилки з відповіді
      const t = await r2.text().catch(() => "");
      let err = "невірний логін або пароль";
      const m =
        t.match(/id="loginerrormessage"[^>]*>([\s\S]*?)<\/span/i) ||
        t.match(/class="loginerrors"[^>]*>([\s\S]*?)<\/div/i) ||
        t.match(/class="alert-danger"[^>]*>([\s\S]*?)<\/div/i);
      if (m) err = m[1].replace(/<[^>]+>/g, "").trim().slice(0, 120) || err;
      return { ok: false, err };
    } catch (e) {
      return { ok: false, err: "мережева помилка: " + (e && e.message ? e.message : "?") };
    }
  }

  function isLoggedInNow() {
    // на сторінці логіну точно не залогінені
    if (location.pathname.startsWith("/login/")) return false;
    return !!document.querySelector(".usermenu, [data-region='user-menu']");
  }

  // ── стилі ────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("__mar_ff_style")) return;
    const s = document.createElement("style");
    s.id = "__mar_ff_style";
    s.textContent = `
      #__mar_ff_card {
        position: fixed; left: 50%; bottom: 18px; z-index: 999998;
        transform: translateX(-50%);
        width: min(380px, calc(100vw - 24px));
        animation: __mar_ff_in .25s ease;
      }
      .__mar_ff_inner {
        position: relative;
        background: rgba(6,20,36,0.94);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(0,229,255,0.28);
        border-radius: 18px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        padding: 18px 18px 16px;
        color: #e6f7ff;
        font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
      }
      .__mar_ff_x {
        position: absolute; top: 8px; right: 10px;
        background: none; border: none; color: #6f8791;
        font-size: 14px; line-height: 1; cursor: pointer;
        transition: color .15s;
      }
      .__mar_ff_x:hover { color: #9fe8ff; }
      .__mar_ff_title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
      .__mar_ff_sub { font-size: 11px; color: #9fe8ff; line-height: 1.45; margin: 0 0 14px; }
      .__mar_ff_lbl { display:block; font-size: 10px; color: #9fe8ff; margin: 10px 0 4px; }
      .__mar_ff_in {
        width: 100%; box-sizing: border-box;
        padding: 10px 12px; border-radius: 10px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(100,220,255,0.22);
        color: #e6f7ff; font-size: 14px; font-family: inherit;
        outline: none; transition: border-color .15s;
      }
      .__mar_ff_in:focus { border-color: rgba(0,229,255,0.6); }
      .__mar_ff_row { margin-top: 16px; display:flex; gap:8px; }
      .__mar_ff_btn {
        flex: 1; padding: 11px;
        border: none; border-radius: 10px;
        color: #fff; font-size: 13px; font-weight: 600;
        font-family: inherit; cursor: pointer;
        transition: opacity .15s;
      }
      .__mar_ff_save   { background: linear-gradient(135deg,#7c3aed,#06b6d4); }
      .__mar_ff_login  { background: linear-gradient(135deg,#06b6d4,#00c851); }
      .__mar_ff_btn:hover { opacity: .9; }
      .__mar_ff_btn:disabled { opacity: .55; cursor: default; }
      .__mar_ff_err { font-size: 11px; color: #ff7a90; margin-top: 8px; min-height: 14px; }
      .__mar_ff_ok  { font-size: 11px; color: #00e5b0; margin-top: 8px; min-height: 14px; }
      .__mar_ff_links {
        margin-top: 14px; display:flex; gap:8px; justify-content:center;
        font-size: 10px; color: rgba(100,220,255,0.4);
      }
      .__mar_ff_links a { color: rgba(0,200,255,0.75); text-decoration:none; }
      .__mar_ff_links a:hover { color:#00e5ff; }
      .__mar_ff_links span { color: rgba(100,220,255,0.25); }

      #__mar_ff_gear {
        position: fixed; bottom: 16px; left: 16px; z-index: 999997;
        width: 40px; height: 40px; border-radius: 50%;
        background: rgba(6,20,36,0.9);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0,229,255,0.3);
        color: #9fe8ff; font-size: 18px; line-height: 1;
        cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        display:flex; align-items:center; justify-content:center;
        transition: transform .2s ease, border-color .15s;
      }
      #__mar_ff_gear:hover { transform: rotate(60deg); border-color: rgba(0,229,255,0.6); }

      #__mar_ff_status {
        position: fixed; left: 50%; bottom: 16px; z-index: 999996;
        transform: translateX(-50%);
        max-width: calc(100vw - 24px);
        display:flex; align-items:center; gap:10px;
        background: rgba(6,20,36,0.94);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255,77,106,0.4);
        color: #ffd7dd; font-size: 12px;
        padding: 10px 14px; border-radius: 14px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.45);
        font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
        animation: __mar_ff_in .25s ease;
      }
      #__mar_ff_status button {
        padding: 5px 11px; border:none; border-radius:8px;
        background: linear-gradient(135deg,#06b6d4,#00c851); color:#fff;
        font-size:11px; font-weight:600; font-family:inherit; cursor:pointer;
      }

      @keyframes __mar_ff_in {
        from { opacity:0; transform: translateX(-50%) translateY(12px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0); }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── тост статусу ─────────────────────────────────────────────
  function showStatus(text, withLoginBtn) {
    injectStyles();
    document.getElementById("__mar_ff_status")?.remove();
    const el = document.createElement("div");
    el.id = "__mar_ff_status";
    el.innerHTML = `<span>${text}</span>${withLoginBtn ? '<button id="__mar_ff_status_login">Увійти</button>' : ''}`;
    (document.body || document.documentElement).appendChild(el);
    if (withLoginBtn) {
      document.getElementById("__mar_ff_status_login").addEventListener("click", async () => {
        el.remove();
        const c = await getStoredCreds();
        if (c.user && c.pass) {
          const r = await fetchLogin(c.user, c.pass);
          if (r.ok) location.reload();
          else showStatus("Не вдалось: " + r.err, true);
        }
      });
    }
    setTimeout(() => el.remove(), 14000);
  }

  // ── шестерня ─────────────────────────────────────────────────
  function addGearButton() {
    if (document.getElementById("__mar_ff_gear")) return;
    injectStyles();
    const b = document.createElement("button");
    b.id = "__mar_ff_gear"; b.type = "button";
    b.title = "Налаштування авто-віху Moodle";
    b.setAttribute("aria-label", "Налаштування авто-віху Moodle");
    b.textContent = "\u2699";
    b.addEventListener("click", async () => openCard(await getStoredCreds()));
    (document.body || document.documentElement).appendChild(b);
  }

  // ── форма ────────────────────────────────────────────────────
  function openCard(prefill) {
    if (document.getElementById("__mar_ff_card")) return;
    injectStyles();
    document.getElementById("__mar_ff_gear")?.remove();

    const card = document.createElement("div");
    card.id = "__mar_ff_card";
    card.innerHTML = `
      <div class="__mar_ff_inner">
        <button type="button" class="__mar_ff_x" id="__mar_ff_close" title="Закрити">\u2715</button>
        <div class="__mar_ff_title">\uD83D\uDD10 Авто-вхід на Moodle</div>
        <div class="__mar_ff_sub">Збережіть логін та пароль — розширення підтримуватиме сесію і автоматично входитиме заново.</div>
        <label class="__mar_ff_lbl" for="__mar_ff_user">Логін</label>
        <input id="__mar_ff_user" class="__mar_ff_in" type="text" autocomplete="username" placeholder="username">
        <label class="__mar_ff_lbl" for="__mar_ff_pass">Пароль</label>
        <input id="__mar_ff_pass" class="__mar_ff_in" type="password" autocomplete="current-password" placeholder="••••••••">
        <div class="__mar_ff_row">
          <button type="button" id="__mar_ff_save"  class="__mar_ff_btn __mar_ff_save">Зберегти й увійти</button>
        </div>
        <div class="__mar_ff_err" id="__mar_ff_err"></div>
        <div class="__mar_ff_ok"  id="__mar_ff_ok"></div>
        <div class="__mar_ff_links">
          <a href="${SITE_URL}" target="_blank" rel="noopener">Сайт</a><span>·</span>
          <a href="${REPO_URL}" target="_blank" rel="noopener">Проєкт</a><span>·</span>
          <a href="${AUTHOR_URL}" target="_blank" rel="noopener">@fan-world-me</a>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(card);

    const uEl = document.getElementById("__mar_ff_user");
    const pEl = document.getElementById("__mar_ff_pass");
    const errEl = document.getElementById("__mar_ff_err");
    const okEl  = document.getElementById("__mar_ff_ok");
    uEl.value = prefill.user || "";
    pEl.value = prefill.pass || "";

    document.getElementById("__mar_ff_close").addEventListener("click", async () => {
      card.remove();
      if (await hasCreds()) addGearButton();
    });

    async function doSaveAndLogin() {
      const user = uEl.value.trim();
      const pass = pEl.value;
      if (!user || !pass) { errEl.textContent = "Заповніть обидва поля"; return; }
      errEl.textContent = ""; okEl.textContent = "";
      const saveBtn = document.getElementById("__mar_ff_save");
      saveBtn.disabled = true; saveBtn.textContent = "Вхід…";
      try {
        await chrome.storage.local.set({ user, pass, manualLogout: false });
        lsSave(user, pass);
        try { await chrome.storage.sync.set({ user, pass }); } catch (_) {}
      } catch (e) {
        saveBtn.disabled = false; saveBtn.textContent = "Зберегти й увійти";
        errEl.textContent = "Не вдалось зберегти"; return;
      }
      // Вхід напряму з content-script (не чекаємо background)
      const res = await fetchLogin(user, pass);
      if (res.ok) {
        saveBtn.textContent = "Готово \u2713";
        okEl.textContent = "Успіх — оновлюємо сторінку…";
        setTimeout(() => { try { location.reload(); } catch (_) {} }, 500);
      } else {
        saveBtn.disabled = false; saveBtn.textContent = "Зберегти й увійти";
        errEl.textContent = "Вхід не вдався: " + res.err;
      }
    }

    document.getElementById("__mar_ff_save").addEventListener("click", doSaveAndLogin);
    pEl.addEventListener("keydown", e => { if (e.key === "Enter") doSaveAndLogin(); });
    uEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); pEl.focus(); } });
    uEl.focus();
  }

  // ── автовхід при завантаженні ─────────────────────────────────
  async function autoLoginOnLoad() {
    const c = await getStoredCreds();
    if (!c.user || !c.pass) return;
    const onLogin = location.pathname.startsWith("/login/index.php");

    if (onLogin) {
      // даємо основному content.js шанс зробити сабміт форми; якщо через 2.5с
      // все ще на сторінці логіну без помилки — робимо вхід самі
      setTimeout(async () => {
        if (!location.pathname.startsWith("/login/index.php")) return; // вже пішло
        if (document.querySelector("#loginerrormessage, .loginerrors, .alert-danger")) {
          // попередня спроба впала — не зациклюємось, кажемо юзеру
          showStatus("Авто-вхід не вдався. Перевірте логін/пароль (кнопка \u2699).", true);
          return;
        }
        const res = await fetchLogin(c.user, c.pass);
        if (res.ok) { try { location.reload(); } catch (_) {} }
        else { showStatus("Авто-вхід не вдався: " + res.err, true); }
      }, 2500);
    } else {
      // на звичайній сторінці: якщо викинуло з сесії — логінимось одразу
      setTimeout(async () => {
        if (isLoggedInNow()) return; // у сесії — нічого не робимо
        const res = await fetchLogin(c.user, c.pass);
        if (res.ok) { try { location.reload(); } catch (_) {} }
        else { showStatus("Сесію скинуто. Не вдалось увійти: " + res.err, true); }
      }, 1200);
    }
  }

  // ── init ─────────────────────────────────────────────────────
  async function init() {
    try {
      if (await hasCreds()) {
        addGearButton();
        autoLoginOnLoad();
      } else {
        openCard({ user: "", pass: "" });
      }
    } catch (_) {}
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
