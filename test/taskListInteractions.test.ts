import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state } from '../src/webview/editorState';
import { setContentFormatted, wireTaskCheckboxes } from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';
import {
  moveTaskItem,
  sendCheckedToTop,
  wireTaskListControls,
  wireAllTaskListControls,
  hasUncheckedChildren,
} from '../src/webview/taskListInteractions';

describe('Task List Interactions', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <select id="select-heading"><option value="p">Normal</option></select>
    <button id="btn-toggle-raw">Raw</button>
    <button id="btn-cowork">Cowork</button>
  </div>
  <div id="error-banner" style="display: none;"><span id="error-banner-text"></span></div>
  <div id="editor" contenteditable="true"></div>
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

    editor = document.getElementById('editor')!;
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;
  });

  // ──────────────────────────────────────────────
  // Serialization: controls must NOT leak into markdown
  // ──────────────────────────────────────────────

  describe('Serialization Safety', () => {
    it('task-list-controls div does not appear in serialized markdown', () => {
      setContentFormatted('- [ ] Buy milk\n- [x] Clean house');

      // Manually inject a controls div to simulate what wireTaskListControls does
      const taskList = editor.querySelector('ul.task-list')!;
      const controls = document.createElement('div');
      controls.className = 'task-list-controls';
      controls.innerHTML = '<div class="task-item-drag-btn"></div><button class="task-item-del-btn"></button>';
      taskList.insertBefore(controls, taskList.firstChild);

      const md = domToMarkdown(editor).trim();
      assert.ok(!md.includes('task-list-controls'), 'Controls div should not appear in markdown');
      assert.ok(!md.includes('task-item-drag-btn'), 'Drag button should not appear in markdown');
      assert.strictEqual(md, '- [ ] Buy milk\n- [x] Clean house');
    });

    it('serializes correctly after checkbox change with controls present', () => {
      setContentFormatted('- [ ] First\n- [ ] Second\n- [x] Third');

      // Simulate checking the first item
      const checkboxes = editor.querySelectorAll<HTMLInputElement>('.task-checkbox');
      assert.strictEqual(checkboxes.length, 3);
      checkboxes[0].checked = true;
      checkboxes[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] First\n- [ ] Second\n- [x] Third');
    });
  });

  // ──────────────────────────────────────────────
  // moveTaskItem: reorder within list
  // ──────────────────────────────────────────────

  describe('moveTaskItem', () => {
    it('moves item from index 0 to index 2', () => {
      setContentFormatted('- [ ] Alpha\n- [ ] Beta\n- [ ] Charlie');

      const taskList = editor.querySelector('ul.task-list')!;
      moveTaskItem(taskList as HTMLElement, 0, 2);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Beta\n- [ ] Charlie\n- [ ] Alpha');
    });

    it('moves item from index 2 to index 0', () => {
      setContentFormatted('- [ ] Alpha\n- [ ] Beta\n- [ ] Charlie');

      const taskList = editor.querySelector('ul.task-list')!;
      moveTaskItem(taskList as HTMLElement, 2, 0);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Charlie\n- [ ] Alpha\n- [ ] Beta');
    });

    it('no-op when from and to indices are the same', () => {
      setContentFormatted('- [ ] Alpha\n- [ ] Beta');

      const taskList = editor.querySelector('ul.task-list')!;
      moveTaskItem(taskList as HTMLElement, 0, 0);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Alpha\n- [ ] Beta');
    });

    it('handles out-of-bounds indices gracefully', () => {
      setContentFormatted('- [ ] Alpha\n- [ ] Beta');

      const taskList = editor.querySelector('ul.task-list')!;
      moveTaskItem(taskList as HTMLElement, -1, 5);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Alpha\n- [ ] Beta');
    });

    it('preserves checked state when moving items', () => {
      setContentFormatted('- [x] Done\n- [ ] Pending\n- [ ] Later');

      const taskList = editor.querySelector('ul.task-list')!;
      moveTaskItem(taskList as HTMLElement, 0, 2);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Pending\n- [ ] Later\n- [x] Done');
    });
  });

  // ──────────────────────────────────────────────
  // sendCheckedToTop
  // ──────────────────────────────────────────────

  describe('sendCheckedToTop', () => {
    it('moves all checked items before unchecked items', () => {
      setContentFormatted('- [ ] Alpha\n- [x] Beta\n- [ ] Charlie\n- [x] Delta');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Beta\n- [x] Delta\n- [ ] Alpha\n- [ ] Charlie');
    });

    it('preserves relative order of checked items', () => {
      setContentFormatted('- [ ] First\n- [x] Second\n- [ ] Third\n- [x] Fourth\n- [x] Fifth');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Second\n- [x] Fourth\n- [x] Fifth\n- [ ] First\n- [ ] Third');
    });

    it('no-op when no items are checked', () => {
      setContentFormatted('- [ ] Alpha\n- [ ] Beta\n- [ ] Charlie');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Alpha\n- [ ] Beta\n- [ ] Charlie');
    });

    it('no-op when all items are already checked at the top', () => {
      setContentFormatted('- [x] Alpha\n- [x] Beta\n- [ ] Charlie');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Alpha\n- [x] Beta\n- [ ] Charlie');
    });

    it('handles single item list', () => {
      setContentFormatted('- [x] Only item');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Only item');
    });

    it('handles all items checked', () => {
      setContentFormatted('- [x] Alpha\n- [x] Beta\n- [x] Charlie');

      const taskList = editor.querySelector('ul.task-list')!;
      sendCheckedToTop(taskList as HTMLElement);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Alpha\n- [x] Beta\n- [x] Charlie');
    });
  });

  // ──────────────────────────────────────────────
  // Checkbox rendering & existing bug fixes
  // ──────────────────────────────────────────────

  describe('Checkbox Rendering', () => {
    it('renders checked and unchecked items correctly', () => {
      setContentFormatted('- [ ] Unchecked\n- [x] Checked');

      const items = editor.querySelectorAll('li');
      assert.strictEqual(items.length, 2);

      assert.strictEqual(items[0].classList.contains('is-checked'), false);
      assert.strictEqual(items[0].getAttribute('data-checked'), 'false');

      assert.strictEqual(items[1].classList.contains('is-checked'), true);
      assert.strictEqual(items[1].getAttribute('data-checked'), 'true');
    });

    it('task items have proper structure (checkbox + content span)', () => {
      setContentFormatted('- [ ] My task');

      const li = editor.querySelector('li.task-item')!;
      assert.ok(li, 'Should have a li.task-item');

      const checkbox = li.querySelector('input[type="checkbox"]');
      assert.ok(checkbox, 'Should have a checkbox input');

      const content = li.querySelector('.task-content');
      assert.ok(content, 'Should have a .task-content span');
      assert.strictEqual(content!.textContent?.trim(), 'My task');
    });

    it('round-trips empty task list correctly', () => {
      const md = '- [ ] ';
      setContentFormatted(md);

      const result = domToMarkdown(editor).trim();
      assert.ok(result.startsWith('- [ ]'), `Expected task list prefix, got: "${result}"`);
    });

    it('handles mixed list types without cross-contamination', () => {
      const md = '- Bullet item\n\n- [ ] Task item\n\n1. Ordered item';
      setContentFormatted(md);

      const bulletLists = editor.querySelectorAll('ul.bullet-list');
      const taskLists = editor.querySelectorAll('ul.task-list');
      const orderedLists = editor.querySelectorAll('ol.ordered-list');

      assert.strictEqual(bulletLists.length, 1, 'Should have exactly 1 bullet list');
      assert.strictEqual(taskLists.length, 1, 'Should have exactly 1 task list');
      assert.strictEqual(orderedLists.length, 1, 'Should have exactly 1 ordered list');
    });

    it('unchecking via DOM correctly updates serialization', () => {
      setContentFormatted('- [x] Done task');

      const cb = editor.querySelector<HTMLInputElement>('.task-checkbox')!;
      const li = cb.closest('li')!;

      cb.checked = false;
      cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

      assert.strictEqual(li.classList.contains('is-checked'), false);
      assert.strictEqual(li.getAttribute('data-checked'), 'false');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [ ] Done task');
    });

    it('checking via DOM correctly updates serialization', () => {
      setContentFormatted('- [ ] Todo task');

      const cb = editor.querySelector<HTMLInputElement>('.task-checkbox')!;
      const li = cb.closest('li')!;

      cb.checked = true;
      cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

      assert.strictEqual(li.classList.contains('is-checked'), true);
      assert.strictEqual(li.getAttribute('data-checked'), 'true');
      assert.strictEqual(domToMarkdown(editor).trim(), '- [x] Todo task');
    });
  });

  // ──────────────────────────────────────────────
  // Delete checked item
  // ──────────────────────────────────────────────

  describe('Delete Checked Item', () => {
    it('removing a checked li updates the markdown correctly', () => {
      setContentFormatted('- [ ] Alpha\n- [x] Beta\n- [ ] Charlie');

      const items = editor.querySelectorAll<HTMLElement>('li.task-item');
      assert.strictEqual(items.length, 3);

      // Simulate deleting the checked item (Beta)
      items[1].remove();

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [ ] Alpha\n- [ ] Charlie');
    });

    it('removing last item replaces list with empty paragraph', () => {
      setContentFormatted('- [x] Only item');

      const items = editor.querySelectorAll<HTMLElement>('li.task-item');
      assert.strictEqual(items.length, 1);

      const taskList = editor.querySelector('ul.task-list')!;
      const p = document.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.innerHTML = '<br>';
      taskList.replaceWith(p);

      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '');
    });
  });

  // ──────────────────────────────────────────────
  // Nested task list roundtrip
  // ──────────────────────────────────────────────

  describe('Nested Task Lists', () => {
    it('preserves nested task items through roundtrip', () => {
      const md = '- [ ] Parent\n  - [ ] Child 1\n  - [x] Child 2';
      setContentFormatted(md);

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(result, md);
    });

    it('preserves deeply nested task items', () => {
      const md = '- [ ] Level 1\n  - [ ] Level 2\n    - [x] Level 3';
      setContentFormatted(md);

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(result, md);
    });

    it('allows reordering items within a nested task list', () => {
      setContentFormatted('- [ ] Parent 1\n  - [ ] Child A\n  - [ ] Child B\n- [ ] Parent 2');

      const parentItem = editor.querySelector('li.task-item')!;
      const nestedList = parentItem.querySelector('ul.task-list')!;
      assert.ok(nestedList, 'Nested list should exist');

      moveTaskItem(nestedList as HTMLElement, 0, 1);

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(
        result,
        '- [ ] Parent 1\n  - [ ] Child B\n  - [ ] Child A\n- [ ] Parent 2'
      );
    });

    it('moving a parent item keeps all its nested children attached', () => {
      setContentFormatted('- [ ] Parent 1\n  - [ ] Child A\n  - [ ] Child B\n- [ ] Parent 2');

      const rootList = editor.querySelector('ul.task-list')!;
      moveTaskItem(rootList as HTMLElement, 0, 1);

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(
        result,
        '- [ ] Parent 2\n- [ ] Parent 1\n  - [ ] Child A\n  - [ ] Child B'
      );
    });

    it('moves checked item to top within nested task list', () => {
      setContentFormatted('- [ ] Parent 1\n  - [ ] Child A\n  - [x] Child B\n- [ ] Parent 2');

      const parentItem = editor.querySelector('li.task-item')!;
      const nestedList = parentItem.querySelector('ul.task-list')!;

      sendCheckedToTop(nestedList as HTMLElement);

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(
        result,
        '- [ ] Parent 1\n  - [x] Child B\n  - [ ] Child A\n- [ ] Parent 2'
      );
    });

    it('deleting a child item updates the list cleanly', () => {
      setContentFormatted('- [ ] Parent 1\n  - [ ] Child A\n  - [x] Child B\n- [ ] Parent 2');

      const parentItem = editor.querySelector('li.task-item')!;
      const nestedList = parentItem.querySelector('ul.task-list')!;
      const childB = nestedList.querySelectorAll('li.task-item')[1];
      childB.remove();

      const result = domToMarkdown(editor).trim();
      assert.strictEqual(
        result,
        '- [ ] Parent 1\n  - [ ] Child A\n- [ ] Parent 2'
      );
    });
  });

  // ──────────────────────────────────────────────
  // Controls and Icons
  // ──────────────────────────────────────────────

  describe('Controls and Icons', () => {
    it('uses X icon matching quote deletion button for delete button', () => {
      setContentFormatted('- [x] Done item');
      const taskList = editor.querySelector('ul.task-list')!;
      wireTaskListControls(taskList as HTMLElement, () => {}, () => {});

      const delBtn = taskList.querySelector('.task-item-del-btn')!;
      assert.ok(delBtn, 'Delete button should exist');
      const svg = delBtn.querySelector('svg')!;
      assert.ok(svg, 'Delete button should have SVG icon');
      const lines = svg.querySelectorAll('line');
      assert.strictEqual(lines.length, 2, 'Should have 2 lines making an X');
      assert.strictEqual(lines[0].getAttribute('x1'), '3');
      assert.strictEqual(lines[0].getAttribute('y1'), '3');
      assert.strictEqual(lines[0].getAttribute('x2'), '11');
      assert.strictEqual(lines[0].getAttribute('y2'), '11');
      assert.strictEqual(lines[1].getAttribute('x1'), '11');
      assert.strictEqual(lines[1].getAttribute('y1'), '3');
      assert.strictEqual(lines[1].getAttribute('x2'), '3');
      assert.strictEqual(lines[1].getAttribute('y2'), '11');
    });

    it('positions up button on left side (negative offset in front of drag handle)', () => {
      setContentFormatted('- [ ] Todo\n- [x] Done');
      const taskList = editor.querySelector('ul.task-list')!;
      wireTaskListControls(taskList as HTMLElement, () => {}, () => {});

      const topBtns = taskList.querySelectorAll<HTMLElement>('.task-item-top-btn');
      assert.strictEqual(topBtns.length, 2);
      const topBtnLeft = parseInt(topBtns[1].style.left, 10);
      assert.ok(topBtnLeft <= -40, `Up button should be on the left side, got ${topBtns[1].style.left}`);
    });

    it('wires controls on both root and nested task lists', () => {
      setContentFormatted('- [ ] Parent\n  - [ ] Child 1\n  - [ ] Child 2');
      wireAllTaskListControls(editor, () => {}, () => {});

      const allTaskLists = editor.querySelectorAll('ul.task-list');
      assert.strictEqual(allTaskLists.length, 2, 'Should have 2 task lists (root and nested)');

      allTaskLists.forEach((tl, idx) => {
        const controls = tl.querySelector(':scope > .task-list-controls');
        assert.ok(controls, `Task list at index ${idx} should have controls wired`);
      });
    });

    it('identifies items with unchecked children correctly', () => {
      setContentFormatted('- [x] Parent\n  - [ ] Child 1\n  - [x] Child 2');
      const parentLi = editor.querySelector('li.task-item')!;
      assert.strictEqual(hasUncheckedChildren(parentLi), true, 'Should detect unchecked child');

      // Now check Child 1 as well
      const child1Checkbox = parentLi.querySelectorAll<HTMLInputElement>('input.task-checkbox')[1];
      child1Checkbox.checked = true;
      child1Checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      assert.strictEqual(hasUncheckedChildren(parentLi), false, 'Should be false when all children are checked');
    });

    it('does not display delete button for checked item if it has unchecked children', () => {
      setContentFormatted('- [x] Parent\n  - [ ] Child 1\n- [x] Independent Item');
      wireAllTaskListControls(editor, () => {}, () => {});

      const rootTaskList = editor.querySelector('ul.task-list')!;
      const delBtns = rootTaskList.querySelectorAll<HTMLElement>(
        ':scope > .task-list-controls > .task-item-del-btn'
      );
      assert.strictEqual(delBtns.length, 2);

      // Trigger hover over Parent (idx 0)
      const parentLi = rootTaskList.querySelectorAll<HTMLElement>(':scope > li')[0];
      const moveEventParent = new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      });
      Object.defineProperty(moveEventParent, 'target', { value: parentLi });
      document.dispatchEvent(moveEventParent);

      // Parent has unchecked Child 1 -> delBtn should NOT be displayed
      assert.strictEqual(delBtns[0].style.display, 'none', 'Parent with unchecked children must not show delete button');

      // Trigger hover over Independent Item (idx 1)
      const indepLi = rootTaskList.querySelectorAll<HTMLElement>(':scope > li')[1];
      const moveEventIndep = new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
      });
      Object.defineProperty(moveEventIndep, 'target', { value: indepLi });
      document.dispatchEvent(moveEventIndep);

      // Independent Item is checked and has no unchecked children -> delBtn should display
      assert.strictEqual(delBtns[1].style.display, 'flex', 'Item with no unchecked children should show delete button');
    });

    it('marks dragged item with is-item-dragging class and sets initial indicator height on mousedown', () => {
      setContentFormatted('- [ ] Item 1\n- [ ] Item 2');
      const rootTaskList = editor.querySelector('ul.task-list')!;
      wireTaskListControls(rootTaskList as HTMLElement, () => {}, () => {});

      const dragBtn = rootTaskList.querySelectorAll<HTMLElement>('.task-item-drag-btn')[1];
      assert.ok(dragBtn);

      const items = rootTaskList.querySelectorAll<HTMLElement>(':scope > li');
      const targetItem = items[1];

      // Simulate mousedown on item 2 drag handle
      const mouseDownEvent = new dom.window.MouseEvent('mousedown', {
        bubbles: true,
        clientY: 50,
      });
      dragBtn.dispatchEvent(mouseDownEvent);

      // Target item should have is-item-dragging class
      assert.ok(targetItem.classList.contains('is-item-dragging'), 'Dragged item must have is-item-dragging class');

      // Drop indicator must be visible and initialized
      const dropIndicator = rootTaskList.querySelector<HTMLElement>('.task-drop-indicator')!;
      assert.strictEqual(dropIndicator.style.display, 'block');

      // Simulate mouseup
      const mouseUpEvent = new dom.window.MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      // Class should be removed on mouseup
      assert.strictEqual(targetItem.classList.contains('is-item-dragging'), false, 'Class must be removed on mouseup');
      assert.strictEqual(dropIndicator.style.display, 'none');
    });

    it('prevents parent handle from activating when cursor moves inside child list', () => {
      setContentFormatted('- [ ] Parent\n  - [ ] Child 1\n  - [ ] Child 2\n- [ ] Other');
      wireAllTaskListControls(editor, () => {}, () => {});

      const rootTaskList = editor.querySelector('ul.task-list')!;
      const parentDragBtn = rootTaskList.querySelectorAll<HTMLElement>('.task-item-drag-btn')[0];

      const parentLi = rootTaskList.querySelectorAll<HTMLElement>(':scope > li')[0];
      const childUl = parentLi.querySelector('ul.task-list')!;
      const child1 = childUl.querySelectorAll<HTMLElement>(':scope > li')[0];

      // Simulate hovering directly on child item
      const moveEventChild = new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        clientX: 30,
        clientY: 40,
      });
      Object.defineProperty(moveEventChild, 'target', { value: child1 });
      document.dispatchEvent(moveEventChild);

      // Parent drag handle should be hidden
      assert.strictEqual(parentDragBtn.style.display, 'none', 'Parent handle must not show when over child');

      // Simulate hovering on the child ul container (gap between items)
      const moveEventGap = new dom.window.MouseEvent('mousemove', {
        bubbles: true,
        clientX: 30,
        clientY: 55,
      });
      Object.defineProperty(moveEventGap, 'target', { value: childUl });
      document.dispatchEvent(moveEventGap);

      // Parent drag handle must STILL be hidden
      assert.strictEqual(parentDragBtn.style.display, 'none', 'Parent handle must not show when over child list container');
    });

    it('highlights target item with is-delete-target on delBtn mouseenter and removes it on mouseleave', () => {
      setContentFormatted('- [x] Completed item\n- [ ] Pending item');
      const rootTaskList = editor.querySelector('ul.task-list')!;
      wireTaskListControls(rootTaskList as HTMLElement, () => {}, () => {});

      const delBtn = rootTaskList.querySelector<HTMLElement>('.task-item-del-btn')!;
      assert.ok(delBtn);

      const items = rootTaskList.querySelectorAll<HTMLElement>(':scope > li');
      const targetItem = items[0];

      // Simulate mouseenter on delBtn
      delBtn.dispatchEvent(new dom.window.MouseEvent('mouseenter', { bubbles: true }));
      assert.ok(targetItem.classList.contains('is-delete-target'), 'Target item must have is-delete-target class on hover');

      // Simulate mouseleave on delBtn
      delBtn.dispatchEvent(new dom.window.MouseEvent('mouseleave', { bubbles: true }));
      assert.strictEqual(targetItem.classList.contains('is-delete-target'), false, 'is-delete-target must be removed on mouseleave');
    });

    it('highlights parent item encompassing children when hovering parent delete button', () => {
      setContentFormatted('- [x] Parent\n  - [x] Child 1\n  - [x] Child 2');
      wireAllTaskListControls(editor, () => {}, () => {});

      const rootTaskList = editor.querySelector('ul.task-list')!;
      const parentLi = rootTaskList.querySelectorAll<HTMLElement>(':scope > li')[0];
      const parentDelBtn = rootTaskList.querySelectorAll<HTMLElement>('.task-item-del-btn')[0];
      assert.ok(parentDelBtn);

      parentDelBtn.dispatchEvent(new dom.window.MouseEvent('mouseenter', { bubbles: true }));
      assert.ok(parentLi.classList.contains('is-delete-target'), 'Parent li must be highlighted as delete target');

      // Serialization check: is-delete-target class must not affect markdown
      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- [x] Parent\n  - [x] Child 1\n  - [x] Child 2');

      parentDelBtn.dispatchEvent(new dom.window.MouseEvent('mouseleave', { bubbles: true }));
      assert.strictEqual(parentLi.classList.contains('is-delete-target'), false);
    });
  });
});

