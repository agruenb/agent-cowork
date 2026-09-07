import * as path from 'path';

/**
 * Formats a file reference path for VS Code Chat prompt input.
 * E.g., `#file:README.md` or `#file:"my notes.md"`.
 */
export function formatFileReference(filePath: string, relativePath?: string): string {
  const ref = relativePath || path.basename(filePath);
  const quoted = ref.includes(' ') ? `"${ref}"` : ref;
  return `#file:${quoted}`;
}
