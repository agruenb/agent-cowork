/**
 * Table row and column insertion, deletion, content checking, and confirmation popup.
 */

import { tWebview } from '../i18n';

export interface DeleteConfirmOptions {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface TableWrapperElement extends HTMLElement {
  _activeConfirmPopup?: HTMLElement | null;
  _tableScrollHandler?: (e: Event) => void;
  _tableResizeObserver?: ResizeObserver;
  _tableMouseMoveHandler?: (e: MouseEvent) => void;
}

export function getRelativeRect(child: HTMLElement, parent: HTMLElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const childRect = child.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return {
    left: childRect.left - parentRect.left + parent.scrollLeft,
    top: childRect.top - parentRect.top + parent.scrollTop,
    width: childRect.width,
    height: childRect.height,
  };
}

export function rowHasContent(tr: HTMLTableRowElement): boolean {
  const cells = Array.from(tr.querySelectorAll('td, th')) as HTMLElement[];
  return cells.some((cell) => {
    const cb = cell.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (cb && cb.checked) {
      return true;
    }
    const text = (cell.textContent || '').replace(/\u200B/g, '').trim();
    return text.length > 0;
  });
}

export function columnHasContent(table: HTMLTableElement, colIndex: number): boolean {
  const theadTh = table.querySelectorAll('thead th')[colIndex] as HTMLElement | undefined;
  if (theadTh) {
    const headerText = (theadTh.textContent || '').replace(/\u200B/g, '').trim();
    if (headerText.length > 0) {
      return true;
    }
  }

  const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  return bodyRows.some((tr) => {
    const cell = tr.children[colIndex] as HTMLElement | undefined;
    if (!cell) return false;
    const cb = cell.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (cb && cb.checked) {
      return true;
    }
    const text = (cell.textContent || '').replace(/\u200B/g, '').trim();
    return text.length > 0;
  });
}

export function addTableRow(table: HTMLTableElement, insertAtIndex?: number): HTMLTableRowElement {
  const doc = table.ownerDocument;
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = doc.createElement('tbody');
    table.appendChild(tbody);
  }
  const colCount = Math.max(
    table.querySelectorAll('thead th').length,
    ...Array.from(tbody.querySelectorAll('tr')).map((r) => r.children.length),
    1
  );

  const tr = doc.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const td = doc.createElement('td');
    td.innerHTML = '<br>';
    tr.appendChild(td);
  }

  const existingRows = Array.from(tbody.querySelectorAll('tr'));
  if (insertAtIndex !== undefined && insertAtIndex >= 0 && insertAtIndex < existingRows.length) {
    tbody.insertBefore(tr, existingRows[insertAtIndex]);
  } else {
    tbody.appendChild(tr);
  }

  return tr;
}

export function addTableColumn(table: HTMLTableElement, insertAtIndex?: number): void {
  const doc = table.ownerDocument;
  let thead = table.querySelector('thead');
  if (!thead) {
    thead = doc.createElement('thead');
    table.insertBefore(thead, table.firstChild);
  }
  let headerTr = thead.querySelector('tr');
  if (!headerTr) {
    headerTr = doc.createElement('tr');
    thead.appendChild(headerTr);
  }

  const currentCols = headerTr.children.length;
  const th = doc.createElement('th');
  th.textContent = tWebview('Spalte {0}', currentCols + 1);

  const headerCells = Array.from(headerTr.children);
  if (insertAtIndex !== undefined && insertAtIndex >= 0 && insertAtIndex < headerCells.length) {
    headerTr.insertBefore(th, headerCells[insertAtIndex]);
  } else {
    headerTr.appendChild(th);
  }

  const tbody = table.querySelector('tbody');
  if (tbody) {
    const bodyRows = Array.from(tbody.querySelectorAll('tr'));
    bodyRows.forEach((tr) => {
      const td = doc.createElement('td');
      td.innerHTML = '<br>';
      const cells = Array.from(tr.children);
      if (insertAtIndex !== undefined && insertAtIndex >= 0 && insertAtIndex < cells.length) {
        tr.insertBefore(td, cells[insertAtIndex]);
      } else {
        tr.appendChild(td);
      }
    });
  }
}

export function removeTableRow(table: HTMLTableElement, rowIndex: number, force: boolean = true): boolean {
  const tbody = table.querySelector('tbody');
  if (!tbody) return false;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (rowIndex < 0 || rowIndex >= rows.length) return false;
  const tr = rows[rowIndex];

  if (!force && rowHasContent(tr)) {
    return false;
  }

  tr.remove();
  return true;
}

export function removeTableColumn(table: HTMLTableElement, colIndex: number, force: boolean = true): boolean {
  const headerCells = table.querySelectorAll('thead th');
  if (headerCells.length <= 1) {
    return false; // Preserve at least one column
  }

  if (!force && columnHasContent(table, colIndex)) {
    return false;
  }

  const headerTr = table.querySelector('thead tr');
  if (headerTr && headerTr.children[colIndex]) {
    headerTr.children[colIndex].remove();
  }

  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
  bodyRows.forEach((tr) => {
    if (tr.children[colIndex]) {
      tr.children[colIndex].remove();
    }
  });

  return true;
}

/**
 * Displays an interactive confirmation popup anchored next to a delete button.
 */
export function showDeleteConfirmPopup(
  anchorEl: HTMLElement,
  wrapper: HTMLElement,
  options: DeleteConfirmOptions
): HTMLElement {
  // Dismiss any existing popup in the wrapper
  const existingPopup = wrapper.querySelector('.table-confirm-popup') as HTMLElement | null;
  if (existingPopup) {
    existingPopup.remove();
  }

  const doc = wrapper.ownerDocument;
  const popup = doc.createElement('div');
  popup.className = 'table-confirm-popup';
  popup.contentEditable = 'false';

  const titleEl = doc.createElement('div');
  titleEl.className = 'table-confirm-title';
  titleEl.textContent = options.title;

  const descEl = doc.createElement('div');
  descEl.className = 'table-confirm-desc';
  descEl.textContent = options.description;

  const actionsEl = doc.createElement('div');
  actionsEl.className = 'table-confirm-actions';

  const cancelBtn = doc.createElement('button');
  cancelBtn.className = 'table-confirm-btn table-confirm-cancel';
  cancelBtn.type = 'button';
  cancelBtn.textContent = tWebview('Abbrechen');

  const deleteBtn = doc.createElement('button');
  deleteBtn.className = 'table-confirm-btn table-confirm-delete';
  deleteBtn.type = 'button';
  deleteBtn.textContent = tWebview('Löschen');

  actionsEl.appendChild(cancelBtn);
  actionsEl.appendChild(deleteBtn);

  popup.appendChild(titleEl);
  popup.appendChild(descEl);
  popup.appendChild(actionsEl);

  wrapper.appendChild(popup);
  (wrapper as TableWrapperElement)._activeConfirmPopup = popup;

  // Position relative to wrapper and anchorEl
  const anchorRect = getRelativeRect(anchorEl, wrapper);
  const popupWidth = 200;
  const isCol = anchorEl.classList.contains('table-col-del-btn') || anchorEl.classList.contains('col-del');

  let popupLeft: number;
  let popupTop: number;

  if (isCol) {
    popupTop = anchorRect.top + anchorRect.height + 6;
    popupLeft = anchorRect.left - 40;
  } else {
    popupTop = anchorRect.top - 6;
    popupLeft = anchorRect.left + anchorRect.width + 8;
  }

  // Horizontal clamping within visible scroll boundaries
  const minLeft = wrapper.scrollLeft + 8;
  const maxLeft = wrapper.scrollLeft + (wrapper.clientWidth || 800) - popupWidth - 16;
  if (maxLeft > minLeft) {
    popupLeft = Math.max(minLeft, Math.min(popupLeft, maxLeft));
  }
  popupTop = Math.max(4, popupTop);

  popup.style.left = `${popupLeft}px`;
  popup.style.top = `${popupTop}px`;

  const closePopup = () => {
    if (popup.parentElement) {
      popup.remove();
    }
    if ((wrapper as TableWrapperElement)._activeConfirmPopup === popup) {
      (wrapper as TableWrapperElement)._activeConfirmPopup = null;
    }
    doc.removeEventListener('mousedown', onDocMouseDown, true);
    doc.removeEventListener('keydown', onDocKeyDown, true);
  };

  const onDocMouseDown = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
      closePopup();
      options.onCancel?.();
    }
  };

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePopup();
      options.onCancel?.();
    }
  };

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    closePopup();
    options.onCancel?.();
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    closePopup();
    options.onConfirm();
  });

  popup.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  doc.addEventListener('mousedown', onDocMouseDown, true);
  doc.addEventListener('keydown', onDocKeyDown, true);

  return popup;
}
