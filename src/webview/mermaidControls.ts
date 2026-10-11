/**
 * Mermaid diagram controls for code blocks in the markdown editor.
 * Provides toggle between rendered diagram and editable code block,
 * and maintains diagram updates when code is modified.
 */

import { renderMermaidPreviewHtml } from '../mermaid';
import { getWebviewLanguage, tWebview } from './i18n';

export const CODE_VIEW_ICON_SVG = `<svg class="code-toggle-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25zm6.56 0a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L14.94 8l-3.72-3.72a.75.75 0 0 1 0-1.06z"/>
</svg>`;

export const DIAGRAM_VIEW_ICON_SVG = `<svg class="diagram-toggle-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
  <path d="M0 1.75C0 .784.784 0 1.75 0h3.5C6.216 0 7 .784 7 1.75v3.5A1.75 1.75 0 0 1 5.25 7H4v4a1 1 0 0 0 1 1h4v-1.25C9 9.784 9.784 9 10.75 9h3.5c.966 0 1.75.784 1.75 1.75v3.5A1.75 1.75 0 0 1 14.25 16h-3.5A1.75 1.75 0 0 1 9 14.25v-.75H5A2.5 2.5 0 0 1 2.5 11V7h-.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Zm9 9a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Z"/>
</svg>`;

/**
 * Returns HTML string for the code block diagram/code view toggle button.
 */
export function getCodeBlockToggleViewBtnHtml(isShowingCode = false): string {
  const title = isShowingCode ? tWebview('Diagramm anzeigen') : tWebview('Code anzeigen');
  const icon = isShowingCode ? DIAGRAM_VIEW_ICON_SVG : CODE_VIEW_ICON_SVG;
  const activeClass = isShowingCode ? ' is-showing-code' : '';
  const dataView = isShowingCode ? 'code' : 'diagram';

  return `<button type="button" class="code-toggle-view-btn${activeClass}" data-view="${dataView}" title="${title}" aria-label="${title}" tabindex="-1">${icon}</button>`;
}

/**
 * Applies transform style and updates stored scale/pan attributes.
 */
export function applyDiagramTransform(
  preview: HTMLElement,
  panX: number,
  panY: number,
  scale: number
): void {
  const viewport = preview.querySelector<HTMLElement>('.mermaid-viewport');
  if (!viewport) return;

  viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  preview.setAttribute('data-pan-x', panX.toString());
  preview.setAttribute('data-pan-y', panY.toString());
  preview.setAttribute('data-scale', scale.toString());

  const resetVal = preview.querySelector<HTMLElement>('.mermaid-zoom-reset .mermaid-zoom-val');
  if (resetVal) {
    resetVal.textContent = `${Math.round(scale * 100)}%`;
  }
}

/**
 * Resets diagram zoom and pan to 100% and (0,0).
 */
export function resetDiagramZoom(preview: HTMLElement): void {
  applyDiagramTransform(preview, 0, 0, 1);
}

/**
 * Zooms diagram by a factor, optionally centering on a point (e.g. mouse cursor position).
 */
export function zoomDiagramAt(
  preview: HTMLElement,
  factor: number,
  clientX?: number,
  clientY?: number
): void {
  const currentScale = parseFloat(preview.getAttribute('data-scale') || '1') || 1;
  let currentPanX = parseFloat(preview.getAttribute('data-pan-x') || '0') || 0;
  let currentPanY = parseFloat(preview.getAttribute('data-pan-y') || '0') || 0;

  let newScale = currentScale * factor;
  newScale = Math.min(5.0, Math.max(0.2, newScale));
  newScale = Math.round(newScale * 1000) / 1000;

  if (newScale === currentScale) return;

  if (clientX !== undefined && clientY !== undefined) {
    const rect = preview.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX - currentPanX;
      const dy = clientY - centerY - currentPanY;

      const scaleChange = newScale / currentScale;
      currentPanX = Math.round(currentPanX - dx * (scaleChange - 1));
      currentPanY = Math.round(currentPanY - dy * (scaleChange - 1));
    }
  }

  applyDiagramTransform(preview, currentPanX, currentPanY, newScale);
}

/**
 * Attaches panning, mouse wheel zoom, and toolbar interactions to a preview element.
 */
export function initPreviewPan(preview: HTMLElement): void {
  if (preview.hasAttribute('data-pan-wired')) return;
  preview.setAttribute('data-pan-wired', 'true');

  if (!preview.hasAttribute('data-scale')) preview.setAttribute('data-scale', '1');
  if (!preview.hasAttribute('data-pan-x')) preview.setAttribute('data-pan-x', '0');
  if (!preview.hasAttribute('data-pan-y')) preview.setAttribute('data-pan-y', '0');

  const win = preview.ownerDocument.defaultView || (typeof window !== 'undefined' ? window : null);

  // Mousedown for click-and-drag panning
  preview.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.mermaid-zoom-toolbar')) return;
    if (preview.querySelector('.mermaid-error-card')) return;

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPanX = parseFloat(preview.getAttribute('data-pan-x') || '0') || 0;
    const initialPanY = parseFloat(preview.getAttribute('data-pan-y') || '0') || 0;
    const scale = parseFloat(preview.getAttribute('data-scale') || '1') || 1;

    preview.classList.add('is-panning');

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      applyDiagramTransform(preview, initialPanX + dx, initialPanY + dy, scale);
    };

    const onMouseUp = () => {
      preview.classList.remove('is-panning');
      if (win) {
        win.removeEventListener('mousemove', onMouseMove);
        win.removeEventListener('mouseup', onMouseUp);
      }
    };

    if (win) {
      win.addEventListener('mousemove', onMouseMove);
      win.addEventListener('mouseup', onMouseUp);
    }
  });

  // Wheel zoom (mouse wheel or pinch-to-zoom)
  preview.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (preview.querySelector('.mermaid-error-card')) return;

      e.preventDefault();
      e.stopPropagation();

      // Normalize delta based on deltaMode:
      // 0: DOM_DELTA_PIXEL, 1: DOM_DELTA_LINE (~20px), 2: DOM_DELTA_PAGE (~200px)
      const delta = e.deltaY * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 200 : 1);

      // Dampen zoom sensitivity for both pinch-to-zoom (ctrlKey) and wheel scrolling
      const zoomIntensity = e.ctrlKey ? 0.002 : 0.001;
      let factor = Math.exp(-delta * zoomIntensity);

      // Clamp factor per single event to prevent sudden large jumps
      factor = Math.min(1.15, Math.max(0.85, factor));

      zoomDiagramAt(preview, factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  // Double click resets zoom and pan to 100%
  preview.addEventListener('dblclick', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.mermaid-zoom-toolbar')) return;
    if (preview.querySelector('.mermaid-error-card')) return;

    e.preventDefault();
    resetDiagramZoom(preview);
  });

  // Toolbar button click handler
  preview.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.mermaid-zoom-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const action = btn.getAttribute('data-action');
    if (action === 'zoom-in') {
      zoomDiagramAt(preview, 1.15);
    } else if (action === 'zoom-out') {
      zoomDiagramAt(preview, 0.87);
    } else if (action === 'reset') {
      resetDiagramZoom(preview);
    }
  });
}

/**
 * Renders or updates the Mermaid diagram inside a code block wrapper.
 */
export function renderMermaidInWrapper(wrapper: HTMLElement): void {
  let preview = wrapper.querySelector<HTMLElement>('.mermaid-preview');
  if (!preview) {
    preview = wrapper.ownerDocument.createElement('div');
    preview.className = 'mermaid-preview';
    preview.setAttribute('contenteditable', 'false');

    const pre = wrapper.querySelector('pre');
    if (pre) {
      wrapper.insertBefore(preview, pre);
    } else {
      wrapper.appendChild(preview);
    }
  }

  const codeEl =
    wrapper.querySelector<HTMLElement>('code.editor-code') ||
    wrapper.querySelector<HTMLElement>('pre code');
  const codeText = codeEl ? (codeEl.textContent || '') : '';
  const lang = getWebviewLanguage();

  preview.innerHTML = renderMermaidPreviewHtml(codeText, lang);
  preview.setAttribute('data-pan-x', '0');
  preview.setAttribute('data-pan-y', '0');
  preview.setAttribute('data-scale', '1');
  initPreviewPan(preview);
}

/**
 * Ensures all Mermaid code blocks have the toggle button and preview rendered.
 */
export function updateMermaidBlocks(root: HTMLElement): void {
  const wrappers = root.querySelectorAll<HTMLElement>('.code-block-wrapper');

  wrappers.forEach((wrapper) => {
    const langInput = wrapper.querySelector<HTMLInputElement>('input.code-lang-input');
    const lang = (langInput ? langInput.value : wrapper.getAttribute('data-language') || '').trim().toLowerCase();
    const isMermaid = lang === 'mermaid';
    const header = wrapper.querySelector<HTMLElement>('.code-block-header');

    if (isMermaid) {
      wrapper.classList.add('is-mermaid-block');

      // Ensure toggle button exists in header
      if (header) {
        const toggleBtn = header.querySelector<HTMLElement>('.code-toggle-view-btn');
        if (!toggleBtn) {
          const copyBtn = header.querySelector('.code-copy-btn');
          const isShowingCode = wrapper.getAttribute('data-view') === 'code';
          const btn = wrapper.ownerDocument.createElement('button');
          btn.type = 'button';
          btn.className = `code-toggle-view-btn${isShowingCode ? ' is-showing-code' : ''}`;
          btn.setAttribute('data-view', isShowingCode ? 'code' : 'diagram');
          const title = isShowingCode ? tWebview('Diagramm anzeigen') : tWebview('Code anzeigen');
          btn.title = title;
          btn.setAttribute('aria-label', title);
          btn.tabIndex = -1;
          btn.innerHTML = isShowingCode ? DIAGRAM_VIEW_ICON_SVG : CODE_VIEW_ICON_SVG;

          if (copyBtn) {
            header.insertBefore(btn, copyBtn);
          } else {
            header.appendChild(btn);
          }
        }
      }

      // Check current view: Default to 'diagram'
      const currentView = wrapper.getAttribute('data-view') || 'diagram';
      wrapper.setAttribute('data-view', currentView);

      const pre = wrapper.querySelector<HTMLElement>('pre');
      let preview = wrapper.querySelector<HTMLElement>('.mermaid-preview');

      if (!preview) {
        renderMermaidInWrapper(wrapper);
        preview = wrapper.querySelector<HTMLElement>('.mermaid-preview');
      }

      if (currentView === 'diagram') {
        if (pre) pre.style.display = 'none';
        if (preview) {
          preview.style.display = 'flex';
          initPreviewPan(preview);
        }
      } else {
        if (pre) pre.style.display = 'block';
        if (preview) preview.style.display = 'none';
      }
    } else {
      // Non-mermaid block: Hide/remove mermaid-specific elements
      wrapper.classList.remove('is-mermaid-block');
      wrapper.removeAttribute('data-view');

      const toggleBtn = header?.querySelector('.code-toggle-view-btn');
      if (toggleBtn) toggleBtn.remove();

      const preview = wrapper.querySelector('.mermaid-preview');
      if (preview) preview.remove();

      const pre = wrapper.querySelector<HTMLElement>('pre');
      if (pre) pre.style.display = 'block';
    }
  });
}

/**
 * Wires click and input listeners for Mermaid code block controls.
 */
export function wireMermaidControls(canvas: HTMLElement): void {
  updateMermaidBlocks(canvas);

  // Prevent blur/selection disruption on mousedown
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.code-toggle-view-btn, .mermaid-zoom-btn');
    if (btn && canvas.contains(btn)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Toggle view button click handler
  canvas.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.code-toggle-view-btn');
    if (!btn || !canvas.contains(btn)) return;

    e.preventDefault();
    e.stopPropagation();

    const wrapper = btn.closest<HTMLElement>('.code-block-wrapper');
    if (!wrapper) return;

    const currentView = wrapper.getAttribute('data-view') || 'diagram';
    const nextView = currentView === 'diagram' ? 'code' : 'diagram';
    wrapper.setAttribute('data-view', nextView);

    const pre = wrapper.querySelector<HTMLElement>('pre');
    let preview = wrapper.querySelector<HTMLElement>('.mermaid-preview');

    if (nextView === 'code') {
      // Switch to Code View
      if (pre) pre.style.display = 'block';
      if (preview) preview.style.display = 'none';

      btn.classList.add('is-showing-code');
      btn.setAttribute('data-view', 'code');
      const title = tWebview('Diagramm anzeigen');
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = DIAGRAM_VIEW_ICON_SVG;

      // Focus the code editor
      const codeEl = wrapper.querySelector<HTMLElement>('code.editor-code');
      if (codeEl) {
        codeEl.focus();
      }
    } else {
      // Switch to Diagram View (re-render from current code text)
      renderMermaidInWrapper(wrapper);
      preview = wrapper.querySelector<HTMLElement>('.mermaid-preview');

      if (pre) pre.style.display = 'none';
      if (preview) preview.style.display = 'flex';

      btn.classList.remove('is-showing-code');
      btn.setAttribute('data-view', 'diagram');
      const title = tWebview('Code anzeigen');
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = CODE_VIEW_ICON_SVG;
    }
  });

  // Listen for code language changes to dynamically activate/deactivate Mermaid
  canvas.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLElement | null;
    const langInput = target?.closest<HTMLInputElement>('input.code-lang-input');
    if (langInput && canvas.contains(langInput)) {
      const wrapper = langInput.closest<HTMLElement>('.code-block-wrapper');
      if (wrapper) {
        const val = langInput.value.trim().toLowerCase();
        if (val === 'mermaid' && !wrapper.classList.contains('is-mermaid-block')) {
          updateMermaidBlocks(canvas);
        } else if (val !== 'mermaid' && wrapper.classList.contains('is-mermaid-block')) {
          updateMermaidBlocks(canvas);
        }
      }
    }
  });
}

/**
 * Updates toggle button titles and ARIA labels after language switch.
 */
export function updateMermaidLanguage(root: Document | HTMLElement = document): void {
  const buttons = root.querySelectorAll<HTMLElement>('.code-toggle-view-btn');
  buttons.forEach((btn) => {
    const isShowingCode = btn.getAttribute('data-view') === 'code';
    const title = isShowingCode ? tWebview('Diagramm anzeigen') : tWebview('Code anzeigen');
    btn.title = title;
    btn.setAttribute('aria-label', title);
  });

  const zoomInBtns = root.querySelectorAll<HTMLElement>('.mermaid-zoom-in');
  zoomInBtns.forEach((btn) => {
    const title = tWebview('Vergrößern');
    btn.title = title;
    btn.setAttribute('aria-label', title);
  });

  const zoomOutBtns = root.querySelectorAll<HTMLElement>('.mermaid-zoom-out');
  zoomOutBtns.forEach((btn) => {
    const title = tWebview('Verkleinern');
    btn.title = title;
    btn.setAttribute('aria-label', title);
  });

  const resetBtns = root.querySelectorAll<HTMLElement>('.mermaid-zoom-reset');
  resetBtns.forEach((btn) => {
    const title = tWebview('Zoom zurücksetzen');
    btn.title = title;
    btn.setAttribute('aria-label', title);
  });
}
