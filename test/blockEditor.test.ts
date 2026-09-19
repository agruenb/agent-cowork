import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml, BLOCK_DELETE_BTN_HTML } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { setActiveBlock, getActiveBlock } from '../src/webview/blockFocus';
import { handleBlockDeleteClick } from '../src/webview/blockDelete';
import { toggleInlineCode, handleCodeButtonClick } from '../src/webview/inlineCode';
import { isAtStartOfBlock, isAtEndOfBlock, handleBlockKeyboardGuards } from '../src/webview/keyboardGuards';

describe('Block Editor Architecture & Interactions', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor" contenteditable="true"></div></body></html>');
    window = dom.window as unknown as Window;
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).Range = dom.window.Range;
    (globalThis as any).Selection = dom.window.Selection;
    editor = document.getElementById('editor')!;
  });

  describe('Block Containers in Parser and Serializer', () => {
    it('renders headings and paragraphs directly as editor blocks without container wrappers', () => {
      const md = '# Header 1\n\nParagraph text';
      const html = markdownToHtml(md);

      assert.ok(html.includes('<h1 class="editor-block" data-block-type="heading" data-level="1">Header 1</h1>'));
      assert.ok(html.includes('<p class="editor-block" data-block-type="paragraph">Paragraph text</p>'));
      assert.ok(!html.includes('text-block'));
    });

    it('wraps widget blocks (tables, code, blockquotes, hr) in widget-block containers with delete buttons', () => {
      const md = '```javascript\nconsole.log(1);\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> A quote\n\n---';
      const html = markdownToHtml(md);

      assert.ok(html.includes('<div class="editor-block-container widget-block" data-block-type="code_block" contenteditable="false">'));
      assert.ok(html.includes('<div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">'));
      assert.ok(html.includes('<div class="editor-block-container widget-block" data-block-type="blockquote" contenteditable="false">'));
      assert.ok(html.includes('<div class="editor-block-container widget-block" data-block-type="hr" contenteditable="false">'));
      assert.ok(html.includes('class="block-delete-btn"'));
      assert.ok(html.includes('title="Block löschen"'));
      assert.ok(html.includes('<code class="editor-code" contenteditable="true">'));
    });

    it('roundtrips all block containers back to clean markdown ignoring delete buttons', () => {
      const originalMd = '# Title\n\nFirst paragraph\n\n```python\nprint("hello")\n```\n\n| X | Y |\n| --- | --- |\n| 1 | 2 |\n\n---\n\nFinal text';
      const html = markdownToHtml(originalMd);
      editor.innerHTML = html;

      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, originalMd);
    });
  });

  describe('Block Focus Highlighting', () => {
    it('adds is-active-block class to the targeted container and removes from previous', () => {
      editor.innerHTML = `
        <div id="b1" class="editor-block-container widget-block" data-block-type="code_block"></div>
        <div id="b2" class="editor-block-container widget-block" data-block-type="table"></div>
      `;
      const b1 = document.getElementById('b1')!;
      const b2 = document.getElementById('b2')!;

      setActiveBlock(editor, b1);
      assert.ok(b1.classList.contains('is-active-block'));
      assert.strictEqual(getActiveBlock(editor), b1);

      setActiveBlock(editor, b2);
      assert.ok(!b1.classList.contains('is-active-block'));
      assert.ok(b2.classList.contains('is-active-block'));
      assert.strictEqual(getActiveBlock(editor), b2);

      setActiveBlock(editor, null);
      assert.ok(!b2.classList.contains('is-active-block'));
      assert.strictEqual(getActiveBlock(editor), null);
    });
  });

  describe('Block Delete Button Handling', () => {
    it('removes the enclosing widget block container when delete button is clicked', () => {
      editor.innerHTML = `
        <p id="p1" class="editor-block" data-block-type="paragraph">Intro</p>
        <div id="code-block" class="editor-block-container widget-block" data-block-type="code_block" contenteditable="false">
          ${BLOCK_DELETE_BTN_HTML}
          <pre><code class="editor-code">code</code></pre>
        </div>
      `;

      let editEmitted = false;
      const deleteBtn = editor.querySelector('.block-delete-btn') as HTMLElement;
      assert.ok(deleteBtn);

      const fakeClick = {
        target: deleteBtn,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as MouseEvent;

      const deleted = handleBlockDeleteClick(fakeClick, editor, () => {
        editEmitted = true;
      });

      assert.strictEqual(deleted, true);
      assert.strictEqual(editEmitted, true);
      assert.strictEqual(document.getElementById('code-block'), null);
      assert.ok(document.getElementById('p1'));
    });

    it('inserts an empty paragraph when the last remaining block is deleted', () => {
      editor.innerHTML = `
        <div id="single-widget" class="editor-block-container widget-block" data-block-type="hr" contenteditable="false">
          ${BLOCK_DELETE_BTN_HTML}
          <hr>
        </div>
      `;

      const deleteBtn = editor.querySelector('.block-delete-btn') as HTMLElement;
      const fakeClick = {
        target: deleteBtn,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as MouseEvent;

      let editEmitted = false;
      handleBlockDeleteClick(fakeClick, editor, () => {
        editEmitted = true;
      });

      assert.strictEqual(editEmitted, true);
      assert.strictEqual(document.getElementById('single-widget'), null);
      const remainingP = editor.querySelector('p');
      assert.ok(remainingP);
      assert.strictEqual(editor.querySelectorAll('p').length, 1);
    });
  });

  describe('Inline Code & Dual Behavior', () => {
    it('wraps selected text in code.inline-code when text is selected', () => {
      editor.innerHTML = '<p class="editor-block">Click here to test</p>';
      const p = editor.querySelector('p')!;
      const textNode = p.firstChild!;

      const range = document.createRange();
      range.setStart(textNode, 6); // "here"
      range.setEnd(textNode, 10);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const toggled = toggleInlineCode(editor);
      assert.strictEqual(toggled, true);
      const codeEl = p.querySelector('code.inline-code');
      assert.ok(codeEl);
      assert.strictEqual(codeEl.textContent, 'here');

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, 'Click `here` to test');
    });

    it('toggles off existing inline code', () => {
      editor.innerHTML = '<p class="editor-block">Click <code class="inline-code">here</code> to test</p>';
      const codeEl = editor.querySelector('code.inline-code')!;

      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const toggled = toggleInlineCode(editor);
      assert.strictEqual(toggled, true);
      assert.strictEqual(editor.querySelector('code.inline-code'), null);
      assert.strictEqual(domToMarkdown(editor).trim(), 'Click here to test');
    });

    it('calls insertFencedCodeBlock when selection is collapsed', () => {
      editor.innerHTML = '<p class="editor-block">Hello</p>';
      const p = editor.querySelector('p')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      let fencedInserted = false;
      let editEmitted = false;

      handleCodeButtonClick(
        editor,
        () => { fencedInserted = true; },
        () => { editEmitted = true; }
      );

      assert.strictEqual(fencedInserted, true);
    });
  });

  describe('Keyboard Guards for Block Boundaries', () => {
    it('prevents Backspace at start of text block when preceded by a widget block', () => {
      editor.innerHTML = `
        <div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">
          <table><tbody><tr><td>Cell</td></tr></tbody></table>
        </div>
        <p id="text-block" class="editor-block" data-block-type="paragraph">Some text</p>
      `;

      const p = document.getElementById('text-block')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      assert.strictEqual(isAtStartOfBlock(sel, p), true);

      let prevented = false;
      const fakeEvent = {
        key: 'Backspace',
        preventDefault: () => { prevented = true; },
      } as unknown as KeyboardEvent;

      const handled = handleBlockKeyboardGuards(fakeEvent, editor, () => {});
      assert.strictEqual(handled, true);
      assert.strictEqual(prevented, true);
    });

    it('allows Backspace when caret is not at start of block', () => {
      editor.innerHTML = `
        <div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">
          <table><tbody><tr><td>Cell</td></tr></tbody></table>
        </div>
        <p id="text-block" class="editor-block" data-block-type="paragraph">Some text</p>
      `;

      const p = document.getElementById('text-block')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 4); // After "Some"
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      assert.strictEqual(isAtStartOfBlock(sel, p), false);

      let prevented = false;
      const fakeEvent = {
        key: 'Backspace',
        preventDefault: () => { prevented = true; },
      } as unknown as KeyboardEvent;

      const handled = handleBlockKeyboardGuards(fakeEvent, editor, () => {});
      assert.strictEqual(handled, false);
      assert.strictEqual(prevented, false);
    });

    it('prevents Delete at end of text block when followed by a widget block', () => {
      editor.innerHTML = `
        <p id="text-block" class="editor-block" data-block-type="paragraph">Some text</p>
        <div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">
          <table><tbody><tr><td>Cell</td></tr></tbody></table>
        </div>
      `;

      const p = document.getElementById('text-block')!;
      const range = document.createRange();
      range.setStart(p.firstChild!, 9); // End of "Some text"
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      assert.strictEqual(isAtEndOfBlock(sel, p), true);

      let prevented = false;
      const fakeEvent = {
        key: 'Delete',
        preventDefault: () => { prevented = true; },
      } as unknown as KeyboardEvent;

      const handled = handleBlockKeyboardGuards(fakeEvent, editor, () => {});
      assert.strictEqual(handled, true);
      assert.strictEqual(prevented, true);
    });
  });
});
