/**
 * Mode Toggle Test Suite
 * ======================
 *
 * Tests the data flow when switching between Raw Markdown mode and
 * Formatted (contenteditable) mode in the editor.
 *
 * WHY: The mode toggle converts DOM → Markdown (when entering raw mode)
 * and Markdown → HTML (when returning to formatted mode). Any data loss,
 * duplication, or corruption during these transitions causes user-visible
 * bugs — disappearing content, duplicated text, or broken formatting.
 *
 * PATTERN: Each test simulates the toggle flow:
 *   1. Start with markdown → render to DOM (formatted mode)
 *   2. Serialize DOM → markdown (switch to raw mode)
 *   3. Parse markdown → render to DOM (switch back to formatted mode)
 *   4. Serialize again → assert no data loss
 *
 * EXPANDING: Add tests for any new block type or formatting feature,
 * and for any observed content corruption during mode switching.
 */

import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';

describe('Mode Toggle (Raw ↔ Formatted)', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div><textarea id="raw-textarea"></textarea></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  /** Simulates: formatted mode → raw mode (serialize DOM to markdown) */
  function toRawMode(editor: HTMLElement): string {
    return domToMarkdown(editor);
  }

  /** Simulates: raw mode → formatted mode (parse markdown to HTML, set in editor) */
  function toFormattedMode(editor: HTMLElement, markdown: string): void {
    editor.innerHTML = markdownToHtml(markdown);
  }

  /** Full cycle: markdown → formatted → raw → formatted → raw, returns final markdown */
  function fullToggleCycle(inputMd: string): { afterFirstRaw: string; afterSecondRaw: string } {
    const editor = document.getElementById('editor')!;

    // Initial render (formatted mode)
    toFormattedMode(editor, inputMd);

    // Switch to raw mode
    const afterFirstRaw = toRawMode(editor).trim();

    // Switch back to formatted mode
    toFormattedMode(editor, afterFirstRaw);

    // Switch to raw mode again
    const afterSecondRaw = toRawMode(editor).trim();

    return { afterFirstRaw, afterSecondRaw };
  }

  // -------------------------------------------------------------------
  // BASIC MODE SWITCHING
  // Verifies that switching between modes preserves content for
  // different types of markdown content.
  // -------------------------------------------------------------------
  describe('Basic mode switching', () => {
    it('simple paragraph survives formatted → raw → formatted → raw', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('Hello world');
      assert.strictEqual(afterFirstRaw, 'Hello world');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('heading survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('# My Heading');
      assert.strictEqual(afterFirstRaw, '# My Heading');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('bullet list survives mode toggle', () => {
      const input = '- Item 1\n- Item 2\n- Item 3';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('nested list survives mode toggle', () => {
      const input = '- Parent\n  - Child 1\n  - Child 2';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('task list survives mode toggle', () => {
      const input = '- [ ] Todo\n- [x] Done';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('ordered list survives mode toggle', () => {
      const input = '1. First\n2. Second\n3. Third';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('code block survives mode toggle', () => {
      const input = '```js\nconsole.log("hello")\n```';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('blockquote survives mode toggle', () => {
      const input = '> This is a quote';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('horizontal rule survives mode toggle', () => {
      const input = 'Before\n\n---\n\nAfter';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('table survives mode toggle', () => {
      const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);
      assert.strictEqual(afterFirstRaw, input);
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });
  });

  // -------------------------------------------------------------------
  // INLINE FORMATTING PRESERVATION
  // Verifies that bold, italic, code, links survive mode switching.
  // -------------------------------------------------------------------
  describe('Inline formatting preservation', () => {
    it('bold text survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('Hello **bold** world');
      assert.strictEqual(afterFirstRaw, 'Hello **bold** world');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('italic text survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('Hello *italic* world');
      assert.strictEqual(afterFirstRaw, 'Hello *italic* world');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('inline code survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('Use `console.log()` here');
      assert.strictEqual(afterFirstRaw, 'Use `console.log()` here');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('strikethrough survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('This is ~~deleted~~ text');
      assert.strictEqual(afterFirstRaw, 'This is ~~deleted~~ text');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('link survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('Visit [Example](https://example.com)');
      assert.strictEqual(afterFirstRaw, 'Visit [Example](https://example.com)');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });
  });

  // -------------------------------------------------------------------
  // EMPTY / MINIMAL DOCUMENTS
  // Edge cases where mode toggling on empty or near-empty content
  // might produce phantom elements or crash.
  // -------------------------------------------------------------------
  describe('Empty and minimal documents', () => {
    it('empty document survives mode toggle without phantom content', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('');
      assert.strictEqual(afterFirstRaw, '');
      assert.strictEqual(afterSecondRaw, '');
    });

    it('single character survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('x');
      assert.strictEqual(afterFirstRaw, 'x');
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('single newline survives mode toggle', () => {
      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle('\n');
      // May normalize to empty
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });
  });

  // -------------------------------------------------------------------
  // COMPLEX DOCUMENTS
  // Tests mode toggle on documents with multiple block types and
  // formatting, simulating real-world usage.
  // -------------------------------------------------------------------
  describe('Complex documents', () => {
    it('full document with all block types survives mode toggle', () => {
      /**
       * A realistic document with headings, paragraphs, lists, code blocks,
       * tables, blockquotes, horizontal rules, and inline formatting.
       */
      const input = [
        '# Main Title',
        '',
        'This is a **bold** paragraph with *italic* and `code`.',
        '',
        '## Section',
        '',
        '- Bullet 1',
        '  - Nested bullet',
        '- Bullet 2',
        '',
        '1. Step one',
        '2. Step two',
        '',
        '- [ ] Todo item',
        '- [x] Done item',
        '',
        '```python',
        'print("hello")',
        '```',
        '',
        '> A wise quote',
        '',
        '| Col A | Col B |',
        '| --- | --- |',
        '| Data 1 | Data 2 |',
        '',
        '---',
      ].join('\n');

      const { afterFirstRaw, afterSecondRaw } = fullToggleCycle(input);

      // Verify key content is preserved
      assert.ok(afterFirstRaw.includes('# Main Title'));
      assert.ok(afterFirstRaw.includes('**bold**'));
      assert.ok(afterFirstRaw.includes('*italic*'));
      assert.ok(afterFirstRaw.includes('`code`'));
      assert.ok(afterFirstRaw.includes('- Bullet 1'));
      assert.ok(afterFirstRaw.includes('  - Nested bullet'));
      assert.ok(afterFirstRaw.includes('1. Step one'));
      assert.ok(afterFirstRaw.includes('- [ ] Todo item'));
      assert.ok(afterFirstRaw.includes('- [x] Done item'));
      assert.ok(afterFirstRaw.includes('```python'));
      assert.ok(afterFirstRaw.includes('> A wise quote'));
      assert.ok(afterFirstRaw.includes('| Col A | Col B |'));
      assert.ok(afterFirstRaw.includes('---'));

      // Verify second toggle produces identical output
      assert.strictEqual(afterSecondRaw, afterFirstRaw);
    });

    it('document edited in raw mode then toggled back preserves edits', () => {
      /**
       * Simulates: user starts in formatted mode, switches to raw, makes
       * an edit in the raw textarea, then switches back.
       */
      const editor = document.getElementById('editor')!;

      // Start in formatted mode
      toFormattedMode(editor, '# Original\n\nParagraph');

      // Switch to raw mode
      let rawMd = toRawMode(editor).trim();
      assert.ok(rawMd.includes('# Original'));

      // Simulate raw edit: user changes the heading
      rawMd = rawMd.replace('# Original', '# Edited');

      // Switch back to formatted mode
      toFormattedMode(editor, rawMd);

      // Verify the edit is reflected
      const finalMd = toRawMode(editor).trim();
      assert.ok(finalMd.includes('# Edited'));
      assert.ok(finalMd.includes('Paragraph'));
      assert.ok(!finalMd.includes('# Original'));
    });
  });
});
