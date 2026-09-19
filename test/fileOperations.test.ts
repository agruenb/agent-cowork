import assert from 'assert';
import {
  getDuplicateName,
  getRenameSelectionRange,
  ensureDefaultExtension,
  getDefaultDatePrefix,
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

  describe('ensureDefaultExtension', () => {
    it('appends .md by default when no extension is provided', () => {
      assert.strictEqual(ensureDefaultExtension('notes'), 'notes.md');
      assert.strictEqual(ensureDefaultExtension('README'), 'README.md');
      assert.strictEqual(ensureDefaultExtension('my-task'), 'my-task.md');
      assert.strictEqual(ensureDefaultExtension('Meeting Notes 2024'), 'Meeting Notes 2024.md');
    });

    it('preserves existing .md extension', () => {
      assert.strictEqual(ensureDefaultExtension('notes.md'), 'notes.md');
      assert.strictEqual(ensureDefaultExtension('notes.MD'), 'notes.MD');
      assert.strictEqual(ensureDefaultExtension('notes.markdown'), 'notes.markdown');
    });

    it('preserves other file extensions', () => {
      assert.strictEqual(ensureDefaultExtension('script.js'), 'script.js');
      assert.strictEqual(ensureDefaultExtension('data.json'), 'data.json');
      assert.strictEqual(ensureDefaultExtension('notes.txt'), 'notes.txt');
      assert.strictEqual(ensureDefaultExtension('report.pdf'), 'report.pdf');
    });

    it('handles trailing dots without extension by appending .md', () => {
      assert.strictEqual(ensureDefaultExtension('notes.'), 'notes.md');
      assert.strictEqual(ensureDefaultExtension('notes..'), 'notes.md');
    });

    it('preserves dotfiles like .gitignore or .env', () => {
      assert.strictEqual(ensureDefaultExtension('.gitignore'), '.gitignore');
      assert.strictEqual(ensureDefaultExtension('.env'), '.env');
      assert.strictEqual(ensureDefaultExtension('.env.local'), '.env.local');
    });

    it('preserves files with multiple dots when extension is present', () => {
      assert.strictEqual(ensureDefaultExtension('archive.tar.gz'), 'archive.tar.gz');
      assert.strictEqual(ensureDefaultExtension('component.test.ts'), 'component.test.ts');
    });

    it('trims whitespace before processing', () => {
      assert.strictEqual(ensureDefaultExtension('  notes  '), 'notes.md');
      assert.strictEqual(ensureDefaultExtension('  notes.txt  '), 'notes.txt');
    });

    it('supports custom default extension', () => {
      assert.strictEqual(ensureDefaultExtension('notes', '.txt'), 'notes.txt');
      assert.strictEqual(ensureDefaultExtension('notes', 'txt'), 'notes.txt');
    });
  });

  describe('getDefaultDatePrefix', () => {
    it('formats date correctly in YYYY-MM-DD_ format', () => {
      const date = new Date(2026, 8, 18); // month index 8 is September
      assert.strictEqual(getDefaultDatePrefix(date), '2026-09-18_');
    });

    it('pads single-digit month and day with zero', () => {
      const date = new Date(2026, 0, 5); // January 5th
      assert.strictEqual(getDefaultDatePrefix(date), '2026-01-05_');
    });

    it('handles end of year correctly', () => {
      const date = new Date(2025, 11, 31); // December 31st
      assert.strictEqual(getDefaultDatePrefix(date), '2025-12-31_');
    });

    it('uses current date when no argument is provided', () => {
      const prefix = getDefaultDatePrefix();
      assert.match(prefix, /^\d{4}-\d{2}-\d{2}_$/);
    });
  });
});

