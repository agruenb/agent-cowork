import assert from 'assert';
import {
  getDuplicateName,
  getRenameSelectionRange,
} from '../src/utils/fileOperations';

describe('File Operations Logic', () => {
  describe('getDuplicateName', () => {
    it('creates "copy" name for a file with extension', () => {
      const existing = ['notes.md', 'todo.txt'];
      const result = getDuplicateName(existing, 'notes.md');
      assert.strictEqual(result, 'notes copy.md');
    });

    it('creates numbered "copy 2" name when "copy" already exists', () => {
      const existing = ['notes.md', 'notes copy.md'];
      const result = getDuplicateName(existing, 'notes.md');
      assert.strictEqual(result, 'notes copy 2.md');
    });

    it('creates "copy 3" name when "copy" and "copy 2" exist', () => {
      const existing = ['notes.md', 'notes copy.md', 'notes copy 2.md'];
      const result = getDuplicateName(existing, 'notes.md');
      assert.strictEqual(result, 'notes copy 3.md');
    });

    it('creates "copy" name for a folder without extension', () => {
      const existing = ['docs', 'src'];
      const result = getDuplicateName(existing, 'docs');
      assert.strictEqual(result, 'docs copy');
    });

    it('creates numbered "copy 2" name for folder when "copy" already exists', () => {
      const existing = ['docs', 'docs copy'];
      const result = getDuplicateName(existing, 'docs');
      assert.strictEqual(result, 'docs copy 2');
    });

    it('handles dotfiles properly (e.g. .gitignore)', () => {
      const existing = ['.gitignore'];
      const result = getDuplicateName(existing, '.gitignore');
      assert.strictEqual(result, '.gitignore copy');
    });

    it('handles files with multiple dots', () => {
      const existing = ['archive.tar.gz'];
      const result = getDuplicateName(existing, 'archive.tar.gz');
      assert.strictEqual(result, 'archive.tar copy.gz');
    });
  });

  describe('getRenameSelectionRange', () => {
    it('selects only the base filename excluding the extension', () => {
      const range = getRenameSelectionRange('document.md');
      assert.deepStrictEqual(range, [0, 8]);
    });

    it('selects the entire name for files without extension', () => {
      const range = getRenameSelectionRange('Makefile');
      assert.deepStrictEqual(range, [0, 8]);
    });

    it('selects the entire name for simple dotfiles', () => {
      const range = getRenameSelectionRange('.gitignore');
      assert.deepStrictEqual(range, [0, 10]);
    });

    it('selects base name up to final extension for files with multiple dots', () => {
      const range = getRenameSelectionRange('app.component.ts');
      assert.deepStrictEqual(range, [0, 13]);
    });
  });
});
