import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  cleanHtmlToMarkdown,
  isCodeEditorHtml,
  isInlineMarkdown,
  processPastedContent,
  getInlinePasteHtml,
} from '../src/markdown/pasteHandler';

describe('Paste Handler Tests (Maintaining Markdown formatting & stripping incompatible styling)', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  describe('isCodeEditorHtml', () => {
    it('detects VS Code syntax highlighting HTML', () => {
      const vscodeHtml =
        '<meta charset=\'utf-8\'><div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo, Monaco, monospace;white-space: pre;"><div><span style="color: #569cd6;"># </span><span style="color: #4fc1ff;">Title</span></div></div>';
      assert.strictEqual(isCodeEditorHtml(vscodeHtml), true);
    });

    it('returns false for web page HTML with semantic blocks', () => {
      const webHtml = '<h1 style="color: red;">Title</h1><p>Some text</p>';
      assert.strictEqual(isCodeEditorHtml(webHtml), false);
    });

    it('returns false for empty input', () => {
      assert.strictEqual(isCodeEditorHtml(''), false);
    });
  });

  describe('cleanHtmlToMarkdown - Stripping Colors and Incompatible Styles', () => {
    it('strips text color and background color while maintaining bold', () => {
      const html = '<p style="color: red;">Hello <span style="font-weight: bold; color: blue; background-color: yellow;">world</span>!</p>';
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, 'Hello **world**!');
      assert.ok(!md.includes('color'));
      assert.ok(!md.includes('yellow'));
    });

    it('strips font-family and font-size while maintaining italic', () => {
      const html = '<p style="font-family: Arial; font-size: 24px;">An <i style="color: green; font-size: 30px;">italicized</i> phrase.</p>';
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, 'An *italicized* phrase.');
      assert.ok(!md.includes('Arial'));
      assert.ok(!md.includes('24px'));
    });

    it('maintains strikethrough from text-decoration: line-through while stripping styles', () => {
      const html = '<p>Old price: <span style="text-decoration: line-through; color: #888;">$100</span> Now: $80</p>';
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, 'Old price: ~~$100~~ Now: $80');
      assert.ok(!md.includes('#888'));
    });

    it('maintains inline code from monospace font style while stripping styles', () => {
      const html = '<p>Run <span style="font-family: monospace; color: purple;">git commit</span> now.</p>';
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, 'Run `git commit` now.');
      assert.ok(!md.includes('purple'));
    });

    it('handles Google Docs clipboard HTML (unwraps normal-weight <b>, captures 700 bold, strips colors)', () => {
      const gdocsHtml = `
        <b style="font-weight:normal;" id="docs-internal-guid-1234">
          <p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
            <span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:400;">Regular text </span>
            <span style="font-size:11pt;font-family:Arial;color:#ff0000;background-color:#ffff00;font-weight:700;">Bold Red</span>
          </p>
        </b>
      `;
      const md = cleanHtmlToMarkdown(gdocsHtml, document);
      assert.strictEqual(md, 'Regular text **Bold Red**');
      assert.ok(!md.includes('#ff0000'));
      assert.ok(!md.includes('#ffff00'));
    });

    it('handles Microsoft Word clipboard HTML (strips mso-* styles, maintains bold and links)', () => {
      const wordHtml = `
        <p class="MsoNormal" style="mso-margin-top-alt:auto;line-height:normal">
          <b style="mso-bidi-font-weight:normal"><span style="color:red">Important:</span></b>
          <span style="color:#262626"> Visit </span>
          <a href="https://example.com" style="color:blue">here</a>.
        </p>
      `;
      const md = cleanHtmlToMarkdown(wordHtml, document);
      assert.strictEqual(md, '**Important:** Visit [here](https://example.com).');
      assert.ok(!md.includes('MsoNormal'));
      assert.ok(!md.includes('red'));
    });

    it('maintains headings (h1-h6) and strips styling, alignment, and fonts', () => {
      const html = `
        <h1 style="color: red; text-align: center; font-family: Georgia;">Title 1</h1>
        <h2 style="color: blue; letter-spacing: 2px;">Title 2</h2>
        <h3 style="border-bottom: 2px solid grey;">Title 3</h3>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(md.includes('# Title 1'));
      assert.ok(md.includes('## Title 2'));
      assert.ok(md.includes('### Title 3'));
      assert.ok(!md.includes('Georgia'));
      assert.ok(!md.includes('letter-spacing'));
    });

    it('maintains bullet and ordered lists and strips list colors and styles', () => {
      const html = `
        <ul style="color: red; list-style-type: square;">
          <li style="color: blue;">Item A</li>
          <li style="color: green;"><b>Item B</b></li>
        </ul>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, '- Item A\n- **Item B**');
      assert.ok(!md.includes('red'));
      assert.ok(!md.includes('square'));
    });

    it('maintains task lists with checkboxes', () => {
      const html = `
        <ul>
          <li><input type="checkbox" checked> Completed task</li>
          <li><input type="checkbox"> Pending task</li>
        </ul>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(md.includes('- [x] Completed task'));
      assert.ok(md.includes('- [ ] Pending task'));
    });

    it('maintains tables and strips table borders, cell backgrounds, and colors', () => {
      const html = `
        <table style="border: 2px solid green; background-color: pink;">
          <thead>
            <tr style="background: yellow;">
              <th style="color: red;">Col 1</th>
              <th style="color: blue;">Col 2</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="color: purple;">Val 1</td>
              <td style="background-color: orange;"><b>Val 2</b></td>
            </tr>
          </tbody>
        </table>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(md.includes('| Col 1 | Col 2 |'));
      assert.ok(md.includes('| --- | --- |'));
      assert.ok(md.includes('| Val 1 | **Val 2** |'));
      assert.ok(!md.includes('pink'));
      assert.ok(!md.includes('orange'));
    });

    it('normalizes tables without explicit thead by promoting first row', () => {
      const html = `
        <table>
          <tr><td>Header A</td><td>Header B</td></tr>
          <tr><td>Data A</td><td>Data B</td></tr>
        </table>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(md.includes('| Header A | Header B |'));
      assert.ok(md.includes('| --- | --- |'));
      assert.ok(md.includes('| Data A | Data B |'));
    });

    it('maintains code blocks with language and strips syntax theme styles', () => {
      const html = `
        <pre style="background: #111; color: #fff;"><code class="language-typescript" style="color: cyan;">const port: number = 8080;</code></pre>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(md.includes('```typescript'));
      assert.ok(md.includes('const port: number = 8080;'));
      assert.ok(md.includes('```'));
      assert.ok(!md.includes('cyan'));
    });

    it('maintains blockquotes and strips custom borders and colors', () => {
      const html = `
        <blockquote style="border-left: 5px solid cyan; background: #fafafa; color: #444;">
          <p>Wisdom begins in wonder.</p>
        </blockquote>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, '> Wisdom begins in wonder.');
      assert.ok(!md.includes('cyan'));
    });

    it('completely strips <script>, <style>, and dangerous protocols from links', () => {
      const html = `
        <style>body { color: red; }</style>
        <script>alert('xss');</script>
        <p>Safe text with <a href="javascript:alert(1)">bad link</a> and <a href="https://example.com">good link</a>.</p>
      `;
      const md = cleanHtmlToMarkdown(html, document);
      assert.ok(!md.includes('alert'));
      assert.ok(!md.includes('javascript'));
      assert.ok(md.includes('[good link](https://example.com)'));
      assert.ok(md.includes('bad link')); // link unwrapped to text
    });

    it('converts <font> tags to plain text while stripping font attributes', () => {
      const html = '<font color="#ff0000" face="Comic Sans MS" size="6">Unwanted font formatting</font>';
      const md = cleanHtmlToMarkdown(html, document);
      assert.strictEqual(md, 'Unwanted font formatting');
      assert.ok(!md.includes('Comic Sans'));
      assert.ok(!md.includes('#ff0000'));
    });
  });

  describe('isInlineMarkdown', () => {
    it('identifies single line inline markdown as inline', () => {
      assert.strictEqual(isInlineMarkdown('**bold text**'), true);
      assert.strictEqual(isInlineMarkdown('*italic* and `code` and [link](https://test.com)'), true);
      assert.strictEqual(isInlineMarkdown('plain single sentence'), true);
    });

    it('identifies headings as block-level', () => {
      assert.strictEqual(isInlineMarkdown('# Heading 1'), false);
      assert.strictEqual(isInlineMarkdown('### Heading 3'), false);
    });

    it('identifies lists as block-level', () => {
      assert.strictEqual(isInlineMarkdown('- Item 1\n- Item 2'), false);
      assert.strictEqual(isInlineMarkdown('1. First\n2. Second'), false);
      assert.strictEqual(isInlineMarkdown('- [ ] Task'), false);
    });

    it('identifies tables as block-level', () => {
      assert.strictEqual(isInlineMarkdown('| A | B |\n|---|---|\n| 1 | 2 |'), false);
    });

    it('identifies multiple paragraphs (double newline) as block-level', () => {
      assert.strictEqual(isInlineMarkdown('Paragraph 1\n\nParagraph 2'), false);
    });

    it('identifies blockquotes and code fences as block-level', () => {
      assert.strictEqual(isInlineMarkdown('> A quote'), false);
      assert.strictEqual(isInlineMarkdown('```js\nconst x = 1;\n```'), false);
      assert.strictEqual(isInlineMarkdown('---'), false);
    });
  });

  describe('processPastedContent', () => {
    it('uses plain text when HTML is code editor syntax highlighting', () => {
      const vscodeHtml =
        '<div style="font-family: Consolas, monospace; white-space: pre;"><span style="color: #569cd6;"># </span><span style="color: #4fc1ff;">My Title</span></div>';
      const plainText = '# My Title\n\n- Item 1\n- Item 2';
      const res = processPastedContent(vscodeHtml, plainText, document);
      assert.strictEqual(res.markdown, '# My Title\n\n- Item 1\n- Item 2');
      assert.strictEqual(res.isInline, false);
    });

    it('processes rich text HTML from browser, maintaining markdown and stripping colors', () => {
      const webHtml = '<p style="color: red;">Here is <b style="color: blue;">bold</b> and <span style="font-style: italic; color: green;">italic</span>.</p>';
      const plainText = 'Here is bold and italic.';
      const res = processPastedContent(webHtml, plainText, document);
      assert.strictEqual(res.markdown, 'Here is **bold** and *italic*.');
      assert.strictEqual(res.isInline, true);
    });

    it('handles plain text markdown input when HTML is not provided', () => {
      const plainText = '## Section\n\n**Important:** read [this](https://example.com)';
      const res = processPastedContent('', plainText, document);
      assert.strictEqual(res.markdown, plainText);
      assert.strictEqual(res.isInline, false);
    });

    it('handles plain unformatted text input', () => {
      const plainText = 'Simple plain text without formatting.';
      const res = processPastedContent('', plainText, document);
      assert.strictEqual(res.markdown, plainText);
      assert.strictEqual(res.isInline, true);
    });
  });

  describe('getInlinePasteHtml', () => {
    it('converts inline markdown to safe HTML spans with line breaks', () => {
      const md = 'Hello **world** and *italic*\nNext line';
      const html = getInlinePasteHtml(md);
      assert.ok(html.includes('<strong>world</strong>'));
      assert.ok(html.includes('<em>italic</em>'));
      assert.ok(html.includes('<br>Next line'));
    });
  });
});
