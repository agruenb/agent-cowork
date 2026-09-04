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
 * Called when the extension is activated.
 * The extension is activated the very first time the command is executed or on startup.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Congratulations, your extension "agent-cowork" is now active!');

  // Force the light green theme
  await enforceTheme();

  // Suppress VS Code's default welcome page and tabs
  await suppressDefaultWelcome(context);

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

  context.subscriptions.push(openWelcomeCmd, helloWorldCmd, applyThemeCmd);

  // Show welcome startup page if enabled
  const config = vscode.workspace.getConfiguration('agentCowork');
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
