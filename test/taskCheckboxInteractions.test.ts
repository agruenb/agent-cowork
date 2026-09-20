import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state } from '../src/webview/editorState';
import { setContentFormatted, wireTaskCheckboxes } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';

describe('User Interactions - Task Checkboxes', () => {
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
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;
  });

  it('clicking unchecked checkbox checks it, updates classes, and updates DOM attributes', () => {
    setContentFormatted('- [ ] First task\n- [ ] Second task');

    const checkboxes = editor.querySelectorAll<HTMLInputElement>('.task-checkbox');
    assert.strictEqual(checkboxes.length, 2);

    const firstCheckbox = checkboxes[0];
    const firstLi = firstCheckbox.closest('li')!;
    assert.strictEqual(firstLi.classList.contains('is-checked'), false);
    assert.strictEqual(firstLi.getAttribute('data-checked'), 'false');

    // Simulate user click / change event
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.strictEqual(firstLi.classList.contains('is-checked'), true);
    assert.strictEqual(firstLi.getAttribute('data-checked'), 'true');
    assert.strictEqual(domToMarkdown(editor).trim(), '- [x] First task\n- [ ] Second task');
  });

  it('clicking checked checkbox unchecks it and updates serialization', () => {
    setContentFormatted('- [x] Completed task');

    const checkbox = editor.querySelector<HTMLInputElement>('.task-checkbox')!;
    const li = checkbox.closest('li')!;
    assert.strictEqual(li.classList.contains('is-checked'), true);
    assert.strictEqual(li.getAttribute('data-checked'), 'true');

    // Simulate user unchecking
    checkbox.checked = false;
    checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.strictEqual(li.classList.contains('is-checked'), false);
    assert.strictEqual(li.getAttribute('data-checked'), 'false');
    assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Completed task');
  });
});
