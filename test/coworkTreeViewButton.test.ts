import assert from 'assert';
import { JSDOM } from 'jsdom';
import { resetVscodeMock } from './vscodeMock';
import { MarkdownEditorProvider } from '../src/markdownEditorProvider';
import {
  setCoworkTreeButtonVisible,
  handleWindowMessage,
} from '../src/webview/markdownEditor';

describe('Cowork Tree View Floating Button', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let postedMessages: any[] = [];

  beforeEach(() => {
    resetVscodeMock();
    postedMessages = [];

    dom = new JSDOM(`<!DOCTYPE html>
<html lang="de">
<head><title>Editor</title></head>
<body>
  <div class="app-container">
    <button id="btn-show-cowork-tree" class="show-cowork-tree-btn" tabindex="-1" title="Arbeitsordner anzeigen" aria-label="Arbeitsordner anzeigen">
      <svg class="tree-toggle-icon" width="15" height="15" viewBox="0 0 16 16" fill="currentColor"></svg>
      <svg class="tree-arrow-icon" width="9" height="9" viewBox="0 0 16 16" fill="currentColor"></svg>
    </button>
    <div id="editor" contenteditable="true"></div>
    <textarea id="raw-textarea" style="display: none;"></textarea>
  </div>
</body>
</html>`);

    document = dom.window.document;
    window = dom.window as unknown as Window;

    (global as any).document = document;
    (global as any).window = window;
    (global as any).acquireVsCodeApi = () => ({
      postMessage: (msg: any) => postedMessages.push(msg),
      setState: () => {},
      getState: () => ({}),
    });
  });

  afterEach(() => {
    delete (global as any).document;
    delete (global as any).window;
    delete (global as any).acquireVsCodeApi;
  });

  describe('MarkdownEditorProvider tree view tracking', () => {
    it('tracks tree view visibility statically', () => {
      MarkdownEditorProvider.setTreeViewVisible(false);
      assert.strictEqual(MarkdownEditorProvider.isTreeViewVisible(), false);

      MarkdownEditorProvider.setTreeViewVisible(true);
      assert.strictEqual(MarkdownEditorProvider.isTreeViewVisible(), true);
    });
  });

  describe('setCoworkTreeButtonVisible', () => {
    it('adds is-visible class when visible is true', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;
      assert.strictEqual(btn.classList.contains('is-visible'), false);

      setCoworkTreeButtonVisible(true);
      assert.strictEqual(btn.classList.contains('is-visible'), true);
    });

    it('removes is-visible class when visible is false', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;
      btn.classList.add('is-visible');

      setCoworkTreeButtonVisible(false);
      assert.strictEqual(btn.classList.contains('is-visible'), false);
    });
  });

  describe('handleWindowMessage for tree view visibility', () => {
    it('shows button on init if treeViewVisible is false', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;
      assert.strictEqual(btn.classList.contains('is-visible'), false);

      handleWindowMessage({
        data: {
          type: 'init',
          text: '# Hello',
          treeViewVisible: false,
        },
      } as MessageEvent);

      assert.strictEqual(btn.classList.contains('is-visible'), true);
    });

    it('keeps button hidden on init if treeViewVisible is true', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;

      handleWindowMessage({
        data: {
          type: 'init',
          text: '# Hello',
          treeViewVisible: true,
        },
      } as MessageEvent);

      assert.strictEqual(btn.classList.contains('is-visible'), false);
    });

    it('updates button visibility dynamically via treeViewVisibility message', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;

      // Tree view is closed -> button appears
      handleWindowMessage({
        data: {
          type: 'treeViewVisibility',
          visible: false,
        },
      } as MessageEvent);
      assert.strictEqual(btn.classList.contains('is-visible'), true);

      // Tree view is opened -> button hides
      handleWindowMessage({
        data: {
          type: 'treeViewVisibility',
          visible: true,
        },
      } as MessageEvent);
      assert.strictEqual(btn.classList.contains('is-visible'), false);
    });
  });

  describe('User click interaction', () => {
    it('sends openCoworkView message when clicked', () => {
      const btn = document.getElementById('btn-show-cowork-tree')!;
      let clicked = false;
      const vsApi = (global as any).acquireVsCodeApi();

      btn.addEventListener('click', () => {
        clicked = true;
        vsApi.postMessage({ type: 'openCoworkView' });
      });

      btn.click();
      assert.strictEqual(clicked, true);
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'openCoworkView' });
    });
  });
});
