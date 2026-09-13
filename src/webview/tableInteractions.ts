/**
 * Advanced Table Interactions for the Agent Cowork Markdown Editor.
 *
 * Provides:
 * 1. Checkbox cell interaction (entire cell toggles checkbox on click)
 * 2. Row and column reordering via drag handles on the side/top
 * 3. Add rows and columns (on hover at table ends and between rows/columns)
 * 4. Remove rows and columns (with confirmation if they contain content)
 * 5. Tab / Shift+Tab keyboard navigation between table cells
 */

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

export function moveTableRow(tbody: HTMLTableSectionElement, fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (fromIndex < 0 || fromIndex >= rows.length || toIndex < 0 || toIndex >= rows.length) return;
  const rowToMove = rows[fromIndex];
  if (toIndex >= rows.length - 1) {
    tbody.appendChild(rowToMove);
  } else {
    const refRow = toIndex > fromIndex ? rows[toIndex + 1] : rows[toIndex];
    tbody.insertBefore(rowToMove, refRow);
  }
}

export function moveTableColumn(table: HTMLTableElement, fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  rows.forEach((row) => {
    const cells = Array.from(row.children);
    if (fromIndex < cells.length) {
      const cellToMove = cells[fromIndex];
      if (toIndex >= cells.length - 1) {
        row.appendChild(cellToMove);
      } else {
        const refCell = toIndex > fromIndex ? cells[toIndex + 1] : cells[toIndex];
        row.insertBefore(cellToMove, refCell);
      }
    }
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
  th.textContent = `Spalte ${currentCols + 1}`;

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

export function focusCell(cell: HTMLElement): void {
  cell.focus();
  const doc = cell.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!win) return;
  const range = doc.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const sel = win.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export function handleTableKeyDown(
  e: KeyboardEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): boolean {
  if (e.key !== 'Tab') return false;

  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win?.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  const anchor = sel.anchorNode;
  const cell = anchor && anchor.nodeType === 1
    ? (anchor as HTMLElement).closest('td, th')
    : anchor?.parentElement?.closest('td, th');

  if (!cell || !editorCanvas.contains(cell)) {
    return false;
  }

  const table = cell.closest('table');
  if (!table) return false;

  e.preventDefault();

  const allCells = Array.from(table.querySelectorAll('thead th, tbody td')) as HTMLElement[];
  const currentIndex = allCells.indexOf(cell as HTMLElement);

  if (e.shiftKey) {
    if (currentIndex > 0) {
      focusCell(allCells[currentIndex - 1]);
    }
    return true;
  }

  if (currentIndex < allCells.length - 1) {
    focusCell(allCells[currentIndex + 1]);
    return true;
  }

  // At the last cell: automatically add a new row and focus its first cell
  const newRow = addTableRow(table);
  emitEdit();
  const firstTd = newRow.querySelector('td');
  if (firstTd) {
    focusCell(firstTd);
  }
  return true;
}

function getRelativeRect(child: HTMLElement, parent: HTMLElement) {
  const childRect = child.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return {
    left: childRect.left - parentRect.left + parent.scrollLeft,
    top: childRect.top - parentRect.top + parent.scrollTop,
    width: childRect.width,
    height: childRect.height,
  };
}

interface TableWrapperElement extends HTMLElement {
  _activeConfirmPopup?: HTMLElement | null;
  _tableScrollHandler?: (e: Event) => void;
  _tableResizeObserver?: ResizeObserver;
  _tableMouseMoveHandler?: (e: MouseEvent) => void;
}

interface TableWindow extends Window {
  _tableGlobalResizeWired?: boolean;
}

export interface DeleteConfirmOptions {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

let globalIsDragging = false;

function createSvgElement(
  doc: Document,
  svgContent: string,
  width: number,
  height: number,
  viewBox: string,
  fill: string = 'currentColor'
): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', fill);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  svg.style.pointerEvents = 'none';
  svg.innerHTML = svgContent;
  return svg;
}

export function createRowGripIcon(doc: Document): SVGSVGElement {
  return createSvgElement(
    doc,
    '<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>',
    8,
    12,
    '0 0 8 12'
  );
}

export function createColGripIcon(doc: Document): SVGSVGElement {
  return createSvgElement(
    doc,
    '<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="10" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="10" cy="6" r="1.2"/>',
    12,
    8,
    '0 0 12 8'
  );
}

export function createMinusIcon(doc: Document): SVGSVGElement {
  const svg = createSvgElement(
    doc,
    '<line x1="2" y1="5" x2="8" y2="5"/>',
    10,
    10,
    '0 0 10 10',
    'none'
  );
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  return svg;
}

export function createPlusIcon(doc: Document): SVGSVGElement {
  const svg = createSvgElement(
    doc,
    '<line x1="5" y1="2" x2="5" y2="8"/><line x1="2" y1="5" x2="8" y2="5"/>',
    10,
    10,
    '0 0 10 10',
    'none'
  );
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  return svg;
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
  cancelBtn.textContent = 'Abbrechen';

  const deleteBtn = doc.createElement('button');
  deleteBtn.className = 'table-confirm-btn table-confirm-delete';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Löschen';

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

/**
 * Repositions all table controls (drag handles, delete buttons, insert buttons)
 * based on the table's current live geometry and horizontal scroll position.
 */
export function repositionTableControls(wrapper: HTMLElement): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.editor-table');
  const controls = wrapper.querySelector<HTMLElement>('.table-controls');
  if (!table || !controls) return;

  const theadThs = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  const tbodyTrs = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));

  // Reposition column controls (delete above, drag handle below, both centered)
  theadThs.forEach((th, colIdx) => {
    const thRect = getRelativeRect(th, wrapper);
    const colDragBtn = controls.querySelector<HTMLElement>(`.table-col-drag-btn[data-col-idx="${colIdx}"]`);
    const colDelBtn = controls.querySelector<HTMLElement>(`.table-col-del-btn[data-col-idx="${colIdx}"]`);
    const insertColBtn = controls.querySelector<HTMLElement>(`.col-insert-btn[data-col-idx="${colIdx}"]`);

    const colCenterX = thRect.left + thRect.width / 2;

    // Drag handle sits just above the header, centered
    if (colDragBtn) {
      colDragBtn.style.top = `${thRect.top - 24}px`;
      colDragBtn.style.left = `${colCenterX - 9}px`;
    }

    // Delete button sits above the drag handle, centered
    if (colDelBtn) {
      colDelBtn.style.top = `${thRect.top - 46}px`;
      colDelBtn.style.left = `${colCenterX - 9}px`;
    }

    if (insertColBtn) {
      insertColBtn.style.top = `${thRect.top - 24}px`;
      insertColBtn.style.left = `${thRect.left + thRect.width - 9}px`;
    }
  });

  // Reposition row controls (centered in left gutter, pinned on scroll)
  tbodyTrs.forEach((tr, rowIdx) => {
    const trRect = getRelativeRect(tr, wrapper);
    const rowDragBtn = controls.querySelector<HTMLElement>(`.table-row-drag-btn[data-row-idx="${rowIdx}"]`);
    const rowDelBtn = controls.querySelector<HTMLElement>(`.table-row-del-btn[data-row-idx="${rowIdx}"]`);
    const insertRowBtn = controls.querySelector<HTMLElement>(`.row-insert-btn[data-row-idx="${rowIdx}"]`);

    const trCenterY = trRect.top + trRect.height / 2;

    if (rowDragBtn) {
      rowDragBtn.style.top = `${trCenterY - 9}px`;
      rowDragBtn.style.left = `${trRect.left - 28 + wrapper.scrollLeft}px`;
    }

    if (rowDelBtn) {
      rowDelBtn.style.top = `${trCenterY - 9}px`;
      rowDelBtn.style.left = `${trRect.left - 52 + wrapper.scrollLeft}px`;
    }

    if (insertRowBtn) {
      insertRowBtn.style.top = `${trRect.top + trRect.height - 9}px`;
      insertRowBtn.style.left = `${trRect.left - 28 + wrapper.scrollLeft}px`;
    }
  });
}

/**
 * Updates or constructs the controls overlay for a single table wrapper.
 */
export function updateTableControls(wrapper: HTMLElement, emitEdit: () => void): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.editor-table');
  if (!table) return;

  const doc = wrapper.ownerDocument;

  let controls = wrapper.querySelector<HTMLElement>('.table-controls');
  if (!controls) {
    controls = doc.createElement('div');
    controls.className = 'table-controls';
    controls.contentEditable = 'false';
    wrapper.insertBefore(controls, wrapper.firstChild);
  }

  // Clear previous buttons/handles while preserving drop indicators
  controls.innerHTML = '';

  // Drop indicators
  const rowIndicator = doc.createElement('div');
  rowIndicator.className = 'table-drop-indicator-row';
  rowIndicator.style.display = 'none';
  controls.appendChild(rowIndicator);

  const colIndicator = doc.createElement('div');
  colIndicator.className = 'table-drop-indicator-col';
  colIndicator.style.display = 'none';
  controls.appendChild(colIndicator);

  const theadThs = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  const tbodyTrs = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));

  const colDragBtns: HTMLElement[] = [];
  const colDelBtns: HTMLElement[] = [];
  const colInsertBtns: HTMLElement[] = [];
  const rowDragBtns: HTMLElement[] = [];
  const rowDelBtns: HTMLElement[] = [];
  const rowInsertBtns: HTMLElement[] = [];

  let activeRowIdx: number | null = null;
  let activeColIdx: number | null = null;
  let isDraggingRow = false;
  let isDraggingCol = false;

  let dragSourceColIdx: number | null = null;
  let dragSourceRowIdx: number | null = null;

  function updateVisibility() {
    colDragBtns.forEach((btn, idx) => {
      // During drag, only show the handle being dragged
      if (isDraggingCol) {
        btn.style.display = idx === dragSourceColIdx ? 'flex' : 'none';
      } else if (isDraggingRow) {
        btn.style.display = 'none';
      } else {
        btn.style.display = idx === activeColIdx ? 'flex' : 'none';
      }
    });
    colDelBtns.forEach((btn, idx) => {
      btn.style.display = idx === activeColIdx && !isDraggingCol && !isDraggingRow ? 'flex' : 'none';
    });
    colInsertBtns.forEach((btn, idx) => {
      btn.style.display = idx === activeColIdx && !isDraggingCol && !isDraggingRow ? 'flex' : 'none';
    });
    rowDragBtns.forEach((btn, idx) => {
      // During drag, only show the handle being dragged
      if (isDraggingRow) {
        btn.style.display = idx === dragSourceRowIdx ? 'flex' : 'none';
      } else if (isDraggingCol) {
        btn.style.display = 'none';
      } else {
        btn.style.display = idx === activeRowIdx ? 'flex' : 'none';
      }
    });
    rowDelBtns.forEach((btn, idx) => {
      btn.style.display = idx === activeRowIdx && !isDraggingRow && !isDraggingCol ? 'flex' : 'none';
    });
    rowInsertBtns.forEach((btn, idx) => {
      btn.style.display = idx === activeRowIdx && !isDraggingRow && !isDraggingCol ? 'flex' : 'none';
    });
  }

  // 1. Column Controls (rendered outside above th)
  theadThs.forEach((th, colIdx) => {
    const thRect = getRelativeRect(th, wrapper);
    const colCenterX = thRect.left + thRect.width / 2;
    const hasMultipleCols = theadThs.length > 1;

    // Drag Handle Button (sits just above header, centered)
    const colDragBtn = doc.createElement('div');
    colDragBtn.className = 'table-col-handle table-col-drag-btn';
    colDragBtn.setAttribute('data-col-idx', String(colIdx));
    colDragBtn.style.top = `${thRect.top - 24}px`;
    colDragBtn.style.width = '18px';
    colDragBtn.style.height = '18px';
    colDragBtn.style.left = `${colCenterX - 9}px`;
    colDragBtn.style.display = 'none';
    colDragBtn.title = 'Spalte ziehen zum Verschieben';

    const colGrip = doc.createElement('span');
    colGrip.className = 'table-grip col-grip';
    colGrip.appendChild(createColGripIcon(doc));
    colDragBtn.appendChild(colGrip);
    controls.appendChild(colDragBtn);
    colDragBtns.push(colDragBtn);

    // Delete Button (above the drag handle, centered)
    let colDelBtn: HTMLElement | null = null;
    if (hasMultipleCols) {
      colDelBtn = doc.createElement('button');
      colDelBtn.className = 'table-btn-del table-col-del-btn col-del';
      colDelBtn.setAttribute('data-col-idx', String(colIdx));
      colDelBtn.appendChild(createMinusIcon(doc));
      colDelBtn.title = 'Spalte löschen';
      colDelBtn.style.top = `${thRect.top - 46}px`;
      colDelBtn.style.left = `${colCenterX - 9}px`;
      colDelBtn.style.display = 'none';

      colDelBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      colDelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const needsConfirm = columnHasContent(table, colIdx);
        if (needsConfirm) {
          colDelBtn?.classList.add('is-active');
          showDeleteConfirmPopup(colDelBtn!, wrapper, {
            title: 'Spalte löschen?',
            description: 'Inhalte in dieser Spalte gehen verloren.',
            onConfirm: () => {
              colDelBtn?.classList.remove('is-active');
              if (removeTableColumn(table, colIdx, true)) {
                activeColIdx = null;
                emitEdit();
                updateTableControls(wrapper, emitEdit);
              }
            },
            onCancel: () => {
              colDelBtn?.classList.remove('is-active');
            },
          });
          return;
        }

        // Direct delete if empty
        if (removeTableColumn(table, colIdx, true)) {
          activeColIdx = null;
          emitEdit();
          updateTableControls(wrapper, emitEdit);
        }
      });

      controls.appendChild(colDelBtn);
      colDelBtns.push(colDelBtn);
    }

    // Drag & drop reordering for column
    colDragBtn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceIdx = colIdx;
      isDraggingCol = true;
      globalIsDragging = true;
      dragSourceColIdx = colIdx;
      wrapper.classList.add('is-table-dragging');
      colDragBtn.classList.add('is-dragging');
      colDragBtn.style.transition = 'none';
      updateVisibility();

      const thRect = getRelativeRect(th, wrapper);
      const colCenterX = thRect.left + thRect.width / 2;
      const liveTableRect = getRelativeRect(table, wrapper);

      colIndicator.style.display = 'block';
      colIndicator.style.left = `${colCenterX - 1}px`;
      colIndicator.style.top = `${liveTableRect.top}px`;
      colIndicator.style.height = `${liveTableRect.height}px`;

      const btnRect = colDragBtn.getBoundingClientRect();
      const grabOffsetX = e.clientX - btnRect.left;

      let dropColIdx = sourceIdx;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const thRects = theadThs.map((h) => getRelativeRect(h, wrapper));
        const wrapperRect = wrapper.getBoundingClientRect();
        const currentLeft = moveEvent.clientX - wrapperRect.left + wrapper.scrollLeft - grabOffsetX;

        colDragBtn.style.left = `${currentLeft}px`;

        const mouseX = moveEvent.clientX - wrapperRect.left + wrapper.scrollLeft;
        let closestIdx = theadThs.length;
        let indicatorX = thRects[thRects.length - 1].left + thRects[thRects.length - 1].width;

        for (let i = 0; i < thRects.length; i++) {
          const r = thRects[i];
          const mid = r.left + r.width / 2;
          if (mouseX < mid) {
            closestIdx = i;
            indicatorX = r.left;
            break;
          } else if (mouseX < r.left + r.width) {
            closestIdx = i + 1;
            indicatorX = r.left + r.width;
            break;
          }
        }

        dropColIdx = closestIdx;
        colIndicator.style.left = `${indicatorX - 1}px`;
      };

      const onMouseUp = () => {
        doc.removeEventListener('mousemove', onMouseMove);
        doc.removeEventListener('mouseup', onMouseUp);
        isDraggingCol = false;
        globalIsDragging = false;
        dragSourceColIdx = null;
        wrapper.classList.remove('is-table-dragging');
        colDragBtn.classList.remove('is-dragging');
        colDragBtn.style.transition = '';
        colIndicator.style.display = 'none';

        if (dropColIdx !== sourceIdx && dropColIdx !== sourceIdx + 1) {
          const targetIdx = dropColIdx > sourceIdx ? dropColIdx - 1 : dropColIdx;
          moveTableColumn(table, sourceIdx, targetIdx);
          activeColIdx = targetIdx;
          emitEdit();
          updateTableControls(wrapper, emitEdit);
        } else {
          repositionTableControls(wrapper);
          updateVisibility();
        }
      };

      doc.addEventListener('mousemove', onMouseMove);
      doc.addEventListener('mouseup', onMouseUp);
    });

    // Add "+" insert button at the right boundary of each column (rendered outside above table)
    const insertColBtn = doc.createElement('button');
    insertColBtn.className = 'table-insert-btn col-insert-btn';
    insertColBtn.setAttribute('data-col-idx', String(colIdx));
    insertColBtn.appendChild(createPlusIcon(doc));
    const isLastCol = colIdx === theadThs.length - 1;
    insertColBtn.title = isLastCol ? 'Spalte hinzufügen' : 'Spalte hier einfügen';
    insertColBtn.style.left = `${thRect.left + thRect.width - 9}px`;
    insertColBtn.style.top = `${thRect.top - 24}px`;
    insertColBtn.style.display = 'none';
    insertColBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    insertColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      addTableColumn(table, isLastCol ? undefined : colIdx + 1);
      activeColIdx = isLastCol ? theadThs.length : colIdx + 1;
      emitEdit();
      updateTableControls(wrapper, emitEdit);
    });
    controls.appendChild(insertColBtn);
    colInsertBtns.push(insertColBtn);
  });

  // 2. Row Controls (rendered outside in left margin)
  tbodyTrs.forEach((tr, rowIdx) => {
    const trRect = getRelativeRect(tr, wrapper);
    const trCenterY = trRect.top + trRect.height / 2;

    // Drag Handle Button (centered in left gutter, aligns with insert button)
    const rowDragBtn = doc.createElement('div');
    rowDragBtn.className = 'table-row-handle table-row-drag-btn';
    rowDragBtn.setAttribute('data-row-idx', String(rowIdx));
    rowDragBtn.style.top = `${trCenterY - 9}px`;
    rowDragBtn.style.left = `${trRect.left - 28 + wrapper.scrollLeft}px`;
    rowDragBtn.style.width = '18px';
    rowDragBtn.style.height = '18px';
    rowDragBtn.style.display = 'none';
    rowDragBtn.title = 'Zeile ziehen zum Verschieben';

    const rowGrip = doc.createElement('span');
    rowGrip.className = 'table-grip row-grip';
    rowGrip.appendChild(createRowGripIcon(doc));
    rowDragBtn.appendChild(rowGrip);
    controls.appendChild(rowDragBtn);
    rowDragBtns.push(rowDragBtn);

    // Delete Button (matching add-button style, placed to left of drag handle)
    const rowDelBtn = doc.createElement('button');
    rowDelBtn.className = 'table-btn-del table-row-del-btn row-del';
    rowDelBtn.setAttribute('data-row-idx', String(rowIdx));
    rowDelBtn.appendChild(createMinusIcon(doc));
    rowDelBtn.title = 'Zeile löschen';
    rowDelBtn.style.top = `${trCenterY - 9}px`;
    rowDelBtn.style.left = `${trRect.left - 52 + wrapper.scrollLeft}px`;
    rowDelBtn.style.display = 'none';

    rowDelBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    rowDelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const needsConfirm = rowHasContent(tr);
      if (needsConfirm) {
        rowDelBtn.classList.add('is-active');
        showDeleteConfirmPopup(rowDelBtn, wrapper, {
          title: 'Zeile löschen?',
          description: 'Inhalte in dieser Zeile gehen verloren.',
          onConfirm: () => {
            rowDelBtn.classList.remove('is-active');
            if (removeTableRow(table, rowIdx, true)) {
              activeRowIdx = null;
              emitEdit();
              updateTableControls(wrapper, emitEdit);
            }
          },
          onCancel: () => {
            rowDelBtn.classList.remove('is-active');
          },
        });
        return;
      }

      // Direct delete if empty
      if (removeTableRow(table, rowIdx, true)) {
        activeRowIdx = null;
        emitEdit();
        updateTableControls(wrapper, emitEdit);
      }
    });

    controls.appendChild(rowDelBtn);
    rowDelBtns.push(rowDelBtn);

    // Drag & drop reordering for row
    rowDragBtn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const sourceIdx = rowIdx;
      isDraggingRow = true;
      globalIsDragging = true;
      dragSourceRowIdx = rowIdx;
      wrapper.classList.add('is-table-dragging');
      rowDragBtn.classList.add('is-dragging');
      rowDragBtn.style.transition = 'none';
      updateVisibility();

      const trRect = getRelativeRect(tr, wrapper);
      const trCenterY = trRect.top + trRect.height / 2;
      const liveTableRect = getRelativeRect(table, wrapper);

      rowIndicator.style.display = 'block';
      rowIndicator.style.left = `${liveTableRect.left}px`;
      rowIndicator.style.width = `${liveTableRect.width}px`;
      rowIndicator.style.top = `${trCenterY - 1}px`;

      const btnRect = rowDragBtn.getBoundingClientRect();
      const grabOffsetY = e.clientY - btnRect.top;

      let dropRowIdx = sourceIdx;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const trRects = tbodyTrs.map((r) => getRelativeRect(r, wrapper));
        const wrapperRect = wrapper.getBoundingClientRect();
        const currentTop = moveEvent.clientY - wrapperRect.top + wrapper.scrollTop - grabOffsetY;

        rowDragBtn.style.top = `${currentTop}px`;

        const mouseY = moveEvent.clientY - wrapperRect.top + wrapper.scrollTop;
        let closestIdx = tbodyTrs.length;
        let indicatorY = trRects[trRects.length - 1].top + trRects[trRects.length - 1].height;

        for (let i = 0; i < trRects.length; i++) {
          const r = trRects[i];
          const mid = r.top + r.height / 2;
          if (mouseY < mid) {
            closestIdx = i;
            indicatorY = r.top;
            break;
          } else if (mouseY < r.top + r.height) {
            closestIdx = i + 1;
            indicatorY = r.top + r.height;
            break;
          }
        }

        dropRowIdx = closestIdx;
        rowIndicator.style.top = `${indicatorY - 1}px`;
      };

      const onMouseUp = () => {
        doc.removeEventListener('mousemove', onMouseMove);
        doc.removeEventListener('mouseup', onMouseUp);
        isDraggingRow = false;
        globalIsDragging = false;
        dragSourceRowIdx = null;
        wrapper.classList.remove('is-table-dragging');
        rowDragBtn.classList.remove('is-dragging');
        rowDragBtn.style.transition = '';
        rowIndicator.style.display = 'none';

        if (dropRowIdx !== sourceIdx && dropRowIdx !== sourceIdx + 1) {
          const targetIdx = dropRowIdx > sourceIdx ? dropRowIdx - 1 : dropRowIdx;
          moveTableRow(tbody, sourceIdx, targetIdx);
          activeRowIdx = targetIdx;
          emitEdit();
          updateTableControls(wrapper, emitEdit);
        } else {
          repositionTableControls(wrapper);
          updateVisibility();
        }
      };

      doc.addEventListener('mousemove', onMouseMove);
      doc.addEventListener('mouseup', onMouseUp);
    });

    // Add "+" insert button at the bottom boundary of each row (aligned with row drag button)
    const insertRowBtn = doc.createElement('button');
    insertRowBtn.className = 'table-insert-btn row-insert-btn';
    insertRowBtn.setAttribute('data-row-idx', String(rowIdx));
    insertRowBtn.appendChild(createPlusIcon(doc));
    const isLastRow = rowIdx === tbodyTrs.length - 1;
    insertRowBtn.title = isLastRow ? 'Zeile hinzufügen' : 'Zeile hier einfügen';
    insertRowBtn.style.left = `${trRect.left - 28 + wrapper.scrollLeft}px`;
    insertRowBtn.style.top = `${trRect.top + trRect.height - 9}px`;
    insertRowBtn.style.display = 'none';
    insertRowBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    insertRowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      addTableRow(table, isLastRow ? undefined : rowIdx + 1);
      activeRowIdx = isLastRow ? tbodyTrs.length : rowIdx + 1;
      emitEdit();
      updateTableControls(wrapper, emitEdit);
    });
    controls.appendChild(insertRowBtn);
    rowInsertBtns.push(insertRowBtn);
  });

  // If table has no body rows, provide "+" button to add first row
  if (tbodyTrs.length === 0) {
    const theadEl = table.querySelector('thead');
    if (theadEl) {
      const theadRect = getRelativeRect(theadEl, wrapper);
      const addRowBtn = doc.createElement('button');
      addRowBtn.className = 'table-insert-btn row-insert-btn';
      addRowBtn.appendChild(createPlusIcon(doc));
      addRowBtn.title = 'Zeile hinzufügen';
      addRowBtn.style.left = `${theadRect.left - 28 + wrapper.scrollLeft}px`;
      addRowBtn.style.top = `${theadRect.top + theadRect.height - 9}px`;
      addRowBtn.style.display = 'none';
      addRowBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      addRowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        addTableRow(table);
        activeRowIdx = 0;
        emitEdit();
        updateTableControls(wrapper, emitEdit);
      });
      controls.appendChild(addRowBtn);
      rowInsertBtns.push(addRowBtn);
    }
  }

  // Scroll listener on wrapper to keep row handles sticky to visible left gutter when scrolled horizontally
  if ((wrapper as TableWrapperElement)._tableScrollHandler) {
    wrapper.removeEventListener('scroll', (wrapper as TableWrapperElement)._tableScrollHandler!);
  }
  const onWrapperScroll = () => {
    repositionTableControls(wrapper);
  };
  (wrapper as TableWrapperElement)._tableScrollHandler = onWrapperScroll;
  wrapper.addEventListener('scroll', onWrapperScroll);

  // ResizeObserver on wrapper & table for automatic dynamic realignment on window/container resize
  if (typeof ResizeObserver !== 'undefined') {
    if ((wrapper as TableWrapperElement)._tableResizeObserver) {
      (wrapper as TableWrapperElement)._tableResizeObserver!.disconnect();
    }
    const ro = new ResizeObserver(() => {
      if (wrapper.isConnected) {
        repositionTableControls(wrapper);
      }
    });
    ro.observe(wrapper);
    ro.observe(table);
    (wrapper as TableWrapperElement)._tableResizeObserver = ro;
  }

  // Hover detection with extended hit zone so controls outside the table remain fully reachable and clickable
  const onDocMouseMove = (e: MouseEvent) => {
    if (isDraggingRow || isDraggingCol || globalIsDragging) return;

    if (!wrapper.isConnected) {
      doc.removeEventListener('mousemove', onDocMouseMove);
      return;
    }

    // If confirmation popup is active, keep active controls visible
    if ((wrapper as TableWrapperElement)._activeConfirmPopup) {
      return;
    }

    // 1. Direct control hover check
    const target = e.target as HTMLElement | null;
    const directControl = target?.closest(
      '.table-row-handle, .table-row-drag-btn, .table-row-del-btn, .row-insert-btn, .table-col-handle, .table-col-drag-btn, .table-col-del-btn, .col-insert-btn, .table-confirm-popup'
    ) as HTMLElement | null;

    if (directControl && wrapper.contains(directControl)) {
      const rAttr = directControl.getAttribute('data-row-idx');
      const cAttr = directControl.getAttribute('data-col-idx');
      if (rAttr !== null) activeRowIdx = parseInt(rAttr, 10);
      if (cAttr !== null) activeColIdx = parseInt(cAttr, 10);
      updateVisibility();
      return;
    }

    // 2. Zone check around the table and gutters
    const tRect = table.getBoundingClientRect();
    const hitLeft = tRect.left - 70;
    const hitRight = tRect.right + 40;
    const hitTop = tRect.top - 60;
    const hitBottom = tRect.bottom + 40;

    const inZone =
      e.clientX >= hitLeft &&
      e.clientX <= hitRight &&
      e.clientY >= hitTop &&
      e.clientY <= hitBottom;

    if (!inZone) {
      if (activeRowIdx !== null || activeColIdx !== null) {
        activeRowIdx = null;
        activeColIdx = null;
        updateVisibility();
      }
      return;
    }

    // 3. Mouse in left gutter: keep row handle visible and clickable
    if (e.clientX < tRect.left) {
      let matchedRowIdx: number | null = null;
      if (activeRowIdx !== null && activeRowIdx >= 0 && activeRowIdx < tbodyTrs.length) {
        const trB = tbodyTrs[activeRowIdx].getBoundingClientRect();
        if (e.clientY >= trB.top - 18 && e.clientY <= trB.bottom + 18) {
          matchedRowIdx = activeRowIdx;
        }
      }
      if (matchedRowIdx === null) {
        let bestDist = Infinity;
        for (let i = 0; i < tbodyTrs.length; i++) {
          const trB = tbodyTrs[i].getBoundingClientRect();
          const midY = (trB.top + trB.bottom) / 2;
          const dist = Math.abs(e.clientY - midY);
          if (dist < bestDist && e.clientY >= trB.top - 10 && e.clientY <= trB.bottom + 10) {
            bestDist = dist;
            matchedRowIdx = i;
          }
        }
      }
      if (matchedRowIdx !== null) {
        activeRowIdx = matchedRowIdx;
      }
      updateVisibility();
      return;
    }

    // 4. Mouse in top gutter: keep column handle visible and clickable
    if (e.clientY < tRect.top) {
      let matchedColIdx: number | null = null;
      if (activeColIdx !== null && activeColIdx >= 0 && activeColIdx < theadThs.length) {
        const thB = theadThs[activeColIdx].getBoundingClientRect();
        if (e.clientX >= thB.left - 18 && e.clientX <= thB.right + 18) {
          matchedColIdx = activeColIdx;
        }
      }
      if (matchedColIdx === null) {
        let bestDist = Infinity;
        for (let j = 0; j < theadThs.length; j++) {
          const thB = theadThs[j].getBoundingClientRect();
          const midX = (thB.left + thB.right) / 2;
          const dist = Math.abs(e.clientX - midX);
          if (dist < bestDist && e.clientX >= thB.left - 10 && e.clientX <= thB.right + 10) {
            bestDist = dist;
            matchedColIdx = j;
          }
        }
      }
      if (matchedColIdx !== null) {
        activeColIdx = matchedColIdx;
      }
      updateVisibility();
      return;
    }

    // 5. Inside table: hovered cell activates row & column
    const cell = target?.closest('td, th') as HTMLElement | null;
    if (cell && table.contains(cell)) {
      const tr = cell.closest('tr');
      if (tr && tr.parentElement?.tagName.toLowerCase() === 'tbody') {
        const rIdx = tbodyTrs.indexOf(tr as HTMLTableRowElement);
        activeRowIdx = rIdx >= 0 ? rIdx : null;
      } else {
        activeRowIdx = null;
      }

      const cellsInRow = Array.from(tr?.children || []);
      const cIdx = cellsInRow.indexOf(cell);
      activeColIdx = cIdx >= 0 ? cIdx : null;

      updateVisibility();
      return;
    }
  };

  if ((wrapper as TableWrapperElement)._tableMouseMoveHandler) {
    doc.removeEventListener('mousemove', (wrapper as TableWrapperElement)._tableMouseMoveHandler!);
  }
  (wrapper as TableWrapperElement)._tableMouseMoveHandler = onDocMouseMove;
  doc.addEventListener('mousemove', onDocMouseMove);
}

/**
 * Initializes all table listeners and interactions across all tables in the editor.
 */
export function wireTableInteractions(editorCanvas: HTMLElement, emitEdit: () => void): void {
  const tableWrappers = editorCanvas.querySelectorAll<HTMLElement>('.table-wrapper');
  tableWrappers.forEach((wrapper) => {
    updateTableControls(wrapper, emitEdit);
  });

  // Global window resize listener to keep table controls aligned on window/split resize
  const win = editorCanvas.ownerDocument.defaultView;
  if (win && !(win as unknown as TableWindow)._tableGlobalResizeWired) {
    (win as unknown as TableWindow)._tableGlobalResizeWired = true;
    win.addEventListener('resize', () => {
      const currentWrappers = editorCanvas.querySelectorAll<HTMLElement>('.table-wrapper');
      currentWrappers.forEach((wrapper) => {
        repositionTableControls(wrapper);
      });
    });
  }
}
