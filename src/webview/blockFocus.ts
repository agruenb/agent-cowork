/**
 * Active block tracking and highlight toggling for the Agent Cowork block editor.
 * Applies the `.is-active-block` CSS class to the focused block container.
 */

let currentActiveBlock: HTMLElement | null = null;

/**
 * Returns the currently active block container element.
 */
export function getActiveBlock(editorCanvas: HTMLElement): HTMLElement | null {
  if (currentActiveBlock && editorCanvas.contains(currentActiveBlock)) {
    return currentActiveBlock;
  }
  return null;
}

/**
 * Sets or clears the active block container element.
 */
export function setActiveBlock(editorCanvas: HTMLElement, block: HTMLElement | null): void {
  if (currentActiveBlock && currentActiveBlock !== block) {
    currentActiveBlock.classList.remove('is-active-block');
  }

  if (block && editorCanvas.contains(block) && block.classList.contains('editor-block-container')) {
    block.classList.add('is-active-block');
    currentActiveBlock = block;
  } else {
    currentActiveBlock = null;
  }
}

/**
 * Updates the active block based on current window selection or active element.
 */
export function updateActiveBlock(editorCanvas: HTMLElement): void {
  if (typeof document === 'undefined') return;

  const doc = editorCanvas.ownerDocument || document;
  const sel = doc.defaultView ? doc.defaultView.getSelection() : window.getSelection();

  let targetNode: Node | null = null;
  if (sel && sel.rangeCount > 0) {
    targetNode = sel.anchorNode;
  } else if (doc.activeElement && editorCanvas.contains(doc.activeElement)) {
    targetNode = doc.activeElement;
  }

  if (!targetNode || !editorCanvas.contains(targetNode)) {
    setActiveBlock(editorCanvas, null);
    return;
  }

  const el = targetNode.nodeType === 1 ? (targetNode as HTMLElement) : targetNode.parentElement;
  const blockContainer = el?.closest('.editor-block-container.widget-block') as HTMLElement | null;

  if (blockContainer && editorCanvas.contains(blockContainer)) {
    setActiveBlock(editorCanvas, blockContainer);
  } else {
    setActiveBlock(editorCanvas, null);
  }
}

/**
 * Wires focus and selection change listeners on the canvas and document.
 */
export function wireBlockFocus(editorCanvas: HTMLElement): () => void {
  const doc = editorCanvas.ownerDocument || document;

  const onSelectionChange = () => {
    updateActiveBlock(editorCanvas);
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    const container = target?.closest('.editor-block-container') as HTMLElement | null;
    if (container && editorCanvas.contains(container)) {
      setActiveBlock(editorCanvas, container);
    }
  };

  const onFocusOut = (e: FocusEvent) => {
    // Only clear if focus left editorCanvas entirely
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !editorCanvas.contains(related)) {
      setActiveBlock(editorCanvas, null);
    }
  };

  doc.addEventListener('selectionchange', onSelectionChange);
  editorCanvas.addEventListener('focusin', onFocusIn);
  editorCanvas.addEventListener('focusout', onFocusOut);

  return () => {
    doc.removeEventListener('selectionchange', onSelectionChange);
    editorCanvas.removeEventListener('focusin', onFocusIn);
    editorCanvas.removeEventListener('focusout', onFocusOut);
  };
}
