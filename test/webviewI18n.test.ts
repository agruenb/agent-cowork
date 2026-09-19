import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  getWebviewLanguage,
  setWebviewLanguage,
  tWebview,
  translateWebview,
} from '../src/webview/i18n';
import { updateWordCount } from '../src/webview/editorState';
import { setToolbarCollapsed } from '../src/webview/toolbarWiring';
import { showBlockDeleteConfirm } from '../src/webview/blockDelete';
import { addTableColumn } from '../src/webview/tableInteractions/tableInsertDelete';
import { applyRawFormatting } from '../src/webview/rawModeOperations';
import { updateEditorLanguage } from '../src/webview/markdownEditor';

describe('Webview i18n & Localization', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html lang="de">
<head><title>Test</title></head>
<body>
  <div class="toolbar">
    <button id="btn-toggle-toolbar" title="Symbolleiste einklappen" aria-label="Symbolleiste einklappen"></button>
    <select id="select-heading">
      <option value="p">Normaler Text</option>
      <option value="h1">Überschrift 1 (Groß)</option>
      <option value="h2">Überschrift 2 (Mittel)</option>
      <option value="h3">Überschrift 3 (Klein)</option>
    </select>
    <button id="btn-bold" title="Fett (Cmd+B)">B</button>
    <button id="btn-italic" title="Kursiv (Cmd+I)">I</button>
    <button id="btn-strike" title="Durchgestrichen">S</button>
    <button id="btn-task" title="Aufgabenliste (Checkliste)">Aufgabe</button>
    <button id="btn-bullet" title="Aufzählungsliste">Liste</button>
    <button id="btn-ordered" title="Nummerierte Liste">Nummeriert</button>
    <button id="btn-quote" title="Zitat / Info-Kasten">❝ Zitat</button>
    <button id="btn-table" title="Tabelle einfügen">田 Tabelle</button>
    <button id="btn-code" title="Code-Block">&lt;&gt; Code</button>
    <button id="btn-toggle-raw" title="Markdown-Quelltext anzeigen oder bearbeiten">Markdown</button>
    <button id="btn-cowork" title="Mit KI-Agent an diesem Dokument zusammenarbeiten">Cowork</button>
  </div>
  <div id="word-count">0 Wörter</div>
  <div id="editor" contenteditable="true"></div>
  <textarea id="raw-editor" style="display: none;"></textarea>
</body>
</html>`);

    document = dom.window.document;
    window = dom.window as unknown as Window;

    (global as any).document = document;
    (global as any).window = window;
    (global as any).Event = dom.window.Event;
  });

  afterEach(() => {
    delete (global as any).document;
    delete (global as any).window;
    delete (global as any).Event;
  });

  describe('Language Detection & Helpers', () => {
    it('detects language from document.documentElement.lang', () => {
      document.documentElement.lang = 'de';
      assert.strictEqual(getWebviewLanguage(), 'de');

      document.documentElement.lang = 'en';
      assert.strictEqual(getWebviewLanguage(), 'en');
    });

    it('updates documentElement when setWebviewLanguage is called', () => {
      setWebviewLanguage('en');
      assert.strictEqual(document.documentElement.lang, 'en');
      assert.strictEqual(getWebviewLanguage(), 'en');

      setWebviewLanguage('de');
      assert.strictEqual(document.documentElement.lang, 'de');
      assert.strictEqual(getWebviewLanguage(), 'de');
    });

    it('translates strings correctly using translateWebview and tWebview', () => {
      assert.strictEqual(translateWebview('en', 'Tabelle einfügen'), 'Insert table');
      assert.strictEqual(translateWebview('de', 'Tabelle einfügen'), 'Tabelle einfügen');

      // Test placeholder formatting
      assert.strictEqual(translateWebview('en', 'Spalte {0}', 5), 'Column 5');
      assert.strictEqual(translateWebview('de', 'Spalte {0}', 5), 'Spalte 5');

      setWebviewLanguage('en');
      assert.strictEqual(tWebview('Symbolleiste einklappen'), 'Collapse toolbar');

      setWebviewLanguage('de');
      assert.strictEqual(tWebview('Symbolleiste einklappen'), 'Symbolleiste einklappen');
    });
  });

  describe('Word Count Localization', () => {
    it('formats singular and plural correctly in German', () => {
      setWebviewLanguage('de');
      const counter = document.getElementById('word-count')!;

      updateWordCount('Hallo');
      assert.strictEqual(counter.textContent, '1 Wort');

      updateWordCount('Hallo Welt schön');
      assert.strictEqual(counter.textContent, '3 Wörter');

      updateWordCount('');
      assert.strictEqual(counter.textContent, '0 Wörter');
    });

    it('formats singular and plural correctly in English', () => {
      setWebviewLanguage('en');
      const counter = document.getElementById('word-count')!;

      updateWordCount('Hello');
      assert.strictEqual(counter.textContent, '1 word');

      updateWordCount('Hello beautiful world');
      assert.strictEqual(counter.textContent, '3 words');

      updateWordCount('');
      assert.strictEqual(counter.textContent, '0 words');
    });
  });

  describe('Toolbar Toggle Button Localization', () => {
    it('uses German attributes in German mode', () => {
      setWebviewLanguage('de');
      const toggleBtn = document.getElementById('btn-toggle-toolbar')!;

      setToolbarCollapsed(true);
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Symbolleiste ausklappen');
      assert.strictEqual(toggleBtn.getAttribute('aria-label'), 'Symbolleiste ausklappen');

      setToolbarCollapsed(false);
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Symbolleiste einklappen');
      assert.strictEqual(toggleBtn.getAttribute('aria-label'), 'Symbolleiste einklappen');
    });

    it('uses English attributes in English mode', () => {
      setWebviewLanguage('en');
      const toggleBtn = document.getElementById('btn-toggle-toolbar')!;

      setToolbarCollapsed(true);
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Expand toolbar');
      assert.strictEqual(toggleBtn.getAttribute('aria-label'), 'Expand toolbar');

      setToolbarCollapsed(false);
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Collapse toolbar');
      assert.strictEqual(toggleBtn.getAttribute('aria-label'), 'Collapse toolbar');
    });
  });

  describe('Block Deletion Localization', () => {
    it('renders German confirmation popup in German mode', () => {
      setWebviewLanguage('de');
      const container = document.createElement('div');
      container.className = 'editor-block-container widget-block';
      container.setAttribute('data-block-type', 'table');

      const delBtn = document.createElement('button');
      delBtn.className = 'block-delete-btn';
      container.appendChild(delBtn);

      const canvas = document.getElementById('editor')!;
      canvas.appendChild(container);

      const popup = showBlockDeleteConfirm(delBtn, container, canvas, () => {});
      assert(popup);

      const title = popup.querySelector('.block-confirm-title')!;
      const desc = popup.querySelector('.block-confirm-desc')!;
      const cancel = popup.querySelector('.block-confirm-cancel')!;
      const confirm = popup.querySelector('.block-confirm-delete')!;

      assert.strictEqual(title.textContent, 'Tabelle löschen?');
      assert.strictEqual(desc.textContent, 'Möchten Sie diese Tabelle wirklich löschen?');
      assert.strictEqual(cancel.textContent, 'Abbrechen');
      assert.strictEqual(confirm.textContent, 'Löschen');
    });

    it('renders English confirmation popup in English mode', () => {
      setWebviewLanguage('en');
      const container = document.createElement('div');
      container.className = 'editor-block-container widget-block';
      container.setAttribute('data-block-type', 'table');

      const delBtn = document.createElement('button');
      delBtn.className = 'block-delete-btn';
      container.appendChild(delBtn);

      const canvas = document.getElementById('editor')!;
      canvas.appendChild(container);

      const popup = showBlockDeleteConfirm(delBtn, container, canvas, () => {});
      assert(popup);

      const title = popup.querySelector('.block-confirm-title')!;
      const desc = popup.querySelector('.block-confirm-desc')!;
      const cancel = popup.querySelector('.block-confirm-cancel')!;
      const confirm = popup.querySelector('.block-confirm-delete')!;

      assert.strictEqual(title.textContent, 'Delete table?');
      assert.strictEqual(desc.textContent, 'Are you sure you want to delete this table?');
      assert.strictEqual(cancel.textContent, 'Cancel');
      assert.strictEqual(confirm.textContent, 'Delete');
    });
  });

  describe('Table Operations Localization', () => {
    it('creates new column with localized header in English', () => {
      setWebviewLanguage('en');
      const table = document.createElement('table');
      table.className = 'editor-table';
      table.innerHTML = `
        <thead><tr><th>Col 1</th><th>Col 2</th></tr></thead>
        <tbody><tr><td>A</td><td>B</td></tr></tbody>
      `;

      addTableColumn(table);
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
      assert.deepStrictEqual(headers, ['Col 1', 'Col 2', 'Column 3']);
    });

    it('creates new column with localized header in German', () => {
      setWebviewLanguage('de');
      const table = document.createElement('table');
      table.className = 'editor-table';
      table.innerHTML = `
        <thead><tr><th>Spalte 1</th><th>Spalte 2</th></tr></thead>
        <tbody><tr><td>A</td><td>B</td></tr></tbody>
      `;

      addTableColumn(table);
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
      assert.deepStrictEqual(headers, ['Spalte 1', 'Spalte 2', 'Spalte 3']);
    });
  });

  describe('Raw Mode Formatting Localization', () => {
    it('inserts English table template in raw mode when English', () => {
      setWebviewLanguage('en');
      const textarea = document.getElementById('raw-editor') as HTMLTextAreaElement;
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      applyRawFormatting(textarea, 'table');
      assert(textarea.value.includes('| Column 1 | Column 2 | Column 3 |'));
      assert(textarea.value.includes('| Content 1 | Content 2 | Content 3 |'));
    });

    it('inserts German table template in raw mode when German', () => {
      setWebviewLanguage('de');
      const textarea = document.getElementById('raw-editor') as HTMLTextAreaElement;
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      applyRawFormatting(textarea, 'table');
      assert(textarea.value.includes('| Spalte 1 | Spalte 2 | Spalte 3 |'));
      assert(textarea.value.includes('| Inhalt 1 | Inhalt 2 | Inhalt 3 |'));
    });
  });

  describe('Dynamic Live Language Switching', () => {
    it('updates DOM elements in place when switching to English', () => {
      updateEditorLanguage('en');

      const selectHeading = document.getElementById('select-heading') as HTMLSelectElement;
      assert.strictEqual(selectHeading.options[0].textContent, 'Normal text');
      assert.strictEqual(selectHeading.options[1].textContent, 'Heading 1 (Large)');

      const btnBold = document.getElementById('btn-bold')!;
      assert.strictEqual(btnBold.getAttribute('title'), 'Bold (Cmd+B)');

      const btnTable = document.getElementById('btn-table')!;
      assert.strictEqual(btnTable.getAttribute('title'), 'Insert table');
      assert.strictEqual(btnTable.textContent, '田 Table');

      const btnQuote = document.getElementById('btn-quote')!;
      assert.strictEqual(btnQuote.textContent, '❝ Quote');

      const btnCode = document.getElementById('btn-code')!;
      assert.strictEqual(btnCode.textContent, '<> Code');

      const btnRaw = document.getElementById('btn-toggle-raw')!;
      assert.strictEqual(
        btnRaw.getAttribute('title'),
        'View or edit Markdown source'
      );
    });

    it('updates DOM elements in place when switching to German', () => {
      updateEditorLanguage('en');
      updateEditorLanguage('de');

      const selectHeading = document.getElementById('select-heading') as HTMLSelectElement;
      assert.strictEqual(selectHeading.options[0].textContent, 'Normaler Text');
      assert.strictEqual(selectHeading.options[1].textContent, 'Überschrift 1 (Groß)');

      const btnBold = document.getElementById('btn-bold')!;
      assert.strictEqual(btnBold.getAttribute('title'), 'Fett (Cmd+B)');

      const btnTable = document.getElementById('btn-table')!;
      assert.strictEqual(btnTable.getAttribute('title'), 'Tabelle einfügen');
      assert.strictEqual(btnTable.textContent, '田 Tabelle');

      const btnQuote = document.getElementById('btn-quote')!;
      assert.strictEqual(btnQuote.textContent, '❝ Zitat');

      const btnCode = document.getElementById('btn-code')!;
      assert.strictEqual(btnCode.textContent, '<> Code');
    });
  });
});
