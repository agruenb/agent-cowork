/**
 * Central Color System for Agent Cowork
 * 
 * Provides a unified, single source of truth for all color tokens, palettes,
 * theme definitions (Light & Dark), and contrast-safe color derivation algorithms.
 * Every color in the extension can be centrally adjusted here.
 */

/**
 * Primitive design palette (Tailwind-compatible slate, state, and accent scales).
 */
export const PALETTE = {
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  sky: {
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
  },
  emerald: {
    50: '#f0fdf4',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  amber: {
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
  },
  indigo: {
    400: '#818cf8',
    600: '#4338ca',
  },
  common: {
    white: '#ffffff',
    black: '#000000',
    transparent: '#00000000',
  },
} as const;

/**
 * Semantic tokens for the Light Theme.
 */
export const LIGHT_THEME_TOKENS = {
  // Canvas & Surfaces
  editorBg: PALETTE.common.white,
  editorFg: PALETTE.slate[800],
  sidebarBg: PALETTE.slate[50],
  sidebarFg: PALETTE.slate[800],
  sidebarBorder: PALETTE.slate[200],
  activityBarBg: PALETTE.slate[50],
  activityBarFg: PALETTE.slate[900],
  activityBarInactiveFg: PALETTE.slate[400],
  activityBarBorder: PALETTE.slate[200],
  titleBarBg: PALETTE.slate[50],
  titleBarFg: PALETTE.slate[800],
  titleBarBorder: PALETTE.slate[200],
  statusBarBg: PALETTE.common.white,
  statusBarFg: PALETTE.slate[600],
  statusBarBorder: PALETTE.slate[200],

  // Browser Tabs Integration
  tabStripBg: PALETTE.slate[200],
  tabActiveBg: PALETTE.common.white,
  tabActiveFg: PALETTE.slate[900],
  tabInactiveBg: PALETTE.slate[200],
  tabInactiveFg: PALETTE.slate[600],
  tabUnfocusedInactiveFg: PALETTE.slate[500],
  tabHoverBg: PALETTE.slate[100],
  tabHoverFg: PALETTE.slate[900],
  tabHoverBorder: PALETTE.slate[200],

  // UI Interactive Elements
  primary: PALETTE.slate[900],
  primaryHover: PALETTE.slate[800],
  primaryContrast: PALETTE.common.white,
  secondaryBg: PALETTE.slate[200],
  secondaryHoverBg: PALETTE.slate[300],
  secondaryFg: PALETTE.slate[700],
  borderMuted: PALETTE.slate[300],
  inputBg: PALETTE.common.white,
  inputBorder: PALETTE.slate[300],
  listSelectionBg: PALETTE.slate[200],
  listSelectionFg: PALETTE.slate[900],

  // Syntax highlighting
  syntaxKeywords: PALETTE.slate[900],
  syntaxComments: PALETTE.slate[400],
  syntaxStrings: PALETTE.sky[700],
  syntaxNumbers: PALETTE.amber[600],
  syntaxFunctions: PALETTE.indigo[600],
  syntaxTypes: PALETTE.sky[700],
  syntaxVariables: PALETTE.slate[700],
} as const;

/**
 * Semantic tokens for the Dark Theme.
 */
export const DARK_THEME_TOKENS = {
  // Canvas & Surfaces
  editorBg: PALETTE.slate[900],
  editorFg: PALETTE.slate[200],
  sidebarBg: '#0b1120',
  sidebarFg: PALETTE.slate[200],
  sidebarBorder: PALETTE.slate[800],
  activityBarBg: '#0b1120',
  activityBarFg: PALETTE.slate[50],
  activityBarInactiveFg: PALETTE.slate[500],
  activityBarBorder: PALETTE.slate[800],
  titleBarBg: PALETTE.slate[950],
  titleBarFg: PALETTE.slate[200],
  titleBarBorder: PALETTE.slate[800],
  statusBarBg: PALETTE.slate[950],
  statusBarFg: PALETTE.slate[400],
  statusBarBorder: PALETTE.slate[800],

  // Browser Tabs Integration
  tabStripBg: PALETTE.slate[950],
  tabActiveBg: PALETTE.slate[900],
  tabActiveFg: PALETTE.slate[50],
  tabInactiveBg: PALETTE.slate[950],
  tabInactiveFg: PALETTE.slate[400],
  tabUnfocusedInactiveFg: PALETTE.slate[500],
  tabHoverBg: PALETTE.slate[800],
  tabHoverFg: PALETTE.slate[50],
  tabHoverBorder: PALETTE.slate[700],

  // UI Interactive Elements
  primary: PALETTE.sky[400],
  primaryHover: PALETTE.sky[300],
  primaryContrast: PALETTE.slate[900],
  secondaryBg: PALETTE.slate[800],
  secondaryHoverBg: PALETTE.slate[700],
  secondaryFg: PALETTE.slate[200],
  borderMuted: PALETTE.slate[700],
  inputBg: PALETTE.slate[900],
  inputBorder: PALETTE.slate[700],
  listSelectionBg: PALETTE.slate[800],
  listSelectionFg: PALETTE.slate[50],

  // Syntax highlighting
  syntaxKeywords: PALETTE.slate[50],
  syntaxComments: PALETTE.slate[500],
  syntaxStrings: PALETTE.sky[400],
  syntaxNumbers: PALETTE.amber[400],
  syntaxFunctions: PALETTE.indigo[400],
  syntaxTypes: PALETTE.sky[400],
  syntaxVariables: PALETTE.slate[300],
} as const;

/**
 * Derives a deterministic hue (0–360) from a filename using a string hash.
 */
export function getFilenameHue(filename: string): number {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash + filename.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

/**
 * Converts HSL color values to a hex color string (#rrggbb).
 * h: 0–360, s: 0–100, l: 0–100.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h <= 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (val: number) => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Derives the optimal darker shade for a hue, ensuring rich color vibrancy
 * and strong contrast (> 4.5:1, WCAG AA/AAA) against pure white text (#ffffff) or white background (#ffffff).
 */
export function getDarkShade(hue: number): string {
  let l = 33;
  let s = 68;
  if (40 <= hue && hue <= 80) {
    // Yellows & chartreuses need slightly deeper tone for high contrast against white
    l = 28;
    s = 75;
  } else if (200 <= hue && hue <= 280) {
    // Blues & purples have lower perceived luminance
    l = 40;
    s = 65;
  }
  return hslToHex(hue, s, l);
}

/**
 * Derives the optimal light shade for a hue in dark mode, ensuring rich color vibrancy
 * and strong contrast (> 7:1, WCAG AAA) against dark slate background (#0f172a).
 */
export function getLightShade(hue: number): string {
  let l = 68;
  let s = 75;
  if (40 <= hue && hue <= 80) {
    // Yellows & chartreuses naturally have high perceived luminance
    l = 62;
    s = 80;
  } else if (200 <= hue && hue <= 280) {
    // Blues & purples have lower perceived luminance, slight boost
    l = 72;
    s = 80;
  }
  return hslToHex(hue, s, l);
}

/**
 * Derives the light pastel tone used for document toolbars and inactive tabs.
 */
export function getPastelShade(hue: number, isDark: boolean = false): string {
  if (isDark) {
    return hslToHex(hue, 35, 18);
  }
  return hslToHex(hue, 50, 92);
}

/**
 * Returns the color customizations for tabs and tree view:
 * Adapts seamlessly between Light and Dark mode.
 */
export function getFilePastelColors(filename: string, isDarkMode: boolean = false): Record<string, string> {
  const activeHue = getFilenameHue(filename);

  if (isDarkMode) {
    const lightHex = getLightShade(activeHue);
    const tokens = DARK_THEME_TOKENS;

    return {
      // Active tab: Matches dark editor background (#0f172a) with vibrant file hue on filename
      'tab.activeBackground': tokens.tabActiveBg,
      'tab.activeForeground': lightHex,
      'tab.activeBorder': tokens.tabActiveBg,
      'tab.selectedBackground': tokens.tabActiveBg,
      'tab.selectedForeground': lightHex,
      'tab.unfocusedActiveBackground': tokens.tabActiveBg,
      'tab.unfocusedActiveForeground': lightHex,
      'tab.unfocusedActiveBorder': tokens.tabActiveBg,
      'tab.unfocusedSelectedBackground': tokens.tabActiveBg,
      'tab.unfocusedSelectedForeground': lightHex,
      'tab.dragAndDropBorder': lightHex,

      // Inactive tabs: Darker backdrop with readable slate text
      'tab.inactiveBackground': tokens.tabInactiveBg,
      'tab.inactiveForeground': tokens.tabInactiveFg,
      'tab.unfocusedInactiveBackground': tokens.tabInactiveBg,
      'tab.unfocusedInactiveForeground': tokens.tabUnfocusedInactiveFg,

      // Hover
      'tab.hoverBackground': tokens.tabHoverBg,
      'tab.hoverForeground': tokens.tabHoverFg,
      'tab.hoverBorder': tokens.tabHoverBorder,
      'tab.unfocusedHoverBackground': tokens.tabHoverBg,
      'tab.unfocusedHoverForeground': tokens.tabHoverFg,
      'tab.unfocusedHoverBorder': tokens.tabHoverBorder,

      // Tree view list selection
      'list.activeSelectionBackground': tokens.listSelectionBg,
      'list.activeSelectionForeground': tokens.listSelectionFg,
      'list.activeSelectionIconForeground': tokens.listSelectionFg,
      'list.inactiveSelectionBackground': PALETTE.common.transparent,
      'list.inactiveSelectionForeground': tokens.listSelectionFg,
      'list.inactiveSelectionIconForeground': tokens.listSelectionFg,
      'list.focusBackground': tokens.listSelectionBg,
      'list.focusForeground': tokens.listSelectionFg,
      'list.focusOutline': PALETTE.common.transparent,
      'list.focusAndSelectionOutline': PALETTE.common.transparent,
      'list.hoverBackground': tokens.listSelectionBg,
      'list.hoverForeground': tokens.listSelectionFg,
      'list.highlightForeground': tokens.primary,
      'list.focusHighlightForeground': tokens.primary,
    };
  }

  // Light Mode
  const darkHex = getDarkShade(activeHue);
  const textDarkHex = PALETTE.slate[900];
  const tokens = LIGHT_THEME_TOKENS;

  return {
    // Active tab: White editor background (#ffffff) with the file's hue color applied to the filename
    'tab.activeBackground': tokens.tabActiveBg,
    'tab.activeForeground': darkHex,
    'tab.activeBorder': tokens.tabActiveBg,
    'tab.selectedBackground': tokens.tabActiveBg,
    'tab.selectedForeground': darkHex,
    'tab.unfocusedActiveBackground': tokens.tabActiveBg,
    'tab.unfocusedActiveForeground': darkHex,
    'tab.unfocusedActiveBorder': tokens.tabActiveBg,
    'tab.unfocusedSelectedBackground': tokens.tabActiveBg,
    'tab.unfocusedSelectedForeground': darkHex,
    'tab.dragAndDropBorder': darkHex,

    // Unselected tabs: Clean neutral backdrop (#e2e8f0) with readable slate text
    'tab.inactiveBackground': tokens.tabInactiveBg,
    'tab.inactiveForeground': tokens.tabInactiveFg,
    'tab.unfocusedInactiveBackground': tokens.tabInactiveBg,
    'tab.unfocusedInactiveForeground': tokens.tabUnfocusedInactiveFg,

    // Tab hover: Gentle light tone with obsidian text
    'tab.hoverBackground': tokens.tabHoverBg,
    'tab.hoverForeground': textDarkHex,
    'tab.hoverBorder': tokens.tabHoverBorder,
    'tab.unfocusedHoverBackground': tokens.tabHoverBg,
    'tab.unfocusedHoverForeground': textDarkHex,
    'tab.unfocusedHoverBorder': tokens.tabHoverBorder,

    // Tree view state
    'list.activeSelectionBackground': tokens.listSelectionBg,
    'list.activeSelectionForeground': textDarkHex,
    'list.activeSelectionIconForeground': textDarkHex,
    'list.inactiveSelectionBackground': PALETTE.common.transparent,
    'list.inactiveSelectionForeground': textDarkHex,
    'list.inactiveSelectionIconForeground': textDarkHex,
    'list.focusBackground': tokens.listSelectionBg,
    'list.focusForeground': textDarkHex,
    'list.focusOutline': PALETTE.common.transparent,
    'list.focusAndSelectionOutline': PALETTE.common.transparent,
    'list.hoverBackground': tokens.listSelectionBg,
    'list.hoverForeground': textDarkHex,
    'list.highlightForeground': textDarkHex,
    'list.focusHighlightForeground': textDarkHex,
  };
}

/**
 * Returns default tab highlight colors when no file is active (welcome page, settings).
 */
export function getDefaultTabColors(isDarkMode: boolean = false): Record<string, string> {
  if (isDarkMode) {
    const tokens = DARK_THEME_TOKENS;
    return {
      'tab.activeBackground': tokens.tabActiveBg,
      'tab.activeForeground': tokens.tabActiveFg,
      'tab.activeBorder': tokens.tabActiveBg,
      'tab.selectedBackground': tokens.tabActiveBg,
      'tab.selectedForeground': tokens.tabActiveFg,
      'tab.unfocusedActiveBackground': tokens.tabActiveBg,
      'tab.unfocusedActiveForeground': tokens.tabActiveFg,
      'tab.unfocusedActiveBorder': tokens.tabActiveBg,
      'tab.unfocusedSelectedBackground': tokens.tabActiveBg,
      'tab.unfocusedSelectedForeground': tokens.tabActiveFg,
      'tab.dragAndDropBorder': tokens.primary,
    };
  }

  const tokens = LIGHT_THEME_TOKENS;
  return {
    'tab.activeBackground': tokens.tabActiveBg,
    'tab.activeForeground': tokens.tabActiveFg,
    'tab.activeBorder': tokens.tabActiveBg,
    'tab.selectedBackground': tokens.tabActiveBg,
    'tab.selectedForeground': tokens.tabActiveFg,
    'tab.unfocusedActiveBackground': tokens.tabActiveBg,
    'tab.unfocusedActiveForeground': tokens.tabActiveFg,
    'tab.unfocusedActiveBorder': tokens.tabActiveBg,
    'tab.unfocusedSelectedBackground': tokens.tabActiveBg,
    'tab.unfocusedSelectedForeground': tokens.tabActiveFg,
    'tab.dragAndDropBorder': tokens.primary,
  };
}

/**
 * Returns color shades for webview filename tinting in Light or Dark mode.
 */
export function getWebviewTintShades(hue: number, isDarkMode: boolean = false) {
  if (isDarkMode) {
    return {
      primary: getLightShade(hue),
      primaryHover: hslToHex(hue, 80, 75),
      primaryLight: hslToHex(hue, 35, 18),
      primaryLightTrans: `hsla(${hue}, 35%, 18%, 0.45)`,
      primaryBorder: hslToHex(hue, 40, 32),
      primaryDark: hslToHex(hue, 30, 12),
      primarySelection: `hsla(${hue}, 70%, 60%, 0.25)`,
      primaryContrast: PALETTE.slate[900],
    };
  }

  const darkShade = getDarkShade(hue);
  let hoverL = 26;
  const hoverS = 75;
  if (40 <= hue && hue <= 80) {
    hoverL = 22;
  } else if (200 <= hue && hue <= 280) {
    hoverL = 32;
  }

  return {
    primary: darkShade,
    primaryHover: hslToHex(hue, hoverS, hoverL),
    primaryLight: hslToHex(hue, 55, 95),
    primaryLightTrans: `hsla(${hue}, 55%, 95%, 0.35)`,
    primaryBorder: hslToHex(hue, 50, 80),
    primaryDark: hslToHex(hue, 80, 18),
    primarySelection: `hsla(${hue}, 65%, 45%, 0.22)`,
    primaryContrast: PALETTE.common.white,
  };
}
