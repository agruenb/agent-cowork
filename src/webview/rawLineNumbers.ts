import { getRawTextarea, getRawGutter, getRawMirror } from './editorState';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getComputedLineHeight(el: HTMLElement): number {
  const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (win && typeof win.getComputedStyle === 'function') {
    const computed = parseFloat(win.getComputedStyle(el).lineHeight);
    if (!isNaN(computed) && computed > 0) {
      return computed;
    }
  }
  return 25.5;
}

/**
 * Updates the raw editor line numbers in the gutter element, measuring wrapped
 * line heights using the mirror element to maintain 1:1 alignment with text.
 */
export function updateRawLineNumbers(): void {
  const textarea = getRawTextarea();
  const gutter = getRawGutter();
  if (!textarea || !gutter) {
    return;
  }

  const text = textarea.value || '';
  const lines = text.split('\n');
  const lineCount = lines.length;
  const baseLineHeight = getComputedLineHeight(textarea);

  const mirror = getRawMirror();
  const heights: number[] = [];

  if (mirror) {
    const clientWidth = textarea.clientWidth;
    if (clientWidth > 0) {
      mirror.style.width = `${clientWidth}px`;
    }

    // Render lines into mirror for wrapped height measurement
    mirror.innerHTML = lines
      .map((l) => `<div class="raw-mirror-line">${escapeHtml(l) || '&nbsp;'}</div>`)
      .join('');

    for (let i = 0; i < mirror.children.length; i++) {
      const child = mirror.children[i] as HTMLElement;
      const rect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : null;
      const measured = rect && rect.height > 0 ? rect.height : child.offsetHeight;
      heights.push(measured > 0 ? measured : baseLineHeight);
    }
  } else {
    for (let i = 0; i < lineCount; i++) {
      heights.push(baseLineHeight);
    }
  }

  // Render gutter lines
  let html = '';
  for (let i = 0; i < lineCount; i++) {
    const lineNum = i + 1;
    const h = heights[i] || baseLineHeight;
    html += `<div class="raw-gutter-line" data-line="${lineNum}" style="height: ${h}px;">${lineNum}</div>`;
  }
  gutter.innerHTML = html;

  // Wire click-to-navigate on gutter lines once
  if (!gutter.dataset.wired) {
    gutter.dataset.wired = 'true';
    gutter.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.raw-gutter-line');
      if (!target) return;
      const lineIdx = parseInt(target.getAttribute('data-line') || '1', 10);
      if (isNaN(lineIdx) || lineIdx < 1) return;

      const currentText = textarea.value || '';
      const currentLines = currentText.split('\n');
      let offset = 0;
      for (let l = 0; l < lineIdx - 1 && l < currentLines.length; l++) {
        offset += currentLines[l].length + 1; // +1 for \n
      }

      textarea.focus();
      textarea.setSelectionRange(offset, offset);
    });
  }
}
