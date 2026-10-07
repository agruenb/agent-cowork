/* eslint-disable */
import Module from 'module';

export interface VscodeMockState {
  languageSetting: string;
  envLanguage: string;
  coworkViewSetting: boolean;
  darkModeSetting: boolean;
  configUpdates: Record<string, any>;
  closedTabs: any[];
  tabGroups: any[];
  executedCommands: { command: string; args: any[] }[];
  contexts: Record<string, any>;
  workspaceFolders: any[];
  activeTextEditor?: any;
  createdTreeViews: any[];
  treeViewVisible?: boolean;
  existingFiles?: Set<string>;
  writtenFiles?: { uri: any; content: Uint8Array }[];
  createdDirs?: any[];
  warningMessages?: { msg: string; items: any[] }[];
  warningAnswer?: any;
  errorMessages?: string[];
  textDocuments?: any[];
  appliedEdits?: any[];
  availableCommands?: string[];
  commandHandlers?: Record<string, (...args: any[]) => any>;
  documentChangeListeners?: ((e: any) => any)[];
  documentCloseListeners?: ((doc: any) => any)[];
  documentSaveListeners?: ((doc: any) => any)[];
}

export const vscodeMockState: VscodeMockState = {
  languageSetting: 'auto',
  envLanguage: 'en',
  coworkViewSetting: true,
  darkModeSetting: false,
  configUpdates: {},
  closedTabs: [],
  tabGroups: [],
  executedCommands: [],
  contexts: {},
  workspaceFolders: [],
  activeTextEditor: undefined,
  createdTreeViews: [],
  treeViewVisible: undefined,
  existingFiles: undefined,
  writtenFiles: [],
  createdDirs: [],
  warningMessages: [],
  warningAnswer: undefined,
  errorMessages: [],
  textDocuments: [],
  appliedEdits: [],
  availableCommands: [],
  commandHandlers: {},
  documentChangeListeners: [],
  documentCloseListeners: [],
  documentSaveListeners: [],
};

export function resetVscodeMock(): void {
  vscodeMockState.languageSetting = 'auto';
  vscodeMockState.envLanguage = 'en';
  vscodeMockState.coworkViewSetting = true;
  vscodeMockState.darkModeSetting = false;
  vscodeMockState.configUpdates = {};
  vscodeMockState.closedTabs = [];
  vscodeMockState.tabGroups = [];
  vscodeMockState.executedCommands = [];
  vscodeMockState.contexts = {};
  vscodeMockState.workspaceFolders = [];
  vscodeMockState.activeTextEditor = undefined;
  vscodeMockState.createdTreeViews = [];
  vscodeMockState.treeViewVisible = undefined;
  vscodeMockState.existingFiles = undefined;
  vscodeMockState.writtenFiles = [];
  vscodeMockState.createdDirs = [];
  vscodeMockState.warningMessages = [];
  vscodeMockState.warningAnswer = undefined;
  vscodeMockState.errorMessages = [];
  vscodeMockState.textDocuments = [];
  vscodeMockState.appliedEdits = [];
  vscodeMockState.availableCommands = [];
  vscodeMockState.commandHandlers = {};
  vscodeMockState.documentChangeListeners = [];
  vscodeMockState.documentCloseListeners = [];
  vscodeMockState.documentSaveListeners = [];
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
    constructor(
      public readonly fsPath: string,
      public readonly path: string = fsPath,
      public readonly scheme: string = 'file'
    ) {}
    static file(filePath: string) {
      return new MockUri(filePath, filePath, 'file');
    }
    static joinPath(base: MockUri, ...segments: string[]) {
      return new MockUri([base.fsPath, ...segments].join('/'), [base.path, ...segments].join('/'), base.scheme);
    }
    static parse(uriString: string) {
      if (uriString.startsWith('file://')) {
        const p = uriString.replace(/^file:\/\//, '');
        return new MockUri(p, p, 'file');
      }
      const match = uriString.match(/^([a-z0-9+.-]+):\/\/(.*)$/i);
      if (match) {
        return new MockUri(match[2], match[2], match[1]);
      }
      const matchNoSlash = uriString.match(/^([a-z0-9+.-]+):(.*)$/i);
      if (matchNoSlash) {
        return new MockUri(matchNoSlash[2], matchNoSlash[2], matchNoSlash[1]);
      }
      return new MockUri(uriString, uriString, 'file');
    }
    toString() {
      return `${this.scheme}://${this.fsPath}`;
    }
  }

  let mockVscodeInstance: any = null;
  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') {
      if (mockVscodeInstance) {
        return mockVscodeInstance;
      }
      mockVscodeInstance = {
        EndOfLine: {
          LF: 1,
          CRLF: 2,
        },
        TextDocumentChangeReason: {
          Undo: 1,
          Redo: 2,
        },
        WorkspaceEdit: class {
          public entries: { uri: any; range: any; newText: string }[] = [];
          replace(uri: any, range: any, newText: string) {
            this.entries.push({ uri, range, newText });
          }
        },
        Uri: MockUri,
        Range: class {
          constructor(
            public startLine: number,
            public startCharacter: number,
            public endLine: number,
            public endCharacter: number
          ) {}
          get start() {
            return { line: this.startLine, character: this.startCharacter };
          }
          get end() {
            return { line: this.endLine, character: this.endCharacter };
          }
        },
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
          fs: {
            stat: async (uri: any) => {
              if (vscodeMockState.existingFiles && !vscodeMockState.existingFiles.has(uri.fsPath)) {
                throw new Error('File not found');
              }
              return { type: 1 /* FileType.File */ };
            },
            writeFile: async (uri: any, content: Uint8Array) => {
              if (vscodeMockState.existingFiles) {
                vscodeMockState.existingFiles.add(uri.fsPath);
              }
              vscodeMockState.writtenFiles = vscodeMockState.writtenFiles || [];
              vscodeMockState.writtenFiles.push({ uri, content });
            },
            createDirectory: async (uri: any) => {
              vscodeMockState.createdDirs = vscodeMockState.createdDirs || [];
              vscodeMockState.createdDirs.push(uri);
            },
          },
          get workspaceFolders() {
            return vscodeMockState.workspaceFolders;
          },
          get textDocuments() {
            return vscodeMockState.textDocuments || [];
          },
          getWorkspaceFolder: (uri: any) => {
            return vscodeMockState.workspaceFolders.find((f: any) => {
              const root = f.uri.fsPath.replace(/\\/g, '/');
              const target = (uri?.fsPath || '').replace(/\\/g, '/');
              return target === root || target.startsWith(root + '/');
            });
          },
          onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
          onDidChangeTextDocument: (listener: (e: any) => any) => {
            vscodeMockState.documentChangeListeners = vscodeMockState.documentChangeListeners || [];
            vscodeMockState.documentChangeListeners.push(listener);
            return {
              dispose: () => {
                const idx = vscodeMockState.documentChangeListeners?.indexOf(listener) ?? -1;
                if (idx !== -1) vscodeMockState.documentChangeListeners?.splice(idx, 1);
              },
            };
          },
          onDidCloseTextDocument: (listener: (doc: any) => any) => {
            vscodeMockState.documentCloseListeners = vscodeMockState.documentCloseListeners || [];
            vscodeMockState.documentCloseListeners.push(listener);
            return {
              dispose: () => {
                const idx = vscodeMockState.documentCloseListeners?.indexOf(listener) ?? -1;
                if (idx !== -1) vscodeMockState.documentCloseListeners?.splice(idx, 1);
              },
            };
          },
          onDidSaveTextDocument: (listener: (doc: any) => any) => {
            vscodeMockState.documentSaveListeners = vscodeMockState.documentSaveListeners || [];
            vscodeMockState.documentSaveListeners.push(listener);
            return {
              dispose: () => {
                const idx = vscodeMockState.documentSaveListeners?.indexOf(listener) ?? -1;
                if (idx !== -1) vscodeMockState.documentSaveListeners?.splice(idx, 1);
              },
            };
          },
          applyEdit: async (edit: any) => {
            vscodeMockState.appliedEdits = vscodeMockState.appliedEdits || [];
            vscodeMockState.appliedEdits.push(edit);
            if (edit && edit.entries) {
              for (const entry of edit.entries) {
                if (entry.uri && vscodeMockState.textDocuments) {
                  const doc = vscodeMockState.textDocuments.find(
                    (d: any) => d.uri && d.uri.toString() === entry.uri.toString()
                  );
                  if (doc && typeof doc._setText === 'function') {
                    doc._setText(entry.newText);
                  }
                }
              }
            }
            return true;
          },
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
                  if (key === 'darkMode') {
                    return vscodeMockState.darkModeSetting;
                  }
                  return defaultValue;
                },
                update: async (key: string, val: any) => {
                  vscodeMockState.configUpdates[`agentCowork.${key}`] = val;
                  if (key === 'coworkView') {
                    vscodeMockState.coworkViewSetting = val;
                  }
                  if (key === 'darkMode') {
                    vscodeMockState.darkModeSetting = val;
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
                  if (key === 'preferredLightColorTheme') {
                    return (
                      vscodeMockState.configUpdates['workbench.preferredLightColorTheme'] ||
                      vscodeMockState.configUpdates['preferredLightColorTheme'] ||
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
          openExternal: async (uri: any) => {
            vscodeMockState.executedCommands.push({ command: 'env.openExternal', args: [uri] });
            return true;
          },
        },
        window: {
          showInformationMessage: async () => {},
          showWarningMessage: async (msg: string, ...items: any[]) => {
            vscodeMockState.warningMessages = vscodeMockState.warningMessages || [];
            vscodeMockState.warningMessages.push({ msg, items });
            if (vscodeMockState.warningAnswer !== undefined) {
              return vscodeMockState.warningAnswer;
            }
            return items[0];
          },
          showErrorMessage: async (msg: string) => {
            vscodeMockState.errorMessages = vscodeMockState.errorMessages || [];
            vscodeMockState.errorMessages.push(msg);
          },
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
          createTreeView: (viewId: string, options: any) => {
            const listeners: {
              onDidExpandElement: ((e: any) => any)[];
              onDidCollapseElement: ((e: any) => any)[];
              onDidChangeVisibility: ((e: any) => any)[];
            } = {
              onDidExpandElement: [],
              onDidCollapseElement: [],
              onDidChangeVisibility: [],
            };
            const treeView = {
              viewId,
              options,
              visible: vscodeMockState.treeViewVisible ?? true,
              revealedElements: [] as any[],
              onDidExpandElement: (listener: (e: any) => any) => {
                listeners.onDidExpandElement.push(listener);
                return { dispose: () => {} };
              },
              onDidCollapseElement: (listener: (e: any) => any) => {
                listeners.onDidCollapseElement.push(listener);
                return { dispose: () => {} };
              },
              onDidChangeVisibility: (listener: (e: any) => any) => {
                listeners.onDidChangeVisibility.push(listener);
                return { dispose: () => {} };
              },
              reveal: async (item: any, options?: any) => {
                treeView.revealedElements.push({ item, options });
              },
              dispose: () => {},
              _fireVisibilityChange: (visible: boolean) => {
                treeView.visible = visible;
                for (const l of listeners.onDidChangeVisibility) {
                  l({ visible });
                }
              },
            };
            vscodeMockState.createdTreeViews.push(treeView);
            return treeView;
          },
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
          registerCustomEditorProvider: (viewType: string, provider: any, options?: any) => {
            return { dispose: () => {} };
          },
          state: { focused: true },
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
          getCommands: async (filter?: boolean) => {
            return vscodeMockState.availableCommands || [];
          },
          executeCommand: async (cmd: string, ...args: any[]) => {
            vscodeMockState.executedCommands.push({ command: cmd, args });
            if (cmd === 'setContext') {
              vscodeMockState.contexts[args[0]] = args[1];
            }
            if (vscodeMockState.commandHandlers && typeof vscodeMockState.commandHandlers[cmd] === 'function') {
              return await vscodeMockState.commandHandlers[cmd](...args);
            }
            return undefined;
          },
        },
      };
    }
    return origLoad.apply(this, arguments);
  };
}

export async function fireDidChangeTextDocument(e: any): Promise<void> {
  const listeners = [...(vscodeMockState.documentChangeListeners || [])];
  await Promise.all(listeners.map((listener) => listener(e)));
}

export async function fireDidCloseTextDocument(doc: any): Promise<void> {
  const listeners = [...(vscodeMockState.documentCloseListeners || [])];
  await Promise.all(listeners.map((listener) => listener(doc)));
}

export async function fireDidSaveTextDocument(doc: any): Promise<void> {
  const listeners = [...(vscodeMockState.documentSaveListeners || [])];
  await Promise.all(listeners.map((listener) => listener(doc)));
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
