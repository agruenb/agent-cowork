/**
 * Main public entry point for the custom Mermaid diagram renderer.
 */

export * from './types';
export * from './theme';
export * from './svgUtils';
export { detectDiagramType, renderDiagram } from './parser';

import { renderDiagram } from './parser';
import { MermaidRenderOptions, MermaidRenderResult } from './types';
import { escapeXml } from './svgUtils';

/**
 * Renders mermaid source code into an SVG string.
 */
export function renderMermaidToSvg(
  code: string,
  options?: MermaidRenderOptions
): MermaidRenderResult {
  return renderDiagram(code, options);
}

/**
 * Returns HTML string to place inside the .mermaid-preview container.
 * If rendering succeeds, returns the SVG.
 * If syntax error occurs, returns a styled error box.
 */
export function renderMermaidPreviewHtml(code: string, lang: 'en' | 'de' = 'de'): string {
  const result = renderDiagram(code);

  if (result.error || !result.svg) {
    const title = lang === 'en' ? 'Mermaid Syntax Error' : 'Mermaid Syntaxfehler';
    const hint =
      lang === 'en'
        ? 'Click the code icon in the header to view or edit the source.'
        : 'Klicke auf das Code-Symbol oben rechts, um den Quelltext zu bearbeiten.';
    const errorMsg = escapeXml(result.error || (lang === 'en' ? 'Unable to parse diagram' : 'Diagramm konnte nicht analysiert werden'));

    return `<div class="mermaid-error-card" role="alert">
      <div class="mermaid-error-header">
        <svg class="mermaid-error-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM8 4a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 4zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
        </svg>
        <span class="mermaid-error-title">${title}</span>
      </div>
      <div class="mermaid-error-message">${errorMsg}</div>
      <div class="mermaid-error-hint">${hint}</div>
    </div>`;
  }

  const zoomInTitle = lang === 'en' ? 'Zoom in' : 'Vergrößern';
  const zoomOutTitle = lang === 'en' ? 'Zoom out' : 'Verkleinern';
  const resetTitle = lang === 'en' ? 'Reset zoom' : 'Zoom zurücksetzen';

  return `<div class="mermaid-viewport">${result.svg}</div>
<div class="mermaid-zoom-toolbar" contenteditable="false">
  <button type="button" class="mermaid-zoom-btn mermaid-zoom-in" data-action="zoom-in" title="${zoomInTitle}" aria-label="${zoomInTitle}" tabindex="-1">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/></svg>
  </button>
  <button type="button" class="mermaid-zoom-btn mermaid-zoom-reset" data-action="reset" title="${resetTitle}" aria-label="${resetTitle}" tabindex="-1">
    <span class="mermaid-zoom-val">100%</span>
  </button>
  <button type="button" class="mermaid-zoom-btn mermaid-zoom-out" data-action="zoom-out" title="${zoomOutTitle}" aria-label="${zoomOutTitle}" tabindex="-1">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8z"/></svg>
  </button>
</div>`;
}
