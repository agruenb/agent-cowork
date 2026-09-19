import { addTableRow } from './tableInsertDelete';

/**
 * Focuses a table cell and places the cursor at the end of its content.
 */
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

/**
 * Handles Tab and Shift+Tab navigation within tables.
 * When on the last cell, pressing Tab automatically creates a new row.
 */
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
  const cell =
    anchor && anchor.nodeType === 1
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
