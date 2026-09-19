import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state, vscode } from '../src/webview/editorState';
import { wireToolbar } from '../src/webview/toolbarWiring';
import { setContentFormatted } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';

describe('User Interactions - Toolbar Button Wiring', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;
  let toggleRawCalled: boolean;
  let wireTaskCheckboxesCalled: boolean;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar" role="toolbar">
    <div class="toolbar-group">
      <select id="select-heading" class="tb-select">
        <option value="p">Normaler Text</option>
        <option value="h1">Überschrift 1</option>
        <option value="h2">Überschrift 2</option>
        <option value="h3">Überschrift 3</option>
      </select>
    </div>
    <div class="toolbar-group">
      <button id="btn-bold" class="tb-btn">B</button>
      <button id="btn-italic" class="tb-btn">I</button>
      <button id="btn-strike" class="tb-btn">S</button>
    </div>
    <div class="toolbar-group">
      <button id="btn-task" class="tb-btn">Task</button>
      <button id="btn-bullet" class="tb-btn">Bullet</button>
      <button id="btn-ordered" class="tb-btn">Ordered</button>
      <button id="btn-outdent" class="tb-btn">Outdent</button>
      <button id="btn-indent" class="tb-btn">Indent</button>
    </div>
    <div class="toolbar-group">
      <button id="btn-quote" class="tb-btn">Quote</button>
      <button id="btn-table" class="tb-btn">Table</button>
      <button id="btn-code" class="tb-btn">Code</button>
      <button id="btn-hr" class="tb-btn">HR</button>
    </div>
    <div class="toolbar-group">
      <button id="btn-undo" class="tb-btn">Undo</button>
      <button id="btn-redo" class="tb-btn">Redo</button>
    </div>
    <span id="word-count" class="word-count"></span>
    <button id="btn-toggle-raw" class="raw-toggle-btn">&lt;/&gt; Raw</button>
    <button id="btn-cowork" class="cowork-btn">Cowork</button>
  </div>
  <div id="error-banner" style="display: none;"><span id="error-banner-text"></span></div>
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
    (globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
    (globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;

    editor = document.getElementById('editor')!;
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;

    toggleRawCalled = false;
    wireTaskCheckboxesCalled = false;

    wireToolbar({
      toggleRawMode: () => {
        toggleRawCalled = true;
      },
      wireTaskCheckboxes: () => {
        wireTaskCheckboxesCalled = true;
      },
    });
  });

  function selectElement(el: Node, offset = 0) {
    const range = document.createRange();
    range.setStart(el, offset);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function highlightElement(el: Node, start = 0, end?: number) {
    const range = document.createRange();
    range.setStart(el, start);
    range.setEnd(el, end ?? (el.textContent?.length || 1));
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('clicking #btn-bullet starts a new list below paragraph when cursor is placed without selection', () => {
    setContentFormatted('Hello world');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-bullet') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const ul = editor.querySelector('ul.bullet-list');
    assert.ok(ul, 'Should create bullet list below paragraph');
    assert.strictEqual(editor.querySelectorAll('li').length, 1);
    assert.strictEqual(domToMarkdown(editor).trim(), 'Hello world\n\n-');
  });

  it('clicking #btn-bullet converts a paragraph into a bullet list item when text is highlighted', () => {
    setContentFormatted('Hello world');
    const p = editor.querySelector('p')!;
    highlightElement(p.firstChild || p);

    const btn = document.getElementById('btn-bullet') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const ul = editor.querySelector('ul.bullet-list');
    assert.ok(ul, 'Should create bullet list');
    assert.strictEqual(editor.querySelectorAll('li').length, 1);
    assert.strictEqual(domToMarkdown(editor).trim(), '- Hello world');
  });

  it('clicking #btn-ordered starts a new list below paragraph when cursor is placed without selection', () => {
    setContentFormatted('First step');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-ordered') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const ol = editor.querySelector('ol.ordered-list');
    assert.ok(ol, 'Should create ordered list below paragraph');
    assert.strictEqual(domToMarkdown(editor).trim(), 'First step\n\n1.');
  });

  it('clicking #btn-ordered converts a paragraph into an ordered list item when text is highlighted', () => {
    setContentFormatted('First step');
    const p = editor.querySelector('p')!;
    highlightElement(p.firstChild || p);

    const btn = document.getElementById('btn-ordered') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const ol = editor.querySelector('ol.ordered-list');
    assert.ok(ol, 'Should create ordered list');
    assert.strictEqual(domToMarkdown(editor).trim(), '1. First step');
  });

  it('clicking #btn-task starts a new list below paragraph when cursor is placed without selection', () => {
    setContentFormatted('Finish tests');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-task') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const taskLi = editor.querySelector('li.task-item');
    assert.ok(taskLi, 'Should create task item below paragraph');
    assert.strictEqual(domToMarkdown(editor).trim(), 'Finish tests\n\n- [ ]');
  });

  it('clicking #btn-task converts a paragraph into a task list item when text is highlighted', () => {
    setContentFormatted('Finish tests');
    const p = editor.querySelector('p')!;
    highlightElement(p.firstChild || p);

    const btn = document.getElementById('btn-task') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const taskLi = editor.querySelector('li.task-item');
    assert.ok(taskLi, 'Should create task item');
    assert.ok(taskLi?.querySelector('.task-checkbox'), 'Should contain task checkbox');
    assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Finish tests');
  });

  it('clicking #btn-table inserts a table widget into the editor', () => {
    setContentFormatted('Intro text');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-table') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const table = editor.querySelector('table.editor-table');
    assert.ok(table, 'Should insert table element');
    const headers = table?.querySelectorAll('th');
    assert.strictEqual(headers?.length, 3);
  });

  it('clicking #btn-quote inserts a blockquote widget', () => {
    setContentFormatted('Some text');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-quote') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const bq = editor.querySelector('blockquote.editor-block');
    assert.ok(bq, 'Should insert blockquote');
    assert.ok(domToMarkdown(editor).includes('> Zitat...'));
  });

  it('clicking #btn-hr inserts a horizontal rule widget', () => {
    setContentFormatted('Section 1');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const btn = document.getElementById('btn-hr') as HTMLButtonElement;
    assert.ok(btn);
    btn.click();

    const hr = editor.querySelector('hr');
    assert.ok(hr, 'Should insert hr element');
    assert.ok(domToMarkdown(editor).includes('---'));
  });

  it('changing #select-heading dropdown updates block to heading and back to paragraph', () => {
    setContentFormatted('Main Header');
    const p = editor.querySelector('p')!;
    selectElement(p.firstChild || p, 0);

    const select = document.getElementById('select-heading') as HTMLSelectElement;
    assert.ok(select);

    // Select H1
    select.value = 'h1';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    let h1 = editor.querySelector('h1');
    assert.ok(h1, 'Should convert to h1');
    assert.strictEqual(domToMarkdown(editor).trim(), '# Main Header');

    // Select H2
    selectElement(h1!.firstChild || h1!, 0);
    select.value = 'h2';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    let h2 = editor.querySelector('h2');
    assert.ok(h2, 'Should convert to h2');
    assert.strictEqual(domToMarkdown(editor).trim(), '## Main Header');

    // Revert to paragraph
    selectElement(h2!.firstChild || h2!, 0);
    select.value = 'p';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    const revertedP = editor.querySelector('p');
    assert.ok(revertedP, 'Should revert back to paragraph');
    assert.strictEqual(domToMarkdown(editor).trim(), 'Main Header');
  });

  it('clicking #btn-toggle-raw invokes hooks.toggleRawMode', () => {
    const rawBtn = document.getElementById('btn-toggle-raw') as HTMLButtonElement;
    assert.ok(rawBtn);
    assert.strictEqual(toggleRawCalled, false);

    rawBtn.click();
    assert.strictEqual(toggleRawCalled, true);
  });

  it('clicking #btn-cowork sends cowork message to VS Code', () => {
    let postedMessage: any = null;
    (vscode as any).postMessage = (msg: any) => {
      postedMessage = msg;
    };

    const coworkBtn = document.getElementById('btn-cowork') as HTMLButtonElement;
    assert.ok(coworkBtn);
    coworkBtn.click();

    assert.deepStrictEqual(postedMessage, { type: 'cowork' });
  });

  it('toolbar mousedown calls preventDefault to protect canvas focus for formatting buttons', () => {
    const toolbar = document.querySelector('.toolbar')!;
    const boldBtn = document.getElementById('btn-bold')!;

    let defaultPrevented = false;
    const event = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'defaultPrevented', {
      get: () => defaultPrevented,
    });
    event.preventDefault = () => {
      defaultPrevented = true;
    };

    boldBtn.dispatchEvent(event);
    assert.strictEqual(defaultPrevented, true, 'Should call preventDefault on formatting buttons');
  });

  it('toolbar mousedown does not preventDefault on toggle-raw or cowork buttons', () => {
    const rawBtn = document.getElementById('btn-toggle-raw')!;
    let defaultPrevented = false;
    const event = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    event.preventDefault = () => {
      defaultPrevented = true;
    };

    rawBtn.dispatchEvent(event);
    assert.strictEqual(defaultPrevented, false, 'Should allow default for raw toggle button');
  });

  it('clicking toolbar buttons in raw mode formats the raw textarea', () => {
    state.isRawMode = true;
    const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
    textarea.value = 'hello world';
    textarea.selectionStart = 0;
    textarea.selectionEnd = 5; // "hello" selected

    const boldBtn = document.getElementById('btn-bold') as HTMLButtonElement;
    boldBtn.click();

    assert.strictEqual(textarea.value, '**hello** world');
  });
});
