import './vscodeMock';
import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  MarkdownEditorProvider,
  getOriginalContent,
  isChatSnapshotDocumentFor,
} from '../src/markdownEditorProvider';
import {
  vscodeMockState,
  resetVscodeMock,
  fireDidChangeTextDocument,
  fireDidCloseTextDocument,
  fireDidSaveTextDocument,
} from './vscodeMock';
import { initMarkdownEditor } from '../src/webview/markdownEditor';
import { vscode as webviewVscode, state } from '../src/webview/editorState';

function createMockDocument(initialText: string, filePath = '/workspace/notes.md') {
  let content = initialText;
  const uri = {
    scheme: 'file',
    path: filePath,
    fsPath: filePath,
    toString: () => `file://${filePath}`,
  };
  return {
    uri,
    isDirty: false,
    lineCount: content.split('\n').length,
    lineAt: (line: number) => ({
      range: {
        end: {
          character: (content.split('\n')[line] || '').length,
        },
      },
    }),
    eol: 1, // EndOfLine.LF
    getText: () => content,
    _setText: (newText: string) => {
      content = newText;
    },
    save: async () => {
      return true;
    },
  };
}

function createMockWebviewPanel() {
  const postedMessages: any[] = [];
  let messageHandler: ((msg: any) => any) | null = null;
  let viewStateListener: ((e: any) => any) | null = null;
  let disposeListener: (() => any) | null = null;

  return {
    postedMessages,
    visible: true,
    active: true,
    webview: {
      html: '',
      options: {},
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
        return true;
      },
      onDidReceiveMessage: (handler: (msg: any) => any) => {
        messageHandler = handler;
        return { dispose: () => {} };
      },
      asWebviewUri: (uri: any) => uri,
    },
    onDidChangeViewState: (listener: (e: any) => any) => {
      viewStateListener = listener;
      return { dispose: () => {} };
    },
    onDidDispose: (listener: () => any) => {
      disposeListener = listener;
      return { dispose: () => {} };
    },
    _receiveMessage: async (msg: any) => {
      if (messageHandler) await messageHandler(msg);
    },
    _fireViewState: (visible: boolean, active: boolean) => {
      if (viewStateListener) viewStateListener({ webviewPanel: { visible, active } });
    },
    _dispose: () => {
      if (disposeListener) disposeListener();
    },
  };
}

const mockContext = {
  extensionUri: { fsPath: '/ext', path: '/ext' },
  globalState: { get: () => undefined, update: async () => {} },
} as any;

describe('AI Diff Bug Fixes & Target Design Verifications', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  it('1. Undo after autosave does not set isReviewMode, and the webview receives update', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const doc = createMockDocument('Hello world');
    vscodeMockState.textDocuments = [doc];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    // User types edit
    await panel._receiveMessage({ type: 'edit', text: 'Hello world updated' });
    assert.strictEqual(doc.getText(), 'Hello world updated');

    panel.postedMessages.length = 0;

    // User presses Ctrl+Z (VS Code document Undo)
    doc._setText('Hello world');
    await fireDidChangeTextDocument({
      document: doc,
      contentChanges: [{ text: 'Hello world' }],
      reason: 1, // vscode.TextDocumentChangeReason.Undo
    });

    // Webview must receive 'update', NOT 'aiDiff'
    const aiDiffMsg = panel.postedMessages.find((m) => m.type === 'aiDiff');
    const updateMsg = panel.postedMessages.find((m) => m.type === 'update');

    assert.strictEqual(aiDiffMsg, undefined, 'Must not send aiDiff on Undo');
    assert.ok(updateMsg, 'Must send update message on Undo');
    assert.strictEqual(updateMsg.text, 'Hello world');

    panel._dispose();
  });

  it('2. An external change with no baseline sends update (catches the A2 regression)', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const doc = createMockDocument('Initial content');
    vscodeMockState.textDocuments = [doc];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });
    panel.postedMessages.length = 0;

    // External change (e.g. git pull, external formatter) with no chat snapshot
    doc._setText('External change content');
    await fireDidChangeTextDocument({
      document: doc,
      contentChanges: [{ text: 'External change content' }],
      reason: undefined,
    });

    const aiDiffMsg = panel.postedMessages.find((m) => m.type === 'aiDiff');
    const updateMsg = panel.postedMessages.find((m) => m.type === 'update');

    assert.strictEqual(aiDiffMsg, undefined, 'Must not send aiDiff for normal external changes');
    assert.ok(updateMsg, 'Must send update message for external changes');
    assert.strictEqual(updateMsg.text, 'External change content');

    panel._dispose();
  });

  it('3. When the chat snapshot document closes or matches current text, clearAiDiff is sent', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/test.md';
    const doc = createMockDocument('AI modified version', docPath);
    const snapshotDoc = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        toString: () => `chat-editing-snapshot-text-model://${docPath}`,
      },
      getText: () => 'Original pre-AI version',
    };

    vscodeMockState.textDocuments = [doc, snapshotDoc];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    // Review mode should have been triggered with aiDiff
    const aiDiffMsg = panel.postedMessages.find((m) => m.type === 'aiDiff');
    assert.ok(aiDiffMsg, 'Must start in aiDiff review mode when chat snapshot exists');
    assert.strictEqual(aiDiffMsg.originalText, 'Original pre-AI version');
    assert.strictEqual(aiDiffMsg.currentText, 'AI modified version');

    panel.postedMessages.length = 0;

    // User accepts or rejects in chat: snapshot document closes
    vscodeMockState.textDocuments = [doc];
    await fireDidCloseTextDocument(snapshotDoc);

    const clearMsg = panel.postedMessages.find((m) => m.type === 'clearAiDiff');
    assert.ok(clearMsg, 'Must send clearAiDiff when chat snapshot document closes');
    assert.strictEqual(clearMsg.text, 'AI modified version');

    panel._dispose();
  });

  it('4. Reject never reverts to Git HEAD; it uses the stored baseline only', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/test.md';
    const doc = createMockDocument('User baseline work', docPath);
    vscodeMockState.textDocuments = [doc];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    // Now AI makes an edit with a chat snapshot
    const snapshotDoc = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        toString: () => `chat-editing-snapshot-text-model://${docPath}`,
      },
      getText: () => 'User baseline work',
    };
    vscodeMockState.textDocuments = [doc, snapshotDoc];
    doc._setText('AI destructive rewrite');

    await fireDidChangeTextDocument({
      document: doc,
      contentChanges: [{ text: 'AI destructive rewrite' }],
      reason: undefined,
    });

    panel.postedMessages.length = 0;

    // Reject in editor
    await panel._receiveMessage({ type: 'rejectAiEdits' });

    // Document must be reverted to stored baseline 'User baseline work'
    assert.strictEqual(doc.getText(), 'User baseline work');

    const clearMsg = panel.postedMessages.find((m) => m.type === 'clearAiDiff');
    assert.ok(clearMsg);
    assert.strictEqual(clearMsg.text, 'User baseline work');

    panel._dispose();
  });

  it('5. Reject applies at most one WorkspaceEdit when the discard command already reverted the file', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/test.md';
    const doc = createMockDocument('User baseline text', docPath);
    const snapshotDoc = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        toString: () => `chat-editing-snapshot-text-model://${docPath}`,
      },
      getText: () => 'User baseline text',
    };
    vscodeMockState.textDocuments = [doc, snapshotDoc];
    doc._setText('AI edit to be discarded');

    const panel = createMockWebviewPanel();
    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    // Configure available command that automatically reverts the document
    vscodeMockState.availableCommands = ['chatEditing.discardFile'];
    vscodeMockState.commandHandlers = {
      'chatEditing.discardFile': async () => {
        doc._setText('User baseline text'); // Already reverted by VS Code!
      },
    };

    vscodeMockState.appliedEdits = [];

    await panel._receiveMessage({ type: 'rejectAiEdits' });

    // Since chatEditing.discardFile already reverted the text, no extra WorkspaceEdit should be applied
    assert.strictEqual(
      vscodeMockState.appliedEdits?.length,
      0,
      'Must not apply a redundant WorkspaceEdit when discard command already reverted the file'
    );
    assert.strictEqual(doc.getText(), 'User baseline text');

    panel._dispose();
  });

  it('6. Switching tab visibility does not create a diff for a file that has uncommitted git changes', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/test.md';
    // Document with uncommitted changes
    const doc = createMockDocument('Uncommitted changes in git repository', docPath);
    vscodeMockState.textDocuments = [doc];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    panel.postedMessages.length = 0;

    // Simulate switching tabs away and back (visible becomes true)
    panel._fireViewState(true, true);

    const aiDiffMsg = panel.postedMessages.find((m) => m.type === 'aiDiff');
    assert.strictEqual(aiDiffMsg, undefined, 'Switching tab visibility must not trigger an AI diff');

    panel._dispose();
  });

  it('7. Webview: beforeinput with historyUndo is prevented and posts undo', () => {
    const dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <div id="ai-edits-panel" style="display: none;"></div>
    <button id="btn-toggle-raw">Raw</button>
  </div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" class="editor-canvas" contenteditable="true"></div>
      <div id="raw-wrapper" style="display: none;">
        <div id="raw-gutter"></div>
        <textarea id="raw-textarea"></textarea>
        <div id="raw-mirror"></div>
      </div>
    </div>
  </div>
</body>
</html>`);

    const document = dom.window.document;
    const window = dom.window as unknown as Window;
    (global as any).document = document;
    (global as any).window = window;

    const postedWebviewMessages: any[] = [];
    (webviewVscode as any).postMessage = (msg: any) => {
      postedWebviewMessages.push(msg);
    };

    initMarkdownEditor();

    const canvas = document.getElementById('editor') as HTMLElement;
    const textarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;

    // Test canvas historyUndo
    const undoEvent = new dom.window.InputEvent('beforeinput', {
      inputType: 'historyUndo',
      cancelable: true,
      bubbles: true,
    });
    canvas.dispatchEvent(undoEvent);

    assert.strictEqual(undoEvent.defaultPrevented, true, 'Canvas historyUndo must prevent default');
    assert.ok(
      postedWebviewMessages.some((m) => m.type === 'undo'),
      'Must post undo message to host'
    );

    // Test textarea historyRedo
    const redoEvent = new dom.window.InputEvent('beforeinput', {
      inputType: 'historyRedo',
      cancelable: true,
      bubbles: true,
    });
    textarea.dispatchEvent(redoEvent);

    assert.strictEqual(redoEvent.defaultPrevented, true, 'Textarea historyRedo must prevent default');
    assert.ok(
      postedWebviewMessages.some((m) => m.type === 'redo'),
      'Must post redo message to host'
    );

    delete (global as any).document;
    delete (global as any).window;
  });

  it('8. AI edits in File A only trigger diff in File A, not in File B', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const pathA = '/workspace/fileA.md';
    const pathB = '/workspace/fileB.md';

    const docA = createMockDocument('File A content', pathA);
    const docB = createMockDocument('File B untouched content', pathB);

    // Snapshot document exists ONLY for file A
    const snapshotA = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: pathA,
        fsPath: pathA,
        toString: () => `chat-editing-snapshot-text-model://${pathA}`,
      },
      getText: () => 'File A original',
    };

    vscodeMockState.textDocuments = [docA, docB, snapshotA];

    const panelA = createMockWebviewPanel();
    const panelB = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(docA as any, panelA as any, {} as any);
    await panelA._receiveMessage({ type: 'ready' });

    await provider.resolveCustomTextEditor(docB as any, panelB as any, {} as any);
    await panelB._receiveMessage({ type: 'ready' });

    // Panel A must receive aiDiff
    const aiDiffA = panelA.postedMessages.find((m) => m.type === 'aiDiff');
    assert.ok(aiDiffA, 'Panel A must receive aiDiff since File A was edited');
    assert.strictEqual(aiDiffA.originalText, 'File A original');

    // Panel B must NOT receive aiDiff, but should receive clearAiDiff
    const aiDiffB = panelB.postedMessages.find((m) => m.type === 'aiDiff');
    const clearAiDiffB = panelB.postedMessages.find((m) => m.type === 'clearAiDiff');
    assert.strictEqual(aiDiffB, undefined, 'Panel B must NOT receive aiDiff when edits were done in File A');
    assert.ok(clearAiDiffB, 'Panel B must receive clearAiDiff to ensure panel is hidden');

    panelA._dispose();
    panelB._dispose();
  });

  it('9. CRLF line endings in document vs LF in snapshot do not trigger a false AI diff', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/crlf.md';
    const crlfText = 'Line 1\r\nLine 2\r\nLine 3';
    const lfText = 'Line 1\nLine 2\nLine 3';

    const doc = createMockDocument(crlfText, docPath);
    const snapshotDoc = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        toString: () => `chat-editing-snapshot-text-model://${docPath}`,
      },
      getText: () => lfText,
    };

    vscodeMockState.textDocuments = [doc, snapshotDoc];

    // getOriginalContent should recognize the texts are identical except for line endings
    const original = await getOriginalContent(doc as any);
    assert.strictEqual(original, null, 'Must return null when content only differs by line endings');

    const panel = createMockWebviewPanel();
    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    const aiDiffMsg = panel.postedMessages.find((m) => m.type === 'aiDiff');
    assert.strictEqual(aiDiffMsg, undefined, 'Must not send aiDiff for CRLF vs LF differences');

    panel._dispose();
  });

  it('10. Webview init without originalText clears review mode and hides the AI edits panel', () => {
    const dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="toolbar">
    <div id="ai-edits-panel" class="ai-edits-panel" style="display: flex;">
      <span id="ai-stat-add">+5</span>
      <span id="ai-stat-del">-2</span>
      <button id="btn-ai-accept">Accept</button>
      <button id="btn-ai-reject">Reject</button>
    </div>
    <button id="btn-toggle-raw">Raw</button>
  </div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" class="editor-canvas is-review-mode" contenteditable="false"></div>
      <div id="raw-wrapper" style="display: none;">
        <div id="raw-gutter"></div>
        <textarea id="raw-textarea"></textarea>
        <div id="raw-mirror"></div>
      </div>
    </div>
  </div>
</body>
</html>`);

    const document = dom.window.document;
    const window = dom.window as unknown as Window;
    (global as any).document = document;
    (global as any).window = window;

    initMarkdownEditor();

    // Manually set review mode to simulate previous file in review mode
    state.isReviewMode = true;
    state.aiOriginalText = 'Old file diff text';
    state.activeFilename = 'fileA.md';
    const panel = document.getElementById('ai-edits-panel') as HTMLElement;
    panel.style.display = 'flex';

    // Simulate receiving 'init' message from host for fileB.md with NO originalText
    const initEvent = new dom.window.MessageEvent('message', {
      data: {
        type: 'init',
        text: '# File B normal content',
        filename: 'fileB.md',
        language: 'en',
      },
    });
    window.dispatchEvent(initEvent);

    // AI edits panel must now be hidden
    assert.strictEqual(panel.style.display, 'none', 'AI edits panel must be hidden for file with no AI edits');
    assert.strictEqual(state.isReviewMode, false, 'isReviewMode must be false');
    assert.strictEqual(state.activeFilename, 'fileB.md', 'activeFilename must be updated');

    delete (global as any).document;
    delete (global as any).window;
  });

  it('11. Multi-turn AI chat edit sequence picks the oldest checkpoint snapshot as initial baseline', async () => {
    const docPath = '/workspace/multiturn.md';
    const text0 = 'Original line 1\nOriginal line 2\nOriginal line 3';
    const text1 = 'Modified line 1\nOriginal line 2\nOriginal line 3';
    const text2 = 'Modified line 1\nModified line 2\nOriginal line 3';

    const doc = createMockDocument(text2, docPath);

    // Snapshot 1 (epoch 10): content before Turn 1 (text0)
    const snapshot1 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r1', undoStop: '__epoch_10' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?10`,
      },
      getText: () => text0,
    };

    // Snapshot 2 (epoch 20): content before Turn 2 (text1)
    const snapshot2 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r2', undoStop: '__epoch_20' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?20`,
      },
      getText: () => text1,
    };

    // Even if snapshot2 appears earlier in the array, the oldest snapshot (epoch 10) must be picked
    vscodeMockState.textDocuments = [doc, snapshot2, snapshot1];

    const detected = await getOriginalContent(doc as any);
    assert.strictEqual(detected, text0, 'Must select the oldest snapshot (epoch 10) as session baseline');
  });

  it('12. Accepting in AI chat updates chat-editing-text-model to current text, immediately clearing diff even with checkpoint snapshots open', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/multiturn.md';
    const text0 = 'Pre-AI initial content';
    const text1 = 'Turn 1 content';
    const text2 = 'Turn 2 final content';

    const doc = createMockDocument(text2, docPath);

    // Active session model with pending pre-AI content
    const sessionModel = {
      uri: {
        scheme: 'chat-editing-text-model',
        path: docPath,
        fsPath: docPath,
        toString: () => `chat-editing-text-model://${docPath}`,
      },
      getText: () => text0,
      _setText: (t: string) => {
        (sessionModel as any)._content = t;
      },
      _content: text0,
    };
    (sessionModel as any).getText = () => (sessionModel as any)._content;

    // Checkpoint snapshots lingering in memory
    const checkpoint1 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r1', undoStop: '__epoch_1' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?1`,
      },
      getText: () => text0,
    };
    const checkpoint2 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r2', undoStop: '__epoch_2' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?2`,
      },
      getText: () => text1,
    };

    vscodeMockState.textDocuments = [doc, sessionModel, checkpoint1, checkpoint2];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    // Initial review mode diff must compare baseline text0 with current text2
    const initialAiDiff = panel.postedMessages.find((m) => m.type === 'aiDiff');
    assert.ok(initialAiDiff, 'Must send aiDiff on initial load');
    assert.strictEqual(initialAiDiff.originalText, text0);
    assert.strictEqual(initialAiDiff.currentText, text2);

    panel.postedMessages.length = 0;

    // User clicks "Accept" in AI chat:
    // VS Code calls keep(), which updates sessionModel to match doc text2, and fires onDidChangeTextDocument
    sessionModel._setText(text2);
    await fireDidChangeTextDocument({
      document: sessionModel as any,
      contentChanges: [{ text: text2 }],
      reason: undefined,
    });

    // The editor must receive clearAiDiff, NOT an updated aiDiff with checkpoint2
    const clearMsg = panel.postedMessages.find((m) => m.type === 'clearAiDiff');
    const lingeringDiff = panel.postedMessages.find((m) => m.type === 'aiDiff');

    assert.ok(clearMsg, 'Must immediately clear diff when session model is accepted');
    assert.strictEqual(clearMsg.text, text2);
    assert.strictEqual(lingeringDiff, undefined, 'Must NOT post partial lingering diff on accept');

    panel._dispose();
  });

  it('13. Closing an intermediate snapshot does not advance baseline to a later turn while review is active', async () => {
    const provider = new MarkdownEditorProvider(mockContext);
    const docPath = '/workspace/turns.md';
    const text0 = 'Base 0';
    const text1 = 'Turn 1 edit';
    const text2 = 'Turn 2 edit';

    const doc = createMockDocument(text2, docPath);

    const snapshot1 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r1', undoStop: '__epoch_1' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?1`,
      },
      getText: () => text0,
    };
    const snapshot2 = {
      uri: {
        scheme: 'chat-editing-snapshot-text-model',
        path: docPath,
        fsPath: docPath,
        query: JSON.stringify({ session: 's1', requestId: 'r2', undoStop: '__epoch_2' }),
        toString: () => `chat-editing-snapshot-text-model://${docPath}?2`,
      },
      getText: () => text1,
    };

    vscodeMockState.textDocuments = [doc, snapshot1, snapshot2];
    const panel = createMockWebviewPanel();

    await provider.resolveCustomTextEditor(doc as any, panel as any, {} as any);
    await panel._receiveMessage({ type: 'ready' });

    panel.postedMessages.length = 0;

    // Snapshot 1 is closed
    vscodeMockState.textDocuments = [doc, snapshot2];
    await fireDidCloseTextDocument(snapshot1 as any);

    // Provider must NOT send aiDiff with originalText = text1 (which would have accepted turn 1 only!)
    const partialDiff = panel.postedMessages.find(
      (m) => m.type === 'aiDiff' && m.originalText === text1
    );
    assert.strictEqual(
      partialDiff,
      undefined,
      'Must not advance baseline to intermediate snapshot when an older snapshot closes'
    );

    panel._dispose();
  });
});
