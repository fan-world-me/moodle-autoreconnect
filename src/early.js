// early.js — запускається на document_start, ДО того як Moodle почне рендеритись.
//
// 1. Одразу ховає сторінку (нічого не блимає).
// 2. Просить background переконатись, що сесія жива (а якщо ні — залогінитись).
//    Поки це триває — показує «gate»-сторінку в стилі fan_world_me з інфо про проєкт.
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

  const SITE_URL    = "https://fan-world-me.github.io/";
  const REPO_URL    = "https://github.com/fan-world-me/moodle-autoreconnect";
  const PROFILE_URL = "https://github.com/fan-world-me";

  const STYLE_ID = "__mar_hide";
  const OV_ID    = "__mar_ov";
  const FAST_TTL_MS      = 30000;  // має збігатись з background.js
  const FAILSAFE_MS      = 8000;   // максимум скільки тримаємо сторінку прихованою
  const OVERLAY_DELAY_MS = 250;    // gate з'являється лише якщо перевірка затягнулась
  const OVERLAY_MIN_MS   = 600;    // і не зникає раніше, щоб не блимати

  // ── ховаємо сторінку (синхронно, до першого кадру) ───────────
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    html > * { visibility: hidden !important; }
    html > #${OV_ID} { visibility: visible !important; }

    #${OV_ID} {
      --cyan: #00c8ff; --cyan-glow: #00e5ff; --text: #e6f7ff; --text-sec: #9fe8ff; --muted: #6f8791;
      position: fixed; inset: 0; z-index: 2147483647; overflow: auto;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      box-sizing: border-box; color: var(--text); text-align: left;
      font: 400 14px/1.5 Inter, -apple-system, "Segoe UI", Roboto, sans-serif;
      background:
        radial-gradient(ellipse at 20% 20%, rgba(124,58,237,.16) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(6,182,212,.12) 0%, transparent 50%),
        #040e16;
      animation: __mar_fade .25s ease;
    }
    #${OV_ID} *, #${OV_ID} *::before, #${OV_ID} *::after { box-sizing: border-box; }
    #${OV_ID} .card {
      width: min(440px, 100%); padding: 26px 26px 20px;
      background: rgba(6,20,36,.72); border: 1px solid rgba(100,220,255,.18);
      border-radius: 24px; box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(0,229,255,.05);
    }
    #${OV_ID} .head { display: flex; align-items: center; gap: 12px; }
    #${OV_ID} .logo {
      width: 44px; height: 44px; flex-shrink: 0; border-radius: 14px; font-size: 22px;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg,#7c3aed,#06b6d4); box-shadow: 0 0 18px rgba(0,200,255,.28);
    }
    #${OV_ID} h1 { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.2; color: var(--text); }
    #${OV_ID} .tag { margin: 2px 0 0; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-sec); }

    #${OV_ID} .status {
      display: flex; align-items: center; gap: 12px; margin: 20px 0 14px; padding: 12px 14px;
      background: rgba(10,28,42,.6); border: 1px solid rgba(100,220,255,.18); border-radius: 14px;
    }
    #${OV_ID} .spin {
      width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%;
      border: 3px solid rgba(0,200,255,.18); border-top-color: var(--cyan);
      animation: __mar_spin .8s linear infinite;
    }
    #${OV_ID} .status b { display: block; font-size: 13px; font-weight: 600; color: var(--text); }
    #${OV_ID} .status small { display: block; font-size: 11px; color: var(--text-sec); }

    #${OV_ID} .steps { display: flex; gap: 6px; margin: 0 0 18px; padding: 0; list-style: none; }
    #${OV_ID} .steps li {
      flex: 1; height: 4px; border-radius: 4px; background: rgba(100,220,255,.14);
      transition: background .25s, box-shadow .25s;
    }
    #${OV_ID} .steps li.on { background: linear-gradient(90deg,#7c3aed,#06b6d4); box-shadow: 0 0 8px rgba(0,229,255,.45); }

    #${OV_ID} p { margin: 0 0 10px; font-size: 12.5px; color: var(--text-sec); }
    #${OV_ID} p em { font-style: normal; color: var(--text); }

    #${OV_ID} .links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    #${OV_ID} .links a {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px;
      font-size: 12px; font-weight: 600; text-decoration: none; color: var(--text-sec);
      background: rgba(6,20,36,.62); border: 1px solid rgba(100,220,255,.2); border-radius: 999px;
      transition: border-color .15s, color .15s;
    }
    #${OV_ID} .links a:hover { color: var(--cyan-glow); border-color: rgba(0,229,255,.5); }
    #${OV_ID} .links a.main { color: #fff; border: none; background: linear-gradient(135deg,#7c3aed,#06b6d4); }
    #${OV_ID} .links a.main:hover { color: #fff; opacity: .88; }
    #${OV_ID} .foot { margin-top: 16px; font-size: 11px; text-align: center; color: var(--muted); }

    @keyframes __mar_spin { to { transform: rotate(360deg); } }
    @keyframes __mar_fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      #${OV_ID}, #${OV_ID} .spin { animation: none; }
    }
  `;
  (document.head || document.documentElement).appendChild(st);

  // ── gate-сторінка ────────────────────────────────────────────
  const STAGES = [
    { title: "Перевіряємо сесію…",   sub: "Дивимось, чи ви ще в акаунті" },
    { title: "Отримуємо сесію…",      sub: "Входимо в акаунт, це кілька секунд" },
    { title: "Відкриваємо сторінку…", sub: "Майже готово" }
  ];
  let shownAt = 0;

  function showGate(stage) {
    let ov = document.getElementById(OV_ID);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = OV_ID;
      ov.innerHTML = `
        <div class="card">
          <div class="head">
            <div class="logo">⚡</div>
            <div>
              <h1>Moodle Auto Relogin</h1>
              <div class="tag">keep your session alive</div>
            </div>
          </div>

          <div class="status">
            <div class="spin"></div>
            <div><b data-t></b><small data-s></small></div>
          </div>
          <ul class="steps"><li></li><li></li><li></li></ul>

          <p>Розширення підтримує вашу сесію на <em>moodle.econom.zp.ua</em> живою
             і тихо входить заново, якщо вона протухла — без втраченої роботи через
             60-хвилинний таймаут.</p>
          <p>Ця сторінка зникне сама, щойно сесія буде готова.</p>

          <div class="links">
            <a class="main" href="${REPO_URL}" target="_blank" rel="noopener">★ Проєкт на GitHub</a>
            <a href="${PROFILE_URL}" target="_blank" rel="noopener">@fan-world-me</a>
            <a href="${SITE_URL}" target="_blank" rel="noopener">Сайт</a>
          </div>
          <div class="foot">Made with 🩵 in Ukraine 🇺🇦</div>
        </div>`;
      document.documentElement.appendChild(ov);
      shownAt = Date.now();
    }
    const s = STAGES[stage] || STAGES[0];
    ov.querySelector("[data-t]").textContent = s.title;
    ov.querySelector("[data-s]").textContent = s.sub;
    ov.querySelectorAll(".steps li").forEach((li, i) => li.classList.toggle("on", i <= stage));
  }

  let done = false;
  let ovTimer = null;

  function reveal() {
    if (done) return;
    done = true;
    clearTimeout(ovTimer);
    clearTimeout(failsafe);
    const remove = () => {
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(OV_ID)?.remove();
    };
    // якщо gate вже видно — даємо йому побути хоч OVERLAY_MIN_MS
    const wait = shownAt ? Math.max(0, OVERLAY_MIN_MS - (Date.now() - shownAt)) : 0;
    wait ? setTimeout(remove, wait) : remove();
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

    // gate показуємо лише якщо перевірка затягнулась
    ovTimer = setTimeout(() => showGate(0), OVERLAY_DELAY_MS);
    // якщо чекаємо довше — найімовірніше йде логін
    const stageTimer = setTimeout(() => { if (!done) showGate(1); }, 1200);

    const res = await send({ type: "ENSURE_SESSION" });
    clearTimeout(ovTimer);
    clearTimeout(stageTimer);
    if (done) return;
    if (!res || !res.ok) return reveal();   // логін неможливий -> показуємо як є

    if (onLogin) {
      // нас викинуло на сторінку логіну — йдемо одразу на потрібну сторінку
      let target = "";
      try { target = new URL(location.href).searchParams.get("wantsurl") || ""; } catch (_) {}
      if (!target || !sameOrigin(target)) target = res.url || (location.origin + "/my/");
      showGate(2);
      if (!navigateGuarded(target)) reveal();
      return;
    }

    if (res.relogged) {
      // сторінка завантажилась як гостьова — перезавантажуємо вже із сесією
      showGate(2);
      if (!navigateGuarded(location.href)) reveal();
      return;
    }

    reveal();
  })();
})();
