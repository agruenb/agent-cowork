import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  clearInlineCodeEdge,
  findInlineCodeEdgeAt,
  getInlineCodeEdge,
  handleInlineCodeArrowKey,
  handleInlineCodeBeforeInput,
  handleInlineCodeMouseUp,
  setInlineCodeEdge,
  syncInlineCodeEdgeFromSelection,
} from '../src/webview/inlineCodeCaret';
import { serializeInlineNodes } from '../src/markdown/serializer';

describe('Inline code edge caret', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let canvas: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body><div id="editor" class="editor-canvas" contenteditable="true"></div></body></html>`);
    window = dom.window as unknown as Window;
    document = dom.window.document;
    canvas = document.getElementById('editor')!;
  });

  afterEach(() => clearInlineCodeEdge(canvas));

  function setContent(html: string): { p: HTMLElement; code: HTMLElement } {
    canvas.innerHTML = `<p class="editor-block">${html}</p>`;
    return { p: canvas.querySelector('p')!, code: canvas.querySelector('code')! };
  }

  function setCaret(node: Node, offset: number) {
    window.getSelection()!.collapse(node, offset);
    syncInlineCodeEdgeFromSelection(canvas);
  }

  function caret(): { node: Node; offset: number } {
    const sel = window.getSelection()!;
    return { node: sel.focusNode!, offset: sel.focusOffset };
  }

  function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
    return new dom.window.KeyboardEvent('keydown', { key: k, cancelable: true, ...init }) as unknown as KeyboardEvent;
  }

  function type(data: string): boolean {
    const e = new dom.window.InputEvent('beforeinput', {
      inputType: 'insertText',
      data,
      cancelable: true,
    }) as unknown as InputEvent;
    return handleInlineCodeBeforeInput(e, canvas);
  }

  function side(): string | undefined {
    return getInlineCodeEdge()?.side;
  }

  describe('edge detection', () => {
    it('maps every DOM position at an edge to its literal side', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      const [before, , after] = Array.from(p.childNodes);
      const inner = code.firstChild!;
      assert.strictEqual(findInlineCodeEdgeAt(before, 2, canvas)?.side, 'outside-start');
      assert.strictEqual(findInlineCodeEdgeAt(p, 1, canvas)?.side, 'outside-start');
      assert.strictEqual(findInlineCodeEdgeAt(inner, 0, canvas)?.side, 'inside-start');
      assert.strictEqual(findInlineCodeEdgeAt(inner, 2, canvas)?.side, 'inside-end');
      assert.strictEqual(findInlineCodeEdgeAt(after, 0, canvas)?.side, 'outside-end');
      assert.strictEqual(findInlineCodeEdgeAt(p, 2, canvas)?.side, 'outside-end');
      assert.strictEqual(findInlineCodeEdgeAt(inner, 1, canvas), null);
      assert.strictEqual(findInlineCodeEdgeAt(before, 1, canvas), null);
    });

    it('ignores fenced code blocks', () => {
      canvas.innerHTML =
        '<div class="editor-block code-block-wrapper"><pre><code class="editor-code">abc</code></pre></div>';
      const text = canvas.querySelector('code')!.firstChild!;
      assert.strictEqual(findInlineCodeEdgeAt(text, 3, canvas), null);
    });

    it('keeps a chosen side while the browser reports the other DOM position of the same edge', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      // Browser canonicalises the caret into the code text
      setCaret(code.firstChild!, 2);
      assert.strictEqual(side(), 'outside-end');
      // Moving somewhere else drops the remembered side
      setCaret(p.lastChild!, 1);
      assert.strictEqual(getInlineCodeEdge(), null);
    });

    it('marks the snippet with the side so the custom caret is drawn', () => {
      const { code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'inside-start' });
      assert.strictEqual(code.getAttribute('data-caret-edge'), 'inside-start');
      assert.ok(canvas.classList.contains('inline-code-caret-active'));
      clearInlineCodeEdge(canvas);
      assert.strictEqual(code.hasAttribute('data-caret-edge'), false);
      assert.ok(!canvas.classList.contains('inline-code-caret-active'));
    });
  });

  describe('arrow keys', () => {
    it('steps through all four edge positions', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      const inner = code.firstChild!;

      setCaret(p.firstChild!, 2);
      assert.strictEqual(side(), 'outside-start');

      const right1 = key('ArrowRight');
      assert.strictEqual(handleInlineCodeArrowKey(right1, canvas), true);
      assert.ok(right1.defaultPrevented);
      assert.strictEqual(side(), 'inside-start');
      assert.deepStrictEqual(caret(), { node: inner, offset: 0 });

      const left1 = key('ArrowLeft');
      assert.strictEqual(handleInlineCodeArrowKey(left1, canvas), true);
      assert.strictEqual(side(), 'outside-start');
      assert.deepStrictEqual(caret(), { node: p.firstChild, offset: 2 });

      // Last character → inside-end is a normal browser move
      setCaret(inner, 2);
      assert.strictEqual(side(), 'inside-end');
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowRight'), canvas), true);
      assert.strictEqual(side(), 'outside-end');
      assert.deepStrictEqual(caret(), { node: p.lastChild, offset: 0 });

      // One more → is left to the browser
      const right3 = key('ArrowRight');
      assert.strictEqual(handleInlineCodeArrowKey(right3, canvas), false);
      assert.ok(!right3.defaultPrevented);

      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowLeft'), canvas), true);
      assert.strictEqual(side(), 'inside-end');
      assert.deepStrictEqual(caret(), { node: inner, offset: 2 });
    });

    it('leaves presses with modifiers or away from edges to the browser', () => {
      const { code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'inside-end' });
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowRight', { shiftKey: true }), canvas), false);
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowRight', { altKey: true }), canvas), false);
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowLeft'), canvas), false);

      setCaret(code.firstChild!, 1);
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowRight'), canvas), false);
    });

    it('reaches outside-end when the snippet ends the paragraph', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>');
      setCaret(code.firstChild!, 2);
      assert.strictEqual(handleInlineCodeArrowKey(key('ArrowRight'), canvas), true);
      assert.strictEqual(side(), 'outside-end');
      assert.deepStrictEqual(caret(), { node: p, offset: 2 });
    });
  });

  describe('typing', () => {
    it('extends the snippet at inside positions', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'inside-end' });
      assert.strictEqual(type('z'), true);
      assert.strictEqual(type('!'), true);
      setInlineCodeEdge(canvas, { code, side: 'inside-start' });
      assert.strictEqual(type('>'), true);
      assert.strictEqual(serializeInlineNodes(p), 'ab`>xyz!`cd');
    });

    it('adds plain text at outside positions without changing the code', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      type('Q');
      setInlineCodeEdge(canvas, { code, side: 'outside-start' });
      type('P');
      type('R');
      assert.strictEqual(serializeInlineNodes(p), 'abPR`xy`Qcd');
      assert.strictEqual(code.textContent, 'xy');
    });

    it('creates a text node when the snippet starts or ends the paragraph', () => {
      const { p, code } = setContent('<code class="inline-code">xy</code>');
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      type('a');
      setInlineCodeEdge(canvas, { code, side: 'outside-start' });
      type('b');
      assert.strictEqual(serializeInlineNodes(p), 'b`xy`a');
      assert.strictEqual(p.childNodes.length, 3);
    });

    it('keeps a space at the end of a block visible', () => {
      const { p, code } = setContent('ab <code class="inline-code">xy</code>');
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      type(' ');
      assert.strictEqual(p.lastChild!.nodeValue, ' ');
      // Further typing continues natively after the space
      assert.deepStrictEqual(caret(), { node: p.lastChild, offset: 1 });
    });

    it('keeps a space typed inside the snippet at the end of a block visible', () => {
      const { code } = setContent('ab <code class="inline-code">xy</code>');
      setInlineCodeEdge(canvas, { code, side: 'inside-end' });
      type(' ');
      assert.strictEqual(code.textContent, 'xy ');
    });

    it('uses a normal space between visible characters', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      type(' ');
      assert.strictEqual(serializeInlineNodes(p), 'ab`xy` cd');
    });

    it('fires an input event so the edit is saved', () => {
      const { code } = setContent('ab<code class="inline-code">xy</code>cd');
      let inputs = 0;
      canvas.addEventListener('input', () => inputs++);
      setInlineCodeEdge(canvas, { code, side: 'outside-end' });
      type('z');
      assert.strictEqual(inputs, 1);
    });

    it('does not intercept typing in the middle of the code or in plain text', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      setCaret(code.firstChild!, 1);
      assert.strictEqual(type('z'), false);
      setCaret(p.firstChild!, 1);
      assert.strictEqual(type('z'), false);
    });
  });

  describe('mouse', () => {
    function stubRect(el: HTMLElement, left: number, right: number) {
      const rect = { left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0 } as DOMRect;
      el.getClientRects = () => [rect] as unknown as DOMRectList;
      el.getBoundingClientRect = () => rect;
    }

    function mouseUp(clientX: number) {
      const e = new dom.window.MouseEvent('mouseup', { button: 0, clientX, clientY: 10 }) as unknown as MouseEvent;
      handleInlineCodeMouseUp(e, canvas);
    }

    it('chooses inside or outside by where the click landed, at both edges', () => {
      const { p, code } = setContent('ab<code class="inline-code">xy</code>cd');
      stubRect(code, 100, 140);

      // Browser placed the caret on the start edge (reported as outside)
      window.getSelection()!.collapse(p.firstChild!, 2);
      mouseUp(103); // on the left padding
      assert.strictEqual(side(), 'inside-start');
      assert.deepStrictEqual(caret(), { node: code.firstChild, offset: 0 });

      window.getSelection()!.collapse(code.firstChild!, 0);
      mouseUp(97);
      assert.strictEqual(side(), 'outside-start');

      window.getSelection()!.collapse(p.lastChild!, 0);
      mouseUp(138); // on the right padding
      assert.strictEqual(side(), 'inside-end');

      window.getSelection()!.collapse(code.firstChild!, 2);
      mouseUp(150);
      assert.strictEqual(side(), 'outside-end');
      assert.deepStrictEqual(caret(), { node: p.lastChild, offset: 0 });
    });
  });
});
