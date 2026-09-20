import * as vscode from 'vscode';
import * as path from 'path';
import { formatFileReference } from './utils/fileReference';
import { t } from './i18n';

export { formatFileReference };

/**
 * Formats a file or folder reference for VS Code Chat prompt input from a vscode.Uri.
 */
export function formatChatFileReference(
  uri: vscode.Uri,
  isDirectory: boolean = false,
  startLine?: number,
  endLine?: number
): string {
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  return formatFileReference(uri.fsPath, relativePath, isDirectory, startLine, endLine);
}

export interface CoworkChatOptions {
  /**
   * Whether to open a new conversation session before linking the file.
   * Defaults to false (only adds the file to explicit context in the active AI chat).
   */
  newConversation?: boolean;
  /**
   * Optional 1-based start line of selection.
   */
  startLine?: number;
  /**
   * Optional 1-based end line of selection.
   */
  endLine?: number;
}

/**
 * Links the given file or folder to the explicit context in VS Code's AI/Chat window.
 * Only initiates a new conversation session if options.newConversation is true.
 */
export async function openCoworkChatWithFile(
  uri: vscode.Uri,
  options?: CoworkChatOptions
): Promise<void> {
  let isDirectory = false;
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    isDirectory = stat.type === vscode.FileType.Directory;
  } catch {
    // ignore
  }

  const fileReference = formatChatFileReference(
    uri,
    isDirectory,
    options?.startLine,
    options?.endLine
  );
  const availableCommands = new Set(await vscode.commands.getCommands(true));

  // 1. Only start a fresh new chat session if explicitly requested (e.g. from Markdown Editor)
  if (options?.newConversation && availableCommands.has('workbench.action.chat.newChat')) {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.newChat');
      // Short delay to let the new chat session state initialize
      await new Promise((resolve) => setTimeout(resolve, 80));
    } catch (err) {
      console.warn('workbench.action.chat.newChat failed:', err);
    }
  }

  // 2. Try programmatically attaching the file or folder if attach commands exist
  let itemAttached = false;
  if (isDirectory) {
    if (availableCommands.has('workbench.action.chat.attachFolder')) {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.attachFolder', uri);
        itemAttached = true;
      } catch (err) {
        console.warn('workbench.action.chat.attachFolder failed:', err);
      }
    }
    if (!itemAttached && availableCommands.has('github.copilot.chat.attachFolder')) {
      try {
        await vscode.commands.executeCommand('github.copilot.chat.attachFolder', uri);
        itemAttached = true;
      } catch (err) {
        console.warn('github.copilot.chat.attachFolder failed:', err);
      }
    }
  } else {
    if (availableCommands.has('workbench.action.chat.attachFile')) {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);
        itemAttached = true;
      } catch (err) {
        console.warn('workbench.action.chat.attachFile failed:', err);
      }
    }
    if (!itemAttached && availableCommands.has('github.copilot.chat.attachFile')) {
      try {
        await vscode.commands.executeCommand('github.copilot.chat.attachFile', uri);
        itemAttached = true;
      } catch (err) {
        console.warn('github.copilot.chat.attachFile failed:', err);
      }
    }
  }

  // 3. Open the Chat window and add to explicit context attachments
  if (availableCommands.has('workbench.action.chat.open')) {
    try {
      const openOptions: Record<string, unknown> = {
        attachFiles: [uri],
        attachFileUris: [uri],
      };
      const queryText = `${fileReference}\n`;
      if (options?.startLine !== undefined || !itemAttached) {
        openOptions.query = queryText;
        openOptions.isPartialQuery = true;
      }
      await vscode.commands.executeCommand('workbench.action.chat.open', openOptions);
      return;
    } catch (err) {
      console.warn('workbench.action.chat.open with options failed, attempting string query:', err);
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', `${fileReference}\n`);
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
        query: `${fileReference}\n`,
      });
      return;
    } catch (err) {
      console.warn('workbench.action.quickchat.open failed:', err);
    }
  }

  // Fallback 5: Other AI chat view providers (e.g. Gemini, Copilot panel, Cursor)
  const otherChatCommands = [
    ...(options?.newConversation ? ['aichat.newsession'] : []),
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
  const itemName = path.basename(uri.fsPath);
  const lineDetails =
    options?.startLine !== undefined
      ? options.endLine !== undefined && options.endLine > options.startLine
        ? ` (${t('Zeilen')} ${options.startLine}-${options.endLine})`
        : ` (${t('Zeile')} ${options.startLine})`
      : '';
  vscode.window.showInformationMessage(
    isDirectory
      ? t(
          'Ordner "{0}" ist bereit für Cowork. Bitte öffnen Sie das KI-Chatfenster (z. B. GitHub Copilot oder Gemini).',
          itemName
        )
      : t(
          'Datei "{0}" ist bereit für Cowork. Bitte öffnen Sie das KI-Chatfenster (z. B. GitHub Copilot oder Gemini).',
          `${itemName}${lineDetails}`
        )
  );
}

/**
 * High-level handler to start Coworking on a file or folder.
 * Handles dirty buffer saving and active document resolution.
 */
export async function coworkWithFile(
  targetUri?: vscode.Uri,
  options?: CoworkChatOptions
): Promise<void> {
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
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      uri = folders[0].uri;
    }
  }

  if (!uri) {
    vscode.window.showWarningMessage(
      t('Keine Datei und kein Ordner gefunden, um mit dem KI-Agenten zusammenzuarbeiten.')
    );
    return;
  }

  // Save if open document has unsaved modifications
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (doc?.isDirty) {
    await doc.save();
  }

  await openCoworkChatWithFile(uri, options);
}

/**
 * High-level handler to start Coworking on a folder.
 */
export async function coworkWithFolder(
  targetUri?: vscode.Uri,
  options?: CoworkChatOptions
): Promise<void> {
  return coworkWithFile(targetUri, options);
}
