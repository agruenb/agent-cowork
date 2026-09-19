/**
 * Editor Interactions Test Suite
 * ==============================
 *
 * Tests the Markdown editor's behavior during user interactions by simulating
 * the DOM mutations that `contenteditable` and browser APIs produce, then
 * verifying that the serializer (`domToMarkdown`) produces correct Markdown.
 *
 * WHY: The parser and serializer work correctly on well-formed input, but
 * `contenteditable` produces messy, non-standard DOM during user editing.
 * These tests ensure the editor handles those real-world mutations gracefully.
 *
 * PATTERN: Each test follows:
 *   1. Set up DOM via `markdownToHtml(input)` (known-good state)
 *   2. Mutate the DOM to simulate a user action (the way the browser would)
 *   3. Call `domToMarkdown()` and assert the expected Markdown output
 *
 * EXPANDING: To add new interaction tests, follow the pattern above.
 * Group tests by interaction type (Enter key, Tab, formatting, etc.).
 * Use descriptive test names that explain the *user action* being simulated.
 */

import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { indentListItem, outdentListItem } from '../src/markdown/listOperations';
import {
  moveTableRow,
  moveTableColumn,
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
  rowHasContent,
  columnHasContent,
  handleTableKeyDown,
  updateTableControls,
  repositionTableControls,
  showDeleteConfirmPopup,
} from '../src/webview/tableInteractions';

describe('Editor Interactions', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  /** Helper: set up the editor DOM from markdown input */
  function setupEditor(markdown: string): HTMLElement {
    const html = markdownToHtml(markdown);
    const editor = document.getElementById('editor')!;
    editor.innerHTML = html;
    return editor;
  }

  /** Helper: serialize the editor DOM back to markdown (trimmed) */
  function serialize(editor: HTMLElement): string {
    return domToMarkdown(editor).trim();
  }

  // -------------------------------------------------------------------
  // ENTER KEY IN LISTS
  // Simulates the DOM changes that occur when the user presses Enter
  // inside list items. The browser creates new <li> elements or
  // the editor's keydown handler restructures the DOM.
  // -------------------------------------------------------------------
  describe('Enter key in lists', () => {
    it('new <li> created by browser in bullet list produces two list items', () => {
      /**
       * Scenario: User is in a bullet list with one item, presses Enter.
       * The browser inserts a new <li> after the current one.
       * Expected: serializer produces two bullet items.
       */
      const editor = setupEditor('- First item');
      const ul = editor.querySelector('ul')!;
      const newLi = document.createElement('li');
      newLi.className = 'list-item';
      newLi.textContent = 'Second item';
      ul.appendChild(newLi);

      const md = serialize(editor);
      assert.strictEqual(md, '- First item\n- Second item');
    });

    it('empty <li> at end of list serializes without crashing', () => {
      /**
       * Scenario: User presses Enter at the end of a list item, creating
       * an empty <li>. Before the editor's Enter handler removes it,
       * the serializer should handle it without crashing.
       */
      const editor = setupEditor('- Item 1\n- Item 2');
      const ul = editor.querySelector('ul')!;
      const emptyLi = document.createElement('li');
      emptyLi.className = 'list-item';
      emptyLi.innerHTML = '<br>';
      ul.appendChild(emptyLi);

      // Should not crash, and should produce valid markdown
      const md = serialize(editor);
      assert.ok(md.includes('- Item 1'));
      assert.ok(md.includes('- Item 2'));
    });

    it('list exit: removing empty <li> and inserting <p> produces list then paragraph', () => {
      /**
       * Scenario: User presses Enter on an empty list item (list-exit behavior).
       * The editor removes the empty <li> and inserts a <p> after the list.
       * Expected: list followed by empty/new paragraph in markdown.
       */
      const editor = setupEditor('- Item 1\n- Item 2');
      // Simulate: remove last <li>, add <p> after list
      const ul = editor.querySelector('ul')!;
      const items = ul.querySelectorAll('li');
      items[items.length - 1].remove(); // Remove "Item 2" as if it was empty and exited

      const p = document.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.textContent = 'New paragraph';
      editor.appendChild(p);

      const md = serialize(editor);
      assert.strictEqual(md, '- Item 1\n\nNew paragraph');
    });

    it('new task item with checkbox after Enter in task list', () => {
      /**
       * Scenario: User presses Enter in a task list item.
       * The editor creates a new <li> with an unchecked checkbox.
       * Expected: serializer produces two task items.
       */
      const editor = setupEditor('- [x] Done task');
      const ul = editor.querySelector('ul')!;

      const newLi = document.createElement('li');
      newLi.className = 'task-item';
      newLi.setAttribute('data-checked', 'false');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'task-checkbox';
      const span = document.createElement('span');
      span.className = 'task-content';
      span.textContent = 'New task';
      newLi.appendChild(cb);
      newLi.appendChild(span);
      ul.appendChild(newLi);

      const md = serialize(editor);
      assert.strictEqual(md, '- [x] Done task\n- [ ] New task');
    });

    it('Enter after heading creates a new paragraph (browser inserts <div> or <p>)', () => {
      /**
       * Scenario: User presses Enter at the end of a heading.
       * Browsers may insert a <div>, <p>, or <br> after the heading.
       * The serializer must handle all variants without producing broken markdown.
       */
      const editor = setupEditor('# My Heading');

      // Simulate: browser inserts a <div> after the heading (Chrome behavior)
      const div = document.createElement('div');
      div.textContent = 'New text';
      editor.appendChild(div);

      const md = serialize(editor);
      assert.ok(md.includes('# My Heading'));
      assert.ok(md.includes('New text'));
    });

    it('Enter in the middle of a list item text splits correctly', () => {
      /**
       * Scenario: User presses Enter in the middle of "Hello World" in a list item.
       * Browser splits the <li> into two: "Hello" and "World".
       * Expected: two list items in the output.
       */
      const editor = setupEditor('- Hello World');
      const ul = editor.querySelector('ul')!;
      const firstLi = ul.querySelector('li')!;
      firstLi.textContent = 'Hello';

      const secondLi = document.createElement('li');
      secondLi.className = 'list-item';
      secondLi.textContent = 'World';
      ul.appendChild(secondLi);

      const md = serialize(editor);
      assert.strictEqual(md, '- Hello\n- World');
    });
  });

  // -------------------------------------------------------------------
  // TAB / SHIFT+TAB CHAINING
  // Tests indent/outdent sequences that users commonly perform, and
  // verifies the DOM + serializer remain consistent through multiple steps.
  // -------------------------------------------------------------------
  describe('Tab / Shift+Tab chaining (indent/outdent)', () => {
    it('indent → serialize → re-parse → serialize: roundtrip stable', () => {
      /**
       * Scenario: User indents a list item, then the document is saved and reopened.
       * The indent operation should produce DOM that roundtrips cleanly.
       */
      const editor = setupEditor('- Parent\n- Child');
      const items = editor.querySelectorAll('li');
      indentListItem(items[1] as HTMLElement);

      const md1 = serialize(editor);
      assert.strictEqual(md1, '- Parent\n  - Child');

      // Re-parse and re-serialize (simulates save/reopen)
      editor.innerHTML = markdownToHtml(md1);
      const md2 = serialize(editor);
      assert.strictEqual(md2, md1);
    });

    it('indent twice creates 3-level nesting', () => {
      /**
       * Scenario: User indents item B, then indents item C twice to create deep nesting.
       */
      const editor = setupEditor('- A\n- B\n- C');
      const getItems = () => Array.from(editor.querySelectorAll('li')) as HTMLElement[];

      // Indent B under A
      indentListItem(getItems()[1]);
      // Indent C under A (now C is at same level as B)
      indentListItem(getItems()[2]);
      // Indent C again under B
      indentListItem(getItems()[2]);

      const md = serialize(editor);
      assert.strictEqual(md, '- A\n  - B\n    - C');
    });

    it('indent then outdent returns to original structure', () => {
      /**
       * Scenario: User indents a list item, then immediately outdents it.
       * Expected: structure returns to original flat list.
       */
      const editor = setupEditor('- Alpha\n- Beta');
      const items = Array.from(editor.querySelectorAll('li')) as HTMLElement[];

      indentListItem(items[1]);
      let md = serialize(editor);
      assert.strictEqual(md, '- Alpha\n  - Beta');

      // Now outdent Beta back
      const nestedBeta = editor.querySelectorAll('li')[1] as HTMLElement;
      outdentListItem(nestedBeta);
      md = serialize(editor);
      assert.strictEqual(md, '- Alpha\n- Beta');
    });

    it('outdent nested item with siblings preserves remaining siblings', () => {
      /**
       * Scenario: List has A > [B, C]. User outdents B.
       * Expected: A > [C], B becomes sibling of A.
       */
      const editor = setupEditor('- A\n  - B\n  - C');
      const nestedItems = editor.querySelectorAll('li');
      const itemB = nestedItems[1] as HTMLElement;

      outdentListItem(itemB);
      const md = serialize(editor);
      assert.ok(md.includes('- A'));
      assert.ok(md.includes('- B'));
      assert.ok(md.includes('  - C'));
    });
  });

  // -------------------------------------------------------------------
  // BOLD / ITALIC / STRIKETHROUGH TOGGLING
  // Tests the DOM state after `document.execCommand` formatting commands,
  // ensuring the serializer correctly wraps/unwraps Markdown syntax.
  // -------------------------------------------------------------------
  describe('Bold / Italic / Strikethrough formatting', () => {
    it('bold wrapping: <strong> around text serializes to **text**', () => {
      /**
       * Scenario: User selects text and presses Ctrl+B.
       * Browser wraps selection in <strong>.
       */
      const editor = setupEditor('Some text here');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Some <strong>text</strong> here';

      const md = serialize(editor);
      assert.strictEqual(md, 'Some **text** here');
    });

    it('italic wrapping: <em> around text serializes to *text*', () => {
      const editor = setupEditor('Some text here');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Some <em>text</em> here';

      const md = serialize(editor);
      assert.strictEqual(md, 'Some *text* here');
    });

    it('strikethrough wrapping: <del> around text serializes to ~~text~~', () => {
      const editor = setupEditor('Some text here');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Some <del>text</del> here';

      const md = serialize(editor);
      assert.strictEqual(md, 'Some ~~text~~ here');
    });

    it('nested bold+italic: <strong><em> serializes to ***text***', () => {
      /**
       * Scenario: User applies both bold and italic to text.
       * Expected: the serializer produces nested markdown markers.
       */
      const editor = setupEditor('Some text here');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Some <strong><em>text</em></strong> here';

      const md = serialize(editor);
      assert.strictEqual(md, 'Some ***text*** here');
    });

    it('empty <strong> tag is ignored by serializer', () => {
      /**
       * Scenario: User toggles bold off, but browser leaves empty <strong></strong>.
       * Expected: no stray ** in output.
       */
      const editor = setupEditor('Hello world');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Hello <strong></strong>world';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello world');
    });

    it('empty <em> tag is ignored by serializer', () => {
      const editor = setupEditor('Hello world');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Hello <em></em>world';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello world');
    });

    it('<b> tag (not <strong>) is treated as bold', () => {
      /**
       * Some browsers use <b> instead of <strong>.
       * The serializer must handle both.
       */
      const editor = setupEditor('Hello world');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Hello <b>bold</b> world';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello **bold** world');
    });

    it('<i> tag (not <em>) is treated as italic', () => {
      const editor = setupEditor('Hello world');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Hello <i>italic</i> world';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello *italic* world');
    });

    it('<s> tag (not <del>) is treated as strikethrough', () => {
      const editor = setupEditor('Hello world');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Hello <s>struck</s> world';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello ~~struck~~ world');
    });

    it('formatting inside a list item preserves list structure', () => {
      const editor = setupEditor('- Plain item');
      const li = editor.querySelector('li')!;
      li.innerHTML = '<strong>Bold</strong> item';

      const md = serialize(editor);
      assert.strictEqual(md, '- **Bold** item');
    });
  });

  // -------------------------------------------------------------------
  // PASTE HANDLING
  // Tests the DOM state after paste events strip formatting and insert
  // plain text via the editor's paste handler.
  // -------------------------------------------------------------------
  describe('Paste handling', () => {
    it('pasting multi-line text into a paragraph creates proper content', () => {
      /**
       * Scenario: User pastes "Line 1\nLine 2" into a paragraph.
       * The paste handler uses insertText which may create <br> or split blocks.
       * We simulate the result: text with <br> inside a <p>.
       */
      const editor = setupEditor('Before');
      const p = editor.querySelector('p')!;
      p.innerHTML = 'Before<br>Line 1<br>Line 2';

      const md = serialize(editor);
      // Should contain the text, possibly with line breaks
      assert.ok(md.includes('Before'));
      assert.ok(md.includes('Line 1'));
      assert.ok(md.includes('Line 2'));
    });

    it('pasting text into a list item preserves list structure', () => {
      /**
       * Scenario: User pastes text into the middle of a list item.
       * Expected: the list structure is preserved, only text changes.
       */
      const editor = setupEditor('- Original');
      const li = editor.querySelector('li')!;
      li.textContent = 'Original pasted text';

      const md = serialize(editor);
      assert.strictEqual(md, '- Original pasted text');
    });

    it('pasting text with leading/trailing whitespace does not create empty blocks', () => {
      const editor = document.getElementById('editor')!;
      // Simulate paste result: <p> with whitespace-padded text
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">  Hello world  </p>';

      const md = serialize(editor);
      assert.strictEqual(md, 'Hello world');
    });
  });

  // -------------------------------------------------------------------
  // HEADING CHANGES
  // Tests the DOM state after the heading dropdown changes a block type
  // via document.execCommand('formatBlock').
  // -------------------------------------------------------------------
  describe('Heading changes', () => {
    it('paragraph changed to H1 serializes as # heading', () => {
      /**
       * Scenario: User selects a paragraph and changes it to H1 via dropdown.
       * Browser replaces <p> with <h1>.
       */
      const editor = setupEditor('My title');
      const p = editor.querySelector('p')!;
      const h1 = document.createElement('h1');
      h1.className = 'editor-block';
      h1.setAttribute('data-block-type', 'heading');
      h1.setAttribute('data-level', '1');
      h1.textContent = p.textContent;
      p.replaceWith(h1);

      const md = serialize(editor);
      assert.strictEqual(md, '# My title');
    });

    it('H1 changed to H2 serializes as ## heading', () => {
      const editor = setupEditor('# Big heading');
      const h1 = editor.querySelector('h1')!;
      const h2 = document.createElement('h2');
      h2.className = 'editor-block';
      h2.setAttribute('data-block-type', 'heading');
      h2.setAttribute('data-level', '2');
      h2.textContent = h1.textContent;
      h1.replaceWith(h2);

      const md = serialize(editor);
      assert.strictEqual(md, '## Big heading');
    });

    it('heading changed back to paragraph removes # prefix', () => {
      const editor = setupEditor('# Was a heading');
      const h1 = editor.querySelector('h1')!;
      const p = document.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.textContent = h1.textContent;
      h1.replaceWith(p);

      const md = serialize(editor);
      assert.strictEqual(md, 'Was a heading');
    });

    it('heading with inline formatting preserves formatting markers', () => {
      /**
       * Scenario: Heading text contains bold/italic.
       * Expected: # **bold title** in output.
       */
      const editor = setupEditor('# Bold title');
      const h1 = editor.querySelector('h1')!;
      h1.innerHTML = '<strong>Bold</strong> title';

      const md = serialize(editor);
      assert.strictEqual(md, '# **Bold** title');
    });

    it('heading without data-level falls back to tag name', () => {
      /**
       * Scenario: Browser creates an <h3> without the data-level attribute
       * (e.g., via formatBlock command).
       */
      const editor = document.getElementById('editor')!;
      editor.innerHTML = '<h3 class="editor-block">Level 3</h3>';

      const md = serialize(editor);
      assert.strictEqual(md, '### Level 3');
    });
  });

  // -------------------------------------------------------------------
  // TASK CHECKBOX TOGGLING
  // Tests the DOM changes when a user clicks a task checkbox, ensuring
  // the serializer reflects the new checked/unchecked state.
  // -------------------------------------------------------------------
  describe('Task checkbox toggling', () => {
    it('checking a checkbox produces - [x] in output', () => {
      const editor = setupEditor('- [ ] My task');
      const li = editor.querySelector('li')!;
      const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement;

      // Simulate check
      cb.checked = true;
      li.classList.add('is-checked');
      li.setAttribute('data-checked', 'true');

      const md = serialize(editor);
      assert.strictEqual(md, '- [x] My task');
    });

    it('unchecking a checkbox produces - [ ] in output', () => {
      const editor = setupEditor('- [x] Done task');
      const li = editor.querySelector('li')!;
      const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement;

      // Simulate uncheck
      cb.checked = false;
      li.classList.remove('is-checked');
      li.setAttribute('data-checked', 'false');

      const md = serialize(editor);
      assert.strictEqual(md, '- [ ] Done task');
    });

    it('toggling a nested task item only affects that item', () => {
      const editor = setupEditor('- [ ] Parent\n  - [ ] Child A\n  - [ ] Child B');
      // Find the second nested item (Child B)
      const allItems = editor.querySelectorAll('li');
      const childB = allItems[2] as HTMLElement;
      const cb = childB.querySelector('input[type="checkbox"]') as HTMLInputElement;

      cb.checked = true;
      childB.classList.add('is-checked');
      childB.setAttribute('data-checked', 'true');

      const md = serialize(editor);
      assert.ok(md.includes('- [ ] Parent'));
      assert.ok(md.includes('- [ ] Child A'));
      assert.ok(md.includes('- [x] Child B'));
    });
  });

  // -------------------------------------------------------------------
  // CODE BLOCK EDITING
  // Tests editing text inside fenced code blocks, ensuring the serializer
  // preserves the ``` markers and language tag.
  // -------------------------------------------------------------------
  describe('Code block editing', () => {
    it('editing code content preserves fenced block markers', () => {
      const editor = setupEditor('```js\nconsole.log("hi")\n```');
      const codeEl = editor.querySelector('code')!;
      codeEl.textContent = 'console.log("updated")';

      const md = serialize(editor);
      assert.ok(md.includes('```js'));
      assert.ok(md.includes('console.log("updated")'));
      assert.ok(md.includes('```'));
    });

    it('adding new lines inside code block does not split the block', () => {
      const editor = setupEditor('```\nline1\n```');
      const codeEl = editor.querySelector('code')!;
      codeEl.textContent = 'line1\nline2\nline3';

      const md = serialize(editor);
      assert.ok(md.includes('line1\nline2\nline3'));
      // Should still be wrapped in a single fenced block
      const fenceCount = (md.match(/```/g) || []).length;
      assert.strictEqual(fenceCount, 2, 'Should have exactly two fence markers');
    });

    it('empty code block serializes with empty content', () => {
      const editor = setupEditor('```\nsome code\n```');
      const codeEl = editor.querySelector('code')!;
      codeEl.textContent = '';

      const md = serialize(editor);
      assert.ok(md.includes('```'));
    });
  });

  // -------------------------------------------------------------------
  // TABLE CELL EDITING
  // Tests editing individual cells in tables, ensuring the full table
  // markdown structure remains intact.
  // -------------------------------------------------------------------
  describe('Table cell editing', () => {
    it('editing a single cell preserves table structure', () => {
      const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const editor = setupEditor(input);
      const firstTd = editor.querySelector('td')!;
      firstTd.textContent = 'Updated';

      const md = serialize(editor);
      assert.ok(md.includes('| Updated |'));
      assert.ok(md.includes('| B |'));
    });

    it('empty cell serializes with space placeholder', () => {
      const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const editor = setupEditor(input);
      const tds = editor.querySelectorAll('td');
      tds[0].textContent = '';
      tds[1].textContent = '';

      const md = serialize(editor);
      // Serializer uses ' ' for empty cells
      assert.ok(md.includes('|'));
    });

    it('bold inside table cell serializes correctly', () => {
      const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const editor = setupEditor(input);
      const firstTd = editor.querySelector('td')!;
      firstTd.innerHTML = '<strong>bold</strong>';

      const md = serialize(editor);
      assert.ok(md.includes('**bold**'));
    });
  });

  // -------------------------------------------------------------------
  // ADVANCED TABLE INTERACTIONS
  // Tests checkbox-only cells, row/column reordering, add/remove rows/cols,
  // content confirmation logic, and keyboard cell navigation.
  // -------------------------------------------------------------------
  describe('Advanced Table Interactions', () => {
    describe('Checkbox cell interactions', () => {
      it('cell with only a checkbox parses as table-checkbox-cell', () => {
        const input = '| Task | Done |\n| --- | --- |\n| Buy milk | [x] |\n| Clean desk | [ ] |';
        const editor = setupEditor(input);

        const checkboxCells = editor.querySelectorAll('.table-checkbox-cell');
        assert.strictEqual(checkboxCells.length, 2);

        const firstCbCell = checkboxCells[0] as HTMLElement;
        assert.strictEqual(firstCbCell.getAttribute('data-checked'), 'true');
        assert.ok(firstCbCell.classList.contains('is-checked'));
        const firstInput = firstCbCell.querySelector('input[type="checkbox"]') as HTMLInputElement;
        assert.ok(firstInput && firstInput.checked);

        const secondCbCell = checkboxCells[1] as HTMLElement;
        assert.strictEqual(secondCbCell.getAttribute('data-checked'), 'false');
        assert.ok(!secondCbCell.classList.contains('is-checked'));
        const secondInput = secondCbCell.querySelector('input[type="checkbox"]') as HTMLInputElement;
        assert.ok(secondInput && !secondInput.checked);
      });

      it('toggling checkbox cell state serializes back cleanly', () => {
        const input = '| Task | Done |\n| --- | --- |\n| Buy milk | [ ] |';
        const editor = setupEditor(input);

        const cbCell = editor.querySelector('.table-checkbox-cell') as HTMLElement;
        const cbInput = cbCell.querySelector('input[type="checkbox"]') as HTMLInputElement;

        // Simulate toggling to checked
        cbInput.checked = true;
        cbCell.setAttribute('data-checked', 'true');
        cbCell.classList.add('is-checked');

        let md = serialize(editor);
        assert.ok(md.includes('| Buy milk | [x] |'));

        // Simulate toggling back to unchecked
        cbInput.checked = false;
        cbCell.setAttribute('data-checked', 'false');
        cbCell.classList.remove('is-checked');

        md = serialize(editor);
        assert.ok(md.includes('| Buy milk | [ ] |'));
      });

      it('supports - [x] and - [ ] bullet prefix inside checkbox cells', () => {
        const input = '| Item | Status |\n| --- | --- |\n| Test | - [x] |';
        const editor = setupEditor(input);

        const cbCell = editor.querySelector('.table-checkbox-cell') as HTMLElement;
        assert.ok(cbCell);
        assert.strictEqual(cbCell.getAttribute('data-checked'), 'true');

        const md = serialize(editor);
        assert.ok(md.includes('| Test | [x] |'));
      });

      it('cell with checkbox and additional text is not treated as a checkbox-only cell', () => {
        const input = '| Item |\n| --- |\n| [x] with extra text |';
        const editor = setupEditor(input);

        const cbCell = editor.querySelector('.table-checkbox-cell');
        assert.strictEqual(cbCell, null);
      });
    });

    describe('Row and column reordering', () => {
      it('moveTableRow reorders rows in the table body', () => {
        const input = '| ID | Name |\n| --- | --- |\n| 1 | Alice |\n| 2 | Bob |\n| 3 | Charlie |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const tbody = table.querySelector('tbody')!;

        // Move row 0 (Alice) to row 2 (after Charlie)
        moveTableRow(tbody, 0, 2);

        const md = serialize(editor);
        const rows = md.split('\n').filter((l) => l.startsWith('|'));
        assert.ok(rows[2].includes('Bob'));
        assert.ok(rows[3].includes('Charlie'));
        assert.ok(rows[4].includes('Alice'));
      });

      it('moveTableColumn reorders columns across headers and all body rows', () => {
        const input = '| ColA | ColB | ColC |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Move column 0 (ColA) to column 1 (between ColB and ColC)
        moveTableColumn(table, 0, 1);

        const md = serialize(editor);
        assert.ok(md.includes('| ColB | ColA | ColC |'));
        assert.ok(md.includes('| 2 | 1 | 3 |'));
        assert.ok(md.includes('| 5 | 4 | 6 |'));
      });

      it('moveTableColumn moving last column to first column', () => {
        const input = '| ColA | ColB | ColC |\n| --- | --- | --- |\n| 1 | 2 | 3 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Move column 2 (ColC) to index 0
        moveTableColumn(table, 2, 0);

        const md = serialize(editor);
        assert.ok(md.includes('| ColC | ColA | ColB |'));
        assert.ok(md.includes('| 3 | 1 | 2 |'));
      });
    });

    describe('Adding rows and columns', () => {
      it('addTableRow adds a row at the end with matching column count', () => {
        const input = '| Header 1 | Header 2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        addTableRow(table);

        const tbody = table.querySelector('tbody')!;
        assert.strictEqual(tbody.children.length, 2);
        assert.strictEqual(tbody.children[1].children.length, 2);

        const md = serialize(editor);
        assert.ok(md.includes('| Header 1 | Header 2 |'));
        assert.ok(md.includes('| A | B |'));
        assert.ok(md.includes('|   |   |'));
      });

      it('addTableRow with insertAtIndex inserts row between existing rows', () => {
        const input = '| N |\n| --- |\n| Row 1 |\n| Row 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Insert at index 1 (between Row 1 and Row 2)
        const newRow = addTableRow(table, 1);
        const td = newRow.querySelector('td')!;
        td.textContent = 'Inserted Row';

        const md = serialize(editor);
        const lines = md.split('\n').filter((l) => l.startsWith('|'));
        assert.ok(lines[2].includes('Row 1'));
        assert.ok(lines[3].includes('Inserted Row'));
        assert.ok(lines[4].includes('Row 2'));
      });

      it('addTableColumn adds a column at the end across headers and rows', () => {
        const input = '| H1 | H2 |\n| --- | --- |\n| A | B |\n| C | D |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        addTableColumn(table);

        const thead = table.querySelector('thead tr')!;
        assert.strictEqual(thead.children.length, 3);
        assert.strictEqual(thead.children[2].textContent, 'Spalte 3');

        const tbodyRows = table.querySelectorAll('tbody tr');
        assert.strictEqual(tbodyRows[0].children.length, 3);
        assert.strictEqual(tbodyRows[1].children.length, 3);

        const md = serialize(editor);
        assert.ok(md.includes('| H1 | H2 | Spalte 3 |'));
        assert.ok(md.includes('| A | B |   |'));
        assert.ok(md.includes('| C | D |   |'));
      });

      it('addTableColumn with insertAtIndex inserts column between existing columns', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Insert at index 1 (between Col1 and Col2)
        addTableColumn(table, 1);

        const headerCells = table.querySelectorAll('thead th');
        assert.strictEqual(headerCells.length, 3);
        assert.strictEqual(headerCells[0].textContent, 'Col1');
        assert.strictEqual(headerCells[1].textContent, 'Spalte 3');
        assert.strictEqual(headerCells[2].textContent, 'Col2');

        const md = serialize(editor);
        assert.ok(md.includes('| Col1 | Spalte 3 | Col2 |'));
        assert.ok(md.includes('| A |   | B |'));
      });
    });

    describe('Removing rows and columns with content checks', () => {
      it('rowHasContent accurately detects empty vs non-empty rows', () => {
        const input = '| A | B |\n| --- | --- |\n| Hello |   |\n|   |   |';
        const editor = setupEditor(input);
        const rows = editor.querySelectorAll('tbody tr');

        assert.strictEqual(rowHasContent(rows[0] as HTMLTableRowElement), true);
        assert.strictEqual(rowHasContent(rows[1] as HTMLTableRowElement), false);
      });

      it('rowHasContent detects checked checkboxes as content', () => {
        const input = '| Task |\n| --- |\n| [x] |\n| [ ] |';
        const editor = setupEditor(input);
        const rows = editor.querySelectorAll('tbody tr');

        assert.strictEqual(rowHasContent(rows[0] as HTMLTableRowElement), true);
        assert.strictEqual(rowHasContent(rows[1] as HTMLTableRowElement), false);
      });

      it('columnHasContent detects text in header or body cells', () => {
        const input = '| Title | EmptyCol |\n| --- | --- |\n| Text |   |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        assert.strictEqual(columnHasContent(table, 0), true);
        // EmptyCol header has text "EmptyCol", so it's non-empty
        assert.strictEqual(columnHasContent(table, 1), true);

        // Clear header text for column 1
        table.querySelectorAll('thead th')[1].textContent = '';
        assert.strictEqual(columnHasContent(table, 1), false);
      });

      it('removeTableRow deletes row and serializes cleanly', () => {
        const input = '| A |\n| --- |\n| 1 |\n| 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Non-empty row without force should not delete
        assert.strictEqual(removeTableRow(table, 0, false), false);

        // Non-empty row with force should delete
        const removed = removeTableRow(table, 0, true);
        assert.strictEqual(removed, true);

        const md = serialize(editor);
        assert.ok(!md.includes('| 1 |'));
        assert.ok(md.includes('| 2 |'));
      });

      it('removeTableColumn deletes column across headers and all rows', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |\n| C | D |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        // Non-empty column without force should not delete
        assert.strictEqual(removeTableColumn(table, 0, false), false);

        // Non-empty column with force should delete
        const removed = removeTableColumn(table, 0, true);
        assert.strictEqual(removed, true);

        const md = serialize(editor);
        assert.ok(!md.includes('Col1'));
        assert.ok(md.includes('| Col2 |'));
        assert.ok(md.includes('| B |'));
        assert.ok(md.includes('| D |'));
      });

      it('removeTableColumn prevents deleting the last remaining column', () => {
        const input = '| SingleCol |\n| --- |\n| Val |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;

        const removed = removeTableColumn(table, 0);
        assert.strictEqual(removed, false);

        const md = serialize(editor);
        assert.ok(md.includes('| SingleCol |'));
      });
    });

    describe('Keyboard Tab and Arrow navigation', () => {
      it('pressing Tab in the last cell adds a new row and triggers edit', () => {
        const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const lastCell = table.querySelectorAll('td')[1];

        // Position selection in last cell
        const range = document.createRange();
        range.selectNodeContents(lastCell);
        const sel = dom.window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        let editEmitted = false;
        const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab' });

        const handled = handleTableKeyDown(event, editor, () => {
          editEmitted = true;
        });

        assert.strictEqual(handled, true);
        assert.strictEqual(editEmitted, true);

        const tbodyRows = table.querySelectorAll('tbody tr');
        assert.strictEqual(tbodyRows.length, 2);
      });

      it('pressing ArrowDown navigates to the cell below at the same column', () => {
        const input = '| ColA | ColB |\n| --- | --- |\n| 1 | 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const headerB = table.querySelectorAll('th')[1];

        const range = document.createRange();
        range.selectNodeContents(headerB);
        range.collapse(false);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' });
        const handled = handleTableKeyDown(event, editor, () => {});

        assert.strictEqual(handled, true);
        const targetTd = table.querySelectorAll('tbody td')[1];
        assert.ok(targetTd.contains(sel.anchorNode));
      });

      it('pressing ArrowUp navigates to the cell above at the same column', () => {
        const input = '| ColA | ColB |\n| --- | --- |\n| 1 | 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const bodyA = table.querySelectorAll('tbody td')[0];

        const range = document.createRange();
        range.selectNodeContents(bodyA);
        range.collapse(false);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp' });
        const handled = handleTableKeyDown(event, editor, () => {});

        assert.strictEqual(handled, true);
        const headerA = table.querySelectorAll('th')[0];
        assert.ok(headerA.contains(sel.anchorNode));
      });

      it('pressing ArrowRight at the end of a cell navigates to the next cell', () => {
        const input = '| ColA | ColB |\n| --- | --- |\n| 1 | 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const cellA = table.querySelectorAll('tbody td')[0];

        // Caret at end of cellA ("1")
        const range = document.createRange();
        range.selectNodeContents(cellA);
        range.collapse(false);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' });
        const handled = handleTableKeyDown(event, editor, () => {});

        assert.strictEqual(handled, true);
        const cellB = table.querySelectorAll('tbody td')[1];
        assert.ok(cellB.contains(sel.anchorNode));
      });

      it('pressing ArrowLeft at the start of a cell navigates to the previous cell', () => {
        const input = '| ColA | ColB |\n| --- | --- |\n| 1 | 2 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const cellB = table.querySelectorAll('tbody td')[1];

        // Caret at start of cellB ("2")
        const range = document.createRange();
        range.selectNodeContents(cellB);
        range.collapse(true);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft' });
        const handled = handleTableKeyDown(event, editor, () => {});

        assert.strictEqual(handled, true);
        const cellA = table.querySelectorAll('tbody td')[0];
        assert.ok(cellA.contains(sel.anchorNode));
      });

      it('pressing ArrowRight at end of row wraps to first cell of next row', () => {
        const input = '| ColA | ColB |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const cellRow1End = table.querySelectorAll('tbody tr')[0].querySelectorAll('td')[1];

        const range = document.createRange();
        range.selectNodeContents(cellRow1End);
        range.collapse(false);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' });
        const handled = handleTableKeyDown(event, editor, () => {});

        assert.strictEqual(handled, true);
        const cellRow2Start = table.querySelectorAll('tbody tr')[1].querySelectorAll('td')[0];
        assert.ok(cellRow2Start.contains(sel.anchorNode));
      });

      it('does not navigate between cells when caret is inside text (not at boundary)', () => {
        const input = '| Hello |\n| --- |\n| World |';
        const editor = setupEditor(input);
        const table = editor.querySelector('table')!;
        const cell = table.querySelectorAll('tbody td')[0];
        const textNode = cell.firstChild!;

        // Place caret between 'o' and 'r' in "World" (offset 2)
        const range = document.createRange();
        range.setStart(textNode, 2);
        range.collapse(true);
        const sel = dom.window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        const eventLeft = new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft' });
        assert.strictEqual(handleTableKeyDown(eventLeft, editor, () => {}), false);

        const eventRight = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' });
        assert.strictEqual(handleTableKeyDown(eventRight, editor, () => {}), false);
      });
    });

    describe('Extracted Delete Buttons & Confirmation Popup', () => {
      it('drag button and delete button are separate independent DOM elements', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| Cell1 | Cell2 |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        assert.ok(wrapper, 'Table wrapper should exist');

        let edits = 0;
        updateTableControls(wrapper, () => edits++);

        const controls = wrapper.querySelector('.table-controls')!;
        assert.ok(controls, 'Table controls should exist');

        // Column drag and delete buttons
        const colDragBtns = controls.querySelectorAll('.table-col-drag-btn');
        const colDelBtns = controls.querySelectorAll('.table-col-del-btn');
        assert.strictEqual(colDragBtns.length, 2, 'Should have 2 column drag buttons');
        assert.strictEqual(colDelBtns.length, 2, 'Should have 2 column delete buttons');

        // Verify drag button does NOT contain the delete button (they are separate)
        colDragBtns.forEach((dragBtn) => {
          assert.strictEqual(dragBtn.querySelector('.table-col-del-btn'), null);
          assert.strictEqual(dragBtn.querySelector('.table-btn-del'), null);
        });

        // Row drag and delete buttons
        const rowDragBtns = controls.querySelectorAll('.table-row-drag-btn');
        const rowDelBtns = controls.querySelectorAll('.table-row-del-btn');
        assert.strictEqual(rowDragBtns.length, 1, 'Should have 1 row drag button');
        assert.strictEqual(rowDelBtns.length, 1, 'Should have 1 row delete button');

        // Verify row drag button does NOT contain the delete button
        rowDragBtns.forEach((dragBtn) => {
          assert.strictEqual(dragBtn.querySelector('.table-row-del-btn'), null);
          assert.strictEqual(dragBtn.querySelector('.table-btn-del'), null);
        });
      });

      it('clicking column delete with content opens confirmation popup and can be cancelled', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| Text | Text2 |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        let edits = 0;
        updateTableControls(wrapper, () => edits++);

        const colDelBtn = wrapper.querySelector('.table-col-del-btn') as HTMLButtonElement;
        assert.ok(colDelBtn);

        // Click delete button
        colDelBtn.click();

        // Popup should appear
        const popup = wrapper.querySelector('.table-confirm-popup') as HTMLElement;
        assert.ok(popup, 'Confirmation popup should appear');
        assert.ok(popup.textContent?.includes('Spalte löschen?'));

        // Click "Abbrechen"
        const cancelBtn = popup.querySelector('.table-confirm-cancel') as HTMLButtonElement;
        assert.ok(cancelBtn);
        cancelBtn.click();

        // Popup should be removed and column not deleted
        assert.strictEqual(wrapper.querySelector('.table-confirm-popup'), null);
        const headers = wrapper.querySelectorAll('thead th');
        assert.strictEqual(headers.length, 2, 'Both columns should still exist');
        assert.strictEqual(edits, 0);
      });

      it('confirming column delete in popup removes column and triggers edit', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| Text | Text2 |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        let edits = 0;
        updateTableControls(wrapper, () => edits++);

        const colDelBtn = wrapper.querySelector('.table-col-del-btn') as HTMLButtonElement;
        colDelBtn.click();

        const popup = wrapper.querySelector('.table-confirm-popup') as HTMLElement;
        assert.ok(popup);

        const deleteBtn = popup.querySelector('.table-confirm-delete') as HTMLButtonElement;
        assert.ok(deleteBtn);
        deleteBtn.click();

        // Popup dismissed, column removed, edit emitted
        assert.strictEqual(wrapper.querySelector('.table-confirm-popup'), null);
        const headers = wrapper.querySelectorAll('thead th');
        assert.strictEqual(headers.length, 1);
        assert.strictEqual(edits, 1);
      });

      it('clicking row delete with content opens confirmation popup and can be closed with Escape', () => {
        const input = '| Col1 |\n| --- |\n| RowText |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        let edits = 0;
        updateTableControls(wrapper, () => edits++);

        const rowDelBtn = wrapper.querySelector('.table-row-del-btn') as HTMLButtonElement;
        assert.ok(rowDelBtn);
        rowDelBtn.click();

        const popup = wrapper.querySelector('.table-confirm-popup') as HTMLElement;
        assert.ok(popup, 'Confirmation popup should appear for row');
        assert.ok(popup.textContent?.includes('Zeile löschen?'));

        // Press Escape on document
        const escEvent = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escEvent);

        assert.strictEqual(wrapper.querySelector('.table-confirm-popup'), null);
        const bodyRows = wrapper.querySelectorAll('tbody tr');
        assert.strictEqual(bodyRows.length, 1, 'Row should still exist after Escape');
      });

      it('empty row deletes immediately without showing confirmation popup', () => {
        const input = '| Col1 |\n| --- |\n|   |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        let edits = 0;
        updateTableControls(wrapper, () => edits++);

        const rowDelBtn = wrapper.querySelector('.table-row-del-btn') as HTMLButtonElement;
        assert.ok(rowDelBtn);
        rowDelBtn.click();

        // Should NOT show popup
        assert.strictEqual(wrapper.querySelector('.table-confirm-popup'), null);
        // Row should be deleted immediately
        const bodyRows = wrapper.querySelectorAll('tbody tr');
        assert.strictEqual(bodyRows.length, 0);
        assert.strictEqual(edits, 1);
      });

      it('repositionTableControls updates row handles with scrollLeft offset', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        // Simulate horizontal scroll
        wrapper.scrollLeft = 120;
        repositionTableControls(wrapper);

        const rowDragBtn = wrapper.querySelector('.table-row-drag-btn') as HTMLElement;
        const rowDelBtn = wrapper.querySelector('.table-row-del-btn') as HTMLElement;
        assert.ok(rowDragBtn.style.left.includes('px'));
        assert.ok(rowDelBtn.style.left.includes('px'));
      });

      it('column delete button is positioned above the drag handle and both are centered', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const colDragBtn = wrapper.querySelector('.table-col-drag-btn[data-col-idx="0"]') as HTMLElement;
        const colDelBtn = wrapper.querySelector('.table-col-del-btn[data-col-idx="0"]') as HTMLElement;

        assert.ok(colDragBtn);
        assert.ok(colDelBtn);

        const dragTop = parseFloat(colDragBtn.style.top);
        const delTop = parseFloat(colDelBtn.style.top);

        // Delete button should be positioned above the drag handle (smaller top value)
        assert.ok(delTop < dragTop, `Delete button top (${delTop}) should be above drag handle top (${dragTop})`);

        // Both should share the same horizontal center (left offset)
        assert.strictEqual(colDragBtn.style.left, colDelBtn.style.left);
      });

      it('row drag button and add row button are centrally aligned horizontally', () => {
        const input = '| Col1 |\n| --- |\n| A |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const rowDragBtn = wrapper.querySelector('.table-row-drag-btn[data-row-idx="0"]') as HTMLElement;
        const insertRowBtn = wrapper.querySelector('.row-insert-btn[data-row-idx="0"]') as HTMLElement;

        assert.ok(rowDragBtn);
        assert.ok(insertRowBtn);

        // Row drag handle and insert row button share identical left coordinates
        assert.strictEqual(rowDragBtn.style.left, insertRowBtn.style.left);
      });

      it('row controls are positioned outside the document to the left with negative coordinates', () => {
        const input = '| Col1 |\n| --- |\n| A |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const rowDragBtn = wrapper.querySelector('.table-row-drag-btn[data-row-idx="0"]') as HTMLElement;
        const rowDelBtn = wrapper.querySelector('.table-row-del-btn[data-row-idx="0"]') as HTMLElement;
        const insertRowBtn = wrapper.querySelector('.row-insert-btn[data-row-idx="0"]') as HTMLElement;

        assert.ok(rowDragBtn);
        assert.ok(rowDelBtn);
        assert.ok(insertRowBtn);

        const dragLeft = parseFloat(rowDragBtn.style.left);
        const delLeft = parseFloat(rowDelBtn.style.left);
        const insertLeft = parseFloat(insertRowBtn.style.left);

        // All row controls sit outside the document flow (negative left offset relative to table)
        assert.ok(dragLeft < 0, `Row drag button (${dragLeft}) should be outside the document (< 0)`);
        assert.ok(delLeft < 0, `Row delete button (${delLeft}) should be outside the document (< 0)`);
        assert.ok(insertLeft < 0, `Row insert button (${insertLeft}) should be outside the document (< 0)`);
        assert.ok(delLeft < dragLeft, `Row delete button (${delLeft}) should be further left than drag handle (${dragLeft})`);
      });

      it('controls contain SVG icons for pixel-perfect alignment without baseline variation', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const colDragGrip = wrapper.querySelector('.col-grip svg');
        const colDelIcon = wrapper.querySelector('.table-col-del-btn svg');
        const colInsertIcon = wrapper.querySelector('.col-insert-btn svg');
        const rowDragGrip = wrapper.querySelector('.row-grip svg');
        const rowDelIcon = wrapper.querySelector('.table-row-del-btn svg');
        const rowInsertIcon = wrapper.querySelector('.row-insert-btn svg');

        assert.ok(colDragGrip, 'Col drag grip should have SVG icon');
        assert.ok(colDelIcon, 'Col delete button should have SVG icon');
        assert.ok(colInsertIcon, 'Col insert button should have SVG icon');
        assert.ok(rowDragGrip, 'Row drag grip should have SVG icon');
        assert.ok(rowDelIcon, 'Row delete button should have SVG icon');
        assert.ok(rowInsertIcon, 'Row insert button should have SVG icon');
      });

      it('during row drag only the active dragged handle is visible', () => {
        const input = '| Col1 |\n| --- |\n| Row 0 |\n| Row 1 |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const rowDragBtns = wrapper.querySelectorAll('.table-row-drag-btn') as NodeListOf<HTMLElement>;
        assert.strictEqual(rowDragBtns.length, 2);

        // Dispatch mousedown on row 0 drag button
        const mousedownEvent = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
        rowDragBtns[0].dispatchEvent(mousedownEvent);

        // Row 0 should be visible, row 1 should be hidden
        assert.strictEqual(rowDragBtns[0].style.display, 'flex');
        assert.strictEqual(rowDragBtns[1].style.display, 'none');

        // Delete and insert buttons should be hidden during drag
        const rowDelBtns = wrapper.querySelectorAll('.table-row-del-btn') as NodeListOf<HTMLElement>;
        rowDelBtns.forEach((btn) => {
          assert.strictEqual(btn.style.display, 'none');
        });

        // Release drag
        const mouseupEvent = new dom.window.MouseEvent('mouseup', { bubbles: true });
        document.dispatchEvent(mouseupEvent);
      });

      it('initial row mousedown positions indicator at handle height', () => {
        const input = '| Col1 |\n| --- |\n| Row 0 |\n| Row 1 |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const rowDragBtns = wrapper.querySelectorAll('.table-row-drag-btn') as NodeListOf<HTMLElement>;
        const rowIndicator = wrapper.querySelector('.table-drop-indicator-row') as HTMLElement;

        // Click row 1 drag handle
        const mousedownEvent = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
        rowDragBtns[1].dispatchEvent(mousedownEvent);

        assert.strictEqual(rowIndicator.style.display, 'block');
        assert.ok(rowIndicator.style.top.includes('px'));
        const indicatorTop = parseFloat(rowIndicator.style.top);
        const handleTop = parseFloat(rowDragBtns[1].style.top);
        // Indicator top should be at handle height (within handleTop to handleTop + 18px)
        assert.ok(
          indicatorTop >= handleTop && indicatorTop <= handleTop + 18,
          `Indicator top (${indicatorTop}) should be at handle height (handleTop: ${handleTop})`
        );

        const mouseupEvent = new dom.window.MouseEvent('mouseup', { bubbles: true });
        document.dispatchEvent(mouseupEvent);
      });

      it('encloses table in .table-scroll-wrapper to isolate horizontal scroll from the document', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        const scrollWrapper = wrapper.querySelector('.table-scroll-wrapper');
        assert.ok(scrollWrapper, 'Table should have .table-scroll-wrapper');
        const table = scrollWrapper?.querySelector('table.editor-table');
        assert.ok(table, 'Table should be inside .table-scroll-wrapper');
      });

      it('keeps row controls fixed in left gutter at negative coordinates', () => {
        const input = '| Col1 | Col2 |\n| --- | --- |\n| A | B |';
        const editor = setupEditor(input);
        const wrapper = editor.querySelector('.table-wrapper') as HTMLElement;
        updateTableControls(wrapper, () => {});

        repositionTableControls(wrapper);

        const rowDragBtn = wrapper.querySelector('.table-row-drag-btn') as HTMLElement;
        const rowDelBtn = wrapper.querySelector('.table-row-del-btn') as HTMLElement;
        const insertRowBtn = wrapper.querySelector('.row-insert-btn') as HTMLElement;

        assert.strictEqual(rowDragBtn.style.left, '-28px');
        assert.strictEqual(rowDelBtn.style.left, '-52px');
        assert.strictEqual(insertRowBtn.style.left, '-28px');
      });
    });
  });
});
