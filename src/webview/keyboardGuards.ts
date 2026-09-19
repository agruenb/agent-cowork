/**
 * Keyboard guards for block boundaries and widget isolation.
 * Prevents accidental merging of text blocks into widget blocks on Backspace/Delete,
 * and handles Tab/Enter inside code blocks.
 */

/**
 * Checks if the selection caret is at the very beginning of a block element.
 */
export function isAtStartOfBlock(sel: Selection, blockContainer: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const preRange = blockContainer.ownerDocument.createRange();
    preRange.setStart(blockContainer, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}

/**
 * Checks if the selection caret is at the very end of a block element.
 */
export function isAtEndOfBlock(sel: Selection, blockContainer: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const postRange = blockContainer.ownerDocument.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(blockContainer, blockContainer.childNodes.length);
    return postRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}


/**
 * Intercepts keydown events to protect widget blocks and handle code block keys.
 * Returns true if the key was handled/prevented, false to let standard handling proceed.
 */
export function handleBlockKeyboardGuards(
  e: KeyboardEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): boolean {
  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return false;

  const anchorEl =
    sel.anchorNode?.nodeType === 1
      ? (sel.anchorNode as HTMLElement)
      : sel.anchorNode?.parentElement;

  // 1. Inside a code block: handle Tab and Enter
  const codeEl = anchorEl?.closest('code.editor-code') as HTMLElement | null;
  if (codeEl && editorCanvas.contains(codeEl)) {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      emitEdit();
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
      emitEdit();
      return true;
    }
  }

  // 2. Block boundary guards for Backspace and Delete
  let blockEl: HTMLElement | null = anchorEl;
  while (blockEl && blockEl.parentElement !== editorCanvas) {
    blockEl = blockEl.parentElement;
  }
  if (!blockEl) {
    return false;
  }

  // Backspace at beginning of block: don't merge into preceding widget block
  if (e.key === 'Backspace' && isAtStartOfBlock(sel, blockEl)) {
    const prev = blockEl.previousElementSibling as HTMLElement | null;
    if (prev && prev.classList.contains('widget-block')) {
      e.preventDefault();
      return true;
    }
  }

  // Delete at end of block: don't pull/merge following widget block
  if (e.key === 'Delete' && isAtEndOfBlock(sel, blockEl)) {
    const next = blockEl.nextElementSibling as HTMLElement | null;
    if (next && next.classList.contains('widget-block')) {
      e.preventDefault();
      return true;
    }
  }

  return false;
}
