import * as vscode from 'vscode';
import * as path from 'path';
import { WelcomePanel } from './welcomePanel';
import { FolderTreeProvider, FolderItem } from './folderTreeProvider';
import { MarkdownEditorProvider } from './markdownEditorProvider';
import { coworkWithFile } from './coworkChat';

const THEME_NAME = 'Agent Cowork Light';
const ICON_THEME_NAME = 'agent-cowork-icons';

/**
 * Enforces the light theme with green accents and custom file icon theme.
 */
async function enforceTheme(): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const currentTheme = workbenchConfig.get<string>('colorTheme');

  if (currentTheme !== THEME_NAME) {
    await workbenchConfig.update('colorTheme', THEME_NAME, vscode.ConfigurationTarget.Global);
  }

  const currentIconTheme = workbenchConfig.get<string>('iconTheme');
  if (currentIconTheme !== ICON_THEME_NAME) {
    try {
      await workbenchConfig.update('iconTheme', ICON_THEME_NAME, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.iconTheme:', err);
    }
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

  // Hide the search bar (Command Center) in the top title bar
  const windowConfig = vscode.workspace.getConfiguration('window');
  if (windowConfig.get<boolean>('commandCenter') !== false) {
    try {
      await windowConfig.update('commandCenter', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update window.commandCenter:', err);
    }
  }

  // Hide layout controls (customize layout buttons) in the top bar
  const layoutControlInspection = workbenchConfig.inspect('layoutControl.enabled');
  if (layoutControlInspection !== undefined) {
    if (workbenchConfig.get<boolean>('layoutControl.enabled') !== false) {
      try {
        await workbenchConfig.update('layoutControl.enabled', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.layoutControl.enabled:', err);
      }
    }
  }

  // Hide navigation controls (back/forward arrows) in the top title bar if present
  const navigationControlInspection = workbenchConfig.inspect('navigationControl.enabled');
  if (navigationControlInspection !== undefined) {
    if (workbenchConfig.get<boolean>('navigationControl.enabled') !== false) {
      try {
        await workbenchConfig.update('navigationControl.enabled', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.navigationControl.enabled:', err);
      }
    }
  }



  // Enforce browser-like tab bar behavior
  await enforceBrowserTabBar();

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
 * Configures the editor tabs to behave like a modern web browser:
 * - Tabs shrink to fit the window width instead of immediately horizontally scrolling
 * - Only scroll horizontally when tabs reach minimum width
 * - Disables preview mode so clicked files open permanently without replacing the active tab
 * - Keeps tabs on a single clean row (no wrap)
 * - Ensures close button and tab icons are always visible
 * - Highlights modified tabs clearly
 */
async function enforceBrowserTabBar(): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');

  // Ensure tab height density is default (tallest standard tab height)
  const windowConfig = vscode.workspace.getConfiguration('window');
  if (windowConfig.get<string>('density.editorTabHeight') !== 'default') {
    try {
      await windowConfig.update('density.editorTabHeight', 'default', vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update window.density.editorTabHeight:', err);
    }
  }

  // Set tab sizing to 'shrink' so tabs shrink to fit the window width instead of horizontally scrolling
  const tabSizingInspection = workbenchConfig.inspect('editor.tabSizing');
  if (tabSizingInspection !== undefined) {
    if (workbenchConfig.get<string>('editor.tabSizing') !== 'shrink') {
      try {
        await workbenchConfig.update('editor.tabSizing', 'shrink', vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.editor.tabSizing:', err);
      }
    }
  }

  // Ensure tabs stay on a single horizontal row (no multi-line wrapping)
  if (workbenchConfig.get<boolean>('editor.wrapTabs') !== false) {
    try {
      await workbenchConfig.update('editor.wrapTabs', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.wrapTabs:', err);
    }
  }

  // Ensure tabs are shown as multiple tabs
  if (workbenchConfig.get<string>('editor.showTabs') !== 'multiple') {
    try {
      await workbenchConfig.update('editor.showTabs', 'multiple', vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.showTabs:', err);
    }
  }

  // Disable preview mode so clicking files opens permanent tabs like browser tabs
  if (workbenchConfig.get<boolean>('editor.enablePreview') !== false) {
    try {
      await workbenchConfig.update('editor.enablePreview', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.enablePreview:', err);
    }
  }
  if (workbenchConfig.get<boolean>('editor.enablePreviewFromQuickOpen') !== false) {
    try {
      await workbenchConfig.update('editor.enablePreviewFromQuickOpen', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.enablePreviewFromQuickOpen:', err);
    }
  }

  // Ensure tab close button is visible
  const closeVisibilityInspection = workbenchConfig.inspect('editor.tabActionCloseVisibility');
  if (closeVisibilityInspection !== undefined) {
    if (workbenchConfig.get<boolean>('editor.tabActionCloseVisibility') !== true) {
      try {
        await workbenchConfig.update('editor.tabActionCloseVisibility', true, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.editor.tabActionCloseVisibility:', err);
      }
    }
  }

  // Ensure tab icons are enabled
  if (workbenchConfig.get<boolean>('editor.showIcons') !== true) {
    try {
      await workbenchConfig.update('editor.showIcons', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.showIcons:', err);
    }
  }

  // Highlight modified tabs
  if (workbenchConfig.get<boolean>('editor.highlightModifiedTabs') !== true) {
    try {
      await workbenchConfig.update('editor.highlightModifiedTabs', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update workbench.editor.highlightModifiedTabs:', err);
    }
  }

  // Ensure harmonious, clearly visible browser-style tab colors are applied immediately
  try {
    const existingCustomizations = workbenchConfig.get<Record<string, unknown>>('colorCustomizations') || {};
    const themeKey = `[${THEME_NAME}]`;
    const currentThemeCustomizations = (existingCustomizations[themeKey] as Record<string, string>) || {};

    const browserTabColors: Record<string, string> = {
      'editorGroupHeader.tabsBackground': '#e2e8f0',
      'editorGroupHeader.tabsBorder': '#00000000',
      'editorGroupHeader.border': '#00000000',
      'editorGroup.border': '#e2e8f0',
      'tab.activeBackground': '#059669',
      'tab.activeForeground': '#ffffff',
      'tab.activeBorder': '#059669',
      'tab.activeBorderTop': '#00000000',
      'tab.selectedBorderTop': '#00000000',
      'tab.inactiveBackground': '#e2e8f0',
      'tab.inactiveForeground': '#475569',
      'tab.border': '#00000000',
      'tab.hoverBackground': '#059669',
      'tab.hoverForeground': '#ffffff',
      'tab.hoverBorder': '#00000000',
      'tab.unfocusedHoverBackground': '#059669cc',
      'tab.unfocusedHoverForeground': '#ffffff',
      'tab.unfocusedActiveBackground': '#059669cc',
      'tab.unfocusedActiveForeground': '#ffffff',
      'tab.unfocusedActiveBorder': '#059669cc',
      'tab.unfocusedActiveBorderTop': '#00000000',
      'tab.unfocusedInactiveBackground': '#e2e8f0',
      'tab.unfocusedInactiveForeground': '#64748b',
      'tab.lastPinnedBorder': '#00000000',
      'tab.activeModifiedBorder': '#00000000',
      'tab.inactiveModifiedBorder': '#00000000',
      'tab.unfocusedActiveModifiedBorder': '#00000000',
      'tab.unfocusedInactiveModifiedBorder': '#00000000',
      'tab.dragAndDropBorder': '#059669',
      'tab.selectedBackground': '#059669',
      'tab.selectedForeground': '#ffffff',
    };

    let hasChanges = false;
    for (const [key, val] of Object.entries(browserTabColors)) {
      if (currentThemeCustomizations[key] !== val) {
        hasChanges = true;
        break;
      }
    }

    if (hasChanges) {
      const updatedThemeCustomizations = {
        ...currentThemeCustomizations,
        ...browserTabColors,
      };
      const updatedCustomizations = {
        ...existingCustomizations,
        [themeKey]: updatedThemeCustomizations,
      };
      await workbenchConfig.update('colorCustomizations', updatedCustomizations, vscode.ConfigurationTarget.Global);
    }
  } catch (err) {
    console.warn('Unable to update workbench.colorCustomizations for tabs:', err);
  }
}

/**
 * Sets larger text size, line height, and tree spacing for senior / non-technical users.
 */
async function enforceAccessibilitySettings(): Promise<void> {
  try {
    const windowConfig = vscode.workspace.getConfiguration('window');
    // Zoom level 1 increases UI, tab height, and icon size for comfortable viewing (VS Code default is 0)
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
 * Enforces autosaving files by default (files.autoSave: afterDelay, files.autoSaveDelay: 1000).
 */
async function enforceAutoSave(): Promise<void> {
  try {
    const filesConfig = vscode.workspace.getConfiguration('files');
    const currentAutoSave = filesConfig.get<string>('autoSave');
    if (currentAutoSave !== 'afterDelay' && currentAutoSave !== 'onFocusChange' && currentAutoSave !== 'onWindowChange') {
      await filesConfig.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Global);
    }
  } catch (err) {
    console.warn('Unable to enforce files.autoSave:', err);
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

  // Enforce browser-like tab bar if enabled
  const browserTabs = config.get<boolean>('browserTabs', true);
  if (browserTabs) {
    await enforceBrowserTabBar();
  }

  // Enforce autosave by default if enabled
  const autoSave = config.get<boolean>('autoSave', true);
  if (autoSave) {
    await enforceAutoSave();
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
    await enforceBrowserTabBar();
    vscode.window.showInformationMessage(vscode.l10n.t('Agent Cowork Light Theme angewendet!'));
  });

  // Register simplifyLayout command with localization
  const simplifyLayoutCmd = vscode.commands.registerCommand('agent-cowork.simplifyLayout', async () => {
    await enforceSimpleLayout();
    await enforceBrowserTabBar();
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

  // Register coworkWithFile command (links file to new AI conversation)
  const coworkWithFileCmd = vscode.commands.registerCommand(
    'agent-cowork.coworkWithFile',
    async (targetUri?: vscode.Uri) => {
      await coworkWithFile(targetUri);
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
    coworkWithFileCmd,
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
