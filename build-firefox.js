/**
 * build-firefox.js
 * Збирає розширення під Firefox у папку dist-firefox/
 * Використовує firefox/manifest.json (MV2) замість кореневого (MV3)
 *
 * Запуск: node build-firefox.js
 */

const fs   = require("fs");
const path = require("path");

const SRC  = __dirname;
const DEST = path.join(__dirname, "dist-firefox");

const FILES = [
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

// Очищаємо dist-firefox
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, "icons"), { recursive: true });

// Копіюємо файли
for (const file of FILES) {
  let content = null;

  // Текстові файли — читаємо як текст для можливого патчингу
  const ext = path.extname(file);
  if ([".js", ".html", ".json"].includes(ext)) {
    content = fs.readFileSync(path.join(SRC, file), "utf8");

    if (file === "background.js") {
      // MV2: chrome.action → chrome.browserAction (якщо є)
      content = content.replace(/chrome\.action\./g, "chrome.browserAction.");
    }

    fs.writeFileSync(path.join(DEST, file), content, "utf8");
  } else {
    fs.copyFileSync(path.join(SRC, file), path.join(DEST, file));
  }
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
console.log("   1. Встанови Firefox Nightly на телефон");
console.log("   2. В Nightly: about:config → extensions.experiments.enabled = true");
console.log("   3. Запакуй dist-firefox/ в .xpi: node build-firefox.js --xpi");
console.log("   4. Перенеси .xpi на телефон і відкрий через Firefox");
console.log("");
console.log("   АБО — використай web-ext для підписаного .xpi:");
console.log("   npx web-ext sign --source-dir=dist-firefox --api-key=... --api-secret=...");
