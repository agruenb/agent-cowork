import assert from 'assert';
import { JSDOM } from 'jsdom';
import { parseMarkdownToBlocks } from '../src/markdown/parser';
import {
  syncBlockLineAttributes,
  getVisibleLineInFormatted,
  getVisibleLineInRaw,
  scrollToLineInFormatted,
  scrollToLineInRaw,
} from '../src/webview/scrollSync';
import {
  state,
  vscode,
  getRawWrapper,
  getRawGutter,
  getRawTextarea,
  getEditorCanvas,
  getDocumentViewport,
} from '../src/webview/editorState';
import {
  setContentFormatted,
  toggleRawMode,
} from '../src/webview/markdownEditor';
import { updateRawLineNumbers } from '../src/webview/rawLineNumbers';

describe('Mode Toggle - Scroll Position Synchronization', () => {
  describe('Parser Line Metadata', () => {
    it('records startLine and endLine accurately for all block types', () => {
      const markdown = [
        '# Heading 1', // Line 1
        '', // Line 2
        'Paragraph line 1', // Line 3
        'Paragraph line 2', // Line 4
        '', // Line 5
        '```typescript', // Line 6
        'const a = 1;', // Line 7
        'const b = 2;', // Line 8
        '```', // Line 9
        '', // Line 10
        '> Quote line 1', // Line 11
        '> Quote line 2', // Line 12
        '', // Line 13
        '| Header 1 | Header 2 |', // Line 14
        '| --- | --- |', // Line 15
        '| Cell 1 | Cell 2 |', // Line 16
        '', // Line 17
        '---', // Line 18
        '', // Line 19
        '- Item 1', // Line 20
        '- Item 2', // Line 21
        '  - Nested Item 2.1', // Line 22
      ].join('\n');

      const blocks = parseMarkdownToBlocks(markdown);
      assert.strictEqual(blocks.length, 7);

      // 1. Heading
      assert.strictEqual(blocks[0].type, 'heading');
      assert.strictEqual(blocks[0].startLine, 1);
      assert.strictEqual(blocks[0].endLine, 1);

      // 2. Paragraph (lines 3-4)
      assert.strictEqual(blocks[1].type, 'paragraph');
      assert.strictEqual(blocks[1].startLine, 3);
      assert.strictEqual(blocks[1].endLine, 4);

      // 3. Code Block (lines 6-9)
      assert.strictEqual(blocks[2].type, 'code_block');
      assert.strictEqual(blocks[2].startLine, 6);
      assert.strictEqual(blocks[2].endLine, 9);

      // 4. Blockquote (lines 11-12)
      assert.strictEqual(blocks[3].type, 'blockquote');
      assert.strictEqual(blocks[3].startLine, 11);
      assert.strictEqual(blocks[3].endLine, 12);

      // 5. Table (lines 14-16)
      assert.strictEqual(blocks[4].type, 'table');
      assert.strictEqual(blocks[4].startLine, 14);
      assert.strictEqual(blocks[4].endLine, 16);

      // 6. Horizontal Rule (line 18)
      assert.strictEqual(blocks[5].type, 'hr');
      assert.strictEqual(blocks[5].startLine, 18);
      assert.strictEqual(blocks[5].endLine, 18);

      // 7. Nested List (lines 20-22)
      assert.strictEqual(blocks[6].type, 'unordered_list');
      assert.strictEqual(blocks[6].startLine, 20);
      assert.strictEqual(blocks[6].endLine, 22);
      assert.strictEqual(blocks[6].items?.[0].line, 20);
      assert.strictEqual(blocks[6].items?.[1].line, 21);
      assert.strictEqual(blocks[6].items?.[1].children?.[0].items?.[0].line, 22);
    });
  });

  describe('Canvas Line Annotation', () => {
    let dom: JSDOM;
    let canvas: HTMLElement;

    beforeEach(() => {
      dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
      canvas = dom.window.document.getElementById('editor')!;
    });

    it('attaches data-start-line and data-end-line to canvas block elements', () => {
      const markdown = '# Title\n\nParagraph text\n\n- List item 1\n- List item 2';
      canvas.innerHTML = [
        '<h1 class="editor-block">Title</h1>',
        '<p class="editor-block">Paragraph text</p>',
        '<ul class="editor-block bullet-list"><li class="list-item">List item 1</li><li class="list-item">List item 2</li></ul>',
      ].join('');

      syncBlockLineAttributes(canvas, markdown);

      const h1 = canvas.children[0];
      assert.strictEqual(h1.getAttribute('data-start-line'), '1');
      assert.strictEqual(h1.getAttribute('data-end-line'), '1');

      const p = canvas.children[1];
      assert.strictEqual(p.getAttribute('data-start-line'), '3');
      assert.strictEqual(p.getAttribute('data-end-line'), '3');

      const ul = canvas.children[2];
      assert.strictEqual(ul.getAttribute('data-start-line'), '5');
      assert.strictEqual(ul.getAttribute('data-end-line'), '6');

      const lis = ul.querySelectorAll('li');
      assert.strictEqual(lis[0].getAttribute('data-line'), '5');
      assert.strictEqual(lis[1].getAttribute('data-line'), '6');
    });
  });

  describe('Scroll Calculations & Edge Cases', () => {
    let dom: JSDOM;
    let viewport: HTMLElement;
    let canvas: HTMLElement;
    let textarea: HTMLTextAreaElement;
    let gutter: HTMLElement;

    beforeEach(() => {
      dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="document-viewport">
    <div id="editor"></div>
    <div id="raw-wrapper" style="display: none;">
      <div id="raw-gutter"></div>
      <textarea id="raw-textarea"></textarea>
    </div>
  </div>
</body>
</html>`);
      viewport = dom.window.document.querySelector('.document-viewport') as HTMLElement;
      canvas = dom.window.document.getElementById('editor') as HTMLElement;
      textarea = dom.window.document.getElementById('raw-textarea') as HTMLTextAreaElement;
      gutter = dom.window.document.getElementById('raw-gutter') as HTMLElement;
    });

    it('getVisibleLineInFormatted returns line 1 at top of document (scrollTop = 0)', () => {
      viewport.scrollTop = 0;
      const pos = getVisibleLineInFormatted(canvas, viewport);
      assert.strictEqual(pos.line, 1);
      assert.strictEqual(pos.fraction, 0);
    });

    it('getVisibleLineInRaw returns line 1 at top of document (scrollTop = 0)', () => {
      viewport.scrollTop = 0;
      const pos = getVisibleLineInRaw(textarea, gutter, viewport);
      assert.strictEqual(pos.line, 1);
      assert.strictEqual(pos.fraction, 0);
    });

    it('scrollToLineInFormatted sets scrollTop = 0 when targeting line 1', () => {
      viewport.scrollTop = 200;
      scrollToLineInFormatted(1, 0, canvas, viewport);
      assert.strictEqual(viewport.scrollTop, 0);
    });

    it('scrollToLineInRaw sets scrollTop = 0 when targeting line 1', () => {
      viewport.scrollTop = 200;
      scrollToLineInRaw(1, 0, textarea, gutter, viewport);
      assert.strictEqual(viewport.scrollTop, 0);
    });

    it('handles bottom of document correctly (isBottom = true)', () => {
      // Mock scrollHeight and clientHeight
      Object.defineProperty(viewport, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(viewport, 'clientHeight', { value: 600, configurable: true });
      viewport.scrollTop = 1400; // max scroll = 2000 - 600 = 1400

      const pos = getVisibleLineInRaw(textarea, gutter, viewport);
      assert.strictEqual(pos.isBottom, true);

      // Now scroll in formatted mode with isBottom = true
      viewport.scrollTop = 0;
      scrollToLineInFormatted(pos.line, pos.fraction, canvas, viewport, true);
      assert.strictEqual(viewport.scrollTop, 1400);
    });

    it('scrolls to specific line based on gutter offset in raw mode', () => {
      gutter.innerHTML = `
        <div class="raw-gutter-line" data-line="1">1</div>
        <div class="raw-gutter-line" data-line="2">2</div>
        <div class="raw-gutter-line" data-line="3">3</div>
      `;
      const lines = gutter.querySelectorAll<HTMLElement>('.raw-gutter-line');
      Object.defineProperty(lines[0], 'offsetTop', { value: 0, configurable: true });
      Object.defineProperty(lines[0], 'offsetHeight', { value: 25, configurable: true });
      Object.defineProperty(lines[1], 'offsetTop', { value: 25, configurable: true });
      Object.defineProperty(lines[1], 'offsetHeight', { value: 25, configurable: true });
      Object.defineProperty(lines[2], 'offsetTop', { value: 50, configurable: true });
      Object.defineProperty(lines[2], 'offsetHeight', { value: 25, configurable: true });

      // Viewport scroll at 25px -> should detect line 2
      viewport.scrollTop = 25;
      const detected = getVisibleLineInRaw(textarea, gutter, viewport);
      assert.strictEqual(detected.line, 2);

      // Now scroll raw view to line 3
      scrollToLineInRaw(3, 0, textarea, gutter, viewport);
      assert.strictEqual(viewport.scrollTop, 50);
    });
  });

  describe('Full Mode Toggle Integration', () => {
    let dom: JSDOM;
    let document: Document;
    let window: Window;
    let editor: HTMLElement;
    let textarea: HTMLTextAreaElement;
    let viewport: HTMLElement;
    let gutter: HTMLElement;

    beforeEach(() => {
      dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <button id="btn-toggle-raw" class="raw-toggle-btn">&lt;/&gt; Raw</button>
  </div>
  <div id="error-banner" class="error-banner" style="display: none;">
    <span id="error-banner-text"></span>
    <button id="error-banner-dismiss">x</button>
  </div>
  <div class="document-viewport">
    <div id="editor" contenteditable="true"></div>
    <div id="raw-wrapper" class="raw-wrapper" style="display: none;">
      <div id="raw-gutter" class="raw-gutter" style="display: none;"></div>
      <textarea id="raw-textarea" class="raw-textarea" style="display: none;"></textarea>
      <div id="raw-mirror" class="raw-mirror"></div>
    </div>
  </div>
</body>
</html>`);

      window = dom.window as unknown as Window;
      document = dom.window.document;
      (globalThis as any).window = window;
      (globalThis as any).document = document;
      (globalThis as any).Node = dom.window.Node;
      (globalThis as any).Element = dom.window.Element;
      (globalThis as any).HTMLElement = dom.window.HTMLElement;
      (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
      (globalThis as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
      (globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;

      editor = document.getElementById('editor')!;
      textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
      viewport = document.querySelector('.document-viewport') as HTMLElement;
      gutter = document.getElementById('raw-gutter')!;

      state.isRawMode = false;
      state.currentMarkdown = '';
      state.hasParseError = false;
      state.isCanvasDirty = false;
      state.debounceTimer = null;
    });

    it('toggling at the top of a document stays at scrollTop = 0 in both directions', () => {
      const input = '# Heading\n\nParagraph 1\n\nParagraph 2';
      setContentFormatted(input);
      viewport.scrollTop = 0;

      // Toggle to raw mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, true);
      assert.strictEqual(viewport.scrollTop, 0, 'Should stay at top in raw mode');

      // Toggle back to formatted mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, false);
      assert.strictEqual(viewport.scrollTop, 0, 'Should stay at top in formatted mode');
    });

    it('toggling an empty document does not throw and preserves scrollTop = 0', () => {
      setContentFormatted('');
      viewport.scrollTop = 0;

      assert.doesNotThrow(() => {
        toggleRawMode();
      });
      assert.strictEqual(viewport.scrollTop, 0);

      assert.doesNotThrow(() => {
        toggleRawMode();
      });
      assert.strictEqual(viewport.scrollTop, 0);
    });

    it('toggling a document with only blank lines does not crash', () => {
      setContentFormatted('\n\n\n');
      viewport.scrollTop = 0;

      assert.doesNotThrow(() => {
        toggleRawMode();
      });
      assert.strictEqual(viewport.scrollTop, 0);

      assert.doesNotThrow(() => {
        toggleRawMode();
      });
      assert.strictEqual(viewport.scrollTop, 0);
    });

    it('preserves line position when switching from formatted to raw mode and back', () => {
      const lines = [
        '# Section 1', // line 1
        '', // line 2
        'Paragraph A', // line 3
        '', // line 4
        '# Section 2', // line 5
        '', // line 6
        'Paragraph B', // line 7
      ];
      setContentFormatted(lines.join('\n'));

      // Setup simulated layout on HTMLElement prototype so re-created elements retain offsets
      Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetTop', {
        get(this: HTMLElement) {
          if (this.classList.contains('raw-gutter-line')) {
            const line = parseInt(this.getAttribute('data-line') || '1', 10);
            return (line - 1) * 25;
          }
          const startLine = this.getAttribute('data-start-line');
          if (startLine === '1') return 0;
          if (startLine === '3') return 50;
          if (startLine === '5') return 90;
          if (startLine === '7') return 140;
          return 0;
        },
        configurable: true,
      });

      Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
        get(this: HTMLElement) {
          if (this.classList.contains('raw-gutter-line')) return 25;
          const startLine = this.getAttribute('data-start-line');
          if (startLine === '1' || startLine === '5') return 40;
          return 30;
        },
        configurable: true,
      });

      // User scrolls to Section 2 (offsetTop 90px, line 5)
      viewport.scrollTop = 90;

      // Toggle to raw mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, true);

      // Section 2 is line 5 -> offset in raw mode is (5 - 1) * 25 = 100
      assert.strictEqual(viewport.scrollTop, 100);

      // Toggle back to formatted mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, false);

      // Formatted mode should have scrolled to Section 2 (offsetTop 90)
      assert.strictEqual(viewport.scrollTop, 90);
    });

    it('toggling at bottom of document preserves bottom scroll in both directions', () => {
      const input = '# Heading\n\nParagraph 1\n\nParagraph 2';
      setContentFormatted(input);

      // Simulate viewport scroll dimensions
      Object.defineProperty(viewport, 'scrollHeight', { value: 1500, configurable: true });
      Object.defineProperty(viewport, 'clientHeight', { value: 500, configurable: true });
      viewport.scrollTop = 1000; // Scrolled all the way to bottom

      // Toggle to raw mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, true);
      assert.strictEqual(viewport.scrollTop, 1000, 'Raw mode should remain at bottom');

      // Toggle back to formatted mode
      toggleRawMode();
      assert.strictEqual(state.isRawMode, false);
      assert.strictEqual(viewport.scrollTop, 1000, 'Formatted mode should remain at bottom');
    });

    it('syncs scroll correctly when canvas was edited before toggling to raw mode', () => {
      setContentFormatted('# Original Header\n\nOriginal Text');

      // User types in canvas
      editor.innerHTML = '<h1 class="editor-block">Original Header</h1><p class="editor-block">New paragraph</p><p class="editor-block">Another line</p>';
      state.isCanvasDirty = true;

      // Mock prototype layout
      Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetTop', {
        get(this: HTMLElement) {
          if (this.classList.contains('raw-gutter-line')) {
            const line = parseInt(this.getAttribute('data-line') || '1', 10);
            return (line - 1) * 20;
          }
          const startLine = this.getAttribute('data-start-line');
          if (startLine === '1') return 0;
          if (startLine === '3') return 40;
          if (startLine === '5') return 80;
          return 0;
        },
        configurable: true,
      });

      viewport.scrollTop = 80; // Scrolled to "Another line"

      toggleRawMode();
      assert.strictEqual(state.isRawMode, true);
      // Serialized markdown has 5 lines (# Original Header \n\n New paragraph \n\n Another line)
      // "Another line" is line 5 -> offset in raw mode should be (5 - 1) * 20 = 80
      assert.strictEqual(viewport.scrollTop, 80);
    });
  });
});
