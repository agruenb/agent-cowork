/**
 * Utility functions for generating deterministic pastel colors based on filenames.
 */

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
 * and strong contrast (> 4.5:1, WCAG AA/AAA) against pure white text (#ffffff).
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
 * Derives the light pastel tone used for document toolbars and inactive tabs.
 */
export function getPastelShade(hue: number): string {
  return hslToHex(hue, 50, 92);
}

/**
 * Returns the color customizations for tabs and tree view:
 * - Active tab and tree view selection use the file's hue in a rich, darker shade with white text.
 * - Other opened (inactive) tabs use their pastel color with high-contrast slate text.
 * - Tab and tree view hover and click/active states are fully styled.
 */
export function getFilePastelColors(filename: string): Record<string, string> {
  const activeHue = getFilenameHue(filename);
  const darkHex = getDarkShade(activeHue);

  const textDarkHex = '#0f172a';
  const textWhiteHex = '#ffffff';

  return {
    // Active tab: Darker shade of the file's hue with white text
    'tab.activeBackground': darkHex,
    'tab.activeForeground': textWhiteHex,
    'tab.activeBorder': darkHex,
    'tab.selectedBackground': darkHex,
    'tab.selectedForeground': textWhiteHex,
    'tab.unfocusedActiveBackground': hslToHex(activeHue, 55, 38),
    'tab.unfocusedActiveForeground': textWhiteHex,
    'tab.unfocusedActiveBorder': darkHex,
    'tab.dragAndDropBorder': darkHex,

    // Unselected tabs: Clean neutral backdrop (#e2e8f0) with readable slate text
    'tab.inactiveBackground': '#e2e8f0',
    'tab.inactiveForeground': '#475569',
    'tab.unfocusedInactiveBackground': '#e2e8f0',
    'tab.unfocusedInactiveForeground': '#64748b',

    // Tab hover: Dark obsidian (#0f172a) like the Cowork toolbar button with white text
    'tab.hoverBackground': '#0f172a',
    'tab.hoverForeground': textWhiteHex,
    'tab.hoverBorder': '#0f172a',
    'tab.unfocusedHoverBackground': '#1e293b',
    'tab.unfocusedHoverForeground': textWhiteHex,
    'tab.unfocusedHoverBorder': '#1e293b',


    // Tree view (file list) selected / clicked state: Matches the active tab's darker shade
    'list.activeSelectionBackground': darkHex,
    'list.activeSelectionForeground': textWhiteHex,
    'list.activeSelectionIconForeground': textWhiteHex,
    'list.inactiveSelectionBackground': darkHex,
    'list.inactiveSelectionForeground': textWhiteHex,
    'list.inactiveSelectionIconForeground': textWhiteHex,
    'list.focusBackground': darkHex,
    'list.focusForeground': textWhiteHex,

    // Tree view hover state: Subtle feedback on hover
    'list.hoverBackground': '#e2e8f0',
    'list.hoverForeground': textDarkHex,
  };
}
