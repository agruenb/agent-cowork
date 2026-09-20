/* eslint-disable @typescript-eslint/no-var-requires */
import assert from 'assert';
import { vscodeMockState, resetVscodeMock, createMockExtensionContext } from './vscodeMock';

const {
  isMarkdownPath,
  extractUriFromTab,
  isMarkdownTab,
  isCoworkEditorTab,
  getCoworkStatusBarText,
  getCoworkStatusBarTooltip,
  updateCoworkStatusBarItem,
  createCoworkStatusBarItem,
  isCoworkViewEnabled,
  setCoworkViewConfig,
  getUpdatedEditorAssociations,
  applyMarkdownEditorAssociations,
  switchOpenMarkdownTabs,
  applyCoworkView,
  applyCoworkTheme,
  setCoworkManagerContext,
  THEME_NAME,
  ICON_THEME_NAME,
  DEFAULT_FALLBACK_THEME,
  DEFAULT_FALLBACK_ICON_THEME,
  MARKDOWN_PATTERNS,
} = require('../src/coworkViewManager');

describe('Cowork View Manager', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  describe('isMarkdownPath', () => {
    it('identifies standard .md files', () => {
      assert.strictEqual(isMarkdownPath('document.md'), true);
      assert.strictEqual(isMarkdownPath('/path/to/my file.md'), true);
    });

    it('identifies other markdown extensions (.markdown, .mdown, .mkdn, .mdx)', () => {
      assert.strictEqual(isMarkdownPath('notes.markdown'), true);
      assert.strictEqual(isMarkdownPath('post.mdown'), true);
      assert.strictEqual(isMarkdownPath('doc.mkdn'), true);
      assert.strictEqual(isMarkdownPath('guide.mdx'), true);
    });

    it('is case-insensitive for extensions', () => {
      assert.strictEqual(isMarkdownPath('DOCUMENT.MD'), true);
      assert.strictEqual(isMarkdownPath('README.MARKDOWN'), true);
      assert.strictEqual(isMarkdownPath('page.MDX'), true);
    });

    it('rejects non-markdown files', () => {
      assert.strictEqual(isMarkdownPath('script.ts'), false);
      assert.strictEqual(isMarkdownPath('index.html'), false);
      assert.strictEqual(isMarkdownPath('data.json'), false);
      assert.strictEqual(isMarkdownPath('image.png'), false);
      assert.strictEqual(isMarkdownPath(''), false);
    });
  });

  describe('Tab Helpers', () => {
    it('extractUriFromTab retrieves URI from various tab input structures', () => {
      const uri1 = { fsPath: '/path/file.md', path: '/path/file.md' };
      assert.strictEqual(extractUriFromTab({ input: { uri: uri1 } })?.fsPath, uri1.fsPath);
      assert.strictEqual(extractUriFromTab({ input: { resource: uri1 } })?.fsPath, uri1.fsPath);
      assert.strictEqual(extractUriFromTab({ input: { original: uri1 } })?.fsPath, uri1.fsPath);
      assert.strictEqual(extractUriFromTab({ input: null }), undefined);
    });

    it('isMarkdownTab detects markdown files from uri or label', () => {
      const uriMd = { fsPath: '/path/notes.md', path: '/path/notes.md' };
      const uriTs = { fsPath: '/path/code.ts', path: '/path/code.ts' };

      assert.strictEqual(isMarkdownTab({ input: { uri: uriMd }, label: 'notes.md' }), true);
      assert.strictEqual(isMarkdownTab({ input: { uri: uriTs }, label: 'code.ts' }), false);
      assert.strictEqual(isMarkdownTab({ input: {}, label: 'todo.markdown' }), true);
    });

    it('isCoworkEditorTab detects whether tab is custom markdown editor', () => {
      assert.strictEqual(
        isCoworkEditorTab({ input: { viewType: 'agentCowork.markdownEditor' } }),
        true
      );
      assert.strictEqual(
        isCoworkEditorTab({ input: { viewType: 'default' } }),
        false
      );
      assert.strictEqual(isCoworkEditorTab({ input: {} }), false);
    });
  });

  describe('getUpdatedEditorAssociations', () => {
    it('configures all markdown patterns to "default" when disabling cowork view', () => {
      const existing = { '*.png': 'imagePreview', '*.csv': 'csvEditor' };
      const updated = getUpdatedEditorAssociations(existing, 'default');

      for (const pattern of MARKDOWN_PATTERNS) {
        assert.strictEqual(updated[pattern], 'default');
      }
      assert.strictEqual(updated['*.png'], 'imagePreview');
      assert.strictEqual(updated['*.csv'], 'csvEditor');
    });

    it('configures all markdown patterns to "agentCowork.markdownEditor" when enabling cowork view', () => {
      const existing = { '*.md': 'default' };
      const updated = getUpdatedEditorAssociations(existing, 'cowork');

      for (const pattern of MARKDOWN_PATTERNS) {
        assert.strictEqual(updated[pattern], 'agentCowork.markdownEditor');
      }
    });
  });

  describe('Status Bar Item Label & Tooltip Formatting', () => {
    it('formats English status bar text and tooltip when language is English', () => {
      vscodeMockState.languageSetting = 'en';
      assert.strictEqual(getCoworkStatusBarText(true), '$(folder-library) Cowork: On');
      assert.strictEqual(getCoworkStatusBarText(false), '$(folder-library) Cowork: Off');
      assert.strictEqual(
        getCoworkStatusBarTooltip(true),
        'Toggle Cowork View (Currently: Enabled - Click to disable)'
      );
      assert.strictEqual(
        getCoworkStatusBarTooltip(false),
        'Toggle Cowork View (Currently: Disabled - Click to enable)'
      );
    });

    it('formats German status bar text and tooltip when language is German', () => {
      vscodeMockState.languageSetting = 'de';
      assert.strictEqual(getCoworkStatusBarText(true), '$(folder-library) Cowork: An');
      assert.strictEqual(getCoworkStatusBarText(false), '$(folder-library) Cowork: Aus');
      assert.strictEqual(
        getCoworkStatusBarTooltip(true),
        'Cowork-Ansicht umschalten (Derzeit: Aktiviert - Klicken zum Deaktivieren)'
      );
      assert.strictEqual(
        getCoworkStatusBarTooltip(false),
        'Cowork-Ansicht umschalten (Derzeit: Deaktiviert - Klicken zum Aktivieren)'
      );
    });

    it('updates status bar item properties on updateCoworkStatusBarItem', () => {
      vscodeMockState.languageSetting = 'en';
      const item = createCoworkStatusBarItem();
      assert.strictEqual(item.command, 'agent-cowork.toggleCoworkView');

      updateCoworkStatusBarItem(item, true);
      assert.strictEqual(item.text, '$(folder-library) Cowork: On');
      assert(item.tooltip.includes('Enabled'));

      updateCoworkStatusBarItem(item, false);
      assert.strictEqual(item.text, '$(folder-library) Cowork: Off');
      assert(item.tooltip.includes('Disabled'));
    });
  });

  describe('Configuration State Management', () => {
    it('reads cowork view enabled state from configuration', () => {
      vscodeMockState.coworkViewSetting = true;
      assert.strictEqual(isCoworkViewEnabled(), true);

      vscodeMockState.coworkViewSetting = false;
      assert.strictEqual(isCoworkViewEnabled(), false);
    });

    it('updates configuration when calling setCoworkViewConfig', async () => {
      await setCoworkViewConfig(false);
      assert.strictEqual(vscodeMockState.configUpdates['agentCowork.coworkView'], false);

      await setCoworkViewConfig(true);
      assert.strictEqual(vscodeMockState.configUpdates['agentCowork.coworkView'], true);
    });

    it('updates editor associations in workbench config', async () => {
      await applyMarkdownEditorAssociations(false);
      assert.strictEqual(
        vscodeMockState.configUpdates['workbench.editorAssociations']['*.md'],
        'default'
      );

      await applyMarkdownEditorAssociations(true);
      assert.strictEqual(
        vscodeMockState.configUpdates['workbench.editorAssociations']['*.md'],
        'agentCowork.markdownEditor'
      );
    });
  });

  describe('switchOpenMarkdownTabs', () => {
    it('switches custom markdown editor tabs to default text editor when switching to default', async () => {
      const uri = { fsPath: '/workspace/doc.md', path: '/workspace/doc.md' };
      const customTab = {
        label: 'doc.md',
        isActive: true,
        input: { uri, viewType: 'agentCowork.markdownEditor' },
      };

      vscodeMockState.tabGroups = [
        {
          viewColumn: 1,
          tabs: [customTab],
          activeTab: customTab,
        },
      ];

      await switchOpenMarkdownTabs('default');

      // The custom tab was closed
      assert.strictEqual(vscodeMockState.closedTabs.includes(customTab), true);

      // Reopened with 'default' editor
      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith' && c.args[1] === 'default'
      );
      assert(openWithCmd, 'Expected vscode.openWith with "default"');
    });

    it('switches text editor markdown tabs to custom markdown editor when switching to cowork', async () => {
      const uri = { fsPath: '/workspace/doc.md', path: '/workspace/doc.md' };
      const textTab = {
        label: 'doc.md',
        isActive: false,
        input: { uri },
      };

      vscodeMockState.tabGroups = [
        {
          viewColumn: 1,
          tabs: [textTab],
          activeTab: undefined,
        },
      ];

      await switchOpenMarkdownTabs('cowork');

      assert.strictEqual(vscodeMockState.closedTabs.includes(textTab), true);

      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith' && c.args[1] === 'agentCowork.markdownEditor'
      );
      assert(openWithCmd, 'Expected vscode.openWith with "agentCowork.markdownEditor"');
    });
  });

  describe('applyCoworkView', () => {
    it('focuses Explorer and resets layout when disabled', async () => {
      await applyCoworkView(false);

      assert.strictEqual(vscodeMockState.contexts['agentCowork.coworkView'], false);
      assert.strictEqual(vscodeMockState.configUpdates['workbench.activityBar.location'], 'default');
      assert.strictEqual(vscodeMockState.configUpdates['breadcrumbs.enabled'], true);

      const commands = vscodeMockState.executedCommands.map((c) => c.command);
      assert(commands.includes('workbench.view.explorer'), 'Must reveal explorer');
      assert(commands.includes('workbench.files.action.focusFilesExplorer'), 'Must focus files explorer');
      assert(commands.includes('workbench.explorer.fileView.focus'), 'Must focus fileView');
    });

    it('focuses agentCowork.folderView when enabled', async () => {
      await applyCoworkView(true);

      assert.strictEqual(vscodeMockState.contexts['agentCowork.coworkView'], true);
      assert.strictEqual(vscodeMockState.configUpdates['workbench.activityBar.location'], 'hidden');

      const commands = vscodeMockState.executedCommands.map((c) => c.command);
      assert(commands.includes('agentCowork.folderView.focus'), 'Must focus agentCowork.folderView');
    });
  });

  describe('applyCoworkTheme', () => {
    it('applies Cowork theme and saves previous theme when enabled', async () => {
      const mockContext = createMockExtensionContext();
      setCoworkManagerContext(mockContext);

      vscodeMockState.configUpdates['colorTheme'] = 'Monokai';
      vscodeMockState.configUpdates['iconTheme'] = 'vs-minimal';

      await applyCoworkTheme(true);

      // Previous theme saved in globalState
      assert.strictEqual(mockContext.globalState.get('previousColorTheme'), 'Monokai');
      assert.strictEqual(mockContext.globalState.get('previousIconTheme'), 'vs-minimal');

      // Applied Agent Cowork Light and icons
      assert.strictEqual(vscodeMockState.configUpdates['colorTheme'], THEME_NAME);
      assert.strictEqual(vscodeMockState.configUpdates['iconTheme'], ICON_THEME_NAME);
    });

    it('reverts Cowork theme to previously saved theme when disabled', async () => {
      const mockContext = createMockExtensionContext();
      setCoworkManagerContext(mockContext);
      await mockContext.globalState.update('previousColorTheme', 'Solarized Light');
      await mockContext.globalState.update('previousIconTheme', 'vs-seti');

      vscodeMockState.configUpdates['colorTheme'] = THEME_NAME;
      vscodeMockState.configUpdates['iconTheme'] = ICON_THEME_NAME;

      await applyCoworkTheme(false);

      assert.strictEqual(vscodeMockState.configUpdates['colorTheme'], 'Solarized Light');
      assert.strictEqual(vscodeMockState.configUpdates['iconTheme'], 'vs-seti');
    });

    it('falls back to default VS Code themes when no previous theme was saved', async () => {
      const mockContext = createMockExtensionContext();
      setCoworkManagerContext(mockContext);

      vscodeMockState.configUpdates['colorTheme'] = THEME_NAME;
      vscodeMockState.configUpdates['iconTheme'] = ICON_THEME_NAME;

      await applyCoworkTheme(false);

      assert.strictEqual(vscodeMockState.configUpdates['colorTheme'], DEFAULT_FALLBACK_THEME);
      assert.strictEqual(vscodeMockState.configUpdates['iconTheme'], DEFAULT_FALLBACK_ICON_THEME);
    });
  });
});
