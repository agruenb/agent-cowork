/**
 * Utility functions for list indentation and outdenting in both
 * the visual contenteditable DOM editor and the raw Markdown textarea.
 */

/**
 * Indents a list item element (li) to become a child item of its previous sibling.
 * Returns true if the item was indented, false if it could not be indented (e.g. no previous sibling).
 */
export function indentListItem(li: HTMLElement): boolean {
  const prevLi = li.previousElementSibling as HTMLElement | null;
  if (!prevLi || prevLi.tagName.toLowerCase() !== 'li') {
    return false;
  }

  const parentList = li.parentElement as HTMLElement | null;
  let subList = Array.from(prevLi.children).find(
    (el) => el.tagName === 'UL' || el.tagName === 'OL'
  ) as HTMLElement | undefined;

  if (!subList) {
    const isOrdered =
      parentList?.tagName.toLowerCase() === 'ol' ||
      parentList?.classList.contains('ordered-list') ||
      parentList?.getAttribute('data-block-type') === 'ordered_list';

    const isTaskList =
      parentList?.classList.contains('task-list') ||
      parentList?.getAttribute('data-block-type') === 'task_list' ||
      li.classList.contains('task-item');

    if (isOrdered) {
      subList = li.ownerDocument.createElement('ol');
      subList.className = 'ordered-list';
      subList.setAttribute('data-block-type', 'ordered_list');
    } else if (isTaskList) {
      subList = li.ownerDocument.createElement('ul');
      subList.className = 'task-list';
      subList.setAttribute('data-block-type', 'task_list');
    } else {
      subList = li.ownerDocument.createElement('ul');
      subList.className = 'bullet-list';
      subList.setAttribute('data-block-type', 'unordered_list');
    }
    prevLi.appendChild(subList);
  }

  subList.appendChild(li);
  return true;
}

/**
 * Outdents a list item element (li) to move it up one level in the list hierarchy.
 * Returns true if the item was outdented, false if it was already at the root level.
 */
export function outdentListItem(li: HTMLElement): boolean {
  const currentList = li.parentElement as HTMLElement | null;
  if (!currentList) {
    return false;
  }

  const parentLi = currentList.closest('li') as HTMLElement | null;
  if (!parentLi) {
    // Already at root list level
    return false;
  }

  const grandParentList = parentLi.parentElement;
  if (!grandParentList) {
    return false;
  }

  // Move li to be right after parentLi
  grandParentList.insertBefore(li, parentLi.nextSibling);

  // Clean up currentList if it is now empty
  if (currentList.children.length === 0) {
    currentList.remove();
  }

  return true;
}

/**
 * Checks if the text before cursor in a raw text line is at line start or right after the list marker.
 */
export function isAtLineStartOrMarker(textBeforeCursor: string): boolean {
  // Cursor at start of line (only leading whitespace)
  if (/^\s*$/.test(textBeforeCursor)) {
    return true;
  }
  // Cursor immediately after list marker (bullet, task checkbox, or number) before text content
  if (/^\s*[-*+](\s+\[[ xX]\])?\s*$/.test(textBeforeCursor)) {
    return true;
  }
  if (/^\s*\d+[.)]\s*$/.test(textBeforeCursor)) {
    return true;
  }
  return false;
}

/**
 * Checks if the cursor is at the beginning of a visual list item (before any text characters).
 */
export function isCursorAtStartOfListItem(li: HTMLElement, selection: Selection): boolean {
  if (selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    return false;
  }

  const isTask = li.classList.contains('task-item') || li.querySelector('input[type="checkbox"]') !== null;
  const contentEl = isTask ? (li.querySelector('.task-content') || li) : li;

  try {
    const doc = li.ownerDocument || document;
    const preRange = doc.createRange();
    preRange.setStart(contentEl, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();
    return textBefore.trim().length === 0;
  } catch {
    return false;
  }
}

export interface TextareaTabResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Handles Tab indentation in a raw markdown string.
 */
export function indentRawText(
  value: string,
  selectionStart: number,
  selectionEnd: number
): TextareaTabResult {
  if (selectionStart === selectionEnd) {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const textBeforeCursor = value.substring(lineStart, selectionStart);

    // Only indent the line if cursor is at the start of the line or at the list marker
    if (isAtLineStartOrMarker(textBeforeCursor)) {
      const newValue = value.substring(0, lineStart) + '  ' + value.substring(lineStart);
      return {
        value: newValue,
        selectionStart: selectionStart + 2,
        selectionEnd: selectionEnd + 2,
      };
    }

    // In the middle or end of a line, insert 2 spaces at the cursor position
    const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
    return {
      value: newValue,
      selectionStart: selectionStart + 2,
      selectionEnd: selectionStart + 2,
    };
  }

  // Multi-line selection: indent all selected lines
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selectionEnd);
  if (lineEnd === -1) {
    lineEnd = value.length;
  }

  const lines = value.substring(lineStart, lineEnd).split('\n');
  const indentedLines = lines.map((l) => '  ' + l);
  const newText = indentedLines.join('\n');
  const addedChars = indentedLines.length * 2;

  const newValue = value.substring(0, lineStart) + newText + value.substring(lineEnd);
  return {
    value: newValue,
    selectionStart: selectionStart + 2,
    selectionEnd: selectionEnd + addedChars,
  };
}

/**
 * Handles Shift+Tab outdenting in a raw markdown string.
 */
export function outdentRawText(
  value: string,
  selectionStart: number,
  selectionEnd: number
): TextareaTabResult {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selectionEnd);
  if (lineEnd === -1) {
    lineEnd = value.length;
  }

  const lines = value.substring(lineStart, lineEnd).split('\n');
  let removedFirstLine = 0;
  let totalRemoved = 0;

  const outdentedLines = lines.map((line, index) => {
    let removed = 0;
    if (line.startsWith('  ')) {
      removed = 2;
    } else if (line.startsWith(' ') || line.startsWith('\t')) {
      removed = 1;
    }
    if (index === 0) {
      removedFirstLine = removed;
    }
    totalRemoved += removed;
    return line.substring(removed);
  });

  const newText = outdentedLines.join('\n');
  const newValue = value.substring(0, lineStart) + newText + value.substring(lineEnd);

  return {
    value: newValue,
    selectionStart: Math.max(lineStart, selectionStart - removedFirstLine),
    selectionEnd: Math.max(lineStart, selectionEnd - totalRemoved),
  };
}
