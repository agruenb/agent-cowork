This is a VS Code extension that simplifies the use of VS Code with AI Agents for non-technical people.

## Architecture & UI Constraints

- **Top Bar (Title Bar)**:
  - The search bar (Command Center) and layout buttons can be hidden declaratively via settings: `window.commandCenter: false`, `workbench.layoutControl.enabled: false`, `workbench.navigationControl.enabled: false`.
- **Editor Tabs (Tab Bar)**:
  - Configured to behave like a web browser: `workbench.editor.tabSizing: 'shrink'`, `workbench.editor.wrapTabs: false`, `workbench.editor.showTabs: 'multiple'`, `workbench.editor.enablePreview: false`, `workbench.editor.enablePreviewFromQuickOpen: false`, `workbench.editor.tabActionCloseVisibility: true`, `window.density.editorTabHeight: 'default'`.
  - Tab height and legibility are enhanced via `window.zoomLevel: 1`, providing tall, easily clickable tabs with large icons and readable labels.
  - The custom File Icon Theme (`agent-cowork-icons`) ensures tabs display the custom `.md` brain icon (`resources/icons/markdown.svg`) and custom document file icon (`resources/icons/file.svg`), matching the folder tree view.
  - The Light Green Theme (`Agent Cowork Light`) renders harmonious browser tabs: a darker slate backdrop (`editorGroupHeader.tabsBackground: #e2e8f0`), borderless tab integration (`tab.border: #00000000`, `editorGroupHeader.tabsBorder: #00000000`), and a vibrant green active/selected tab (`tab.activeBackground: #059669`, `tab.activeForeground: #ffffff`).
  - Color customizations are also synced directly into `workbench.colorCustomizations['[Agent Cowork Light]']` so changes render immediately in real-time.
- **Auto-saving**:
  - Automatically enabled by default via `agentCowork.autoSave: true`.
  - Configures `files.autoSave: 'afterDelay'` globally for seamless background saving.
  - The custom Markdown Editor automatically debounces and saves the underlying document (`document.save()`) 1 second after edits to keep files perpetually saved without requiring manual shortcuts.
- **Bottom Bar (Status Bar)**:
  - VS Code does not provide declarative settings (`settings.json` or extension APIs) to hide individual built-in status bar items (such as the Remote Connect indicator `status.host`, Problems / Error counts `status.problems`, or Notifications `status.notifications`).
  - VS Code stores individual status bar visibility preferences internally in SQLite storage (`workbench.statusbar.hidden` in `state.vscdb`), toggled by the user via right-clicking the status bar items.
  - The only global setting available for the status bar is hiding the entire bar (`workbench.statusBar.visible: false`). When the status bar is visible, individual built-in icons must be toggled manually by the user or left as-is to preserve extension icons (such as Copilot).

## CSS Build System

- **Source files** live in `src/webview/styles/*.css` (e.g. `base.css`, `blocks.css`, `tables.css`, etc.) — **these are the files to edit**.
- **Build** (`npm run compile` / `npm run dev`): `esbuild.js` concatenates all source CSS files in order and writes the result to `dist/markdownEditor.css`.
- **`src/webview/markdownEditor.css` is a generated file** — it is overwritten on every build and must never be edited directly. Edits there will be lost.
- The build script (`esbuild.js` `copyAssets()`) writes the concatenated output to **both** `dist/markdownEditor.css` and `src/webview/markdownEditor.css`, which means there are 3 copies of the CSS on disk at any time (source files + 2 outputs).

> **TODO (to be fixed):** The `src/webview/markdownEditor.css` copy is unnecessary overhead. The build should only write to `dist/markdownEditor.css`, and the webview HTML should reference the CSS from `dist/`. This would eliminate the confusing generated file from the source tree and prevent accidental direct edits.