# Agent Cowork

[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

**Agent Cowork** simplifies Visual Studio Code into a clean, friendly workspace designed for non-technical professionals co-working with AI coding agents.

It strips away intimidating developer clutter (complex git panels, crowded tab bars, tiny font sizes) and gives you a welcoming, browser-like environment with an eye-friendly theme and visual markdown reading.

---

## ✨ Key Features

### 🌿 Agent Cowork Light Theme
A modern, soothing light theme featuring emerald accents (`#059669`), clear high-contrast text, and a calming workspace canvas that reduces eye strain during long sessions.

### 🌐 Browser-Style Tabs
Tabs that behave like your favorite web browser:
- Shrink smoothly to fit window width before scrolling horizontally.
- No accidental tab overwriting (Preview mode disabled by default).
- Larger, comfortable click targets and legible labels.

### 📁 Distraction-Free Workspace Explorer
- Streamlined sidebar focusing only on your workspace folder and files.
- Hides overwhelming developer drawers (Outline, Timeline, Source Control).
- Quickly create and manage files with one-click header actions.

### 🤖 Friendly File Indicators
- Distinct robot indicators for markdown files, clearly signaling your AI instructions, prompt files, and task logs.
- Clean document icons for other files in your project.

### 📝 Integrated Markdown Viewer
Double-click markdown files to read rich formatted notes, AI plans, and project documentation effortlessly without raw syntax distractions.

---

## 🚀 Getting Started

1. Install **Agent Cowork** from the Visual Studio Marketplace.
2. Open any folder or workspace containing your project.
3. Use the simplified workspace view in the sidebar to browse your files.
4. Enjoy a clutter-free co-working experience with your AI assistant!

---

## ⚙️ Extension Settings

Agent Cowork includes customizable preferences under `Settings > Extensions > Agent Cowork`:

| Setting | Default | Description |
| :--- | :---: | :--- |
| `agentCowork.showWelcomeOnStartup` | `true` | Show the Agent Cowork welcome dashboard on launch. |
| `agentCowork.simplifyLayout` | `true` | Simplify UI layout and hide complex developer activity bars. |
| `agentCowork.browserTabs` | `true` | Enable web browser-style tab sizing and behavior. |
| `agentCowork.hideGitAndDrawers` | `true` | Hide Git drawers and secondary panels for a clean interface. |

---

## 🛠️ Development & Build Tutorial

Follow these steps to set up the project locally, build the extension, run tests, and package a `.vsix` file.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)
- [Visual Studio Code](https://code.visualstudio.com/) (v1.85.0 or later)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/agruenb/agent-cowork.git
cd agent-cowork
npm install
```

### 2. Development & Watching

To start incremental compilation and watch for changes in both the extension host and webview bundles:

```bash
npm run watch
# or
npm run dev
```

### 3. Debugging in VS Code

1. Open the project folder in VS Code:
   ```bash
   code .
   ```
2. Press <kbd>F5</kbd> (or open the **Run & Debug** view and select **Run Extension**).
3. A new **Extension Development Host** window will open with the Agent Cowork extension active.

### 4. Running Tests & Type Checking

Ensure types and tests pass:

```bash
# Type check TypeScript
npm run check-types

# Run linter
npm run lint

# Run unit tests (Mocha with tsx)
npm test
```

### 5. Production Build & Packaging (.vsix)

To create an optimized production build:

```bash
npm run package
```

To package the extension into an installable `.vsix` file (for local installation or distribution):

```bash
npm run package-vsix
```

This generates `agent-cowork-<version>.vsix` in the project root. You can install it directly in VS Code using:

```bash
code --install-extension agent-cowork-*.vsix
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
