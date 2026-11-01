import assert from 'assert';
import { JSDOM } from 'jsdom';
import { handleWidgetSelectionExtend } from '../src/webview/widgetSelection';

describe('Widget selection extension (Alt/Option+Shift+Arrow)', () => {
  let dom: JSDOM;
  let document: Document;
  let canvas: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body><div id="editor-canvas" contenteditable="true">
      <p id="outside">Outside text</p>
      <div class="editor-block-container widget-block" contenteditable="false">
        <blockquote id="quote" contenteditable="true"><p id="q1">first line</p><p id="q2">second line</p></blockquote>
      </div>
    </div></body></html>`);
    document = dom.window.document;
    canvas = document.getElementById('editor-canvas')!;
  });

  function place(node: Node, offset: number): Selection {
    const sel = dom.window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  function keydown(key: string, mods: Partial<KeyboardEventInit> = { altKey: true, shiftKey: true }): KeyboardEvent {
    return new dom.window.KeyboardEvent('keydown', { key, cancelable: true, ...mods });
  }

  it('clamps an extension that escapes the widget to the widget boundary and keeps the anchor', () => {
    const q1Text = document.getElementById('q1')!.firstChild!;
    const sel = place(q1Text, 6);
    const outside = document.getElementById('outside')!.firstChild!;
    // Simulate Chromium walking out of the nested editing host
    (sel as any).modify = () => sel.extend(outside, 0);

    const e = keydown('ArrowUp');
    assert.strictEqual(handleWidgetSelectionExtend(e, canvas), true);
    assert.strictEqual(e.defaultPrevented, true);
    assert.strictEqual(sel.anchorNode, q1Text);
    assert.strictEqual(sel.anchorOffset, 6);
    assert.strictEqual(sel.focusNode, document.getElementById('quote'));
    assert.strictEqual(sel.focusOffset, 0);
    assert.strictEqual(sel.toString(), 'first ');
  });

  it('keeps an in-widget extension as computed', () => {
    const q1Text = document.getElementById('q1')!.firstChild!;
    const sel = place(q1Text, 0);
    (sel as any).modify = () => sel.extend(q1Text, 5);

    assert.strictEqual(handleWidgetSelectionExtend(keydown('ArrowRight'), canvas), true);
    assert.strictEqual(sel.toString(), 'first');
  });

  it('ignores the event outside widgets and without Alt+Shift', () => {
    const sel = place(document.getElementById('outside')!.firstChild!, 0);
    (sel as any).modify = () => {};
    assert.strictEqual(handleWidgetSelectionExtend(keydown('ArrowRight'), canvas), false);

    place(document.getElementById('q1')!.firstChild!, 0);
    assert.strictEqual(handleWidgetSelectionExtend(keydown('ArrowRight', { shiftKey: true }), canvas), false);
  });
});
