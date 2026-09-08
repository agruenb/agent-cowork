import assert from 'assert';
import { formatFileReference } from '../src/utils/fileReference';

describe('Cowork Chat - File Reference Formatting', () => {
  it('formats simple file name without spaces', () => {
    const ref = formatFileReference('/workspace/project/README.md', 'README.md');
    assert.strictEqual(ref, '#file:README.md');
  });

  it('formats nested relative path without spaces', () => {
    const ref = formatFileReference('/workspace/project/docs/guide.md', 'docs/guide.md');
    assert.strictEqual(ref, '#file:docs/guide.md');
  });

  it('wraps file path with quotes when it contains spaces', () => {
    const ref = formatFileReference('/workspace/project/Mein Dokument.md', 'Mein Dokument.md');
    assert.strictEqual(ref, '#file:"Mein Dokument.md"');
  });

  it('wraps nested path with quotes when directory or filename contains spaces', () => {
    const ref = formatFileReference('/workspace/project/notizen/meine aufgaben.md', 'notizen/meine aufgaben.md');
    assert.strictEqual(ref, '#file:"notizen/meine aufgaben.md"');
  });

  it('falls back to basename when relativePath is empty', () => {
    const ref = formatFileReference('/some/path/to/notes.md', '');
    assert.strictEqual(ref, '#file:notes.md');
  });

  it('falls back to quoted basename when relativePath is empty and filename has spaces', () => {
    const ref = formatFileReference('/some/path/to/my notes.md', '');
    assert.strictEqual(ref, '#file:"my notes.md"');
  });

  it('formats directory reference path without spaces using #folder:', () => {
    const ref = formatFileReference('/workspace/project/docs', 'docs', true);
    assert.strictEqual(ref, '#folder:docs');
  });

  it('formats directory reference path with spaces using #folder:', () => {
    const ref = formatFileReference('/workspace/project/my notes', 'my notes', true);
    assert.strictEqual(ref, '#folder:"my notes"');
  });

  it('falls back to folder basename when relativePath is empty for directory', () => {
    const ref = formatFileReference('/some/path/to/my folder', '', true);
    assert.strictEqual(ref, '#folder:"my folder"');
  });
});
