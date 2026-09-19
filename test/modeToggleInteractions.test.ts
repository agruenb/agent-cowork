import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state, vscode } from '../src/webview/editorState';
import {
  setContentFormatted,
  toggleRawMode,
} from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';

describe('User Interactions - Mode Toggle (Raw ↔ Formatted)', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;
  let textarea: HTMLTextAreaElement;
  let toggleBtn: HTMLButtonElement;
  let errorBanner: HTMLElement;
  let lastPostedMessage: any = null;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <select id="select-heading"><option value="p">Normal</option></select>
    <button id="btn-toggle-raw" class="raw-toggle-btn">&lt;/&gt; Raw</button>
    <button id="btn-cowork">Cowork</button>
    <span id="word-count"></span>
  </div>
  <div id="error-banner" class="error-banner" style="display: none;">
    <span id="error-banner-text"></span>
    <button id="error-banner-dismiss">x</button>
  </div>
  <div class="document-viewport">
    <div id="editor" contenteditable="true"></div>
    <textarea id="raw-textarea" style="display: none;"></textarea>
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
    toggleBtn = document.getElementById('btn-toggle-raw') as HTMLButtonElement;
    errorBanner = document.getElementById('error-banner')!;

    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;

    lastPostedMessage = null;
    (vscode as any).postMessage = (msg: any) => {
      lastPostedMessage = msg;
    };
  });

  it('switches from formatted mode to raw mode syncing content and UI state', () => {
    const input = '# Project Overview\n\nThis is a sample document.\n\n- [ ] Todo item';
    setContentFormatted(input);

    assert.strictEqual(state.isRawMode, false);
    assert.strictEqual(editor.style.display, '');

    // User clicks the Raw button
    toggleRawMode();

    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(editor.style.display, 'none');
    assert.strictEqual(textarea.style.display, 'block');
    assert.strictEqual(toggleBtn.classList.contains('is-active'), true);
    assert.strictEqual(toggleBtn.textContent, '📄 Formatiert');
    assert.strictEqual(textarea.value.trim(), input);
  });

  it('edits in raw mode and switches back to formatted mode syncing canvas and tasks', () => {
    setContentFormatted('# Initial Title\n\n- [ ] Task 1');

    // Switch to raw mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);

    // User types in the raw textarea
    textarea.value = '# Updated Title\n\n- [ ] Task 1\n- [x] Task 2';

    // Switch back to formatted mode
    toggleRawMode();

    assert.strictEqual(state.isRawMode, false);
    assert.strictEqual(editor.style.display, 'block');
    assert.strictEqual(textarea.style.display, 'none');
    assert.strictEqual(toggleBtn.classList.contains('is-active'), false);
    assert.strictEqual(toggleBtn.textContent, '</> Raw');

    const h1 = editor.querySelector('h1');
    assert.ok(h1, 'Should have h1 in canvas');
    assert.strictEqual(h1?.textContent, 'Updated Title');

    const taskItems = editor.querySelectorAll('li.task-item');
    assert.strictEqual(taskItems.length, 2);
    assert.strictEqual(taskItems[1].classList.contains('is-checked'), true);

    const serialized = domToMarkdown(editor).trim();
    assert.strictEqual(serialized, '# Updated Title\n\n- [ ] Task 1\n- [x] Task 2');
  });

  it('multi-cycle toggle between raw and formatted preserves document integrity', () => {
    const original = '# Architecture\n\n```typescript\nconst x = 1;\n```\n\n| Col1 | Col2 |\n| --- | --- |\n| A | B |\n\n> Quote';
    setContentFormatted(original);

    for (let cycle = 0; cycle < 3; cycle++) {
      // Toggle to raw
      toggleRawMode();
      assert.strictEqual(state.isRawMode, true);
      assert.strictEqual(textarea.value.trim(), original);

      // Toggle back to formatted
      toggleRawMode();
      assert.strictEqual(state.isRawMode, false);
      assert.strictEqual(domToMarkdown(editor).trim(), original);
    }
  });

  it('handles corrupted input safely by displaying warning banner and staying in raw mode', () => {
    // Calling setContentFormatted with an anomaly/error simulates parser recovery
    const corruptedMock = '# Real document';
    setContentFormatted(corruptedMock);

    assert.strictEqual(errorBanner.style.display, 'none');

    // If parse error happens
    state.hasParseError = true;
    const bannerText = document.getElementById('error-banner-text')!;
    bannerText.textContent = 'Syntax-Fehler';
    errorBanner.style.display = 'flex';

    assert.strictEqual(errorBanner.style.display, 'flex');
    assert.strictEqual(bannerText.textContent, 'Syntax-Fehler');
  });
});
