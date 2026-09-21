/* eslint-disable */
import Module from 'module';

export interface VscodeMockState {
  languageSetting: string;
  envLanguage: string;
  coworkViewSetting: boolean;
  configUpdates: Record<string, any>;
  closedTabs: any[];
  tabGroups: any[];
  executedCommands: { command: string; args: any[] }[];
  contexts: Record<string, any>;
  workspaceFolders: any[];
  activeTextEditor?: any;
}

export const vscodeMockState: VscodeMockState = {
  languageSetting: 'auto',
  envLanguage: 'en',
  coworkViewSetting: true,
  configUpdates: {},
  closedTabs: [],
  tabGroups: [],
  executedCommands: [],
  contexts: {},
  workspaceFolders: [],
  activeTextEditor: undefined,
};

export function resetVscodeMock(): void {
  vscodeMockState.languageSetting = 'auto';
  vscodeMockState.envLanguage = 'en';
  vscodeMockState.coworkViewSetting = true;
  vscodeMockState.configUpdates = {};
  vscodeMockState.closedTabs = [];
  vscodeMockState.tabGroups = [];
  vscodeMockState.executedCommands = [];
  vscodeMockState.contexts = {};
  vscodeMockState.workspaceFolders = [];
  vscodeMockState.activeTextEditor = undefined;
}

// Hook Module._resolveFilename and Module._load once
if (!(globalThis as any).__vscodeMockInstalled) {
  (globalThis as any).__vscodeMockInstalled = true;

  const origResolve = (Module as any)._resolveFilename;
  (Module as any)._resolveFilename = function (request: string) {
    if (request === 'vscode') {
      return 'vscode';
    }
    return origResolve.apply(this, arguments);
  };

  class MockUri {
    constructor(public readonly fsPath: string, public readonly path: string = fsPath) {}
    static file(filePath: string) {
      return new MockUri(filePath);
    }
    static joinPath(base: MockUri, ...segments: string[]) {
      return new MockUri([base.fsPath, ...segments].join('/'));
    }
    get scheme() {
      return 'file';
    }
    toString() {
      return `file://${this.fsPath}`;
    }
  }

  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') {
      return {
        Uri: MockUri,
        TabInputText: class {
          constructor(public readonly uri: any) {}
        },
        TabInputCustom: class {
          constructor(public readonly uri: any, public readonly viewType: string) {}
        },
        TreeItemCollapsibleState: {
          None: 0,
          Collapsed: 1,
          Expanded: 2,
        },
        TreeItem: class {
          id?: string;
          resourceUri?: any;
          tooltip?: string;
          command?: any;
          contextValue?: string;
          iconPath?: any;
          constructor(public label: string, public collapsibleState: number = 0) {}
        },
        ThemeIcon: class {
          constructor(public readonly id: string, public readonly color?: any) {}
          static File = new (class {})();
        },
        ThemeColor: class {
          constructor(public readonly id: string) {}
        },
        EventEmitter: class {
          public event = (listener: any) => listener;
          public fire(data?: any) {}
        },
        workspace: {
          get workspaceFolders() {
            return vscodeMockState.workspaceFolders;
          },
          getWorkspaceFolder: (uri: any) => {
            return vscodeMockState.workspaceFolders.find((f: any) => {
              const root = f.uri.fsPath.replace(/\\/g, '/');
              const target = (uri?.fsPath || '').replace(/\\/g, '/');
              return target === root || target.startsWith(root + '/');
            });
          },
          onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
          getConfiguration: (section: string) => {
            if (section === 'agentCowork') {
              return {
                get: (key: string, defaultValue?: any) => {
                  if (key === 'language') {
                    return vscodeMockState.languageSetting;
                  }
                  if (key === 'coworkView') {
                    return vscodeMockState.coworkViewSetting;
                  }
                  return defaultValue;
                },
                update: async (key: string, val: any) => {
                  vscodeMockState.configUpdates[`agentCowork.${key}`] = val;
                  if (key === 'coworkView') {
                    vscodeMockState.coworkViewSetting = val;
                  }
                },
              };
            }
            if (section === 'workbench') {
              return {
                get: (key: string, def?: any) => {
                  if (key === 'editorAssociations') {
                    return vscodeMockState.configUpdates['workbench.editorAssociations'] || def || {};
                  }
                  if (key === 'colorTheme') {
                    return (
                      vscodeMockState.configUpdates['workbench.colorTheme'] ||
                      vscodeMockState.configUpdates['colorTheme'] ||
                      def
                    );
                  }
                  if (key === 'iconTheme') {
                    return (
                      vscodeMockState.configUpdates['workbench.iconTheme'] ||
                      vscodeMockState.configUpdates['iconTheme'] ||
                      def
                    );
                  }
                  if (key === 'colorCustomizations') {
                    return (
                      vscodeMockState.configUpdates['workbench.colorCustomizations'] ||
                      vscodeMockState.configUpdates['colorCustomizations'] ||
                      def ||
                      {}
                    );
                  }
                  return def;
                },
                inspect: (key: string) => ({ key, defaultValue: undefined, globalValue: undefined }),
                update: async (key: string, val: any) => {
                  vscodeMockState.configUpdates[`workbench.${key}`] = val;
                  vscodeMockState.configUpdates[key] = val;
                },
              };
            }
            return {
              get: (_k: string, def?: any) => def,
              inspect: (key: string) => ({ key, defaultValue: undefined, globalValue: undefined }),
              update: async (key: string, val: any) => {
                vscodeMockState.configUpdates[`${section}.${key}`] = val;
              },
            };
          },
        },
        env: {
          get language() {
            return vscodeMockState.envLanguage;
          },
        },
        window: {
          createStatusBarItem: (id: string, alignment?: any, priority?: number) => ({
            id,
            alignment,
            priority,
            text: '',
            tooltip: '',
            command: '',
            name: '',
            show: () => {},
            hide: () => {},
            dispose: () => {},
          }),
          showInformationMessage: async () => {},
          get activeTextEditor() {
            return vscodeMockState.activeTextEditor;
          },
          get tabGroups() {
            return {
              get all() {
                return vscodeMockState.tabGroups;
              },
              activeTabGroup: vscodeMockState.tabGroups[0] || undefined,
              close: async (tab: any) => {
                vscodeMockState.closedTabs.push(tab);
                for (const group of vscodeMockState.tabGroups) {
                  const idx = group.tabs.indexOf(tab);
                  if (idx !== -1) {
                    group.tabs.splice(idx, 1);
                  }
                }
              },
            };
          },
        },
        StatusBarAlignment: {
          Left: 1,
          Right: 2,
        },
        ConfigurationTarget: {
          Global: 1,
          Workspace: 2,
        },
        commands: {
          executeCommand: async (cmd: string, ...args: any[]) => {
            vscodeMockState.executedCommands.push({ command: cmd, args });
            if (cmd === 'setContext') {
              vscodeMockState.contexts[args[0]] = args[1];
            }
            return undefined;
          },
        },
      };
    }
    return origLoad.apply(this, arguments);
  };
}

export function createMockExtensionContext(): any {
  const store: Record<string, any> = {};
  return {
    globalState: {
      get: (key: string, def?: any) => (key in store ? store[key] : def),
      update: async (key: string, val: any) => {
        store[key] = val;
      },
    },
  };
}
