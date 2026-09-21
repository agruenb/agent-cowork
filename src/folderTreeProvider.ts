import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  isSameOrDescendant,
  resolveDropTargetDirectory,
  formatUriList,
  parseUriList,
  FOLDER_TREE_DRAG_MIME_TYPES,
  FOLDER_TREE_DROP_MIME_TYPES,
  TREE_VIEW_MIME_TYPE,
  URI_LIST_MIME_TYPE,
} from './utils/dragAndDrop';
import { t } from './i18n';

export { isSameOrDescendant };

/**
 * Represents a single node (file or folder) in the custom folder tree.
 */
export class FolderItem extends vscode.TreeItem {
  private _isExpanded: boolean = false;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly isDirectory: boolean,
    private readonly extensionUri?: vscode.Uri,
    initiallyExpanded: boolean = false,
  ) {
    const fileName = path.basename(uri.fsPath);
    super(
      fileName,
      isDirectory
        ? (initiallyExpanded
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed)
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = uri.fsPath;
    this.resourceUri = uri;
    this.tooltip = uri.fsPath;
    this._isExpanded = initiallyExpanded;
    this._updateIcon();

    if (!isDirectory) {
      this.contextValue = 'file';
      // Clicking a file opens it in the editor
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [uri],
      };
    } else {
      this.contextValue = 'folder';
    }
  }

  public setExpanded(expanded: boolean): void {
    this._isExpanded = expanded;
    if (this.isDirectory) {
      this.collapsibleState = expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    }
    this._updateIcon();
  }

  private _updateIcon(): void {
    if (this.isDirectory) {
      if (this.extensionUri) {
        const iconName = this._isExpanded ? 'folder-open' : 'folder';
        const darkIconName = this._isExpanded ? 'folder-open-dark' : 'folder-dark';
        this.iconPath = {
          light: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', `${iconName}.svg`),
          dark: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', `${darkIconName}.svg`),
        };
      } else {
        const iconId = this._isExpanded ? 'folder-opened' : 'folder';
        this.iconPath = new vscode.ThemeIcon(iconId, new vscode.ThemeColor('charts.yellow'));
      }
    } else {
      const ext = path.extname(this.uri.fsPath).toLowerCase();
      const isMarkdown = ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkdn';

      if (this.extensionUri) {
        const iconFile = isMarkdown ? 'markdown.svg' : 'file.svg';
        this.iconPath = {
          light: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', iconFile),
          dark: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', iconFile),
        };
      } else {
        this.iconPath = isMarkdown ? new vscode.ThemeIcon('robot') : vscode.ThemeIcon.File;
      }
    }
  }
}

/**
 * Resolves the drop target directory URI based on the target item.
 */
export function resolveDropTargetUri(
  target: { uri: vscode.Uri; isDirectory: boolean } | undefined,
  defaultWorkspaceFolderUri: vscode.Uri
): vscode.Uri {
  const targetPath = resolveDropTargetDirectory(
    target ? { fsPath: target.uri.fsPath, isDirectory: target.isDirectory } : undefined,
    defaultWorkspaceFolderUri.fsPath
  );
  return vscode.Uri.file(targetPath);
}

/**
 * Provides the tree data and drag-and-drop controller for the Agent Cowork custom folder view.
 * Shows only the file system tree — no Git drawers, Outline, Timeline, Maven, etc.
 */
export class FolderTreeProvider
  implements vscode.TreeDataProvider<FolderItem>, vscode.TreeDragAndDropController<FolderItem>
{
  readonly dropMimeTypes: readonly string[] = [...FOLDER_TREE_DROP_MIME_TYPES];
  readonly dragMimeTypes: readonly string[] = [...FOLDER_TREE_DRAG_MIME_TYPES];

  private _onDidChangeTreeData = new vscode.EventEmitter<FolderItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly extensionUri?: vscode.Uri) {
    // Refresh whenever the workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh());
  }

  private _expandedPaths = new Set<string>();
  private _itemMap = new Map<string, FolderItem>();

  /** Trigger a full tree refresh */
  refresh(): void {
    this._itemMap.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Refresh a single tree item */
  refreshItem(element: FolderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  onDidExpandElement(element: FolderItem): void {
    const normPath = path.normalize(element.uri.fsPath);
    this._expandedPaths.add(normPath);
    element.setExpanded(true);
    this.refreshItem(element);
  }

  onDidCollapseElement(element: FolderItem): void {
    const normPath = path.normalize(element.uri.fsPath);
    this._expandedPaths.delete(normPath);
    element.setExpanded(false);
    this.refreshItem(element);
  }

  getTreeItem(element: FolderItem): vscode.TreeItem {
    return element;
  }

  getParent(element: FolderItem): vscode.ProviderResult<FolderItem> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }

    const itemPath = path.normalize(element.uri.fsPath);

    // Single-root workspace: Root folder itself is not in the tree; its children are root elements.
    if (folders.length === 1) {
      const rootPath = path.normalize(folders[0].uri.fsPath);
      const parentDir = path.dirname(itemPath);

      if (itemPath === rootPath || !isSameOrDescendant(rootPath, itemPath)) {
        return undefined;
      }

      if (parentDir === rootPath) {
        return undefined;
      }

      return this.getFolderItem(vscode.Uri.file(parentDir), true);
    }

    // Multi-root workspace: Root folders themselves are top-level tree items.
    for (const folder of folders) {
      const rootPath = path.normalize(folder.uri.fsPath);
      if (itemPath === rootPath) {
        return undefined;
      }
      if (isSameOrDescendant(rootPath, itemPath)) {
        const parentDir = path.dirname(itemPath);
        if (parentDir === rootPath) {
          return this.getFolderItem(folder.uri, true);
        }
        return this.getFolderItem(vscode.Uri.file(parentDir), true);
      }
    }

    return undefined;
  }

  getFolderItem(uri: vscode.Uri, isDirectory?: boolean): FolderItem {
    const fsPath = path.normalize(uri.fsPath);
    let item = this._itemMap.get(fsPath);
    if (item) {
      return item;
    }

    let isDir = isDirectory;
    if (isDir === undefined) {
      try {
        const stat = fs.statSync(fsPath);
        isDir = stat.isDirectory();
      } catch {
        isDir = false;
      }
    }

    item = new FolderItem(
      uri,
      isDir,
      this.extensionUri,
      isDir ? this._expandedPaths.has(fsPath) : false
    );
    this._itemMap.set(fsPath, item);
    return item;
  }

  expandAncestors(uri: vscode.Uri): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return;
    }
    const itemPath = path.normalize(uri.fsPath);
    let current = path.dirname(itemPath);

    while (current && current !== path.dirname(current)) {
      let isInside = false;
      for (const folder of folders) {
        const rootPath = path.normalize(folder.uri.fsPath);
        if (folders.length === 1) {
          if (current !== rootPath && isSameOrDescendant(rootPath, current)) {
            isInside = true;
            break;
          }
        } else {
          if (isSameOrDescendant(rootPath, current)) {
            isInside = true;
            break;
          }
        }
      }

      if (!isInside) {
        break;
      }

      this._expandedPaths.add(current);
      const item = this._itemMap.get(current);
      if (item) {
        item.setExpanded(true);
      }
      current = path.dirname(current);
    }
  }

  isPathExpanded(fsPath: string): boolean {
    return this._expandedPaths.has(path.normalize(fsPath));
  }

  getChildren(element?: FolderItem): vscode.ProviderResult<FolderItem[]> {
    if (!element) {
      // Root level — return workspace root folders
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        return [];
      }

      // If there is exactly one root folder, show its contents directly
      if (folders.length === 1) {
        return this._readDirectory(folders[0].uri.fsPath);
      }

      // Multiple root folders — show each as a top-level node
      return folders.map((f) => {
        const fullPath = path.normalize(f.uri.fsPath);
        const item = new FolderItem(
          f.uri,
          true,
          this.extensionUri,
          this._expandedPaths.has(fullPath)
        );
        this._itemMap.set(fullPath, item);
        return item;
      });
    }

    // Children of a directory node
    return this._readDirectory(element.uri.fsPath);
  }

  /**
   * Handle dragging items from the folder tree view.
   */
  handleDrag(
    source: readonly FolderItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): void {
    if (token.isCancellationRequested) {
      return;
    }

    dataTransfer.set(
      TREE_VIEW_MIME_TYPE,
      new vscode.DataTransferItem(source)
    );

    const uriList = formatUriList(source.map((item) => item.uri.toString()));
    dataTransfer.set(URI_LIST_MIME_TYPE, new vscode.DataTransferItem(uriList));
  }

  /**
   * Handle dropping files/folders onto the folder tree view.
   */
  async handleDrop(
    target: FolderItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return;
    }

    const targetDirUri = resolveDropTargetUri(target, folders[0].uri);

    try {
      const internalItem = dataTransfer.get(TREE_VIEW_MIME_TYPE);
      if (internalItem && Array.isArray(internalItem.value)) {
        await this._handleInternalDrop(internalItem.value as FolderItem[], targetDirUri, token);
      } else {
        await this._handleExternalDrop(dataTransfer, targetDirUri, token);
      }

      this._expandedPaths.add(targetDirUri.fsPath);
      this.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(
        t('Fehler beim Verschieben/Kopieren: {0}', message)
      );
    }
  }

  private async _handleInternalDrop(
    sources: FolderItem[],
    targetDirUri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<void> {
    for (const source of sources) {
      if (token.isCancellationRequested) {
        return;
      }

      const sourcePath = source.uri.fsPath;
      const targetDirPath = targetDirUri.fsPath;

      // Cannot move into the exact same parent directory
      if (path.dirname(sourcePath) === targetDirPath) {
        continue;
      }

      // Cannot move a folder into itself or one of its descendants
      if (source.isDirectory && isSameOrDescendant(sourcePath, targetDirPath)) {
        vscode.window.showWarningMessage(
          t(
            'Der Ordner "{0}" kann nicht in sich selbst oder einen Unterordner verschoben werden.',
            path.basename(sourcePath)
          )
        );
        continue;
      }

      const destUri = vscode.Uri.joinPath(targetDirUri, path.basename(sourcePath));

      if (await this._pathExists(destUri)) {
        const replaceChoice = await vscode.window.showWarningMessage(
          t(
            '"{0}" existiert am Zielort bereits. Möchten Sie es ersetzen?',
            path.basename(destUri.fsPath)
          ),
          { modal: true },
          t('Ersetzen'),
          t('Überspringen')
        );
        if (replaceChoice !== t('Ersetzen')) {
          continue;
        }
      }

      await vscode.workspace.fs.rename(source.uri, destUri, { overwrite: true });
    }
  }

  private async _handleExternalDrop(
    dataTransfer: vscode.DataTransfer,
    targetDirUri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<void> {
    const handledPaths = new Set<string>();

    // 1. Process text/uri-list
    const uriListItem = dataTransfer.get(URI_LIST_MIME_TYPE);
    if (uriListItem) {
      const uriListStr = await uriListItem.asString();
      const lines = parseUriList(uriListStr);

      for (const line of lines) {
        if (token.isCancellationRequested) {
          return;
        }
        try {
          const sourceUri = vscode.Uri.parse(line);
          if (sourceUri.scheme === 'file') {
            handledPaths.add(sourceUri.fsPath);
            await this._transferFileOrDirectory(sourceUri, targetDirUri, token);
          }
        } catch (err) {
          console.warn('Failed to parse dropped URI line:', line, err);
        }
      }
    }

    // 2. Process DataTransferFile items
    const fileItems: vscode.DataTransferFile[] = [];
    dataTransfer.forEach((item) => {
      const file = item.asFile();
      if (file) {
        fileItems.push(file);
      }
    });

    for (const file of fileItems) {
      if (token.isCancellationRequested) {
        return;
      }
      if (file.uri) {
        if (handledPaths.has(file.uri.fsPath)) {
          continue;
        }
        handledPaths.add(file.uri.fsPath);
        await this._transferFileOrDirectory(file.uri, targetDirUri, token);
      } else {
        const destUri = vscode.Uri.joinPath(targetDirUri, file.name);
        if (await this._pathExists(destUri)) {
          const replaceChoice = await vscode.window.showWarningMessage(
            t(
              '"{0}" existiert am Zielort bereits. Möchten Sie die Datei ersetzen?',
              file.name
            ),
            { modal: true },
            t('Ersetzen'),
            t('Überspringen')
          );
          if (replaceChoice !== t('Ersetzen')) {
            continue;
          }
        }
        const data = await file.data();
        await vscode.workspace.fs.writeFile(destUri, data);
      }
    }
  }

  private async _transferFileOrDirectory(
    sourceUri: vscode.Uri,
    targetDirUri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }

    const sourcePath = sourceUri.fsPath;
    const targetDirPath = targetDirUri.fsPath;

    if (path.dirname(sourcePath) === targetDirPath) {
      return;
    }

    let isDir = false;
    try {
      const stat = await vscode.workspace.fs.stat(sourceUri);
      isDir = stat.type === vscode.FileType.Directory;
    } catch {
      // ignore
    }

    if (isDir && isSameOrDescendant(sourcePath, targetDirPath)) {
      vscode.window.showWarningMessage(
        t(
          'Der Ordner "{0}" kann nicht in sich selbst oder einen Unterordner verschoben werden.',
          path.basename(sourcePath)
        )
      );
      return;
    }

    const destUri = vscode.Uri.joinPath(targetDirUri, path.basename(sourcePath));

    if (await this._pathExists(destUri)) {
      const replaceChoice = await vscode.window.showWarningMessage(
        t(
          '"{0}" existiert am Zielort bereits. Möchten Sie es ersetzen?',
          path.basename(destUri.fsPath)
        ),
        { modal: true },
        t('Ersetzen'),
        t('Überspringen')
      );
      if (replaceChoice !== t('Ersetzen')) {
        return;
      }
    }

    const isInsideWorkspace = vscode.workspace.getWorkspaceFolder(sourceUri) !== undefined;
    if (isInsideWorkspace) {
      await vscode.workspace.fs.rename(sourceUri, destUri, { overwrite: true });
    } else {
      await vscode.workspace.fs.copy(sourceUri, destUri, { overwrite: true });
    }
  }

  private async _pathExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private _readDirectory(dirPath: string): FolderItem[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      // Sort: folders first, then files (alphabetically within each group)
      const dirs: fs.Dirent[] = [];
      const files: fs.Dirent[] = [];

      for (const entry of entries) {
        // Skip hidden files/folders (dot-prefixed)
        if (entry.name.startsWith('.')) {
          continue;
        }
        if (entry.isDirectory()) {
          dirs.push(entry);
        } else {
          files.push(entry);
        }
      }

      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      return [...dirs, ...files].map((entry) => {
        const fullPath = path.normalize(path.join(dirPath, entry.name));
        const isDir = entry.isDirectory();
        const item = new FolderItem(
          vscode.Uri.file(fullPath),
          isDir,
          this.extensionUri,
          isDir ? this._expandedPaths.has(fullPath) : false,
        );
        this._itemMap.set(fullPath, item);
        return item;
      });
    } catch {
      return [];
    }
  }
}
