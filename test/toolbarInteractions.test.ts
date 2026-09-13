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

  describe('Visual Canvas: List Toggling & Conversions', () => {
    it('converts a paragraph into a bullet list item', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">First item</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild || p);

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

    it('converts a paragraph into an ordered list item', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Numbered item</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild || p);

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

    it('converts a paragraph into a task list item', () => {
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Clean the house</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild || p);

      toggleListBlock(editor, 'task');

      const ul = editor.querySelector('ul.task-list');
      assert.ok(ul, 'Should have created a ul.task-list');
      const li = editor.querySelector('li.task-item');
      assert.ok(li, 'Should have created a li.task-item');
      const cb = li?.querySelector('input[type="checkbox"]');
      assert.ok(cb, 'Should have a checkbox input');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Clean the house');
    });

    it('clicking task button multiple times toggles on and off without infinite nesting', () => {
      // User starts with a paragraph
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">My task</p>';
      const p = editor.querySelector('p')!;
      selectElement(p.firstChild || p);

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

      // Click 3: toggles back to task item!
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] My task');
      assert.strictEqual(editor.querySelectorAll('ul').length, 1);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 1);

      // Click 4: toggles back off!
      toggleListBlock(editor, 'task');
      assert.strictEqual(domToMarkdown(editor).trim(), 'My task');
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
});
