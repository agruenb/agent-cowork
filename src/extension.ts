import * as vscode from 'vscode';
import { WelcomePanel } from './welcomePanel';

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
 * - Ensures the Explorer (directory view) is open and accessible in the sidebar
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

  // Ensure the directory/file explorer view is active and visible
  try {
    await vscode.commands.executeCommand('workbench.view.explorer');
  } catch (err) {
    console.warn('Unable to focus file explorer view:', err);
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

  // Simplify layout (hide activity bar buttons, show file explorer) if enabled
  const simplifyLayout = config.get<boolean>('simplifyLayout', true);
  if (simplifyLayout) {
    await enforceSimpleLayout();
  }

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

  context.subscriptions.push(openWelcomeCmd, helloWorldCmd, applyThemeCmd, simplifyLayoutCmd);

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
