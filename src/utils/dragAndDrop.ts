import * as path from 'path';

export const TREE_VIEW_MIME_TYPE = 'application/vnd.code.tree.agentcowork.folderview';
export const URI_LIST_MIME_TYPE = 'text/uri-list';
export const FILES_MIME_TYPE = 'files';

export const FOLDER_TREE_DROP_MIME_TYPES = [
  TREE_VIEW_MIME_TYPE,
  URI_LIST_MIME_TYPE,
  FILES_MIME_TYPE,
] as const;

export const FOLDER_TREE_DRAG_MIME_TYPES = [
  TREE_VIEW_MIME_TYPE,
  URI_LIST_MIME_TYPE,
] as const;

/**
 * Checks if childPath is identical to parentPath or a descendant subfolder.
 */
export function isSameOrDescendant(parentPath: string, childPath: string): boolean {
  const rel = path.relative(parentPath, childPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface DropTargetCandidate {
  fsPath: string;
  isDirectory: boolean;
}

/**
 * Resolves the destination directory file path given a drop target.
 * If target is undefined -> default root path.
 * If target is a directory -> target's path.
 * If target is a file -> parent directory of target.
 */
export function resolveDropTargetDirectory(
  target: DropTargetCandidate | undefined,
  defaultRootFsPath: string
): string {
  if (!target) {
    return defaultRootFsPath;
  }
  if (target.isDirectory) {
    return target.fsPath;
  }
  return path.dirname(target.fsPath);
}

/**
 * Formats a list of file URIs into a text/uri-list payload (RFC 2483).
 */
export function formatUriList(uris: string[]): string {
  return uris.join('\r\n');
}

/**
 * Parses a text/uri-list payload into an array of URI strings, ignoring empty lines and comments.
 */
export function parseUriList(uriListContent: string): string[] {
  return uriListContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
