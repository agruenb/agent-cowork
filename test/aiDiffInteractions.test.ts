import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  displayAiDiff,
  clearAiDiff,
  setContentFormatted,
  updateEditorLanguage,
  handleWindowMessage,
  toggleRawMode,
} from '../src/webview/markdownEditor';
import { wireToolbar } from '../src/webview/toolbarWiring';
import { state, vscode } from '../src/webview/editorState';

describe('AI Diff Webview Interactions & Safe Review Mode', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;
  let panel: HTMLElement;
  let statAdd: HTMLElement;
  let statDel: HTMLElement;
  let btnAccept: HTMLButtonElement;
  let btnReject: HTMLButtonElement;
  let postedMessages: any[] = [];

  beforeEach(() => {
    postedMessages = [];
    (vscode as any).postMessage = (msg: any) => {
      postedMessages.push(msg);
    };

    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <select id="select-heading"><option value="p">Normal</option></select>
    <button id="btn-bold">B</button>
    <button id="btn-italic">I</button>
    <button id="btn-strike">S</button>
    <button id="btn-bullet">List</button>
    <button id="btn-ordered">Num</button>
    <button id="btn-task">Task</button>
    <button id="btn-quote">Quote</button>
    <button id="btn-table">Table</button>
    <button id="btn-code">Code</button>
    <div class="toolbar-spacer"></div>
    <div id="ai-edits-panel" class="ai-edits-panel" style="display: none;">
      <span id="ai-edits-stats" class="ai-edits-stats">
        <span>🤖 KI-Änderungen:</span>
        <span id="ai-stat-add" class="ai-stat-add">+0</span>
        <span id="ai-stat-del" class="ai-stat-del">-0</span>
      </span>
      <button id="btn-ai-accept" class="btn-ai-action btn-ai-accept">✓ Übernehmen</button>
      <button id="btn-ai-reject" class="btn-ai-action btn-ai-reject">✕ Verwerfen</button>
    </div>
    <button id="btn-toggle-raw">&lt;/&gt; Raw</button>
    <button id="btn-cowork">Cowork</button>
    <button id="btn-toggle-toolbar">⌃</button>
  </div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" class="editor-canvas" contenteditable="true"></div>
      <div id="raw-wrapper" style="display: none;">
        <div id="raw-gutter"></div>
        <textarea id="raw-textarea"></textarea>
        <div id="raw-mirror"></div>
        <div id="raw-diff" class="raw-diff-container" style="display: none;"></div>
      </div>
    </div>
  </div>
</body>
</html>`);

    document = dom.window.document;
    window = dom.window as unknown as Window;
    (global as any).document = document;
    (global as any).window = window;

    editor = document.getElementById('editor') as HTMLElement;
    panel = document.getElementById('ai-edits-panel') as HTMLElement;
    statAdd = document.getElementById('ai-stat-add') as HTMLElement;
    statDel = document.getElementById('ai-stat-del') as HTMLElement;
    btnAccept = document.getElementById('btn-ai-accept') as HTMLButtonElement;
    btnReject = document.getElementById('btn-ai-reject') as HTMLButtonElement;

    state.isRawMode = false;
    state.isReviewMode = false;
    state.currentMarkdown = '';

    wireToolbar({
      toggleRawMode: () => {},
      wireTaskCheckboxes: () => {},
    });
  });

  afterEach(() => {
    state.isReviewMode = false;
    state.isRawMode = false;
    state.aiOriginalText = '';
    delete (global as any).document;
    delete (global as any).window;
  });

  it('displays diffs, enters safe review mode, and shows toolbar AI edits panel', () => {
    const original = '# Title\nThis is the original text.';
    const modified = '# Title\nThis is the modified text with new details.\n```ts\nconst x = 10;\n```';

    displayAiDiff(original, modified);

    assert.strictEqual(state.isReviewMode, true);
    assert.strictEqual(panel.style.display, 'flex');
    assert.strictEqual(editor.getAttribute('contenteditable'), 'false');
    assert.ok(editor.classList.contains('is-review-mode'));

    // Check stats are populated
    assert.ok(statAdd.textContent?.startsWith('+'));
    assert.ok(statDel.textContent?.startsWith('-'));

    // Check content has diff decorations
    assert.ok(editor.innerHTML.includes('diff-ins') || editor.innerHTML.includes('diff-del'));
    assert.ok(editor.innerHTML.includes('code-diff-wrapper'));
  });

  it('clicking btn-ai-accept posts acceptAiEdits message to VS Code', () => {
    btnAccept.click();
    assert.strictEqual(postedMessages.length, 1);
    assert.deepStrictEqual(postedMessages[0], { type: 'acceptAiEdits' });
  });

  it('clicking btn-ai-reject posts rejectAiEdits message to VS Code', () => {
    btnReject.click();
    assert.strictEqual(postedMessages.length, 1);
    assert.deepStrictEqual(postedMessages[0], { type: 'rejectAiEdits' });
  });

  it('clearAiDiff hides panel, resets review mode, and restores editable content', () => {
    const original = 'Hello World';
    const modified = 'Hello Beautiful World';
    displayAiDiff(original, modified);

    assert.strictEqual(state.isReviewMode, true);
    assert.strictEqual(panel.style.display, 'flex');

    clearAiDiff(modified);

    assert.strictEqual(state.isReviewMode, false);
    assert.strictEqual(panel.style.display, 'none');
    assert.strictEqual(editor.getAttribute('contenteditable'), 'true');
    assert.ok(!editor.classList.contains('is-review-mode'));
    assert.strictEqual(state.currentMarkdown, modified);
  });

  it('updates language of AI edits buttons in English and German', () => {
    updateEditorLanguage('en');
    assert.ok(btnAccept.textContent?.includes('Accept'));
    assert.ok(btnReject.textContent?.includes('Reject'));

    updateEditorLanguage('de');
    assert.ok(btnAccept.textContent?.includes('Übernehmen'));
    assert.ok(btnReject.textContent?.includes('Verwerfen'));
  });

  it('renders diff immediately when receiving init message with originalText', () => {
    const original = 'Paragraph 1\nOld line';
    const modified = 'Paragraph 1\nNew line';

    // Simulate init message from extension host when file has uncommitted diffs
    const event = {
      data: {
        type: 'init',
        text: modified,
        originalText: original,
      },
    } as MessageEvent;

    handleWindowMessage(event);

    assert.strictEqual(state.isReviewMode, true);
    assert.strictEqual(panel.style.display, 'flex');
    assert.strictEqual(editor.getAttribute('contenteditable'), 'false');
    assert.ok(editor.classList.contains('is-review-mode'));
    assert.ok(editor.innerHTML.includes('diff-ins'));
    assert.ok(editor.innerHTML.includes('diff-del'));
  });

  it('renders diff immediately when embedded init-data script tag contains originalText', () => {
    const original = 'Baseline content\nOld line';
    const modified = 'Baseline content\nNew line';

    const script = document.createElement('script');
    script.id = 'agent-cowork-init-data';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      text: modified,
      originalText: original,
    });
    document.body.appendChild(script);

    const initData = JSON.parse(script.textContent);
    if (initData.originalText && initData.originalText !== initData.text) {
      displayAiDiff(initData.originalText, initData.text);
    } else {
      setContentFormatted(initData.text);
    }

    assert.strictEqual(state.isReviewMode, true);
    assert.strictEqual(panel.style.display, 'flex');
    assert.strictEqual(editor.getAttribute('contenteditable'), 'false');
    assert.ok(editor.classList.contains('is-review-mode'));
    assert.ok(editor.innerHTML.includes('diff-ins'));
    assert.ok(editor.innerHTML.includes('diff-del'));
  });

  it('renders a table diff properly as an HTML table with cell highlights and not raw md', () => {
    const original = '| Feature | Supported |\n| --- | --- |\n| Audio | False |\n| Video | True |';
    const modified = '| Feature | Supported |\n| --- | --- |\n| Audio | True |\n| Video | True |';

    displayAiDiff(original, modified);

    assert.strictEqual(state.isReviewMode, true);
    assert.ok(editor.querySelector('table.editor-table'), 'Must render as an HTML table');
    assert.ok(editor.querySelector('.diff-cell-modified'), 'Must highlight modified cell');
    assert.ok(editor.innerHTML.includes('<ins class="diff-ins">True</ins>'));
    assert.ok(editor.innerHTML.includes('<del class="diff-del">False</del>'));
    assert.ok(!editor.innerHTML.includes('<p class="editor-block">| Feature |'));
  });

  it('toggling to raw mode and back during AI review preserves table and does NOT duplicate rows or insert True/False rows', () => {
    const original = '| Feature | Supported |\n| --- | --- |\n| Audio | False |\n| Video | True |';
    const modified = '| Feature | Supported |\n| --- | --- |\n| Audio | True |\n| Video | True |';

    displayAiDiff(original, modified);
    assert.strictEqual(state.isReviewMode, true);

    const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
    const rawDiff = document.getElementById('raw-diff') as HTMLElement;

    // Switch to Raw Mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);
    // Raw diff container must be visible, displaying inline diff with +/- and del/add lines
    assert.strictEqual(rawDiff.style.display, 'flex');
    assert.strictEqual(textarea.style.display, 'none');
    assert.ok(rawDiff.innerHTML.includes('raw-diff-del'));
    assert.ok(rawDiff.innerHTML.includes('raw-diff-add'));
    assert.ok(rawDiff.innerHTML.includes('False'));
    assert.ok(rawDiff.innerHTML.includes('True'));

    // Switch back to Formatted Mode
    toggleRawMode();
    assert.strictEqual(state.isRawMode, false);
    // Table should still be rendered as table
    const tableEl = editor.querySelector('table.editor-table');
    assert.ok(tableEl, 'Must still render table after toggling back');
    const tableRows = editor.querySelectorAll('table.editor-table tbody tr');
    assert.strictEqual(tableRows.length, 2, 'Must still have exactly 2 body rows, no extra rows inserted');
  });

  it('accepting AI edits while in Raw mode incorporates edits and restores editable textarea', () => {
    const original = '| Feature | Supported |\n| --- | --- |\n| Audio | False |';
    const modified = '| Feature | Supported |\n| --- | --- |\n| Audio | True |';

    displayAiDiff(original, modified);
    toggleRawMode();
    assert.strictEqual(state.isRawMode, true);

    const rawDiff = document.getElementById('raw-diff') as HTMLElement;
    const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
    assert.strictEqual(rawDiff.style.display, 'flex');

    // Click Accept button
    btnAccept.click();
    assert.deepStrictEqual(postedMessages[postedMessages.length - 1], { type: 'acceptAiEdits' });

    // Host responds by clearing diff with accepted text
    clearAiDiff(modified);

    // Review mode should now be cleared
    assert.strictEqual(state.isReviewMode, false);
    // Raw diff hidden, textarea displayed with accepted markdown
    assert.strictEqual(rawDiff.style.display, 'none');
    assert.strictEqual(textarea.style.display, 'block');
    assert.strictEqual(textarea.value, modified);
  });
});


