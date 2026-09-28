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

// Файли для копіювання (шляхи відносно кореня репо)
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

// Копіюємо файли розширення
for (const file of FILES) {
  fs.copyFileSync(
    path.join(SRC, file),
    path.join(DEST, file)
  );
}

// Підставляємо Firefox-manifest замість Chrome-manifest
fs.copyFileSync(
  path.join(SRC, "firefox", "manifest.json"),
  path.join(DEST, "manifest.json")
);

console.log("✅  dist-firefox/ ready — load it in Firefox via about:debugging");
