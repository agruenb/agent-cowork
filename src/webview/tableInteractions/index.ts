/**
 * Advanced Table Interactions module entry point.
 * Re-exports all sub-modules and provides the wireTableInteractions setup function.
 */

import { repositionTableControls, updateTableControls } from './tableControls';

export * from './tableDragDrop';
export * from './tableInsertDelete';
export * from './tableKeyboard';
export * from './tableControls';

interface TableWindow extends Window {
  _tableGlobalResizeWired?: boolean;
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
