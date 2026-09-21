/* eslint-disable @typescript-eslint/no-var-requires */
import assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';
import { applyFilenameTint } from '../src/webview/markdownEditor';

const vscode = require('vscode');
const { FolderTreeProvider, FolderItem } = require('../src/folderTreeProvider');
const {
  getActiveDocumentUri,
  enforceBrowserTabBar,
  applyFilePastelHighlight,
  getLastPastelFilename,
  resetLastPastelFilename,
} = require('../src/extension');
const {
  getFilenameHue,
  getDarkShade,
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
    it('theme JSON defines list selection in the same green as the tab (#059669)', () => {
      const themePath = path.join(__dirname, '..', 'themes', 'agent-cowork-light.json');
      const themeContent = JSON.parse(fs.readFileSync(themePath, 'utf8'));

      assert.strictEqual(themeContent.colors['tab.activeBackground'], '#059669');
      assert.strictEqual(themeContent.colors['tab.hoverBackground'], '#0f172a');
      assert.strictEqual(themeContent.colors['tab.hoverForeground'], '#ffffff');
      assert.strictEqual(themeContent.colors['tab.hoverBorder'], '#0f172a');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverBackground'], '#1e293b');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverForeground'], '#ffffff');
      assert.strictEqual(themeContent.colors['tab.unfocusedHoverBorder'], '#1e293b');
      assert.strictEqual(themeContent.colors['list.activeSelectionBackground'], '#059669');
      assert.strictEqual(themeContent.colors['list.inactiveSelectionBackground'], '#059669');
      assert.strictEqual(themeContent.colors['list.activeSelectionForeground'], '#ffffff');
      assert.strictEqual(themeContent.colors['list.inactiveSelectionForeground'], '#ffffff');
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

    it('getFilePastelColors maps active tab and tree view selection to the darker shade with white text', () => {
      const colors = getFilePastelColors('project-plan.md');
      const expectedDark = getDarkShade(getFilenameHue('project-plan.md'));

      assert.strictEqual(colors['tab.activeBackground'], expectedDark);
      assert.strictEqual(colors['tab.selectedBackground'], expectedDark);
      assert.strictEqual(colors['list.activeSelectionBackground'], expectedDark);
      assert.strictEqual(colors['list.inactiveSelectionBackground'], expectedDark);
      assert.strictEqual(colors['list.focusBackground'], expectedDark);

      assert.strictEqual(colors['tab.activeForeground'], '#ffffff');
      assert.strictEqual(colors['tab.selectedForeground'], '#ffffff');
      assert.strictEqual(colors['list.activeSelectionForeground'], '#ffffff');
      assert.strictEqual(colors['list.inactiveSelectionForeground'], '#ffffff');
    });

    it('getFilePastelColors keeps unselected tabs on neutral slate (#e2e8f0) with readable text', () => {
      const colors = getFilePastelColors('activeDoc.md');

      assert.strictEqual(colors['tab.inactiveBackground'], '#e2e8f0');
      assert.strictEqual(colors['tab.unfocusedInactiveBackground'], '#e2e8f0');
      assert.strictEqual(colors['tab.inactiveForeground'], '#475569');
      assert.strictEqual(colors['tab.unfocusedInactiveForeground'], '#64748b');
    });

    it('getFilePastelColors matches tab hover state to dark obsidian (#0f172a) like cowork button with white text', () => {
      const colors = getFilePastelColors('activeDoc.md');

      // Tab hover matches Cowork button styling (#0f172a) with white text so text does not flicker
      assert.strictEqual(colors['tab.hoverBackground'], '#0f172a');
      assert.strictEqual(colors['tab.hoverForeground'], '#ffffff');
      assert.strictEqual(colors['tab.hoverBorder'], '#0f172a');
      assert.strictEqual(colors['tab.unfocusedHoverBackground'], '#1e293b');
      assert.strictEqual(colors['tab.unfocusedHoverForeground'], '#ffffff');
      assert.strictEqual(colors['tab.unfocusedHoverBorder'], '#1e293b');

      assert.strictEqual(colors['list.hoverBackground'], '#e2e8f0');
      assert.strictEqual(colors['list.hoverForeground'], '#0f172a');
    });

    it('applyFilePastelHighlight updates active tab and tree view highlight to the darker document color', async () => {
      await applyFilePastelHighlight('research.md');

      assert.strictEqual(getLastPastelFilename(), 'research.md');

      const config = vscode.workspace.getConfiguration('workbench');
      const customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.ok(customizations);

      const themeCustomizations = customizations['[Agent Cowork Light]'];
      assert.ok(themeCustomizations);

      const expectedColors = getFilePastelColors('research.md');
      const expectedDark = getDarkShade(getFilenameHue('research.md'));

      // Active tab and tree view selection must be the darker document color
      assert.strictEqual(themeCustomizations['tab.activeBackground'], expectedDark);
      assert.strictEqual(themeCustomizations['tab.selectedBackground'], expectedDark);
      assert.strictEqual(themeCustomizations['list.activeSelectionBackground'], expectedDark);
      assert.strictEqual(themeCustomizations['list.inactiveSelectionBackground'], expectedDark);
      assert.strictEqual(themeCustomizations['list.focusBackground'], expectedDark);

      // High-contrast text on dark background
      assert.strictEqual(themeCustomizations['tab.activeForeground'], '#ffffff');
      assert.strictEqual(themeCustomizations['list.activeSelectionForeground'], '#ffffff');

      // Unselected tabs remain neutral slate
      assert.strictEqual(themeCustomizations['tab.inactiveBackground'], '#e2e8f0');
      assert.strictEqual(themeCustomizations['tab.inactiveForeground'], '#475569');

      // Tab hover is dark obsidian like cowork button with crisp white text
      assert.strictEqual(themeCustomizations['tab.hoverBackground'], '#0f172a');
      assert.strictEqual(themeCustomizations['tab.hoverForeground'], '#ffffff');
      assert.strictEqual(themeCustomizations['tab.hoverBorder'], '#0f172a');
      assert.strictEqual(themeCustomizations['tab.unfocusedHoverBackground'], '#1e293b');
      assert.strictEqual(themeCustomizations['tab.unfocusedHoverBorder'], '#1e293b');
    });

    it('applyFilePastelHighlight updates highlights when switching to a different file', async () => {
      await applyFilePastelHighlight('notes.md');
      const darkNotes = getDarkShade(getFilenameHue('notes.md'));

      const config = vscode.workspace.getConfiguration('workbench');
      let customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], darkNotes);

      await applyFilePastelHighlight('budget.xlsx');
      const darkBudget = getDarkShade(getFilenameHue('budget.xlsx'));

      customizations = config.get<Record<string, any>>('colorCustomizations');
      assert.strictEqual(customizations['[Agent Cowork Light]']['tab.activeBackground'], darkBudget);
      assert.strictEqual(customizations['[Agent Cowork Light]']['list.activeSelectionBackground'], darkBudget);
    });

    it('applyFilenameTint applies document accents and CSS custom properties based on file hue', () => {
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
      const originalDoc = (global as any).document;
      try {
        (global as any).document = dom.window.document;

        applyFilenameTint('overview.md');

        const docEl = dom.window.document.documentElement;
        assert.ok(docEl.classList.contains('has-file-tint'));

        const hue = docEl.style.getPropertyValue('--file-tint-hue');
        assert.strictEqual(hue, String(getFilenameHue('overview.md')));

        const primary = docEl.style.getPropertyValue('--primary');
        assert.match(primary, /^#[0-9a-f]{6}$/i);
        assert.strictEqual(primary, getDarkShade(Number(hue)));

        const primaryHover = docEl.style.getPropertyValue('--primary-hover');
        assert.match(primaryHover, /^#[0-9a-f]{6}$/i);

        const primaryLight = docEl.style.getPropertyValue('--primary-light');
        assert.match(primaryLight, /^#[0-9a-f]{6}$/i);

        const primaryDark = docEl.style.getPropertyValue('--primary-dark');
        assert.match(primaryDark, /^#[0-9a-f]{6}$/i);

        const primarySelection = docEl.style.getPropertyValue('--primary-selection');
        assert.ok(primarySelection.startsWith('hsla('));
      } finally {
        (global as any).document = originalDoc;
      }
    });
  });
});
