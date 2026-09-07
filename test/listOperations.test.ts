import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  indentListItem,
  outdentListItem,
  indentRawText,
  outdentRawText,
  isAtLineStartOrMarker,
  isCursorAtStartOfListItem,
} from '../src/markdown/listOperations';

describe('List Operations (Visual DOM & Raw Textarea)', () => {
  describe('Line Start and Marker Detection (isAtLineStartOrMarker)', () => {
    it('detects start of line and list markers', () => {
      assert.strictEqual(isAtLineStartOrMarker(''), true);
      assert.strictEqual(isAtLineStartOrMarker('   '), true);
      assert.strictEqual(isAtLineStartOrMarker('- '), true);
      assert.strictEqual(isAtLineStartOrMarker('  * '), true);
      assert.strictEqual(isAtLineStartOrMarker('- [ ] '), true);
      assert.strictEqual(isAtLineStartOrMarker('- [x] '), true);
      assert.strictEqual(isAtLineStartOrMarker('1. '), true);
      assert.strictEqual(isAtLineStartOrMarker('  2. '), true);
    });

    it('returns false when cursor is in the middle or end of text', () => {
      assert.strictEqual(isAtLineStartOrMarker('Hello'), false);
      assert.strictEqual(isAtLineStartOrMarker('- Hello'), false);
      assert.strictEqual(isAtLineStartOrMarker('1. First item'), false);
      assert.strictEqual(isAtLineStartOrMarker('- [ ] My task'), false);
    });
  });

  describe('Raw Textarea Indentation (indentRawText & outdentRawText)', () => {
    it('indents list line with 2 spaces when cursor is at line start', () => {
      const input = '- Item 1\n- Item 2';
      // Cursor at start of line 2 (offset 9)
      const res = indentRawText(input, 9, 9);
      assert.strictEqual(res.value, '- Item 1\n  - Item 2');
      assert.strictEqual(res.selectionStart, 11);
      assert.strictEqual(res.selectionEnd, 11);
    });

    it('indents list line with 2 spaces when cursor is right after list marker', () => {
      const input = '- Item 1\n- Item 2';
      // Cursor right after "- " on line 2 (offset 11)
      const res = indentRawText(input, 11, 11);
      assert.strictEqual(res.value, '- Item 1\n  - Item 2');
      assert.strictEqual(res.selectionStart, 13);
      assert.strictEqual(res.selectionEnd, 13);
    });

    it('inserts 2 spaces in the middle of a line instead of indenting the whole line', () => {
      const input = '- Item 1\n- Item 2';
      // Cursor between "Item" and " 2" on line 2 (offset 15)
      const res = indentRawText(input, 15, 15);
      assert.strictEqual(res.value, '- Item 1\n- Item   2');
      assert.strictEqual(res.selectionStart, 17);
    });

    it('inserts 2 spaces at the end of a line instead of indenting the whole line', () => {
      const input = '- Item 1\n- Item 2';
      // Cursor at the end of line 2 (offset 17)
      const res = indentRawText(input, 17, 17);
      assert.strictEqual(res.value, '- Item 1\n- Item 2  ');
      assert.strictEqual(res.selectionStart, 19);
    });

    it('outdents list line with 2 spaces on Shift+Tab', () => {
      const input = '- Item 1\n  - Item 2';
      // Cursor inside line 2
      const res = outdentRawText(input, 11, 11);
      assert.strictEqual(res.value, '- Item 1\n- Item 2');
      assert.strictEqual(res.selectionStart, 9);
      assert.strictEqual(res.selectionEnd, 9);
    });

    it('indents multiple selected lines by 2 spaces', () => {
      const input = '- A\n- B\n- C';
      // Select from start of B to middle of C
      const res = indentRawText(input, 4, 10);
      assert.strictEqual(res.value, '- A\n  - B\n  - C');
    });

    it('outdents multiple selected lines by up to 2 spaces', () => {
      const input = '- A\n  - B\n  - C';
      const res = outdentRawText(input, 4, 14);
      assert.strictEqual(res.value, '- A\n- B\n- C');
    });

    it('inserts 2 spaces when cursor is inside normal paragraph text without selection', () => {
      const input = 'Helloworld';
      // Cursor between "Hello" and "world" (offset 5)
      const res = indentRawText(input, 5, 5);
      assert.strictEqual(res.value, 'Hello  world');
      assert.strictEqual(res.selectionStart, 7);
    });
  });

  describe('DOM List Item Operations (indentListItem & outdentListItem)', () => {
    let dom: JSDOM;
    let document: Document;

    beforeEach(() => {
      dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
      document = dom.window.document;
      (globalThis as any).Node = dom.window.Node;
      (globalThis as any).HTMLElement = dom.window.HTMLElement;
    });

    it('detects if cursor is at the beginning of a list item (isCursorAtStartOfListItem)', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="bullet-list">
          <li class="list-item" id="item">Hello world</li>
        </ul>
      `;
      const li = document.getElementById('item')!;
      const textNode = li.firstChild!;

      const window = dom.window;
      const sel = window.getSelection()!;

      // Position cursor at start of textNode (offset 0)
      const rangeStart = document.createRange();
      rangeStart.setStart(textNode, 0);
      rangeStart.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rangeStart);

      assert.strictEqual(isCursorAtStartOfListItem(li, sel), true);

      // Position cursor at offset 5 (middle of "Hello")
      const rangeMiddle = document.createRange();
      rangeMiddle.setStart(textNode, 5);
      rangeMiddle.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rangeMiddle);

      assert.strictEqual(isCursorAtStartOfListItem(li, sel), false);

      // Position cursor at end of textNode
      const rangeEnd = document.createRange();
      rangeEnd.setStart(textNode, textNode.textContent!.length);
      rangeEnd.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rangeEnd);

      assert.strictEqual(isCursorAtStartOfListItem(li, sel), false);
    });

    it('indents an unordered list item to become a sublist of the previous sibling', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="editor-block bullet-list" data-block-type="unordered_list">
          <li class="list-item" id="item1">Parent</li>
          <li class="list-item" id="item2">Child</li>
        </ul>
      `;

      const item2 = document.getElementById('item2')!;
      const didIndent = indentListItem(item2);

      assert.strictEqual(didIndent, true);
      const item1 = document.getElementById('item1')!;
      const subList = item1.querySelector('ul.bullet-list');
      assert.ok(subList, 'item1 should now contain a sublist');
      assert.strictEqual(subList?.children[0], item2);
    });

    it('indents an ordered list item and creates a nested ol', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ol class="editor-block ordered-list" data-block-type="ordered_list">
          <li class="list-item" id="step1">Step 1</li>
          <li class="list-item" id="step2">Step 2</li>
        </ol>
      `;

      const step2 = document.getElementById('step2')!;
      const didIndent = indentListItem(step2);

      assert.strictEqual(didIndent, true);
      const step1 = document.getElementById('step1')!;
      const subList = step1.querySelector('ol.ordered-list');
      assert.ok(subList, 'step1 should now contain an ordered sublist');
      assert.strictEqual(subList?.children[0], step2);
    });

    it('indents a task item and creates a nested task-list', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="editor-block task-list" data-block-type="task_list">
          <li class="task-item" id="task1"><input type="checkbox"><span class="task-content">Task 1</span></li>
          <li class="task-item" id="task2"><input type="checkbox"><span class="task-content">Task 2</span></li>
        </ul>
      `;

      const task2 = document.getElementById('task2')!;
      const didIndent = indentListItem(task2);

      assert.strictEqual(didIndent, true);
      const task1 = document.getElementById('task1')!;
      const subList = task1.querySelector('ul.task-list');
      assert.ok(subList, 'task1 should now contain a nested task-list');
      assert.strictEqual(subList?.children[0], task2);
    });

    it('returns false when trying to indent the first item in a list', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item" id="first">First item</li>
        </ul>
      `;

      const first = document.getElementById('first')!;
      const didIndent = indentListItem(first);
      assert.strictEqual(didIndent, false);
    });

    it('outdents a nested list item to become next sibling of parent item', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item" id="parent">Parent
            <ul class="bullet-list" id="sublist">
              <li class="list-item" id="child">Child</li>
            </ul>
          </li>
        </ul>
      `;

      const child = document.getElementById('child')!;
      const didOutdent = outdentListItem(child);

      assert.strictEqual(didOutdent, true);
      const parent = document.getElementById('parent')!;
      assert.strictEqual(parent.nextElementSibling, child);
      assert.strictEqual(document.getElementById('sublist'), null, 'empty sublist should be removed');
    });

    it('returns false when trying to outdent a root level list item', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = `
        <ul class="editor-block bullet-list">
          <li class="list-item" id="root">Root item</li>
        </ul>
      `;

      const root = document.getElementById('root')!;
      const didOutdent = outdentListItem(root);
      assert.strictEqual(didOutdent, false);
    });
  });
});
