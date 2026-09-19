import assert from 'assert';
import { JSDOM } from 'jsdom';
import { state } from '../src/webview/editorState';
import {
  setContentFormatted,
  handleCanvasKeyDown,
  handleRawKeyDown,
} from '../src/webview/markdownEditor';
import { domToMarkdown } from '../src/markdown/serializer';

describe('User Interactions - Keyboard Event Handlers', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <select id="select-heading"><option value="p">Normal</option></select>
    <button id="btn-toggle-raw">Raw</button>
    <button id="btn-cowork">Cowork</button>
    <span id="word-count"></span>
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
    textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;

    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;
  });

  function setCursorIn(node: Node, offset = 0) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  describe('Enter key list exit and item creation', () => {
    it('Enter on an empty root list item exits list and inserts paragraph', () => {
      setContentFormatted('- Item 1\n- Item 2');
      const listItems = editor.querySelectorAll('li');
      assert.strictEqual(listItems.length, 2);

      const emptyLi = listItems[1];
      emptyLi.innerHTML = '<br>';
      setCursorIn(emptyLi, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true, 'Should prevent default Enter');
      // Empty li should have been removed and replaced with a paragraph
      const remainingLis = editor.querySelectorAll('li');
      assert.strictEqual(remainingLis.length, 1);
      assert.strictEqual(remainingLis[0].textContent?.trim(), 'Item 1');

      const p = editor.querySelector('p.editor-block');
      assert.ok(p, 'Should have created a paragraph block after list');
      assert.strictEqual(domToMarkdown(editor).trim(), '- Item 1');
    });

    it('Enter on an empty nested list item outdents it to parent level', () => {
      setContentFormatted('- Parent\n  - Child\n  - Sibling');
      const listItems = editor.querySelectorAll('li');
      const nestedLi = listItems[listItems.length - 1];
      nestedLi.innerHTML = '<br>';
      setCursorIn(nestedLi, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      // Empty item should now be outdented to the parent level
      const rootLis = editor.querySelectorAll('ul.editor-block > li');
      assert.strictEqual(rootLis.length, 2, 'Outdented item should become a direct child of the root list');
    });

    it('Enter on a task checklist item creates a new task item with checkbox', () => {
      setContentFormatted('- [x] Completed task');
      const taskLi = editor.querySelector('li.task-item')!;
      const span = taskLi.querySelector('.task-content') || taskLi;
      setCursorIn(span, span.childNodes.length);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      const items = editor.querySelectorAll('li.task-item');
      assert.strictEqual(items.length, 2, 'Should have created a second task item');

      const newItem = items[1];
      assert.strictEqual(newItem.getAttribute('data-checked'), 'false');
      assert.ok(newItem.querySelector('input[type="checkbox"]'));
      assert.ok(newItem.querySelector('.task-content'));
    });
  });

  describe('Tab and Shift+Tab indentation in lists', () => {
    it('Tab on second list item indents it under the first', () => {
      setContentFormatted('- Item 1\n- Item 2');
      const listItems = editor.querySelectorAll('li');
      setCursorIn(listItems[1], 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- Item 1\n  - Item 2');
    });

    it('Shift+Tab on nested list item outdents it back to root level', () => {
      setContentFormatted('- Item 1\n  - Item 2');
      const listItems = editor.querySelectorAll('li');
      setCursorIn(listItems[1], 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      const md = domToMarkdown(editor).trim();
      assert.strictEqual(md, '- Item 1\n- Item 2');
    });
  });

  describe('Keyboard shortcuts (Cmd+B, Cmd+I)', () => {
    it('Cmd+B calls bold formatting command', () => {
      setContentFormatted('Selectable text');
      const p = editor.querySelector('p')!;
      setCursorIn(p, 0);

      let execCmdCalled = '';
      document.execCommand = (cmd: string) => {
        execCmdCalled = cmd;
        return true;
      };

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'b',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      handleCanvasKeyDown(event);
      assert.strictEqual(execCmdCalled, 'bold');
    });

    it('Cmd+I calls italic formatting command', () => {
      setContentFormatted('Selectable text');
      const p = editor.querySelector('p')!;
      setCursorIn(p, 0);

      let execCmdCalled = '';
      document.execCommand = (cmd: string) => {
        execCmdCalled = cmd;
        return true;
      };

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'i',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      handleCanvasKeyDown(event);
      assert.strictEqual(execCmdCalled, 'italic');
    });
  });

  describe('Raw Textarea Keyboard Navigation', () => {
    it('Tab in raw textarea indents current line', () => {
      textarea.value = '- Item 1\n- Item 2';
      textarea.selectionStart = 9; // Start of line 2
      textarea.selectionEnd = 9;

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleRawKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(textarea.value, '- Item 1\n  - Item 2');
    });

    it('Shift+Tab in raw textarea outdents indented line', () => {
      textarea.value = '- Item 1\n  - Item 2';
      textarea.selectionStart = 11; // Start of line 2
      textarea.selectionEnd = 11;

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleRawKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(textarea.value, '- Item 1\n- Item 2');
    });
  });

  describe('Backspace Block Boundary Guard', () => {
    it('Backspace at beginning of paragraph after table does not merge into table', () => {
      setContentFormatted('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nMy paragraph');
      const p = editor.querySelector('p.editor-block')!;
      assert.ok(p);
      setCursorIn(p, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true, 'Backspace at start of paragraph after widget block should be prevented');
    });
  });

  describe('Backspace / Delete Next to Task Checkbox', () => {
    it('pressing backspace next to a checkbox deletes the checkbox immediately on the first keystroke', () => {
      setContentFormatted('- [ ] Buy groceries');
      const li = editor.querySelector('li.task-item')!;
      assert.ok(li);
      const contentSpan = li.querySelector('.task-content')!;
      setCursorIn(contentSpan.firstChild || contentSpan, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true, 'Should prevent default to delete checkbox immediately');
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 0);
      assert.strictEqual(editor.querySelectorAll('li.task-item').length, 0);
      assert.strictEqual(editor.querySelectorAll('li.list-item').length, 1);
      assert.strictEqual(domToMarkdown(editor).trim(), '- Buy groceries');
    });

    it('pressing backspace when cursor is placed to the left of the checkbox deletes it immediately', () => {
      setContentFormatted('- [ ] Call doctor');
      const li = editor.querySelector('li.task-item')!;
      assert.ok(li);
      setCursorIn(li, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 0);
      assert.strictEqual(domToMarkdown(editor).trim(), '- Call doctor');
    });

    it('pressing delete when cursor is placed to the left of the checkbox deletes it immediately', () => {
      setContentFormatted('- [ ] Read book');
      const li = editor.querySelector('li.task-item')!;
      assert.ok(li);
      setCursorIn(li, 0);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 0);
      assert.strictEqual(domToMarkdown(editor).trim(), '- Read book');
    });

    it('pressing backspace in the middle of task text does not delete the checkbox', () => {
      setContentFormatted('- [ ] Buy groceries');
      const li = editor.querySelector('li.task-item')!;
      assert.ok(li);
      const contentSpan = li.querySelector('.task-content')!;
      setCursorIn(contentSpan.firstChild || contentSpan, 3);

      let defaultPrevented = false;
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault = () => {
        defaultPrevented = true;
      };

      handleCanvasKeyDown(event);

      assert.strictEqual(defaultPrevented, false, 'Should allow normal text character deletion');
      assert.strictEqual(editor.querySelectorAll('input[type="checkbox"]').length, 1);
    });
  });
});
