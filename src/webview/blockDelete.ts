/**
 * Block deletion handling for widget blocks (tables, code blocks, horizontal rules).
 * Handles click events on `.block-delete-btn` buttons to remove the enclosing block.
 */

import { tWebview } from './i18n';

let activeBlockConfirmPopup: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

/**
 * Returns user-facing title and description labels based on the block type.
 */
function getBlockTypeLabels(blockType: string | null): { title: string; desc: string } {
  switch (blockType) {
    case 'table':
      return {
        title: tWebview('Tabelle löschen?'),
        desc: tWebview('Möchten Sie diese Tabelle wirklich löschen?'),
      };
    case 'code_block':
      return {
        title: tWebview('Code-Block löschen?'),
        desc: tWebview('Möchten Sie diesen Code-Block wirklich löschen?'),
      };
    case 'blockquote':
      return {
        title: tWebview('Zitat löschen?'),
        desc: tWebview('Möchten Sie dieses Zitat wirklich löschen?'),
      };
    case 'hr':
      return {
        title: tWebview('Trennlinie löschen?'),
        desc: tWebview('Möchten Sie diese Trennlinie wirklich löschen?'),
      };
    default:
      return {
        title: tWebview('Block löschen?'),
        desc: tWebview('Möchten Sie diesen Block wirklich löschen?'),
      };
  }
}

/**
 * Closes the currently active block deletion confirmation popup if any.
 */
export function closeActiveBlockConfirm(): void {
  if (activeCleanup) {
    activeCleanup();
  }
}

/**
 * Directly removes a block container from the editor and emits an edit event.
 * If the editor becomes empty, inserts a fallback empty paragraph.
 */
export function deleteBlock(
  container: HTMLElement,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): void {
  container.remove();

  if (editorCanvas.children.length === 0) {
    const doc = editorCanvas.ownerDocument;
    const p = doc.createElement('p');
    p.className = 'editor-block';
    p.setAttribute('data-block-type', 'paragraph');
    p.innerHTML = '<br>';
    editorCanvas.appendChild(p);
  }

  emitEdit();
}

/**
 * Shows an interactive confirmation popup anchored to the block delete button.
 */
export function showBlockDeleteConfirm(
  deleteBtn: HTMLElement,
  container: HTMLElement,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): HTMLElement | null {
  // If active popup belongs to this button, toggle it off
  if (activeBlockConfirmPopup && activeBlockConfirmPopup.parentElement === container) {
    closeActiveBlockConfirm();
    return null;
  }

  closeActiveBlockConfirm();

  const doc = container.ownerDocument || document;
  const blockType = container.getAttribute('data-block-type');
  const labels = getBlockTypeLabels(blockType);

  deleteBtn.classList.add('is-active');
  container.classList.add('is-delete-target');

  const popup = doc.createElement('div');
  popup.className = 'block-confirm-popup';
  popup.contentEditable = 'false';

  const titleEl = doc.createElement('div');
  titleEl.className = 'block-confirm-title';
  titleEl.textContent = labels.title;

  const descEl = doc.createElement('div');
  descEl.className = 'block-confirm-desc';
  descEl.textContent = labels.desc;

  const actionsEl = doc.createElement('div');
  actionsEl.className = 'block-confirm-actions';

  const cancelBtn = doc.createElement('button');
  cancelBtn.className = 'block-confirm-btn block-confirm-cancel';
  cancelBtn.type = 'button';
  cancelBtn.textContent = tWebview('Abbrechen');

  const confirmBtn = doc.createElement('button');
  confirmBtn.className = 'block-confirm-btn block-confirm-delete';
  confirmBtn.type = 'button';
  confirmBtn.textContent = tWebview('Löschen');

  actionsEl.appendChild(cancelBtn);
  actionsEl.appendChild(confirmBtn);

  popup.appendChild(titleEl);
  popup.appendChild(descEl);
  popup.appendChild(actionsEl);

  container.appendChild(popup);
  activeBlockConfirmPopup = popup;

  // Position relative to deleteBtn
  const top = deleteBtn.offsetTop + deleteBtn.offsetHeight + 4;
  popup.style.top = `${top}px`;
  popup.style.right = '6px';

  const cleanup = () => {
    deleteBtn.classList.remove('is-active');
    container.classList.remove('is-delete-target');
    if (popup.parentElement) {
      popup.remove();
    }
    if (activeBlockConfirmPopup === popup) {
      activeBlockConfirmPopup = null;
      activeCleanup = null;
    }
    doc.removeEventListener('mousedown', onDocMouseDown, true);
    doc.removeEventListener('keydown', onDocKeyDown, true);
  };

  activeCleanup = cleanup;

  const onDocMouseDown = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node) && !deleteBtn.contains(e.target as Node)) {
      cleanup();
    }
  };

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cleanup();
    }
  };

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    cleanup();
  });

  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    cleanup();
    deleteBlock(container, editorCanvas, emitEdit);
  });

  popup.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  doc.addEventListener('mousedown', onDocMouseDown, true);
  doc.addEventListener('keydown', onDocKeyDown, true);

  return popup;
}

/**
 * Handles click event on a block delete button or delegated editor canvas click.
 * Displays a confirmation popup before deletion.
 * Returns true if the delete button was handled, false otherwise.
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

  showBlockDeleteConfirm(deleteBtn, container, editorCanvas, emitEdit);
  return true;
}

/**
 * Wires delegated delete button listener on the editor canvas.
 */
export function wireBlockDelete(editorCanvas: HTMLElement, emitEdit: () => void): () => void {
  const onClick = (e: MouseEvent) => {
    handleBlockDeleteClick(e, editorCanvas, emitEdit);
  };

  const onMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const deleteBtn = target?.closest('.block-delete-btn') as HTMLElement | null;
    if (deleteBtn && editorCanvas.contains(deleteBtn)) {
      const container = deleteBtn.closest('.editor-block-container') as HTMLElement | null;
      container?.classList.add('is-delete-target');
    }
  };

  const onMouseOut = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const deleteBtn = target?.closest('.block-delete-btn') as HTMLElement | null;
    if (deleteBtn && editorCanvas.contains(deleteBtn)) {
      const container = deleteBtn.closest('.editor-block-container') as HTMLElement | null;
      if (!deleteBtn.classList.contains('is-active')) {
        container?.classList.remove('is-delete-target');
      }
    }
  };

  editorCanvas.addEventListener('click', onClick);
  editorCanvas.addEventListener('mouseover', onMouseOver);
  editorCanvas.addEventListener('mouseout', onMouseOut);

  return () => {
    editorCanvas.removeEventListener('click', onClick);
    editorCanvas.removeEventListener('mouseover', onMouseOver);
    editorCanvas.removeEventListener('mouseout', onMouseOut);
    closeActiveBlockConfirm();
  };
}
