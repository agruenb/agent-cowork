import assert from 'assert';
import * as path from 'path';
import {
  isSameOrDescendant,
  resolveDropTargetDirectory,
  formatUriList,
  parseUriList,
  TREE_VIEW_MIME_TYPE,
  URI_LIST_MIME_TYPE,
  FILES_MIME_TYPE,
  FOLDER_TREE_DRAG_MIME_TYPES,
  FOLDER_TREE_DROP_MIME_TYPES,
} from '../src/utils/dragAndDrop';

describe('Folder Tree - Drag & Drop Logic', () => {
  describe('isSameOrDescendant', () => {
    it('returns true when candidate path is identical to parent path', () => {
      const parent = path.normalize('/workspace/project/folder');
      const child = path.normalize('/workspace/project/folder');
      assert.strictEqual(isSameOrDescendant(parent, child), true);
    });

    it('returns true for immediate child folder', () => {
      const parent = path.normalize('/workspace/project/folder');
      const child = path.normalize('/workspace/project/folder/subfolder');
      assert.strictEqual(isSameOrDescendant(parent, child), true);
    });

    it('returns true for deeply nested descendant folder', () => {
      const parent = path.normalize('/workspace/project');
      const child = path.normalize('/workspace/project/a/b/c/d');
      assert.strictEqual(isSameOrDescendant(parent, child), true);
    });

    it('returns false when folder names share prefix but are siblings', () => {
      const parent = path.normalize('/workspace/project/docs');
      const sibling = path.normalize('/workspace/project/docs-backup');
      assert.strictEqual(isSameOrDescendant(parent, sibling), false);
    });

    it('returns false for unrelated sibling folders', () => {
      const parent = path.normalize('/workspace/project/src');
      const sibling = path.normalize('/workspace/project/dist');
      assert.strictEqual(isSameOrDescendant(parent, sibling), false);
    });

    it('returns false when candidate is an ancestor of parent', () => {
      const parent = path.normalize('/workspace/project/src/components');
      const ancestor = path.normalize('/workspace/project/src');
      assert.strictEqual(isSameOrDescendant(parent, ancestor), false);
    });
  });

  describe('resolveDropTargetDirectory', () => {
    const defaultRoot = path.normalize('/workspace/my-project');

    it('resolves undefined target to default workspace root directory', () => {
      const targetDir = resolveDropTargetDirectory(undefined, defaultRoot);
      assert.strictEqual(targetDir, defaultRoot);
    });

    it('resolves directory target directly to directory path', () => {
      const folderPath = path.normalize('/workspace/my-project/subfolder');
      const target = { fsPath: folderPath, isDirectory: true };
      const targetDir = resolveDropTargetDirectory(target, defaultRoot);
      assert.strictEqual(targetDir, folderPath);
    });

    it('resolves file target to parent directory of the file', () => {
      const filePath = path.normalize('/workspace/my-project/subfolder/README.md');
      const target = { fsPath: filePath, isDirectory: false };
      const targetDir = resolveDropTargetDirectory(target, defaultRoot);
      assert.strictEqual(targetDir, path.dirname(filePath));
    });
  });

  describe('MIME Types & URI List Serialization', () => {
    it('defines correct tree and external drop MIME types', () => {
      assert.strictEqual(
        TREE_VIEW_MIME_TYPE,
        'application/vnd.code.tree.agentcowork.folderview'
      );
      assert.strictEqual(URI_LIST_MIME_TYPE, 'text/uri-list');
      assert.strictEqual(FILES_MIME_TYPE, 'files');

      assert.deepStrictEqual(FOLDER_TREE_DRAG_MIME_TYPES, [
        TREE_VIEW_MIME_TYPE,
        URI_LIST_MIME_TYPE,
      ]);
      assert.deepStrictEqual(FOLDER_TREE_DROP_MIME_TYPES, [
        TREE_VIEW_MIME_TYPE,
        URI_LIST_MIME_TYPE,
        FILES_MIME_TYPE,
      ]);
    });

    it('formats and parses text/uri-list according to RFC 2483', () => {
      const uris = [
        'file:///workspace/doc1.md',
        'file:///workspace/folder/doc2.md',
      ];
      const payload = formatUriList(uris);
      assert.strictEqual(payload, uris.join('\r\n'));

      const parsed = parseUriList(
        `# Comment line\r\nfile:///workspace/doc1.md\r\n\r\n# Another comment\nfile:///workspace/folder/doc2.md\n`
      );
      assert.deepStrictEqual(parsed, uris);
    });
  });
});
