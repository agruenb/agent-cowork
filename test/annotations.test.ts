import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { safeDomToMarkdown } from '../src/markdown/serializer';
import { DocumentAnnotation, formatAnnotationsChatPrompt } from '../src/types/annotation';
import {
  getAnnotations,
  setAnnotations,
  deleteAnnotation,
  calculateTextSimilarity,
  wrapRangeWithAnnotation,
  unwrapAnnotationMarks,
  renderAllAnnotations,
  updateCoworkButtonWithAnnotations,
} from '../src/webview/annotations';
import { state, vscode } from '../src/webview/editorState';
import { setWebviewLanguage } from '../src/webview/i18n';

describe('Document Annotations Feature', () => {
  let dom: JSDOM;
  let window: Window;
  let document: Document;
  let editor: HTMLElement;
  let postedMessages: any[] = [];

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html>
<html lang="de">
<body>
  <div class="toolbar">
    <button id="btn-cowork"><span>Cowork</span></button>
  </div>
  <div class="document-viewport">
    <div class="document-container">
      <div id="editor" contenteditable="true"></div>
      <textarea id="raw-textarea" style="display: none;"></textarea>
    </div>
  </div>
  <button id="btn-selection-annotate" class="selection-annotate-btn" style="display: none;"><span>💬 Anmerkung</span></button>
  <button id="btn-selection-cowork" class="selection-cowork-btn" style="display: none;">Cowork</button>
</body>
</html>`,
      { url: 'http://localhost' }
    );

    window = dom.window as unknown as Window;
    document = dom.window.document;

    (globalThis as any).window = window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).Element = dom.window.Element;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
    (globalThis as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    (globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    editor = document.getElementById('editor')!;
    state.isRawMode = false;
    state.currentMarkdown = '';
    state.hasParseError = false;

    postedMessages = [];
    (vscode as any).postMessage = (msg: any) => {
      postedMessages.push(msg);
    };

    setWebviewLanguage('de');
    setAnnotations([]);
  });

  afterEach(() => {
    setAnnotations([]);
  });

  describe('Markdown Serializer Purity (Non-destructive to MD file)', () => {
    it('serializes text wrapped in mark.doc-annotation without leaking HTML tags into Markdown', () => {
      editor.innerHTML = '<p>Dies ist ein <mark class="doc-annotation" data-annotation-id="ann-1">wichtiger Textabschnitt</mark> im Dokument.</p>';
      const res = safeDomToMarkdown(editor);
      assert.strictEqual(res.markdown.trim(), 'Dies ist ein wichtiger Textabschnitt im Dokument.');
      assert.strictEqual(res.markdown.includes('<mark>'), false);
      assert.strictEqual(res.markdown.includes('doc-annotation'), false);
    });

    it('preserves bold and italic formatting inside annotations when serializing', () => {
      editor.innerHTML = '<p>Hier ist <mark class="doc-annotation" data-annotation-id="ann-2"><strong>fett</strong> und <em>kursiv</em></mark> hervorgehoben.</p>';
      const res = safeDomToMarkdown(editor);
      assert.strictEqual(res.markdown.trim(), 'Hier ist **fett** und *kursiv* hervorgehoben.');
    });

    it('completely ignores margin pills and popovers if present in DOM', () => {
      editor.innerHTML = '<p>Normaler Text <button class="annotation-margin-pill">💬</button></p><div class="annotation-popover">Test</div>';
      const res = safeDomToMarkdown(editor);
      assert.strictEqual(res.markdown.trim(), 'Normaler Text');
    });
  });

  describe('Text Anchoring & Robustness', () => {
    it('calculates text similarity correctly', () => {
      assert.strictEqual(calculateTextSimilarity('Hello World', 'Hello World'), 1.0);
      assert.strictEqual(calculateTextSimilarity('', ''), 1.0);
      assert.strictEqual(calculateTextSimilarity('abc', 'xyz'), 0.0);
      // Small typo: 1 char difference in 11 chars
      const sim = calculateTextSimilarity('Hello World', 'Hella World');
      assert.ok(sim > 0.85);
    });

    it('anchors annotations when surrounding content changes or lines increment', () => {
      editor.innerHTML = '<p>Einleitung</p><p>Das ist das Kernkonzept der Architektur.</p><p>Fazit</p>';
      const ann: DocumentAnnotation = {
        id: 'ann-concept',
        selectedText: 'Kernkonzept der Architektur',
        prefix: 'Das ist das ',
        suffix: '.',
        comment: 'Bitte vereinfachen',
        createdAt: Date.now(),
      };

      setAnnotations([ann]);

      const mark = editor.querySelector('mark.doc-annotation');
      assert.ok(mark, 'Mark should be created');
      assert.strictEqual(mark?.textContent, 'Kernkonzept der Architektur');

      // Now add 5 new paragraphs above (simulating lines being added or edited above)
      editor.innerHTML = '<p>Kapitel 0</p><p>Kapitel 0.1</p><p>Kapitel 0.2</p><p>Einleitung</p><p>Das ist das Kernkonzept der Architektur.</p><p>Fazit</p>';
      renderAllAnnotations();

      const markAfterShift = editor.querySelector('mark.doc-annotation');
      assert.ok(markAfterShift, 'Mark should still exist after line shifts');
      assert.strictEqual(markAfterShift?.textContent, 'Kernkonzept der Architektur');
      assert.strictEqual(getAnnotations().length, 1);
    });

    it('prunes annotation when the annotated text is deleted or changed drastically', () => {
      editor.innerHTML = '<p>Einleitung</p><p>Das ist das Kernkonzept der Architektur.</p>';
      const ann: DocumentAnnotation = {
        id: 'ann-concept',
        selectedText: 'Kernkonzept der Architektur',
        prefix: 'Das ist das ',
        suffix: '.',
        comment: 'Bitte vereinfachen',
        createdAt: Date.now(),
      };

      setAnnotations([ann]);
      assert.strictEqual(getAnnotations().length, 1);

      // Now completely delete or replace the text with something entirely different
      editor.innerHTML = '<p>Einleitung</p><p>Völlig anderer Inhalt ohne Bezug zum Vorherigen.</p>';
      renderAllAnnotations();

      // Annotation should be cleanly pruned
      assert.strictEqual(getAnnotations().length, 0);
      assert.strictEqual(editor.querySelectorAll('mark.doc-annotation').length, 0);
    });
  });

  describe('Margin Pills & Visual Feedback', () => {
    it('creates a margin pill for each active annotation in the document container', () => {
      editor.innerHTML = '<p>Einleitung mit <mark class="doc-annotation" data-annotation-id="ann-1">wichtigem Text</mark>.</p>';
      const ann: DocumentAnnotation = {
        id: 'ann-1',
        selectedText: 'wichtigem Text',
        prefix: '',
        suffix: '',
        comment: 'Wichtiger Hinweis',
        createdAt: Date.now(),
      };
      setAnnotations([ann]);

      const container = document.querySelector('.document-container')!;
      const pill = container.querySelector('.annotation-margin-pill') as HTMLElement;
      assert.ok(pill, 'Margin pill should be created');
      assert.strictEqual(pill.dataset.annotationId, 'ann-1');
      assert.strictEqual(pill.textContent, '💬');
    });

    it('deleting an annotation removes marks and margin pills', () => {
      editor.innerHTML = '<p>Einleitung mit <mark class="doc-annotation" data-annotation-id="ann-del">Text zum Löschen</mark>.</p>';
      const ann: DocumentAnnotation = {
        id: 'ann-del',
        selectedText: 'Text zum Löschen',
        prefix: '',
        suffix: '',
        comment: 'Soll gelöscht werden',
        createdAt: Date.now(),
      };
      setAnnotations([ann]);
      assert.strictEqual(getAnnotations().length, 1);

      deleteAnnotation('ann-del');
      assert.strictEqual(getAnnotations().length, 0);

      const mark = editor.querySelector('mark.doc-annotation');
      assert.strictEqual(mark, null, 'Mark element should be unwrapped');
      assert.strictEqual(editor.textContent?.includes('Text zum Löschen'), true, 'Inner text preserved');

      const pill = document.querySelector('.annotation-margin-pill');
      assert.strictEqual(pill, null, 'Margin pill should be removed');
    });
  });

  describe('Toolbar Cowork Button Merging ("Forward to Agent")', () => {
    it('displays standard Cowork label when 0 annotations exist', () => {
      setAnnotations([]);
      const btn = document.getElementById('btn-cowork')!;
      assert.strictEqual(btn.textContent?.trim(), 'Cowork');
      assert.strictEqual(btn.classList.contains('has-annotations'), false);
    });

    it('displays Forward to Agent (N) when annotations exist (German mode)', () => {
      setWebviewLanguage('de');
      editor.innerHTML = '<p>Hier ist ein test zum Prüfen.</p>';
      const ann: DocumentAnnotation = {
        id: 'ann-1',
        selectedText: 'test',
        prefix: 'ein ',
        suffix: ' zum',
        comment: 'notiz',
        createdAt: Date.now(),
      };
      setAnnotations([ann]);

      const btn = document.getElementById('btn-cowork')!;
      assert.strictEqual(btn.textContent?.trim(), 'An Agent weiterleiten (1)');
      assert.strictEqual(btn.classList.contains('has-annotations'), true);
    });

    it('displays Forward to Agent (N) when annotations exist (English mode)', () => {
      setWebviewLanguage('en');
      editor.innerHTML = '<p>Here is test 1 and test 2 for checking.</p>';
      const ann1: DocumentAnnotation = {
        id: 'ann-1',
        selectedText: 'test 1',
        prefix: 'is ',
        suffix: ' and',
        comment: 'note 1',
        createdAt: Date.now(),
      };
      const ann2: DocumentAnnotation = {
        id: 'ann-2',
        selectedText: 'test 2',
        prefix: 'and ',
        suffix: ' for',
        comment: 'note 2',
        createdAt: Date.now(),
      };
      setAnnotations([ann1, ann2]);

      const btn = document.getElementById('btn-cowork')!;
      assert.strictEqual(btn.textContent?.trim(), 'Forward to Agent (2)');
      assert.strictEqual(btn.classList.contains('has-annotations'), true);
    });
  });

  describe('Chat Prompt Formatting (No Custom Prompt, Clean Content)', () => {
    it('formats document and annotations cleanly without pre-baked assistant instructions', () => {
      const annotations: DocumentAnnotation[] = [
        {
          id: '1',
          selectedText: 'Budget 2026',
          prefix: '',
          suffix: '',
          comment: 'Zahlen auf 2027 anpassen',
          createdAt: Date.now(),
        },
        {
          id: '2',
          selectedText: 'Kapitel 3',
          prefix: '',
          suffix: '',
          comment: 'Beispiele hinzufügen',
          createdAt: Date.now(),
        },
      ];
      const markdown = '# Projektbericht\n\nDas Budget 2026 ist eingeplant.\n\nKapitel 3 folgt.';
      const prompt = formatAnnotationsChatPrompt('bericht.md', annotations, markdown);

      assert.ok(prompt.startsWith('# bericht.md\n\n## Annotations\n'));
      assert.ok(prompt.includes('1. **"Budget 2026"**: Zahlen auf 2027 anpassen'));
      assert.ok(prompt.includes('2. **"Kapitel 3"**: Beispiele hinzufügen'));
      assert.ok(prompt.includes('## Document\n\n# Projektbericht'));

      // Verify no assistant directives or commands are hardcoded
      assert.strictEqual(prompt.includes('Please edit'), false);
      assert.strictEqual(prompt.includes('Bitte überarbeite'), false);
      assert.strictEqual(prompt.includes('You are an assistant'), false);
    });

    it('formats document cleanly when no annotations exist', () => {
      const prompt = formatAnnotationsChatPrompt('empty.md', [], '# Einfacher Text');
      assert.strictEqual(prompt, '# empty.md\n\n## Document\n\n# Einfacher Text\n');
    });
  });
});
