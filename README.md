
<p align="center">
   <a href="https://getstoryforge.app/">
      <img src="public/StoryForge.png" alt="Story Forge" />
   </a>
   <br />
   <br />
   <a href="/actions">
      <img src="https://img.shields.io/github/actions/workflow/status/lovelesscodes/storyforge/publish.yml?branch=release&label=build&style=flat-square" alt="Build Status" />
   </a>
   <a href="/LICENSE">
      <img src="https://img.shields.io/github/license/lovelesscodes/storyforge?color=brightgreen&style=flat-square" alt="License" />
   </a>
   <a href="https://getstoryforge.app/">
      <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platforms" />
   </a>
   <a href="https://biomejs.dev/" target="_blank">
      <img src="https://img.shields.io/badge/checked_with-Biome-60a5fa?style=flat-square&logo=biome" alt="Checked with Biome" />
   </a>
   <a href="/releases/latest">
      <img src="https://img.shields.io/github/downloads/lovelesscodes/storyforge/total?color=fff&style=flat-square&logo=github" alt="Download total" />
   </a>
</p>

# Story Forge

**Story Forge** is a modern desktop app for Vintage Story players, designed to make switching between game versions, modpacks, servers, and accounts effortless. 

---

## ✨ Features

- **Version Management**: Easily install, switch, and launch different Vintage Story versions.
- **Modpack Handling**: Import, export, and swap modpacks with a click.
- **Server Browser**: Favorite, connect, and organize your servers with drag-and-drop.
- **Account Switching**: Manage multiple accounts and switch between them instantly.
- **Minimal & Fast**: Built with Tauri (Rust) for a lightweight, secure, and fast experience.
- **Beautiful UI**: Powered by Vite + React for a snappy, modern interface.
- **Updater**: Install once, update forever - with the built-in auto updater.

---

## 🚀 Getting Started

1. **Install dependencies**
   ```sh
   bun install
   ```
2. **Run the app in development**
   ```sh
   bun tauri dev
   ```
3. **Build for release**
   ```sh
   bun tauri build
   ```

---

## 🛠 Tech Stack

- **Frontend**: [Vite](https://vitejs.dev/) + [React](https://react.dev/)
- **Backend**: [Tauri](https://tauri.app/) (Rust)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)

---

## 💡 Why Story Forge?

Vintage Story is a sandbox game with a vibrant modding and multiplayer community. Story Forge helps you:
- Keep your installations organized
- Quickly switch between modpacks and servers
- Manage multiple accounts for family or friends
- Spend less time on setup, more time playing

---

## 📦 Packaging & Distribution

Story Forge uses Tauri to package the app into a minimal, secure binary for Windows, macOS, and Linux. No Electron bloat—just fast, native performance.

---

## 📝 Contributing

Pull requests and suggestions are welcome! If you have ideas for new features or improvements, open an issue or join the discussion.

---

## 📸 Screenshots

![Overview page](/screenshots/Overview.png)
![Public servers page](/screenshots/Public_Servers.png)
![Installations page](/screenshots/Installations.png)
![Mod browser](/screenshots/Mod_Browser.png)
![Adding mod](/screenshots/Adding_Mod.png)
![Update mod](/screenshots/Update_Mod.png)
![User management](/screenshots/User_Management.png)