/**
 * Task List Interactions: drag-reorder handles, delete buttons for checked items,
 * and "send to top" button for checked items.
 *
 * Follows the same pattern as tableInteractions/tableControls.ts:
 * - Controls are rendered as an overlay inside the task list
 * - Visibility is driven by hover detection
 * - Drag-reorder uses mousedown/mousemove/mouseup on document
 */

import { tWebview } from './i18n';

// ────────────────────────────────────────────
// SVG Icons
// ────────────────────────────────────────────

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

function createGripIcon(doc: Document): SVGSVGElement {
  return createSvgElement(
    doc,
    '<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>',
    8,
    12,
    '0 0 8 12'
  );
}

function createDeleteIcon(doc: Document): SVGSVGElement {
  const svg = createSvgElement(
    doc,
    '<line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/>',
    10,
    10,
    '0 0 14 14',
    'none'
  );
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  return svg;
}

function createSendToTopIcon(doc: Document): SVGSVGElement {
  const svg = createSvgElement(
    doc,
    '<line x1="5" y1="8" x2="5" y2="2"/><polyline points="2,4 5,1.5 8,4"/><line x1="2" y1="9" x2="8" y2="9"/>',
    10,
    10,
    '0 0 10 10',
    'none'
  );
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

// ────────────────────────────────────────────
// Task list item movement
// ────────────────────────────────────────────

/**
 * Moves a task list item from one index to another within its parent list.
 */
export function moveTaskItem(parentList: HTMLElement, fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return;
  const items = Array.from(parentList.querySelectorAll(':scope > li'));
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
  const itemToMove = items[fromIndex];
  if (toIndex >= items.length - 1) {
    parentList.appendChild(itemToMove);
  } else {
    const refItem = toIndex > fromIndex ? items[toIndex + 1] : items[toIndex];
    parentList.insertBefore(itemToMove, refItem);
  }
}

/**
 * Sends all checked items to the top of the list, placing them in front of
 * the first unchecked item. Preserves the relative order of checked items.
 */
export function sendCheckedToTop(parentList: HTMLElement): void {
  const items = Array.from(parentList.querySelectorAll(':scope > li'));
  const checked: HTMLElement[] = [];
  const unchecked: HTMLElement[] = [];

  for (const item of items) {
    const li = item as HTMLElement;
    const isChecked =
      li.classList.contains('is-checked') ||
      li.getAttribute('data-checked') === 'true';
    if (isChecked) {
      checked.push(li);
    } else {
      unchecked.push(li);
    }
  }

  if (checked.length === 0) return;

  // Re-insert: checked first, then unchecked
  const fragment = parentList.ownerDocument.createDocumentFragment();
  for (const li of checked) {
    fragment.appendChild(li);
  }
  for (const li of unchecked) {
    fragment.appendChild(li);
  }
  parentList.appendChild(fragment);
}

// ────────────────────────────────────────────
// Controls wiring
// ────────────────────────────────────────────

interface TaskListWrapper extends HTMLElement {
  _taskListMouseMoveHandler?: (e: MouseEvent) => void;
}

/**
 * Checks if a task list item has any unchecked children in nested lists.
 */
export function hasUncheckedChildren(item: HTMLElement): boolean {
  // Check child checkboxes directly
  const childCheckboxes = item.querySelectorAll<HTMLInputElement>(
    'ul.task-list input.task-checkbox, ol input.task-checkbox, li.task-item input.task-checkbox'
  );
  for (const cb of Array.from(childCheckboxes)) {
    if (!cb.checked) {
      return true;
    }
  }
  // Also check child li items by class / attribute
  const childLis = item.querySelectorAll<HTMLElement>('ul.task-list > li, ol > li, li.task-item');
  for (const child of Array.from(childLis)) {
    if (child === item) continue;
    if (child.classList.contains('task-item')) {
      const isChecked =
        child.classList.contains('is-checked') ||
        child.getAttribute('data-checked') === 'true';
      if (!isChecked) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Wires interactive controls for a single task list: drag handles,
 * delete buttons for checked items, and a "send to top" button.
 */
export function wireTaskListControls(
  taskList: HTMLElement,
  emitEdit: () => void,
  wireTaskCheckboxes: () => void
): void {
  const doc = taskList.ownerDocument;

  // Remove existing controls
  const existingControls = taskList.querySelector(':scope > .task-list-controls');
  if (existingControls) existingControls.remove();

  const items = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
  if (items.length === 0) return;

  // Create controls overlay (absolute positioned, pointer-events none)
  const controls = doc.createElement('div');
  controls.className = 'task-list-controls';
  controls.contentEditable = 'false';
  taskList.style.position = 'relative';
  taskList.insertBefore(controls, taskList.firstChild);

  // Drop indicator
  const dropIndicator = doc.createElement('div');
  dropIndicator.className = 'task-drop-indicator';
  dropIndicator.style.display = 'none';
  controls.appendChild(dropIndicator);

  let activeItemIdx: number | null = null;
  let isDragging = false;
  let dragSourceIdx: number | null = null;

  // Per-item control elements
  const dragBtns: HTMLElement[] = [];
  const delBtns: HTMLElement[] = [];
  const topBtns: HTMLElement[] = [];

  function getItemRect(item: HTMLElement): { top: number; left: number; width: number; height: number } {
    const listRect = taskList.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      top: itemRect.top - listRect.top + taskList.scrollTop,
      left: itemRect.left - listRect.left + taskList.scrollLeft,
      width: itemRect.width,
      height: itemRect.height,
    };
  }

  function getItemFirstLineRect(item: HTMLElement): {
    top: number;
    left: number;
    width: number;
    height: number;
    centerY: number;
  } {
    const listRect = taskList.getBoundingClientRect();
    const checkbox = item.querySelector<HTMLElement>(':scope > .task-checkbox');
    const content = item.querySelector<HTMLElement>(':scope > .task-content');
    const refEl = checkbox || content || item;
    const refRect = refEl.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    const top = refRect.top - listRect.top + taskList.scrollTop;
    const left = itemRect.left - listRect.left + taskList.scrollLeft;
    const height = refRect.height > 0 ? refRect.height : 24;
    const centerY = top + height / 2;

    return {
      top,
      left,
      width: itemRect.width,
      height,
      centerY,
    };
  }

  function repositionControls(): void {
    const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
    currentItems.forEach((item, idx) => {
      const lineRect = getItemFirstLineRect(item);
      const centerY = lineRect.centerY;
      const itemLeft = lineRect.left;

      if (dragBtns[idx]) {
        dragBtns[idx].style.top = `${centerY - 9}px`;
        dragBtns[idx].style.left = `${itemLeft - 26}px`;
      }
      if (topBtns[idx]) {
        topBtns[idx].style.top = `${centerY - 9}px`;
        topBtns[idx].style.left = `${itemLeft - 50}px`;
      }
      if (delBtns[idx]) {
        delBtns[idx].style.top = `${centerY - 9}px`;
        delBtns[idx].style.left = `${lineRect.left + lineRect.width + 8}px`;
      }
    });
  }

  function clearDeleteHighlights(): void {
    const canvas = (taskList.closest('#editor, [contenteditable="true"]') as HTMLElement) || taskList.ownerDocument;
    Array.from(canvas.querySelectorAll<HTMLElement>('.is-delete-target')).forEach((el) => {
      el.classList.remove('is-delete-target');
    });
  }

  function updateVisibility(): void {
    const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
    dragBtns.forEach((btn, idx) => {
      if (isDragging) {
        btn.style.display = idx === dragSourceIdx ? 'flex' : 'none';
      } else {
        btn.style.display = idx === activeItemIdx ? 'flex' : 'none';
      }
    });
    delBtns.forEach((btn, idx) => {
      if (isDragging) {
        btn.style.display = 'none';
        return;
      }
      const item = currentItems[idx];
      const isChecked = item?.classList.contains('is-checked') ||
        item?.getAttribute('data-checked') === 'true';
      const hasUnchecked = item ? hasUncheckedChildren(item) : false;
      const isVisible = idx === activeItemIdx && isChecked && !hasUnchecked;
      btn.style.display = isVisible ? 'flex' : 'none';
      if (!isVisible && item) {
        item.classList.remove('is-delete-target');
      }
    });
    topBtns.forEach((btn, idx) => {
      if (isDragging) {
        btn.style.display = 'none';
        return;
      }
      const item = currentItems[idx];
      const isChecked = item?.classList.contains('is-checked') ||
        item?.getAttribute('data-checked') === 'true';
      // Only show "send to top" if checked AND there are unchecked items above it
      let hasUncheckedAbove = false;
      if (isChecked) {
        for (let i = 0; i < idx; i++) {
          const above = currentItems[i];
          if (above && !above.classList.contains('is-checked') &&
              above.getAttribute('data-checked') !== 'true') {
            hasUncheckedAbove = true;
            break;
          }
        }
      }
      btn.style.display = idx === activeItemIdx && isChecked && hasUncheckedAbove ? 'flex' : 'none';
    });
  }

  items.forEach((item, itemIdx) => {
    const lineRect = getItemFirstLineRect(item);
    const centerY = lineRect.centerY;
    const itemLeft = lineRect.left;

    // ── Drag handle ──
    const dragBtn = doc.createElement('div');
    dragBtn.className = 'task-item-drag-btn';
    dragBtn.setAttribute('data-item-idx', String(itemIdx));
    dragBtn.style.top = `${centerY - 9}px`;
    dragBtn.style.left = `${itemLeft - 26}px`;
    dragBtn.style.display = 'none';
    dragBtn.title = tWebview('Eintrag ziehen zum Verschieben');

    const gripSpan = doc.createElement('span');
    gripSpan.className = 'task-grip';
    gripSpan.appendChild(createGripIcon(doc));
    dragBtn.appendChild(gripSpan);
    controls.appendChild(dragBtn);
    dragBtns.push(dragBtn);

    // ── Send to top button (on left, in front of drag handle) ──
    const topBtn = doc.createElement('button');
    topBtn.className = 'task-item-top-btn';
    topBtn.setAttribute('data-item-idx', String(itemIdx));
    topBtn.appendChild(createSendToTopIcon(doc));
    topBtn.title = tWebview('Erledigte nach oben verschieben');
    topBtn.setAttribute('aria-label', tWebview('Erledigte nach oben verschieben'));
    topBtn.style.top = `${centerY - 9}px`;
    topBtn.style.left = `${itemLeft - 50}px`;
    topBtn.style.display = 'none';

    topBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    topBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearDeleteHighlights();
      sendCheckedToTop(taskList);
      activeItemIdx = null;
      emitEdit();
      const canvas = (taskList.closest('#editor, [contenteditable="true"]') as HTMLElement) || doc.body;
      wireAllTaskListControls(canvas, emitEdit, wireTaskCheckboxes);
      wireTaskCheckboxes();
    });

    controls.appendChild(topBtn);
    topBtns.push(topBtn);

    // ── Delete button (with X icon matching other block delete buttons) ──
    const delBtn = doc.createElement('button');
    delBtn.className = 'task-item-del-btn';
    delBtn.setAttribute('data-item-idx', String(itemIdx));
    delBtn.appendChild(createDeleteIcon(doc));
    delBtn.title = tWebview('Eintrag löschen');
    delBtn.setAttribute('aria-label', tWebview('Eintrag löschen'));
    delBtn.style.top = `${centerY - 9}px`;
    delBtn.style.left = `${lineRect.left + lineRect.width + 8}px`;
    delBtn.style.display = 'none';

    delBtn.addEventListener('mouseenter', () => {
      clearDeleteHighlights();
      const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
      const targetItem = currentItems[itemIdx];
      if (targetItem && !hasUncheckedChildren(targetItem)) {
        targetItem.classList.add('is-delete-target');
      }
    });

    delBtn.addEventListener('mouseleave', () => {
      clearDeleteHighlights();
    });

    delBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearDeleteHighlights();
      const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
      const targetItem = currentItems[itemIdx];
      if (targetItem && !hasUncheckedChildren(targetItem)) {
        targetItem.remove();
        // If the list is now empty:
        const remaining = taskList.querySelectorAll(':scope > li').length;
        if (remaining === 0) {
          const isNested = !!taskList.closest('li');
          if (isNested) {
            taskList.remove();
          } else {
            const p = doc.createElement('p');
            p.className = 'editor-block';
            p.setAttribute('data-block-type', 'paragraph');
            p.innerHTML = '<br>';
            taskList.replaceWith(p);
          }
        }
        activeItemIdx = null;
        emitEdit();
        const canvas = (taskList.closest('#editor, [contenteditable="true"]') as HTMLElement) || doc.body;
        wireAllTaskListControls(canvas, emitEdit, wireTaskCheckboxes);
        wireTaskCheckboxes();
      }
    });

    controls.appendChild(delBtn);
    delBtns.push(delBtn);

    // ── Drag & drop reordering ──
    dragBtn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      clearDeleteHighlights();
      const sourceIdx = itemIdx;
      isDragging = true;
      dragSourceIdx = itemIdx;
      taskList.classList.add('is-task-dragging');
      dragBtn.classList.add('is-dragging');
      dragBtn.style.transition = 'none';

      const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
      const draggedItem = currentItems[sourceIdx];
      if (draggedItem) {
        draggedItem.classList.add('is-item-dragging');
      }

      updateVisibility();

      const listRect = taskList.getBoundingClientRect();
      const btnRect = dragBtn.getBoundingClientRect();
      const grabOffsetY = e.clientY - btnRect.top;

      const itemRects = currentItems.map(it => getItemRect(it));
      const sourceRect = itemRects[sourceIdx];
      const initialIndicatorY = sourceRect ? sourceRect.top : (btnRect.top - listRect.top + taskList.scrollTop);

      dropIndicator.style.transition = 'none';
      dropIndicator.style.top = `${initialIndicatorY - 1}px`;
      dropIndicator.style.left = '0';
      dropIndicator.style.width = `${listRect.width}px`;
      dropIndicator.style.display = 'block';

      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          dropIndicator.style.transition = 'top 0.08s ease';
        });
      }

      let dropIdx = sourceIdx;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const liveItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));
        const liveItemRects = liveItems.map(it => getItemRect(it));
        const wrapperRect = taskList.getBoundingClientRect();
        const currentTop = moveEvent.clientY - wrapperRect.top + taskList.scrollTop - grabOffsetY;

        dragBtn.style.top = `${currentTop}px`;

        const mouseY = moveEvent.clientY - wrapperRect.top + taskList.scrollTop;
        let closestIdx = sourceIdx;
        let indicatorY = liveItemRects[sourceIdx] ? liveItemRects[sourceIdx].top : 0;

        for (let i = 0; i < liveItemRects.length; i++) {
          const r = liveItemRects[i];
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

        dropIdx = closestIdx;
        dropIndicator.style.top = `${indicatorY - 1}px`;
      };

      const onMouseUp = () => {
        doc.removeEventListener('mousemove', onMouseMove);
        doc.removeEventListener('mouseup', onMouseUp);
        isDragging = false;
        dragSourceIdx = null;
        taskList.classList.remove('is-task-dragging');
        dragBtn.classList.remove('is-dragging');
        dragBtn.style.transition = '';
        dropIndicator.style.display = 'none';

        Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li.is-item-dragging')).forEach(el =>
          el.classList.remove('is-item-dragging')
        );

        if (dropIdx !== sourceIdx && dropIdx !== sourceIdx + 1) {
          const targetIdx = dropIdx > sourceIdx ? dropIdx - 1 : dropIdx;
          moveTaskItem(taskList, sourceIdx, targetIdx);
          activeItemIdx = targetIdx;
          emitEdit();
          const canvas = (taskList.closest('#editor, [contenteditable="true"]') as HTMLElement) || doc.body;
          wireAllTaskListControls(canvas, emitEdit, wireTaskCheckboxes);
          wireTaskCheckboxes();
        } else {
          repositionControls();
          updateVisibility();
        }
      };

      doc.addEventListener('mousemove', onMouseMove);
      doc.addEventListener('mouseup', onMouseUp);
    });
  });

  // ── Hover detection ──
  const onDocMouseMove = (e: MouseEvent) => {
    if (isDragging) return;
    if (!taskList.isConnected) {
      doc.removeEventListener('mousemove', onDocMouseMove);
      return;
    }

    const target = e.target as HTMLElement | null;

    // Direct control hover check
    const directControl = target?.closest(
      '.task-item-drag-btn, .task-item-del-btn, .task-item-top-btn'
    ) as HTMLElement | null;

    if (directControl && controls.contains(directControl)) {
      const idxAttr = directControl.getAttribute('data-item-idx');
      if (idxAttr !== null) activeItemIdx = parseInt(idxAttr, 10);
      updateVisibility();
      return;
    }

    // If mouse is inside another task list's control that doesn't belong to this list, yield
    if (directControl && !controls.contains(directControl)) {
      if (activeItemIdx !== null) {
        activeItemIdx = null;
        updateVisibility();
      }
      return;
    }

    // Yield control if mouse is inside a nested sublist of this list
    const innermostTaskList = target?.closest('ul.task-list') as HTMLElement | null;
    if (innermostTaskList && innermostTaskList !== taskList && taskList.contains(innermostTaskList)) {
      if (activeItemIdx !== null) {
        activeItemIdx = null;
        updateVisibility();
      }
      return;
    }

    // Yield control if mouse is hovering over an item in a nested sublist of this list
    const hoveredLi = target?.closest('li.task-item') as HTMLElement | null;
    if (hoveredLi && taskList.contains(hoveredLi) && hoveredLi.parentElement !== taskList) {
      if (activeItemIdx !== null) {
        activeItemIdx = null;
        updateVisibility();
      }
      return;
    }

    // Zone check around the task list
    const listRect = taskList.getBoundingClientRect();
    const hitLeft = listRect.left - 75;
    const hitRight = listRect.right + 60;
    const hitTop = listRect.top - 10;
    const hitBottom = listRect.bottom + 10;

    const inZone =
      e.clientX >= hitLeft &&
      e.clientX <= hitRight &&
      e.clientY >= hitTop &&
      e.clientY <= hitBottom;

    if (!inZone) {
      if (activeItemIdx !== null) {
        activeItemIdx = null;
        updateVisibility();
      }
      return;
    }

    const currentItems = Array.from(taskList.querySelectorAll<HTMLElement>(':scope > li'));

    // Direct hover on this list's direct li
    if (hoveredLi && hoveredLi.parentElement === taskList) {
      // If this item has child sublists, only match if cursor is on the item's own line,
      // not in the nested children area below it
      const lineRect = getItemFirstLineRect(hoveredLi);
      const absTop = listRect.top + lineRect.top - taskList.scrollTop;
      const absBottom = absTop + lineRect.height;

      const hasSublist = !!hoveredLi.querySelector('ul, ol');
      if (hasSublist && e.clientY > absBottom + 4) {
        if (activeItemIdx !== null) {
          activeItemIdx = null;
          updateVisibility();
        }
        return;
      }

      const idx = currentItems.indexOf(hoveredLi);
      if (idx >= 0) {
        activeItemIdx = idx;
      }
      repositionControls();
      updateVisibility();
      return;
    }

    // Mouse in gutter or near row: find matching item by first-line vertical range
    let matchedIdx: number | null = null;
    for (let i = 0; i < currentItems.length; i++) {
      const lineRect = getItemFirstLineRect(currentItems[i]);
      const absTop = listRect.top + lineRect.top - taskList.scrollTop;
      const absBottom = absTop + lineRect.height;
      if (e.clientY >= absTop - 4 && e.clientY <= absBottom + 4) {
        matchedIdx = i;
        break;
      }
    }

    if (matchedIdx !== null) {
      activeItemIdx = matchedIdx;
    } else {
      activeItemIdx = null;
    }

    repositionControls();
    updateVisibility();
  };

  // Clean up previous handler
  if ((taskList as TaskListWrapper)._taskListMouseMoveHandler) {
    doc.removeEventListener('mousemove', (taskList as TaskListWrapper)._taskListMouseMoveHandler!);
  }
  (taskList as TaskListWrapper)._taskListMouseMoveHandler = onDocMouseMove;
  doc.addEventListener('mousemove', onDocMouseMove);
}

/**
 * Wires task list controls for all task lists in the canvas (including nested sublists).
 */
export function wireAllTaskListControls(
  canvas: HTMLElement,
  emitEdit: () => void,
  wireTaskCheckboxes: () => void
): void {
  const taskLists = canvas.querySelectorAll<HTMLElement>('ul.task-list');
  taskLists.forEach((tl) => {
    wireTaskListControls(tl, emitEdit, wireTaskCheckboxes);
  });
}
