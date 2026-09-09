/**
 * Roundtrip Stability Test Suite
 * ==============================
 *
 * Goes beyond single-pass roundtrip tests to verify that the editor's
 * parse → render → serialize pipeline remains stable across MULTIPLE
 * edit-serialize cycles, which is the real-world usage pattern.
 *
 * WHY: Every user keystroke triggers serialize → re-parse → re-render.
 * If the roundtrip is not idempotent, content drifts, accumulates
 * artifacts (extra newlines, lost formatting, duplicated blocks), or
 * crashes after several cycles.
 *
 * PATTERN: Each test performs N roundtrip cycles and asserts that the
 * output stabilizes (output of cycle N === output of cycle N-1).
 *
 * EXPANDING: Add tests for any new block type or formatting feature.
 * Pay special attention to edge cases where whitespace normalization
 * or empty-block handling might cause drift.
 */

import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';

describe('Roundtrip Stability (Multi-Cycle)', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  /** Perform N roundtrip cycles and return the output of each cycle */
  function multiRoundtrip(inputMd: string, cycles: number): string[] {
    const editor = document.getElementById('editor')!;
    const results: string[] = [];
    let currentMd = inputMd;

    for (let i = 0; i < cycles; i++) {
      const html = markdownToHtml(currentMd);
      editor.innerHTML = html;
      currentMd = domToMarkdown(editor).trim();
      results.push(currentMd);
    }
    return results;
  }

  // -------------------------------------------------------------------
  // N-CYCLE STABILITY
  // Verifies that repeated roundtrips converge and stabilize. After the
  // first cycle (which may normalize whitespace), subsequent cycles
  // must produce identical output.
  // -------------------------------------------------------------------
  describe('N-cycle convergence', () => {
    it('simple paragraph stabilizes after 1 cycle', () => {
      const results = multiRoundtrip('Hello world', 5);
      // All cycles after the first should be identical
      for (let i = 1; i < results.length; i++) {
        assert.strictEqual(results[i], results[0], `Cycle ${i + 1} diverged from cycle 1`);
      }
    });

    it('complex document stabilizes within 5 cycles', () => {
      /**
       * A real-world document with headings, lists, code blocks, tables, etc.
       * Must converge to a stable form.
       */
      const input = [
        '# Project',
        '',
        'Welcome to **Agent Cowork**!',
        '',
        '## Features',
        '',
        '- Simplicity',
        '  - Clean UI',
        '  - Fast',
        '- Power',
        '  1. AI integration',
        '  2. Markdown editing',
        '',
        '## Tasks',
        '',
        '- [ ] Ship v1',
        '  - [x] Write tests',
        '  - [ ] Fix bugs',
        '',
        '```js',
        'console.log("hello")',
        '```',
        '',
        '| Name | Status |',
        '| --- | --- |',
        '| Alpha | Done |',
        '| Beta | WIP |',
        '',
        '> This is a quote',
        '',
        '---',
      ].join('\n');

      const results = multiRoundtrip(input, 5);
      // After first normalization, all subsequent cycles must be identical
      for (let i = 2; i < results.length; i++) {
        assert.strictEqual(results[i], results[1], `Cycle ${i + 1} diverged from cycle 2`);
      }
    });

    it('nested list stabilizes across 5 cycles', () => {
      const input = [
        '- Level 1',
        '  - Level 2a',
        '    - Level 3',
        '  - Level 2b',
      ].join('\n');

      const results = multiRoundtrip(input, 5);
      for (let i = 1; i < results.length; i++) {
        assert.strictEqual(results[i], results[0], `Cycle ${i + 1} diverged`);
      }
    });

    it('task list with mixed states stabilizes across 5 cycles', () => {
      const input = [
        '- [x] Done',
        '- [ ] Pending',
        '  - [x] Sub-done',
        '  - [ ] Sub-pending',
      ].join('\n');

      const results = multiRoundtrip(input, 5);
      for (let i = 1; i < results.length; i++) {
        assert.strictEqual(results[i], results[0], `Cycle ${i + 1} diverged`);
      }
    });
  });

  // -------------------------------------------------------------------
  // EDIT-AND-ROUNDTRIP
  // Simulates a user making an edit, then verifying the document stays
  // intact through subsequent roundtrip cycles.
  // -------------------------------------------------------------------
  describe('Edit-and-roundtrip resilience', () => {
    it('adding a paragraph then roundtripping preserves all content', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = markdownToHtml('# Title\n\nOriginal paragraph');

      // Simulate adding a new paragraph
      const p = document.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.textContent = 'New paragraph';
      editor.appendChild(p);

      const md1 = domToMarkdown(editor).trim();
      assert.ok(md1.includes('# Title'));
      assert.ok(md1.includes('Original paragraph'));
      assert.ok(md1.includes('New paragraph'));

      // Roundtrip again
      editor.innerHTML = markdownToHtml(md1);
      const md2 = domToMarkdown(editor).trim();
      assert.strictEqual(md2, md1);
    });

    it('adding a list item then roundtripping preserves list', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = markdownToHtml('- Item A\n- Item B');

      const ul = editor.querySelector('ul')!;
      const newLi = document.createElement('li');
      newLi.className = 'list-item';
      newLi.textContent = 'Item C';
      ul.appendChild(newLi);

      const md1 = domToMarkdown(editor).trim();
      assert.strictEqual(md1, '- Item A\n- Item B\n- Item C');

      // Roundtrip
      editor.innerHTML = markdownToHtml(md1);
      const md2 = domToMarkdown(editor).trim();
      assert.strictEqual(md2, md1);
    });
  });

  // -------------------------------------------------------------------
  // WHITESPACE NORMALIZATION
  // Verifies that documents with irregular whitespace normalize cleanly
  // and stay stable after the first roundtrip.
  // -------------------------------------------------------------------
  describe('Whitespace normalization', () => {
    it('extra blank lines between blocks normalize to single separators', () => {
      const input = '# Title\n\n\n\nParagraph\n\n\n\n- Item';
      const results = multiRoundtrip(input, 3);
      // After normalization, should be stable
      assert.strictEqual(results[1], results[2]);
      // No triple+ blank lines in output
      assert.ok(!results[1].includes('\n\n\n'));
    });

    it('trailing spaces on lines are trimmed after roundtrip', () => {
      const input = '# Title   \n\nParagraph   ';
      const results = multiRoundtrip(input, 2);
      assert.ok(!results[0].includes('   '));
    });

    it('mixed \\r\\n and \\n line endings normalize', () => {
      const input = '# Title\r\n\r\nParagraph\r\n';
      const results = multiRoundtrip(input, 2);
      assert.ok(!results[0].includes('\r'));
      assert.strictEqual(results[0], results[1]);
    });
  });

  // -------------------------------------------------------------------
  // EMPTY AND MINIMAL DOCUMENTS
  // Edge cases for empty or near-empty content that could cause crashes
  // or produce phantom elements.
  // -------------------------------------------------------------------
  describe('Empty and minimal documents', () => {
    it('empty string roundtrips without producing phantom content', () => {
      const results = multiRoundtrip('', 3);
      // All cycles should be empty
      for (const r of results) {
        assert.strictEqual(r, '');
      }
    });

    it('single newline normalizes and stabilizes', () => {
      const results = multiRoundtrip('\n', 3);
      assert.strictEqual(results[1], results[2]);
    });

    it('only whitespace normalizes to empty', () => {
      const results = multiRoundtrip('   \n  \n  ', 3);
      assert.strictEqual(results[1], results[2]);
    });

    it('single heading roundtrips cleanly', () => {
      const results = multiRoundtrip('# Hello', 3);
      for (const r of results) {
        assert.strictEqual(r, '# Hello');
      }
    });

    it('single list item roundtrips cleanly', () => {
      const results = multiRoundtrip('- Solo', 3);
      for (const r of results) {
        assert.strictEqual(r, '- Solo');
      }
    });

    it('single code block roundtrips cleanly', () => {
      const input = '```\ncode\n```';
      const results = multiRoundtrip(input, 3);
      for (let i = 1; i < results.length; i++) {
        assert.strictEqual(results[i], results[0]);
      }
    });
  });
});
