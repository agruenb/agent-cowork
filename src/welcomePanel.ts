import * as vscode from 'vscode';

/**
 * Manages the Welcome / Startup Webview Panel.
 */
export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  public static readonly viewType = 'agentCowork.welcome';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): WelcomePanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal(column);
      return WelcomePanel.currentPanel;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      WelcomePanel.viewType,
      vscode.l10n.t('Willkommen bei Agent Cowork'),
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    WelcomePanel.currentPanel = new WelcomePanel(panel);
    return WelcomePanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFolder':
            await vscode.commands.executeCommand('workbench.action.openFolder');
            return;
          case 'applyTheme':
            await vscode.commands.executeCommand('agent-cowork.applyTheme');
            return;
          case 'openCommands':
            await vscode.commands.executeCommand('workbench.action.showCommands');
            return;
          case 'toggleStartup': {
            const config = vscode.workspace.getConfiguration('agentCowork');
            await config.update('showWelcomeOnStartup', message.value, vscode.ConfigurationTarget.Global);
            return;
          }
        }
      },
      null,
      this._disposables
    );
  }

  public dispose(): void {
    WelcomePanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(): void {
    const config = vscode.workspace.getConfiguration('agentCowork');
    const showOnStartup = config.get<boolean>('showWelcomeOnStartup', true);

    this._panel.title = vscode.l10n.t('Willkommen bei Agent Cowork');
    this._panel.webview.html = this._getHtmlForWebview(showOnStartup);
  }

  private _getHtmlForWebview(showOnStartup: boolean): string {
    const title = vscode.l10n.t('Willkommen bei Agent Cowork');
    const subtitle = vscode.l10n.t('Ihre intuitive Arbeitsumgebung für KI-gestütztes Arbeiten');
    const gettingStarted = vscode.l10n.t('Erste Schritte');
    const openFolder = vscode.l10n.t('Ordner öffnen');
    const openFolderDesc = vscode.l10n.t('Wählen Sie einen Arbeitsordner für Ihre Projekte und Dokumente.');
    const activateTheme = vscode.l10n.t('Theme aktivieren');
    const activateThemeDesc = vscode.l10n.t('Stellen Sie das augenfreundliche, helle Design mit grünen Akzenten ein.');
    const startAgent = vscode.l10n.t('Agenten starten');
    const startAgentDesc = vscode.l10n.t('Öffnen Sie die Befehlspalette, um mit Ihren Agenten zu interagieren.');
    const tipsTitle = vscode.l10n.t('Tipps für Einsteiger');
    const tip1 = vscode.l10n.t('Sie benötigen kein Programmierwissen. Formulieren Sie Ihre Aufgaben einfach in natürlicher Sprache.');
    const tip2 = vscode.l10n.t('Alle Ihre Änderungen und erstellten Dokumente bleiben sicher auf Ihrem Computer.');
    const alwaysShow = vscode.l10n.t('Beim Start immer anzeigen');

    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --primary: #059669;
      --primary-hover: #047857;
      --primary-light: #ecfdf5;
      --primary-border: #a7f3d0;
      --bg: var(--vscode-editor-background, #ffffff);
      --card-bg: var(--vscode-sideBar-background, #f8fafc);
      --card-border: var(--vscode-sideBar-border, #e2e8f0);
      --text: var(--vscode-foreground, #1e293b);
      --text-muted: var(--vscode-descriptionForeground, #64748b);
      --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      line-height: 1.5;
      padding: 40px 24px;
      display: flex;
      justify-content: center;
    }

    .container {
      max-width: 780px;
      width: 100%;
    }

    .hero {
      text-align: center;
      margin-bottom: 36px;
      padding: 24px 16px;
      background: linear-gradient(180deg, var(--primary-light) 0%, rgba(255,255,255,0) 100%);
      border-radius: 16px;
      border: 1px solid var(--primary-border);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      background-color: #d1fae5;
      color: #065f46;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 14px;
    }

    .hero h1 {
      font-size: 32px;
      font-weight: 700;
      color: #065f46;
      margin-bottom: 8px;
    }

    .hero p {
      font-size: 16px;
      color: var(--text-muted);
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      display: flex;
      flex-direction: column;
      text-align: left;
    }

    .card:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 14px rgba(5, 150, 105, 0.12);
      transform: translateY(-2px);
    }

    .card-icon {
      width: 40px;
      height: 40px;
      background-color: #d1fae5;
      color: var(--primary);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      margin-bottom: 14px;
    }

    .card h3 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }

    .card p {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.4;
      flex-grow: 1;
    }

    .card-action {
      margin-top: 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .tips-box {
      background-color: var(--card-bg);
      border: 1px dashed var(--card-border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }

    .tips-box h4 {
      font-size: 14px;
      font-weight: 600;
      color: #047857;
      margin-bottom: 10px;
    }

    .tips-list {
      list-style-type: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .tips-list li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .tips-list li::before {
      content: "✓";
      color: var(--primary);
      font-weight: bold;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16px;
      border-top: 1px solid var(--card-border);
      font-size: 13px;
      color: var(--text-muted);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    input[type="checkbox"] {
      accent-color: var(--primary);
      cursor: pointer;
      width: 16px;
      height: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <div class="badge">🤖 Agent Cowork</div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>

    <h2 class="section-title">🚀 ${gettingStarted}</h2>
    <div class="grid">
      <div class="card" id="btn-open-folder" role="button" tabindex="0">
        <div class="card-icon">📁</div>
        <h3>${openFolder}</h3>
        <p>${openFolderDesc}</p>
        <span class="card-action">${openFolder} →</span>
      </div>

      <div class="card" id="btn-apply-theme" role="button" tabindex="0">
        <div class="card-icon">🎨</div>
        <h3>${activateTheme}</h3>
        <p>${activateThemeDesc}</p>
        <span class="card-action">${activateTheme} →</span>
      </div>

      <div class="card" id="btn-open-commands" role="button" tabindex="0">
        <div class="card-icon">⚡</div>
        <h3>${startAgent}</h3>
        <p>${startAgentDesc}</p>
        <span class="card-action">${startAgent} →</span>
      </div>
    </div>

    <div class="tips-box">
      <h4>💡 ${tipsTitle}</h4>
      <ul class="tips-list">
        <li>${tip1}</li>
        <li>${tip2}</li>
      </ul>
    </div>

    <div class="footer">
      <label class="checkbox-label">
        <input type="checkbox" id="chk-startup" ${showOnStartup ? 'checked' : ''} />
        <span>${alwaysShow}</span>
      </label>
      <span>Agent Cowork v0.0.1</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('btn-open-folder').addEventListener('click', () => {
      vscode.postMessage({ command: 'openFolder' });
    });

    document.getElementById('btn-apply-theme').addEventListener('click', () => {
      vscode.postMessage({ command: 'applyTheme' });
    });

    document.getElementById('btn-open-commands').addEventListener('click', () => {
      vscode.postMessage({ command: 'openCommands' });
    });

    document.getElementById('chk-startup').addEventListener('change', (e) => {
      vscode.postMessage({ command: 'toggleStartup', value: e.target.checked });
    });
  </script>
</body>
</html>`;
  }
}
