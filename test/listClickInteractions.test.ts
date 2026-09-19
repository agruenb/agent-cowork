import assert from 'assert';
import { JSDOM } from 'jsdom';
import { setContentFormatted, handleListItemClickOutsideText } from '../src/webview/markdownEditor';

describe('User Interactions - List Item Click Caret Placement', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <select id="select-heading"><option value="p">Normal</option></select>
    <button id="btn-toggle-raw">Raw</button>
    <button id="btn-cowork">Cowork</button>
    <span id="word-count"></span>
  </div>
  <div id="error-banner" style="display: none;"><span id="error-banner-text"></span></div>
  <div id="editor" contenteditable="true"></div>
  <textarea id="raw-textarea" style="display: none;"></textarea>
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

    editor = document.getElementById('editor')!;
  });

  function mockTextBoundingBox(textRight: number) {
    const origCreateRange = document.createRange.bind(document);
    document.createRange = () => {
      const range = origCreateRange();
      range.getClientRects = () => [
        {
          left: 10,
          right: textRight,
          top: 10,
          bottom: 30,
          width: textRight - 10,
          height: 20,
        } as DOMRect,
      ];
      return range;
    };
  }

  it('clicking in a bullet list item outside the text places the cursor at the end of the line instead of start', () => {
    setContentFormatted('- Hello world');
    const li = editor.querySelector('li.list-item')!;
    assert.ok(li);

    // Mock text taking up 100px width (right = 100)
    mockTextBoundingBox(100);

    // Initial cursor placed at start by browser default
    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(li.firstChild!, 0);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);
    assert.strictEqual(sel.anchorOffset, 0);

    // User clicks at clientX = 400 (far to the right of text)
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: li });

    handleListItemClickOutsideText(event, editor);

    // Cursor must now be placed at the END of the text (offset 11)
    assert.strictEqual(sel.anchorNode, li.firstChild);
    assert.strictEqual(sel.anchorOffset, 11);
  });

  it('clicking in a task list item outside the text places cursor at the end of the text', () => {
    setContentFormatted('- [ ] Finish task');
    const li = editor.querySelector('li.task-item')!;
    assert.ok(li);
    const contentSpan = li.querySelector('.task-content')!;
    assert.ok(contentSpan);

    mockTextBoundingBox(120);

    // Initially at start of task-content
    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(contentSpan.firstChild!, 0);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);

    // User clicks at clientX = 500 (empty space on the right of the line)
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: contentSpan });

    handleListItemClickOutsideText(event, editor);

    // Cursor must now be at the end of "Finish task" (offset 11)
    assert.strictEqual(sel.anchorNode, contentSpan.firstChild);
    assert.strictEqual(sel.anchorOffset, 11);
  });

  it('clicking in an ordered list item outside text places cursor at the end of text', () => {
    setContentFormatted('1. Numbered step');
    const li = editor.querySelector('li.list-item')!;
    assert.ok(li);

    mockTextBoundingBox(110);

    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(li.firstChild!, 0);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);

    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 350,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: li });

    handleListItemClickOutsideText(event, editor);

    assert.strictEqual(sel.anchorNode, li.firstChild);
    assert.strictEqual(sel.anchorOffset, 13);
  });

  it('clicking in parent list item with sublist places cursor at end of parent text before sublist', () => {
    setContentFormatted('- Parent item\n  - Child item');
    const lis = editor.querySelectorAll('li.list-item');
    const parentLi = lis[0];
    assert.ok(parentLi);

    mockTextBoundingBox(90);

    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(parentLi.firstChild!, 0);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);

    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: parentLi });

    handleListItemClickOutsideText(event, editor);

    // Must be at the end of "Parent item" (offset 11), NOT inside child ul
    assert.strictEqual(sel.anchorNode, parentLi.firstChild);
    assert.strictEqual(sel.anchorOffset, 11);
  });

  it('clicking directly on text does not force caret to the end', () => {
    setContentFormatted('- Normal text');
    const li = editor.querySelector('li.list-item')!;
    assert.ok(li);

    mockTextBoundingBox(100);

    // Caret was placed by browser at offset 3 ('Nor|mal text')
    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(li.firstChild!, 3);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);

    // Click happened inside the text bounding box (clientX = 40 < 100)
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: li });

    handleListItemClickOutsideText(event, editor);

    // Caret remains undisturbed at offset 3
    assert.strictEqual(sel.anchorOffset, 3);
  });

  it('clicking checkbox toggles checkbox and does not reposition caret', () => {
    setContentFormatted('- [ ] Buy milk');
    const li = editor.querySelector('li.task-item')!;
    const cb = li.querySelector('input.task-checkbox')!;

    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 20,
    });
    Object.defineProperty(event, 'target', { value: cb });

    const sel = window.getSelection()!;
    const initialRange = document.createRange();
    initialRange.setStart(li, 0);
    initialRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(initialRange);

    handleListItemClickOutsideText(event, editor);

    // Target is input, function returns immediately
    assert.strictEqual(sel.anchorNode, li);
    assert.strictEqual(sel.anchorOffset, 0);
  });
});
