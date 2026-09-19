import * as path from 'path';

/**
 * Computes the next available duplicate name for a file or folder in a directory.
 * E.g., "notes.md" -> "notes copy.md" -> "notes copy 2.md"
 * E.g., "folder" -> "folder copy" -> "folder copy 2"
 * E.g., ".gitignore" -> ".gitignore copy" -> ".gitignore copy 2"
 */
export function getDuplicateName(
  existingNames: string[] | Set<string>,
  originalName: string
): string {
  const namesSet = existingNames instanceof Set ? existingNames : new Set(existingNames);

  let base: string;
  let ext: string;

  if (originalName.startsWith('.') && !originalName.slice(1).includes('.')) {
    base = originalName;
    ext = '';
  } else {
    ext = path.extname(originalName);
    base = path.basename(originalName, ext);
  }

  let candidate = `${base} copy${ext}`;
  if (!namesSet.has(candidate)) {
    return candidate;
  }

  let count = 2;
  while (count < 10000) {
    candidate = `${base} copy ${count}${ext}`;
    if (!namesSet.has(candidate)) {
      return candidate;
    }
    count++;
  }

  return `${base} copy ${Date.now()}${ext}`;
}

/**
 * Calculates the initial selection range for renaming a file.
 * Excludes the file extension so only the base filename is selected.
 */
export function getRenameSelectionRange(filename: string): [number, number] {
  if (filename.startsWith('.') && !filename.slice(1).includes('.')) {
    return [0, filename.length];
  }
  const ext = path.extname(filename);
  const end = ext ? filename.length - ext.length : filename.length;
  return [0, end > 0 ? end : filename.length];
}

/**
 * Ensures that a filename has a file extension. If no file extension is given,
 * appends the default extension (defaults to '.md').
 *
 * Examples:
 * - "notes" -> "notes.md"
 * - "notes.md" -> "notes.md"
 * - "notes.txt" -> "notes.txt"
 * - "notes." -> "notes.md"
 * - ".gitignore" -> ".gitignore" (simple dotfiles without extension are preserved)
 * - "archive.tar.gz" -> "archive.tar.gz"
 */
export function ensureDefaultExtension(filename: string, defaultExt: string = '.md'): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalizedExt = defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`;

  // If the filename ends with one or more trailing dots (e.g. "notes."), replace trailing dots with the default extension
  if (trimmed.endsWith('.')) {
    const withoutTrailingDots = trimmed.replace(/\.+$/, '');
    if (!withoutTrailingDots) {
      return trimmed;
    }
    return `${withoutTrailingDots}${normalizedExt}`;
  }

  // Preserve dotfiles like ".gitignore" or ".env"
  if (trimmed.startsWith('.') && !trimmed.slice(1).includes('.')) {
    return trimmed;
  }

  const ext = path.extname(trimmed);
  if (!ext) {
    return `${trimmed}${normalizedExt}`;
  }

  return trimmed;
}

/**
 * Returns the default date prefix for new files in the format "YYYY-MM-DD_".
 */
export function getDefaultDatePrefix(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}_`;
}

