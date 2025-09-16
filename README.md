
<p align="center">
   <a href="https://github.com/lovelesscodes/story-forge/actions">
      <img src="https://img.shields.io/github/actions/workflow/status/lovelesscodes/story-forge/ci.yml?branch=main&label=build&style=for-the-badge" alt="Build Status" />
   </a>
   <a href="https://github.com/lovelesscodes/story-forge/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/lovelesscodes/story-forge?color=brightgreen&style=for-the-badge" alt="License" />
   </a>
   <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge" alt="Platforms" />   
   <a href="https://biomejs.dev/" target="_blank">
      <img src="https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=for-the-badge&logo=biome" alt="Checked with Biome" />
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

## 📚 License

MIT
