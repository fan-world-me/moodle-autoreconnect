<div align="center">

[![Telegram](https://img.shields.io/badge/Telegram-@fan__world__me-2CA5E0?style=flat-square&logo=telegram)](https://t.me/fan_world_me)&nbsp;&nbsp;
[![Discord](https://img.shields.io/badge/Discord-fan__world__me-5865F2?style=flat-square&logo=discord)](https://discord.com/users/fan_world_me)&nbsp;&nbsp;
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
<img src="https://img.shields.io/badge/Firefox-compatible-FF7139?style=for-the-badge&logo=firefox&logoColor=white"/>
<img src="https://img.shields.io/badge/version-1.2-00c851?style=for-the-badge"/>
<img src="https://img.shields.io/badge/license-GPL--3.0-blueviolet?style=for-the-badge"/>

</div>

<br/>

Browser extension that keeps your [moodle.econom.zp.ua](https://moodle.econom.zp.ua) session alive and silently re-logs you in if it expires — no more losing work to the 60-minute timeout.

### 💭 More about this extension
- 🔄 Pings `/my/` every 10 minutes to keep the session alive
- 🔐 Auto-submits login form in the background if session expires
- 👁️ Detects logout on **any** page — not just `/login/index.php`
- 🧩 Injects a minimal status widget into the Moodle header
- 🎛️ Popup with login/password fields, toggle, and last-check timestamp
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

| File | Role |
|---|---|
| `manifest.json` | Extension config (MV3), permissions, icons |
| `background.js` | Service worker — keepalive ticker, auto-login, debounce |
| `content.js` | Logout detection + header widget + toast |
| `popup.html` | Popup UI |
| `popup.js` | Popup logic — save creds, toggle, status display |
| `icons/` | 16 / 48 / 128 px PNG icons |

---

### 🚀 How it works

```
[Alarm every 10 min]──┐
[Tab fully loaded]─────┤──► tick() ──► isLoggedIn() ──┬──► OK  → setStatus("ok")
[content.js: NO_SESSION]┘                              └──► login() → POST /login/index.php
                                                                     ↓
                                                           notifyTabs() → showToast()
```

> `content.js` and `background.js` share a single `tries[]` counter in `chrome.storage.local`.
> The rate-limit is global — both scripts respect the same 3-attempts-per-2-min cap.

---

### 📦 Install

**Chrome / Edge / Brave**
```
1. Open chrome://extensions
2. Enable "Developer mode" (top right)
3. "Load unpacked" → select this repo folder
```

**Firefox**
```
1. Open about:debugging#/runtime/this-firefox
2. "Load Temporary Add-on" → select manifest.json
```

---

### ⚙️ Setup

1. Click the ⚡ icon in your browser toolbar
2. Enter your **login** and **password** for `moodle.econom.zp.ua`
3. Hit **Save** — the extension will immediately verify the session

<div align="center">
<img src="https://img.shields.io/badge/on_save-session_check_fires_immediately-00e5ff?style=flat-square"/>
</div>

---

### 🔒 Security note

> Credentials are stored in `chrome.storage.local` **as plain text** — locally in your browser only, never sent anywhere except Moodle itself.
>
> ⚠️ Don't use on a shared computer without understanding this tradeoff.

---

### 📄 License

[GPL-3.0](./LICENSE) © [fan-world-me](https://github.com/fan-world-me)

---

<div align="center">

Made with 🩵 in Zaporizhzhia, Ukraine 🇺🇦

[![Telegram](https://img.shields.io/badge/Telegram-@fan__world__me-2CA5E0?style=flat-square&logo=telegram)](https://t.me/fan_world_me)
[![Discord](https://img.shields.io/badge/Discord-fan__world__me-5865F2?style=flat-square&logo=discord)](https://discord.com/users/fan_world_me)
[![Portfolio](https://img.shields.io/badge/Portfolio-fan--world--me.github.io-00e5ff?style=flat-square&logo=githubpages&logoColor=white)](https://fan-world-me.github.io/)

</div>
