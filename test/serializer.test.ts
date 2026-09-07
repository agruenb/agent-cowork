import assert from 'assert';
import { JSDOM } from 'jsdom';
import { domToMarkdown, serializeListBlock } from '../src/markdown/serializer';

describe('Markdown Serializer - Nested Lists', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  function serializeHtml(html: string): string {
    const editor = document.getElementById('editor')!;
    editor.innerHTML = html;
    return domToMarkdown(editor);
  }

  describe('Unordered Lists', () => {
    it('serializes single-level bullet list', () => {
      const html = `
        <ul class="editor-block bullet-list" data-block-type="unordered_list">
          <li class="list-item">Alpha</li>
          <li class="list-item">Beta</li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '- Alpha\n- Beta');
    });

    it('serializes 2-level nested bullet lists with 2 spaces indentation', () => {
      const html = `
        <ul class="editor-block bullet-list" data-block-type="unordered_list">
          <li class="list-item">Fruits
            <ul class="bullet-list" data-block-type="unordered_list">
              <li class="list-item">Apple</li>
              <li class="list-item">Banana</li>
            </ul>
          </li>
          <li class="list-item">Vegetables</li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '- Fruits\n  - Apple\n  - Banana\n- Vegetables');
    });

    it('serializes 3-level deep nested bullet lists', () => {
      const html = `
        <ul class="editor-block bullet-list" data-block-type="unordered_list">
          <li class="list-item">Level 1
            <ul class="bullet-list">
              <li class="list-item">Level 2
                <ul class="bullet-list">
                  <li class="list-item">Level 3</li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '- Level 1\n  - Level 2\n    - Level 3');
    });
  });

  describe('Ordered Lists', () => {
    it('serializes single-level ordered lists with proper numbering', () => {
      const html = `
        <ol class="editor-block ordered-list" data-block-type="ordered_list">
          <li class="list-item">First</li>
          <li class="list-item">Second</li>
        </ol>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '1. First\n2. Second');
    });

    it('serializes nested ordered lists with numbering restart', () => {
      const html = `
        <ol class="editor-block ordered-list" data-block-type="ordered_list">
          <li class="list-item">Step 1
            <ol class="ordered-list">
              <li class="list-item">Substep 1.1</li>
              <li class="list-item">Substep 1.2</li>
            </ol>
          </li>
          <li class="list-item">Step 2</li>
        </ol>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '1. Step 1\n  1. Substep 1.1\n  2. Substep 1.2\n2. Step 2');
    });
  });

  describe('Task Lists', () => {
    it('serializes nested task lists with checked/unchecked status', () => {
      const html = `
        <ul class="editor-block task-list" data-block-type="task_list">
          <li class="task-item" data-checked="false">
            <input type="checkbox" class="task-checkbox">
            <span class="task-content">Parent todo</span>
            <ul class="task-list">
              <li class="task-item is-checked" data-checked="true">
                <input type="checkbox" class="task-checkbox" checked>
                <span class="task-content">Done subtask</span>
              </li>
              <li class="task-item" data-checked="false">
                <input type="checkbox" class="task-checkbox">
                <span class="task-content">Pending subtask</span>
              </li>
            </ul>
          </li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(
        md.trim(),
        '- [ ] Parent todo\n  - [x] Done subtask\n  - [ ] Pending subtask'
      );
    });
  });

  describe('Mixed Nested Lists', () => {
    it('serializes ordered list nested inside unordered list', () => {
      const html = `
        <ul class="editor-block bullet-list">
          <li class="list-item">Items
            <ol class="ordered-list">
              <li class="list-item">One</li>
              <li class="list-item">Two</li>
            </ol>
          </li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '- Items\n  1. One\n  2. Two');
    });

    it('serializes task list nested inside ordered list', () => {
      const html = `
        <ol class="editor-block ordered-list">
          <li class="list-item">Setup project
            <ul class="task-list">
              <li class="task-item is-checked" data-checked="true">
                <input type="checkbox" checked>
                <span class="task-content">Init repo</span>
              </li>
            </ul>
          </li>
        </ol>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '1. Setup project\n  - [x] Init repo');
    });
  });

  describe('Browser Quirks & Inline Formatting', () => {
    it('handles browser quirk where nested ul is direct child of outer ul', () => {
      const html = `
        <ul class="editor-block bullet-list">
          <li class="list-item">Item 1</li>
          <ul class="bullet-list">
            <li class="list-item">Quirk Subitem</li>
          </ul>
          <li class="list-item">Item 2</li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(md.trim(), '- Item 1\n  - Quirk Subitem\n- Item 2');
    });

    it('preserves inline formatting (bold, italic, code, links) in nested lists', () => {
      const html = `
        <ul class="editor-block bullet-list">
          <li class="list-item"><strong>Important</strong>
            <ul class="bullet-list">
              <li class="list-item">Use <code>console.log()</code> and <em>test</em></li>
            </ul>
          </li>
        </ul>
      `;
      const md = serializeHtml(html);
      assert.strictEqual(
        md.trim(),
        '- **Important**\n  - Use `console.log()` and *test*'
      );
    });
  });
});
