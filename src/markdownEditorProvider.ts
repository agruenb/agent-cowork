import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { hasVisibleContent } from './utils/markdownContent';
import { t, getEffectiveLanguage } from './i18n';
import { openCoworkTreeView } from './coworkViewManager';
import { toMarkdownImagePath } from './markdown/imagePath';
import { isVersionAtLeast } from './utils/vscodeVersion';

/**
 * Starting with this VS Code version, an agent's edit can reach the document before
 * the chat-editing baseline document is synced to the extension host.
 */
export const LATE_CHAT_BASELINE_MIN_VERSION = '1.144.0';

/**
 * Checks whether a document is a chat-editing snapshot document for the target document.
 */
export function isChatSnapshotDocumentFor(doc: vscode.TextDocument, target: vscode.TextDocument): boolean {
  const scheme = doc.uri.scheme;
  const isChatScheme =
    scheme === 'chat-editing-snapshot-text-model' ||
    scheme === 'chatEditing' ||
    scheme === 'chat-editing-text-model';
  if (!isChatScheme) {
    return false;
  }
  const docPath = doc.uri.fsPath || doc.uri.path;
  const targetPath = target.uri.fsPath || target.uri.path;
  if (!docPath || !targetPath) {
    return false;
  }
  return doc.uri.path === target.uri.path || doc.uri.fsPath === target.uri.fsPath;
}

/**
 * Retrieves the Git HEAD content for a document URI if tracked in Git.
 */
export function getGitHeadContent(uri: vscode.Uri): Promise<string | null> {
  return new Promise((resolve) => {
    const fsPath = uri.fsPath;
    const dir = path.dirname(fsPath);

    execFile(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: dir, timeout: 2000 },
      (err, toplevel) => {
        if (err || !toplevel) {
          resolve(null);
          return;
        }
        const gitRoot = toplevel.trim();
        const relPath = path.relative(gitRoot, fsPath);
        const gitRelPath = relPath.split(path.sep).join('/');

        execFile(
          'git',
          ['show', `HEAD:${gitRelPath}`],
          { cwd: gitRoot, timeout: 3000, maxBuffer: 10 * 1024 * 1024 },
          (err2, stdout) => {
            if (err2 || stdout === undefined) {
              resolve(null);
              return;
            }
            resolve(stdout);
          }
        );
      }
    );
  });
}

/**
 * Helper to extract an epoch counter from a snapshot URI query if present.
 */
export function getSnapshotEpoch(doc: vscode.TextDocument): number | null {
  try {
    if (doc.uri && (doc.uri as any).query) {
      const q = typeof (doc.uri as any).query === 'string'
        ? JSON.parse((doc.uri as any).query)
        : (doc.uri as any).query;
      if (typeof q?.undoStop === 'string') {
        const match = q.undoStop.match(/__epoch_(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
      if (typeof q?.epoch === 'number') {
        return q.epoch;
      }
    }
  } catch {}
  return null;
}

/**
 * Resolves the baseline pre-edit content for a document from active chat editing snapshots.
 * Returns the snapshot content if different from the current document text, or null.
 */
export async function getOriginalContent(document: vscode.TextDocument): Promise<string | null> {
  const normDoc = document.getText().replace(/\r\n/g, '\n');
  const docs = vscode.workspace.textDocuments || [];

  // 1. Check for active chat editing session model (scheme: 'chat-editing-text-model')
  // This is VS Code's ChatEditingModifiedDocumentEntry originalModel.
  const sessionDoc = docs.find(
    (doc) => doc.uri.scheme === 'chat-editing-text-model' && isChatSnapshotDocumentFor(doc, document)
  );

  if (sessionDoc) {
    const normSession = sessionDoc.getText().replace(/\r\n/g, '\n');
    if (normSession === normDoc) {
      // The active chat editing session accepted the edits (keep() updated originalModel to currentText)
      return null;
    }
    // Active session with pending edits: return the session's baseline text
    return sessionDoc.getText();
  }

  // 2. Check for other chat snapshot documents (e.g. 'chat-editing-snapshot-text-model' or 'chatEditing')
  const snapshotDocs = docs.filter(
    (doc) => isChatSnapshotDocumentFor(doc, document)
  );

  if (snapshotDocs.length === 0) {
    return null;
  }

  // Find snapshots whose content differs from current document text
  const differingSnapshots = snapshotDocs.filter(
    (doc) => doc.getText().replace(/\r\n/g, '\n') !== normDoc
  );

  if (differingSnapshots.length === 0) {
    return null;
  }

  // If there are multiple differing snapshots (e.g. multi-turn checkpoints),
  // pick the OLDEST snapshot (the initial session baseline).
  let oldestDoc = differingSnapshots[0];
  let minEpoch = getSnapshotEpoch(oldestDoc);

  for (let i = 1; i < differingSnapshots.length; i++) {
    const doc = differingSnapshots[i];
    const epoch = getSnapshotEpoch(doc);
    if (epoch !== null && (minEpoch === null || epoch < minEpoch)) {
      minEpoch = epoch;
      oldestDoc = doc;
    }
  }

  return oldestDoc.getText();
}

/**
 * Provider for the built-in formatted and editable Markdown editor in Agent Cowork.
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'agentCowork.markdownEditor';
  private static readonly activePanels = new Set<vscode.WebviewPanel>();
  private static currentActivePanel: vscode.WebviewPanel | null = null;
  private static treeViewVisible = true;
  private static readonly _onDidActiveDocumentChange = new vscode.EventEmitter<vscode.Uri>();
  public static readonly onDidActiveDocumentChange = MarkdownEditorProvider._onDidActiveDocumentChange.event;

  public static openFind(replace = false): void {
    const target = MarkdownEditorProvider.currentActivePanel || Array.from(MarkdownEditorProvider.activePanels)[0];
    if (target) {
      target.webview.postMessage({
        type: 'openFind',
        replace,
      });
    }
  }

  public static setTreeViewVisible(visible: boolean): void {
    MarkdownEditorProvider.treeViewVisible = visible;
    for (const panel of MarkdownEditorProvider.activePanels) {
      panel.webview.postMessage({
        type: 'treeViewVisibility',
        visible,
      });
    }
  }

  public static isTreeViewVisible(): boolean {
    return MarkdownEditorProvider.treeViewVisible;
  }

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

  public static notifyLanguageChanged(): void {
    const lang = getEffectiveLanguage();
    for (const panel of MarkdownEditorProvider.activePanels) {
      panel.webview.postMessage({
        type: 'setLanguage',
        language: lang,
      });
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    MarkdownEditorProvider.currentActivePanel = webviewPanel;
    // Notify that a custom editor document is active
    MarkdownEditorProvider._onDidActiveDocumentChange.fire(document.uri);

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        sendInitialContent();
      }
      if (e.webviewPanel.active) {
        MarkdownEditorProvider.currentActivePanel = webviewPanel;
        MarkdownEditorProvider._onDidActiveDocumentChange.fire(document.uri);
      }
    });

    // Setup webview options
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
        // Images are loaded relative to the Markdown file and the workspace
        ...(document.uri.scheme === 'file' ? [vscode.Uri.joinPath(document.uri, '..')] : []),
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
      ],
    };

    // Register panel for dynamic language configuration updates
    MarkdownEditorProvider.activePanels.add(webviewPanel);

    const initialCurrentText = document.getText();
    const initialSnapshot = await getOriginalContent(document);
    let baseline = initialSnapshot ?? initialCurrentText;
    let lastSyncedText = initialCurrentText;
    let reviewActive = Boolean(initialSnapshot && initialSnapshot !== initialCurrentText);

    // Load initial HTML content with document content
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document
    );

    let initFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    // Send document text and effective language to the editor webview.
    // Called whenever the webview signals it is ready (including after being
    // recreated when the panel is moved to a new VS Code window).
    const sendInitialContent = async () => {
      // Cancel any pending fallback timer to avoid double-sends
      if (initFallbackTimer) {
        clearTimeout(initFallbackTimer);
        initFallbackTimer = null;
      }
      const filename = document.uri.path.split('/').pop() || '';
      const docCurrentText = document.getText();

      webviewPanel.webview.postMessage({
        type: 'init',
        text: docCurrentText,
        language: getEffectiveLanguage(),
        filename,
        treeViewVisible: MarkdownEditorProvider.isTreeViewVisible(),
        imageBaseUri: getImageBaseUri(webviewPanel.webview, document),
      });

      const normDoc = docCurrentText.replace(/\r\n/g, '\n');
      const normBaseline = baseline.replace(/\r\n/g, '\n');
      if (reviewActive && normBaseline !== normDoc) {
        webviewPanel.webview.postMessage({
          type: 'aiDiff',
          originalText: baseline,
          currentText: docCurrentText,
        });
      } else {
        webviewPanel.webview.postMessage({
          type: 'clearAiDiff',
          text: docCurrentText,
        });
      }
    };

    // Wait for the webview to signal it is ready before sending initial content.
    // When a panel is moved to a new window, VS Code recreates the webview iframe
    // (JS re-executes, canvas is empty) but does NOT call resolveCustomTextEditor
    // again. The webview's fresh JS posts 'ready', and sendInitialContent responds.
    // Safety fallback: if the webview doesn't signal ready within 1.5s, send anyway.
    initFallbackTimer = setTimeout(() => {
      initFallbackTimer = null;
      sendInitialContent();
    }, 1500);

    const lateChatBaseline = isVersionAtLeast(vscode.version, LATE_CHAT_BASELINE_MIN_VERSION);

    // Re-checks the chat editing snapshots and starts or ends the review accordingly.
    // On VS Code >= LATE_CHAT_BASELINE_MIN_VERSION the agent's edit may reach the document
    // before the chat-editing baseline document reaches the extension host, so review mode
    // must also be able to start once that baseline document shows up.
    const syncDiffState = async () => {
      const snapshotText = await getOriginalContent(document);
      const docCurrentText = document.getText();
      const normDoc = docCurrentText.replace(/\r\n/g, '\n');
      const normSnap = snapshotText ? snapshotText.replace(/\r\n/g, '\n') : null;
      if (!normSnap || normSnap === normDoc) {
        if (reviewActive) {
          reviewActive = false;
          baseline = docCurrentText;
          webviewPanel.webview.postMessage({
            type: 'clearAiDiff',
            text: docCurrentText,
          });
        }
        return;
      }
      if (lateChatBaseline && !reviewActive && snapshotText !== null) {
        reviewActive = true;
        baseline = snapshotText;
        lastSyncedText = docCurrentText;
        webviewPanel.webview.postMessage({
          type: 'aiDiff',
          originalText: baseline,
          currentText: docCurrentText,
        });
      }
    };

    const openDocumentSubscription = lateChatBaseline
      ? vscode.workspace.onDidOpenTextDocument(async (openedDoc) => {
          if (isChatSnapshotDocumentFor(openedDoc, document)) {
            await syncDiffState();
          }
        })
      : undefined;

    // Listen to changes in the underlying VS Code TextDocument
    // (e.g. background edits from AI Agents, git pulls, or text editor saves)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (isChatSnapshotDocumentFor(e.document, document)) {
        await syncDiffState();
        return;
      }

      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (e.contentChanges.length === 0) {
        return;
      }

      const text = document.getText();
      if (text === lastSyncedText) {
        return;
      }

      const isUndoRedo =
        e.reason === vscode.TextDocumentChangeReason.Undo ||
        e.reason === vscode.TextDocumentChangeReason.Redo;

      if (reviewActive) {
        const normDoc = text.replace(/\r\n/g, '\n');
        const normBaseline = baseline.replace(/\r\n/g, '\n');
        if (normDoc === normBaseline) {
          reviewActive = false;
          webviewPanel.webview.postMessage({
            type: 'clearAiDiff',
            text,
          });
        } else {
          webviewPanel.webview.postMessage({
            type: 'aiDiff',
            originalText: baseline,
            currentText: text,
          });
        }
      } else {
        const chatSnapshot = !isUndoRedo ? await getOriginalContent(document) : null;
        if (!isUndoRedo && chatSnapshot !== null) {
          reviewActive = true;
          baseline = chatSnapshot;
          webviewPanel.webview.postMessage({
            type: 'aiDiff',
            originalText: baseline,
            currentText: text,
          });
        } else {
          baseline = text;
          webviewPanel.webview.postMessage({
            type: 'update',
            text,
          });
        }
      }
      lastSyncedText = text;
    });

    const closeDocumentSubscription = vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
      if (isChatSnapshotDocumentFor(closedDoc, document)) {
        await syncDiffState();
      }
    });

    const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
      if (savedDoc.uri.toString() === document.uri.toString()) {
        if (reviewActive) {
          await syncDiffState();
        }
      }
    });

    let autoSaveTimer: NodeJS.Timeout | null = null;
    let hasParseError = false;

    // Handle messages sent from the webview editor
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready': {
          // Webview JS has loaded and is listening for messages
          sendInitialContent();
          break;
        }
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
              t('Agent Cowork: Der gesamte Inhalt kann nicht gelöscht werden. Um den Text zu bearbeiten, verwenden Sie den Quelltext-Modus (Raw).')
            );
            return;
          }

          // Clear parse error state when a valid edit with visible content comes through,
          // indicating the user has recovered from the error state.
          if (hasParseError && hasVisibleContent(message.text)) {
            hasParseError = false;
          }

          // Check if document content is already identical
          const normalizedIncoming = document.eol === vscode.EndOfLine.CRLF
            ? message.text.replace(/\r?\n/g, '\r\n')
            : message.text.replace(/\r\n/g, '\n');
          if (currentText === normalizedIncoming) {
            return;
          }

          lastSyncedText = normalizedIncoming;
          if (!reviewActive) {
            baseline = normalizedIncoming;
          }

          try {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              0,
              0,
              document.lineCount,
              document.lineCount > 0 ? document.lineAt(document.lineCount - 1).range.end.character : 0
            );
            edit.replace(document.uri, fullRange, normalizedIncoming);
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
                      t('Agent Cowork: Das Dokument hat keinen Inhalt. Möchten Sie die leere Datei wirklich speichern?'),
                      { modal: true },
                      t('Speichern'),
                      t('Abbrechen')
                    );
                    if (answer !== t('Speichern')) {
                      return;
                    }
                  }
                  await document.save();
                }
              }, 1000);
            }
          } catch (err) {
            console.error('Agent Cowork: Failed to apply edit:', err);
          }
          break;
        }
        case 'undo': {
          await vscode.commands.executeCommand('undo');
          break;
        }
        case 'redo': {
          await vscode.commands.executeCommand('redo');
          break;
        }
        case 'parseError': {
          hasParseError = true;
          if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
          }
          vscode.window.showWarningMessage(
            t(
              'Agent Cowork: Formatierungsfehler im Markdown-Dokument ({0}). Es wurde in den Raw-Modus gewechselt, um Datenverlust zu verhindern.',
              message.error || t('Syntax-Fehler')
            )
          );
          break;
        }
        case 'serializationError': {
          vscode.window.showErrorMessage(
            t(
              'Agent Cowork: Fehler beim Konvertieren der Formatierung ({0}). Die Änderung wurde nicht gespeichert, um Datenverlust zu verhindern.',
              message.error || t('DOM-Fehler')
            )
          );
          break;
        }
        case 'copy': {
          if (typeof message.text === 'string') {
            await vscode.env.clipboard.writeText(message.text);
          }
          break;
        }
        case 'openCoworkView': {
          await openCoworkTreeView();
          break;
        }
        case 'pickImage': {
          if (typeof message.requestId !== 'number') {
            break;
          }
          const picked = await pickImageForDocument(document);
          if (picked) {
            webviewPanel.webview.postMessage({
              type: 'imagePicked',
              requestId: message.requestId,
              ...picked,
            });
          }
          break;
        }
        case 'openLink': {
          if (document.isDirty) {
            await document.save();
          }
          if (typeof message.href === 'string') {
            await handleOpenLink(message.href, document, webviewPanel);
          }
          break;
        }
        case 'cowork': {
          if (document.isDirty) {
            await document.save();
          }
          const hasLines = typeof message.startLine === 'number' && message.startLine > 0;
          await vscode.commands.executeCommand('agent-cowork.coworkWithFile', document.uri, {
            newConversation: hasLines ? false : true,
            startLine: hasLines ? message.startLine : undefined,
            endLine: hasLines ? message.endLine : undefined,
          });
          break;
        }
        case 'acceptAiEdits': {
          const currentText = document.getText();
          baseline = currentText;
          lastSyncedText = currentText;
          reviewActive = false;

          const availableCommands = new Set(await vscode.commands.getCommands(true));
          const candidateCommands = [
            'chatEditing.acceptFile',
            'interactiveEditor.accept',
            'antigravity.agent.accept',
            'antigravity.chat.accept',
            'chatEditing.acceptAllFiles',
          ];
          for (const cmd of availableCommands) {
            if (/chatEditing\.accept/i.test(cmd) && !candidateCommands.includes(cmd)) {
              candidateCommands.push(cmd);
            }
          }

          for (const cmd of candidateCommands) {
            if (availableCommands.has(cmd)) {
              try {
                await vscode.commands.executeCommand(cmd, document.uri);
                console.log(`Agent Cowork: Executed chat accept command '${cmd}'`);
                break;
              } catch (err) {
                console.warn(`Agent Cowork: Error executing '${cmd}':`, err);
              }
            }
          }

          const config = vscode.workspace.getConfiguration('agentCowork');
          if (config.get<boolean>('autoSave', true) && document.isDirty) {
            await document.save();
          }

          webviewPanel.webview.postMessage({
            type: 'clearAiDiff',
            text: currentText,
          });
          break;
        }
        case 'rejectAiEdits': {
          const targetRevertText = baseline;
          reviewActive = false;

          const availableCommands = new Set(await vscode.commands.getCommands(true));
          const candidateCommands = [
            'chatEditing.discardFile',
            'interactiveEditor.discard',
            'antigravity.agent.discard',
            'antigravity.chat.discard',
            'chatEditing.discardAllFiles',
          ];
          for (const cmd of availableCommands) {
            if (/chatEditing\.discard/i.test(cmd) && !candidateCommands.includes(cmd)) {
              candidateCommands.push(cmd);
            }
          }

          for (const cmd of candidateCommands) {
            if (availableCommands.has(cmd)) {
              try {
                await vscode.commands.executeCommand(cmd, document.uri);
                console.log(`Agent Cowork: Executed chat discard command '${cmd}'`);
                break;
              } catch (err) {
                console.warn(`Agent Cowork: Error executing '${cmd}':`, err);
              }
            }
          }

          if (document.getText() !== targetRevertText) {
            lastSyncedText = targetRevertText;
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              0,
              0,
              document.lineCount,
              document.lineCount > 0 ? document.lineAt(document.lineCount - 1).range.end.character : 0
            );
            edit.replace(document.uri, fullRange, targetRevertText);
            await vscode.workspace.applyEdit(edit);
          } else {
            lastSyncedText = targetRevertText;
          }

          webviewPanel.webview.postMessage({
            type: 'clearAiDiff',
            text: targetRevertText,
          });
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      MarkdownEditorProvider.activePanels.delete(webviewPanel);
      if (MarkdownEditorProvider.currentActivePanel === webviewPanel) {
        MarkdownEditorProvider.currentActivePanel = null;
      }
      if (initFallbackTimer) {
        clearTimeout(initFallbackTimer);
      }
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      openDocumentSubscription?.dispose();
      changeDocumentSubscription.dispose();
      closeDocumentSubscription.dispose();
      saveDocumentSubscription.dispose();
    });
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    document?: vscode.TextDocument
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'markdownEditor.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'markdownEditor.css')
    );

    const nonce = getNonce();
    const lang = getEffectiveLanguage();
    const docText = document ? document.getText() : '';
    const filename = document ? document.uri.path.split('/').pop() || '' : '';
    const initialDataJson = JSON.stringify({
      text: docText,
      filename,
      language: lang,
      treeViewVisible: MarkdownEditorProvider.isTreeViewVisible(),
      imageBaseUri: document ? getImageBaseUri(webview, document) : '',
    })
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}?v=${Date.now()}">
  <title>Markdown Editor</title>
</head>
<body>
  <div class="app-container">
    <!-- Floating button on left edge to restore closed Cowork tree view -->
    <button id="btn-show-cowork-tree" class="show-cowork-tree-btn" tabindex="-1" title="${t('Arbeitsordner anzeigen')}" aria-label="${t('Arbeitsordner anzeigen')}">
      <svg class="tree-toggle-icon" width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 2A1.75 1.75 0 0 0 0 3.75v8.5C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0 0 16 12.25v-8.5A1.75 1.75 0 0 0 14.25 2H1.75zM1.5 6h4v6.5h-3.75a.25.25 0 0 1-.25-.25V6zm5.5 6.5V6h7.5v6.25a.25.25 0 0 1-.25.25H7zm7.5-8H1.5v-.25c0-.138.112-.25.25-.25h12.5c.138 0 .25.112.25.25V4.5z"/>
      </svg>
      <svg class="tree-arrow-icon" width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
        <path fill-rule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
      </svg>
    </button>

    <!-- Toolbar icon sprite (16px grid, shared stroke weight) -->
    <svg class="tb-sprite" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="tb-i-bold" viewBox="0 0 16 16"><path d="M4.75 2.75h3.9a2.4 2.4 0 0 1 0 4.8h-3.9zM4.75 7.55h4.6a2.6 2.6 0 0 1 0 5.2h-4.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-italic" viewBox="0 0 16 16"><path d="M7 2.75h5M4 13.25h5M9.6 2.75 6.4 13.25" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
        <symbol id="tb-i-strike" viewBox="0 0 16 16"><path d="M2.5 8h11M11.2 4.3c-.5-1-1.6-1.55-3.1-1.55-1.85 0-3.1.95-3.1 2.25 0 .55.25 1 .75 1.35M4.9 11.2c.45 1.25 1.7 2.05 3.3 2.05 1.95 0 3.25-.95 3.25-2.35 0-.35-.08-.65-.25-.95" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
        <symbol id="tb-i-checklist" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="4.5" height="4.5" rx="1"/><path d="m3.1 4.8 1 1 1.4-1.8"/><rect x="2" y="9" width="4.5" height="4.5" rx="1"/><path d="M9 4.75h5M9 11.25h5"/></g></symbol>
        <symbol id="tb-i-bullets" viewBox="0 0 16 16"><g fill="currentColor"><circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/></g><path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
        <symbol id="tb-i-numbers" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7M7 8h7M7 12h7" stroke-width="1.3"/><path d="M2.4 3.1 3.2 2.5v3" stroke-width="1"/><path d="M2.2 7.1c.15-.4.5-.65.95-.65.5 0 .85.3.85.75 0 .75-1.8 1.3-1.8 2.2h1.85" stroke-width="1"/><path d="M2.2 11.05c.15-.35.5-.55.9-.55.5 0 .85.3.85.7s-.35.7-.85.7c.5 0 .9.3.9.75s-.4.75-.9.75c-.45 0-.8-.2-.95-.6" stroke-width="1"/></g></symbol>
        <symbol id="tb-i-quote" viewBox="0 0 16 16"><path d="M3 2.75v10.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 4.5h7.5M6.5 8h7.5M6.5 11.5h5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
        <symbol id="tb-i-table" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.75" width="12" height="10.5" rx="1.5"/><path d="M2 6.25h12M2 9.75h12M6.5 6.25v7"/></g></symbol>
        <symbol id="tb-i-image" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.75" width="12" height="10.5" rx="1.5"/><circle cx="5.75" cy="6.25" r="1.1"/><path d="m2.5 12 3.6-3.6 2.4 2.4 2-2 3.5 3.5"/></g></symbol>
        <symbol id="tb-i-code" viewBox="0 0 16 16"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-search" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3.3 3.3"/></g></symbol>
        <symbol id="tb-i-doc" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M4 1.75h5.25L12.5 5v9.25H4z"/><path d="M9 1.75V5.25h3.5M6.25 8h4M6.25 10.75h4"/></g></symbol>
        <symbol id="tb-i-markdown" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 10.25v-4.5l1.75 2 1.75-2v4.5M11 5.75v4.5M9.5 8.75 11 10.25l1.5-1.5"/></g></symbol>
        <symbol id="tb-i-chat" viewBox="0 0 16 16"><path d="M2.5 3.75a1.25 1.25 0 0 1 1.25-1.25h8.5a1.25 1.25 0 0 1 1.25 1.25v5.5A1.25 1.25 0 0 1 12.25 10.5H7.25L4.25 13v-2.5h-.5A1.25 1.25 0 0 1 2.5 9.25z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-chevron-up" viewBox="0 0 16 16"><path d="m4 10 4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-arrow-up" viewBox="0 0 16 16"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-arrow-down" viewBox="0 0 16 16"><path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-check" viewBox="0 0 16 16"><path d="m3 8.5 3.2 3.2L13 4.75" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="tb-i-close" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="tb-i-diff" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M8 4.75v3.5M6.25 6.5h3.5M6.25 11h3.5"/></g></symbol>
        <symbol id="tb-i-more" viewBox="0 0 16 16"><g fill="currentColor"><circle cx="3.5" cy="8" r="1.15"/><circle cx="8" cy="8" r="1.15"/><circle cx="12.5" cy="8" r="1.15"/></g></symbol>
        <symbol id="tb-i-warning" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5z"/><path d="M8 6.25v3"/></g><circle cx="8" cy="11.4" r=".8" fill="currentColor"/></symbol>
      </defs>
    </svg>

    <!-- Editor Toolbar: data-mode switches between formatting ("edit") and AI review ("review") -->
    <div class="toolbar" role="toolbar" aria-label="${t('Editor Werkzeugleiste')}" data-mode="edit">
      <div class="tb-group tb-edit">
        <select id="select-heading" class="tb-select" tabindex="-1" title="${t('Textformatierung')}" aria-label="${t('Textformatierung')}">
          <option value="p">${t('Normaler Text')}</option>
          <option value="h1">${t('Überschrift 1 (Groß)')}</option>
          <option value="h2">${t('Überschrift 2 (Mittel)')}</option>
          <option value="h3">${t('Überschrift 3 (Klein)')}</option>
          <option value="h4">${t('Überschrift 4 (Sehr klein)')}</option>
        </select>
      </div>

      <div class="tb-divider tb-edit"></div>

      <div class="tb-group tb-edit">
        <button id="btn-bold" class="tb-btn" tabindex="-1" title="${t('Fett (Cmd+B)')}" aria-label="${t('Fett (Cmd+B)')}"><svg class="tb-icon"><use href="#tb-i-bold"/></svg></button>
        <button id="btn-italic" class="tb-btn" tabindex="-1" title="${t('Kursiv (Cmd+I)')}" aria-label="${t('Kursiv (Cmd+I)')}"><svg class="tb-icon"><use href="#tb-i-italic"/></svg></button>
        <button id="btn-strike" class="tb-btn" tabindex="-1" title="${t('Durchgestrichen')}" aria-label="${t('Durchgestrichen')}"><svg class="tb-icon"><use href="#tb-i-strike"/></svg></button>
      </div>

      <div class="tb-divider tb-edit tb-fold-2"></div>

      <div class="tb-group tb-edit tb-fold-2" data-overflow>
        <button id="btn-task" class="tb-btn" tabindex="-1" title="${t('Aufgabenliste (Checkliste)')}" aria-label="${t('Aufgabenliste (Checkliste)')}"><svg class="tb-icon"><use href="#tb-i-checklist"/></svg></button>
        <button id="btn-bullet" class="tb-btn" tabindex="-1" title="${t('Aufzählungsliste')}" aria-label="${t('Aufzählungsliste')}"><svg class="tb-icon"><use href="#tb-i-bullets"/></svg></button>
        <button id="btn-ordered" class="tb-btn" tabindex="-1" title="${t('Nummerierte Liste')}" aria-label="${t('Nummerierte Liste')}"><svg class="tb-icon"><use href="#tb-i-numbers"/></svg></button>
      </div>

      <div class="tb-divider tb-edit tb-fold-1"></div>

      <div class="tb-group tb-edit tb-fold-1" data-overflow>
        <button id="btn-quote" class="tb-btn" tabindex="-1" title="${t('Zitat / Info-Kasten')}" aria-label="${t('Zitat / Info-Kasten')}"><svg class="tb-icon"><use href="#tb-i-quote"/></svg></button>
        <button id="btn-image" class="tb-btn" tabindex="-1" title="${t('Bild einfügen')}" aria-label="${t('Bild einfügen')}"><svg class="tb-icon"><use href="#tb-i-image"/></svg></button>
        <button id="btn-table" class="tb-btn" tabindex="-1" title="${t('Tabelle einfügen')}" aria-label="${t('Tabelle einfügen')}"><svg class="tb-icon"><use href="#tb-i-table"/></svg></button>
        <button id="btn-code" class="tb-btn" tabindex="-1" title="${t('Code-Block')}" aria-label="${t('Code-Block')}"><svg class="tb-icon"><use href="#tb-i-code"/></svg></button>
      </div>

      <!-- Overflow menu: lists the groups hidden by narrow-width container queries -->
      <div class="tb-overflow tb-edit">
        <div class="tb-divider"></div>
        <button id="btn-toolbar-more" class="tb-btn" tabindex="-1" title="${t('Weitere Werkzeuge')}" aria-label="${t('Weitere Werkzeuge')}" aria-haspopup="menu" aria-expanded="false"><svg class="tb-icon"><use href="#tb-i-more"/></svg></button>
        <div id="toolbar-overflow-menu" class="tb-menu" role="menu" hidden></div>
      </div>

      <div class="toolbar-spacer tb-edit"></div>

      <!-- AI review bar (shown instead of the formatting controls while AI changes wait for a decision) -->
      <div id="ai-edits-panel" class="ai-edits-panel" style="display: none;">
        <span id="ai-edits-stats" class="ai-edits-stats">
          <svg class="tb-icon"><use href="#tb-i-diff"/></svg>
          <span id="ai-edits-title" class="ai-edits-title">${t('KI-Änderungen')}</span>
          <span class="ai-edits-numbers"><span id="ai-stat-add" class="ai-stat-add">+0</span><span id="ai-stat-del" class="ai-stat-del">-0</span></span>
        </span>
        <div class="tb-divider"></div>
        <button id="btn-ai-prev" class="tb-btn" tabindex="-1" title="${t('Vorherige Änderung (Umschalt+F7)')}" aria-label="${t('Vorherige Änderung (Umschalt+F7)')}"><svg class="tb-icon"><use href="#tb-i-arrow-up"/></svg></button>
        <span id="ai-change-count" class="ai-change-count" aria-live="polite"></span>
        <button id="btn-ai-next" class="tb-btn" tabindex="-1" title="${t('Nächste Änderung (F7)')}" aria-label="${t('Nächste Änderung (F7)')}"><svg class="tb-icon"><use href="#tb-i-arrow-down"/></svg></button>
        <div class="toolbar-spacer"></div>
        <span id="ai-edits-hint" class="ai-edits-hint">${t('Bearbeiten pausiert, bis du entscheidest')}</span>
        <button id="btn-ai-reject" class="tb-text-btn tb-secondary" tabindex="-1" title="${t('KI-Änderungen verwerfen')}"><svg class="tb-icon"><use href="#tb-i-close"/></svg><span class="tb-label">${t('Verwerfen')}</span></button>
        <button id="btn-ai-accept" class="tb-text-btn tb-primary" tabindex="-1" title="${t('KI-Änderungen übernehmen')}"><svg class="tb-icon"><use href="#tb-i-check"/></svg><span class="tb-label">${t('Übernehmen')}</span></button>
      </div>

      <button id="btn-toolbar-find" class="tb-btn tb-edit tb-fold-2" data-overflow tabindex="-1" title="${t('Suchen (Cmd+F)')}" aria-label="${t('Suchen')}"><svg class="tb-icon"><use href="#tb-i-search"/></svg></button>

      <!-- View switch: formatted document or Markdown source -->
      <div class="tb-seg tb-fold-2" data-overflow role="group" aria-label="${t('Ansicht')}">
        <button id="btn-view-formatted" class="tb-btn is-active" tabindex="-1" title="${t('Formatierte Ansicht')}" aria-label="${t('Formatierte Ansicht')}" aria-pressed="true"><svg class="tb-icon"><use href="#tb-i-doc"/></svg></button>
        <button id="btn-toggle-raw" class="tb-btn" tabindex="-1" title="${t('Markdown-Quelltext anzeigen oder bearbeiten')}" aria-label="${t('Markdown-Quelltext anzeigen oder bearbeiten')}" aria-pressed="false"><svg class="tb-icon"><use href="#tb-i-markdown"/></svg></button>
      </div>

      <div class="tb-divider tb-edit"></div>

      <!-- Cowork with AI button -->
      <button id="btn-cowork" class="tb-text-btn tb-primary tb-edit" tabindex="-1" title="${t('Mit KI-Agent an diesem Dokument zusammenarbeiten')}" aria-label="Cowork"><span class="tb-label">Cowork</span><svg class="tb-icon"><use href="#tb-i-chat"/></svg></button>

      <!-- Collapse / expand toggle (becomes a pull tab under the collapsed strip) -->
      <button id="btn-toggle-toolbar" class="tb-btn toolbar-toggle-btn tb-edit" tabindex="-1" title="${t('Symbolleiste einklappen')}" aria-label="${t('Symbolleiste einklappen')}" aria-expanded="true"><svg class="tb-icon tb-collapse-icon"><use href="#tb-i-chevron-up"/></svg></button>
    </div>

    <!-- Floating Find & Replace Widget -->
    <div id="find-widget" class="find-widget" style="display: none;" role="search" aria-label="${t('Suchen und Ersetzen')}">
      <div class="find-row">
        <button id="btn-find-toggle-replace" class="find-btn find-btn-icon find-toggle-replace-btn" tabindex="-1" title="${t('Ersetzen ein-/ausblenden')}" aria-label="${t('Ersetzen ein-/ausblenden')}" aria-expanded="false">
          <svg class="find-chevron-icon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
          </svg>
        </button>

        <div class="find-input-container">
          <input id="find-input" class="find-input" type="text" placeholder="${t('Suchen')}" autocomplete="off" spellcheck="false" />
          <div class="find-input-actions">
            <button id="btn-find-case" class="find-toggle-opt-btn" tabindex="-1" title="${t('Groß-/Kleinschreibung beachten')}" aria-label="${t('Groß-/Kleinschreibung beachten')}">
              <span>Aa</span>
            </button>
            <button id="btn-find-word" class="find-toggle-opt-btn" tabindex="-1" title="${t('Nur ganzes Wort')}" aria-label="${t('Nur ganzes Wort')}">
              <span>\\b</span>
            </button>
          </div>
        </div>

        <span id="find-count" class="find-count" aria-live="polite">0/0</span>

        <div class="find-nav-group">
          <button id="btn-find-prev" class="find-btn find-btn-icon" tabindex="-1" title="${t('Vorheriges Ergebnis (Umschalt+Eingabe)')}" aria-label="${t('Vorheriges Ergebnis')}">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M3.22 9.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 0 1-1.06 0z"/>
            </svg>
          </button>
          <button id="btn-find-next" class="find-btn find-btn-icon" tabindex="-1" title="${t('Nächstes Ergebnis (Eingabe)')}" aria-label="${t('Nächstes Ergebnis')}">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M3.22 6.22a.75.75 0 0 1 1.06 0L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0l-4.25-4.25a.75.75 0 0 1 0-1.06z"/>
            </svg>
          </button>
        </div>

        <button id="btn-find-close" class="find-btn find-btn-icon find-close-btn" tabindex="-1" title="${t('Schließen (Esc)')}" aria-label="${t('Schließen')}">
          ✕
        </button>
      </div>

      <div id="find-replace-row" class="find-replace-row" style="display: none;">
        <div class="find-replace-indent"></div>

        <div class="find-input-container">
          <input id="find-replace-input" class="find-input" type="text" placeholder="${t('Ersetzen')}" autocomplete="off" spellcheck="false" />
        </div>

        <div class="find-replace-actions">
          <button id="btn-replace" class="find-btn find-action-btn" tabindex="-1" title="${t('Ersetzen')}">
            <span>${t('Ersetzen')}</span>
          </button>
          <button id="btn-replace-all" class="find-btn find-action-btn" tabindex="-1" title="${t('Alles ersetzen')}">
            <span>${t('Alles ersetzen')}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error/Warning Banner -->
    <div id="error-banner" class="error-banner" style="display: none;" role="alert">
      <svg class="error-banner-icon tb-icon" aria-hidden="true"><use href="#tb-i-warning"/></svg>
      <span id="error-banner-text" class="error-banner-text"></span>
      <button id="error-banner-dismiss" class="error-banner-dismiss" title="${t('Schließen')}">✕</button>
    </div>

    <!-- Document Scroll Area -->
    <div class="document-viewport">
      <div class="document-container">
        <!-- Formatted Editable Document Canvas -->
        <div id="editor" class="editor-canvas" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>

        <!-- Raw Markdown View with Synchronized Line Numbers Gutter -->
        <div id="raw-wrapper" class="raw-wrapper" style="display: none;">
          <div id="raw-gutter" class="raw-gutter" aria-hidden="true"></div>
          <textarea id="raw-textarea" class="raw-textarea" spellcheck="false" placeholder="${t('Markdown eingeben...')}"></textarea>
          <div id="raw-mirror" class="raw-mirror" aria-hidden="true"></div>
          <div id="raw-diff" class="raw-diff-container" style="display: none;"></div>
        </div>
      </div>
    </div>

    <!-- Floating Cowork button on text selection -->
    <button id="btn-selection-cowork" class="selection-cowork-btn" tabindex="-1" title="${t('Mit KI-Agent an den ausgewählten Zeilen zusammenarbeiten')}" aria-label="Cowork"><span>Cowork</span><svg class="tb-icon" aria-hidden="true"><use href="#tb-i-chat"/></svg></button>
  </div>

  <script id="agent-cowork-init-data" type="application/json" nonce="${nonce}">${initialDataJson}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Webview URI of the folder that contains the document; relative image paths resolve against it.
 */
function getImageBaseUri(webview: vscode.Webview, document: vscode.TextDocument): string {
  if (document.uri.scheme !== 'file') {
    return '';
  }
  return `${webview.asWebviewUri(vscode.Uri.joinPath(document.uri, '..')).toString()}/`;
}

/**
 * Lets the user choose an image file inside the document's folder and returns its path
 * relative to the document, so the link keeps working when the folder is moved.
 */
async function pickImageForDocument(
  document: vscode.TextDocument
): Promise<{ src: string; alt: string } | undefined> {
  if (document.uri.scheme !== 'file') {
    return undefined;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    defaultUri: vscode.Uri.joinPath(document.uri, '..'),
    title: t('Bild auswählen'),
    openLabel: t('Bild auswählen'),
    filters: { [t('Bilder')]: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'] },
  });
  const target = picked?.[0];
  if (!target) {
    return undefined;
  }

  // Only images inside the document's folder tree are allowed, so every stored path stays
  // a plain downward path and keeps working when the folder is moved.
  const relative = path.relative(path.dirname(document.uri.fsPath), target.fsPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    void vscode.window.showWarningMessage(
      t('Das ausgewählte Bild liegt nicht im selben Ordner wie dieses Dokument. Eingefügte Bilder müssen im selben Ordner oder in einem Unterordner liegen.')
    );
    return undefined;
  }
  const src = toMarkdownImagePath(relative);
  const alt = path.basename(target.fsPath, path.extname(target.fsPath));
  return { src, alt };
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Resolves and opens a link clicked in the Markdown editor.
 * Handles relative file paths (e.g. ./file.md, <./file.md>), absolute paths,
 * line numbers/fragments (e.g. #L42), in-document anchors (#heading),
 * external URLs (https://, http://, mailto:), and non-existent files with creation prompt.
 */
export async function handleOpenLink(
  href: string,
  baseDocument: vscode.TextDocument,
  webviewPanel?: vscode.WebviewPanel
): Promise<void> {
  if (typeof href !== 'string') {
    return;
  }

  let cleanHref = href.trim();
  if (cleanHref.startsWith('<') && cleanHref.endsWith('>')) {
    cleanHref = cleanHref.slice(1, -1).trim();
  }

  if (!cleanHref) {
    return;
  }

  // Handle external links (http, https, mailto, vscode schemes)
  if (/^(https?|mailto|vscode):/i.test(cleanHref)) {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(cleanHref));
    } catch (err) {
      console.warn('Failed to open external link:', err);
    }
    return;
  }

  // Handle in-document anchor (#heading)
  if (cleanHref.startsWith('#')) {
    if (webviewPanel) {
      webviewPanel.webview.postMessage({
        type: 'scrollToAnchor',
        anchor: cleanHref,
      });
    }
    return;
  }

  // Separate path from optional fragment (#anchor or #L20)
  let filePath = cleanHref;
  let fragment = '';
  const hashIdx = cleanHref.indexOf('#');
  if (hashIdx !== -1) {
    filePath = cleanHref.substring(0, hashIdx);
    fragment = cleanHref.substring(hashIdx + 1);
  }

  if (!filePath) {
    if (webviewPanel && fragment) {
      webviewPanel.webview.postMessage({
        type: 'scrollToAnchor',
        anchor: fragment,
      });
    }
    return;
  }

  // Decode percent-encoded characters (e.g. %20 -> space)
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // Keep filePath as-is if decoding fails
  }

  let targetUri: vscode.Uri;
  if (filePath.startsWith('file://')) {
    targetUri = vscode.Uri.parse(filePath);
  } else if (path.isAbsolute(filePath)) {
    let exists = false;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      const wsFolder =
        vscode.workspace.getWorkspaceFolder(baseDocument.uri) ||
        vscode.workspace.workspaceFolders?.[0];
      if (wsFolder) {
        const candidate = vscode.Uri.joinPath(wsFolder.uri, filePath.replace(/^[/\\]+/, ''));
        try {
          await vscode.workspace.fs.stat(candidate);
          targetUri = candidate;
          exists = true;
        } catch {
          // not found in workspace
        }
      }
    }

    if (!targetUri!) {
      targetUri = vscode.Uri.file(filePath);
    }
  } else {
    // Relative path: resolve relative to the current document's directory
    const baseDir = path.dirname(baseDocument.uri.fsPath);
    const resolvedPath = path.resolve(baseDir, filePath);
    targetUri = vscode.Uri.file(resolvedPath);
  }

  // If the target is the current document, scroll to fragment if present
  if (targetUri.fsPath === baseDocument.uri.fsPath) {
    if (webviewPanel && fragment) {
      webviewPanel.webview.postMessage({
        type: 'scrollToAnchor',
        anchor: fragment,
      });
    }
    return;
  }

  // Check if target file exists
  let targetExists = false;
  try {
    await vscode.workspace.fs.stat(targetUri);
    targetExists = true;
  } catch {
    targetExists = false;
  }

  if (!targetExists) {
    const createBtn = t('Datei erstellen');
    const answer = await vscode.window.showWarningMessage(
      t('Agent Cowork: Die verlinkte Datei existiert nicht: {0}', path.basename(targetUri.fsPath)),
      createBtn
    );
    if (answer === createBtn) {
      try {
        const parentDir = vscode.Uri.file(path.dirname(targetUri.fsPath));
        await vscode.workspace.fs.createDirectory(parentDir);
        await vscode.workspace.fs.writeFile(targetUri, new Uint8Array(0));
        targetExists = true;
      } catch (err) {
        vscode.window.showErrorMessage(
          t('Agent Cowork: Datei konnte nicht erstellt werden: {0}', String(err))
        );
        return;
      }
    } else {
      return;
    }
  }

  // Determine line selection if fragment specifies line number (e.g. #L25, #line-25, #25)
  let lineSelection: vscode.Range | undefined;
  const lineMatch = fragment.match(/^(?:L|line-?)?(\d+)(?:-(\d+))?$/i);
  if (lineMatch) {
    const startLine = Math.max(0, parseInt(lineMatch[1], 10) - 1);
    const endLine = lineMatch[2] ? Math.max(0, parseInt(lineMatch[2], 10) - 1) : startLine;
    lineSelection = new vscode.Range(startLine, 0, endLine, 0);
  }

  // Open the file
  const ext = path.extname(targetUri.fsPath).toLowerCase();
  const isMarkdown =
    ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkdn' || ext === '.mdx';

  if (isMarkdown) {
    try {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        'agentCowork.markdownEditor',
        lineSelection ? { selection: lineSelection } : undefined
      );
      return;
    } catch {
      // Fallback to vscode.open if openWith fails
    }
  }

  await vscode.commands.executeCommand(
    'vscode.open',
    targetUri,
    lineSelection ? { selection: lineSelection } : undefined
  );
}
