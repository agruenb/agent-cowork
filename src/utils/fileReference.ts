import * as path from 'path';

/**
 * Formats a file or folder reference path for VS Code Chat prompt input.
 * E.g., `#file:README.md`, `#file:README.md:10-25` or `#folder:docs`.
 */
export function formatFileReference(
  filePath: string,
  relativePath?: string,
  isDirectory: boolean = false,
  startLine?: number,
  endLine?: number
): string {
  const ref = relativePath || path.basename(filePath);
  const prefix = isDirectory ? '#folder:' : '#file:';
  const quoted = ref.includes(' ') ? `"${ref}"` : ref;

  if (isDirectory || startLine === undefined || startLine <= 0) {
    return `${prefix}${quoted}`;
  }

  const lineSuffix =
    endLine !== undefined && endLine > startLine
      ? `:${startLine}-${endLine}`
      : `:${startLine}`;

  return `${prefix}${quoted}${lineSuffix}`;
}

