import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a single node (file or folder) in the custom folder tree.
 */
export class FolderItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly isDirectory: boolean,
  ) {
    super(
      resourceUri,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.tooltip = resourceUri.fsPath;

    if (!isDirectory) {
      // Clicking a file opens it in the editor
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [resourceUri],
      };
    }

    // Let VS Code assign the icon and label automatically from the file URI
    this.resourceUri = resourceUri;
  }
}

/**
 * Provides the tree data for the Agent Cowork custom folder view.
 * Shows only the file system tree — no Git drawers, Outline, Timeline, Maven, etc.
 */
export class FolderTreeProvider implements vscode.TreeDataProvider<FolderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FolderItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    // Refresh whenever the workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh());
  }

  /** Trigger a full tree refresh */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
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
        (f) => new FolderItem(f.uri, true),
      );
    }

    // Children of a directory node
    return this._readDirectory(element.resourceUri.fsPath);
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
        return new FolderItem(
          vscode.Uri.file(fullPath),
          entry.isDirectory(),
        );
      });
    } catch {
      return [];
    }
  }
}
