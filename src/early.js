// early.js — запускається на document_start, ДО того як Moodle почне рендеритись.
//
// 1. Одразу ховає сторінку (нічого не блимає).
// 2. Просить background переконатись, що сесія жива (а якщо ні — залогінитись).
// 3. Сесія є  -> показує сторінку.
//    Залогінились -> одразу відкриває вже залогінену версію (на тій самій сторінці
//                    або на wantsurl, якщо нас викинуло на /login/).
//    Не вдалось / вимкнено / вийшли вручну -> показує сторінку як є.
// Страховка: через 8 с сторінка показується в будь-якому разі.
(() => {
  "use strict";
  if (window.top !== window) return;

  const PATH = location.pathname;
  const SKIP = /^\/(pluginfile\.php|draftfile\.php|tokenpluginfile\.php|webservice\/|lib\/ajax\/|login\/logout\.php|theme\/|repository\/)/;
  if (SKIP.test(PATH)) return;

  const STYLE_ID = "__mar_hide";
  const OV_ID    = "__mar_ov";
  const FAST_TTL_MS = 30000;   // має збігатись з background.js
  const FAILSAFE_MS = 8000;

  // ── ховаємо сторінку (синхронно, до першого кадру) ───────────
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    html > * { visibility: hidden !important; }
    html > #${OV_ID} { visibility: visible !important; }
    #${OV_ID} {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      background: #061424; color: #e6f7ff;
      font: 600 14px -apple-system, "Segoe UI", Inter, sans-serif;
    }
    #${OV_ID} i {
      width: 38px; height: 38px; border-radius: 50%;
      border: 3px solid rgba(0,200,255,.18); border-top-color: #00c8ff;
      animation: __mar_sp .8s linear infinite;
    }
    @keyframes __mar_sp { to { transform: rotate(360deg); } }
  `;
  (document.head || document.documentElement).appendChild(st);

  let done = false;
  let ovTimer = null;

  function setOverlayText(text) {
    let ov = document.getElementById(OV_ID);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = OV_ID;
      ov.innerHTML = "<i></i><span></span>";
      document.documentElement.appendChild(ov);
    }
    ov.querySelector("span").textContent = text;
  }

  function reveal() {
    if (done) return;
    done = true;
    clearTimeout(ovTimer);
    clearTimeout(failsafe);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(OV_ID)?.remove();
  }

  const failsafe = setTimeout(reveal, FAILSAFE_MS);

  function send(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r || null); });
      } catch (_) { resolve(null); }
    });
  }

  // захист від безкінечних редіректів: не більше 3 переходів за хвилину
  function navigateGuarded(url) {
    try {
      const k = "__mar_nav", now = Date.now();
      const arr = JSON.parse(sessionStorage.getItem(k) || "[]").filter(t => now - t < 60000);
      if (arr.length >= 3) return false;
      arr.push(now);
      sessionStorage.setItem(k, JSON.stringify(arr));
    } catch (_) {}
    location.replace(url);
    return true;
  }

  function sameOrigin(url) {
    try { return new URL(url, location.origin).origin === location.origin; } catch (_) { return false; }
  }

  (async () => {
    let cfg = {};
    try { cfg = await chrome.storage.local.get(["enabled", "manualLogout", "verifiedAt"]); }
    catch (_) { return reveal(); }

    if (cfg.enabled === false || cfg.manualLogout === true) return reveal();

    const onLogin = PATH.startsWith("/login/");

    // сесію перевіряли щойно — не чекаємо відповіді background
    if (!onLogin && Date.now() - (cfg.verifiedAt || 0) < FAST_TTL_MS) return reveal();

    // показуємо спінер лише якщо перевірка затягнулась
    ovTimer = setTimeout(() => setOverlayText("Перевірка сесії…"), 250);

    const res = await send({ type: "ENSURE_SESSION" });
    clearTimeout(ovTimer);
    if (done) return;
    if (!res || !res.ok) return reveal();   // логін неможливий -> показуємо як є

    if (onLogin) {
      // нас викинуло на сторінку логіну — йдемо одразу на потрібну сторінку
      let target = "";
      try { target = new URL(location.href).searchParams.get("wantsurl") || ""; } catch (_) {}
      if (!target || !sameOrigin(target)) target = res.url || (location.origin + "/my/");
      setOverlayText("Входимо…");
      if (!navigateGuarded(target)) reveal();
      return;
    }

    if (res.relogged) {
      // сторінка завантажилась як гостьова — перезавантажуємо вже із сесією
      setOverlayText("Входимо…");
      if (!navigateGuarded(location.href)) reveal();
      return;
    }

    reveal();
  })();
})();
