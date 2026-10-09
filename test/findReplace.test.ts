import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state } from '../src/webview/editorState';
import { setContentFormatted } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';
import { setWebviewLanguage } from '../src/webview/i18n';
import {
  wireFindReplace,
  openFindWidget,
  closeFindWidget,
  isFindWidgetOpen,
  performFind,
  findNext,
  findPrevious,
  replaceCurrent,
  replaceAll,
  toggleReplaceRow,
  toggleCaseSensitive,
  toggleWholeWord,
  clearFormattedHighlights,
  handleGlobalFindShortcuts,
  updateFindWidgetLanguage,
  updateFindWidgetPosition,
  getFindWidget,
  getFindInput,
  getFindReplaceInput,
  getFindCount,
  getFindReplaceRow,
  getBtnFindToggleReplace,
  getBtnFindCase,
  getBtnFindWord,
} from '../src/webview/findReplace';

describe('Find and Replace Widget', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let canvas: HTMLElement;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html lang="de">
<body>
  <div class="toolbar">
    <button id="btn-toolbar-find">Find</button>
    <button id="btn-toggle-raw">Raw</button>
    <button id="btn-cowork">Cowork</button>
  </div>
  <div id="find-widget" class="find-widget" style="display: none;">
    <div class="find-row">
      <button id="btn-find-toggle-replace" class="find-toggle-replace-btn">Chevron</button>
      <div class="find-input-container">
        <input id="find-input" class="find-input" type="text" placeholder="Suchen" />
        <div class="find-input-actions">
          <button id="btn-find-case" class="find-toggle-opt-btn">Aa</button>
          <button id="btn-find-word" class="find-toggle-opt-btn">\\b</button>
        </div>
      </div>
      <span id="find-count" class="find-count">0/0</span>
      <div class="find-nav-group">
        <button id="btn-find-prev" class="find-btn">Prev</button>
        <button id="btn-find-next" class="find-btn">Next</button>
      </div>
      <button id="btn-find-close" class="find-close-btn">✕</button>
    </div>
    <div id="find-replace-row" class="find-replace-row" style="display: none;">
      <div class="find-input-container">
        <input id="find-replace-input" class="find-input" type="text" placeholder="Ersetzen" />
      </div>
      <div class="find-replace-actions">
        <button id="btn-replace" class="find-action-btn"><span>Ersetzen</span></button>
        <button id="btn-replace-all" class="find-action-btn"><span>Alles ersetzen</span></button>
      </div>
    </div>
  </div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" class="editor-canvas" contenteditable="true"></div>
      <div id="raw-wrapper" style="display: none;">
        <div id="raw-gutter"></div>
        <textarea id="raw-textarea" style="display: none;"></textarea>
      </div>
    </div>
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
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    canvas = document.getElementById('editor')!;
    textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;

    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;
    setWebviewLanguage('de');

    wireFindReplace();
  });

  afterEach(() => {
    closeFindWidget();
  });

  describe('Formatted Mode: Finding Words', () => {
    it('finds occurrences of a word and highlights them with <mark>', () => {
      setContentFormatted('The brown fox jumps over the lazy dog. Another fox is here.');
      openFindWidget();

      const input = getFindInput()!;
      input.value = 'fox';
      performFind('fox');

      const marks = canvas.querySelectorAll('mark.find-match');
      assert.strictEqual(marks.length, 2, 'Should highlight 2 occurrences of "fox"');
      assert.strictEqual(marks[0].textContent, 'fox');
      assert.strictEqual(marks[1].textContent, 'fox');

      const count = getFindCount()!;
      assert.strictEqual(count.textContent, '1/2', 'Counter should display 1/2 for active match');
      assert.strictEqual(marks[0].classList.contains('active'), true, 'First match should have active class');
    });

    it('navigates next and previous across matches', () => {
      setContentFormatted('Alpha Beta Alpha Gamma Alpha');
      openFindWidget();
      performFind('Alpha');

      const count = getFindCount()!;
      assert.strictEqual(count.textContent, '1/3');

      findNext();
      assert.strictEqual(count.textContent, '2/3');

      findNext();
      assert.strictEqual(count.textContent, '3/3');

      // Wraps around to start
      findNext();
      assert.strictEqual(count.textContent, '1/3');

      // Previous wraps to end
      findPrevious();
      assert.strictEqual(count.textContent, '3/3');
    });

    it('supports case sensitive searching', () => {
      setContentFormatted('Cat cat CAT cAt');
      openFindWidget();

      // Default: case insensitive
      performFind('cat');
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 4);

      // Toggle case sensitive
      toggleCaseSensitive();
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 1);
      assert.strictEqual(getFindCount()!.textContent, '1/1');

      // Reset
      toggleCaseSensitive();
    });

    it('supports whole word searching', () => {
      setContentFormatted('cat catalog catch bobcat cat');
      openFindWidget();

      // Without whole word: matches all 5
      performFind('cat');
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 5);

      // Toggle whole word
      toggleWholeWord();
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 2);
      assert.strictEqual(getFindCount()!.textContent, '1/2');

      // Reset
      toggleWholeWord();
    });

    it('finds words across formatting elements like bold and headings', () => {
      setContentFormatted('# Welcome to Project\n\nThis is **important** text with `special` code.');
      openFindWidget();
      performFind('important');

      const marks = canvas.querySelectorAll('mark.find-match');
      assert.strictEqual(marks.length, 1);
      assert.strictEqual(marks[0].textContent, 'important');
      assert.strictEqual(marks[0].parentElement?.tagName.toLowerCase(), 'strong');
    });

    it('shows "Keine Ergebnisse" when no results are found', () => {
      setContentFormatted('Hello world');
      openFindWidget();
      performFind('nonexistent');

      const count = getFindCount()!;
      assert.strictEqual(count.textContent, 'Keine Ergebnisse');
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 0);
    });

    it('clears highlights when closed', () => {
      setContentFormatted('A test document with test content.');
      openFindWidget();
      performFind('test');
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 2);

      closeFindWidget();
      assert.strictEqual(canvas.querySelectorAll('mark.find-match').length, 0);
      assert.strictEqual(isFindWidgetOpen(), false);
    });
  });

  describe('Formatted Mode: Replacing Words', () => {
    it('replaces active match and updates remaining matches', () => {
      setContentFormatted('apples and oranges and apples');
      openFindWidget(true);
      performFind('apples');

      const repInput = getFindReplaceInput()!;
      repInput.value = 'peaches';

      // Current count: 1/2
      assert.strictEqual(getFindCount()!.textContent, '1/2');

      // Replace active match
      replaceCurrent();

      // Remaining count should be 1/1
      assert.strictEqual(getFindCount()!.textContent, '1/1');

      // Serializing canvas should reflect the replacement
      const md = domToMarkdown(canvas);
      assert.strictEqual(md.trim(), 'peaches and oranges and apples');
    });

    it('replaces all matches in formatted mode', () => {
      setContentFormatted('Item one, Item two, Item three');
      openFindWidget(true);
      performFind('Item');

      const repInput = getFindReplaceInput()!;
      repInput.value = 'Task';

      replaceAll();

      const md = domToMarkdown(canvas);
      assert.strictEqual(md.trim(), 'Task one, Task two, Task three');
      assert.strictEqual(getFindCount()!.textContent, 'Keine Ergebnisse');
    });
  });

  describe('Raw Mode: Finding and Replacing', () => {
    beforeEach(() => {
      state.isRawMode = true;
      textarea.style.display = 'block';
      canvas.style.display = 'none';
      textarea.value = 'Hello universe, hello galaxy, hello world';
    });

    it('finds occurrences in raw mode', () => {
      openFindWidget();
      performFind('hello');

      const count = getFindCount()!;
      assert.strictEqual(count.textContent, '1/3');
      assert.strictEqual(textarea.selectionStart, 0);
      assert.strictEqual(textarea.selectionEnd, 5);
    });

    it('navigates matches in raw mode', () => {
      openFindWidget();
      performFind('hello');

      findNext();
      assert.strictEqual(getFindCount()!.textContent, '2/3');
      assert.strictEqual(textarea.selectionStart, 16);
      assert.strictEqual(textarea.selectionEnd, 21);

      findNext();
      assert.strictEqual(getFindCount()!.textContent, '3/3');

      findPrevious();
      assert.strictEqual(getFindCount()!.textContent, '2/3');
    });

    it('replaces single match in raw mode', () => {
      openFindWidget(true);
      performFind('hello');

      const repInput = getFindReplaceInput()!;
      repInput.value = 'greetings';

      replaceCurrent();

      assert.strictEqual(textarea.value, 'greetings universe, hello galaxy, hello world');
      assert.strictEqual(getFindCount()!.textContent, '1/2');
    });

    it('replaces all matches in raw mode', () => {
      openFindWidget(true);
      performFind('hello');

      const repInput = getFindReplaceInput()!;
      repInput.value = 'hi';

      replaceAll();

      assert.strictEqual(textarea.value, 'hi universe, hi galaxy, hi world');
      assert.strictEqual(getFindCount()!.textContent, 'Keine Ergebnisse');
    });
  });

  describe('Keyboard Shortcuts and UI Interactions', () => {
    it('opens find widget on Ctrl+F / Cmd+F', () => {
      const event = new window.KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      handleGlobalFindShortcuts(event);

      assert.strictEqual(isFindWidgetOpen(), true);
      const widget = getFindWidget()!;
      assert.strictEqual(widget.style.display, 'flex');
    });

    it('opens find widget with replace expanded on Ctrl+H', () => {
      const event = new window.KeyboardEvent('keydown', {
        key: 'h',
        code: 'KeyH',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      handleGlobalFindShortcuts(event);

      assert.strictEqual(isFindWidgetOpen(), true);
      const repRow = getFindReplaceRow()!;
      assert.strictEqual(repRow.style.display, 'flex');
    });

    it('closes find widget on Escape key', () => {
      openFindWidget();
      assert.strictEqual(isFindWidgetOpen(), true);

      const event = new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });

      handleGlobalFindShortcuts(event);

      assert.strictEqual(isFindWidgetOpen(), false);
      const widget = getFindWidget()!;
      assert.strictEqual(widget.style.display, 'none');
    });

    it('pre-populates query when text is selected upon Ctrl+F', () => {
      setContentFormatted('Selection test paragraph');
      const p = canvas.querySelector('p')!;
      const textNode = p.firstChild as Text;

      // Select "test"
      const idx = textNode.textContent!.indexOf('test');
      const range = document.createRange();
      range.setStart(textNode, idx);
      range.setEnd(textNode, idx + 4);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      openFindWidget();

      const input = getFindInput()!;
      assert.strictEqual(input.value, 'test');
    });

    it('toggles replace row when chevron button is clicked', () => {
      openFindWidget();
      const repRow = getFindReplaceRow()!;
      assert.strictEqual(repRow.style.display, 'none');

      toggleReplaceRow();
      assert.strictEqual(repRow.style.display, 'flex');

      toggleReplaceRow();
      assert.strictEqual(repRow.style.display, 'none');
    });

    it('updates widget labels when language switches', () => {
      setWebviewLanguage('en');
      updateFindWidgetLanguage();

      const findInput = getFindInput()!;
      const repInput = getFindReplaceInput()!;
      const btnToggle = getBtnFindToggleReplace()!;

      assert.strictEqual(findInput.placeholder, 'Find');
      assert.strictEqual(repInput.placeholder, 'Replace');
      assert.strictEqual(btnToggle.title, 'Toggle Replace');

      setWebviewLanguage('de');
      updateFindWidgetLanguage();

      assert.strictEqual(findInput.placeholder, 'Suchen');
      assert.strictEqual(repInput.placeholder, 'Ersetzen');
      assert.strictEqual(btnToggle.title, 'Ersetzen ein-/ausblenden');
    });

    it('positions find widget below toolbar without overlapping', () => {
      const toolbar = document.querySelector('.toolbar') as HTMLElement;
      Object.defineProperty(toolbar, 'offsetHeight', { value: 54, configurable: true });

      openFindWidget();
      const widget = getFindWidget()!;
      assert.strictEqual(widget.style.top, '62px');

      Object.defineProperty(toolbar, 'offsetHeight', { value: 14, configurable: true });
      updateFindWidgetPosition();
      assert.strictEqual(widget.style.top, '22px');
    });

    it('preserves viewport scroll position and does not place cursor when closed', () => {
      setContentFormatted('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
      const viewport = document.querySelector('.document-viewport') as HTMLElement;
      viewport.scrollTop = 250;

      openFindWidget();
      const findInput = getFindInput()!;
      findInput.focus();
      assert.strictEqual(document.activeElement, findInput);

      closeFindWidget();

      // Viewport scroll must be preserved without jumping to start
      assert.strictEqual(viewport.scrollTop, 250);

      // Focus should not be placed on canvas
      assert.notStrictEqual(document.activeElement, canvas);
      assert.notStrictEqual(document.activeElement, findInput);
    });
  });
});

