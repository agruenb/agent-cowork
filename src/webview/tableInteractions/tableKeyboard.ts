import { addTableRow } from './tableInsertDelete';

/**
 * Focuses a table cell and places the cursor at the start or end of its content.
 */
export function focusCell(cell: HTMLElement, atEnd: boolean = true): void {
  cell.focus();
  const table = cell.closest('table');
  if (table) {
    table.querySelectorAll('.is-focused-cell').forEach((c) => {
      if (c !== cell) c.classList.remove('is-focused-cell');
    });
  }
  cell.classList.add('is-focused-cell');

  const doc = cell.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!win) return;
  const range = doc.createRange();
  range.selectNodeContents(cell);
  range.collapse(!atEnd);
  const sel = win.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Checks if the selection caret is at the beginning of the cell content.
 */
export function isAtStartOfCell(sel: Selection, cell: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const preRange = cell.ownerDocument.createRange();
    preRange.setStart(cell, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}

/**
 * Checks if the selection caret is at the end of the cell content.
 */
export function isAtEndOfCell(sel: Selection, cell: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const postRange = cell.ownerDocument.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(cell, cell.childNodes.length);
    return postRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}

/**
 * Checks if the selection caret is on the first line of the cell.
 */
export function isAtFirstLineOfCell(sel: Selection, cell: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const preRange = cell.ownerDocument.createRange();
    preRange.setStart(cell, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const fragment = preRange.cloneContents();
    if (fragment.querySelector('br, p, div') || preRange.toString().includes('\n')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the selection caret is on the last line of the cell.
 */
export function isAtLastLineOfCell(sel: Selection, cell: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const postRange = cell.ownerDocument.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(cell, cell.childNodes.length);
    const fragment = postRange.cloneContents();
    if (fragment.querySelector('br, p, div') || postRange.toString().includes('\n')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles Tab, Shift+Tab, and Arrow key navigation within tables.
 * - ArrowUp: moves to cell directly above (at same column).
 * - ArrowDown: moves to cell directly below (at same column).
 * - ArrowLeft: at start of cell, moves to previous cell (or end of prev row).
 * - ArrowRight: at end of cell, moves to next cell (or start of next row).
 * - Tab: moves to next cell (or creates new row if at last cell).
 * - Shift+Tab: moves to previous cell.
 */
export function handleTableKeyDown(
  e: KeyboardEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): boolean {
  const isArrow =
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown' ||
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight';

  if (e.key !== 'Tab' && !isArrow) return false;

  // Do not intercept modified arrow keys (allow text selection with Shift, word jumps with Alt, etc.)
  if (isArrow && (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey)) {
    return false;
  }

  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win?.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  // If text is selected (range not collapsed), let arrow keys collapse selection natively
  if (isArrow && !sel.isCollapsed) return false;

  const anchor = sel.anchorNode;
  const cell =
    anchor && anchor.nodeType === 1
      ? (anchor as HTMLElement).closest('td, th')
      : anchor?.parentElement?.closest('td, th');

  if (!cell || !editorCanvas.contains(cell)) {
    return false;
  }

  const table = cell.closest('table');
  if (!table) return false;

  const currentTr = cell.closest('tr');
  if (!currentTr) return false;

  // Build ordered list of all table rows (thead then tbody)
  const rows: HTMLTableRowElement[] = [];
  const theadTr = table.querySelector('thead tr');
  if (theadTr) {
    rows.push(theadTr as HTMLTableRowElement);
  }
  const tbodyTrs = table.querySelectorAll('tbody tr');
  tbodyTrs.forEach((tr) => rows.push(tr as HTMLTableRowElement));

  const rowIndex = rows.indexOf(currentTr as HTMLTableRowElement);
  const cellsInRow = Array.from(currentTr.children) as HTMLElement[];
  const colIndex = cellsInRow.indexOf(cell as HTMLElement);

  if (rowIndex === -1 || colIndex === -1) return false;

  // 1. Tab / Shift+Tab navigation
  if (e.key === 'Tab') {
    e.preventDefault();

    const allCells = Array.from(table.querySelectorAll('thead th, tbody td')) as HTMLElement[];
    const currentIndex = allCells.indexOf(cell as HTMLElement);

    if (e.shiftKey) {
      if (currentIndex > 0) {
        focusCell(allCells[currentIndex - 1], true);
      }
      return true;
    }

    if (currentIndex < allCells.length - 1) {
      focusCell(allCells[currentIndex + 1], true);
      return true;
    }

    // At the last cell: automatically add a new row and focus its first cell
    const newRow = addTableRow(table);
    emitEdit();
    const firstTd = newRow.querySelector('td');
    if (firstTd) {
      focusCell(firstTd, false);
    }
    return true;
  }

  // 2. ArrowUp: navigate to row above at same column
  if (e.key === 'ArrowUp') {
    if (!isAtFirstLineOfCell(sel, cell as HTMLElement)) {
      return false;
    }
    if (rowIndex > 0) {
      e.preventDefault();
      const targetRow = rows[rowIndex - 1];
      const targetCells = Array.from(targetRow.children) as HTMLElement[];
      const targetCol = Math.min(colIndex, targetCells.length - 1);
      if (targetCol >= 0 && targetCells[targetCol]) {
        focusCell(targetCells[targetCol], true);
        return true;
      }
    }
    return false;
  }

  // 3. ArrowDown: navigate to row below at same column
  if (e.key === 'ArrowDown') {
    if (!isAtLastLineOfCell(sel, cell as HTMLElement)) {
      return false;
    }
    if (rowIndex < rows.length - 1) {
      e.preventDefault();
      const targetRow = rows[rowIndex + 1];
      const targetCells = Array.from(targetRow.children) as HTMLElement[];
      const targetCol = Math.min(colIndex, targetCells.length - 1);
      if (targetCol >= 0 && targetCells[targetCol]) {
        focusCell(targetCells[targetCol], true);
        return true;
      }
    }
    return false;
  }

  // 4. ArrowLeft: at start of cell, move to previous cell or end of previous row
  if (e.key === 'ArrowLeft') {
    if (!isAtStartOfCell(sel, cell as HTMLElement)) {
      return false;
    }
    if (colIndex > 0) {
      e.preventDefault();
      focusCell(cellsInRow[colIndex - 1], true);
      return true;
    } else if (rowIndex > 0) {
      e.preventDefault();
      const prevRow = rows[rowIndex - 1];
      const prevRowCells = Array.from(prevRow.children) as HTMLElement[];
      if (prevRowCells.length > 0) {
        focusCell(prevRowCells[prevRowCells.length - 1], true);
        return true;
      }
    }
    return false;
  }

  // 5. ArrowRight: at end of cell, move to next cell or start of next row
  if (e.key === 'ArrowRight') {
    if (!isAtEndOfCell(sel, cell as HTMLElement)) {
      return false;
    }
    if (colIndex < cellsInRow.length - 1) {
      e.preventDefault();
      focusCell(cellsInRow[colIndex + 1], false);
      return true;
    } else if (rowIndex < rows.length - 1) {
      e.preventDefault();
      const nextRow = rows[rowIndex + 1];
      const nextRowCells = Array.from(nextRow.children) as HTMLElement[];
      if (nextRowCells.length > 0) {
        focusCell(nextRowCells[0], false);
        return true;
      }
    }
    return false;
  }

  return false;
}
