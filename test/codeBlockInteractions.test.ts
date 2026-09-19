import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { handleCanvasKeyDown } from '../src/webview/markdownEditor';

describe('Code Block Free Text Language & Interactions', () => {
  let dom: JSDOM;
  let document: Document;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor" contenteditable="true"></div></body></html>');
    document = dom.window.document;
    editor = document.getElementById('editor')!;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  describe('Parser HTML generation for code blocks', () => {
    it('renders a free text editable input in the header with the specified language', () => {
      const md = '```typescript\nconst x = 42;\n```';
      const html = markdownToHtml(md);

      assert.ok(html.includes('class="code-lang-input"'));
      assert.ok(html.includes('value="typescript"'));
      assert.ok(html.includes('placeholder="Code"'));
    });

    it('renders a free text editable input with empty value when no language is specified', () => {
      const md = '```\nplain text\n```';
      const html = markdownToHtml(md);

      assert.ok(html.includes('class="code-lang-input"'));
      assert.ok(html.includes('value=""'));
      assert.ok(html.includes('placeholder="Code"'));
    });
  });

  describe('Serializer extraction and live updates', () => {
    it('serializes code block using the language from code-lang-input', () => {
      const md = '```python\nprint("hello")\n```';
      editor.innerHTML = markdownToHtml(md);

      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, md);
    });

    it('updates serialized markdown when user edits the code-lang-input value to another language', () => {
      const md = '```python\nprint("hello")\n```';
      editor.innerHTML = markdownToHtml(md);

      const langInput = editor.querySelector('input.code-lang-input') as HTMLInputElement;
      assert.ok(langInput);
      assert.strictEqual(langInput.value, 'python');

      // User changes language to ruby
      langInput.value = 'ruby';
      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, '```ruby\nprint("hello")\n```');
    });

    it('updates serialized markdown when user clears the code-lang-input value', () => {
      const md = '```javascript\nconsole.log(1);\n```';
      editor.innerHTML = markdownToHtml(md);

      const langInput = editor.querySelector('input.code-lang-input') as HTMLInputElement;
      assert.ok(langInput);

      // User clears the language
      langInput.value = '';
      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, '```\nconsole.log(1);\n```');
    });

    it('supports any custom free text language identifier', () => {
      const md = '```\ncode\n```';
      editor.innerHTML = markdownToHtml(md);

      const langInput = editor.querySelector('input.code-lang-input') as HTMLInputElement;
      assert.ok(langInput);

      langInput.value = 'custom-dsl';
      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, '```custom-dsl\ncode\n```');
    });
  });

  describe('Keyboard navigation from language input to code element', () => {
    it('moves focus to code element when pressing Enter in code-lang-input', () => {
      const md = '```javascript\nhello\n```';
      editor.innerHTML = markdownToHtml(md);

      const langInput = editor.querySelector('input.code-lang-input') as HTMLInputElement;
      const codeEl = editor.querySelector('code.editor-code') as HTMLElement;
      assert.ok(langInput);
      assert.ok(codeEl);

      let focused = false;
      codeEl.focus = () => {
        focused = true;
      };

      let defaultPrevented = false;
      const event = {
        key: 'Enter',
        target: langInput,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as KeyboardEvent;

      handleCanvasKeyDown(event);
      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(focused, true);
    });

    it('moves focus to code element when pressing Tab in code-lang-input', () => {
      const md = '```javascript\nhello\n```';
      editor.innerHTML = markdownToHtml(md);

      const langInput = editor.querySelector('input.code-lang-input') as HTMLInputElement;
      const codeEl = editor.querySelector('code.editor-code') as HTMLElement;
      assert.ok(langInput);
      assert.ok(codeEl);

      let focused = false;
      codeEl.focus = () => {
        focused = true;
      };

      let defaultPrevented = false;
      const event = {
        key: 'Tab',
        target: langInput,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as KeyboardEvent;

      handleCanvasKeyDown(event);
      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(focused, true);
    });
  });
});
