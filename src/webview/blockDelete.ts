/**
 * Block deletion handling for widget blocks (tables, code blocks, horizontal rules).
 * Handles click events on `.block-delete-btn` buttons to remove the enclosing block.
 */

/**
 * Handles click event on a block delete button or delegated editor canvas click.
 * Returns true if a block was deleted, false otherwise.
 */
export function handleBlockDeleteClick(
  e: MouseEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): boolean {
  const target = e.target as HTMLElement | null;
  const deleteBtn = target?.closest('.block-delete-btn') as HTMLElement | null;

  if (!deleteBtn || !editorCanvas.contains(deleteBtn)) {
    return false;
  }

  e.preventDefault();
  e.stopPropagation();

  const container = deleteBtn.closest('.editor-block-container') as HTMLElement | null;
  if (!container || !editorCanvas.contains(container)) {
    return false;
  }

  // Remove the block container
  container.remove();

  // If editor is now completely empty, insert an empty paragraph
  if (editorCanvas.children.length === 0) {
    const doc = editorCanvas.ownerDocument;
    const p = doc.createElement('p');
    p.className = 'editor-block';
    p.setAttribute('data-block-type', 'paragraph');
    p.innerHTML = '<br>';
    editorCanvas.appendChild(p);
  }

  emitEdit();
  return true;
}

/**
 * Wires delegated delete button listener on the editor canvas.
 */
export function wireBlockDelete(editorCanvas: HTMLElement, emitEdit: () => void): () => void {
  const onClick = (e: MouseEvent) => {
    handleBlockDeleteClick(e, editorCanvas, emitEdit);
  };

  editorCanvas.addEventListener('click', onClick);

  return () => {
    editorCanvas.removeEventListener('click', onClick);
  };
}
