/**
 * Row and column reordering logic for tables.
 */

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
