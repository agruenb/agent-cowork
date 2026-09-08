import * as path from 'path';

/**
 * Formats a file or folder reference path for VS Code Chat prompt input.
 * E.g., `#file:README.md` or `#folder:docs`.
 */
export function formatFileReference(
  filePath: string,
  relativePath?: string,
  isDirectory: boolean = false
): string {
  const ref = relativePath || path.basename(filePath);
  const quoted = ref.includes(' ') ? `"${ref}"` : ref;
  const prefix = isDirectory ? '#folder:' : '#file:';
  return `${prefix}${quoted}`;
}
