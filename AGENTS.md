This is a VS Code extension that simplifies the use of VS Code with AI Agents for non-technical people.

## Architecture & UI Constraints

- **Top Bar (Title Bar)**:
  - The search bar (Command Center) and layout buttons can be hidden declaratively via settings: `window.commandCenter: false`, `workbench.layoutControl.enabled: false`, `workbench.navigationControl.enabled: false`.
- **Editor Tabs (Tab Bar)**:
  - Configured to behave like a web browser: `workbench.editor.tabSizing: 'shrink'`, `workbench.editor.wrapTabs: false`, `workbench.editor.showTabs: 'multiple'`, `workbench.editor.enablePreview: false`, `workbench.editor.enablePreviewFromQuickOpen: false`, `workbench.editor.tabActionCloseVisibility: true`, `window.density.editorTabHeight: 'default'`.
  - Tab height and legibility are enhanced via `window.zoomLevel: 1.4`, providing tall, easily clickable tabs with large icons and readable labels.
  - The custom File Icon Theme (`agent-cowork-icons`) ensures tabs display the custom `.md` robot icon (`resources/icons/markdown.svg`) and custom document file icon (`resources/icons/file.svg`), matching the folder tree view.
  - The Light Green Theme (`Agent Cowork Light`) renders harmonious browser tabs: a darker slate backdrop (`editorGroupHeader.tabsBackground: #e2e8f0`), borderless tab integration (`tab.border: #00000000`, `editorGroupHeader.tabsBorder: #00000000`), and a vibrant green active/selected tab (`tab.activeBackground: #059669`, `tab.activeForeground: #ffffff`).
  - Color customizations are also synced directly into `workbench.colorCustomizations['[Agent Cowork Light]']` so changes render immediately in real-time.
- **Bottom Bar (Status Bar)**:
  - VS Code does not provide declarative settings (`settings.json` or extension APIs) to hide individual built-in status bar items (such as the Remote Connect indicator `status.host`, Problems / Error counts `status.problems`, or Notifications `status.notifications`).
  - VS Code stores individual status bar visibility preferences internally in SQLite storage (`workbench.statusbar.hidden` in `state.vscdb`), toggled by the user via right-clicking the status bar items.
  - The only global setting available for the status bar is hiding the entire bar (`workbench.statusBar.visible: false`). When the status bar is visible, individual built-in icons must be toggled manually by the user or left as-is to preserve extension icons (such as Copilot).