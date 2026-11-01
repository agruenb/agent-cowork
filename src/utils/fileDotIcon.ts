import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PALETTE } from '../theme/colors';
import { FileKind } from './fileKind';

let cacheDir: string | undefined;

function getCacheDir(): string {
  if (!cacheDir) {
    cacheDir = path.join(os.tmpdir(), 'agent-cowork-icons');
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
    } catch {
      // ignore in environments where directory creation might fail
    }
  }
  return cacheDir;
}

/**
 * Generates and returns an icon URI for an open file with a colored dot badge.
 */
export function getFileWithDotIconUri(
  kindOrIsMarkdown: FileKind | boolean,
  colorHex: string
): { light: vscode.Uri; dark: vscode.Uri } | undefined {
  try {
    const dir = getCacheDir();
    const cleanHex = colorHex.replace('#', '').toLowerCase();

    let kind: FileKind;
    if (typeof kindOrIsMarkdown === 'boolean') {
      kind = kindOrIsMarkdown ? 'markdown' : 'file';
    } else {
      kind = kindOrIsMarkdown;
    }

    const filePrefix = kind === 'markdown' ? 'md' : kind;
    const fileName = `${filePrefix}-dot-${cleanHex}.svg`;
    const filePath = path.join(dir, fileName);

    if (!fs.existsSync(filePath)) {
      const white = PALETTE.common.white;
      const stroke = PALETTE.slate[400];
      const fold = PALETTE.slate[200];
      const text = PALETTE.slate[500];
      const line = PALETTE.slate[300];

      let innerContent: string;
      switch (kind) {
        case 'markdown':
          innerContent = `  <text x="12" y="19" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="-0.6" fill="${text}">AI</text>`;
          break;
        case 'code':
          innerContent = `  <polyline points="9.5 12 7.5 14.5 9.5 17" fill="none" stroke="${text}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  <line x1="13" y1="11.5" x2="11" y2="17.5" stroke="${text}" stroke-width="1.3" stroke-linecap="round" />
  <polyline points="14.5 12 16.5 14.5 14.5 17" fill="none" stroke="${text}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />`;
          break;
        case 'image':
          innerContent = `  <circle cx="9.5" cy="11.5" r="1.25" fill="${text}" />
  <path d="M7.5 18 L10.5 13.5 L12.5 16 L14 14 L16.5 18 Z" fill="${fold}" stroke="${text}" stroke-width="1.2" stroke-linejoin="round" />`;
          break;
        case 'file':
        default:
          innerContent = `  <line x1="7.5" y1="11.5" x2="16.5" y2="11.5" stroke="${line}" stroke-width="1.2" stroke-linecap="round" />
  <line x1="7.5" y1="14.5" x2="16.5" y2="14.5" stroke="${line}" stroke-width="1.2" stroke-linecap="round" />
  <line x1="7.5" y1="17.5" x2="13.5" y2="17.5" stroke="${line}" stroke-width="1.2" stroke-linecap="round" />`;
          break;
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M5 3 C4.45 3 4 3.45 4 4 L4 20 C4 20.55 4.45 21 5 21 L19 21 C19.55 21 20 20.55 20 20 L20 8 L15 3 L5 3 Z" fill="${white}" stroke="${stroke}" stroke-width="1.2" />
  <path d="M14.5 3 L14.5 8 L19.5 8 Z" fill="${fold}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
${innerContent}
  <circle cx="18" cy="18" r="4.5" fill="${colorHex}" stroke="${white}" stroke-width="1.5" />
</svg>`;
      fs.writeFileSync(filePath, svg, 'utf8');
    }

    const uri = vscode.Uri.file(filePath);
    return { light: uri, dark: uri };
  } catch {
    return undefined;
  }
}
