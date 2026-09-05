import * as vscode from 'vscode';
import * as path from 'path';
import { WelcomePanel } from './welcomePanel';
import { FolderTreeProvider, FolderItem } from './folderTreeProvider';
import { MarkdownEditorProvider } from './markdownEditorProvider';

const THEME_NAME = 'Agent Cowork Light';

/**
 * Enforces the light theme with green accents.
 */
async function enforceTheme(): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const currentTheme = workbenchConfig.get<string>('colorTheme');

  if (currentTheme !== THEME_NAME) {
    await workbenchConfig.update('colorTheme', THEME_NAME, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Disables VS Code's built-in welcome page and closes any existing default welcome/walkthrough tabs.
 */
async function closeDefaultWelcomeTabs(): Promise<void> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      // Check for VS Code built-in welcome walkthrough / getting started tabs
      const isWalkthrough = tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'gettingStarted';
      const isDefaultWelcomeLabel =
        tab.label.toLowerCase() === 'welcome' ||
        tab.label.toLowerCase() === 'get started' ||
        tab.label.toLowerCase() === 'erste schritte' ||
        tab.label.toLowerCase() === 'willkommen';

      if (isWalkthrough || (isDefaultWelcomeLabel && !(tab.input instanceof vscode.TabInputWebview && tab.input.viewType === WelcomePanel.viewType))) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
}

async function suppressDefaultWelcome(context: vscode.ExtensionContext): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const startupEditor = workbenchConfig.get<string>('startupEditor');

  if (startupEditor !== 'none') {
    await workbenchConfig.update('startupEditor', 'none', vscode.ConfigurationTarget.Global);
  }

  // Close immediately
  await closeDefaultWelcomeTabs();

  // Also listen for any tabs opening shortly during startup and close them if they are default welcome
  const tabListener = vscode.window.tabGroups.onDidChangeTabs(async () => {
    await closeDefaultWelcomeTabs();
  });
  context.subscriptions.push(tabListener);

  // Unsubscribe the active tab listener after 3 seconds to avoid unnecessary overhead
  setTimeout(() => {
    tabListener.dispose();
  }, 3000);
}


/**
 * Simplifies the workbench layout for non-technical users:
 * - Hides the left-hand activity bar button strip (Git, Extensions, Run, etc.)
 * - Opens our custom Agent Cowork folder view in the sidebar
 */
async function enforceSimpleLayout(): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');

  // In modern VS Code (>=1.83), 'workbench.activityBar.location' controls whether the activity bar is hidden.
  // We check workbenchConfig.inspect to ensure the setting exists before attempting to write it.
  const locationInspection = workbenchConfig.inspect('activityBar.location');
  if (locationInspection !== undefined) {
    const currentLocation = workbenchConfig.get<string>('activityBar.location');
    if (currentLocation !== 'hidden') {
      try {
        await workbenchConfig.update('activityBar.location', 'hidden', vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.activityBar.location:', err);
      }
    }
  }

  // Hide breadcrumbs bar above documents
  const breadcrumbsConfig = vscode.workspace.getConfiguration('breadcrumbs');
  if (breadcrumbsConfig.get<boolean>('enabled') !== false) {
    try {
      await breadcrumbsConfig.update('enabled', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update breadcrumbs.enabled:', err);
    }
  }

  // Hide the view selector / editor actions toolbar in the editor tab/title bar
  const editorActionInspection = workbenchConfig.inspect('editor.editorActionsLocation');
  if (editorActionInspection !== undefined) {
    const currentActionLocation = workbenchConfig.get<string>('editor.editorActionsLocation');
    if (currentActionLocation !== 'hidden') {
      try {
        await workbenchConfig.update('editor.editorActionsLocation', 'hidden', vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.editor.editorActionsLocation:', err);
      }
    }
  }

  // Enforce comfortable font size and tree spacing for older users / beginners
  await enforceAccessibilitySettings();

  // Focus our custom Agent Cowork folder view
  try {
    await vscode.commands.executeCommand('agentCowork.folderView.focus');
  } catch (err) {
    console.warn('Unable to focus Agent Cowork folder view:', err);
  }
}

/**
 * Sets larger text size, line height, and tree spacing for senior / non-technical users.
 */
async function enforceAccessibilitySettings(): Promise<void> {
  try {
    const windowConfig = vscode.workspace.getConfiguration('window');
    // Zoom level 1 increases UI text size across the entire window (sidebar, menus, trees, dialogs)
    const currentZoom = windowConfig.get<number>('zoomLevel');
    if (currentZoom === undefined || currentZoom < 1) {
      await windowConfig.update('zoomLevel', 1, vscode.ConfigurationTarget.Global);
    }

    // Ensure comfortable tree row indent
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const treeIndent = workbenchConfig.get<number>('tree.indent');
    if (treeIndent === undefined || treeIndent < 16) {
      await workbenchConfig.update('tree.indent', 16, vscode.ConfigurationTarget.Global);
    }

    // Set readable editor font size
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const editorFontSize = editorConfig.get<number>('fontSize');
    if (editorFontSize === undefined || editorFontSize < 16) {
      await editorConfig.update('fontSize', 16, vscode.ConfigurationTarget.Global);
    }
    const editorLineHeight = editorConfig.get<number>('lineHeight');
    if (editorLineHeight === undefined || editorLineHeight < 24) {
      await editorConfig.update('lineHeight', 24, vscode.ConfigurationTarget.Global);
    }
  } catch (err) {
    console.warn('Unable to enforce accessibility settings:', err);
  }
}

/**
 * Prompts the user to select a folder from their local file system
 * and opens it as the active workspace in VS Code.
 */
export async function openWorkspaceFolder(): Promise<void> {
  try {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: vscode.l10n.t('Ordner auswählen'),
      title: vscode.l10n.t('Arbeitsordner auswählen'),
    });

    if (uris && uris.length > 0) {
      await vscode.commands.executeCommand('vscode.openFolder', uris[0]);
    }
  } catch (error) {
    console.warn('showOpenDialog failed, falling back to workbench command:', error);
    try {
      await vscode.commands.executeCommand('workbench.action.files.openFolder');
    } catch {
      await vscode.commands.executeCommand('workbench.action.files.openFileFolder');
    }
  }
}

/**
 * Creates a new file in the specified directory or workspace root and opens it.
 */
export async function createNewFile(targetFolderUri?: vscode.Uri): Promise<void> {
  let targetDir = targetFolderUri?.fsPath;

  if (!targetDir) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Bitte öffnen Sie zuerst einen Ordner, um eine Datei zu erstellen.')
      );
      return;
    }
    targetDir = folders[0].uri.fsPath;
  }

  const fileName = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Dateinamen eingeben (z. B. aufgabe.md)'),
    placeHolder: 'meine-datei.md',
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return vscode.l10n.t('Der Dateiname darf nicht leer sein.');
      }
      if (/[/\\?%*:|"<>]/g.test(trimmed)) {
        return vscode.l10n.t('Der Dateiname enthält ungültige Zeichen.');
      }
      return null;
    },
  });

  if (!fileName || !fileName.trim()) {
    return;
  }

  const filePath = path.join(targetDir, fileName.trim());
  const fileUri = vscode.Uri.file(filePath);

  try {
    // Check if file already exists
    try {
      await vscode.workspace.fs.stat(fileUri);
      vscode.window.showErrorMessage(
        vscode.l10n.t('Eine Datei mit diesem Namen existiert bereits.')
      );
      return;
    } catch {
      // File does not exist, proceed
    }

    // Write empty file
    await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());

    // Open file in editor (opens in custom markdown editor by default if .md)
    await vscode.commands.executeCommand('vscode.open', fileUri);
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Fehler beim Erstellen der Datei: {0}', String(error))
    );
  }
}

/**
 * Called when the extension is activated.
 * The extension is activated the very first time the command is executed or on startup.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Congratulations, your extension "agent-cowork" is now active!');

  const config = vscode.workspace.getConfiguration('agentCowork');

  // Force the light green theme
  await enforceTheme();

  // Suppress VS Code's default welcome page and tabs
  await suppressDefaultWelcome(context);

  // Simplify layout (hide activity bar buttons, open our custom view) if enabled
  const simplifyLayout = config.get<boolean>('simplifyLayout', true);
  if (simplifyLayout) {
    await enforceSimpleLayout();
  }

  // Register and wire up the custom folder tree view
  const folderTreeProvider = new FolderTreeProvider(context.extensionUri);
  const folderTreeView = vscode.window.createTreeView('agentCowork.folderView', {
    treeDataProvider: folderTreeProvider,
    showCollapseAll: true,
  });
  folderTreeView.onDidExpandElement((e) => folderTreeProvider.onDidExpandElement(e.element));
  folderTreeView.onDidCollapseElement((e) => folderTreeProvider.onDidCollapseElement(e.element));
  context.subscriptions.push(folderTreeView);

  // Refresh tree when files change on disk
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
  fileWatcher.onDidCreate(() => folderTreeProvider.refresh());
  fileWatcher.onDidDelete(() => folderTreeProvider.refresh());
  context.subscriptions.push(fileWatcher);

  // Register Welcome panel command
  const openWelcomeCmd = vscode.commands.registerCommand('agent-cowork.openWelcome', () => {
    WelcomePanel.createOrShow(context.extensionUri);
  });

  // Register helloWorld command with localization
  const helloWorldCmd = vscode.commands.registerCommand('agent-cowork.helloWorld', () => {
    vscode.window.showInformationMessage(vscode.l10n.t('Hallo von Agent Cowork!'));
  });

  // Register applyTheme command with localization
  const applyThemeCmd = vscode.commands.registerCommand('agent-cowork.applyTheme', async () => {
    await enforceTheme();
    vscode.window.showInformationMessage(vscode.l10n.t('Agent Cowork Light Theme angewendet!'));
  });

  // Register simplifyLayout command with localization
  const simplifyLayoutCmd = vscode.commands.registerCommand('agent-cowork.simplifyLayout', async () => {
    await enforceSimpleLayout();
    vscode.window.showInformationMessage(
      vscode.l10n.t('Vereinfachte Ansicht aktiviert! Seitenleisten-Buttons wurden ausgeblendet.')
    );
  });

  // Register openWorkspaceFolder command
  const openWorkspaceFolderCmd = vscode.commands.registerCommand('agent-cowork.openWorkspaceFolder', async () => {
    await openWorkspaceFolder();
  });

  // Register refreshFolderView command
  const refreshFolderViewCmd = vscode.commands.registerCommand('agent-cowork.refreshFolderView', () => {
    folderTreeProvider.refresh();
  });

  // Register newFile command (creates at root or prompts)
  const newFileCmd = vscode.commands.registerCommand('agent-cowork.newFile', async () => {
    await createNewFile();
  });

  // Register newFileInFolder command (creates in specific folder item)
  const newFileInFolderCmd = vscode.commands.registerCommand(
    'agent-cowork.newFileInFolder',
    async (item?: FolderItem) => {
      await createNewFile(item?.uri);
    }
  );

  // Register custom formatted Markdown Editor
  const markdownEditorDisposable = MarkdownEditorProvider.register(context);

  context.subscriptions.push(
    openWelcomeCmd,
    helloWorldCmd,
    applyThemeCmd,
    simplifyLayoutCmd,
    openWorkspaceFolderCmd,
    refreshFolderViewCmd,
    newFileCmd,
    newFileInFolderCmd,
    markdownEditorDisposable,
  );

  // Show welcome startup page if enabled
  const showWelcomeOnStartup = config.get<boolean>('showWelcomeOnStartup', true);
  if (showWelcomeOnStartup) {
    WelcomePanel.createOrShow(context.extensionUri);
  }
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  // Clean up resources if necessary
}
