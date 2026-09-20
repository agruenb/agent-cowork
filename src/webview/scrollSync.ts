import { parseMarkdownToBlocks, MarkdownBlock, MarkdownListItem } from '../markdown/parser';
import { getComputedLineHeight } from './rawLineNumbers';

export interface VisibleLinePosition {
  line: number;
  fraction: number;
  isBottom?: boolean;
}

/**
 * Returns the computed or fallback top padding of the document viewport.
 */
export function getViewportPaddingTop(viewport: HTMLElement): number {
  const win = viewport.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (win && typeof win.getComputedStyle === 'function') {
    const pt = parseFloat(win.getComputedStyle(viewport).paddingTop);
    if (!isNaN(pt)) {
      return pt;
    }
  }
  return 32;
}

/**
 * Recursively annotates <li> elements with source markdown line numbers.
 */
function annotateListItems(listEl: HTMLElement, items: MarkdownListItem[]): void {
  const liElements = Array.from(listEl.querySelectorAll(':scope > li')) as HTMLElement[];
  for (let i = 0; i < Math.min(liElements.length, items.length); i++) {
    const li = liElements[i];
    const item = items[i];
    if (item.line !== undefined) {
      li.setAttribute('data-line', String(item.line));
    }
    if (item.children) {
      for (const childBlock of item.children) {
        if (childBlock.items) {
          const subList = li.querySelector(childBlock.type === 'ordered_list' ? ':scope > ol' : ':scope > ul') as HTMLElement | null;
          if (subList) {
            annotateListItems(subList, childBlock.items);
          }
        }
      }
    }
  }
}

/**
 * Synchronizes data-start-line, data-end-line, and data-line attributes on DOM elements
 * in the editor canvas, mapping each block and list item to its exact source markdown lines.
 */
export function syncBlockLineAttributes(
  canvas: HTMLElement,
  markdownOrBlocks: string | MarkdownBlock[]
): void {
  const blocks = typeof markdownOrBlocks === 'string'
    ? parseMarkdownToBlocks(markdownOrBlocks)
    : markdownOrBlocks;

  const children = Array.from(canvas.children) as HTMLElement[];
  if (children.length === 0 || blocks.length === 0) return;

  for (let i = 0; i < Math.min(children.length, blocks.length); i++) {
    const el = children[i];
    const block = blocks[i];
    if (block.startLine !== undefined) {
      el.setAttribute('data-start-line', String(block.startLine));
    }
    if (block.endLine !== undefined) {
      el.setAttribute('data-end-line', String(block.endLine));
    }
    if (block.items && (el.tagName === 'UL' || el.tagName === 'OL')) {
      annotateListItems(el, block.items);
    }
  }
}

/**
 * Determines which markdown line is visible at the top of the viewport in Formatted mode.
 */
export function getVisibleLineInFormatted(
  canvas: HTMLElement,
  viewport: HTMLElement
): VisibleLinePosition {
  // Edge case: Top of document
  if (viewport.scrollTop <= 0) {
    return { line: 1, fraction: 0 };
  }

  // Edge case: Scrolled to very bottom
  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const isBottom = maxScroll > 0 && viewport.scrollTop >= maxScroll - 5;

  const paddingTop = getViewportPaddingTop(viewport);
  const viewportRect =
    typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect()
      : null;

  // Case A: Real browser DOM with bounding rect layout
  if (viewportRect && viewportRect.height > 0) {
    const refY = viewportRect.top + paddingTop;
    const blocks = Array.from(canvas.children) as HTMLElement[];

    for (const blockEl of blocks) {
      const rect = blockEl.getBoundingClientRect();
      if (rect.top <= refY && rect.bottom > refY) {
        return getLineFromFormattedBlock(blockEl, refY, rect, isBottom);
      }
      if (rect.top > refY) {
        const startLine = parseInt(blockEl.getAttribute('data-start-line') || '1', 10);
        return { line: Math.max(1, startLine), fraction: 0, isBottom };
      }
    }

    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      const endLine = parseInt(
        lastBlock.getAttribute('data-end-line') ||
        lastBlock.getAttribute('data-start-line') ||
        '1',
        10
      );
      return { line: endLine, fraction: 1, isBottom: true };
    }
  }

  // Case B: Fallback using offsetTop / scrollTop
  const refOffset = viewport.scrollTop;
  const blocks = Array.from(canvas.children) as HTMLElement[];

  for (const blockEl of blocks) {
    const top = blockEl.offsetTop;
    const height = blockEl.offsetHeight || 30;
    if (top <= refOffset && top + height > refOffset) {
      const fraction = Math.max(0, Math.min(1, (refOffset - top) / height));
      const startLine = parseInt(blockEl.getAttribute('data-start-line') || '1', 10);
      const endLine = parseInt(blockEl.getAttribute('data-end-line') || String(startLine), 10);
      const totalLines = Math.max(1, endLine - startLine + 1);
      const lineProgress = fraction * totalLines;
      const line = Math.min(endLine, startLine + Math.floor(lineProgress));
      return { line, fraction: lineProgress % 1, isBottom };
    }
    if (top > refOffset) {
      const startLine = parseInt(blockEl.getAttribute('data-start-line') || '1', 10);
      return { line: Math.max(1, startLine), fraction: 0, isBottom };
    }
  }

  if (blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1];
    const endLine = parseInt(
      lastBlock.getAttribute('data-end-line') ||
      lastBlock.getAttribute('data-start-line') ||
      '1',
      10
    );
    return { line: endLine, fraction: 1, isBottom: true };
  }

  return { line: 1, fraction: 0, isBottom };
}

function getLineFromFormattedBlock(
  blockEl: HTMLElement,
  refY: number,
  blockRect: DOMRect,
  isBottom: boolean
): VisibleLinePosition {
  const listItems = Array.from(blockEl.querySelectorAll('li[data-line]')) as HTMLElement[];
  for (const li of listItems) {
    const liRect = li.getBoundingClientRect();
    if (liRect.top <= refY && liRect.bottom > refY) {
      const line = parseInt(li.getAttribute('data-line') || '1', 10);
      const fraction = Math.max(0, Math.min(1, (refY - liRect.top) / (liRect.height || 1)));
      return { line, fraction, isBottom };
    }
  }

  const startLine = parseInt(blockEl.getAttribute('data-start-line') || '1', 10);
  const endLine = parseInt(blockEl.getAttribute('data-end-line') || String(startLine), 10);
  const totalLines = Math.max(1, endLine - startLine + 1);
  const fraction = Math.max(0, Math.min(1, (refY - blockRect.top) / (blockRect.height || 1)));
  const lineProgress = fraction * totalLines;
  const line = Math.min(endLine, startLine + Math.floor(lineProgress));
  return { line, fraction: lineProgress % 1, isBottom };
}

/**
 * Determines which markdown line is visible at the top of the viewport in Raw mode.
 */
export function getVisibleLineInRaw(
  textarea: HTMLTextAreaElement,
  gutter: HTMLElement | null,
  viewport: HTMLElement
): VisibleLinePosition {
  // Edge case: Top of document
  if (viewport.scrollTop <= 0) {
    return { line: 1, fraction: 0 };
  }

  // Edge case: Scrolled to very bottom
  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const isBottom = maxScroll > 0 && viewport.scrollTop >= maxScroll - 5;

  const paddingTop = getViewportPaddingTop(viewport);
  const viewportRect =
    typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect()
      : null;

  // Case A: Real browser with gutter elements
  if (viewportRect && viewportRect.height > 0 && gutter) {
    const refY = viewportRect.top + paddingTop;
    const gutterLines = Array.from(gutter.querySelectorAll('.raw-gutter-line')) as HTMLElement[];

    for (const lineEl of gutterLines) {
      const rect = lineEl.getBoundingClientRect();
      if (rect.top <= refY && rect.bottom > refY) {
        const line = parseInt(lineEl.getAttribute('data-line') || '1', 10);
        const fraction = Math.max(0, Math.min(1, (refY - rect.top) / (rect.height || 1)));
        return { line, fraction, isBottom };
      }
      if (rect.top > refY) {
        const line = parseInt(lineEl.getAttribute('data-line') || '1', 10);
        return { line: Math.max(1, line), fraction: 0, isBottom };
      }
    }

    if (gutterLines.length > 0) {
      const last = gutterLines[gutterLines.length - 1];
      const line = parseInt(last.getAttribute('data-line') || '1', 10);
      return { line, fraction: 1, isBottom: true };
    }
  }

  // Case B: Fallback using offsetTop / scrollTop
  if (gutter) {
    const refOffset = viewport.scrollTop;
    const gutterLines = Array.from(gutter.querySelectorAll('.raw-gutter-line')) as HTMLElement[];
    for (const lineEl of gutterLines) {
      const top = lineEl.offsetTop;
      const height = lineEl.offsetHeight || 25.5;
      if (top <= refOffset && top + height > refOffset) {
        const line = parseInt(lineEl.getAttribute('data-line') || '1', 10);
        const fraction = Math.max(0, Math.min(1, (refOffset - top) / height));
        return { line, fraction, isBottom };
      }
      if (top > refOffset) {
        const line = parseInt(lineEl.getAttribute('data-line') || '1', 10);
        return { line: Math.max(1, line), fraction: 0, isBottom };
      }
    }
    if (gutterLines.length > 0) {
      const last = gutterLines[gutterLines.length - 1];
      const line = parseInt(last.getAttribute('data-line') || '1', 10);
      return { line, fraction: 1, isBottom: true };
    }
  }

  // Case C: Fallback line-height calculation from textarea
  const baseLineHeight = getComputedLineHeight(textarea) || 25.5;
  const lineFloat = (viewport.scrollTop / baseLineHeight) + 1;
  const line = Math.floor(lineFloat);
  return { line: Math.max(1, line), fraction: lineFloat - line, isBottom };
}

/**
 * Scrolls the document viewport so that targetLine is positioned at the top in Formatted mode.
 */
export function scrollToLineInFormatted(
  targetLine: number,
  fraction: number,
  canvas: HTMLElement,
  viewport: HTMLElement,
  isBottom = false
): void {
  // Edge case: Top of document
  if (targetLine <= 1 && fraction <= 0 && !isBottom) {
    viewport.scrollTop = 0;
    return;
  }

  // Edge case: Bottom of document
  if (isBottom) {
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (maxScroll > 0) {
      viewport.scrollTop = maxScroll;
      return;
    }
  }

  const paddingTop = getViewportPaddingTop(viewport);
  const viewportRect =
    typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect()
      : null;

  // 1. Search for exact matching <li>
  let targetEl = canvas.querySelector(`li[data-line="${targetLine}"]`) as HTMLElement | null;
  let startLine = targetLine;
  let endLine = targetLine;

  // 2. If not found, search for block spanning targetLine
  if (!targetEl) {
    const blocks = Array.from(canvas.children) as HTMLElement[];
    for (const block of blocks) {
      const bStart = parseInt(block.getAttribute('data-start-line') || '0', 10);
      const bEnd = parseInt(block.getAttribute('data-end-line') || '0', 10);
      if (bStart <= targetLine && targetLine <= bEnd) {
        targetEl = block;
        startLine = bStart;
        endLine = bEnd;
        break;
      }
    }
    // 3. Fallback: closest block
    if (!targetEl && blocks.length > 0) {
      for (const block of blocks) {
        const bStart = parseInt(block.getAttribute('data-start-line') || '0', 10);
        if (bStart >= targetLine) {
          targetEl = block;
          startLine = bStart;
          endLine = parseInt(block.getAttribute('data-end-line') || String(bStart), 10);
          break;
        }
      }
      if (!targetEl) {
        targetEl = blocks[blocks.length - 1];
        startLine = parseInt(targetEl.getAttribute('data-start-line') || '1', 10);
        endLine = parseInt(targetEl.getAttribute('data-end-line') || String(startLine), 10);
      }
    }
  }

  if (!targetEl) {
    viewport.scrollTop = 0;
    return;
  }

  const targetRect =
    typeof targetEl.getBoundingClientRect === 'function'
      ? targetEl.getBoundingClientRect()
      : null;

  if (viewportRect && targetRect && viewportRect.height > 0 && targetRect.height > 0) {
    const currentScrollTop = viewport.scrollTop;
    let targetTopInViewport = targetRect.top - (viewportRect.top + paddingTop);
    if (endLine > startLine) {
      const totalLines = endLine - startLine + 1;
      const subOffset = ((targetLine - startLine + fraction) / totalLines) * targetRect.height;
      targetTopInViewport += subOffset;
    }
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const desired = Math.max(0, Math.round(currentScrollTop + targetTopInViewport));
    viewport.scrollTop = maxScroll > 0 ? Math.min(desired, maxScroll) : desired;
  } else {
    let offset = targetEl.offsetTop;
    if (endLine > startLine) {
      const totalLines = endLine - startLine + 1;
      const subOffset = ((targetLine - startLine + fraction) / totalLines) * (targetEl.offsetHeight || 30);
      offset += subOffset;
    }
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const desired = Math.max(0, Math.round(offset));
    viewport.scrollTop = maxScroll > 0 ? Math.min(desired, maxScroll) : desired;
  }
}

/**
 * Scrolls the document viewport so that targetLine is positioned at the top in Raw mode.
 */
export function scrollToLineInRaw(
  targetLine: number,
  fraction: number,
  textarea: HTMLTextAreaElement,
  gutter: HTMLElement | null,
  viewport: HTMLElement,
  isBottom = false
): void {
  // Edge case: Top of document
  if (targetLine <= 1 && fraction <= 0 && !isBottom) {
    viewport.scrollTop = 0;
    return;
  }

  // Edge case: Bottom of document
  if (isBottom) {
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (maxScroll > 0) {
      viewport.scrollTop = maxScroll;
      return;
    }
  }

  const paddingTop = getViewportPaddingTop(viewport);
  const viewportRect =
    typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect()
      : null;

  const lineEl = gutter?.querySelector(`.raw-gutter-line[data-line="${targetLine}"]`) as HTMLElement | null;

  if (lineEl) {
    const lineRect =
      typeof lineEl.getBoundingClientRect === 'function'
        ? lineEl.getBoundingClientRect()
        : null;

    if (viewportRect && lineRect && viewportRect.height > 0 && lineRect.height > 0) {
      const currentScrollTop = viewport.scrollTop;
      const targetTopInViewport = lineRect.top - (viewportRect.top + paddingTop);
      const subOffset = fraction * lineRect.height;
      const desired = Math.max(0, Math.round(currentScrollTop + targetTopInViewport + subOffset));
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScroll > 0 ? Math.min(desired, maxScroll) : desired;
    } else {
      const offset = lineEl.offsetTop + (fraction * (lineEl.offsetHeight || 25.5));
      const desired = Math.max(0, Math.round(offset));
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScroll > 0 ? Math.min(desired, maxScroll) : desired;
    }
  } else {
    const baseLineHeight = getComputedLineHeight(textarea);
    const desired = Math.max(0, Math.round((targetLine - 1 + fraction) * baseLineHeight));
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = maxScroll > 0 ? Math.min(desired, maxScroll) : desired;
  }
}
