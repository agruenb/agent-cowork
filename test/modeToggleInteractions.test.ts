import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import {
  state,
  vscode,
  autoResizeRawTextarea,
  getRawWrapper,
  getRawGutter,
  getRawMirror,
} from '../src/webview/editorState';
import {
  setContentFormatted,
  toggleRawMode,
} from '../src/webview/markdownEditor';
import { updateRawLineNumbers } from '../src/webview/rawLineNumbers';
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
    toggleBtn = document.getElementById('btn-toggle-raw') as HTMLButtonElement;
    errorBanner = document.getElementById('error-banner')!;

    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;
    state.isCanvasDirty = false;
    state.debounceTimer = null;

    lastPostedMessage = null;
    (vscode as any).postMessage = (msg: any) => {
      lastPostedMessage = msg;
    };
  });

  it('toggling between formatted and raw mode without edits emits NO edit messages to VS Code', () => {
    const input = '# Pristine Document\n\n* List item 1\n* List item 2';
    setContentFormatted(input);
    lastPostedMessage = null;

    // Toggle to raw mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(lastPostedMessage, null, 'Switching to raw mode should NOT emit an edit message');

    // Toggle back to formatted mode without editing
    toggleRawMode();
    assert.strictEqual(state.isRawMode, false);
    assert.strictEqual(lastPostedMessage, null, 'Switching back to formatted mode should NOT emit an edit message');
  });

  it('switching to raw mode preserves original document markdown byte-for-byte when canvas was not edited', () => {
    // Asterisk bullets and specific spacing that domToMarkdown would reformat to '- '
    const input = '# Custom Formatting\n\n* bullet A\n* bullet B\n';
    setContentFormatted(input);

    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(textarea.value, input, 'Textarea value should preserve original asterisks and spacing');

    toggleRawMode();
    assert.strictEqual(state.isRawMode, false);
    assert.strictEqual(state.currentMarkdown, input, 'currentMarkdown should remain byte-for-byte identical');
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
    assert.ok(lastPostedMessage, 'Should post edit message when switching back with changes');
    assert.strictEqual(lastPostedMessage.type, 'edit');
    assert.strictEqual(lastPostedMessage.text, '# Updated Title\n\n- [ ] Task 1\n- [x] Task 2');
  });

  it('editing canvas in formatted mode serializes into raw mode when toggled and flushes pending edit', () => {
    setContentFormatted('# Original');
    lastPostedMessage = null;

    // Simulate canvas edit
    const h1 = editor.querySelector('h1')!;
    h1.textContent = 'Modified in Canvas';
    const { emitCanvasEdit } = require('../src/webview/editorState');
    emitCanvasEdit();

    assert.strictEqual(state.isCanvasDirty, true);

    // Toggle to raw mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(textarea.value.trim(), '# Modified in Canvas');
    assert.strictEqual(state.isCanvasDirty, false);
    assert.ok(lastPostedMessage, 'Pending canvas edit should be flushed when entering raw mode');
    assert.strictEqual(lastPostedMessage.type, 'edit');
    assert.strictEqual(lastPostedMessage.text.trim(), '# Modified in Canvas');
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

  it('autoResizeRawTextarea expands textarea height to fit content scrollHeight without inner scrollbar', () => {
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 1200,
    });

    autoResizeRawTextarea();

    assert.strictEqual(textarea.style.height, '1200px');
  });

  it('autoResizeRawTextarea enforces a minimum height of 500px for short documents', () => {
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 150,
    });

    autoResizeRawTextarea();

    assert.strictEqual(textarea.style.height, '500px');
  });

  it('autoResizeRawTextarea preserves viewport scroll position to eliminate scroll jumps', () => {
    const viewport = document.querySelector('.document-viewport') as HTMLElement;
    viewport.scrollTop = 350;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 1800,
    });

    autoResizeRawTextarea();

    assert.strictEqual(viewport.scrollTop, 350);
    assert.strictEqual(textarea.style.height, '1800px');
  });

  it('toggleRawMode invokes auto-resizing so the raw view displays as full scrollable content', () => {
    setContentFormatted('# Full Document\n\n' + 'Line of text\n'.repeat(50));
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 2400,
    });

    toggleRawMode();

    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(textarea.style.height, '2400px');
  });

  it('rawMode.css defines borderless, transparent, non-resizable document styling with overflow hidden', () => {
    const cssPath = path.resolve(__dirname, '../src/webview/styles/rawMode.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('border: none;'), 'Should have border: none');
    assert.ok(cssContent.includes('background-color: transparent;'), 'Should have background-color: transparent');
    assert.ok(cssContent.includes('resize: none;'), 'Should have resize: none');
    assert.ok(cssContent.includes('overflow-y: hidden;'), 'Should have overflow-y: hidden');
    assert.ok(cssContent.includes('field-sizing: content;'), 'Should have field-sizing: content');
    assert.ok(cssContent.includes('.raw-gutter {'), 'Should have .raw-gutter');
    assert.ok(cssContent.includes('.raw-gutter-line {'), 'Should have .raw-gutter-line');
    assert.ok(cssContent.includes('.raw-mirror {'), 'Should have .raw-mirror');
  });

  it('updateRawLineNumbers renders line numbers in gutter matching line count without altering text content', () => {
    const originalText = '# Title\n\nParagraph 1\nParagraph 2\n\n- [ ] Task item';
    textarea.value = originalText;

    updateRawLineNumbers();

    const gutter = getRawGutter()!;
    const lines = gutter.querySelectorAll<HTMLElement>('.raw-gutter-line');
    const expectedLineCount = originalText.split('\n').length; // 6 lines

    assert.strictEqual(lines.length, expectedLineCount);
    assert.strictEqual(lines[0].textContent, '1');
    assert.strictEqual(lines[0].getAttribute('data-line'), '1');
    assert.strictEqual(lines[5].textContent, '6');
    assert.strictEqual(lines[5].getAttribute('data-line'), '6');

    // Text content in textarea MUST remain untouched (no line number prefix inserted)
    assert.strictEqual(textarea.value, originalText);
  });

  it('clicking a line number in the gutter moves textarea caret to the start of that line', () => {
    textarea.value = 'First line\nSecond line\nThird line\nFourth line';
    updateRawLineNumbers();

    const gutter = getRawGutter()!;
    const line3 = gutter.querySelector<HTMLElement>('.raw-gutter-line[data-line="3"]')!;
    assert.ok(line3, 'Should find line 3 in gutter');

    // Expected offset of line 3 is length of "First line\n" (11) + "Second line\n" (12) = 23
    line3.click();

    assert.strictEqual(textarea.selectionStart, 23);
    assert.strictEqual(textarea.selectionEnd, 23);
  });

  it('toggleRawMode toggles raw-wrapper and raw-gutter display states in sync', () => {
    setContentFormatted('# Document');
    const rawWrapper = getRawWrapper()!;
    const rawGutter = getRawGutter()!;

    assert.strictEqual(rawWrapper.style.display, 'none');
    assert.strictEqual(rawGutter.style.display, 'none');

    // Toggle to raw mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);
    assert.strictEqual(rawWrapper.style.display, 'flex');
    assert.strictEqual(rawGutter.style.display, 'block');
    assert.strictEqual(textarea.style.display, 'block');

    // Toggle back to formatted mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, false);
    assert.strictEqual(rawWrapper.style.display, 'none');
    assert.strictEqual(rawGutter.style.display, 'none');
    assert.strictEqual(textarea.style.display, 'none');
  });
});
