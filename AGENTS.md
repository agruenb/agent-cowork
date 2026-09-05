This is a VS Code extension that simplifies the use of VS Code with AI Agents for non-technical people.

## Architecture & UI Constraints

- **Top Bar (Title Bar)**:
  - The search bar (Command Center) and layout buttons can be hidden declaratively via settings: `window.commandCenter: false`, `workbench.layoutControl.enabled: false`, `workbench.navigationControl.enabled: false`.
- **Bottom Bar (Status Bar)**:
  - VS Code does not provide declarative settings (`settings.json` or extension APIs) to hide individual built-in status bar items (such as the Remote Connect indicator `status.host`, Problems / Error counts `status.problems`, or Notifications `status.notifications`).
  - VS Code stores individual status bar visibility preferences internally in SQLite storage (`workbench.statusbar.hidden` in `state.vscdb`), toggled by the user via right-clicking the status bar items.
  - The only global setting available for the status bar is hiding the entire bar (`workbench.statusBar.visible: false`). When the status bar is visible, individual built-in icons must be toggled manually by the user or left as-is to preserve extension icons (such as Copilot).