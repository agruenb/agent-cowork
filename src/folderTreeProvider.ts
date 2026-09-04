import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
 * Provides the tree data for the Agent Cowork custom folder view.
 * Shows only the file system tree — no Git drawers, Outline, Timeline, Maven, etc.
 */
export class FolderTreeProvider implements vscode.TreeDataProvider<FolderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FolderItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly extensionUri?: vscode.Uri) {
    // Refresh whenever the workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh());
  }

  private _expandedPaths = new Set<string>();

  /** Trigger a full tree refresh */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Refresh a single tree item */
  refreshItem(element: FolderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  onDidExpandElement(element: FolderItem): void {
    this._expandedPaths.add(element.uri.fsPath);
    element.setExpanded(true);
    this.refreshItem(element);
  }

  onDidCollapseElement(element: FolderItem): void {
    this._expandedPaths.delete(element.uri.fsPath);
    element.setExpanded(false);
    this.refreshItem(element);
  }

  getTreeItem(element: FolderItem): vscode.TreeItem {
    return element;
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
      return folders.map(
        (f) => new FolderItem(f.uri, true, this.extensionUri, this._expandedPaths.has(f.uri.fsPath)),
      );
    }

    // Children of a directory node
    return this._readDirectory(element.uri.fsPath);
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
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        return new FolderItem(
          vscode.Uri.file(fullPath),
          isDir,
          this.extensionUri,
          isDir ? this._expandedPaths.has(fullPath) : false,
        );
      });
    } catch {
      return [];
    }
  }
}
