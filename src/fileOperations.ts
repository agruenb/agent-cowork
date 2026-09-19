import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FolderItem } from './folderTreeProvider';
import { getDuplicateName, getRenameSelectionRange } from './utils/fileOperations';
import { isSameOrDescendant } from './utils/dragAndDrop';

interface ClipboardState {
  uri: vscode.Uri;
  isCut: boolean;
}

let clipboardState: ClipboardState | undefined;

export function getFileClipboard(): ClipboardState | undefined {
  return clipboardState;
}

export function setFileClipboard(state: ClipboardState | undefined): void {
  clipboardState = state;
}

function resolveItemUri(target?: vscode.Uri | FolderItem): vscode.Uri | undefined {
  if (target instanceof vscode.Uri) {
    return target;
  }
  if (target && 'uri' in target && target.uri instanceof vscode.Uri) {
    return target.uri;
  }
  if (vscode.window.activeTextEditor) {
    return vscode.window.activeTextEditor.document.uri;
  }
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (activeTab?.input instanceof vscode.TabInputCustom) {
    return activeTab.input.uri;
  }
  if (activeTab?.input instanceof vscode.TabInputText) {
    return activeTab.input.uri;
  }
  return undefined;
}

/**
 * Prompts user to rename a file or folder.
 */
export async function renameItem(
  target?: vscode.Uri | FolderItem,
  onRefresh?: () => void
): Promise<void> {
  const uri = resolveItemUri(target);
  if (!uri) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Keine Datei oder Ordner zum Umbenennen ausgewählt.')
    );
    return;
  }

  const currentName = path.basename(uri.fsPath);
  const selection = getRenameSelectionRange(currentName);

  const newName = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Neuen Namen eingeben'),
    value: currentName,
    valueSelection: selection,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return vscode.l10n.t('Der Name darf nicht leer sein.');
      }
      if (trimmed === currentName) {
        return null;
      }
      if (/[/\\?%*:|"<>]/g.test(trimmed)) {
        return vscode.l10n.t('Der Name enthält ungültige Zeichen.');
      }
      return null;
    },
  });

  if (!newName || !newName.trim() || newName.trim() === currentName) {
    return;
  }

  const newPath = path.join(path.dirname(uri.fsPath), newName.trim());
  const newUri = vscode.Uri.file(newPath);

  try {
    try {
      await vscode.workspace.fs.stat(newUri);
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('"{0}" existiert bereits. Möchten Sie es ersetzen?', newName.trim()),
        { modal: true },
        vscode.l10n.t('Ersetzen'),
        vscode.l10n.t('Abbrechen')
      );
      if (choice !== vscode.l10n.t('Ersetzen')) {
        return;
      }
    } catch {
      // destination does not exist, proceed
    }

    await vscode.workspace.fs.rename(uri, newUri, { overwrite: true });
    onRefresh?.();
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Fehler beim Umbenennen: {0}', String(error))
    );
  }
}

/**
 * Creates a duplicate of the selected file or folder in the same directory.
 */
export async function duplicateItem(
  target?: vscode.Uri | FolderItem,
  onRefresh?: () => void
): Promise<void> {
  const uri = resolveItemUri(target);
  if (!uri) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Keine Datei oder Ordner zum Duplizieren ausgewählt.')
    );
    return;
  }

  const dirPath = path.dirname(uri.fsPath);
  const originalName = path.basename(uri.fsPath);

  let existingNames: string[] = [];
  try {
    existingNames = fs.readdirSync(dirPath);
  } catch {
    existingNames = [];
  }

  const duplicateName = getDuplicateName(existingNames, originalName);
  const destUri = vscode.Uri.file(path.join(dirPath, duplicateName));

  try {
    let isDir = false;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      isDir = stat.type === vscode.FileType.Directory;
    } catch {
      // ignore
    }

    await vscode.workspace.fs.copy(uri, destUri, { overwrite: false });
    onRefresh?.();

    if (!isDir) {
      await vscode.commands.executeCommand('vscode.open', destUri);
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Fehler beim Duplizieren: {0}', String(error))
    );
  }
}

/**
 * Copies the item to the Agent Cowork clipboard and the system clipboard.
 */
export async function copyItem(target?: vscode.Uri | FolderItem): Promise<void> {
  const uri = resolveItemUri(target);
  if (!uri) {
    return;
  }
  setFileClipboard({ uri, isCut: false });
  await vscode.env.clipboard.writeText(uri.fsPath);
  vscode.window.setStatusBarMessage(
    vscode.l10n.t('"{0}" kopiert', path.basename(uri.fsPath)),
    3000
  );
}

/**
 * Cuts the item (marked for moving) to the Agent Cowork clipboard.
 */
export async function cutItem(target?: vscode.Uri | FolderItem): Promise<void> {
  const uri = resolveItemUri(target);
  if (!uri) {
    return;
  }
  setFileClipboard({ uri, isCut: true });
  await vscode.env.clipboard.writeText(uri.fsPath);
  vscode.window.setStatusBarMessage(
    vscode.l10n.t('"{0}" ausgeschnitten', path.basename(uri.fsPath)),
    3000
  );
}

/**
 * Pastes the item from the Agent Cowork clipboard into the target folder.
 */
export async function pasteItem(
  target?: vscode.Uri | FolderItem,
  onRefresh?: () => void
): Promise<void> {
  if (!clipboardState) {
    vscode.window.showInformationMessage(
      vscode.l10n.t('Die Zwischenablage enthält keine Datei oder Ordner.')
    );
    return;
  }

  const sourceUri = clipboardState.uri;
  const isCut = clipboardState.isCut;

  let targetDirUri: vscode.Uri | undefined;
  if (target) {
    const targetUri = target instanceof vscode.Uri ? target : target.uri;
    let isDir = false;
    if (target instanceof FolderItem) {
      isDir = target.isDirectory;
    } else {
      try {
        const stat = await vscode.workspace.fs.stat(targetUri);
        isDir = stat.type === vscode.FileType.Directory;
      } catch {
        // assume file
      }
    }
    targetDirUri = isDir ? targetUri : vscode.Uri.file(path.dirname(targetUri.fsPath));
  } else {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      targetDirUri = folders[0].uri;
    }
  }

  if (!targetDirUri) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Kein Zielordner zum Einfügen gefunden.')
    );
    return;
  }

  const targetDirPath = targetDirUri.fsPath;
  const sourcePath = sourceUri.fsPath;
  const originalName = path.basename(sourcePath);

  if (isSameOrDescendant(sourcePath, targetDirPath)) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Der Ordner kann nicht in sich selbst oder einen Unterordner eingefügt werden.')
    );
    return;
  }

  let destName = originalName;
  const isSameDirectory = path.dirname(sourcePath) === targetDirPath;

  if (isSameDirectory && !isCut) {
    let existingNames: string[] = [];
    try {
      existingNames = fs.readdirSync(targetDirPath);
    } catch {
      existingNames = [];
    }
    destName = getDuplicateName(existingNames, originalName);
  }

  const destUri = vscode.Uri.joinPath(targetDirUri, destName);

  try {
    if (destName === originalName) {
      try {
        await vscode.workspace.fs.stat(destUri);
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t('"{0}" existiert am Zielort bereits. Möchten Sie es ersetzen?', destName),
          { modal: true },
          vscode.l10n.t('Ersetzen'),
          vscode.l10n.t('Abbrechen')
        );
        if (choice !== vscode.l10n.t('Ersetzen')) {
          return;
        }
      } catch {
        // does not exist, proceed
      }
    }

    if (isCut) {
      await vscode.workspace.fs.rename(sourceUri, destUri, { overwrite: true });
      clipboardState = undefined;
    } else {
      await vscode.workspace.fs.copy(sourceUri, destUri, { overwrite: true });
    }

    onRefresh?.();
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Fehler beim Einfügen: {0}', String(error))
    );
  }
}

/**
 * Deletes the selected file or folder to the trash.
 */
export async function deleteItem(
  target?: vscode.Uri | FolderItem,
  onRefresh?: () => void
): Promise<void> {
  const uri = resolveItemUri(target);
  if (!uri) {
    return;
  }

  const itemName = path.basename(uri.fsPath);
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t('Möchten Sie "{0}" wirklich löschen?', itemName),
    { modal: true },
    vscode.l10n.t('Löschen'),
    vscode.l10n.t('Abbrechen')
  );

  if (choice !== vscode.l10n.t('Löschen')) {
    return;
  }

  try {
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
    onRefresh?.();
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Fehler beim Löschen: {0}', String(error))
    );
  }
}
