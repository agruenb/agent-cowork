import * as vscode from 'vscode';
import * as path from 'path';
import { t } from './i18n';

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkdn', '.mdx'];
export const MARKDOWN_PATTERNS = [
  '*.md',
  '*.markdown',
  '*.mdown',
  '*.mkdn',
  '*.mdx',
  '*.{md,markdown,mdown,mkdn,mdx}',
];

/**
 * Checks if a given file path is a Markdown document.
 */
export function isMarkdownPath(filePath: string): boolean {
  if (!filePath) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  return MARKDOWN_EXTENSIONS.includes(ext);
}

export type UriLike = vscode.Uri | { fsPath: string; path?: string };

interface TabInputCandidate {
  uri?: UriLike;
  resource?: UriLike;
  original?: UriLike;
  viewType?: string;
}

/**
 * Extracts a vscode.Uri from a tab if available.
 */
export function extractUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input as TabInputCandidate | undefined;
  if (!input) {
    return undefined;
  }
  const candidate = input.uri || input.resource || input.original;
  if (!candidate) {
    return undefined;
  }
  if (candidate instanceof vscode.Uri) {
    return candidate;
  }
  if ('fsPath' in candidate && typeof candidate.fsPath === 'string') {
    return vscode.Uri.file(candidate.fsPath);
  }
  return undefined;
}

/**
 * Checks if a tab represents a Markdown document.
 */
export function isMarkdownTab(tab: vscode.Tab): boolean {
  const uri = extractUriFromTab(tab);
  if (uri && (isMarkdownPath(uri.fsPath) || isMarkdownPath(uri.path))) {
    return true;
  }
  if (tab.label && isMarkdownPath(tab.label)) {
    return true;
  }
  return false;
}

/**
 * Checks if a tab is currently opened in Agent Cowork's custom markdown editor.
 */
export function isCoworkEditorTab(tab: vscode.Tab): boolean {
  const input = tab.input as TabInputCandidate | undefined;
  if (!input) {
    return false;
  }
  if (input.viewType === 'agentCowork.markdownEditor') {
    return true;
  }
  if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'agentCowork.markdownEditor') {
    return true;
  }
  return false;
}

/**
 * Returns formatted text label for the Cowork status bar button.
 */
export function getCoworkStatusBarText(enabled: boolean): string {
  return enabled ? `$(folder-library) ${t('Cowork: An')}` : `$(folder-library) ${t('Cowork: Aus')}`;
}

/**
 * Returns tooltip description for the Cowork status bar button.
 */
export function getCoworkStatusBarTooltip(enabled: boolean): string {
  return enabled
    ? t('Cowork-Ansicht umschalten (Derzeit: Aktiviert - Klicken zum Deaktivieren)')
    : t('Cowork-Ansicht umschalten (Derzeit: Deaktiviert - Klicken zum Aktivieren)');
}

/**
 * Updates an existing status bar item's text and tooltip based on enabled state.
 */
export function updateCoworkStatusBarItem(statusBarItem: vscode.StatusBarItem, enabled: boolean): void {
  statusBarItem.text = getCoworkStatusBarText(enabled);
  statusBarItem.tooltip = getCoworkStatusBarTooltip(enabled);
}

/**
 * Creates the Cowork toggle button in the bottom status bar.
 */
export function createCoworkStatusBarItem(): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    'agentCowork.toggleCoworkView',
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = t('Agent Cowork Ansicht');
  statusBarItem.command = 'agent-cowork.toggleCoworkView';
  return statusBarItem;
}

/**
 * Reads whether Cowork View is enabled from configuration.
 */
export function isCoworkViewEnabled(): boolean {
  try {
    const config = vscode.workspace.getConfiguration('agentCowork');
    return config.get<boolean>('coworkView', true);
  } catch {
    return true;
  }
}

/**
 * Updates Cowork View enabled setting in global configuration.
 */
export async function setCoworkViewConfig(enabled: boolean): Promise<void> {
  try {
    const config = vscode.workspace.getConfiguration('agentCowork');
    await config.update('coworkView', enabled, vscode.ConfigurationTarget.Global);
  } catch (err) {
    console.warn('Unable to update agentCowork.coworkView:', err);
  }
}

/**
 * Returns updated editorAssociations dictionary for the specified mode.
 */
export function getUpdatedEditorAssociations(
  currentAssociations: Record<string, string>,
  targetMode: 'cowork' | 'default'
): Record<string, string> {
  const updated = { ...currentAssociations };
  const targetView = targetMode === 'cowork' ? 'agentCowork.markdownEditor' : 'default';
  for (const pattern of MARKDOWN_PATTERNS) {
    updated[pattern] = targetView;
  }
  return updated;
}

/**
 * Updates workbench.editorAssociations so markdown files open in the appropriate editor.
 */
export async function applyMarkdownEditorAssociations(enabled: boolean): Promise<void> {
  try {
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const currentAssociations = workbenchConfig.get<Record<string, string>>('editorAssociations') || {};
    const updated = getUpdatedEditorAssociations(currentAssociations, enabled ? 'cowork' : 'default');
    await workbenchConfig.update('editorAssociations', updated, vscode.ConfigurationTarget.Global);
  } catch (err) {
    console.warn('Unable to update workbench.editorAssociations:', err);
  }
}

/**
 * Re-opens any currently open Markdown tabs in the target editor.
 */
export async function switchOpenMarkdownTabs(targetMode: 'cowork' | 'default'): Promise<void> {
  try {
    const targetView = targetMode === 'cowork' ? 'agentCowork.markdownEditor' : 'default';

    // 1. If switching to default and active tab is currently our custom editor, try reopenTextEditor first
    if (targetMode === 'default') {
      const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
      if (activeTab && isCoworkEditorTab(activeTab)) {
        try {
          await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        } catch (err) {
          console.warn('workbench.action.reopenTextEditor failed, falling back to close & reopen:', err);
        }
      }
    }

    // 2. Identify all remaining tabs that need switching
    interface TabToSwitch {
      tab: vscode.Tab;
      uri: vscode.Uri;
      isActive: boolean;
      viewColumn?: vscode.ViewColumn;
    }

    const toSwitch: TabToSwitch[] = [];

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!isMarkdownTab(tab)) {
          continue;
        }
        const uri = extractUriFromTab(tab);
        if (!uri) {
          continue;
        }

        const isCowork = isCoworkEditorTab(tab);
        if (targetMode === 'default' && isCowork) {
          toSwitch.push({
            tab,
            uri,
            isActive: tab.isActive,
            viewColumn: group.viewColumn,
          });
        } else if (targetMode === 'cowork' && !isCowork) {
          toSwitch.push({
            tab,
            uri,
            isActive: tab.isActive,
            viewColumn: group.viewColumn,
          });
        }
      }
    }

    if (toSwitch.length === 0) {
      return;
    }

    // Sort so inactive tabs are processed first, and the active tab is processed last to retain focus
    toSwitch.sort((a, b) => (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0));

    for (const item of toSwitch) {
      try {
        await vscode.window.tabGroups.close(item.tab);
      } catch (err) {
        console.warn('Unable to close tab before reopening:', err);
      }

      try {
        await vscode.commands.executeCommand('vscode.openWith', item.uri, targetView, {
          viewColumn: item.viewColumn,
          preserveFocus: !item.isActive,
          preview: false,
        });
      } catch (err) {
        console.warn(`Unable to reopen ${item.uri.fsPath} with ${targetView}:`, err);
      }
    }
  } catch (err) {
    console.warn('Unable to switch open markdown tabs:', err);
  }
}

export const THEME_NAME = 'Agent Cowork Light';
export const ICON_THEME_NAME = 'agent-cowork-icons';
export const DEFAULT_FALLBACK_THEME = 'Default Light Modern';
export const DEFAULT_FALLBACK_ICON_THEME = 'vs-seti';

let extensionContext: vscode.ExtensionContext | undefined;

export function setCoworkManagerContext(ctx: vscode.ExtensionContext): void {
  extensionContext = ctx;
}

/**
 * Applies or reverts the Cowork color theme and file icon theme.
 */
export async function applyCoworkTheme(enabled: boolean): Promise<void> {
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const currentColorTheme = workbenchConfig.get<string>('colorTheme');
  const currentIconTheme = workbenchConfig.get<string>('iconTheme');

  if (enabled) {
    // Save current theme if it is not already our theme
    if (currentColorTheme && currentColorTheme !== THEME_NAME) {
      if (extensionContext) {
        await extensionContext.globalState.update('previousColorTheme', currentColorTheme);
      }
    }
    if (currentIconTheme && currentIconTheme !== ICON_THEME_NAME) {
      if (extensionContext) {
        await extensionContext.globalState.update('previousIconTheme', currentIconTheme);
      }
    }

    if (currentColorTheme !== THEME_NAME) {
      try {
        await workbenchConfig.update('colorTheme', THEME_NAME, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.colorTheme:', err);
      }
    }

    if (currentIconTheme !== ICON_THEME_NAME) {
      try {
        await workbenchConfig.update('iconTheme', ICON_THEME_NAME, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update workbench.iconTheme:', err);
      }
    }
  } else {
    // Revert to saved or standard default theme
    const previousTheme =
      extensionContext?.globalState.get<string>('previousColorTheme') || DEFAULT_FALLBACK_THEME;
    const previousIconTheme =
      extensionContext?.globalState.get<string>('previousIconTheme') || DEFAULT_FALLBACK_ICON_THEME;

    if (currentColorTheme === THEME_NAME) {
      try {
        await workbenchConfig.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to revert workbench.colorTheme:', err);
      }
    }

    if (currentIconTheme === ICON_THEME_NAME) {
      try {
        await workbenchConfig.update('iconTheme', previousIconTheme, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to revert workbench.iconTheme:', err);
      }
    }
  }
}

/**
 * Applies the complete Cowork View state:
 * - Context key `agentCowork.coworkView`
 * - Markdown editor associations
 * - Active tab migration
 * - Color theme & icon theme
 * - Sidebar view (custom folder tree vs standard Explorer)
 * - Layout chrome (activity bar, breadcrumbs, command center, layout/navigation controls)
 */
export async function applyCoworkView(enabled: boolean): Promise<void> {
  // 1. Set context key for when-clauses (e.g. view visibility in package.json)
  try {
    await vscode.commands.executeCommand('setContext', 'agentCowork.coworkView', enabled);
  } catch (err) {
    console.warn('Unable to set context agentCowork.coworkView:', err);
  }

  // 2. Update markdown editor associations
  await applyMarkdownEditorAssociations(enabled);

  // 3. Switch open tabs to target editor
  await switchOpenMarkdownTabs(enabled ? 'cowork' : 'default');

  // 4. Apply or revert color and icon themes
  await applyCoworkTheme(enabled);

  // 5. Update workbench UI layout and sidebar focus
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const breadcrumbsConfig = vscode.workspace.getConfiguration('breadcrumbs');
  const windowConfig = vscode.workspace.getConfiguration('window');
  const config = vscode.workspace.getConfiguration('agentCowork');

  if (enabled) {
    const simplifyLayout = config.get<boolean>('simplifyLayout', true);
    if (simplifyLayout) {
      try {
        await workbenchConfig.update('activityBar.location', 'hidden', vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update activityBar.location:', err);
      }
      try {
        await breadcrumbsConfig.update('enabled', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update breadcrumbs.enabled:', err);
      }
      try {
        await workbenchConfig.update('editor.editorActionsLocation', 'hidden', vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update editorActionsLocation:', err);
      }
      try {
        await windowConfig.update('commandCenter', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update window.commandCenter:', err);
      }
      try {
        await workbenchConfig.update('layoutControl.enabled', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update layoutControl.enabled:', err);
      }
      try {
        await workbenchConfig.update('navigationControl.enabled', false, vscode.ConfigurationTarget.Global);
      } catch (err) {
        console.warn('Unable to update navigationControl.enabled:', err);
      }
    }

    // Focus Agent Cowork custom folder view
    try {
      await vscode.commands.executeCommand('agentCowork.folderView.focus');
    } catch (err) {
      console.warn('Unable to focus Agent Cowork folder view:', err);
    }
  } else {
    // Restore standard VS Code layout
    try {
      await workbenchConfig.update('activityBar.location', 'default', vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update activityBar.location:', err);
    }
    try {
      await breadcrumbsConfig.update('enabled', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update breadcrumbs.enabled:', err);
    }
    try {
      await workbenchConfig.update('editor.editorActionsLocation', 'default', vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update editorActionsLocation:', err);
    }
    try {
      await windowConfig.update('commandCenter', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update window.commandCenter:', err);
    }
    try {
      await workbenchConfig.update('layoutControl.enabled', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update layoutControl.enabled:', err);
    }
    try {
      await workbenchConfig.update('navigationControl.enabled', true, vscode.ConfigurationTarget.Global);
    } catch (err) {
      console.warn('Unable to update navigationControl.enabled:', err);
    }

    // Reveal and focus standard VS Code Explorer file tree view
    try {
      await vscode.commands.executeCommand('workbench.view.explorer');
    } catch (err) {
      console.warn('Unable to open Explorer viewlet:', err);
    }
    try {
      await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
    } catch (err) {
      console.warn('Unable to focus files explorer:', err);
    }
    try {
      await vscode.commands.executeCommand('workbench.explorer.fileView.focus');
    } catch (err) {
      console.warn('Unable to focus fileView:', err);
    }
  }
}

/**
 * Toggles the Cowork View on or off.
 */
export async function toggleCoworkView(statusBarItem?: vscode.StatusBarItem): Promise<boolean> {
  const currentState = isCoworkViewEnabled();
  const newState = !currentState;

  await setCoworkViewConfig(newState);
  await applyCoworkView(newState);

  if (statusBarItem) {
    updateCoworkStatusBarItem(statusBarItem, newState);
  }

  if (newState) {
    vscode.window.showInformationMessage(
      t('Cowork-Ansicht aktiviert! Individuelle Ordner- und Dokumentenansicht aktiv.')
    );
  } else {
    vscode.window.showInformationMessage(
      t('Cowork-Ansicht deaktiviert. Standard-Ansicht wiederhergestellt.')
    );
  }

  return newState;
}
