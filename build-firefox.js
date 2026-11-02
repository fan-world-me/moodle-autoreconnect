/**
 * build-firefox.js
 * Збирає розширення під Firefox у папку dist-firefox/
 * Використовує firefox/manifest.json (MV2) замість кореневого (MV3)
 *
 * Патчить shared-файли під Firefox під час збірки (кореневі файли НЕ змінюються,
 * тож Chrome-версія лишається недоторканою):
 *   - усі скрипти: polyfill chrome → browser (у Firefox MV2 chrome.* не гарантує промісів)
 *   - background.js: chrome.action → chrome.browserAction (MV2 API) + try/catch на badge
 *   - content.js:   handleLoginPageIfNeeded читає credentials з storage.local
 *                   (storage.sync на Firefox без FxA-акаунта реджектить й крешить
 *                   весь content-script IIFE — слухачі повідомлень не реєструються)
 *   - popup.js:     storage.sync може бути undefined (Android) → guard
 *
 * Firefox-only файли (беруться з firefox/, у Chrome не завантажуються):
 *   - firefox-extras.js — inline-форма введення login/pass на сторінках moodle
 *     (на Firefox для Android popup захований у Меню → Додатки, тож без форми
 *      юзер фактично не може ввести credentials)
 *
 * Запуск: node build-firefox.js
 */

const fs   = require("fs");
const path = require("path");

const SRC  = __dirname;
const DEST = path.join(__dirname, "dist-firefox");

// Shared-файли з кореня (ті самі, що й у Chrome) — копіюємо з можливим патчем
const SHARED_FILES = [
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

// Firefox-only файли — беруться з firefox/ (Chrome їх не бачить)
const FIREFOX_ONLY_FILES = [
  "firefox-extras.js",
];

// Очищаємо dist-firefox
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, "icons"), { recursive: true });

// Патч під MV2: chrome.action → chrome.browserAction
function patchBackground(content) {
  return content.replace(/chrome\.action\./g, "chrome.browserAction.");
}

// На Firefox storage.sync без FxA-акаунта реджектить. Оригінальний content.js
// робить `Promise.all([chrome.storage.sync.get(...), ...])` без .catch →
// IIFE крешиться на цьому await і подальші слухачі повідомлень (SESSION_RELOGGED,
// LOGIN_REDIRECT) не реєструються. Замінюємо на читання з storage.local (надійне)
// з sync як fallback у try/catch.
function patchContent(content) {
  const before = content;
  content = content.replace(
    /const \[sync, local\] = await Promise\.all\(\[[\s\S]*?\]\);\s*const \{ user, pass \} = sync;\s*const \{ manualLogout \} = local;/,
    `const local = await chrome.storage.local.get(["user", "pass", "manualLogout"]); let { user, pass } = local; if (!user) { try { const s = await chrome.storage.sync.get(["user", "pass"]); user = s.user || ""; pass = s.pass || ""; } catch (_) {} } const { manualLogout } = local;`
  );
  if (content === before) {
    console.warn("\u26A0\uFE0F  content.js: патч handleLoginPageIfNeeded НЕ застосовано — перевір регулярку");
  }
  return content;
}

// Firefox MV2: chrome.* не гарантує промісів (await chrome.storage.local.get → undefined),
// browser.* — гарантує. Підміняємо chrome на browser у кожному скрипті.
const POLYFILL = '/* ff-polyfill */ var chrome = (typeof browser !== "undefined") ? browser : globalThis.chrome;\n';
function withPolyfill(content) {
  return POLYFILL + content;
}

// Firefox (особливо Android): browserAction.setBadge* може бути недоступний → не валимо весь background
function patchBadge(content) {
  return content.replace(
    "function updateBadge(status) {",
    "function updateBadge(status) { try { _updateBadge(status); } catch (_) {} }\nfunction _updateBadge(status) {"
  );
}

// storage.sync може бути undefined (Android) → у popup обгортаємо
function patchPopup(content) {
  return content
    .replace('chrome.storage.sync.get(["user", "pass"]).catch(() => ({}))',
             '(chrome.storage.sync ? chrome.storage.sync.get(["user", "pass"]).catch(() => ({})) : Promise.resolve({}))')
    .replace('chrome.storage.sync.set({ user, pass }).catch(() => {})',
             '(chrome.storage.sync ? chrome.storage.sync.set({ user, pass }).catch(() => {}) : Promise.resolve())');
}

// Копіюємо shared-файли з кореня + патчимо під Firefox
for (const file of SHARED_FILES) {
  const ext = path.extname(file);
  if ([".js", ".html", ".json"].includes(ext)) {
    let content = fs.readFileSync(path.join(SRC, file), "utf8");
    if (file === "background.js") content = withPolyfill(patchBadge(patchBackground(content)));
    if (file === "content.js")   content = withPolyfill(patchContent(content));
    if (file === "popup.js")     content = withPolyfill(patchPopup(content));
    fs.writeFileSync(path.join(DEST, file), content, "utf8");
  } else {
    fs.copyFileSync(path.join(SRC, file), path.join(DEST, file));
  }
}

// Копіюємо Firefox-only файли з firefox/
for (const file of FIREFOX_ONLY_FILES) {
  fs.writeFileSync(path.join(DEST, file), withPolyfill(fs.readFileSync(path.join(SRC, "firefox", file), "utf8")), "utf8");
}

// Firefox-manifest
fs.copyFileSync(
  path.join(SRC, "firefox", "manifest.json"),
  path.join(DEST, "manifest.json")
);

console.log("✅  dist-firefox/ ready");
console.log("");
console.log("── Десктоп Firefox ──────────────────────────────────────");
console.log("   about:debugging → This Firefox → Load Temporary Add-on");
console.log("   Вибери dist-firefox/manifest.json");
console.log("");
console.log("── Firefox for Android (Nightly) ────────────────────────");
console.log("   1. Запакуй (НЕ Compress-Archive — він пише шляхи зі зворотними слешами):");
console.log("        npx web-ext build --source-dir dist-firefox --overwrite-dest");
console.log("      і перейменуй web-ext-artifacts/*.zip → moodle-relogin.xpi");
console.log("   2. Встанови Firefox Nightly, в about:config постав");
console.log("        xpinstall.signatures.required = false");
console.log("   3. Налаштування → About Firefox Nightly → 5 тапів по логотипу →");
console.log("      \"Install extension from file\" → вибери moodle-relogin.xpi");
console.log("      (відкриття .xpi із завантажень НЕ встановлює розширення)");
console.log("");
console.log("   На сторінці moodle з’явиться inline-форма логіна/пароля (внизу),");
console.log("   поки credentials не збережено + кнопка-⚙ для редагування.");
