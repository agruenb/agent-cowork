import assert from 'assert';
import { JSDOM } from 'jsdom';
import { parseMarkdownToBlocks, markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown, formatMarkdownBlocks } from '../src/markdown/serializer';

describe('Empty Line Maintenance in Markdown Conversion', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  function getEditor(): HTMLElement {
    return document.getElementById('editor')!;
  }

  describe('DOM to Markdown (Serializer)', () => {
    it('maintains single empty line between paragraphs', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph">First paragraph</p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Second paragraph</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, 'First paragraph\n\n\nSecond paragraph\n');
    });

    it('maintains multiple empty lines between paragraphs', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph">First paragraph</p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Second paragraph</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, 'First paragraph\n\n\n\nSecond paragraph\n');
    });

    it('maintains empty line between heading and paragraph', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <h1 class="editor-block" data-block-type="heading" data-level="1">Title</h1>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Body text</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '# Title\n\n\nBody text\n');
    });

    it('maintains empty line between list and paragraph', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <ul class="editor-block bullet-list" data-block-type="unordered_list">
          <li class="list-item">Bullet 1</li>
        </ul>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Follow-up text</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '- Bullet 1\n\n\nFollow-up text\n');
    });

    it('maintains leading empty line at start of document', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Hello</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '\nHello\n');
    });

    it('maintains multiple leading empty lines at start of document', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Hello</p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '\n\nHello\n');
    });

    it('maintains trailing empty line at end of document', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph">Hello</p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, 'Hello\n\n');
    });

    it('maintains multiple trailing empty lines at end of document', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph">Hello</p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, 'Hello\n\n\n');
    });

    it('maintains empty lines at both start and end of document', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph"><br></p>
        <p class="editor-block" data-block-type="paragraph">Middle</p>
        <p class="editor-block" data-block-type="paragraph"><br></p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '\nMiddle\n\n');
    });

    it('single empty paragraph serializes to empty string', () => {
      const editor = getEditor();
      editor.innerHTML = `
        <p class="editor-block" data-block-type="paragraph"><br></p>
      `;

      const md = domToMarkdown(editor);
      assert.strictEqual(md, '');
    });
  });

  describe('Markdown to Blocks (Parser)', () => {
    it('parses extra blank line between paragraphs into an empty paragraph block', () => {
      const md = 'First\n\n\nSecond';
      const blocks = parseMarkdownToBlocks(md);
      assert.strictEqual(blocks.length, 3);
      assert.strictEqual(blocks[0].type, 'paragraph');
      assert.strictEqual(blocks[0].content, 'First');
      assert.strictEqual(blocks[1].type, 'paragraph');
      assert.strictEqual(blocks[1].content, '');
      assert.strictEqual(blocks[2].type, 'paragraph');
      assert.strictEqual(blocks[2].content, 'Second');
    });

    it('parses multiple extra blank lines between paragraphs', () => {
      const md = 'First\n\n\n\nSecond';
      const blocks = parseMarkdownToBlocks(md);
      assert.strictEqual(blocks.length, 4);
      assert.strictEqual(blocks[0].content, 'First');
      assert.strictEqual(blocks[1].content, '');
      assert.strictEqual(blocks[2].content, '');
      assert.strictEqual(blocks[3].content, 'Second');
    });

    it('parses leading blank lines into empty paragraph blocks', () => {
      const md = '\n\nHello';
      const blocks = parseMarkdownToBlocks(md);
      assert.strictEqual(blocks.length, 3);
      assert.strictEqual(blocks[0].content, '');
      assert.strictEqual(blocks[1].content, '');
      assert.strictEqual(blocks[2].content, 'Hello');
    });

    it('parses trailing blank lines into empty paragraph blocks', () => {
      const md = 'Hello\n\n\n';
      const blocks = parseMarkdownToBlocks(md);
      assert.strictEqual(blocks.length, 3);
      assert.strictEqual(blocks[0].content, 'Hello');
      assert.strictEqual(blocks[1].content, '');
      assert.strictEqual(blocks[2].content, '');
    });
  });

  describe('Roundtrip Fidelity', () => {
    function roundtrip(inputMd: string): string {
      const html = markdownToHtml(inputMd);
      const editor = getEditor();
      editor.innerHTML = html;
      return domToMarkdown(editor);
    }

    it('roundtrips single empty line between paragraphs', () => {
      const input = 'First paragraph\n\n\nSecond paragraph\n';
      assert.strictEqual(roundtrip(input), input);
    });

    it('roundtrips multiple empty lines between paragraphs', () => {
      const input = 'First paragraph\n\n\n\nSecond paragraph\n';
      assert.strictEqual(roundtrip(input), input);
    });

    it('roundtrips empty lines between headings and lists', () => {
      const input = '# Heading 1\n\n\nParagraph text\n\n\n\n- Item 1\n- Item 2\n';
      assert.strictEqual(roundtrip(input), input);
    });

    it('roundtrips document with leading empty lines', () => {
      const input = '\n\n# Heading\n\nText\n';
      assert.strictEqual(roundtrip(input), input);
    });

    it('roundtrips document with trailing empty lines', () => {
      const input = '# Heading\n\nText\n\n\n';
      assert.strictEqual(roundtrip(input), input);
    });

    it('remains stable across 10 roundtrip cycles with empty lines', () => {
      const input = '# Title\n\n\nParagraph 1\n\n\n\nParagraph 2\n\n- Item\n\n\n';
      let current = input;
      for (let i = 0; i < 10; i++) {
        current = roundtrip(current);
        assert.strictEqual(current, input, `Diverged at cycle ${i + 1}`);
      }
    });
  });
});
