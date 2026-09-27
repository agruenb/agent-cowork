import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  copyToClipboard,
  getCodeBlockCopyBtnHtml,
  wireCodeBlockCopyButtons,
  wireCodeBlockCopy,
  initInlineCodeCopy,
  updateCodeCopyLanguage,
} from '../src/webview/codeCopy';
import { blocksToHtml, parseMarkdownToBlocks } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { setWebviewLanguage } from '../src/webview/i18n';

describe('Code Copy Feature (Snippets & Inline Code)', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let copiedText: string;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html lang="de">
<body>
  <div class="app-container">
    <div class="document-viewport">
      <div id="editor" contenteditable="true"></div>
    </div>
  </div>
</body>
</html>`);

    document = dom.window.document;
    window = dom.window as unknown as Window;
    copiedText = '';

    const clipboardMock = {
      writeText: async (t: string) => {
        copiedText = t;
      },
    };

    try {
      Object.defineProperty(dom.window.navigator, 'clipboard', {
        value: clipboardMock,
        configurable: true,
        writable: true,
      });
    } catch {
      (dom.window as any).navigator = { clipboard: clipboardMock };
    }

    try {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: clipboardMock,
        configurable: true,
        writable: true,
      });
    } catch {
      // Ignored
    }

    (global as any).document = document;
    (global as any).window = window;
    (global as any).Node = dom.window.Node;
    (global as any).Event = dom.window.Event;
    (global as any).MouseEvent = dom.window.MouseEvent;

    setWebviewLanguage('de');
  });

  afterEach(() => {
    delete (global as any).document;
    delete (global as any).window;
    delete (global as any).Node;
    delete (global as any).Event;
    delete (global as any).MouseEvent;
  });

  describe('copyToClipboard', () => {
    it('copies text via navigator.clipboard when available', async () => {
      const result = await copyToClipboard('console.log("hello");', document);
      assert.strictEqual(result, true);
      assert.strictEqual(copiedText, 'console.log("hello");');
    });

    it('falls back to execCommand when navigator.clipboard fails', async () => {
      let execCommandCalled = false;
      let executedArg = '';
      document.execCommand = (cmd: string) => {
        execCommandCalled = true;
        executedArg = cmd;
        return true;
      };

      const failingClipboard = {
        writeText: async () => {
          throw new Error('Not allowed');
        },
      };

      Object.defineProperty(dom.window.navigator, 'clipboard', {
        value: failingClipboard,
        configurable: true,
      });

      const result = await copyToClipboard('const x = 42;', document);
      assert.strictEqual(result, true);
      assert.strictEqual(execCommandCalled, true);
      assert.strictEqual(executedArg, 'copy');
    });
  });

  describe('Code Block Snippets Copying', () => {
    it('blocksToHtml renders code blocks with code-copy-btn in code-block-header', () => {
      const blocks = parseMarkdownToBlocks('```typescript\nconst a = 1;\n```');
      const html = blocksToHtml(blocks, false, 'de');

      assert.ok(html.includes('class="code-copy-btn"'), 'Should render code-copy-btn');
      assert.ok(html.includes('title="Code kopieren"'), 'Should have German title in German mode');
    });

    it('blocksToHtml renders English title in English mode', () => {
      const blocks = parseMarkdownToBlocks('```javascript\nconst a = 1;\n```');
      const html = blocksToHtml(blocks, false, 'en');

      assert.ok(html.includes('title="Copy code"'), 'Should have English title in English mode');
    });

    it('wireCodeBlockCopyButtons adds copy button to code blocks missing one', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <input type="text" class="code-lang-input" value="js" />
          </div>
          <pre><code class="editor-code">let x = 10;</code></pre>
        </div>
      `;

      wireCodeBlockCopyButtons(editor);

      const btn = editor.querySelector('.code-copy-btn');
      assert.ok(btn, 'Copy button should be inserted into header');
      assert.strictEqual(btn.getAttribute('title'), 'Code kopieren');
    });

    it('clicking code-copy-btn copies snippet text and shows copied feedback', async () => {
      const editor = document.getElementById('editor')!;

      editor.innerHTML = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <input type="text" class="code-lang-input" value="ts" />
            ${getCodeBlockCopyBtnHtml()}
          </div>
          <pre><code class="editor-code">function greet() {\n  return "hi";\n}</code></pre>
        </div>
      `;

      wireCodeBlockCopy(editor);

      const copyBtn = editor.querySelector('.code-copy-btn') as HTMLButtonElement;
      assert.ok(copyBtn);

      copyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      // Wait a tick for async clipboard copy
      await new Promise((r) => setTimeout(r, 15));

      assert.strictEqual(copiedText, 'function greet() {\n  return "hi";\n}');
      assert.ok(copyBtn.classList.contains('is-copied'), 'Button should have is-copied class');
      assert.strictEqual(copyBtn.getAttribute('title'), 'Kopiert!');
    });

    it('domToMarkdown does not include copy button markup or text in serialized output', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <div class="code-block-wrapper" data-block-type="code_block" data-language="js">
          <div class="code-block-header">
            <input type="text" class="code-lang-input" value="js" />
            ${getCodeBlockCopyBtnHtml()}
          </div>
          <pre><code class="editor-code">const y = 99;</code></pre>
        </div>
      `;

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '```js\nconst y = 99;\n```');
    });
  });

  describe('Inline Code Copying', () => {
    it('initInlineCodeCopy creates floating button outside editor canvas', () => {
      const editor = document.getElementById('editor')!;
      const viewport = document.querySelector('.document-viewport') as HTMLElement;

      initInlineCodeCopy(editor, viewport);

      const btn = document.getElementById('inline-code-copy-btn');
      assert.ok(btn, 'Floating inline code copy button should exist');
      assert.ok(!editor.contains(btn), 'Button must be outside editor canvas');
      assert.ok(viewport.contains(btn), 'Button should be in viewport');
    });

    it('hovering over inline code activates the copy button', () => {
      const editor = document.getElementById('editor')!;
      const viewport = document.querySelector('.document-viewport') as HTMLElement;
      initInlineCodeCopy(editor, viewport);

      editor.innerHTML = '<p class="editor-block">Use <code class="inline-code">npm install</code> to begin.</p>';
      const codeEl = editor.querySelector('code.inline-code') as HTMLElement;
      assert.ok(codeEl);

      // Mock bounding rects
      codeEl.getBoundingClientRect = () => ({
        top: 100,
        bottom: 120,
        left: 50,
        right: 150,
        width: 100,
        height: 20,
        x: 50,
        y: 100,
        toJSON: () => {},
      });
      codeEl.getClientRects = () =>
        [codeEl.getBoundingClientRect()] as unknown as DOMRectList;

      codeEl.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));

      const btn = document.getElementById('inline-code-copy-btn')!;
      assert.ok(btn.classList.contains('is-visible'), 'Button should become visible on hover');
      assert.strictEqual(btn.style.top, '86px'); // 100 - 14
    });

    it('clicking inline code copy button copies text and shows copied state', async () => {
      const editor = document.getElementById('editor')!;
      const viewport = document.querySelector('.document-viewport') as HTMLElement;
      initInlineCodeCopy(editor, viewport);

      editor.innerHTML = '<p class="editor-block">Check <code class="inline-code">git status</code> now.</p>';
      const codeEl = editor.querySelector('code.inline-code') as HTMLElement;

      codeEl.getBoundingClientRect = () => ({
        top: 100,
        bottom: 120,
        left: 50,
        right: 150,
        width: 100,
        height: 20,
        x: 50,
        y: 100,
        toJSON: () => {},
      });
      codeEl.getClientRects = () =>
        [codeEl.getBoundingClientRect()] as unknown as DOMRectList;

      codeEl.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));

      const btn = document.getElementById('inline-code-copy-btn')!;
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 15));

      assert.strictEqual(copiedText, 'git status');
      assert.ok(btn.classList.contains('is-copied'), 'Button should be in copied state');
      assert.strictEqual(btn.getAttribute('title'), 'Kopiert!');
    });

    it('domToMarkdown does not include floating copy button when serializing', () => {
      const editor = document.getElementById('editor')!;
      const viewport = document.querySelector('.document-viewport') as HTMLElement;
      initInlineCodeCopy(editor, viewport);

      editor.innerHTML = '<p class="editor-block">Run <code class="inline-code">npm test</code>.</p>';

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, 'Run `npm test`.');
    });
  });

  describe('updateCodeCopyLanguage', () => {
    it('switches button titles between German and English', () => {
      const editor = document.getElementById('editor')!;
      const viewport = document.querySelector('.document-viewport') as HTMLElement;
      initInlineCodeCopy(editor, viewport);

      editor.innerHTML = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            ${getCodeBlockCopyBtnHtml()}
          </div>
          <pre><code class="editor-code">foo()</code></pre>
        </div>
      `;

      const blockBtn = editor.querySelector('.code-copy-btn')!;
      const inlineBtn = document.getElementById('inline-code-copy-btn')!;

      assert.strictEqual(blockBtn.getAttribute('title'), 'Code kopieren');
      assert.strictEqual(inlineBtn.getAttribute('title'), 'Code kopieren');

      setWebviewLanguage('en');
      updateCodeCopyLanguage(document);

      assert.strictEqual(blockBtn.getAttribute('title'), 'Copy code');
      assert.strictEqual(inlineBtn.getAttribute('title'), 'Copy code');

      setWebviewLanguage('de');
      updateCodeCopyLanguage(document);

      assert.strictEqual(blockBtn.getAttribute('title'), 'Code kopieren');
      assert.strictEqual(inlineBtn.getAttribute('title'), 'Code kopieren');
    });
  });
});
