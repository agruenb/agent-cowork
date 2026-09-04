import * as vscode from 'vscode';
import { WelcomePanel } from './welcomePanel';
import { FolderTreeProvider } from './folderTreeProvider';

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

  // Focus our custom Agent Cowork folder view
  try {
    await vscode.commands.executeCommand('agentCowork.folderView.focus');
  } catch (err) {
    console.warn('Unable to focus Agent Cowork folder view:', err);
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
  const folderTreeProvider = new FolderTreeProvider();
  const folderTreeView = vscode.window.createTreeView('agentCowork.folderView', {
    treeDataProvider: folderTreeProvider,
    showCollapseAll: true,
  });
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

  context.subscriptions.push(
    openWelcomeCmd,
    helloWorldCmd,
    applyThemeCmd,
    simplifyLayoutCmd,
    openWorkspaceFolderCmd,
    refreshFolderViewCmd,
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
