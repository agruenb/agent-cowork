import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state } from '../src/webview/editorState';
import { setContentFormatted, wireTaskCheckboxes, initMarkdownEditor } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';
import { toggleListBlock } from '../src/webview/toolbarOperations';
import { handleTableKeyDown, focusCell } from '../src/webview/tableInteractions/tableKeyboard';
import { addTableRow } from '../src/webview/tableInteractions/tableInsertDelete';
import { applyRawFormatting } from '../src/webview/rawModeOperations';

describe('Table Checkbox Cell Interactions', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <button id="btn-task">Aufgabe</button>
    <button id="btn-bullet">Liste</button>
    <button id="btn-ordered">Nummeriert</button>
    <button id="btn-table">Tabelle</button>
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
    (globalThis as any).HTMLTableElement = dom.window.HTMLTableElement;
    (globalThis as any).HTMLTableRowElement = dom.window.HTMLTableRowElement;
    (globalThis as any).Event = dom.window.Event;
    (globalThis as any).MouseEvent = dom.window.MouseEvent;
    (globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;

    editor = document.getElementById('editor')!;
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;

    initMarkdownEditor();
  });

  /** Helper: set cursor selection on an element */
  function selectElement(el: Node, offset = 0) {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(el, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('converting a normal table cell to a checkbox does not break the table and creates a checkbox cell', () => {
    setContentFormatted('| Spalte 1 | Spalte 2 |\n| --- | --- |\n| Zelle 1 | Zelle 2 |');

    const table = editor.querySelector('table.editor-table');
    assert.ok(table, 'Table should exist');

    const firstTd = editor.querySelector('tbody td') as HTMLElement;
    assert.ok(firstTd, 'First td should exist');
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), false);

    // Select the first td
    selectElement(firstTd.firstChild || firstTd, 0);

    // Trigger toggleListBlock with 'task' (same as clicking #btn-task)
    toggleListBlock(editor, 'task');

    // Verify table is still present and NOT replaced with a list
    const stillTable = editor.querySelector('table.editor-table');
    assert.ok(stillTable, 'Table must still exist and not be broken or replaced by a list');
    assert.strictEqual(editor.querySelectorAll('ul.task-list').length, 0, 'Must not create a ul.task-list block');

    // Verify cell is now a checkbox cell
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), true);
    assert.strictEqual(firstTd.getAttribute('data-checked'), 'false');
    const cb = firstTd.querySelector('input.table-cell-checkbox') as HTMLInputElement;
    assert.ok(cb, 'Should contain a table-cell-checkbox input');
    assert.strictEqual(cb.checked, false);

    // Verify markdown serialization
    const md = domToMarkdown(editor).trim();
    assert.ok(md.includes('| [ ] | Zelle 2 |'), `Serialized markdown should contain checkbox cell: ${md}`);
  });

  it('clicking task button on an existing checkbox cell toggles it back to a normal cell', () => {
    setContentFormatted('| Done | Task |\n| --- | --- |\n| [ ] | Buy milk |');

    const firstTd = editor.querySelector('tbody td') as HTMLElement;
    assert.ok(firstTd, 'First td should exist');
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), true);

    // Select the checkbox cell
    selectElement(firstTd, 0);

    // Toggle off
    toggleListBlock(editor, 'task');

    // Verify it is no longer a checkbox cell
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), false);
    assert.strictEqual(firstTd.querySelector('input'), null);

    const md = domToMarkdown(editor).trim();
    assert.ok(!md.includes('[ ]'), `Markdown should no longer contain [ ]: ${md}`);
  });

  it('clicking an unchecked table checkbox cell toggles it to checked and updates serialization', () => {
    setContentFormatted('| Done | Task |\n| --- | --- |\n| [ ] | Buy milk |');

    const firstTd = editor.querySelector('tbody td.table-checkbox-cell') as HTMLElement;
    assert.ok(firstTd);
    assert.strictEqual(firstTd.getAttribute('data-checked'), 'false');

    // Click event on table-checkbox-cell
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    firstTd.dispatchEvent(clickEvent);

    assert.strictEqual(firstTd.getAttribute('data-checked'), 'true');
    assert.strictEqual(firstTd.classList.contains('is-checked'), true);
    const cb = firstTd.querySelector('input.table-cell-checkbox') as HTMLInputElement;
    assert.strictEqual(cb.checked, true);

    const md = domToMarkdown(editor).trim();
    assert.ok(md.includes('| [x] | Buy milk |'), `Should serialize checked cell: ${md}`);
  });

  it('pressing Space toggles a focused table checkbox cell', () => {
    setContentFormatted('| Done | Task |\n| --- | --- |\n| [ ] | Buy milk |');

    const firstTd = editor.querySelector('tbody td.table-checkbox-cell') as HTMLElement;
    assert.ok(firstTd);

    focusCell(firstTd, false);

    let editEmitted = false;
    const spaceEvent = new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const handled = handleTableKeyDown(spaceEvent, editor, () => { editEmitted = true; });

    assert.strictEqual(handled, true);
    assert.strictEqual(firstTd.getAttribute('data-checked'), 'true');
    assert.strictEqual(firstTd.classList.contains('is-checked'), true);
    assert.strictEqual(editEmitted, true);
  });

  it('pressing Backspace reverts a focused table checkbox cell to a normal cell', () => {
    setContentFormatted('| Done | Task |\n| --- | --- |\n| [ ] | Buy milk |');

    const firstTd = editor.querySelector('tbody td.table-checkbox-cell') as HTMLElement;
    assert.ok(firstTd);

    focusCell(firstTd, false);

    let editEmitted = false;
    const bsEvent = new dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    const handled = handleTableKeyDown(bsEvent, editor, () => { editEmitted = true; });

    assert.strictEqual(handled, true);
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), false);
    assert.strictEqual(firstTd.querySelector('input'), null);
    assert.strictEqual(editEmitted, true);
  });

  it('typing [] into an empty table cell converts it to a checkbox cell on input', () => {
    setContentFormatted('| Spalte 1 | Spalte 2 |\n| --- | --- |\n| | Zelle 2 |');

    const firstTd = editor.querySelector('tbody td') as HTMLElement;
    assert.ok(firstTd);
    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), false);

    // Simulate user typing []
    firstTd.textContent = '[]';
    firstTd.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    assert.strictEqual(firstTd.classList.contains('table-checkbox-cell'), true);
    assert.strictEqual(firstTd.getAttribute('data-checked'), 'false');
    assert.ok(firstTd.querySelector('input.table-cell-checkbox'));
  });

  it('adding a table row automatically propagates checkbox column to the new row', () => {
    setContentFormatted('| Done | Task |\n| --- | --- |\n| [ ] | Buy milk |');

    const table = editor.querySelector('table.editor-table') as HTMLTableElement;
    assert.ok(table);

    const newRow = addTableRow(table);
    const newCells = newRow.querySelectorAll('td');
    assert.strictEqual(newCells.length, 2);

    // Column 0 was a checkbox column, so newRow's column 0 should be a checkbox cell
    assert.strictEqual(newCells[0].classList.contains('table-checkbox-cell'), true);
    assert.ok(newCells[0].querySelector('input.table-cell-checkbox'));

    // Column 1 was regular text, so newRow's column 1 should be a regular cell
    assert.strictEqual(newCells[1].classList.contains('table-checkbox-cell'), false);
  });

  it('raw mode task formatting inside a table row formats as a checkbox cell', () => {
    const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
    textarea.value = '| Spalte 1 | Spalte 2 |\n| --- | --- |\n| | Zelle 2 |';

    // Place cursor in the first empty cell of row 3: "| <cursor>| Zelle 2 |"
    const targetOffset = textarea.value.indexOf('| | Zelle 2 |') + 2;
    textarea.selectionStart = targetOffset;
    textarea.selectionEnd = targetOffset;

    applyRawFormatting(textarea, 'task');

    assert.ok(textarea.value.includes('| [ ] | Zelle 2 |'), `Raw mode should insert [ ]: ${textarea.value}`);
    assert.ok(!textarea.value.includes('- [ ] |'), `Raw mode must not break table with list marker: ${textarea.value}`);
  });

  it('clicking bullet or ordered list in a table cell never replaces the table', () => {
    setContentFormatted('| Col 1 | Col 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |');

    const firstTd = editor.querySelector('tbody td') as HTMLElement;
    selectElement(firstTd.firstChild || firstTd, 0);

    toggleListBlock(editor, 'bullet');

    const table = editor.querySelector('table.editor-table');
    assert.ok(table, 'Table must remain intact when clicking bullet list inside a cell');
    assert.strictEqual(editor.querySelectorAll('ul.bullet-list').length, 0, 'No bullet list block should replace the table');
  });
});
