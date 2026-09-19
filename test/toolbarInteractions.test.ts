import assert from 'assert';
import { JSDOM } from 'jsdom';
import { domToMarkdown } from '../src/markdown/serializer';
import { safeMarkdownToHtml } from '../src/markdown/parser';
import {
  toggleListBlock,
  indentActiveListItem,
  outdentActiveListItem,
  insertBlockElement,
  applyHeading,
  applyRawFormatting,
} from '../src/webview/toolbarOperations';

describe('Toolbar Operations & Expanded Testing', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div><textarea id="raw"></textarea></body></html>');
    window = dom.window as unknown as Window;
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
    (globalThis as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    editor = document.getElementById('editor')!;
  });

  /** Helper: set up selection on a given element */
  function selectElement(el: Node, offset = 0) {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(el, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function highlightElement(el: Node, start = 0, end?: number) {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(el, start);
    range.setEnd(el, end ?? (el.textContent?.length || 1));
    sel.removeAllRanges();
    sel.addRange(range);
  }

  describe('Visual Canvas: List Toggling & Conversions', () => {
    it('converts a paragraph into a bullet list item when highlighted', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">First item</p>';
      const p = editor.querySelector('p')!;
      highlightElement(p.firstChild || p);

      toggleListBlock(editor, 'bullet');

      const ul = editor.querySelector('ul.bullet-list');
      assert.ok(ul, 'Should have created a ul.bullet-list');
      assert.strictEqual(editor.querySelectorAll('li').length, 1);
      assert.strictEqual(editor.querySelector('li')!.textContent?.trim(), 'First item');
      assert.strictEqual(domToMarkdown(editor).trim(), '- First item');
    });

    it('toggles off a bullet list item back to a paragraph', () => {
      editor.innerHTML = '<ul class="editor-block bullet-list" data-block-type="unordered_list"><li class="list-item">My item</li></ul>';
      const li = editor.querySelector('li')!;
      selectElement(li.firstChild || li);

      toggleListBlock(editor, 'bullet');

      assert.strictEqual(editor.querySelector('ul'), null, 'ul should be removed');
      const p = editor.querySelector('p');
      assert.ok(p, 'Should have converted to p');
      assert.strictEqual(p?.textContent?.trim(), 'My item');
      assert.strictEqual(domToMarkdown(editor).trim(), 'My item');
    });

    it('converts a paragraph into an ordered list item when highlighted', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Numbered item</p>';
      const p = editor.querySelector('p')!;
      highlightElement(p.firstChild || p);

      toggleListBlock(editor, 'ordered');

      const ol = editor.querySelector('ol.ordered-list');
      assert.ok(ol, 'Should have created an ol.ordered-list');
      assert.strictEqual(editor.querySelector('li')!.textContent?.trim(), 'Numbered item');
      assert.strictEqual(domToMarkdown(editor).trim(), '1. Numbered item');
    });

    it('toggles off an ordered list item back to a paragraph', () => {
      editor.innerHTML = '<ol class="editor-block ordered-list" data-block-type="ordered_list"><li class="list-item">Step 1</li></ol>';
      const li = editor.querySelector('li')!;
      selectElement(li.firstChild || li);

      toggleListBlock(editor, 'ordered');

      assert.strictEqual(editor.querySelector('ol'), null, 'ol should be removed');
      const p = editor.querySelector('p');
      assert.ok(p, 'Should have converted to p');
      assert.strictEqual(p?.textContent?.trim(), 'Step 1');
      assert.strictEqual(domToMarkdown(editor).trim(), 'Step 1');
    });

    it('converts a paragraph into a task list item when highlighted', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Todo task</p>';
      const p = editor.querySelector('p')!;
      highlightElement(p.firstChild || p);

      toggleListBlock(editor, 'task');

      const ul = editor.querySelector('ul.task-list');
      assert.ok(ul, 'Should have created a ul.task-list');
      const taskLi = editor.querySelector('li.task-item');
      assert.ok(taskLi, 'Should have created a li.task-item');
      assert.strictEqual(taskLi?.getAttribute('data-checked'), 'false');
      assert.strictEqual(taskLi?.querySelector('.task-content')?.textContent?.trim(), 'Todo task');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Todo task');
    });

    it('clicking task button multiple times toggles on and off without infinite nesting', () => {
      // User starts with a paragraph
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">My task</p>';
      const p = editor.querySelector('p')!;
      highlightElement(p.firstChild || p);

      // Click 1: turns into task item
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] My task');
      assert.strictEqual(editor.querySelectorAll('ul').length, 1);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 1);

      // Click 2 on the task item: TOGGLES OFF back to paragraph!
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), 'My task');
      assert.strictEqual(editor.querySelectorAll('ul').length, 0);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 0);

      // Click 3: highlight paragraph again and turn into task item!
      const p2 = editor.querySelector('p')!;
      highlightElement(p2.firstChild || p2);
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] My task');
      assert.strictEqual(editor.querySelectorAll('ul').length, 1);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 1);

      // Click 4: toggles back off!
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), 'My task');
      assert.strictEqual(editor.querySelectorAll('ul').length, 0);
    });

    it('converts between list types: bullet -> task -> ordered -> bullet', () => {
      editor.innerHTML = '<ul class="editor-block bullet-list"><li class="list-item">Shared item</li></ul>';
      const li = editor.querySelector('li')!;
      selectElement(li.firstChild || li);

      // Convert bullet -> task
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Shared item');
      assert.ok(editor.querySelector('li.task-item'));

      // Convert task -> ordered
      toggleListBlock(editor, 'ordered');
      assert.strictEqual(domToMarkdown(editor).trim(), '1. Shared item');
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 0);
      assert.ok(editor.querySelector('ol.ordered-list'));

      // Convert ordered -> bullet
      toggleListBlock(editor, 'bullet');
      assert.strictEqual(domToMarkdown(editor).trim(), '- Shared item');
      assert.ok(editor.querySelector('ul.bullet-list'));
    });
  });

  describe('Visual Canvas: List Indentation & Outdenting', () => {
    it('indents active list item under previous sibling', () => {
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item" id="item1">Parent</li>
          <li class="list-item" id="item2">Child</li>
        </ul>
      `;
      const item2 = document.getElementById('item2')!;
      selectElement(item2.firstChild || item2);

      const didIndent = indentActiveListItem(editor);
      assert.strictEqual(didIndent, true);

      const expected = '- Parent\n  - Child';
      assert.strictEqual(domToMarkdown(editor).trim(), expected);
    });

    it('outdents active nested list item to parent level', () => {
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item" id="item1">Parent
            <ul class="bullet-list">
              <li class="list-item" id="item2">Child</li>
            </ul>
          </li>
        </ul>
      `;
      const item2 = document.getElementById('item2')!;
      selectElement(item2.firstChild || item2);

      const didOutdent = outdentActiveListItem(editor);
      assert.strictEqual(didOutdent, true);

      const expected = '- Parent\n- Child';
      assert.strictEqual(domToMarkdown(editor).trim(), expected);
    });
  });

  describe('Serializer & Raw View Switching Robustness', () => {
    it('never loses lists wrapped inside <p> or <div>', () => {
      // Simulate dirty browser DOM where a list was inserted inside a paragraph or div
      editor.innerHTML = `
        <p class="editor-block">
          Some intro text
          <ul class="editor-block task-list">
            <li class="task-item"><input type="checkbox"><span class="task-content">Do laundry</span></li>
          </ul>
          Some trailing text
        </p>
      `;

      const md = domToMarkdown(editor).trim();
      assert.ok(md.includes('- [ ] Do laundry'), 'List inside p must not be lost');
      assert.ok(md.includes('Some intro text'), 'Intro text must be preserved');
      assert.ok(md.includes('Some trailing text'), 'Trailing text must be preserved');
    });

    it('serializes nested sublists wrapped in containers inside <li>', () => {
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item">
            Main point
            <div class="nested-wrapper">
              <ul class="bullet-list">
                <li class="list-item">Sub point A</li>
                <li class="list-item">Sub point B</li>
              </ul>
            </div>
          </li>
        </ul>
      `;

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- Main point\n  - Sub point A\n  - Sub point B');
    });

    it('roundtrips lists through parser and serializer without syntax degradation', () => {
      const originalMd = [
        '# My Document',
        '',
        '- [ ] Task item 1',
        '  - [x] Subtask done',
        '  - [ ] Subtask pending',
        '',
        '- Regular bullet',
        '  1. Ordered sub 1',
        '  2. Ordered sub 2',
      ].join('\n');

      const { html } = safeMarkdownToHtml(originalMd);
      editor.innerHTML = html;

      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, originalMd);
    });
  });

  describe('Visual Canvas: Block Inserts & Headings', () => {
    it('inserts a table replacing an empty paragraph', () => {
      editor.innerHTML = '<p class="editor-block"><br></p>';
      const p = editor.querySelector('p')!;
      selectElement(p);

      const tableHtml = `
        <div class="editor-block table-wrapper" data-block-type="table">
          <table class="editor-table">
            <thead><tr><th>A</th><th>B</th></tr></thead>
            <tbody><tr><td>1</td><td>2</td></tr></tbody>
          </table>
        </div>
      `;
      insertBlockElement(editor, tableHtml);

      assert.strictEqual(editor.querySelectorAll('table').length, 1);
      const md = domToMarkdown(editor).trim();
      assert.ok(md.includes('| A | B |'));
      assert.ok(md.includes('| 1 | 2 |'));
    });

    it('inserts a code block cleanly', () => {
      editor.innerHTML = '<p class="editor-block"><br></p>';
      const p = editor.querySelector('p')!;
      selectElement(p);

      const codeHtml = `
        <div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="javascript">
          <pre><code class="editor-code">console.log("hello");</code></pre>
        </div>
      `;
      insertBlockElement(editor, codeHtml);

      assert.strictEqual(editor.querySelectorAll('pre code').length, 1);
      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '```javascript\nconsole.log("hello");\n```');
    });

    it('applies headings h1, h2, h3 and reverts to paragraph', () => {
      editor.innerHTML = '<p class="editor-block">Heading text</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild || p);

      applyHeading(editor, 'h1');
      assert.strictEqual(domToMarkdown(editor).trim(), '# Heading text');

      applyHeading(editor, 'h2');
      assert.strictEqual(domToMarkdown(editor).trim(), '## Heading text');

      applyHeading(editor, 'h3');
      assert.strictEqual(domToMarkdown(editor).trim(), '### Heading text');

      applyHeading(editor, 'p');
      assert.strictEqual(domToMarkdown(editor).trim(), 'Heading text');
    });
  });

  describe('Raw Textarea: Formatting Toolbar Operations', () => {
    let textarea: HTMLTextAreaElement;

    beforeEach(() => {
      textarea = document.getElementById('raw') as HTMLTextAreaElement;
    });

    it('wraps selected text with bold markers and toggles off', () => {
      textarea.value = 'Hello world!';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11; // "world"

      applyRawFormatting(textarea, 'bold');
      assert.strictEqual(textarea.value, 'Hello **world**!');

      // Toggle off
      textarea.selectionStart = 6;
      textarea.selectionEnd = 15; // "**world**"
      applyRawFormatting(textarea, 'bold');
      assert.strictEqual(textarea.value, 'Hello world!');
    });

    it('wraps selected text with italic markers', () => {
      textarea.value = 'Hello world!';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11;

      applyRawFormatting(textarea, 'italic');
      assert.strictEqual(textarea.value, 'Hello *world*!');
    });

    it('wraps selected text with strikethrough markers', () => {
      textarea.value = 'Hello world!';
      textarea.selectionStart = 6;
      textarea.selectionEnd = 11;

      applyRawFormatting(textarea, 'strike');
      assert.strictEqual(textarea.value, 'Hello ~~world~~!');
    });

    it('prefixes lines with bullet list markers and toggles off', () => {
      textarea.value = 'Line 1\nLine 2';
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;

      applyRawFormatting(textarea, 'bullet');
      assert.strictEqual(textarea.value, '- Line 1\n- Line 2');

      // Toggle off
      applyRawFormatting(textarea, 'bullet');
      assert.strictEqual(textarea.value, 'Line 1\nLine 2');
    });

    it('prefixes lines with ordered list markers', () => {
      textarea.value = 'First\nSecond';
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;

      applyRawFormatting(textarea, 'ordered');
      assert.strictEqual(textarea.value, '1. First\n2. Second');
    });

    it('prefixes lines with task list markers and toggles off', () => {
      textarea.value = 'Milk\nBread';
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;

      applyRawFormatting(textarea, 'task');
      assert.strictEqual(textarea.value, '- [ ] Milk\n- [ ] Bread');

      // Toggle off
      applyRawFormatting(textarea, 'task');
      assert.strictEqual(textarea.value, 'Milk\nBread');
    });

    it('indents and outdents raw list lines', () => {
      textarea.value = '- Item 1\n- Item 2';
      // Cursor on line 2
      textarea.selectionStart = 9;
      textarea.selectionEnd = 9;

      applyRawFormatting(textarea, 'indent');
      assert.strictEqual(textarea.value, '- Item 1\n  - Item 2');

      applyRawFormatting(textarea, 'outdent');
      assert.strictEqual(textarea.value, '- Item 1\n- Item 2');
    });

    it('applies headings in raw mode', () => {
      textarea.value = 'My Title';
      textarea.selectionStart = 2;
      textarea.selectionEnd = 2;

      applyRawFormatting(textarea, 'heading', 'h1');
      assert.strictEqual(textarea.value, '# My Title');

      applyRawFormatting(textarea, 'heading', 'h2');
      assert.strictEqual(textarea.value, '## My Title');

      applyRawFormatting(textarea, 'heading', 'p');
      assert.strictEqual(textarea.value, 'My Title');
    });

    it('inserts markdown table template in raw mode', () => {
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      applyRawFormatting(textarea, 'table');
      assert.ok(textarea.value.includes('| Spalte 1 | Spalte 2 | Spalte 3 |'));
    });

    it('inserts horizontal rule in raw mode', () => {
      textarea.value = 'Above';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      applyRawFormatting(textarea, 'hr');
      assert.ok(textarea.value.includes('---'));
    });
  });

  describe('Text-Based Block Tools: Start List & Heading Behaviors', () => {
    it('starts a new list when clicking bullet list at the end of a non-empty paragraph', () => {
      editor.innerHTML = `
        <div class="editor-block-container text-block" data-block-type="paragraph">
          <p class="editor-block" data-block-type="paragraph">Here are my notes:</p>
        </div>
      `;
      const p = editor.querySelector('p')!;
      // Set cursor at the END of "Here are my notes:"
      selectElement(p.firstChild!, p.firstChild!.textContent!.length);

      toggleListBlock(editor, 'bullet');

      // Paragraph must remain untouched!
      assert.strictEqual(editor.querySelectorAll('p').length, 1);
      assert.strictEqual(editor.querySelector('p')!.textContent?.trim(), 'Here are my notes:');

      // A new list container must be created below it
      const ul = editor.querySelector('ul.bullet-list');
      assert.ok(ul, 'Should have created a ul.bullet-list below the paragraph');
      assert.strictEqual(editor.querySelectorAll('li').length, 1);

      // Markdown serialization should show both the paragraph and the list
      const md = domToMarkdown(editor).trim();
      assert.ok(md.startsWith('Here are my notes:'), 'Paragraph should come first');
      assert.ok(editor.querySelector('ul.bullet-list'), 'List should exist');
    });

    it('starts a new list below a heading without converting or destroying the heading', () => {
      editor.innerHTML = `
        <div class="editor-block-container text-block" data-block-type="heading">
          <h2 class="editor-block" data-block-type="heading" data-level="2">Meeting Agenda</h2>
        </div>
      `;
      const h2 = editor.querySelector('h2')!;
      selectElement(h2.firstChild!, h2.firstChild!.textContent!.length);

      toggleListBlock(editor, 'bullet');

      // Heading must remain intact!
      assert.strictEqual(editor.querySelectorAll('h2').length, 1);
      assert.strictEqual(editor.querySelector('h2')!.textContent?.trim(), 'Meeting Agenda');

      // List should exist after heading
      const ul = editor.querySelector('ul.bullet-list');
      assert.ok(ul, 'Should have created a list below heading');
      assert.strictEqual(editor.querySelectorAll('li').length, 1);

      const md = domToMarkdown(editor).trim();
      assert.ok(md.includes('## Meeting Agenda'));
    });

    it('replaces an empty paragraph with a new list item when clicking list', () => {
      editor.innerHTML = `
        <div class="editor-block-container text-block" data-block-type="paragraph">
          <p class="editor-block" data-block-type="paragraph"><br></p>
        </div>
      `;
      const p = editor.querySelector('p')!;
      selectElement(p, 0);

      toggleListBlock(editor, 'bullet');

      // Empty paragraph should be replaced by list
      assert.strictEqual(editor.querySelectorAll('p').length, 0);
      assert.ok(editor.querySelector('ul.bullet-list'));
      assert.strictEqual(editor.querySelectorAll('li').length, 1);
    });

    it('splits paragraph and starts list with tail text when cursor is in middle of line', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Intro: items to buy</p>';
      const p = editor.querySelector('p')!;
      // Set cursor in middle: after "Intro: " (offset 7)
      selectElement(p.firstChild!, 7);

      toggleListBlock(editor, 'bullet');

      // Paragraph should contain text before cursor
      assert.strictEqual(editor.querySelectorAll('p').length, 1);
      assert.strictEqual(editor.querySelector('p')!.textContent?.trim(), 'Intro:');

      // List should exist after paragraph containing the tail text
      const ul = editor.querySelector('ul.bullet-list');
      assert.ok(ul);
      assert.strictEqual(editor.querySelectorAll('li').length, 1);
      assert.strictEqual(editor.querySelector('li')!.textContent?.trim(), 'items to buy');

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, 'Intro:\n\n- items to buy');
    });

    it('splits list item and starts new list item with tail text when cursor is in middle of list item', () => {
      editor.innerHTML = '<ul class="editor-block bullet-list"><li class="list-item">First and Second</li></ul>';
      const li = editor.querySelector('li')!;
      // Set cursor between "First " and "and Second" (offset 6)
      selectElement(li.firstChild!, 6);

      toggleListBlock(editor, 'bullet');

      const items = editor.querySelectorAll('li');
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].textContent?.trim(), 'First');
      assert.strictEqual(items[1].textContent?.trim(), 'and Second');

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- First\n- and Second');
    });

    it('starts an empty list item below when cursor is at end of list item', () => {
      editor.innerHTML = '<ul class="editor-block bullet-list"><li class="list-item">Existing item</li></ul>';
      const li = editor.querySelector('li')!;
      selectElement(li.firstChild!, li.firstChild!.textContent!.length);

      toggleListBlock(editor, 'bullet');

      const items = editor.querySelectorAll('li');
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].textContent?.trim(), 'Existing item');
      assert.strictEqual(items[1].textContent?.trim(), '');

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- Existing item\n-');
    });

    it('toggles list item back to paragraph when cursor is at beginning of list item', () => {
      editor.innerHTML = '<ul class="editor-block bullet-list"><li class="list-item">Toggle me</li></ul>';
      const li = editor.querySelector('li')!;
      selectElement(li.firstChild!, 0);

      toggleListBlock(editor, 'bullet');

      assert.strictEqual(editor.querySelectorAll('ul').length, 0);
      const p = editor.querySelector('p');
      assert.ok(p);
      assert.strictEqual(p?.textContent?.trim(), 'Toggle me');
      assert.strictEqual(domToMarkdown(editor).trim(), 'Toggle me');
    });

    it('converts paragraph to list item when part of paragraph is highlighted', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Intro: items to buy</p>';
      const p = editor.querySelector('p')!;
      // Highlight "items to buy"
      highlightElement(p.firstChild!, 7, p.firstChild!.textContent!.length);

      toggleListBlock(editor, 'bullet');

      const li = editor.querySelector('li');
      assert.ok(li);
      assert.strictEqual(li?.textContent?.trim(), 'Intro: items to buy');
      assert.strictEqual(domToMarkdown(editor).trim(), '- Intro: items to buy');
    });

    it('converts multiple selected lines into individual list items', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Apple\nBanana\nCherry</p>';
      const p = editor.querySelector('p')!;
      // Select the full text
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(p);
      sel.removeAllRanges();
      sel.addRange(range);

      toggleListBlock(editor, 'bullet');

      const lis = editor.querySelectorAll('li');
      assert.strictEqual(lis.length, 3);
      assert.strictEqual(lis[0].textContent?.trim(), 'Apple');
      assert.strictEqual(lis[1].textContent?.trim(), 'Banana');
      assert.strictEqual(lis[2].textContent?.trim(), 'Cherry');
    });

    it('applies headings directly without nesting paragraph tags and converts back', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Document Title</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild!, 0);

      applyHeading(editor, 'h1');

      const h1 = editor.querySelector('h1');
      assert.ok(h1, 'h1 should exist');
      assert.strictEqual(h1?.textContent?.trim(), 'Document Title');
      assert.strictEqual(h1?.querySelector('p'), null, 'p should NOT be nested inside h1');
      assert.strictEqual(editor.querySelectorAll('.editor-block-container').length, 0);

      // Now convert back to paragraph
      applyHeading(editor, 'p');

      const newP = editor.querySelector('p');
      assert.ok(newP, 'p should exist');
      assert.strictEqual(newP?.textContent?.trim(), 'Document Title');
      assert.strictEqual(editor.querySelector('h1'), null, 'h1 should be replaced');
      assert.strictEqual(editor.querySelectorAll('.editor-block-container').length, 0);
    });
  });
});
