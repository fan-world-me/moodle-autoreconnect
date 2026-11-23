<div align="center">

[![Telegram](https://img.shields.io/badge/Telegram-@fan__world__me-2CA5E0?style=flat-square&logo=telegram)](https://t.me/fan_world_me)&nbsp;&nbsp;
[![Discord](https://img.shields.io/badge/Discord-fan__world__me-5865F2?style=flat-square&logo=discord)](https://discord.com/users/1040301536036786248)&nbsp;&nbsp;
[![GitHub](https://img.shields.io/badge/GitHub-fan--world--me-181717?style=flat-square&logo=github)](https://github.com/fan-world-me)&nbsp;&nbsp;
[![Portfolio](https://img.shields.io/badge/Portfolio-fan--world--me.github.io-00e5ff?style=flat-square&logo=githubpages&logoColor=white)](https://fan-world-me.github.io/)

</div>

<br/>

<div align="center">

```
                       ⚡
              ███╗   ███╗ ██████╗  ██████╗ ██████╗ ██╗     ███████╗
              ████╗ ████║██╔═══██╗██╔═══██╗██╔══██╗██║     ██╔════╝
              ██╔████╔██║██║   ██║██║   ██║██║  ██║██║     █████╗
              ██║╚██╔╝██║██║   ██║██║   ██║██║  ██║██║     ██╔══╝
              ██║ ╚═╝ ██║╚██████╔╝╚██████╔╝██████╔╝███████╗███████╗
              ╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
                    AUTO  RELOGIN  —  keep your session alive
```

</div>

<div align="center">

<img src="https://img.shields.io/badge/Manifest-V3-00e5ff?style=for-the-badge&logo=googlechrome&logoColor=white"/>
<img src="https://img.shields.io/badge/Firefox-128+-FF7139?style=for-the-badge&logo=firefox&logoColor=white"/>
<img src="https://img.shields.io/badge/version-1.6-00c851?style=for-the-badge"/>
<img src="https://img.shields.io/badge/license-GPL--3.0-blueviolet?style=for-the-badge"/>

</div>

<br/>

Browser extension that keeps your [moodle.econom.zp.ua](https://moodle.econom.zp.ua) session alive and silently re-logs you in if it expires — no more losing work to the 60-minute timeout.

### 💭 More about this extension
- ⏸️ **Pre-load session gate** — the page is hidden until your session is verified; if it expired, the extension logs in first and opens the already logged-in page (no guest page, no manual F5)
- 🪟 **Loading screen** — a branded splash with project info is shown while the session is being obtained
- 🔄 Pings `/my/` every 10 minutes to keep the session alive
- 🔐 Auto-submits login form in the background if session expires
- 👁️ Detects guest pages (Moodle's guest access) by the logout/login links, not just by redirects
- 🧩 Injects a minimal status widget into the Moodle header
- 🎛️ Popup with login/password fields, toggles, and last-check timestamp
- 🔔 Shows a non-intrusive toast if re-login happens while the page is open
- 🛡️ Rate-limit: max 3 login attempts per 2 minutes (shared counter, prevents account lockout)

---

### 🧰 Tech Stack

**Core**

![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Chrome Extensions](https://img.shields.io/badge/Chrome_Extensions-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox_Add--ons-MV3-FF7139?style=flat-square&logo=firefox&logoColor=white)

**APIs used**

![Alarms API](https://img.shields.io/badge/Alarms_API-keepalive-00e5ff?style=flat-square)
![Storage API](https://img.shields.io/badge/Storage_API-credentials-00e5ff?style=flat-square)
![Tabs API](https://img.shields.io/badge/Tabs_API-session_detect-00e5ff?style=flat-square)
![Fetch API](https://img.shields.io/badge/Fetch_API-relogin-00e5ff?style=flat-square)

---

### 🗂️ Project Structure

```
moodle-ext/
├── src/
│   ├── background.js          — service worker: keepalive ticker, auto-login, rate-limit
│   ├── content.js             — logout detection, header widget, toast
│   ├── firefox/
│   │   └── firefox-extras.js  — Firefox MV2 compatibility shim
│   ├── popup.html             — popup UI
│   ├── popup.js               — popup logic: save creds, toggle, status
│   ├── early.js               — document_start gate: hides the page, ensures the session, loading screen
│   └── icons/                 — 16 / 48 / 128 px PNG icons
├── manifests/
│   ├── chrome/manifest.json   — Chrome MV3 manifest
│   └── firefox/manifest.json  — Firefox MV2 manifest
├── dist/                      — build output (gitignored)
├── package-extensions.ps1     — build script (Windows / PowerShell)
├── package-extensions.sh      — build script (Linux / macOS / WSL)
├── .gitignore
├── LICENSE
└── README.md
```

---

### 🚀 How it works

```
[Page request]
      │
      ▼
 early.js (document_start) ── hides the page, shows the loading screen if it takes >250 ms
      │  ENSURE_SESSION
      ▼
 background.js ── session verified <30 s ago? ──► OK
      │ no
      ▼
 isLoggedIn() (URL + logout link in /my/ HTML)
      ├── logged in ──► OK
      └── not ────────► login() ─► relogged
      │
      ▼
 early.js ── DOM confirms logged-in ─► show page
          └─ guest page / relogged ─► force re-check + reload with the session

[Alarm every 10 min] ─► tick() ─► keep-alive
```

> **Chrome (MV3)** can't block a network request, so the page loads hidden and is revealed (or reloaded) once the session is confirmed.
> **Firefox** additionally holds the main request with a blocking `webRequest` listener until the session check finishes (max 8 s).
> A safety timeout reveals the page after 8 s no matter what, and redirects are capped at 3 per minute.

---

### 📦 Build

**Windows (PowerShell)**

```powershell
.\package-extensions.ps1
```

**Linux / macOS / WSL**

```bash
chmod +x package-extensions.sh   # once
./package-extensions.sh
```

Output in `dist/`:

```
dist/
├── chrome-unpacked/              — load in Chrome developer mode
├── firefox-unpacked/             — load in Firefox temporary add-on mode
├── moodle-relogin-chrome.zip     — Chrome package
├── moodle-relogin-firefox.zip    — Firefox package
└── moodle-relogin-firefox.xpi   — unsigned .xpi for Firefox Android
```

---

### 🛠️ Install Locally

**Chrome / Edge / Brave**

```
1. Open chrome://extensions
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select dist/chrome-unpacked
```

**Firefox Desktop**

```
1. Open about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on"
3. Select dist/firefox-unpacked/manifest.json
```

**Firefox Android**

```
1. Install Firefox Nightly
2. Open about:config → set xpinstall.signatures.required = false
3. Transfer moodle-relogin-firefox.xpi to phone
4. Open the .xpi directly in Firefox
```

---

### ⚙️ Setup

1. Click the ⚡ icon in your browser toolbar
2. Enter your **login** and **password** for `moodle.econom.zp.ua`
3. Hit **Save** — the extension will immediately verify the session

<div align="center">
<img src="https://img.shields.io/badge/on_save-session_check_fires_immediately-00e5ff?style=flat-square"/>
</div>

**Popup options**

| Option | Default | What it does |
|---|---|---|
| Увімкнено | on | Master switch for keep-alive and auto-login |
| Авто-оновлення сторінки | on | Reload open tabs right after a re-login |
| Пауза до входу | on | Don't show the site until the session is ready |
| Заставка | on | Show the loading screen with project info while waiting |

---

### 🔒 Security note

> Credentials are stored in `chrome.storage.local` **as plain text** — locally in your browser only, never sent anywhere except Moodle itself.
>
> ⚠️ Don't use on a shared computer without understanding this tradeoff.

---

### 📄 License

[GPL-3.0](./LICENSE) © [fan-world-me](https://github.com/fan-world-me)

---

### 🔗 Other extensions by the author

| Extension | Description |
|---|---|
| [🧠 Quiz AI Analyzer](https://github.com/fan-world-me/quizai) | Floating AI panel that auto-detects and answers quiz questions on vseosvita.ua, Moodle, Kahoot and more |
| [🛡️ Vseosvita Focus Guard](https://github.com/fan-world-me/vseosvita-focus-guard) | Neutralizes focus tracking and tab-visibility detection on vseosvita.ua |

---

<div align="center">

Made with 🩵 in Ukraine 🇺🇦

[![Telegram](https://img.shields.io/badge/Telegram-@fan__world__me-2CA5E0?style=flat-square&logo=telegram)](https://t.me/fan_world_me)
[![Discord](https://img.shields.io/badge/Discord-fan__world__me-5865F2?style=flat-square&logo=discord)](https://discord.com/users/1040301536036786248)
[![Portfolio](https://img.shields.io/badge/Portfolio-fan--world--me.github.io-00e5ff?style=flat-square&logo=githubpages&logoColor=white)](https://fan-world-me.github.io/)

</div>
