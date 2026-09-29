import assert from 'assert';
import * as path from 'path';
import { parseInlineMarkdown } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import { handleOpenLink } from '../src/markdownEditorProvider';
import { scrollToHeadingOrAnchor, initMarkdownEditor } from '../src/webview/markdownEditor';
import { vscode as webviewVscode } from '../src/webview/editorState';
import { t } from '../src/i18n';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';
import * as vscode from 'vscode';
import { JSDOM } from 'jsdom';

function htmlToMd(html: string): string {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="editor">${html}</div></body></html>`);
  return domToMarkdown(dom.window.document.getElementById('editor')!);
}

describe('Markdown View Link Support (Opening Files and Anchors)', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  describe('1. Parsing Markdown Links', () => {
    it('parses relative file link with angle brackets: [File X](<./file.md>)', () => {
      const html = parseInlineMarkdown('[File X](<./file.md>)');
      assert.ok(html.includes('href="./file.md"'), 'href should be ./file.md');
      assert.ok(html.includes('class="editor-link"'), 'should have editor-link class');
      assert.ok(html.includes('data-angle-brackets="true"'), 'should have data-angle-brackets attribute');
      assert.ok(html.includes('>File X</a>'), 'label should be File X');
    });

    it('parses standard relative file link: [File X](./file.md)', () => {
      const html = parseInlineMarkdown('[File X](./file.md)');
      assert.ok(html.includes('href="./file.md"'), 'href should be ./file.md');
      assert.ok(html.includes('class="editor-link"'), 'should have editor-link class');
      assert.ok(!html.includes('data-angle-brackets'), 'should not have data-angle-brackets');
      assert.ok(html.includes('>File X</a>'), 'label should be File X');
    });

    it('parses angle-bracket link with spaces in path: [File X](<./path with spaces/file.md>)', () => {
      const html = parseInlineMarkdown('[File X](<./path with spaces/file.md>)');
      assert.ok(html.includes('href="./path with spaces/file.md"'));
      assert.ok(html.includes('data-angle-brackets="true"'));
      assert.ok(html.includes('>File X</a>'));
    });

    it('parses angle-bracket link with optional title: [File X](<./file.md> "My Title")', () => {
      const html = parseInlineMarkdown('[File X](<./file.md> "My Title")');
      assert.ok(html.includes('href="./file.md"'));
      assert.ok(html.includes('title="My Title"'));
      assert.ok(html.includes('data-title="true"'));
      assert.ok(html.includes('data-angle-brackets="true"'));
    });

    it('parses standard link with optional title: [File X](./file.md "My Title")', () => {
      const html = parseInlineMarkdown('[File X](./file.md "My Title")');
      assert.ok(html.includes('href="./file.md"'));
      assert.ok(html.includes('title="My Title"'));
      assert.ok(html.includes('data-title="true"'));
      assert.ok(!html.includes('data-angle-brackets'));
    });

    it('parses external URL: [Web](https://example.com/path?a=1&b=2)', () => {
      const html = parseInlineMarkdown('[Web](https://example.com/path?a=1&b=2)');
      assert.ok(html.includes('href="https://example.com/path?a=1&amp;b=2"'));
      assert.ok(html.includes('>Web</a>'));
    });

    it('parses URL with balanced parentheses: [File](./file(1).md)', () => {
      const html = parseInlineMarkdown('[File](./file(1).md)');
      assert.ok(html.includes('href="./file(1).md"'));
      assert.ok(html.includes('>File</a>'));
    });

    it('parses in-document anchor: [Jump](#heading-one)', () => {
      const html = parseInlineMarkdown('[Jump](#heading-one)');
      assert.ok(html.includes('href="#heading-one"'));
      assert.ok(html.includes('>Jump</a>'));
    });

    it('does NOT parse images as hyperlinks: ![alt text](./image.png)', () => {
      const html = parseInlineMarkdown('![alt text](./image.png)');
      assert.ok(!html.includes('<a href'), 'should not contain an anchor tag');
      assert.ok(!html.includes('editor-link'));
    });

    it('parses multiple links on the same line', () => {
      const html = parseInlineMarkdown('See [File A](./a.md) and [File B](<./b.md>) for details.');
      assert.ok(html.includes('href="./a.md"'));
      assert.ok(html.includes('href="./b.md"'));
      assert.ok(html.includes('>File A</a>'));
      assert.ok(html.includes('>File B</a>'));
    });

    it('preserves inner formatting in link label: [**Bold Doc**](./doc.md)', () => {
      const html = parseInlineMarkdown('[**Bold Doc**](./doc.md)');
      assert.ok(html.includes('<strong>Bold Doc</strong>'));
      assert.ok(html.includes('href="./doc.md"'));
    });
  });

  describe('2. Serializing Markdown Links', () => {
    it('round-trips angle-bracket link: [File X](<./file.md>)', () => {
      const original = '<p class="editor-block"><a href="./file.md" class="editor-link" data-angle-brackets="true">File X</a></p>';
      const md = htmlToMd(original);
      assert.strictEqual(md.trim(), '[File X](<./file.md>)');
    });

    it('round-trips standard link: [File X](./file.md)', () => {
      const original = '<p class="editor-block"><a href="./file.md" class="editor-link">File X</a></p>';
      const md = htmlToMd(original);
      assert.strictEqual(md.trim(), '[File X](./file.md)');
    });

    it('round-trips link with spaces in path using angle brackets', () => {
      const original = '<p class="editor-block"><a href="./path with spaces/file.md" class="editor-link" data-angle-brackets="true">File X</a></p>';
      const md = htmlToMd(original);
      assert.strictEqual(md.trim(), '[File X](<./path with spaces/file.md>)');
    });

    it('round-trips angle-bracket link with title: [File X](<./file.md> "My Title")', () => {
      const original = '<p class="editor-block"><a href="./file.md" title="My Title" data-title="true" class="editor-link" data-angle-brackets="true">File X</a></p>';
      const md = htmlToMd(original);
      assert.strictEqual(md.trim(), '[File X](<./file.md> "My Title")');
    });

    it('round-trips standard link with title: [File X](./file.md "My Title")', () => {
      const original = '<p class="editor-block"><a href="./file.md" title="My Title" data-title="true" class="editor-link">File X</a></p>';
      const md = htmlToMd(original);
      assert.strictEqual(md.trim(), '[File X](./file.md "My Title")');
    });
  });

  describe('3. Opening Links via handleOpenLink', () => {
    const baseUri = vscode.Uri.file('/Users/adrian/Code/project/docs/readme.md');
    const mockDocument: any = {
      uri: baseUri,
      isDirty: false,
      save: async () => true,
    };

    it('opens relative markdown file with agentCowork.markdownEditor', async () => {
      vscodeMockState.existingFiles = new Set(['/Users/adrian/Code/project/docs/file.md']);

      await handleOpenLink('./file.md', mockDocument);

      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith'
      );
      assert.ok(openWithCmd, 'should execute vscode.openWith');
      assert.strictEqual(openWithCmd.args[0].fsPath, '/Users/adrian/Code/project/docs/file.md');
      assert.strictEqual(openWithCmd.args[1], 'agentCowork.markdownEditor');
    });

    it('opens angle-bracket relative link: <./file.md>', async () => {
      vscodeMockState.existingFiles = new Set(['/Users/adrian/Code/project/docs/file.md']);

      await handleOpenLink('<./file.md>', mockDocument);

      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith'
      );
      assert.ok(openWithCmd, 'should execute vscode.openWith');
      assert.strictEqual(openWithCmd.args[0].fsPath, '/Users/adrian/Code/project/docs/file.md');
    });

    it('opens parent directory relative link: ../CHANGELOG.md', async () => {
      vscodeMockState.existingFiles = new Set(['/Users/adrian/Code/project/CHANGELOG.md']);

      await handleOpenLink('../CHANGELOG.md', mockDocument);

      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith'
      );
      assert.ok(openWithCmd);
      assert.strictEqual(openWithCmd.args[0].fsPath, '/Users/adrian/Code/project/CHANGELOG.md');
    });

    it('opens non-markdown file with vscode.open', async () => {
      vscodeMockState.existingFiles = new Set(['/Users/adrian/Code/project/docs/diagram.png']);

      await handleOpenLink('./diagram.png', mockDocument);

      const openCmd = vscodeMockState.executedCommands.find((c) => c.command === 'vscode.open');
      assert.ok(openCmd, 'should execute vscode.open for non-markdown files');
      assert.strictEqual(openCmd.args[0].fsPath, '/Users/adrian/Code/project/docs/diagram.png');
    });

    it('passes line selection when link contains line fragment: ./file.md#L42', async () => {
      vscodeMockState.existingFiles = new Set(['/Users/adrian/Code/project/docs/file.md']);

      await handleOpenLink('./file.md#L42', mockDocument);

      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith'
      );
      assert.ok(openWithCmd);
      const opts = openWithCmd.args[2];
      assert.ok(opts && opts.selection, 'should include selection range');
      assert.strictEqual(opts.selection.startLine, 41, '0-indexed line number for L42 should be 41');
    });

    it('opens external URL via vscode.env.openExternal', async () => {
      await handleOpenLink('https://example.com/guide', mockDocument);

      const extCmd = vscodeMockState.executedCommands.find((c) => c.command === 'env.openExternal');
      assert.ok(extCmd, 'should call env.openExternal');
      assert.strictEqual(extCmd.args[0].scheme, 'https');
    });

    it('opens mailto URL via vscode.env.openExternal', async () => {
      await handleOpenLink('mailto:support@example.com', mockDocument);

      const extCmd = vscodeMockState.executedCommands.find((c) => c.command === 'env.openExternal');
      assert.ok(extCmd, 'should call env.openExternal');
      assert.strictEqual(extCmd.args[0].scheme, 'mailto');
    });

    it('handles in-document anchor by messaging webview', async () => {
      let postedMessage: any = null;
      const mockPanel: any = {
        webview: {
          postMessage: async (msg: any) => {
            postedMessage = msg;
            return true;
          },
        },
      };

      await handleOpenLink('#my-section', mockDocument, mockPanel);

      assert.ok(postedMessage, 'should post message to webview');
      assert.strictEqual(postedMessage.type, 'scrollToAnchor');
      assert.strictEqual(postedMessage.anchor, '#my-section');
    });

    it('prompts user and creates file if file does not exist when confirmed', async () => {
      // Empty existingFiles set simulates non-existent file
      vscodeMockState.existingFiles = new Set();
      vscodeMockState.warningAnswer = t('Datei erstellen');

      await handleOpenLink('./new-notes.md', mockDocument);

      // Warning message should have been shown
      assert.strictEqual(vscodeMockState.warningMessages?.length, 1);
      assert.ok(
        vscodeMockState.warningMessages![0].msg.includes('new-notes.md'),
        'warning message should mention filename'
      );

      // File should have been created
      assert.strictEqual(vscodeMockState.writtenFiles?.length, 1);
      assert.strictEqual(
        vscodeMockState.writtenFiles![0].uri.fsPath,
        '/Users/adrian/Code/project/docs/new-notes.md'
      );

      // And then opened
      const openWithCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith'
      );
      assert.ok(openWithCmd);
    });

    it('does not create or open file if user cancels missing file prompt', async () => {
      vscodeMockState.existingFiles = new Set();
      vscodeMockState.warningAnswer = 'Abbrechen';

      await handleOpenLink('./cancelled.md', mockDocument);

      assert.strictEqual(vscodeMockState.writtenFiles?.length, 0);
      const openCmd = vscodeMockState.executedCommands.find(
        (c) => c.command === 'vscode.openWith' || c.command === 'vscode.open'
      );
      assert.strictEqual(openCmd, undefined, 'should not open file');
    });
  });

  describe('4. Webview In-Document Scrolling', () => {
    it('scrolls to element by ID', () => {
      const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="editor" class="editor-canvas"><p id="section-one">Section One Content</p></div></body></html>'
      );
      (globalThis as any).document = dom.window.document;
      let scrolled = false;
      const target = dom.window.document.getElementById('section-one')!;
      target.scrollIntoView = () => {
        scrolled = true;
      };

      const result = scrollToHeadingOrAnchor('#section-one');
      assert.strictEqual(result, true);
      assert.strictEqual(scrolled, true);
    });

    it('scrolls to heading by text slug', () => {
      const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="editor" class="editor-canvas"><h2>My Important Heading</h2></div></body></html>'
      );
      (globalThis as any).document = dom.window.document;
      let scrolled = false;
      const heading = dom.window.document.querySelector('h2')!;
      heading.scrollIntoView = () => {
        scrolled = true;
      };

      const result = scrollToHeadingOrAnchor('#my-important-heading');
      assert.strictEqual(result, true);
      assert.strictEqual(scrolled, true);
    });
  });

  describe('5. Webview Link Click Interactions', () => {
    let dom: JSDOM;
    let postedMessages: any[] = [];

    beforeEach(() => {
      postedMessages = [];
      dom = new JSDOM(
        '<!DOCTYPE html><html><body>' +
          '<div class="document-viewport">' +
            '<div class="document-container">' +
              '<div id="editor" class="editor-canvas" contenteditable="true">' +
                '<p><a href="./file.md" class="editor-link">File Link</a></p>' +
                '<h2 id="heading-two">Heading Two</h2>' +
                '<p><a href="#heading-two" class="editor-link">Anchor Link</a></p>' +
              '</div>' +
              '<div id="raw-wrapper" style="display:none;">' +
                '<textarea id="raw-textarea">[Raw Link](<./raw-file.md>)</textarea>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</body></html>'
      );
      (globalThis as any).window = dom.window;
      (globalThis as any).document = dom.window.document;
      (globalThis as any).HTMLElement = dom.window.HTMLElement;
      (globalThis as any).HTMLAnchorElement = dom.window.HTMLAnchorElement;

      // Intercept webview postMessage
      webviewVscode.postMessage = (msg: any) => {
        postedMessages.push(msg);
      };

      initMarkdownEditor();
    });

    it('clicking an <a> element inside canvas posts openLink message', () => {
      const link = dom.window.document.querySelector('a[href="./file.md"]')!;
      const clickEvent = new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      link.dispatchEvent(clickEvent);

      const openLinkMsg = postedMessages.find((m) => m.type === 'openLink');
      assert.ok(openLinkMsg, 'should have sent openLink message');
      assert.strictEqual(openLinkMsg.href, './file.md');
      assert.strictEqual(clickEvent.defaultPrevented, true);
    });

    it('clicking an in-document anchor scrolls without posting openLink', () => {
      let scrolled = false;
      const heading = dom.window.document.getElementById('heading-two')!;
      heading.scrollIntoView = () => {
        scrolled = true;
      };

      const anchor = dom.window.document.querySelector('a[href="#heading-two"]')!;
      const clickEvent = new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      anchor.dispatchEvent(clickEvent);

      const openLinkMsg = postedMessages.find((m) => m.type === 'openLink');
      assert.strictEqual(openLinkMsg, undefined, 'should not send openLink message for in-document anchor');
      assert.strictEqual(scrolled, true, 'should scroll to anchor heading');
    });

    it('Cmd/Ctrl clicking on a link in raw textarea posts openLink message', () => {
      const textarea = dom.window.document.getElementById('raw-textarea') as HTMLTextAreaElement;
      textarea.value = 'Check [Raw Link](<./raw-file.md>) here.';
      textarea.selectionStart = 10;
      textarea.selectionEnd = 10;

      const clickEvent = new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      });
      textarea.dispatchEvent(clickEvent);

      const openLinkMsg = postedMessages.find((m) => m.type === 'openLink');
      assert.ok(openLinkMsg, 'should have sent openLink message from raw textarea');
      assert.strictEqual(openLinkMsg.href, './raw-file.md');
    });
  });
});
