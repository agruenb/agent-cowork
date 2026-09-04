import * as vscode from 'vscode';

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
 * Called when the extension is activated.
 * The extension is activated the very first time the command is executed or on startup.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Congratulations, your extension "agent-cowork" is now active!');

  // Force the light green theme
  await enforceTheme();

  // Register command defined in package.json
  const helloWorldCmd = vscode.commands.registerCommand('agent-cowork.helloWorld', () => {
    vscode.window.showInformationMessage('Hello from Agent Cowork!');
  });

  const applyThemeCmd = vscode.commands.registerCommand('agent-cowork.applyTheme', async () => {
    await enforceTheme();
    vscode.window.showInformationMessage('Agent Cowork Light theme applied!');
  });

  context.subscriptions.push(helloWorldCmd, applyThemeCmd);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  // Clean up resources if necessary
}
