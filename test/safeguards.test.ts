import assert from 'assert';
import { JSDOM } from 'jsdom';
import { safeMarkdownToHtml, markdownToHtml } from '../src/markdown/parser';
import { safeDomToMarkdown, domToMarkdown } from '../src/markdown/serializer';

describe('Data Loss Safeguards & Anomaly Detection', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  describe('safeMarkdownToHtml', () => {
    it('successfully parses valid markdown content', () => {
      const { html, error } = safeMarkdownToHtml('# Title\n\nHello world');
      assert.strictEqual(error, undefined);
      assert.ok(html.includes('<h1'));
      assert.ok(html.includes('Hello world'));
    });

    it('handles empty string without reporting error', () => {
      const { html, error } = safeMarkdownToHtml('');
      assert.strictEqual(error, undefined);
      assert.strictEqual(html, '<p class="editor-block" data-block-type="paragraph"><br></p>');
    });

    it('handles whitespace-only string without reporting error', () => {
      const { html, error } = safeMarkdownToHtml('   \n\n  ');
      assert.strictEqual(error, undefined);
      assert.strictEqual(html, '<p class="editor-block" data-block-type="paragraph"><br></p>');
    });


    it('detects anomaly if non-empty markdown produces completely empty HTML', () => {
      // In normal operation, even "foo" produces "<p ...>foo</p>".
      // We can verify that for any non-empty input with characters, html is non-empty.
      const { html, error } = safeMarkdownToHtml('Just some text');
      assert.strictEqual(error, undefined);
      assert.ok(html.trim().length > 0);
    });
  });

  describe('safeDomToMarkdown', () => {
    it('successfully serializes valid DOM to markdown', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = '<p class="editor-block" data-block-type="paragraph">Hello world</p>';
      const { markdown, error } = safeDomToMarkdown(editor);
      assert.strictEqual(error, undefined);
      assert.strictEqual(markdown.trim(), 'Hello world');
    });

    it('safely handles an empty DOM container', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = '';
      const { markdown, error } = safeDomToMarkdown(editor);
      assert.strictEqual(error, undefined);
      assert.strictEqual(markdown, '');
    });

    it('safely handles a DOM container with only <br>', () => {
      const editor = document.getElementById('editor')!;
      editor.innerHTML = '<p class="editor-block"><br></p>';
      const { markdown, error } = safeDomToMarkdown(editor);
      assert.strictEqual(error, undefined);
      assert.strictEqual(markdown.trim(), '');
    });

    it('detects an anomaly when DOM has visible text but serializer produces empty output', () => {
      const editor = document.getElementById('editor')!;
      // Create a node that textContent contains text
      const brokenNode = document.createElement('div');
      brokenNode.textContent = 'Critical user content';
      editor.appendChild(brokenNode);

      // If serializer produced empty output despite non-empty textContent:
      // We can test safeDomToMarkdown's check directly:
      // A normal div will serialize to pContent, but let's test a mock container where
      // domToMarkdown returns empty string while textContent is present.
      const mockContainer = {
        childNodes: [],
        children: [],
        tagName: 'DIV',
        nodeType: 1,
        textContent: 'Unsaved critical text',
        querySelectorAll: () => [],
        querySelector: () => null,
      } as unknown as HTMLElement;

      const { markdown, error } = safeDomToMarkdown(mockContainer);
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Serializer produced empty Markdown despite non-empty DOM content'));
      assert.strictEqual(markdown, '');
    });
  });

  describe('Provider-level Empty File Overwrite Protection', () => {
    // Uses the same hasVisibleContent utility as the real provider guard
    const { hasVisibleContent } = require('../src/utils/markdownContent');

    // Simulates the guard logic applied in markdownEditorProvider.ts onDidReceiveMessage('edit')
    // Edits that erase all visible content from a document with visible content are blocked.
    function simulateEditGuard(
      currentDocText: string,
      incomingText: string,
    ): { applied: boolean; reason?: string } {
      if (typeof incomingText !== 'string') {
        return { applied: false, reason: 'Invalid payload type' };
      }
      if (hasVisibleContent(currentDocText) && !hasVisibleContent(incomingText)) {
        return { applied: false, reason: 'Blocked content-erasing edit on document with visible content' };
      }
      return { applied: true };
    }

    it('allows edits that contain content on non-empty document', () => {
      const result = simulateEditGuard('# Heading\nExisting text', '# Heading\nUpdated text');
      assert.strictEqual(result.applied, true);
    });

    it('allows edits on an already empty document', () => {
      const result = simulateEditGuard('', 'New content');
      assert.strictEqual(result.applied, true);
    });

    it('blocks completely empty edit when document has existing content', () => {
      const result = simulateEditGuard('# Important Document\nDo not delete', '');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only whitespace when document has visible content', () => {
      const result = simulateEditGuard('# Important Document\nDo not delete', '   \n  \n  ');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only residual heading markers but no text', () => {
      const result = simulateEditGuard('# Real Title\nSome paragraph text', '# \n## \n### ');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only horizontal rules and no visible text', () => {
      const result = simulateEditGuard('Important content here', '---\n\n---');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only empty list markers', () => {
      const result = simulateEditGuard('A real paragraph', '- \n- \n- ');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only table separator syntax', () => {
      const result = simulateEditGuard('Real content', '| | |\n| --- | --- |');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only code fences and no code', () => {
      const result = simulateEditGuard('Real content', '```\n\n```');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only blockquote markers', () => {
      const result = simulateEditGuard('Real content', '> \n> ');
      assert.strictEqual(result.applied, false);
    });

    it('blocks edit with only empty task checkboxes', () => {
      const result = simulateEditGuard('Real content', '- [ ] \n- [x] ');
      assert.strictEqual(result.applied, false);
    });

    it('allows edit that replaces content with different visible content', () => {
      const result = simulateEditGuard('Old text', 'New text');
      assert.strictEqual(result.applied, true);
    });

    it('allows edit that has visible text inside markdown structures', () => {
      const result = simulateEditGuard('Old text', '# New Heading\n\nNew paragraph');
      assert.strictEqual(result.applied, true);
    });

    it('allows writing content to an empty document', () => {
      const result = simulateEditGuard('', '# New Document');
      assert.strictEqual(result.applied, true);
    });

    it('allows empty-to-empty edits (no-op)', () => {
      const result = simulateEditGuard('', '');
      assert.strictEqual(result.applied, true);
    });
  });

  describe('hasVisibleContent utility', () => {
    const { hasVisibleContent } = require('../src/utils/markdownContent');

    it('returns true for plain text', () => {
      assert.strictEqual(hasVisibleContent('Hello world'), true);
    });

    it('returns true for text with markdown formatting', () => {
      assert.strictEqual(hasVisibleContent('**bold** and *italic*'), true);
    });

    it('returns true for heading with text', () => {
      assert.strictEqual(hasVisibleContent('# My Title'), true);
    });

    it('returns true for list with text', () => {
      assert.strictEqual(hasVisibleContent('- Item one\n- Item two'), true);
    });

    it('returns true for code block with code', () => {
      assert.strictEqual(hasVisibleContent('```js\nconsole.log("hi")\n```'), true);
    });

    it('returns true for table with cell text', () => {
      assert.strictEqual(hasVisibleContent('| Name | Age |\n| --- | --- |\n| Alice | 30 |'), true);
    });

    it('returns false for empty string', () => {
      assert.strictEqual(hasVisibleContent(''), false);
    });

    it('returns false for whitespace only', () => {
      assert.strictEqual(hasVisibleContent('   \n\n  \t  '), false);
    });

    it('returns false for empty heading markers', () => {
      assert.strictEqual(hasVisibleContent('# \n## \n### '), false);
    });

    it('returns false for only horizontal rules', () => {
      assert.strictEqual(hasVisibleContent('---\n\n***\n\n___'), false);
    });

    it('returns false for only empty list markers', () => {
      assert.strictEqual(hasVisibleContent('- \n- \n* \n+ '), false);
    });

    it('returns false for only blockquote markers', () => {
      assert.strictEqual(hasVisibleContent('> \n> \n>> '), false);
    });

    it('returns false for only code fences', () => {
      assert.strictEqual(hasVisibleContent('```\n\n```'), false);
    });

    it('returns false for only table syntax with no text', () => {
      assert.strictEqual(hasVisibleContent('| | |\n| --- | --- |\n| | |'), false);
    });

    it('returns false for only task checkbox markers', () => {
      assert.strictEqual(hasVisibleContent('- [ ] \n- [x] '), false);
    });

    it('returns false for null/undefined', () => {
      assert.strictEqual(hasVisibleContent(null), false);
      assert.strictEqual(hasVisibleContent(undefined), false);
    });
  });
});
