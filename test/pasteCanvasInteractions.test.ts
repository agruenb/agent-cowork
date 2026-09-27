import assert from 'assert';
import { JSDOM } from 'jsdom';
import { handleCanvasPaste } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';
import { state } from '../src/webview/editorState';

describe('Canvas Paste Interactions (Maintaining Markdown formatting & stripping incompatible styling in DOM)', () => {
  let dom: JSDOM;
  let document: Document;
  let canvas: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor" class="editor-canvas" contenteditable="true"></div></body></html>');
    document = dom.window.document;
    canvas = document.getElementById('editor')!;
    (globalThis as any).document = document;
    (globalThis as any).window = dom.window;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
    state.hasParseError = false;
  });

  function createPasteEvent(html: string, plainText: string, target?: HTMLElement): ClipboardEvent {
    const event = new (dom.window as any).Event('paste', { bubbles: true, cancelable: true });
    (event as any).clipboardData = {
      getData: (type: string) => {
        if (type === 'text/html') return html;
        if (type === 'text/plain') return plainText;
        return '';
      },
    };
    if (target) {
      Object.defineProperty(event, 'target', { value: target, enumerable: true });
    }
    return event as ClipboardEvent;
  }

  function setSelection(node: Node, offset: number) {
    const sel = dom.window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('pasting formatted HTML into a paragraph maintains bold and strips colors and fonts', () => {
    canvas.innerHTML = '<p class="editor-block" data-block-type="paragraph">Hello </p>';
    const p = canvas.querySelector('p')!;
    const textNode = p.firstChild!;
    setSelection(textNode, 6); // cursor after "Hello "

    const event = createPasteEvent(
      '<span style="color: #ff0000; font-family: Roboto; font-weight: bold; background: yellow;">world</span>',
      'world',
      p
    );
    handleCanvasPaste(event, canvas);

    const strong = p.querySelector('strong');
    assert.ok(strong, 'strong element should exist');
    assert.strictEqual(strong?.textContent, 'world');
    assert.ok(!p.innerHTML.includes('#ff0000'), 'Color should be stripped');
    assert.ok(!p.innerHTML.includes('yellow'), 'Background should be stripped');
    assert.ok(!p.innerHTML.includes('Roboto'), 'Font should be stripped');

    const md = domToMarkdown(canvas).trim();
    assert.strictEqual(md, 'Hello **world**');
  });

  it('pasting a heading HTML block into an empty paragraph replaces it with formatted heading', () => {
    canvas.innerHTML = '<p class="editor-block" data-block-type="paragraph"><br></p>';
    const p = canvas.querySelector('p')!;
    setSelection(p, 0);

    const event = createPasteEvent(
      '<h2 style="color: blue; text-shadow: 1px 1px 2px black;">Section Title</h2>',
      'Section Title',
      p
    );
    handleCanvasPaste(event, canvas);

    const h2 = canvas.querySelector('h2');
    assert.ok(h2, 'h2 element should exist');
    assert.strictEqual(h2?.textContent, 'Section Title');
    assert.ok(!canvas.innerHTML.includes('blue'), 'Color should be stripped');
    assert.ok(!canvas.innerHTML.includes('text-shadow'), 'Text shadow should be stripped');

    const md = domToMarkdown(canvas).trim();
    assert.strictEqual(md, '## Section Title');
  });

  it('pasting a table HTML block into canvas preserves table structure and strips styles', () => {
    canvas.innerHTML = '<p class="editor-block" data-block-type="paragraph"><br></p>';
    const p = canvas.querySelector('p')!;
    setSelection(p, 0);

    const tableHtml = `
      <table style="border: 2px solid green; background-color: pink;">
        <tr><th style="color: red;">Column 1</th><th style="color: blue;">Column 2</th></tr>
        <tr><td style="color: purple;">Value 1</td><td style="background: cyan;">Value 2</td></tr>
      </table>
    `;
    const event = createPasteEvent(tableHtml, 'Column 1 Column 2\nValue 1 Value 2', p);
    handleCanvasPaste(event, canvas);

    const table = canvas.querySelector('table');
    assert.ok(table, 'table element should exist in canvas');
    assert.ok(!canvas.innerHTML.includes('pink'), 'Background should be stripped');
    assert.ok(!canvas.innerHTML.includes('green'), 'Border should be stripped');
    assert.ok(!canvas.innerHTML.includes('purple'), 'Text color should be stripped');

    const md = domToMarkdown(canvas).trim();
    assert.ok(md.includes('| Column 1 | Column 2 |'));
    assert.ok(md.includes('| Value 1 | Value 2 |'));
  });

  it('pasting plain text with Markdown syntax maintains Markdown formatting in canvas', () => {
    canvas.innerHTML = '<p class="editor-block" data-block-type="paragraph"><br></p>';
    const p = canvas.querySelector('p')!;
    setSelection(p, 0);

    const markdownText = '### Features\n\n- [x] Fast editor\n- [ ] Auto-save';
    const event = createPasteEvent('', markdownText, p);
    handleCanvasPaste(event, canvas);

    const h3 = canvas.querySelector('h3');
    assert.ok(h3, 'h3 heading should be created from markdown text');
    assert.strictEqual(h3?.textContent, 'Features');

    const checkboxes = canvas.querySelectorAll('input[type="checkbox"]');
    assert.strictEqual(checkboxes.length, 2, 'Checkboxes should be created');

    const md = domToMarkdown(canvas).trim();
    assert.ok(md.includes('### Features'));
    assert.ok(md.includes('- [x] Fast editor'));
    assert.ok(md.includes('- [ ] Auto-save'));
  });

  it('pasting inside a code block preserves raw text and avoids block/HTML formatting', () => {
    canvas.innerHTML = `
      <div class="editor-block-container widget-block" data-block-type="code_block">
        <pre><code class="editor-code" contenteditable="true">const x = 1;</code></pre>
      </div>
    `;
    const code = canvas.querySelector('code.editor-code')!;
    setSelection(code.firstChild!, 12); // end of code

    const event = createPasteEvent(
      '<p style="color: red;"><b>const y = 2;</b></p>',
      'const y = 2;',
      code
    );
    handleCanvasPaste(event, canvas);

    assert.ok(!code.querySelector('strong'), 'No strong tags should be created inside code');
    assert.ok(!code.querySelector('p'), 'No p tags should be created inside code');
    assert.ok(code.textContent?.includes('const y = 2;'));
  });

  it('pasting inside a table cell maintains inline formatting without breaking cell into block widget', () => {
    canvas.innerHTML = `
      <div class="editor-block-container widget-block" data-block-type="table">
        <table class="editor-table">
          <thead><tr><th>Header</th></tr></thead>
          <tbody><tr><td>Initial </td></tr></tbody>
        </table>
      </div>
    `;
    const td = canvas.querySelector('td')!;
    setSelection(td.firstChild!, 8); // after "Initial "

    const event = createPasteEvent(
      '<span style="font-weight: bold; color: red;">bold text</span>',
      'bold text',
      td
    );
    handleCanvasPaste(event, canvas);

    assert.ok(td.querySelector('strong'), 'strong element should exist inside td');
    assert.strictEqual(td.querySelector('strong')?.textContent, 'bold text');
    assert.ok(!td.innerHTML.includes('red'), 'Color should be stripped');
    // Ensure table was not replaced or broken
    assert.ok(canvas.querySelector('table'), 'Table should remain intact');
  });
});
