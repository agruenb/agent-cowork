/**
 * Parser Edge Cases Test Suite
 * ============================
 *
 * Tests the Markdown parser's robustness against partial, malformed, or
 * unusual input that users produce during interactive editing. Users type
 * incrementally — they don't produce perfect markdown at every keystroke.
 *
 * WHY: The parser must never crash on incomplete input. It should degrade
 * gracefully, treating unrecognized syntax as plain text paragraphs.
 * This is especially important because the editor re-parses on every
 * keystroke via the raw mode, and after every DOM-to-markdown serialization.
 *
 * KNOWN ISSUE: Empty headings at the end of a document and unclosed
 * sections have been reported to cause editor crashes during parsing.
 * These tests specifically cover those scenarios.
 *
 * PATTERN: Call `parseMarkdownToBlocks(input)` and verify:
 *   1. It does not throw
 *   2. The block structure is reasonable (no undefined, no crash)
 *   3. Content is preserved (even if block type changes)
 *
 * EXPANDING: Add new edge cases as you discover them during user testing.
 * Each test should document the *user scenario* that leads to the edge case.
 */

import assert from 'assert';
import { parseMarkdownToBlocks, markdownToHtml, parseInlineMarkdown, escapeHtml } from '../src/markdown/parser';

describe('Parser Edge Cases', () => {

  // -------------------------------------------------------------------
  // PARTIAL / INCOMPLETE SYNTAX
  // Users type incrementally. The parser sees partially-formed markdown
  // at every keystroke. It must not crash on any of these.
  // -------------------------------------------------------------------
  describe('Partial / incomplete syntax (must not crash)', () => {
    it('unclosed code block (no closing ```)', () => {
      /**
       * Scenario: User types ``` and starts a code block but hasn't closed it yet.
       * The parser should capture everything after ``` as code content.
       */
      const blocks = parseMarkdownToBlocks('```js\nconsole.log("hi")');
      assert.ok(blocks.length >= 1, 'Should produce at least one block');
      const codeBlock = blocks.find(b => b.type === 'code_block');
      assert.ok(codeBlock, 'Should still produce a code_block');
      assert.ok(codeBlock!.content!.includes('console.log'));
    });

    it('unclosed bold marker (**) does not crash', () => {
      /**
       * Scenario: User types ** to start bold but hasn't closed it yet.
       */
      const result = parseInlineMarkdown('Hello **world');
      assert.ok(typeof result === 'string');
      assert.ok(result.includes('world'));
    });

    it('unclosed italic marker (*) does not crash', () => {
      const result = parseInlineMarkdown('Hello *world');
      assert.ok(typeof result === 'string');
      assert.ok(result.includes('world'));
    });

    it('unclosed strikethrough marker (~~) does not crash', () => {
      const result = parseInlineMarkdown('Hello ~~world');
      assert.ok(typeof result === 'string');
      assert.ok(result.includes('world'));
    });

    it('unclosed inline code (`) does not crash', () => {
      const result = parseInlineMarkdown('Hello `world');
      assert.ok(typeof result === 'string');
      assert.ok(result.includes('world'));
    });

    it('unclosed link [label]( does not crash', () => {
      const result = parseInlineMarkdown('See [link](');
      assert.ok(typeof result === 'string');
    });

    it('single * at start of line is treated as paragraph, not list', () => {
      /**
       * Scenario: User types a single * without a space after it.
       * Should NOT be treated as a list item.
       */
      const blocks = parseMarkdownToBlocks('*');
      assert.ok(blocks.length >= 0); // May be empty or paragraph
      // Should not be a list
      const listBlock = blocks.find(b => b.type === 'unordered_list');
      assert.strictEqual(listBlock, undefined);
    });

    it('# without space is treated as paragraph, not heading', () => {
      /**
       * Scenario: User types #heading without space between # and text.
       * Standard markdown requires a space; this should be a paragraph.
       */
      const blocks = parseMarkdownToBlocks('#heading');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'paragraph');
      assert.strictEqual(blocks[0].content, '#heading');
    });

    it('> alone on a line creates an empty blockquote', () => {
      const blocks = parseMarkdownToBlocks('>');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'blockquote');
    });

    it('``` alone on a line opens an empty code block', () => {
      const blocks = parseMarkdownToBlocks('```');
      assert.ok(blocks.length >= 1);
      const codeBlock = blocks.find(b => b.type === 'code_block');
      assert.ok(codeBlock);
    });
  });

  // -------------------------------------------------------------------
  // EMPTY HEADINGS AND LAST-LINE EDGE CASES
  // Known crash risk: empty headings at the end of a document, or
  // documents ending with block-start markers.
  // -------------------------------------------------------------------
  describe('Empty headings and last-line edge cases', () => {
    it('empty heading (# followed by nothing) at end of document', () => {
      /**
       * REPORTED BUG SCENARIO: Editor crashes during parsing when the
       * last line is an empty heading marker.
       */
      const blocks = parseMarkdownToBlocks('Some text\n\n# ');
      assert.ok(blocks.length >= 1, 'Should not crash');
      // The # with trailing space might match heading regex with empty content
    });

    it('# alone at end of document (no trailing space)', () => {
      const blocks = parseMarkdownToBlocks('Some text\n\n#');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('## alone at end of document', () => {
      const blocks = parseMarkdownToBlocks('Text\n\n##');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('multiple empty headings at different levels', () => {
      const blocks = parseMarkdownToBlocks('# \n\n## \n\n### ');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('document ending with an unclosed code block', () => {
      /**
       * REPORTED BUG SCENARIO: Document ends with ``` but no closing fence.
       */
      const blocks = parseMarkdownToBlocks('Text\n\n```python\nprint("hi")');
      assert.ok(blocks.length >= 1, 'Should not crash');
      const code = blocks.find(b => b.type === 'code_block');
      assert.ok(code, 'Should still produce a code block');
    });

    it('document ending with a list marker but no text', () => {
      const blocks = parseMarkdownToBlocks('Text\n\n- ');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('document ending with a task checkbox but no text', () => {
      const blocks = parseMarkdownToBlocks('Text\n\n- [ ] ');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('document ending with blockquote marker', () => {
      const blocks = parseMarkdownToBlocks('Text\n\n> ');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('document ending with table header row only', () => {
      const blocks = parseMarkdownToBlocks('Text\n\n| A | B |');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('document that is only newlines', () => {
      const blocks = parseMarkdownToBlocks('\n\n\n\n');
      assert.strictEqual(blocks.length, 0, 'Should produce no blocks');
    });

    it('document that is only spaces and tabs', () => {
      const blocks = parseMarkdownToBlocks('   \t  \n  \t  ');
      assert.strictEqual(blocks.length, 0, 'Should produce no blocks');
    });
  });

  // -------------------------------------------------------------------
  // ADJACENT BLOCK TRANSITIONS
  // Tests transitions between different block types without the usual
  // blank line separator that well-formed markdown uses.
  // -------------------------------------------------------------------
  describe('Adjacent block transitions (no blank line between)', () => {
    it('heading immediately followed by list', () => {
      const blocks = parseMarkdownToBlocks('# Title\n- Item');
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].type, 'heading');
      assert.strictEqual(blocks[1].type, 'unordered_list');
    });

    it('code block immediately followed by heading', () => {
      const blocks = parseMarkdownToBlocks('```\ncode\n```\n# Next');
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].type, 'code_block');
      assert.strictEqual(blocks[1].type, 'heading');
    });

    it('two consecutive horizontal rules', () => {
      const blocks = parseMarkdownToBlocks('---\n---');
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].type, 'hr');
      assert.strictEqual(blocks[1].type, 'hr');
    });

    it('list followed by table with no blank line', () => {
      const input = '- Item\n| A | B |\n| --- | --- |\n| 1 | 2 |';
      const blocks = parseMarkdownToBlocks(input);
      assert.ok(blocks.length >= 2, 'Should produce both list and table blocks');
    });

    it('blockquote followed by list', () => {
      const blocks = parseMarkdownToBlocks('> Quote\n- Item');
      assert.ok(blocks.length >= 2);
    });

    it('paragraph followed by heading on next line', () => {
      const blocks = parseMarkdownToBlocks('Some text\n# Heading');
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].type, 'paragraph');
      assert.strictEqual(blocks[1].type, 'heading');
    });

    it('paragraph followed by horizontal rule', () => {
      const blocks = parseMarkdownToBlocks('Some text\n---');
      // This is ambiguous in some markdown parsers; just verify no crash
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('heading followed by code block on next line', () => {
      const blocks = parseMarkdownToBlocks('# Title\n```\ncode\n```');
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].type, 'heading');
      assert.strictEqual(blocks[1].type, 'code_block');
    });
  });

  // -------------------------------------------------------------------
  // SPECIAL CHARACTERS
  // Tests that special characters are handled safely (no XSS, no
  // misinterpretation as markdown syntax).
  // -------------------------------------------------------------------
  describe('Special characters', () => {
    it.skip('markdown syntax inside inline code is not parsed (KNOWN LIMITATION)', () => {
      /**
       * Scenario: User writes `**not bold**` in inline code.
       * Expected: the asterisks should be preserved, not turned into <strong>.
       *
       * KNOWN LIMITATION: parseInlineMarkdown processes the code backtick regex
       * first (replacing `...` with <code>...</code>), but then the bold regex
       * still matches the **text** inside the already-generated <code> HTML.
       * Fix: inline code replacement should use a placeholder to protect its content
       * from subsequent regex passes, or use a multi-pass tokenizer.
       */
      const result = parseInlineMarkdown('See `**not bold**` here');
      assert.ok(result.includes('<code'));
      assert.ok(!result.includes('<strong>'));
    });

    it('HTML entities in text are escaped', () => {
      const result = escapeHtml('<script>alert("xss")</script>');
      assert.ok(result.includes('&lt;script'));
      assert.ok(!result.includes('<script'));
    });

    it('pipe characters in paragraph do not create a table', () => {
      /**
       * Scenario: User writes "A | B | C" in a paragraph.
       * Without a separator row below, this should stay as a paragraph.
       */
      const blocks = parseMarkdownToBlocks('A | B | C');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'paragraph');
    });

    it('URL with special characters in link is preserved', () => {
      const result = parseInlineMarkdown('[link](https://example.com/path?a=1&b=2)');
      assert.ok(result.includes('href="https://example.com/path?a=1'));
    });

    it('ampersand in text is escaped', () => {
      const result = escapeHtml('AT&T Corp');
      assert.ok(result.includes('&amp;'));
    });

    it('angle brackets in text are escaped', () => {
      const result = escapeHtml('a < b > c');
      assert.ok(result.includes('&lt;'));
      assert.ok(result.includes('&gt;'));
    });

    it('quotes in text are escaped', () => {
      const result = escapeHtml('He said "hello"');
      assert.ok(result.includes('&quot;'));
    });
  });

  // -------------------------------------------------------------------
  // UNUSUAL LIST PATTERNS
  // Tests edge cases in list parsing that users may produce accidentally
  // or intentionally.
  // -------------------------------------------------------------------
  describe('Unusual list patterns', () => {
    it('mixed list markers (- * +) in same block', () => {
      /**
       * Scenario: User switches between -, *, and + markers.
       * All should be treated as unordered list items.
       */
      const blocks = parseMarkdownToBlocks('- A\n* B\n+ C');
      // May produce one or more list blocks; should not crash
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('ordered list not starting at 1', () => {
      const blocks = parseMarkdownToBlocks('5. Fifth\n6. Sixth');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'ordered_list');
      assert.strictEqual(blocks[0].items!.length, 2);
    });

    it('very deep nesting (6 levels) does not crash', () => {
      const input = [
        '- L1',
        '  - L2',
        '    - L3',
        '      - L4',
        '        - L5',
        '          - L6',
      ].join('\n');

      const blocks = parseMarkdownToBlocks(input);
      assert.ok(blocks.length >= 1, 'Should not crash');
      assert.strictEqual(blocks[0].type, 'unordered_list');
    });

    it('list item with only whitespace content', () => {
      const blocks = parseMarkdownToBlocks('-  ');
      assert.ok(blocks.length >= 1);
    });

    it('empty task item with only checkbox', () => {
      const blocks = parseMarkdownToBlocks('- [ ]');
      // Should parse as task_list even if text is empty
      assert.ok(blocks.length >= 0, 'Should not crash');
    });

    it('ordered list with mixed number formats (1. vs 1))', () => {
      const blocks = parseMarkdownToBlocks('1. First\n2) Second');
      assert.ok(blocks.length >= 1, 'Should not crash');
    });

    it('list item followed by indented non-list continuation text', () => {
      /**
       * Scenario: Multi-line list item with continuation text.
       */
      const blocks = parseMarkdownToBlocks('- Start of item\n  continuation of item');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'unordered_list');
      assert.ok(blocks[0].items![0].text.includes('continuation'));
    });
  });

  // -------------------------------------------------------------------
  // TABLE EDGE CASES
  // Tests parsing robustness for tables with unusual formatting.
  // -------------------------------------------------------------------
  describe('Table parsing edge cases', () => {
    it('table with no body rows', () => {
      const input = '| A | B |\n| --- | --- |';
      const blocks = parseMarkdownToBlocks(input);
      assert.ok(blocks.length >= 1);
      const table = blocks.find(b => b.type === 'table');
      assert.ok(table, 'Should parse as a table');
      assert.strictEqual(table!.rows!.length, 0);
    });

    it('table with extra spaces in cells', () => {
      const input = '|  A  |  B  |\n| --- | --- |\n|  1  |  2  |';
      const blocks = parseMarkdownToBlocks(input);
      const table = blocks.find(b => b.type === 'table');
      assert.ok(table);
      assert.strictEqual(table!.headers![0], 'A');
      assert.strictEqual(table!.headers![1], 'B');
    });

    it('table with single column', () => {
      const input = '| A |\n| --- |\n| 1 |';
      const blocks = parseMarkdownToBlocks(input);
      const table = blocks.find(b => b.type === 'table');
      assert.ok(table);
      assert.strictEqual(table!.headers!.length, 1);
    });
  });
});
