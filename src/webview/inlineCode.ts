/**
 * Inline code toggle and dual-behavior code button handling.
 * - Selected single-line text → wraps or unwraps in `<code class="inline-code">`
 * - No selection or multiline selection → inserts a fenced code block
 */

/**
 * Toggles inline `<code>` on the current selection.
 * Returns true if inline code was toggled, false if no text was selected or selection was multiline.
 */
export function toggleInlineCode(editorCanvas: HTMLElement): boolean {
  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return false;

  const range = sel.getRangeAt(0);

  // Check if current selection is inside an existing inline code element
  const anchorEl =
    sel.anchorNode?.nodeType === 1
      ? (sel.anchorNode as HTMLElement)
      : sel.anchorNode?.parentElement;
  const existingCode = anchorEl?.closest('code') as HTMLElement | null;

  if (
    existingCode &&
    editorCanvas.contains(existingCode) &&
    !existingCode.closest('.code-block-wrapper')
  ) {
    // Toggle off: unwrap the inline code element
    const parent = existingCode.parentNode;
    if (parent) {
      const textNodes: Node[] = [];
      while (existingCode.firstChild) {
        const child = existingCode.firstChild;
        textNodes.push(child);
        parent.insertBefore(child, existingCode);
      }
      existingCode.remove();

      // Restore selection across the unwrapped nodes
      if (textNodes.length > 0 && sel) {
        const newRange = doc.createRange();
        newRange.setStartBefore(textNodes[0]);
        newRange.setEndAfter(textNodes[textNodes.length - 1]);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      return true;
    }
  }

  if (range.collapsed) {
    return false;
  }

  const selectedText = range.toString();
  if (selectedText.includes('\n')) {
    // Multiline selection: defer to fenced code block
    return false;
  }

  // Wrap selection in inline code element
  const codeEl = doc.createElement('code');
  codeEl.className = 'inline-code';
  const contents = range.extractContents();
  codeEl.appendChild(contents);
  range.insertNode(codeEl);

  // Re-select the code element contents
  const newRange = doc.createRange();
  newRange.selectNodeContents(codeEl);
  sel.removeAllRanges();
  sel.addRange(newRange);

  return true;
}

/**
 * Handles the toolbar code button click with dual behavior:
 * - Inline code toggle for single-line text selections
 * - Fenced code block insertion when collapsed or multiline
 */
export function handleCodeButtonClick(
  editorCanvas: HTMLElement,
  insertFencedCodeBlock: () => void,
  emitEdit: () => void
): void {
  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;

  if (sel && sel.rangeCount > 0) {
    const isCollapsed = sel.isCollapsed;
    const anchorEl =
      sel.anchorNode?.nodeType === 1
        ? (sel.anchorNode as HTMLElement)
        : sel.anchorNode?.parentElement;
    const existingCode = anchorEl?.closest('code') as HTMLElement | null;

    // If cursor is inside existing inline code (even if collapsed), toggle off
    if (
      existingCode &&
      editorCanvas.contains(existingCode) &&
      !existingCode.closest('.code-block-wrapper')
    ) {
      if (toggleInlineCode(editorCanvas)) {
        emitEdit();
        return;
      }
    }

    // If text is selected on a single line, toggle inline code
    if (!isCollapsed) {
      const text = sel.getRangeAt(0).toString();
      if (!text.includes('\n')) {
        if (toggleInlineCode(editorCanvas)) {
          emitEdit();
          return;
        }
      }
    }
  }

  // Otherwise, insert fenced code block
  insertFencedCodeBlock();
}
