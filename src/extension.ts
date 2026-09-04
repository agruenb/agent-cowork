import * as vscode from 'vscode';

/**
 * Called when the extension is activated.
 * The extension is activated the very first time the command is executed.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Congratulations, your extension "agent-cowork" is now active!');

  // Register command defined in package.json
  const disposable = vscode.commands.registerCommand('agent-cowork.helloWorld', () => {
    vscode.window.showInformationMessage('Hello from Agent Cowork!');
  });

  context.subscriptions.push(disposable);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  // Clean up resources if necessary
}
