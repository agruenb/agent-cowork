/* eslint-disable @typescript-eslint/no-var-requires */
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';

const {
  PALETTE,
  LIGHT_THEME_TOKENS,
  DARK_THEME_TOKENS,
  getFilenameHue,
  hslToHex,
  getDarkShade,
  getLightShade,
  getPastelShade,
  getFilePastelColors,
  getDefaultTabColors,
  getWebviewTintShades,
} = require('../src/theme/colors');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  isDarkModeEnabled,
  setDarkModeConfig,
  getDarkModeStatusBarText,
  getDarkModeStatusBarTooltip,
  createDarkModeStatusBarItem,
  updateDarkModeStatusBarItem,
  toggleDarkMode,
  toggleCoworkView,
  isCoworkViewEnabled,
  DARK_THEME_NAME,
  THEME_NAME,
} = require('../src/coworkViewManager');

describe('Dark Mode & Central Color System', () => {
  beforeEach(() => {
    resetVscodeMock();
    vscodeMockState.languageSetting = 'de';
  });

  describe('Central Color System (src/theme/colors.ts)', () => {
    it('defines full palette scales with slate, sky, emerald, red, amber, and indigo', () => {
      assert.ok(PALETTE.slate[50]);
      assert.ok(PALETTE.slate[900]);
      assert.ok(PALETTE.slate[950]);
      assert.strictEqual(PALETTE.slate[900], '#0f172a');
      assert.strictEqual(PALETTE.common.white, '#ffffff');
      assert.strictEqual(PALETTE.sky[400], '#38bdf8');
      assert.strictEqual(PALETTE.red[500], '#ef4444');
      assert.strictEqual(PALETTE.emerald[500], '#22c55e');
    });

    it('defines semantic tokens for Light and Dark themes', () => {
      // Light Theme
      assert.strictEqual(LIGHT_THEME_TOKENS.editorBg, '#ffffff');
      assert.strictEqual(LIGHT_THEME_TOKENS.tabActiveBg, '#ffffff');
      assert.strictEqual(LIGHT_THEME_TOKENS.tabStripBg, '#e2e8f0');

      // Dark Theme
      assert.strictEqual(DARK_THEME_TOKENS.editorBg, '#0f172a');
      assert.strictEqual(DARK_THEME_TOKENS.tabActiveBg, '#0f172a');
      assert.strictEqual(DARK_THEME_TOKENS.tabStripBg, '#020617');
      assert.strictEqual(DARK_THEME_TOKENS.tabActiveFg, '#f8fafc');
    });

    it('computes deterministic hue for filenames', () => {
      const hue1 = getFilenameHue('README.md');
      const hue2 = getFilenameHue('README.md');
      const hue3 = getFilenameHue('notes.md');

      assert.strictEqual(hue1, hue2);
      assert.ok(hue1 >= 0 && hue1 < 360);
      assert.ok(hue3 >= 0 && hue3 < 360);
    });

    it('converts HSL to hex colors accurately', () => {
      const hexWhite = hslToHex(0, 0, 100);
      const hexBlack = hslToHex(0, 0, 0);
      assert.strictEqual(hexWhite.toLowerCase(), '#ffffff');
      assert.strictEqual(hexBlack.toLowerCase(), '#000000');
    });

    it('computes dark and light shades with appropriate lightness', () => {
      const darkShade = getDarkShade(200);
      const lightShade = getLightShade(200);

      assert.match(darkShade, /^#[0-9a-f]{6}$/i);
      assert.match(lightShade, /^#[0-9a-f]{6}$/i);
      assert.notStrictEqual(darkShade, lightShade);
    });

    it('derives tab colors for active files in Light and Dark mode', () => {
      const lightColors = getFilePastelColors('document.md', false);
      assert.strictEqual(lightColors['tab.activeBackground'], '#ffffff');
      assert.match(lightColors['tab.activeForeground'], /^#[0-9a-f]{6}$/i);
      assert.strictEqual(lightColors['tab.inactiveBackground'], '#e2e8f0');

      const darkColors = getFilePastelColors('document.md', true);
      assert.strictEqual(darkColors['tab.activeBackground'], '#0f172a');
      assert.match(darkColors['tab.activeForeground'], /^#[0-9a-f]{6}$/i);
      assert.strictEqual(darkColors['tab.inactiveBackground'], '#020617');
    });

    it('derives default tab colors when no file is active', () => {
      const lightDefault = getDefaultTabColors(false);
      assert.strictEqual(lightDefault['tab.activeBackground'], '#ffffff');

      const darkDefault = getDefaultTabColors(true);
      assert.strictEqual(darkDefault['tab.activeBackground'], '#0f172a');
      assert.strictEqual(darkDefault['tab.activeForeground'], '#f8fafc');
    });

    it('derives webview tint shades for Light and Dark modes', () => {
      const lightTint = getWebviewTintShades(160, false);
      assert.match(lightTint.primary, /^#[0-9a-f]{6}$/i);
      assert.strictEqual(lightTint.primaryContrast, '#ffffff');

      const darkTint = getWebviewTintShades(160, true);
      assert.match(darkTint.primary, /^#[0-9a-f]{6}$/i);
      assert.strictEqual(darkTint.primaryContrast, '#0f172a');
    });
  });

  describe('Dark Mode Configuration & Status Bar Toggle', () => {
    it('isDarkModeEnabled reads agentCowork.darkMode setting', async () => {
      assert.strictEqual(isDarkModeEnabled(), false);

      await setDarkModeConfig(true);
      assert.strictEqual(isDarkModeEnabled(), true);

      await setDarkModeConfig(false);
      assert.strictEqual(isDarkModeEnabled(), false);
    });

    it('generates localized status bar text for light and dark modes', () => {
      // German mode
      vscodeMockState.languageSetting = 'de';
      assert.strictEqual(getDarkModeStatusBarText(true), '$(color-mode) Dunkel');
      assert.strictEqual(getDarkModeStatusBarText(false), '$(color-mode) Hell');

      // English mode
      vscodeMockState.languageSetting = 'en';
      assert.strictEqual(getDarkModeStatusBarText(true), '$(color-mode) Dark');
      assert.strictEqual(getDarkModeStatusBarText(false), '$(color-mode) Light');
    });

    it('generates informative tooltips for the dark mode toggle', () => {
      vscodeMockState.languageSetting = 'de';
      assert.ok(getDarkModeStatusBarTooltip(true).includes('Aktiviert'));
      assert.ok(getDarkModeStatusBarTooltip(false).includes('Deaktiviert'));

      vscodeMockState.languageSetting = 'en';
      assert.ok(getDarkModeStatusBarTooltip(true).includes('Enabled'));
      assert.ok(getDarkModeStatusBarTooltip(false).includes('Disabled'));
    });

    it('creates dark mode status bar item with correct alignment and priority', () => {
      const item = createDarkModeStatusBarItem();
      assert.strictEqual(item.command, 'agent-cowork.toggleDarkMode');
      assert.strictEqual(item.alignment, 2); // StatusBarAlignment.Right
      assert.strictEqual(item.priority, 99);
    });

    it('updates dark mode status bar item text and tooltip', () => {
      const item = createDarkModeStatusBarItem();
      updateDarkModeStatusBarItem(item, true);
      assert.strictEqual(item.text, '$(color-mode) Dunkel');
      assert.ok(item.tooltip.includes('Aktiviert'));

      updateDarkModeStatusBarItem(item, false);
      assert.strictEqual(item.text, '$(color-mode) Hell');
      assert.ok(item.tooltip.includes('Deaktiviert'));
    });

    it('toggleDarkMode toggles state and updates status bar item', async () => {
      const item = createDarkModeStatusBarItem();
      assert.strictEqual(isDarkModeEnabled(), false);

      const newState1 = await toggleDarkMode(item);
      assert.strictEqual(newState1, true);
      assert.strictEqual(isDarkModeEnabled(), true);
      assert.strictEqual(item.text, '$(color-mode) Dunkel');

      const newState2 = await toggleDarkMode(item);
      assert.strictEqual(newState2, false);
      assert.strictEqual(isDarkModeEnabled(), false);
      assert.strictEqual(item.text, '$(color-mode) Hell');
    });

    it('toggleDarkMode applies dark theme when cowork view is active', async () => {
      vscodeMockState.coworkViewSetting = true;
      await toggleDarkMode();

      assert.strictEqual(
        vscodeMockState.configUpdates['workbench.colorTheme'],
        DARK_THEME_NAME
      );

      await toggleDarkMode();
      assert.strictEqual(
        vscodeMockState.configUpdates['workbench.colorTheme'],
        THEME_NAME
      );
    });
  });

  describe('Bottom Bar Visibility Constraint (Only shown when Cowork is active)', () => {
    it('toggleCoworkView shows dark mode status bar item when activated and hides when deactivated', async () => {
      const coworkItem = { showCalled: false, hideCalled: false };
      const darkModeItem = {
        showCalled: false,
        hideCalled: false,
        show() { this.showCalled = true; this.hideCalled = false; },
        hide() { this.hideCalled = true; this.showCalled = false; },
      };

      // Initially inactive
      vscodeMockState.coworkViewSetting = false;

      // 1. Toggle ON -> should show darkModeItem
      await toggleCoworkView(coworkItem as any, darkModeItem as any);
      assert.strictEqual(isCoworkViewEnabled(), true);
      assert.strictEqual(darkModeItem.showCalled, true);
      assert.strictEqual(darkModeItem.hideCalled, false);

      // 2. Toggle OFF -> should hide darkModeItem
      await toggleCoworkView(coworkItem as any, darkModeItem as any);
      assert.strictEqual(isCoworkViewEnabled(), false);
      assert.strictEqual(darkModeItem.hideCalled, true);
    });
  });

  describe('Theme JSON Definitions Audit', () => {
    it('themes/agent-cowork-dark.json exists and contains proper workbench and syntax definitions', () => {
      const themePath = path.resolve(__dirname, '../themes/agent-cowork-dark.json');
      assert.ok(fs.existsSync(themePath), 'Dark theme JSON file must exist');

      const content = fs.readFileSync(themePath, 'utf8');
      const json = JSON.parse(content);

      assert.strictEqual(json.name, 'Agent Cowork Dark');
      assert.strictEqual(json.type, 'dark');
      assert.strictEqual(json.colors['editor.background'], '#0f172a');
      assert.strictEqual(json.colors['editorGroupHeader.tabsBackground'], '#020617');
      assert.strictEqual(json.colors['tab.activeBackground'], '#0f172a');
      assert.strictEqual(json.colors['tab.inactiveBackground'], '#020617');
      assert.strictEqual(json.colors['tab.border'], '#00000000');
    });

    it('package.json contributes both Agent Cowork Light and Agent Cowork Dark themes', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const themes = pkg.contributes?.themes || [];
      const lightTheme = themes.find((t: any) => t.id === 'Agent Cowork Light' || t.label === 'Agent Cowork Light');
      const darkTheme = themes.find((t: any) => t.id === 'Agent Cowork Dark' || t.label === 'Agent Cowork Dark');

      assert.ok(lightTheme, 'Agent Cowork Light must be contributed');
      assert.ok(darkTheme, 'Agent Cowork Dark must be contributed');
      assert.strictEqual(darkTheme.uiTheme, 'vs-dark');
    });

    it('package.json contributes agentCowork.darkMode configuration and toggle command', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const commands = pkg.contributes?.commands || [];
      const toggleCmd = commands.find((c: any) => c.command === 'agent-cowork.toggleDarkMode');
      assert.ok(toggleCmd, 'agent-cowork.toggleDarkMode command must be contributed');

      const properties = pkg.contributes?.configuration?.properties || {};
      assert.ok(properties['agentCowork.darkMode'], 'agentCowork.darkMode setting must be defined');
      assert.strictEqual(properties['agentCowork.darkMode'].type, 'boolean');
      assert.strictEqual(properties['agentCowork.darkMode'].default, false);
    });
  });

  describe('Central CSS Variables Audit', () => {
    it('src/webview/styles/base.css defines dark mode CSS variables', () => {
      const cssPath = path.resolve(__dirname, '../src/webview/styles/base.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('body.vscode-dark'), 'base.css must include body.vscode-dark selector');
      assert.ok(css.includes('--bg: var(--vscode-editor-background, #0f172a);'), 'base.css must define dark editor background variable');
      assert.ok(css.includes('--toolbar-bg: #0b1120;'), 'base.css must define dark toolbar background variable');
      assert.ok(css.includes('--heading-1: #f8fafc;'), 'base.css must define dark heading variables');
    });
  });
});
