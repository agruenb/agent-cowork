# Agent Cowork (VS Code Extension)

A modern Visual Studio Code extension built with TypeScript and bundled with `esbuild`.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Build & Watch
- **Build once**: `npm run compile`
- **Watch mode**: `npm run watch`
- **Package for release**: `npm run package`
- **Type check**: `npm run check-types`
- **Lint**: `npm run lint`

### 3. Debugging with VS Code
1. Open this folder in Visual Studio Code.
2. Press `F5` (or go to the **Run and Debug** view and click **Run Extension**).
3. A new Extension Development Host window will open with the extension loaded.
4. Press `Cmd+Shift+P` (or `Ctrl+Shift+P` on Linux/Windows) to open the Command Palette.
5. Type and select `Agent Cowork: Hello World`. You should see an information notification appear!

## Project Structure
```text
agent-cowork/
├── .vscode/
│   ├── launch.json       # Debug configuration for Extension Host
│   └── tasks.json        # Build and watch task definitions
├── src/
│   └── extension.ts      # Extension entry point
├── esbuild.js            # Fast bundler setup
├── package.json          # Extension manifest and scripts
├── tsconfig.json         # TypeScript configuration
└── .eslintrc.json        # ESLint configuration
```
