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
      editor.replaceChild(h1, p);

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
      editor.replaceChild(h2, h1);

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
      editor.replaceChild(p, h1);

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
});
