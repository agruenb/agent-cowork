import * as vscode from 'vscode';

/**
 * Provider for the built-in formatted and editable Markdown editor in Agent Cowork.
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentCowork.markdownEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Setup webview options
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
      ],
    };

    // Load initial HTML content
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let isInternalEdit = false;

    // Send initial text to the editor webview once ready
    const sendInitialContent = () => {
      webviewPanel.webview.postMessage({
        type: 'init',
        text: document.getText(),
      });
    };

    sendInitialContent();

    // Listen to changes in the underlying VS Code TextDocument
    // (e.g. background edits from AI Agents, git pulls, or text editor saves)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        if (e.contentChanges.length === 0) {
          return;
        }
        if (isInternalEdit) {
          return;
        }
        webviewPanel.webview.postMessage({
          type: 'update',
          text: document.getText(),
        });
      }
    });

    let autoSaveTimer: NodeJS.Timeout | null = null;

    // Handle messages sent from the webview editor
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'edit': {
          isInternalEdit = true;
          try {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              0,
              0,
              document.lineCount,
              document.lineCount > 0 ? document.lineAt(document.lineCount - 1).range.end.character : 0
            );
            edit.replace(document.uri, fullRange, message.text);
            await vscode.workspace.applyEdit(edit);

            // If autoSave is enabled in configuration, automatically save after edit
            const config = vscode.workspace.getConfiguration('agentCowork');
            if (config.get<boolean>('autoSave', true)) {
              if (autoSaveTimer) {
                clearTimeout(autoSaveTimer);
              }
              autoSaveTimer = setTimeout(async () => {
                if (document.isDirty) {
                  await document.save();
                }
              }, 1000);
            }
          } finally {
            setTimeout(() => {
              isInternalEdit = false;
            }, 60);
          }
          break;
        }
        case 'cowork': {
          if (document.isDirty) {
            await document.save();
          }
          await vscode.commands.executeCommand('agent-cowork.coworkWithFile', document.uri);
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      changeDocumentSubscription.dispose();
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'markdownEditor.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'markdownEditor.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Markdown Editor</title>
</head>
<body>
  <div class="app-container">
    <!-- Top Formatting Toolbar -->
    <div class="toolbar" role="toolbar" aria-label="Editor Werkzeugleiste">
      <!-- Heading Select -->
      <div class="toolbar-group">
        <select id="select-heading" class="tb-select" tabindex="-1" title="Textformatierung">
          <option value="p">Normaler Text</option>
          <option value="h1">Überschrift 1 (Groß)</option>
          <option value="h2">Überschrift 2 (Mittel)</option>
          <option value="h3">Überschrift 3 (Klein)</option>
        </select>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Basic Formatting -->
      <div class="toolbar-group">
        <button id="btn-bold" class="tb-btn" tabindex="-1" title="Fett (Cmd+B)"><strong>B</strong></button>
        <button id="btn-italic" class="tb-btn" tabindex="-1" title="Kursiv (Cmd+I)"><em>I</em></button>
        <button id="btn-strike" class="tb-btn" tabindex="-1" title="Durchgestrichen"><del>S</del></button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Lists & Structure -->
      <div class="toolbar-group">
        <button id="btn-task" class="tb-btn" tabindex="-1" title="Aufgabenliste (Checkliste)">☑ Aufgabe</button>
        <button id="btn-bullet" class="tb-btn" tabindex="-1" title="Aufzählungsliste">• Liste</button>
        <button id="btn-ordered" class="tb-btn" tabindex="-1" title="Nummerierte Liste">1. Liste</button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Insert Elements -->
      <div class="toolbar-group">
        <button id="btn-quote" class="tb-btn" tabindex="-1" title="Zitat / Info-Kasten">❝ Zitat</button>
        <button id="btn-table" class="tb-btn" tabindex="-1" title="Tabelle einfügen">田 Tabelle</button>
        <button id="btn-code" class="tb-btn" tabindex="-1" title="Code-Block">&lt;&gt; Code</button>
        <button id="btn-hr" class="tb-btn" tabindex="-1" title="Trennlinie">—</button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Undo / Redo -->
      <div class="toolbar-group">
        <button id="btn-undo" class="tb-btn" tabindex="-1" title="Rückgängig (Cmd+Z)">↺</button>
        <button id="btn-redo" class="tb-btn" tabindex="-1" title="Wiederholen (Cmd+Shift+Z)">↻</button>
      </div>

      <div class="toolbar-spacer"></div>

      <!-- Word count stats -->
      <span id="word-count" class="word-count">0 Wörter</span>

      <!-- Discreet / un-prominent Raw Markdown source toggle -->
      <button id="btn-toggle-raw" class="raw-toggle-btn" tabindex="-1" title="Markdown-Quelltext anzeigen oder bearbeiten">&lt;/&gt; Raw</button>

      <div class="toolbar-separator"></div>

      <!-- Cowork with AI button -->
      <button id="btn-cowork" class="cowork-btn" tabindex="-1" title="Mit KI-Agent an diesem Dokument zusammenarbeiten">
        <span>Cowork</span>
        <svg class="cowork-arrow-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path fill-rule="evenodd" d="M1 8a.75.75 0 0 1 .75-.75h10.19L8.22 3.53a.75.75 0 0 1 1.06-1.06l5 5a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06-1.06l3.72-3.72H1.75A.75.75 0 0 1 1 8z"/>
        </svg>
      </button>
    </div>

    <!-- Document Scroll Area -->
    <div class="document-viewport">
      <div class="document-container">
        <!-- Formatted Editable Document Canvas -->
        <div id="editor" class="editor-canvas" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>

        <!-- Raw Markdown Textarea (un-prominent toggle) -->
        <textarea id="raw-textarea" class="raw-textarea" spellcheck="false" placeholder="Markdown eingeben..."></textarea>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
