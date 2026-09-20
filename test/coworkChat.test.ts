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

  it('formats file reference with a single line number', () => {
    const ref = formatFileReference('/workspace/project/README.md', 'README.md', false, 15);
    assert.strictEqual(ref, '#file:README.md:15');
  });

  it('formats file reference with a line range', () => {
    const ref = formatFileReference('/workspace/project/README.md', 'README.md', false, 10, 25);
    assert.strictEqual(ref, '#file:README.md:10-25');
  });

  it('formats single line when startLine equals endLine', () => {
    const ref = formatFileReference('/workspace/project/README.md', 'README.md', false, 12, 12);
    assert.strictEqual(ref, '#file:README.md:12');
  });

  it('formats quoted file reference with a line range', () => {
    const ref = formatFileReference(
      '/workspace/project/Mein Dokument.md',
      'Mein Dokument.md',
      false,
      5,
      18
    );
    assert.strictEqual(ref, '#file:"Mein Dokument.md":5-18');
  });

  it('ignores line numbers when reference is a folder', () => {
    const ref = formatFileReference('/workspace/project/docs', 'docs', true, 5, 18);
    assert.strictEqual(ref, '#folder:docs');
  });
});
