import * as vscode from 'vscode';
import { hasVisibleContent } from './utils/markdownContent';

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
    let hasParseError = false;

    // Handle messages sent from the webview editor
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'edit': {
          if (typeof message.text !== 'string') {
            return;
          }

          // Safety guard: Prevent accidental file blanking.
          // If the existing document has visible content, but the incoming edit has none,
          // always block — user-initiated full deletions are not allowed to protect against
          // content loss during view mode switches (rendered ↔ raw).
          const currentText = document.getText();
          if (hasVisibleContent(currentText) && !hasVisibleContent(message.text)) {
            console.warn('Agent Cowork: Blocked content-erasing edit on document with visible content.');
            vscode.window.showWarningMessage(
              'Agent Cowork: Der gesamte Inhalt kann nicht gelöscht werden. Um den Text zu bearbeiten, verwenden Sie den Quelltext-Modus (Raw).'
            );
            return;
          }

          // Clear parse error state when a valid edit with visible content comes through,
          // indicating the user has recovered from the error state.
          if (hasParseError && hasVisibleContent(message.text)) {
            hasParseError = false;
          }

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

            // If autoSave is enabled in configuration, automatically save after edit.
            // Auto-save is suppressed while a parse error is active to prevent saving
            // corrupted or empty content that resulted from a failed view switch.
            const config = vscode.workspace.getConfiguration('agentCowork');
            if (config.get<boolean>('autoSave', true) && !hasParseError) {
              if (autoSaveTimer) {
                clearTimeout(autoSaveTimer);
              }
              autoSaveTimer = setTimeout(async () => {
                if (document.isDirty) {
                  // Safety check: Always confirm before saving a document with no visible content
                  const docText = document.getText();
                  if (!hasVisibleContent(docText)) {
                    const answer = await vscode.window.showWarningMessage(
                      'Agent Cowork: Das Dokument hat keinen Inhalt. Möchten Sie die leere Datei wirklich speichern?',
                      { modal: true },
                      'Speichern',
                      'Abbrechen'
                    );
                    if (answer !== 'Speichern') {
                      return;
                    }
                  }
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
        case 'parseError': {
          hasParseError = true;
          if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
          }
          vscode.window.showWarningMessage(
            `Agent Cowork: Formatierungsfehler im Markdown-Dokument (${message.error || 'Syntax-Fehler'}). Es wurde in den Raw-Modus gewechselt, um Datenverlust zu verhindern.`
          );
          break;
        }
        case 'serializationError': {
          vscode.window.showErrorMessage(
            `Agent Cowork: Fehler beim Konvertieren der Formatierung (${message.error || 'DOM-Fehler'}). Die Änderung wurde nicht gespeichert, um Datenverlust zu verhindern.`
          );
          break;
        }
        case 'cowork': {
          if (document.isDirty) {
            await document.save();
          }
          await vscode.commands.executeCommand('agent-cowork.coworkWithFile', document.uri, {
            newConversation: true,
          });
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
      <!-- Heading Select & Inline Formatting (Stacked Vertically) -->
      <div class="toolbar-group toolbar-group-text">
        <select id="select-heading" class="tb-select tb-select-compact" tabindex="-1" title="Textformatierung">
          <option value="p">Normaler Text</option>
          <option value="h1">Überschrift 1 (Groß)</option>
          <option value="h2">Überschrift 2 (Mittel)</option>
          <option value="h3">Überschrift 3 (Klein)</option>
        </select>
        <div class="toolbar-subgroup">
          <button id="btn-bold" class="tb-btn tb-btn-compact" tabindex="-1" title="Fett (Cmd+B)"><strong>B</strong></button>
          <button id="btn-italic" class="tb-btn tb-btn-compact" tabindex="-1" title="Kursiv (Cmd+I)"><em>I</em></button>
          <button id="btn-strike" class="tb-btn tb-btn-compact" tabindex="-1" title="Durchgestrichen"><del>S</del></button>
        </div>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Lists & Structure (Stacked Vertically) -->
      <div class="toolbar-group toolbar-group-vertical">
        <button id="btn-task" class="tb-btn tb-btn-stacked" tabindex="-1" title="Aufgabenliste (Checkliste)">
          <svg class="tb-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M2 3.75A1.75 1.75 0 0 1 3.75 2h2.5A1.75 1.75 0 0 1 8 3.75v2.5A1.75 1.75 0 0 1 6.25 8h-2.5A1.75 1.75 0 0 1 2 6.25v-2.5zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5zM10.25 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5zM2 11.75A1.75 1.75 0 0 1 3.75 10h2.5A1.75 1.75 0 0 1 8 11.75v2.5A1.75 1.75 0 0 1 6.25 15.75h-2.5A1.75 1.75 0 0 1 2 14.25v-2.5zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5zM10.25 12a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5z"/>
          </svg>
          <span>Aufgabe</span>
        </button>
        <button id="btn-bullet" class="tb-btn tb-btn-stacked" tabindex="-1" title="Aufzählungsliste">
          <svg class="tb-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="2.5" cy="3.5" r="1.5"/>
            <rect x="6" y="2.5" width="9.5" height="2" rx="1"/>
            <circle cx="2.5" cy="8" r="1.5"/>
            <rect x="6" y="7" width="9.5" height="2" rx="1"/>
            <circle cx="2.5" cy="12.5" r="1.5"/>
            <rect x="6" y="11.5" width="9.5" height="2" rx="1"/>
          </svg>
          <span>Liste</span>
        </button>
        <button id="btn-ordered" class="tb-btn tb-btn-stacked" tabindex="-1" title="Nummerierte Liste">
          <svg class="tb-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M2.003 2.5a.5.5 0 0 0-.723-.447l-1.003.5a.5.5 0 0 0 .446.894l.28-.14V6H.5a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1h-.497V2.5zM6 3.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 6 3.75zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 6 8.75zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75zM.5 9.5A.5.5 0 0 1 1 9h1.5a.5.5 0 0 1 .39.812L1.81 11H2.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.4-.8l1.6-2.2H1a.5.5 0 0 1-.5-.5z"/>
          </svg>
          <span>Nummeriert</span>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Insert Elements (Stacked Vertically) -->
      <div class="toolbar-group toolbar-group-insert toolbar-group-vertical">
        <button id="btn-quote" class="tb-btn tb-btn-stacked" tabindex="-1" title="Zitat / Info-Kasten">❝ Zitat</button>
        <button id="btn-table" class="tb-btn tb-btn-stacked" tabindex="-1" title="Tabelle einfügen">田 Tabelle</button>
        <button id="btn-code" class="tb-btn tb-btn-stacked" tabindex="-1" title="Code-Block">&lt;&gt; Code</button>
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

      <!-- Collapse / Expand Toolbar Toggle (bottom-right corner) -->
      <button id="btn-toggle-toolbar" class="toolbar-toggle-btn" tabindex="-1" title="Symbolleiste einklappen" aria-label="Symbolleiste einklappen" aria-expanded="true">
        <svg class="tb-collapse-icon" width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/>
        </svg>
      </button>
    </div>

    <!-- Error/Warning Banner -->
    <div id="error-banner" class="error-banner" style="display: none;" role="alert">
      <span class="error-banner-icon">⚠️</span>
      <span id="error-banner-text" class="error-banner-text"></span>
      <button id="error-banner-dismiss" class="error-banner-dismiss" title="Schließen">✕</button>
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
