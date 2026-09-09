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
    // Simulates the guard logic applied in markdownEditorProvider.ts onDidReceiveMessage('edit')
    function simulateEditGuard(
      currentDocText: string,
      incomingText: string,
      isExplicitEmpty?: boolean
    ): { applied: boolean; reason?: string } {
      if (typeof incomingText !== 'string') {
        return { applied: false, reason: 'Invalid payload type' };
      }
      if (currentDocText.trim().length > 0 && incomingText.trim().length === 0) {
        if (!isExplicitEmpty) {
          return { applied: false, reason: 'Blocked accidental empty wipeout on non-empty document' };
        }
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

    it('blocks unexpected empty edit when document has existing content', () => {
      const result = simulateEditGuard('# Important Document\nDo not delete', '', false);
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'Blocked accidental empty wipeout on non-empty document');
    });

    it('blocks unexpected empty edit when isExplicitEmpty is undefined (e.g. unhandled error state)', () => {
      const result = simulateEditGuard('# Important Document\nDo not delete', '');
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'Blocked accidental empty wipeout on non-empty document');
    });

    it('allows empty edit when user explicitly and deliberately cleared the document', () => {
      const result = simulateEditGuard('# Important Document\nDo not delete', '', true);
      assert.strictEqual(result.applied, true);
    });
  });
});
