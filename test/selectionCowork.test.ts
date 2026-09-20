import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state, vscode } from '../src/webview/editorState';
import { setContentFormatted } from '../src/webview/markdownEditor';
import {
  getSelectionLineRange,
  getRawSelectionLineRange,
  getSelectionCoworkButton,
  hideSelectionCoworkButton,
  positionSelectionButton,
  handleCoworkSelectionClick,
  wireSelectionCowork,
  updateSelectionCoworkButtonLanguage,
} from '../src/webview/selectionCowork';
import { setWebviewLanguage } from '../src/webview/i18n';

describe('Selection Cowork - Line Range Calculation & Floating Button', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;
  let postedMessages: any[];

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html>
<html>
<head></head>
<body>
  <div class="toolbar">
    <button id="btn-cowork">Cowork</button>
  </div>
  <div class="document-viewport">
    <div id="editor" contenteditable="true"></div>
    <textarea id="raw-textarea" style="display: none;"></textarea>
  </div>
  <button id="btn-selection-cowork" class="selection-cowork-btn" style="display: none;">Cowork</button>
</body>
</html>`,
      { url: 'http://localhost' }
    );

    window = dom.window as unknown as Window;
    document = dom.window.document;

    (globalThis as any).window = window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).Element = dom.window.Element;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
    (globalThis as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    (globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    editor = document.getElementById('editor')!;
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;

    postedMessages = [];
    (vscode as any).postMessage = (msg: any) => {
      postedMessages.push(msg);
    };

    setWebviewLanguage('de');
  });

  afterEach(() => {
    hideSelectionCoworkButton();
  });

  /**
   * Helper to mock window.getSelection() in JSDOM with specified anchor/focus nodes.
   */
  function setMockSelection(
    startNode: Node,
    startOffset: number,
    endNode: Node,
    endOffset: number,
    text: string
  ): Selection {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    // Mock getClientRects and getBoundingClientRect for JSDOM
    (range as any).getClientRects = () => [
      {
        top: 100,
        bottom: 120,
        left: 50,
        right: 250,
        width: 200,
        height: 20,
      },
    ];
    (range as any).getBoundingClientRect = () => ({
      top: 100,
      bottom: 120,
      left: 50,
      right: 250,
      width: 200,
      height: 20,
    });

    const sel = {
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: startNode,
      anchorOffset: startOffset,
      focusNode: endNode,
      focusOffset: endOffset,
      getRangeAt: (_index: number) => range,
      toString: () => text,
      removeAllRanges: () => {},
      addRange: () => {},
    } as unknown as Selection;

    (window as any).getSelection = () => sel;
    (document as any).getSelection = () => sel;

    return sel;
  }

  describe('Line Range Calculation in Widgets', () => {
    it('calculates exact line for table header cell selection', () => {
      // Line 1: # Title
      // Line 2: (blank)
      // Line 3: | Name | Age |
      // Line 4: | --- | --- |
      // Line 5: | Alice | 30 |
      // Line 6: | Bob | 25 |
      const markdown = '# Title\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
      setContentFormatted(markdown);

      const th = editor.querySelector('thead th')!;
      assert.ok(th, 'Header cell should exist');
      const textNode = th.firstChild!;
      const sel = setMockSelection(textNode, 0, textNode, textNode.nodeValue?.length || 4, 'Name');

      const range = getSelectionLineRange(editor, sel);
      assert.ok(range);
      assert.strictEqual(range.startLine, 3, 'Table header should be line 3');
      assert.strictEqual(range.endLine, 3, 'Table header should be line 3');
    });

    it('calculates exact line for table body row selection', () => {
      const markdown = '# Title\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
      setContentFormatted(markdown);

      const rows = editor.querySelectorAll('tbody tr');
      assert.strictEqual(rows.length, 2);

      // Select text in first row: Alice (line 5)
      const firstRowCell = rows[0].querySelector('td')!;
      const textNode1 = firstRowCell.firstChild!;
      const sel1 = setMockSelection(textNode1, 0, textNode1, textNode1.nodeValue?.length || 5, 'Alice');

      const range1 = getSelectionLineRange(editor, sel1);
      assert.ok(range1);
      assert.strictEqual(range1.startLine, 5, 'First body row should be line 5');
      assert.strictEqual(range1.endLine, 5, 'First body row should be line 5');

      // Select text in second row: Bob (line 6)
      const secondRowCell = rows[1].querySelector('td')!;
      const textNode2 = secondRowCell.firstChild!;
      const sel2 = setMockSelection(textNode2, 0, textNode2, textNode2.nodeValue?.length || 3, 'Bob');

      const range2 = getSelectionLineRange(editor, sel2);
      assert.ok(range2);
      assert.strictEqual(range2.startLine, 6, 'Second body row should be line 6');
      assert.strictEqual(range2.endLine, 6, 'Second body row should be line 6');
    });

    it('calculates line range across multiple table rows', () => {
      const markdown = '# Title\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
      setContentFormatted(markdown);

      const rows = editor.querySelectorAll('tbody tr');
      const startCell = rows[0].querySelector('td')!;
      const endCell = rows[1].querySelectorAll('td')[1];

      const sel = setMockSelection(startCell.firstChild!, 0, endCell.firstChild!, 2, 'Alice ... 25');
      const range = getSelectionLineRange(editor, sel);
      assert.ok(range);
      assert.strictEqual(range.startLine, 5);
      assert.strictEqual(range.endLine, 6);
    });

    it('calculates exact line inside a code block', () => {
      // Line 1: # Intro
      // Line 2: (blank)
      // Line 3: ```typescript
      // Line 4: const x = 1;
      // Line 5: const y = 2;
      // Line 6: const z = 3;
      // Line 7: ```
      const markdown = '# Intro\n\n```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```';
      setContentFormatted(markdown);

      const codeEl = editor.querySelector('code.editor-code')!;
      assert.ok(codeEl, 'Code element must exist');
      const codeTextNode = codeEl.firstChild!;

      // Position in line 2 of the code ("const y = 2;")
      // "const x = 1;\n" is 14 chars long
      const sel = setMockSelection(codeTextNode, 14, codeTextNode, 25, 'const y = 2');
      const range = getSelectionLineRange(editor, sel);

      assert.ok(range);
      assert.strictEqual(range.startLine, 5, 'Second line of code block should be line 5');
      assert.strictEqual(range.endLine, 5, 'Second line of code block should be line 5');
    });

    it('calculates line range across multiple lines in a code block', () => {
      const markdown = '# Intro\n\n```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```';
      setContentFormatted(markdown);

      const codeEl = editor.querySelector('code.editor-code')!;
      const codeTextNode = codeEl.firstChild!;

      // Select from start of code (line 4) to end of line 3 (line 6)
      const sel = setMockSelection(codeTextNode, 0, codeTextNode, 35, 'const x ... const z');
      const range = getSelectionLineRange(editor, sel);

      assert.ok(range);
      assert.strictEqual(range.startLine, 4, 'Code block content starts at line 4');
      assert.strictEqual(range.endLine, 6, 'Code block content spans to line 6');
    });

    it('calculates exact line inside a blockquote', () => {
      // Line 1: # Notes
      // Line 2: (blank)
      // Line 3: > First quote paragraph
      // Line 4: > Second quote paragraph
      const markdown = '# Notes\n\n> First quote paragraph\n> Second quote paragraph';
      setContentFormatted(markdown);

      const quotePs = editor.querySelectorAll('blockquote p');
      assert.strictEqual(quotePs.length, 2, 'Should have 2 quote paragraphs');

      // Select text in second paragraph of quote (line 4)
      const p2TextNode = quotePs[1].firstChild!;
      const sel = setMockSelection(p2TextNode, 0, p2TextNode, 6, 'Second');

      const range = getSelectionLineRange(editor, sel);
      assert.ok(range);
      assert.strictEqual(range.startLine, 4, 'Second quote line should be line 4');
      assert.strictEqual(range.endLine, 4, 'Second quote line should be line 4');
    });

    it('calculates line range across multi-line blockquotes', () => {
      const markdown = '# Notes\n\n> First quote paragraph\n> Second quote paragraph';
      setContentFormatted(markdown);

      const quotePs = editor.querySelectorAll('blockquote p');
      const p1TextNode = quotePs[0].firstChild!;
      const p2TextNode = quotePs[1].firstChild!;

      const sel = setMockSelection(p1TextNode, 0, p2TextNode, 6, 'First ... Second');
      const range = getSelectionLineRange(editor, sel);
      assert.ok(range);
      assert.strictEqual(range.startLine, 3);
      assert.strictEqual(range.endLine, 4);
    });

    it('calculates lines in task and bullet lists', () => {
      // Line 1: # Todo
      // Line 2: (blank)
      // Line 3: - [ ] Task one
      // Line 4: - [x] Task two
      // Line 5: - [ ] Task three
      const markdown = '# Todo\n\n- [ ] Task one\n- [x] Task two\n- [ ] Task three';
      setContentFormatted(markdown);

      const lis = editor.querySelectorAll('li.task-item');
      assert.strictEqual(lis.length, 3);

      // Select "Task two" (line 4)
      const task2Content = lis[1].querySelector('.task-content')!;
      const textNode = task2Content.firstChild!;
      const sel = setMockSelection(textNode, 0, textNode, 4, 'Task');

      const range = getSelectionLineRange(editor, sel);
      assert.ok(range);
      assert.strictEqual(range.startLine, 4, 'Task two should be line 4');
      assert.strictEqual(range.endLine, 4, 'Task two should be line 4');
    });

    it('calculates lines for headings and standard paragraphs', () => {
      // Line 1: # Main Heading
      // Line 2: (blank)
      // Line 3: First paragraph content.
      // Line 4: (blank)
      // Line 5: Second paragraph content.
      const markdown = '# Main Heading\n\nFirst paragraph content.\n\nSecond paragraph content.';
      setContentFormatted(markdown);

      // Heading: Line 1
      const h1 = editor.querySelector('h1')!;
      const selH1 = setMockSelection(h1.firstChild!, 0, h1.firstChild!, 4, 'Main');
      const rangeH1 = getSelectionLineRange(editor, selH1);
      assert.ok(rangeH1);
      assert.strictEqual(rangeH1.startLine, 1);
      assert.strictEqual(rangeH1.endLine, 1);

      // Second Paragraph: Line 5
      const ps = editor.querySelectorAll('p');
      assert.strictEqual(ps.length, 2);
      const selP2 = setMockSelection(ps[1].firstChild!, 0, ps[1].firstChild!, 6, 'Second');
      const rangeP2 = getSelectionLineRange(editor, selP2);
      assert.ok(rangeP2);
      assert.strictEqual(rangeP2.startLine, 5);
      assert.strictEqual(rangeP2.endLine, 5);
    });

    it('calculates lines for multi-block selection spanning from heading into a table', () => {
      const markdown = '# Main Heading\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
      setContentFormatted(markdown);

      const h1 = editor.querySelector('h1')!;
      const td = editor.querySelector('tbody td')!;

      const sel = setMockSelection(h1.firstChild!, 0, td.firstChild!, 1, 'Heading ... 1');
      const range = getSelectionLineRange(editor, sel);

      assert.ok(range);
      assert.strictEqual(range.startLine, 1);
      assert.strictEqual(range.endLine, 5);
    });
  });

  describe('Raw Mode Textarea Line Range Calculation', () => {
    it('calculates lines correctly from textarea selectionStart and selectionEnd', () => {
      const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
      textarea.value = '# Title\n\nFirst line\nSecond line\nThird line\n';

      // Select "Second line" (line 4)
      const secondLineStart = textarea.value.indexOf('Second line');
      textarea.selectionStart = secondLineStart;
      textarea.selectionEnd = secondLineStart + 'Second line'.length;

      const range = getRawSelectionLineRange(textarea);
      assert.ok(range);
      assert.strictEqual(range.startLine, 4);
      assert.strictEqual(range.endLine, 4);
    });

    it('calculates multi-line range in textarea', () => {
      const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
      textarea.value = '# Line 1\n# Line 2\n# Line 3\n# Line 4\n';

      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.indexOf('# Line 4');

      const range = getRawSelectionLineRange(textarea);
      assert.ok(range);
      assert.strictEqual(range.startLine, 1);
      assert.strictEqual(range.endLine, 3);
    });

    it('returns null if textarea has no text selected', () => {
      const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
      textarea.value = 'Some text';
      textarea.selectionStart = 4;
      textarea.selectionEnd = 4;

      const range = getRawSelectionLineRange(textarea);
      assert.strictEqual(range, null);
    });
  });

  describe('Selection Button Interactions & Positioning', () => {
    it('creates button if not present in DOM and attaches default attributes', () => {
      const existing = document.getElementById('btn-selection-cowork');
      existing?.remove();

      const btn = getSelectionCoworkButton();
      assert.ok(btn);
      assert.strictEqual(btn.id, 'btn-selection-cowork');
      assert.strictEqual(btn.getAttribute('aria-label'), 'Cowork');
      assert.ok(btn.classList.contains('selection-cowork-btn'));
    });

    it('positions button and adds is-visible class', () => {
      const btn = getSelectionCoworkButton()!;
      positionSelectionButton(btn, {
        top: 200,
        bottom: 220,
        left: 100,
        right: 180,
      });

      assert.ok(btn.classList.contains('is-visible'));
      assert.strictEqual(btn.style.display, 'inline-flex');
      assert.strictEqual(btn.style.top, '226px'); // 220 + 6
      assert.strictEqual(btn.style.left, '184px'); // 180 + 4
    });

    it('hides button on hideSelectionCoworkButton', () => {
      const btn = getSelectionCoworkButton()!;
      btn.classList.add('is-visible');
      btn.style.display = 'inline-flex';

      hideSelectionCoworkButton();
      assert.strictEqual(btn.classList.contains('is-visible'), false);
      assert.strictEqual(btn.style.display, 'none');
    });

    it('sends cowork message with exact lines when Cowork button is clicked', () => {
      const markdown = '# Intro\n\n```typescript\nline 1;\nline 2;\n```';
      setContentFormatted(markdown);

      const codeEl = editor.querySelector('code.editor-code')!;
      const textNode = codeEl.firstChild!;
      setMockSelection(textNode, 8, textNode, 14, 'line 2');

      handleCoworkSelectionClick();

      const coworkMsg = postedMessages.find((m) => m.type === 'cowork');
      assert.ok(coworkMsg, 'Cowork message must be posted');
      assert.strictEqual(coworkMsg.type, 'cowork');
      assert.strictEqual(coworkMsg.startLine, 5);
      assert.strictEqual(coworkMsg.endLine, 5);
    });

    it('updates button tooltip when language changes', () => {
      const btn = getSelectionCoworkButton()!;
      setWebviewLanguage('en');
      updateSelectionCoworkButtonLanguage();
      assert.strictEqual(btn.title, 'Cowork with AI Agent on selected lines');

      setWebviewLanguage('de');
      updateSelectionCoworkButtonLanguage();
      assert.strictEqual(btn.title, 'Mit KI-Agent an den ausgewählten Zeilen zusammenarbeiten');
    });

    it('wires click event on existing HTML button and sends message on click', () => {
      const markdown = '# Document Title\n\nSome paragraph text to select.';
      setContentFormatted(markdown);

      wireSelectionCowork();

      const p = editor.querySelector('p')!;
      const textNode = p.firstChild!;
      setMockSelection(textNode, 0, textNode, 14, 'Some paragraph');

      // Trigger selection display logic
      const btn = getSelectionCoworkButton()!;
      assert.ok(btn, 'Button must exist');

      // Simulate mouseup event to position and display the button
      const mouseUpEvt = new window.MouseEvent('mouseup', { clientX: 200, clientY: 200 });
      document.dispatchEvent(mouseUpEvt);

      // Directly click the button element in the DOM
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

      const coworkMsg = postedMessages.find((m) => m.type === 'cowork');
      assert.ok(coworkMsg, 'Cowork message must be posted');
      assert.strictEqual(coworkMsg.type, 'cowork');
      assert.strictEqual(coworkMsg.startLine, 3);
      assert.strictEqual(coworkMsg.endLine, 3);
    });

    it('wires and unwires window/document event listeners without errors', () => {
      const cleanup = wireSelectionCowork();
      assert.doesNotThrow(() => {
        cleanup();
      });
    });
  });
});
