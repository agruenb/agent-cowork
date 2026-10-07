/* eslint-disable @typescript-eslint/no-var-requires */
import assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';
import { applyFilenameTint, isWebviewDarkMode } from '../src/webview/markdownEditor';

const vscode = require('vscode');
const { FolderTreeProvider, FolderItem } = require('../src/folderTreeProvider');
const {
  getActiveDocumentUri,
  getOpenedFilePaths,
  enforceBrowserTabBar,
  applyFilePastelHighlight,
  applyDefaultTabHighlight,
  getLastPastelFilename,
  resetLastPastelFilename,
  revealActiveFileInTree,
} = require('../src/extension');
const {
  getFilenameHue,
  getDarkShade,
  getLightShade,
  getPastelShade,
  hslToHex,
  getFilePastelColors,
} = require('../src/utils/colorUtils');

describe('Folder Tree Auto-Reveal and Highlighting', () => {
  const rootPath = path.normalize('/mock/workspace');
  const rootUri = vscode.Uri.file(rootPath);

  beforeEach(() => {
    resetVscodeMock();
    vscodeMockState.workspaceFolders = [{ uri: rootUri, name: 'workspace', index: 0 }];
  });

  describe('Theme Highlighting Colors', () => {
    it('theme JSON defines list selection as subtle slate (#e2e8f0) and inactive as transparent', () => {
      const themePath = path.join(__dirname, '..', 'themes', 'agent-cowork-light.json');
      const themeContent = JSON.parse(fs.readFileSync(themePath, 'utf8'));

      assert.strictEqual(themeContent.colors['tab.activeBackground'], '#ffffff');
      assert.strictEqual(themeContent.colors['tab.activeForeground'], '#0f172a');
      assert.strictEqual(themeContent.colors['tab.hoverBackground'], '#f1f5f9');
      assert.strictEqual(themeContent.colors['tab.hoverForeground'], '#0f172a');
      assert.strictEqual(themeContent.colors['tab.hoverBorder'], '#e2e8f0');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverBackground'], '#f1f5f9');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverForeground'], '#0f172a');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverBorder'], '#e2e8f0');
      assert.strictEqual(themeContent.colors['list.activeSelectionBackground'], '#e2e8f0');
      assert.strictEqual(themeContent.colors['list.inactiveSelectionBackground'], '#00000000');
      assert.strictEqual(themeContent.colors['list.activeSelectionForeground'], '#0f172a');
      assert.strictEqual(themeContent.colors['list.inactiveSelectionForeground'], '#0f172a');
      assert.strictEqual(themeContent.colors['statusBar.background'], '#ffffff');
      assert.strictEqual(themeContent.colors['statusBar.border'], '#e2e8f0');
    });
  });

  describe('FolderItem collapsible state', () => {
    it('updates collapsibleState when setExpanded is called on directory item', () => {
      const dirUri = vscode.Uri.file(path.join(rootPath, 'docs'));
      const item = new FolderItem(dirUri, true, undefined, false);

      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

      item.setExpanded(true);
      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);

      item.setExpanded(false);
      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('keeps collapsibleState None for file items', () => {
      const fileUri = vscode.Uri.file(path.join(rootPath, 'notes.md'));
      const item = new FolderItem(fileUri, false, undefined, false);

      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
      item.setExpanded(true);
      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });
  });

  describe('FolderTreeProvider.getParent', () => {
    let provider: InstanceType<typeof FolderTreeProvider>;

    beforeEach(() => {
      provider = new FolderTreeProvider();
    });

    it('returns undefined for top-level file in single-root workspace', () => {
      const fileUri = vscode.Uri.file(path.join(rootPath, 'readme.md'));
      const item = provider.getFolderItem(fileUri, false);

      const parent = provider.getParent(item);
      assert.strictEqual(parent, undefined);
    });

    it('returns parent directory item for nested file in single-root workspace', () => {
      const nestedUri = vscode.Uri.file(path.join(rootPath, 'src', 'components', 'button.ts'));
      const item = provider.getFolderItem(nestedUri, false);

      const parent = provider.getParent(item);
      assert.ok(parent);
      assert.strictEqual(path.normalize(parent.uri.fsPath), path.normalize(path.join(rootPath, 'src', 'components')));
      assert.strictEqual(parent.isDirectory, true);
    });

    it('returns parent folder item for nested folder in single-root workspace', () => {
      const componentsUri = vscode.Uri.file(path.join(rootPath, 'src', 'components'));
      const item = provider.getFolderItem(componentsUri, true);

      const parent = provider.getParent(item);
      assert.ok(parent);
      assert.strictEqual(path.normalize(parent.uri.fsPath), path.normalize(path.join(rootPath, 'src')));
      assert.strictEqual(parent.isDirectory, true);
    });

    it('returns undefined for immediate child directory in single-root workspace', () => {
      const srcUri = vscode.Uri.file(path.join(rootPath, 'src'));
      const item = provider.getFolderItem(srcUri, true);

      const parent = provider.getParent(item);
      assert.strictEqual(parent, undefined);
    });

    it('handles multi-root workspaces correctly', () => {
      const root2Path = path.normalize('/mock/workspace2');
      vscodeMockState.workspaceFolders = [
        { uri: rootUri, name: 'workspace1', index: 0 },
        { uri: vscode.Uri.file(root2Path), name: 'workspace2', index: 1 },
      ];

      const fileInRoot2 = vscode.Uri.file(path.join(root2Path, 'sub', 'doc.md'));
      const fileItem = provider.getFolderItem(fileInRoot2, false);

      const parent = provider.getParent(fileItem);
      assert.ok(parent);
      assert.strictEqual(path.normalize(parent.uri.fsPath), path.normalize(path.join(root2Path, 'sub')));

      const root2TopItem = provider.getFolderItem(vscode.Uri.file(path.join(root2Path, 'sub')), true);
      const rootParent = provider.getParent(root2TopItem);
      assert.ok(rootParent);
      assert.strictEqual(path.normalize(rootParent.uri.fsPath), root2Path);
    });
  });

  describe('FolderTreeProvider.expandAncestors', () => {
    it('marks all ancestor directories as expanded', () => {
      const provider = new FolderTreeProvider();
      const targetUri = vscode.Uri.file(path.join(rootPath, 'a', 'b', 'c', 'note.md'));

      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a')), false);
      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a', 'b')), false);
      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a', 'b', 'c')), false);

      provider.expandAncestors(targetUri);

      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a')), true);
      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a', 'b')), true);
      assert.strictEqual(provider.isPathExpanded(path.join(rootPath, 'a', 'b', 'c')), true);
      // Root itself is not part of ancestor tree items in single-root workspace
      assert.strictEqual(provider.isPathExpanded(rootPath), false);
    });
  });

  describe('getActiveDocumentUri', () => {
    it('extracts active URI from active tab in tabGroups', () => {
      const activeUri = vscode.Uri.file(path.join(rootPath, 'active.md'));
      vscodeMockState.tabGroups = [
        {
          activeTab: {
            input: new vscode.TabInputCustom(activeUri, 'agentCowork.markdownEditor'),
          },
          tabs: [],
        },
      ];

      const resolved = getActiveDocumentUri();
      assert.ok(resolved);
      assert.strictEqual(resolved.fsPath, activeUri.fsPath);
    });

    it('falls back to activeTextEditor if tabGroups has no active tab', () => {
      vscodeMockState.tabGroups = [];
      const editorUri = vscode.Uri.file(path.join(rootPath, 'fallback.ts'));
      vscodeMockState.activeTextEditor = {
        document: { uri: editorUri },
      };

      const resolved = getActiveDocumentUri();
      assert.ok(resolved);
      assert.strictEqual(resolved.fsPath, editorUri.fsPath);
    });

    it('returns undefined when no tab or editor is open', () => {
      vscodeMockState.tabGroups = [];
      vscodeMockState.activeTextEditor = undefined;

      const resolved = getActiveDocumentUri();
      assert.strictEqual(resolved, undefined);
    });
  });

  describe('Color Utilities and Invariant Tab Styling', () => {
    beforeEach(() => {
      resetLastPastelFilename();
    });

    it('getFilenameHue produces deterministic hue in range [0, 360)', () => {
      const hue1 = getFilenameHue('notes.md');
      const hue2 = getFilenameHue('notes.md');
      const hue3 = getFilenameHue('budget.xlsx');

      assert.strictEqual(hue1, hue2);
      assert.ok(hue1 >= 0 && hue1 < 360);
      assert.ok(hue3 >= 0 && hue3 < 360);
    });

    it('hslToHex accurately converts HSL values to valid hex format', () => {
      assert.strictEqual(hslToHex(0, 100, 50), '#ff0000');
      assert.strictEqual(hslToHex(120, 100, 50), '#00ff00');
      assert.strictEqual(hslToHex(240, 100, 50), '#0000ff');
      assert.match(hslToHex(180, 50, 92), /^#[0-9a-f]{6}$/i);
    });

    it('getDarkShade derives a darker, rich shade with high contrast against white', () => {
      const darkGreen = getDarkShade(160);
      const darkBlue = getDarkShade(215);
      const darkYellow = getDarkShade(55);

      assert.match(darkGreen, /^#[0-9a-f]{6}$/i);
      assert.match(darkBlue, /^#[0-9a-f]{6}$/i);
      assert.match(darkYellow, /^#[0-9a-f]{6}$/i);
    });

    it('getPastelShade derives a subtle light pastel tone (92% lightness)', () => {
      const pastelGreen = getPastelShade(160);
      assert.match(pastelGreen, /^#[0-9a-f]{6}$/i);
      // Verify lightness is high (closer to white than pure color)
      assert.strictEqual(pastelGreen, hslToHex(160, 50, 92));
    });

    it('getFilePastelColors maps active tab to white background and file hue to filename', () => {
      const colors = getFilePastelColors('project-plan.md');
      const expectedDark = getDarkShade(getFilenameHue('project-plan.md'));

      assert.strictEqual(colors['tab.activeBackground'], '#ffffff');
      assert.strictEqual(colors['tab.selectedBackground'], '#ffffff');
      assert.strictEqual(colors['list.activeSelectionBackground'], '#e2e8f0');
      assert.strictEqual(colors['list.inactiveSelectionBackground'], '#00000000');
      assert.strictEqual(colors['list.focusBackground'], '#e2e8f0');
      assert.strictEqual(colors['list.activeSelectionForeground'], '#0f172a');
      assert.strictEqual(colors['list.inactiveSelectionForeground'], '#0f172a');

      assert.strictEqual(colors['tab.activeForeground'], expectedDark);
      assert.strictEqual(colors['tab.selectedForeground'], expectedDark);
      assert.strictEqual(colors['tab.unfocusedSelectedForeground'], expectedDark);
    });

    it('getFilePastelColors keeps unselected tabs on neutral slate (#e2e8f0) with readable text', () => {
      const colors = getFilePastelColors('activeDoc.md');

      assert.strictEqual(colors['tab.inactiveBackground'], '#e2e8f0');
      assert.strictEqual(colors['tab.unfocusedInactiveBackground'], '#e2e8f0');
      assert.strictEqual(colors['tab.inactiveForeground'], '#475569');
      assert.strictEqual(colors['tab.unfocusedInactiveForeground'], '#64748b');
    });

    it('getFilePastelColors matches tab hover state to gentle light tone (#f1f5f9) with obsidian text', () => {
      const colors = getFilePastelColors('activeDoc.md');

      assert.strictEqual(colors['tab.hoverBackground'], '#f1f5f9');
      assert.strictEqual(colors['tab.hoverForeground'], '#0f172a');
      assert.strictEqual(colors['tab.hoverBorder'], '#e2e8f0');
      assert.strictEqual(colors['tab.unfocusedHoverBackground'], '#f1f5f9');
      assert.strictEqual(colors['tab.unfocusedHoverForeground'], '#0f172a');
      assert.strictEqual(colors['tab.unfocusedHoverBorder'], '#e2e8f0');

      assert.strictEqual(colors['list.hoverBackground'], '#e2e8f0');
      assert.strictEqual(colors['list.hoverForeground'], '#0f172a');
    });

    it('applyFilePastelHighlight updates active tab with white background and hue-tinted filename', async () => {
      await applyFilePastelHighlight('research.md');

      assert.strictEqual(getLastPastelFilename(), 'research.md');

      const config = vscode.workspace.getConfiguration('workbench');
      const customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.ok(customizations);

      const themeCustomizations = customizations['[Agent Cowork Light]'];
      assert.ok(themeCustomizations);

      const expectedDark = getDarkShade(getFilenameHue('research.md'));

      // Active tab and selected tab must be white editor background
      assert.strictEqual(themeCustomizations['tab.activeBackground'], '#ffffff');
      assert.strictEqual(themeCustomizations['tab.selectedBackground'], '#ffffff');

      // The document hue is applied directly to the active filename
      assert.strictEqual(themeCustomizations['tab.activeForeground'], expectedDark);
      assert.strictEqual(themeCustomizations['tab.selectedForeground'], expectedDark);

      // Unselected tabs remain neutral slate
      assert.strictEqual(themeCustomizations['tab.inactiveBackground'], '#e2e8f0');
      assert.strictEqual(themeCustomizations['tab.inactiveForeground'], '#475569');

      // Tab hover is light tone with obsidian text
      assert.strictEqual(themeCustomizations['tab.hoverBackground'], '#f1f5f9');
      assert.strictEqual(themeCustomizations['tab.hoverForeground'], '#0f172a');
      assert.strictEqual(themeCustomizations['tab.hoverBorder'], '#e2e8f0');
      assert.strictEqual(themeCustomizations['tab.unfocusedHoverBackground'], '#f1f5f9');
      assert.strictEqual(themeCustomizations['tab.unfocusedHoverBorder'], '#e2e8f0');
    });

    it('applyFilePastelHighlight updates highlights when switching to a different file', async () => {
      await applyFilePastelHighlight('notes.md');
      const darkNotes = getDarkShade(getFilenameHue('notes.md'));

      const config = vscode.workspace.getConfiguration('workbench');
      let customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], darkNotes);
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');

      await applyFilePastelHighlight('budget.xlsx');
      const darkBudget = getDarkShade(getFilenameHue('budget.xlsx'));

      customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], darkBudget);
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');
    });

    it('applyFilePastelHighlight re-applies if colorCustomizations is modified by another window', async () => {
      await applyFilePastelHighlight('project.md');
      const darkProject = getDarkShade(getFilenameHue('project.md'));

      const config = vscode.workspace.getConfiguration('workbench');
      let customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], darkProject);
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');

      // Simulate another window overwriting colorCustomizations
      await config.update('colorCustomizations', {
        '[Agent Cowork Light]': {
          'tab.activeForeground': '#000000',
        },
      }, vscode.ConfigurationTarget.Global);

      // Call applyFilePastelHighlight again for project.md
      await applyFilePastelHighlight('project.md');
      customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], darkProject);
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');
    });

    it('enforceBrowserTabBar removes stale top-level tab and statusBar keys to prevent white-on-white fallback', async () => {
      const config = vscode.workspace.getConfiguration('workbench');
      await config.update('colorCustomizations', {
        'tab.activeBackground': '#ffffff',
        'tab.selectedBackground': '#ffffff',
        'statusBar.background': '#ffffff',
        'statusBar.foreground': '#000000',
        '[Agent Cowork Light]': {},
      }, vscode.ConfigurationTarget.Global);

      await enforceBrowserTabBar();

      const customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['tab.activeBackground'], undefined);
      assert.strictEqual(customizations['tab.selectedBackground'], undefined);
      assert.strictEqual(customizations['statusBar.background'], undefined);
      assert.strictEqual(customizations['statusBar.foreground'], undefined);
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], '#0f172a');
    });

    it('applyDefaultTabHighlight applies white background with obsidian tab text when no document is active', async () => {
      await applyDefaultTabHighlight();

      const config = vscode.workspace.getConfiguration('workbench');
      const customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], '#ffffff');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeForeground'], '#0f172a');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.selectedBackground'], '#ffffff');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.selectedForeground'], '#0f172a');
    });

    it('applyFilenameTint applies document accents and CSS custom properties based on file hue to both html and body', () => {
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
      const originalDoc = (global as any).document;
      try {
        (global as any).document = dom.window.document;

        applyFilenameTint('overview.md');

        const docEl = dom.window.document.documentElement;
        const bodyEl = dom.window.document.body;
        assert.ok(docEl.classList.contains('has-file-tint'));
        assert.ok(bodyEl.classList.contains('has-file-tint'));

        const hue = docEl.style.getPropertyValue('--file-tint-hue');
        assert.strictEqual(hue, String(getFilenameHue('overview.md')));
        assert.strictEqual(bodyEl.style.getPropertyValue('--file-tint-hue'), String(getFilenameHue('overview.md')));

        const primary = docEl.style.getPropertyValue('--primary');
        assert.match(primary, /^#[0-9a-f]{6}$/i);
        assert.strictEqual(primary, getDarkShade(Number(hue)));
        assert.strictEqual(bodyEl.style.getPropertyValue('--primary'), getDarkShade(Number(hue)));

        const primaryHover = docEl.style.getPropertyValue('--primary-hover');
        assert.match(primaryHover, /^#[0-9a-f]{6}$/i);
        assert.strictEqual(bodyEl.style.getPropertyValue('--primary-hover'), primaryHover);

        const primaryLight = docEl.style.getPropertyValue('--primary-light');
        assert.match(primaryLight, /^#[0-9a-f]{6}$/i);
        assert.strictEqual(bodyEl.style.getPropertyValue('--primary-light'), primaryLight);

        const primaryDark = docEl.style.getPropertyValue('--primary-dark');
        assert.match(primaryDark, /^#[0-9a-f]{6}$/i);
        assert.strictEqual(bodyEl.style.getPropertyValue('--primary-dark'), primaryDark);

        const primarySelection = docEl.style.getPropertyValue('--primary-selection');
        assert.ok(primarySelection.startsWith('hsla('));
        assert.ok(bodyEl.style.getPropertyValue('--primary-selection').startsWith('hsla('));
      } finally {
        (global as any).document = originalDoc;
      }
    });

    it('applyFilenameTint applies dark mode shades when vscode-dark is present on body', () => {
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body class="vscode-dark"></body></html>');
      const originalDoc = (global as any).document;
      try {
        (global as any).document = dom.window.document;

        assert.strictEqual(isWebviewDarkMode(), true);
        applyFilenameTint('overview.md');

        const bodyEl = dom.window.document.body;
        const hue = getFilenameHue('overview.md');
        const primary = bodyEl.style.getPropertyValue('--primary');
        assert.strictEqual(primary, getLightShade(hue));
        assert.ok(dom.window.document.documentElement.classList.contains('is-dark'));
      } finally {
        (global as any).document = originalDoc;
      }
    });

    it('isWebviewDarkMode does not latch into dark mode when documentElement has is-dark but body is light', () => {
      const dom = new JSDOM('<!DOCTYPE html><html class="is-dark"><head></head><body class="vscode-light"></body></html>');
      const originalDoc = (global as any).document;
      try {
        (global as any).document = dom.window.document;

        assert.strictEqual(isWebviewDarkMode(), false);
        applyFilenameTint('overview.md');

        const bodyEl = dom.window.document.body;
        const hue = getFilenameHue('overview.md');
        const primary = bodyEl.style.getPropertyValue('--primary');
        assert.strictEqual(primary, getDarkShade(hue));
        assert.strictEqual(bodyEl.classList.contains('is-dark'), false);
        assert.strictEqual(dom.window.document.documentElement.classList.contains('is-dark'), false);
      } finally {
        (global as any).document = originalDoc;
      }
    });
  });

  describe('Open File Dot Indicator in Tree View', () => {
    it('revealActiveFileInTree is deprecated and returns false without selecting', async () => {
      const mockTreeView: any = {
        visible: true,
        reveal: async () => {},
      };
      const provider = new FolderTreeProvider();
      const fileUri = vscode.Uri.file(path.join(rootPath, 'note.md'));

      const revealed = await revealActiveFileInTree(mockTreeView, provider, fileUri);
      assert.strictEqual(revealed, false);
    });

    it('marks file as opened with a dot in its color when in openedPaths', () => {
      const provider = new FolderTreeProvider();
      const fileUri = vscode.Uri.file(path.join(rootPath, 'notes.md'));

      provider.setOpenedPaths([fileUri.fsPath]);

      const item = provider.getFolderItem(fileUri, false);
      assert.strictEqual(item.isOpened, true);
      assert.strictEqual(item.description, undefined);
      assert.ok(item.tooltip.includes('notes.md'));
      assert.ok(item.tooltip.includes('Open') || item.tooltip.includes('Geöffnet'));
      assert.ok(item.iconPath);
    });

    it('marks file as not opened when not in openedPaths', () => {
      const provider = new FolderTreeProvider();
      const fileUri = vscode.Uri.file(path.join(rootPath, 'unopened.md'));

      const item = provider.getFolderItem(fileUri, false);
      assert.strictEqual(item.isOpened, false);
      assert.strictEqual(item.description, undefined);
      assert.strictEqual(item.tooltip, fileUri.fsPath);
    });

    it('updates existing cached items when setOpenedPaths changes', () => {
      const provider = new FolderTreeProvider();
      const fileUri1 = vscode.Uri.file(path.join(rootPath, 'doc1.md'));
      const fileUri2 = vscode.Uri.file(path.join(rootPath, 'doc2.md'));

      const item1 = provider.getFolderItem(fileUri1, false);
      const item2 = provider.getFolderItem(fileUri2, false);

      assert.strictEqual(item1.isOpened, false);
      assert.strictEqual(item2.isOpened, false);

      // Open doc1
      provider.setOpenedPaths([fileUri1.fsPath]);
      assert.strictEqual(item1.isOpened, true);
      assert.strictEqual(item1.description, undefined);
      assert.strictEqual(item2.isOpened, false);

      // Close doc1, open doc2
      provider.setOpenedPaths([fileUri2.fsPath]);
      assert.strictEqual(item1.isOpened, false);
      assert.strictEqual(item1.description, undefined);
      assert.strictEqual(item2.isOpened, true);
      assert.strictEqual(item2.description, undefined);
    });

    it('getOpenedFilePaths resolves open file paths across tab groups', () => {
      const file1 = vscode.Uri.file(path.join(rootPath, 'file1.md'));
      const file2 = vscode.Uri.file(path.join(rootPath, 'file2.md'));

      vscodeMockState.tabGroups = [
        {
          activeTab: { input: new vscode.TabInputCustom(file1, 'agentCowork.markdownEditor') },
          tabs: [
            { input: new vscode.TabInputCustom(file1, 'agentCowork.markdownEditor') },
            { input: new vscode.TabInputCustom(file2, 'agentCowork.markdownEditor') },
          ],
        },
      ];

      const opened = getOpenedFilePaths();
      assert.strictEqual(opened.length, 2);
      assert.ok(opened.includes(path.normalize(file1.fsPath)));
      assert.ok(opened.includes(path.normalize(file2.fsPath)));
    });
  });
});

