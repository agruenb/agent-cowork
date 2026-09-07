import * as vscode from 'vscode';
import * as path from 'path';
import { formatFileReference } from './utils/fileReference';

export { formatFileReference };

/**
 * Formats a file reference for VS Code Chat prompt input from a vscode.Uri.
 */
export function formatChatFileReference(uri: vscode.Uri): string {
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  return formatFileReference(uri.fsPath, relativePath);
}

/**
 * Initiates a new AI conversation in VS Code's AI/Chat window and links the given file.
 */
export async function openCoworkChatWithFile(uri: vscode.Uri): Promise<void> {
  const fileReference = formatChatFileReference(uri);
  const availableCommands = new Set(await vscode.commands.getCommands(true));

  // 1. Start a fresh new chat session to ensure a clean conversation context
  if (availableCommands.has('workbench.action.chat.newChat')) {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.newChat');
      // Short delay to let the new chat session state initialize
      await new Promise((resolve) => setTimeout(resolve, 80));
    } catch (err) {
      console.warn('workbench.action.chat.newChat failed:', err);
    }
  }

  // 2. Try programmatically attaching the file if attach commands exist
  let fileAttached = false;
  if (availableCommands.has('workbench.action.chat.attachFile')) {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);
      fileAttached = true;
    } catch (err) {
      console.warn('workbench.action.chat.attachFile failed:', err);
    }
  }
  if (!fileAttached && availableCommands.has('github.copilot.chat.attachFile')) {
    try {
      await vscode.commands.executeCommand('github.copilot.chat.attachFile', uri);
      fileAttached = true;
    } catch (err) {
      console.warn('github.copilot.chat.attachFile failed:', err);
    }
  }

  // 3. Open the Chat window and prefill prompt with the file reference if not already attached
  if (availableCommands.has('workbench.action.chat.open')) {
    try {
      const query = fileAttached ? '' : `${fileReference} `;
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        isPartialQuery: true,
      });
      return;
    } catch (err) {
      console.warn('workbench.action.chat.open with options failed, attempting string query:', err);
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', `${fileReference} `);
        return;
      } catch (err2) {
        console.warn('workbench.action.chat.open with string failed:', err2);
      }
    }
  }

  // Fallback 4: Try quickchat
  if (availableCommands.has('workbench.action.quickchat.open')) {
    try {
      await vscode.commands.executeCommand('workbench.action.quickchat.open', {
        query: `${fileReference} `,
      });
      return;
    } catch (err) {
      console.warn('workbench.action.quickchat.open failed:', err);
    }
  }

  // Fallback 5: Other AI chat view providers (e.g. Gemini, Copilot panel, Cursor)
  const otherChatCommands = [
    'aichat.newsession',
    'geminicodeassist.openChat',
    'workbench.panel.chat.view.copilot.focus',
    'workbench.action.chat.toggle',
  ];
  for (const cmd of otherChatCommands) {
    if (availableCommands.has(cmd)) {
      try {
        await vscode.commands.executeCommand(cmd);
        return;
      } catch {
        // continue
      }
    }
  }

  // Fallback 6: If no chat provider is detected, notify the user gracefully
  const fileName = path.basename(uri.fsPath);
  vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Datei "{0}" ist bereit für Cowork. Bitte öffnen Sie das KI-Chatfenster (z. B. GitHub Copilot oder Gemini).',
      fileName
    )
  );
}

/**
 * High-level handler to start Coworking on a file.
 * Handles dirty buffer saving and active document resolution.
 */
export async function coworkWithFile(targetUri?: vscode.Uri): Promise<void> {
  let uri = targetUri;

  if (!uri) {
    if (vscode.window.activeTextEditor) {
      uri = vscode.window.activeTextEditor.document.uri;
    } else {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (activeTab?.input instanceof vscode.TabInputCustom) {
        uri = activeTab.input.uri;
      } else if (activeTab?.input instanceof vscode.TabInputText) {
        uri = activeTab.input.uri;
      }
    }
  }

  if (!uri) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Keine aktive Datei gefunden, um mit dem KI-Agenten zusammenzuarbeiten.')
    );
    return;
  }

  // Save if open document has unsaved modifications
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (doc?.isDirty) {
    await doc.save();
  }

  await openCoworkChatWithFile(uri);
}
