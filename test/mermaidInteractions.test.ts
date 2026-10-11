import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';
import {
  wireMermaidControls,
  updateMermaidBlocks,
  updateMermaidLanguage,
  applyDiagramTransform,
  resetDiagramZoom,
  zoomDiagramAt,
} from '../src/webview/mermaidControls';
import { wireCodeBlockCopy, copyToClipboard } from '../src/webview/codeCopy';
import { handleCanvasKeyDown } from '../src/webview/markdownEditor';
import { setWebviewLanguage } from '../src/webview/i18n';
import { getMermaidSvgStyles } from '../src/mermaid/theme';

describe('Mermaid Code Block Interactions & Default Rendering', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let editor: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html lang="de">
<body>
  <div id="editor" contenteditable="true"></div>
</body>
</html>`);
    document = dom.window.document;
    window = dom.window as unknown as Window;
    editor = document.getElementById('editor')!;

    (globalThis as any).window = window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
    (globalThis as any).MouseEvent = dom.window.MouseEvent;

    setWebviewLanguage('de');
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).Node;
    delete (globalThis as any).HTMLElement;
    delete (globalThis as any).HTMLInputElement;
    delete (globalThis as any).MouseEvent;
    setWebviewLanguage('de');
  });

  describe('Default Diagram Rendering in Code Blocks', () => {
    it('renders mermaid diagrams per default with diagram preview visible and pre hidden', () => {
      const md = '```mermaid\ngraph TD\n  Start[Begin] --> Finish[Done]\n```';
      editor.innerHTML = markdownToHtml(md);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      assert.ok(wrapper, 'Wrapper exists');
      assert.ok(wrapper.classList.contains('is-mermaid-block'), 'Has is-mermaid-block class');
      assert.strictEqual(wrapper.getAttribute('data-view'), 'diagram', 'Default view is diagram');

      const preview = wrapper.querySelector('.mermaid-preview') as HTMLElement;
      assert.ok(preview, 'Mermaid preview container is rendered');
      assert.ok(preview.querySelector('svg.mermaid-svg'), 'SVG diagram is rendered inside preview');
      assert.ok(preview.innerHTML.includes('Begin'), 'Contains rendered node text');
      assert.ok(preview.innerHTML.includes('Done'), 'Contains rendered node text');

      const pre = wrapper.querySelector('pre') as HTMLElement;
      assert.ok(pre, 'pre element exists');
      assert.strictEqual(pre.style.display, 'none', 'pre element is hidden per default');

      const codeEl = wrapper.querySelector('code.editor-code') as HTMLElement;
      assert.ok(codeEl, 'Code element exists with raw text');
      assert.ok(codeEl.textContent?.includes('Start[Begin] --> Finish[Done]'));
    });

    it('renders toggle button next to the copy button in code block header', () => {
      const md = '```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```';
      editor.innerHTML = markdownToHtml(md);

      const header = editor.querySelector('.code-block-header') as HTMLElement;
      assert.ok(header);

      const toggleBtn = header.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      const copyBtn = header.querySelector('.code-copy-btn') as HTMLButtonElement;

      assert.ok(toggleBtn, 'Toggle button is rendered');
      assert.ok(copyBtn, 'Copy button is rendered');
      assert.strictEqual(toggleBtn.nextElementSibling, copyBtn, 'Toggle button is directly next to copy button');
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Code anzeigen', 'Default title in German mode is Code anzeigen');
      assert.strictEqual(toggleBtn.getAttribute('data-view'), 'diagram', 'data-view attribute is diagram');
    });

    it('does not render toggle button or diagram preview for non-mermaid code blocks', () => {
      const md = '```python\nprint("hello")\n```';
      editor.innerHTML = markdownToHtml(md);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      assert.ok(wrapper);
      assert.ok(!wrapper.classList.contains('is-mermaid-block'));
      assert.strictEqual(wrapper.querySelector('.mermaid-preview'), null);
      assert.strictEqual(wrapper.querySelector('.code-toggle-view-btn'), null);

      const pre = wrapper.querySelector('pre') as HTMLElement;
      assert.notStrictEqual(pre.style.display, 'none', 'pre is visible for regular code blocks');
    });
  });

  describe('Toggle between Diagram and Code View', () => {
    it('clicking toggle button switches from diagram view to code view and back', () => {
      const md = '```mermaid\ngraph LR\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      const toggleBtn = wrapper.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      const preview = wrapper.querySelector('.mermaid-preview') as HTMLElement;
      const pre = wrapper.querySelector('pre') as HTMLElement;

      // Initial state: diagram view
      assert.strictEqual(wrapper.getAttribute('data-view'), 'diagram');
      assert.strictEqual(pre.style.display, 'none');

      // Click to toggle to code view
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      assert.strictEqual(wrapper.getAttribute('data-view'), 'code', 'View switched to code');
      assert.strictEqual(pre.style.display, 'block', 'pre is now visible');
      assert.strictEqual(preview.style.display, 'none', 'preview is now hidden');
      assert.ok(toggleBtn.classList.contains('is-showing-code'), 'Button has is-showing-code class');
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Diagramm anzeigen', 'Button title updated to Diagramm anzeigen');
      assert.ok(toggleBtn.querySelector('svg.diagram-toggle-icon'), 'Displays diagram-toggle-icon SVG when in code view to switch to rendered mode');

      // Click again to toggle back to diagram view
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      assert.strictEqual(wrapper.getAttribute('data-view'), 'diagram', 'View switched back to diagram');
      assert.strictEqual(pre.style.display, 'none', 'pre is hidden again');
      assert.strictEqual(preview.style.display, 'flex', 'preview is visible again');
      assert.ok(!toggleBtn.classList.contains('is-showing-code'));
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Code anzeigen');
      assert.ok(toggleBtn.querySelector('svg.code-toggle-icon'), 'Displays code-toggle-icon SVG when in diagram view');
    });

    it('re-renders updated diagram when code is edited in code view and toggled back', () => {
      const md = '```mermaid\ngraph TD\n  OldNode[Old Text]\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      const toggleBtn = wrapper.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      const preview = wrapper.querySelector('.mermaid-preview') as HTMLElement;
      const codeEl = wrapper.querySelector('code.editor-code') as HTMLElement;

      // Switch to code view
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      // Simulate user editing the code
      codeEl.textContent = 'graph TD\n  NewNode[Updated Diagram Content]';

      // Switch back to diagram view
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      assert.strictEqual(wrapper.getAttribute('data-view'), 'diagram');
      assert.ok(preview.innerHTML.includes('Updated Diagram Content'), 'Preview reflects edited code');
      assert.ok(preview.innerHTML.includes('id="node-NewNode"'), 'New node was rendered');
    });

    it('displays graceful syntax error banner inside preview when invalid mermaid code is given', () => {
      const md = '```mermaid\ninvalid syntax without any diagram\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      assert.ok(preview);
      assert.ok(preview.querySelector('.mermaid-error-card'), 'Renders error card');
      assert.ok(preview.innerHTML.includes('Mermaid Syntaxfehler'));
    });
  });

  describe('Copy Button Integration', () => {
    it('copy button copies code block text while in diagram view', async () => {
      let clipboardText = '';
      const clipboardMock = {
        writeText: async (text: string) => {
          clipboardText = text;
        },
      };
      try {
        Object.defineProperty(dom.window.navigator, 'clipboard', {
          value: clipboardMock,
          configurable: true,
          writable: true,
        });
      } catch {
        (dom.window as any).navigator = { clipboard: clipboardMock };
      }
      try {
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: clipboardMock,
          configurable: true,
          writable: true,
        });
      } catch {
        // Ignored
      }

      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireCodeBlockCopy(editor);

      const copyBtn = editor.querySelector('.code-copy-btn') as HTMLButtonElement;
      assert.ok(copyBtn);

      copyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));

      assert.ok(clipboardText.includes('graph TD\n  A --> B'));
    });
  });

  describe('Dynamic Language Input Switching', () => {
    it('activates mermaid diagram and toggle when language input changes to mermaid', () => {
      const md = '```text\ngraph TD\n  Step1 --> Step2\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      const langInput = wrapper.querySelector('input.code-lang-input') as HTMLInputElement;

      assert.ok(!wrapper.classList.contains('is-mermaid-block'));
      assert.strictEqual(wrapper.querySelector('.code-toggle-view-btn'), null);

      // User types mermaid into language input
      langInput.value = 'mermaid';
      langInput.dispatchEvent(new (dom.window as any).Event('input', { bubbles: true }));

      assert.ok(wrapper.classList.contains('is-mermaid-block'), 'Wrapper activated as mermaid block');
      assert.ok(wrapper.querySelector('.code-toggle-view-btn'), 'Toggle button was added');
      assert.ok(wrapper.querySelector('.mermaid-preview'), 'Mermaid preview was created and rendered');
      assert.strictEqual(wrapper.querySelector('pre')?.style.display, 'none', 'pre is hidden');
    });

    it('deactivates mermaid diagram and removes toggle when language input changes away from mermaid', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      const langInput = wrapper.querySelector('input.code-lang-input') as HTMLInputElement;

      assert.ok(wrapper.classList.contains('is-mermaid-block'));

      // User changes language to python
      langInput.value = 'python';
      langInput.dispatchEvent(new (dom.window as any).Event('input', { bubbles: true }));

      assert.ok(!wrapper.classList.contains('is-mermaid-block'), 'Mermaid block deactivated');
      assert.strictEqual(wrapper.querySelector('.code-toggle-view-btn'), null, 'Toggle button removed');
      assert.strictEqual(wrapper.querySelector('.mermaid-preview'), null, 'Preview removed');
      assert.strictEqual(wrapper.querySelector('pre')?.style.display, 'block', 'pre is restored to visible');
    });
  });

  describe('Keyboard Handling in Language Input', () => {
    it('switches diagram view to code view when pressing Enter or Tab in code-lang-input', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const wrapper = editor.querySelector('.code-block-wrapper') as HTMLElement;
      const langInput = wrapper.querySelector('input.code-lang-input') as HTMLInputElement;
      const pre = wrapper.querySelector('pre') as HTMLElement;

      assert.strictEqual(wrapper.getAttribute('data-view'), 'diagram');

      let defaultPrevented = false;
      const enterEvent = {
        key: 'Enter',
        target: langInput,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as KeyboardEvent;

      handleCanvasKeyDown(enterEvent);

      assert.strictEqual(defaultPrevented, true);
      assert.strictEqual(wrapper.getAttribute('data-view'), 'code', 'Switched to code view on Enter');
      assert.strictEqual(pre.style.display, 'block');
    });
  });

  describe('Serializer Roundtrip Stability', () => {
    it('domToMarkdown serializes mermaid code block accurately back to original markdown', () => {
      const originalMd = '```mermaid\ngraph TD\n  Start[Start] --> End[Finish]\n```';
      editor.innerHTML = markdownToHtml(originalMd);
      wireMermaidControls(editor);

      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, originalMd);
    });

    it('roundtrips after toggling to code view and back', () => {
      const originalMd = '```mermaid\nsequenceDiagram\n  A->>B: Ping\n```';
      editor.innerHTML = markdownToHtml(originalMd);
      wireMermaidControls(editor);

      const toggleBtn = editor.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      // Toggle to code
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      // Toggle to diagram
      toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      const serialized = domToMarkdown(editor).trim();
      assert.strictEqual(serialized, originalMd);
    });
  });

  describe('Localization and Language Switching', () => {
    it('uses English labels for toggle button in English mode', () => {
      setWebviewLanguage('en');
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md, 'en');

      const toggleBtn = editor.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Show code');
    });

    it('updates toggle button labels dynamically when language changes', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md, 'de');

      const toggleBtn = editor.querySelector('.code-toggle-view-btn') as HTMLButtonElement;
      assert.strictEqual(toggleBtn.getAttribute('title'), 'Code anzeigen');

      // Switch language to en
      setWebviewLanguage('en');
      updateMermaidLanguage(editor);

      assert.strictEqual(toggleBtn.getAttribute('title'), 'Show code');
    });

    it('updates zoom toolbar button titles dynamically when language changes', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md, 'de');

      const zoomInBtn = editor.querySelector('.mermaid-zoom-in') as HTMLButtonElement;
      const zoomOutBtn = editor.querySelector('.mermaid-zoom-out') as HTMLButtonElement;
      const resetBtn = editor.querySelector('.mermaid-zoom-reset') as HTMLButtonElement;

      assert.strictEqual(zoomInBtn.getAttribute('title'), 'Vergrößern');
      assert.strictEqual(zoomOutBtn.getAttribute('title'), 'Verkleinern');
      assert.strictEqual(resetBtn.getAttribute('title'), 'Zoom zurücksetzen');

      // Switch language to en
      setWebviewLanguage('en');
      updateMermaidLanguage(editor);

      assert.strictEqual(zoomInBtn.getAttribute('title'), 'Zoom in');
      assert.strictEqual(zoomOutBtn.getAttribute('title'), 'Zoom out');
      assert.strictEqual(resetBtn.getAttribute('title'), 'Reset zoom');
    });
  });

  describe('No Hover Effects on Diagram Elements', () => {
    it('does not contain hover rules on diagram nodes or elements in SVG styles', () => {
      const styles = getMermaidSvgStyles();
      assert.ok(!styles.includes('.mermaid-node:hover'), 'No .mermaid-node:hover rule in SVG styles');
      assert.ok(!styles.includes(':hover'), 'Zero :hover selectors in embedded SVG styles');
    });
  });

  describe('Diagram Zoom and Pan Interactions', () => {
    it('renders viewport wrapper and floating zoom toolbar in diagram preview', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      assert.ok(preview);

      const viewport = preview.querySelector('.mermaid-viewport') as HTMLElement;
      assert.ok(viewport, 'Viewport container is rendered');
      assert.ok(viewport.querySelector('svg.mermaid-svg'), 'SVG is inside viewport');

      const toolbar = preview.querySelector('.mermaid-zoom-toolbar') as HTMLElement;
      assert.ok(toolbar, 'Zoom toolbar is rendered');

      const zoomInBtn = toolbar.querySelector('.mermaid-zoom-in') as HTMLButtonElement;
      const zoomOutBtn = toolbar.querySelector('.mermaid-zoom-out') as HTMLButtonElement;
      const resetBtn = toolbar.querySelector('.mermaid-zoom-reset') as HTMLButtonElement;
      assert.ok(zoomInBtn, 'Zoom In button exists');
      assert.ok(zoomOutBtn, 'Zoom Out button exists');
      assert.ok(resetBtn, 'Reset button exists');
      assert.strictEqual(resetBtn.textContent?.trim(), '100%');
    });

    it('clicking zoom in button increases scale and updates percentage label', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const zoomInBtn = preview.querySelector('.mermaid-zoom-in') as HTMLButtonElement;
      const resetVal = preview.querySelector('.mermaid-zoom-reset .mermaid-zoom-val') as HTMLElement;
      const viewport = preview.querySelector('.mermaid-viewport') as HTMLElement;

      assert.strictEqual(preview.getAttribute('data-scale'), '1');

      zoomInBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      const newScale = parseFloat(preview.getAttribute('data-scale') || '1');
      assert.ok(newScale > 1.0, `Scale increased: ${newScale}`);
      assert.strictEqual(resetVal.textContent, `${Math.round(newScale * 100)}%`);
      assert.ok(viewport.style.transform.includes(`scale(${newScale})`));
    });

    it('clicking zoom out button decreases scale and updates percentage label', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const zoomOutBtn = preview.querySelector('.mermaid-zoom-out') as HTMLButtonElement;
      const resetVal = preview.querySelector('.mermaid-zoom-reset .mermaid-zoom-val') as HTMLElement;

      zoomOutBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      const newScale = parseFloat(preview.getAttribute('data-scale') || '1');
      assert.ok(newScale < 1.0, `Scale decreased: ${newScale}`);
      assert.strictEqual(resetVal.textContent, `${Math.round(newScale * 100)}%`);
    });

    it('clicking reset button resets zoom and pan back to 100% and 0,0', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const zoomInBtn = preview.querySelector('.mermaid-zoom-in') as HTMLButtonElement;
      const resetBtn = preview.querySelector('.mermaid-zoom-reset') as HTMLButtonElement;
      const viewport = preview.querySelector('.mermaid-viewport') as HTMLElement;

      // Zoom in twice
      zoomInBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      zoomInBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      assert.notStrictEqual(preview.getAttribute('data-scale'), '1');

      // Click reset
      resetBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      assert.strictEqual(preview.getAttribute('data-scale'), '1');
      assert.strictEqual(preview.getAttribute('data-pan-x'), '0');
      assert.strictEqual(preview.getAttribute('data-pan-y'), '0');
      assert.ok(viewport.style.transform.includes('translate(0px, 0px) scale(1)'));
    });

    it('double-clicking preview canvas resets zoom and pan to 100%', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      applyDiagramTransform(preview, 40, -30, 2.0);
      assert.strictEqual(preview.getAttribute('data-scale'), '2');

      preview.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

      assert.strictEqual(preview.getAttribute('data-scale'), '1');
      assert.strictEqual(preview.getAttribute('data-pan-x'), '0');
      assert.strictEqual(preview.getAttribute('data-pan-y'), '0');
    });

    it('supports click-and-drag panning across preview canvas', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const viewport = preview.querySelector('.mermaid-viewport') as HTMLElement;

      // Start dragging at (100, 100)
      const mouseDownEvt = new window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      } as any);
      preview.dispatchEvent(mouseDownEvt);

      assert.ok(preview.classList.contains('is-panning'));

      // Move mouse to (150, 180) -> delta +50, +80
      const mouseMoveEvt = new window.MouseEvent('mousemove', {
        clientX: 150,
        clientY: 180,
      } as any);
      window.dispatchEvent(mouseMoveEvt);

      assert.strictEqual(preview.getAttribute('data-pan-x'), '50');
      assert.strictEqual(preview.getAttribute('data-pan-y'), '80');
      assert.ok(viewport.style.transform.includes('translate(50px, 80px)'));

      // Release mouse
      const mouseUpEvt = new window.MouseEvent('mouseup', {
        clientX: 150,
        clientY: 180,
      } as any);
      window.dispatchEvent(mouseUpEvt);

      assert.ok(!preview.classList.contains('is-panning'));
    });

    it('supports mouse wheel zooming with gentle, damped sensitivity', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;

      // Scroll wheel up (zoom in)
      const wheelEvt = new (window as any).Event('wheel', { bubbles: true }) as any;
      wheelEvt.deltaY = -100;
      wheelEvt.preventDefault = () => {};
      wheelEvt.stopPropagation = () => {};
      preview.dispatchEvent(wheelEvt);

      const scale = parseFloat(preview.getAttribute('data-scale') || '1');
      assert.ok(scale > 1.0, `Wheel up zoomed in: ${scale}`);
      assert.ok(scale <= 1.15, `Wheel zoom is damped and not overly sensitive: ${scale}`);
    });

    it('dampens trackpad pinch-to-zoom (ctrlKey) smoothly', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;

      // Trackpad pinch-in (zoom in) with ctrlKey
      const pinchEvt = new (window as any).Event('wheel', { bubbles: true }) as any;
      pinchEvt.deltaY = -30;
      pinchEvt.ctrlKey = true;
      pinchEvt.preventDefault = () => {};
      pinchEvt.stopPropagation = () => {};
      preview.dispatchEvent(pinchEvt);

      const scale = parseFloat(preview.getAttribute('data-scale') || '1');
      assert.ok(scale > 1.0, `Pinch zoomed in: ${scale}`);
      assert.ok(scale < 1.1, `Pinch is smoothly damped (scale = ${scale})`);
    });

    it('prevents runaway zoom when repeated small wheel events fire', () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```';
      editor.innerHTML = markdownToHtml(md);
      wireMermaidControls(editor);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;

      // Simulate 10 small trackpad scroll events (deltaY = -5 each)
      for (let i = 0; i < 10; i++) {
        const evt = new (window as any).Event('wheel', { bubbles: true }) as any;
        evt.deltaY = -5;
        evt.preventDefault = () => {};
        evt.stopPropagation = () => {};
        preview.dispatchEvent(evt);
      }

      const scale = parseFloat(preview.getAttribute('data-scale') || '1');
      // Should be moderately zoomed in (~5%), nowhere near 5.0 (which was the runaway bug)
      assert.ok(scale > 1.0 && scale < 1.15, `Repeated small wheel events are smooth: scale = ${scale}`);
    });
  });

  describe('Edge Labels Layered Strictly Above Arrow Paths and Markers', () => {
    it('renders flowchart edge labels strictly after all edge connector paths in SVG', () => {
      const md = `\`\`\`mermaid
graph TD
  StepA[First Step] -->|First Action| StepB[Second Step]
  StepB -->|Second Action| StepC[Third Step]
\`\`\``;
      editor.innerHTML = markdownToHtml(md);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const svg = preview.querySelector('svg.mermaid-svg') as SVGElement;
      assert.ok(svg);

      const paths = Array.from(svg.querySelectorAll('path.mermaid-edge'));
      const labels = Array.from(svg.querySelectorAll('g.mermaid-edge-label'));

      assert.strictEqual(paths.length, 2, '2 edge paths rendered');
      assert.strictEqual(labels.length, 2, '2 edge labels rendered');

      // Check DOM ordering: all labels appear after the last path
      const lastPath = paths[paths.length - 1];
      const firstLabel = labels[0];

      // In SVG DOM, node.compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4)
      const position = lastPath.compareDocumentPosition(firstLabel);
      assert.ok(
        (position & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        'All edge labels appear strictly after all edge paths in DOM order'
      );

      // Verify label background has opaque rect with rounded corners
      const labelBg = firstLabel.querySelector('rect.mermaid-edge-label-bg');
      assert.ok(labelBg, 'Opaque background rect exists');
      assert.strictEqual(labelBg.getAttribute('rx'), '4', 'Has rx=4 for smooth pill appearance');
    });

    it('renders state diagram transition labels strictly after all transition paths in SVG', () => {
      const md = `\`\`\`mermaid
stateDiagram-v2
  [*] --> Idle: Init
  Idle --> Active: Start
  Active --> [*]: Finish
\`\`\``;
      editor.innerHTML = markdownToHtml(md);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const svg = preview.querySelector('svg.mermaid-svg') as SVGElement;
      assert.ok(svg);

      const paths = Array.from(svg.querySelectorAll('path.mermaid-edge'));
      const labels = Array.from(svg.querySelectorAll('g.mermaid-edge-label'));

      assert.strictEqual(paths.length, 3);
      assert.strictEqual(labels.length, 3);

      const lastPath = paths[paths.length - 1];
      const firstLabel = labels[0];
      const position = lastPath.compareDocumentPosition(firstLabel);
      assert.ok(
        (position & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        'State transition labels appear strictly after all transition paths'
      );
    });

    it('renders ER diagram relation labels strictly after all relation paths in SVG', () => {
      const md = `\`\`\`mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
\`\`\``;
      editor.innerHTML = markdownToHtml(md);

      const preview = editor.querySelector('.mermaid-preview') as HTMLElement;
      const svg = preview.querySelector('svg.mermaid-svg') as SVGElement;
      assert.ok(svg);

      const paths = Array.from(svg.querySelectorAll('path.mermaid-edge'));
      const labels = Array.from(svg.querySelectorAll('g.mermaid-edge-label'));

      assert.strictEqual(paths.length, 2);
      assert.strictEqual(labels.length, 2);

      const lastPath = paths[paths.length - 1];
      const firstLabel = labels[0];
      const position = lastPath.compareDocumentPosition(firstLabel);
      assert.ok(
        (position & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        'ER relation labels appear strictly after all relation paths'
      );
    });
  });
});
