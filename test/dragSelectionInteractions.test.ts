import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  setContentFormatted,
  handleLineClickOrDragOutsideText,
} from '../src/webview/markdownEditor';

describe('User Interactions - Drag Selection Behind Text Lines', () => {
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
  </div>
  <div id="error-banner" style="display: none;"><span id="error-banner-text"></span></div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" class="editor-canvas" contenteditable="true"></div>
    </div>
  </div>
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
    (globalThis as any).Event = dom.window.Event;

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

  it('dragging from behind a list item text backwards selects text', () => {
    setContentFormatted('- Hello world');
    const li = editor.querySelector('li.list-item')!;
    assert.ok(li);

    mockTextBoundingBox(100);

    // Initial caret at offset 0
    const sel = window.getSelection()!;
    const r = document.createRange();
    r.setStart(li.firstChild!, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);

    let defaultPrevented = false;
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 20,
      button: 0,
    });
    mousedownEvent.preventDefault = () => {
      defaultPrevented = true;
    };
    Object.defineProperty(mousedownEvent, 'target', { value: li });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);
    assert.strictEqual(defaultPrevented, true);

    // Caret initially at end of "Hello world" (offset 11)
    assert.strictEqual(sel.anchorNode, li.firstChild);
    assert.strictEqual(sel.anchorOffset, 11);

    // Mock caretRangeFromPoint during drag to simulate cursor over character offset 5 (after "Hello")
    (document as any).caretRangeFromPoint = (_x: number, _y: number) => {
      const dragRange = document.createRange();
      dragRange.setStart(li.firstChild!, 5);
      dragRange.collapse(true);
      return dragRange;
    };

    // Simulate drag: mousemove with left button held down (buttons = 1)
    const mousemoveEvent = new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 20,
      buttons: 1,
    });
    document.dispatchEvent(mousemoveEvent);

    // Selection must now extend from offset 11 backwards to offset 5 (" world")
    assert.strictEqual(sel.anchorNode, li.firstChild);
    assert.strictEqual(sel.anchorOffset, 11);
    assert.strictEqual(sel.focusNode, li.firstChild);
    assert.strictEqual(sel.focusOffset, 5);

    // Simulate mouseup
    let selectionChangeDispatched = false;
    document.addEventListener('selectionchange', () => {
      selectionChangeDispatched = true;
    });
    const mouseupEvent = new dom.window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 20,
    });
    document.dispatchEvent(mouseupEvent);

    assert.strictEqual(selectionChangeDispatched, true);
    // Selection is preserved after mouseup
    assert.strictEqual(sel.anchorOffset, 11);
    assert.strictEqual(sel.focusOffset, 5);
  });

  it('dragging from behind a paragraph selects text down across lines', () => {
    setContentFormatted('Paragraph one\n\nParagraph two');
    const paragraphs = editor.querySelectorAll('p.editor-block');
    assert.strictEqual(paragraphs.length, 2);

    const p1 = paragraphs[0];
    const p2 = paragraphs[1];

    mockTextBoundingBox(120);

    const sel = window.getSelection()!;

    // Mousedown behind paragraph one (clientX = 500, past textRight = 120)
    let defaultPrevented = false;
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 20,
      button: 0,
    });
    mousedownEvent.preventDefault = () => {
      defaultPrevented = true;
    };
    Object.defineProperty(mousedownEvent, 'target', { value: p1 });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);
    assert.strictEqual(defaultPrevented, true);

    // Initial anchor is at end of p1 ("Paragraph one" length = 13)
    assert.strictEqual(sel.anchorNode, p1.firstChild);
    assert.strictEqual(sel.anchorOffset, 13);

    // Mock caretRangeFromPoint to return end of p2 during downwards drag
    (document as any).caretRangeFromPoint = (_x: number, _y: number) => {
      const dragRange = document.createRange();
      dragRange.setStart(p2.firstChild!, 13);
      dragRange.collapse(true);
      return dragRange;
    };

    // Simulate drag down to paragraph two
    const mousemoveEvent = new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 60,
      buttons: 1,
    });
    document.dispatchEvent(mousemoveEvent);

    // Selection must now span from end of p1 to end of p2
    assert.strictEqual(sel.anchorNode, p1.firstChild);
    assert.strictEqual(sel.anchorOffset, 13);
    assert.strictEqual(sel.focusNode, p2.firstChild);
    assert.strictEqual(sel.focusOffset, 13);

    // End drag with mouseup
    document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  });

  it('dragging from behind a heading selects text', () => {
    setContentFormatted('# Chapter Heading\n\nContent paragraph');
    const h1 = editor.querySelector('h1.editor-block')!;
    assert.ok(h1);

    mockTextBoundingBox(150);

    const sel = window.getSelection()!;

    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 450,
      clientY: 20,
      button: 0,
    });
    Object.defineProperty(mousedownEvent, 'target', { value: h1 });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);
    assert.strictEqual(sel.anchorNode, h1.firstChild);
    assert.strictEqual(sel.anchorOffset, 15); // End of "Chapter Heading"

    // Drag backwards along the heading
    (document as any).caretRangeFromPoint = (_x: number, _y: number) => {
      const dragRange = document.createRange();
      dragRange.setStart(h1.firstChild!, 8); // After "Chapter "
      dragRange.collapse(true);
      return dragRange;
    };

    document.dispatchEvent(
      new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 20,
        buttons: 1,
      })
    );

    assert.strictEqual(sel.focusNode, h1.firstChild);
    assert.strictEqual(sel.focusOffset, 8);

    document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  });

  it('clicking or dragging in empty viewport outside editor canvas aligned with line initiates selection', () => {
    setContentFormatted('- Viewport line');
    const li = editor.querySelector('li.list-item')!;
    assert.ok(li);

    mockTextBoundingBox(100);

    // Mock getBoundingClientRect on li to match clientY = 20
    li.getBoundingClientRect = () =>
      ({
        top: 10,
        bottom: 30,
        left: 50,
        right: 800,
        width: 750,
        height: 20,
      } as DOMRect);

    const viewport = document.querySelector('.document-viewport')!;
    assert.ok(viewport);

    const sel = window.getSelection()!;

    // Mousedown on viewport at clientX = 1000, clientY = 20
    let defaultPrevented = false;
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 1000,
      clientY: 20,
      button: 0,
    });
    mousedownEvent.preventDefault = () => {
      defaultPrevented = true;
    };
    Object.defineProperty(mousedownEvent, 'target', { value: viewport });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);
    assert.strictEqual(defaultPrevented, true);

    // Caret placed at end of "Viewport line" (length = 13)
    assert.strictEqual(sel.anchorNode, li.firstChild);
    assert.strictEqual(sel.anchorOffset, 13);
  });

  it('clicking directly on text does not trigger line-end placement or prevent default', () => {
    setContentFormatted('Normal paragraph text');
    const p = editor.querySelector('p.editor-block')!;
    assert.ok(p);

    mockTextBoundingBox(150);

    let defaultPrevented = false;
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 50, // Inside text bounds (50 < 150)
      clientY: 20,
      button: 0,
    });
    mousedownEvent.preventDefault = () => {
      defaultPrevented = true;
    };
    Object.defineProperty(mousedownEvent, 'target', { value: p });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, false);
    assert.strictEqual(defaultPrevented, false);
  });

  it('clicking interactive elements like input or button is ignored', () => {
    setContentFormatted('- [ ] Task item');
    const cb = editor.querySelector('input.task-checkbox')!;
    assert.ok(cb);

    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 20,
      button: 0,
    });
    Object.defineProperty(mousedownEvent, 'target', { value: cb });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, false);
  });

  it('clicking left of the document flow places cursor at the start of the line instead of top of document', () => {
    setContentFormatted('# Header\n\nParagraph text here');
    const p = editor.querySelector('p.editor-block')!;
    assert.ok(p);

    mockTextBoundingBox(200);

    // Mock p bounding box aligned with clientY = 50, left = 100
    p.getBoundingClientRect = () =>
      ({
        top: 40,
        bottom: 60,
        left: 100,
        right: 800,
        width: 700,
        height: 20,
      } as DOMRect);

    const viewport = document.querySelector('.document-viewport')!;
    assert.ok(viewport);

    // Mousedown on viewport at clientX = 10 (left of document container / line), clientY = 50
    let defaultPrevented = false;
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 50,
      button: 0,
    });
    mousedownEvent.preventDefault = () => {
      defaultPrevented = true;
    };
    Object.defineProperty(mousedownEvent, 'target', { value: viewport });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);
    assert.strictEqual(defaultPrevented, true);

    const sel = window.getSelection()!;
    // Cursor must now be placed at the START of "Paragraph text here" (offset 0), NOT at the header or top
    assert.strictEqual(sel.anchorNode, p.firstChild);
    assert.strictEqual(sel.anchorOffset, 0);
  });

  it('dragging starting from left of the document flow selects text forward from start of line', () => {
    setContentFormatted('First paragraph text\n\nSecond line text');
    const paragraphs = editor.querySelectorAll('p.editor-block');
    const p1 = paragraphs[0];

    mockTextBoundingBox(200);

    p1.getBoundingClientRect = () =>
      ({
        top: 10,
        bottom: 30,
        left: 100,
        right: 800,
        width: 700,
        height: 20,
      } as DOMRect);

    const viewport = document.querySelector('.document-viewport')!;
    assert.ok(viewport);

    // Mousedown to the left of the document flow
    const mousedownEvent = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 20,
      button: 0,
    });
    Object.defineProperty(mousedownEvent, 'target', { value: viewport });

    const handled = handleLineClickOrDragOutsideText(mousedownEvent, editor);
    assert.strictEqual(handled, true);

    const sel = window.getSelection()!;
    assert.strictEqual(sel.anchorNode, p1.firstChild);
    assert.strictEqual(sel.anchorOffset, 0);

    // Mock drag position over character offset 5 (selecting "First")
    (document as any).caretRangeFromPoint = (_x: number, _y: number) => {
      const dragRange = document.createRange();
      dragRange.setStart(p1.firstChild!, 5);
      dragRange.collapse(true);
      return dragRange;
    };

    const mousemoveEvent = new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 150,
      clientY: 20,
      buttons: 1,
    });
    document.dispatchEvent(mousemoveEvent);

    assert.strictEqual(sel.anchorNode, p1.firstChild);
    assert.strictEqual(sel.anchorOffset, 0);
    assert.strictEqual(sel.focusNode, p1.firstChild);
    assert.strictEqual(sel.focusOffset, 5);

    document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  });
});
