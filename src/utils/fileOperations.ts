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
