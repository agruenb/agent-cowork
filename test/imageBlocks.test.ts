import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { insertWidgetAtCursor } from '../src/webview/toolbarOperations';
import { renderImage } from '../src/markdown/parser';
import { setImageBaseUri, resolveImageSrc, toMarkdownImagePath } from '../src/markdown/imagePath';

describe('Image blocks', () => {
  let editor: HTMLElement;
  let doc: Document;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    doc = dom.window.document;
    editor = doc.getElementById('editor')!;
    setImageBaseUri('https://file.example/docs/');
  });

  afterEach(() => {
    setImageBaseUri('');
  });

  it('renders a standalone image line as an image widget with the relative path preserved', () => {
    const html = markdownToHtml('![Logo](images/logo.png)');
    assert.ok(html.includes('data-block-type="image"'));
    assert.ok(html.includes('data-src="images/logo.png"'));
    assert.ok(html.includes('src="https://file.example/docs/images/logo.png"'));
    assert.ok(!html.includes('class="image-placeholder"'));
  });

  it('renders an empty image as the "Select image" placeholder', () => {
    const html = markdownToHtml('![]()');
    assert.ok(html.includes('class="image-placeholder"'));
    assert.ok(html.includes('role="button"'));
    assert.ok(!html.includes('<img'));
  });

  it('roundtrips images, placeholders, titles and paths with parent folders', () => {
    const md = [
      '![Logo](images/logo.png)',
      '![](../shared/photo.jpg "A title")',
      '![]()',
      '![Spaced](<my images/a b.png>)',
    ].join('\n\n');
    editor.innerHTML = markdownToHtml(md);
    assert.strictEqual(domToMarkdown(editor).trim(), md);
  });

  it('does not treat an image inside text as an image widget', () => {
    const html = markdownToHtml('see ![x](a.png) here');
    assert.ok(!html.includes('data-block-type="image"'));
  });

  it('ends a paragraph before an image line', () => {
    const html = markdownToHtml('Intro text\n![x](a.png)');
    assert.ok(html.includes('data-block-type="paragraph">Intro text</p>'));
    assert.ok(html.includes('data-block-type="image"'));
  });

  describe('path helpers', () => {
    it('resolves relative paths against the document folder and keeps absolute URLs', () => {
      assert.strictEqual(resolveImageSrc('a/b.png'), 'https://file.example/docs/a/b.png');
      assert.strictEqual(resolveImageSrc('../b.png'), 'https://file.example/b.png');
      assert.strictEqual(resolveImageSrc('https://x.test/i.png'), 'https://x.test/i.png');
    });

    it('encodes path segments but keeps separators and parent references', () => {
      assert.strictEqual(toMarkdownImagePath('../my pics/a (1).png'), '../my%20pics/a%20%281%29.png');
      assert.strictEqual(toMarkdownImagePath('sub\\dir\\x.png'), 'sub/dir/x.png');
    });
  });

  it('shows a replace button for loaded images but not for the placeholder', () => {
    assert.ok(markdownToHtml('![a](a.png)').includes('class="image-replace-btn"'));
    assert.ok(!markdownToHtml('![]()').includes('image-replace-btn'));
  });

  it('does not serialize the replace button', () => {
    editor.innerHTML = markdownToHtml('![a](a.png)');
    assert.strictEqual(domToMarkdown(editor).trim(), '![a](a.png)');
  });

  describe('insertion at the cursor', () => {
    const place = (node: Node, offset: number) => {
      const range = doc.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const sel = doc.defaultView!.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    };
    const placeholder = () => renderImage({ type: 'image', src: '', alt: '' }, { lang: 'en' });

    it('splits a paragraph at the cursor', () => {
      editor.innerHTML = markdownToHtml('Hello world');
      place(editor.querySelector('p')!.firstChild!, 5);
      insertWidgetAtCursor(editor, placeholder());
      assert.strictEqual(domToMarkdown(editor).trim(), 'Hello\n\n![]()\n\nworld');
    });

    it('keeps inline formatting on both sides of the cursor', () => {
      editor.innerHTML = markdownToHtml('a **bold text** end');
      place(editor.querySelector('strong')!.firstChild!, 4);
      insertWidgetAtCursor(editor, placeholder());
      assert.strictEqual(domToMarkdown(editor).trim(), 'a **bold**\n\n![]()\n\n**text** end');
    });

    it('inserts before the text when the cursor is at the start of a paragraph', () => {
      editor.innerHTML = markdownToHtml('Hello');
      place(editor.querySelector('p')!.firstChild!, 0);
      insertWidgetAtCursor(editor, placeholder());
      assert.strictEqual(domToMarkdown(editor).trim(), '![]()\n\nHello');
    });

    it('inserts after the text when the cursor is at the end of a paragraph', () => {
      editor.innerHTML = markdownToHtml('Hello');
      place(editor.querySelector('p')!.firstChild!, 5);
      insertWidgetAtCursor(editor, placeholder());
      assert.strictEqual(domToMarkdown(editor).trim(), 'Hello\n\n![]()');
    });

    it('inserts after a widget when the cursor is inside it', () => {
      editor.innerHTML = markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nTail');
      place(editor.querySelector('td')!.firstChild!, 0);
      insertWidgetAtCursor(editor, placeholder());
      const children = Array.from(editor.children).map((c) => c.getAttribute('data-block-type'));
      assert.deepStrictEqual(children.slice(0, 3), ['table', 'image', 'paragraph']);
      assert.strictEqual(children[3], 'paragraph');
    });
  });
});
