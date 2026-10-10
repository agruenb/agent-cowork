/**
 * Keyboard guards for block boundaries and widget isolation.
 * Prevents accidental merging of text blocks into widget blocks on Backspace/Delete,
 * and handles Tab/Enter inside code blocks.
 */

/**
 * Checks if the selection caret is at the very beginning of a block element.
 */
export function isAtStartOfBlock(sel: Selection, blockContainer: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const preRange = blockContainer.ownerDocument.createRange();
    preRange.setStart(blockContainer, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}

/**
 * Checks if the selection caret is at the very end of a block element.
 */
export function isAtEndOfBlock(sel: Selection, blockContainer: HTMLElement): boolean {
  if (!sel.isCollapsed || sel.rangeCount === 0) return false;
  try {
    const range = sel.getRangeAt(0);
    const postRange = blockContainer.ownerDocument.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(blockContainer, blockContainer.childNodes.length);
    return postRange.toString().replace(/[\s\u200B]+/g, '').length === 0;
  } catch {
    return false;
  }
}


/**
 * Intercepts keydown events to protect widget blocks and handle code block keys.
 * Returns true if the key was handled/prevented, false to let standard handling proceed.
 */
export function handleBlockKeyboardGuards(
  e: KeyboardEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void
): boolean {
  const doc = editorCanvas.ownerDocument;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return false;

  const anchorEl =
    sel.anchorNode?.nodeType === 1
      ? (sel.anchorNode as HTMLElement)
      : sel.anchorNode?.parentElement;

  // 1. Inside a code block: handle Tab and Enter
  const codeEl = anchorEl?.closest('code.editor-code') as HTMLElement | null;
  if (codeEl && editorCanvas.contains(codeEl)) {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      emitEdit();
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
      emitEdit();
      return true;
    }
  }

  // 2. Block boundary guards for Backspace and Delete
  let blockEl: HTMLElement | null = anchorEl ?? null;
  while (blockEl && blockEl.parentElement !== editorCanvas) {
    blockEl = blockEl.parentElement;
  }
  if (!blockEl) {
    return false;
  }

  // Backspace at beginning of block: don't merge into preceding widget block
  if (e.key === 'Backspace' && isAtStartOfBlock(sel, blockEl)) {
    const prev = blockEl.previousElementSibling as HTMLElement | null;
    if (prev && prev.classList.contains('widget-block')) {
      e.preventDefault();
      return true;
    }
  }

  // Delete at end of block: don't pull/merge following widget block
  if (e.key === 'Delete' && isAtEndOfBlock(sel, blockEl)) {
    const next = blockEl.nextElementSibling as HTMLElement | null;
    if (next && next.classList.contains('widget-block')) {
      e.preventDefault();
      return true;
    }
  }

  return false;
}

/**
 * Intercepts Backspace or Delete when the caret is adjacent to a task checkbox,
 * or when the checkbox itself has focus.
 * If the task item is the only item in the list, converts it into a normal paragraph.
 * If other items exist in the list, converts the task item to a regular list item.
 */
export function handleTaskCheckboxBackspace(
  e: KeyboardEvent,
  editorCanvas: HTMLElement,
  emitEdit: () => void,
  wireTaskCheckboxes?: () => void
): boolean {
  if (e.key !== 'Backspace' && e.key !== 'Delete') {
    return false;
  }

  const doc = editorCanvas.ownerDocument || document;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;

  let li: HTMLElement | null = null;
  let cb: HTMLInputElement | null = null;
  let contentSpan: HTMLElement | null = null;
  let isAdjacentToCheckbox = false;

  const targetEl = e.target as HTMLElement | null;
  const targetCb = targetEl?.closest('input.task-checkbox') as HTMLInputElement | null;

  if (targetCb && editorCanvas.contains(targetCb)) {
    cb = targetCb;
    li = cb.closest('li') as HTMLElement | null;
    if (!li || !editorCanvas.contains(li)) {
      return false;
    }
    contentSpan = li.querySelector(':scope > .task-content') as HTMLElement | null;
    isAdjacentToCheckbox = true;
  } else {
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) {
      return false;
    }

    const anchorNode = sel.anchorNode;
    if (!anchorNode || !editorCanvas.contains(anchorNode)) {
      return false;
    }

    const anchorEl =
      anchorNode.nodeType === 1 ? (anchorNode as HTMLElement) : anchorNode.parentElement;
    li = anchorEl?.closest('li') as HTMLElement | null;
    if (!li || !editorCanvas.contains(li)) {
      return false;
    }

    cb = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
    if (!cb) {
      return false;
    }

    contentSpan = li.querySelector(':scope > .task-content') as HTMLElement | null;
    const range = sel.getRangeAt(0);

    if (e.key === 'Backspace') {
      if (contentSpan && (anchorNode === contentSpan || contentSpan.contains(anchorNode))) {
        try {
          const preRange = doc.createRange();
          preRange.setStart(contentSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const textBefore = preRange.toString().replace(/[\u200B\u00A0\s]+/g, '');
          if (textBefore.length === 0) {
            isAdjacentToCheckbox = true;
          }
        } catch {
          if (range.startOffset === 0) {
            isAdjacentToCheckbox = true;
          }
        }
      } else if (anchorNode === li) {
        const cbIndex = Array.prototype.indexOf.call(li.childNodes, cb);
        if (range.startOffset === cbIndex || range.startOffset === cbIndex + 1) {
          isAdjacentToCheckbox = true;
        }
      }
    } else if (e.key === 'Delete') {
      if (anchorNode === li) {
        const cbIndex = Array.prototype.indexOf.call(li.childNodes, cb);
        if (range.startOffset === cbIndex) {
          isAdjacentToCheckbox = true;
        }
      }
    }
  }

  if (!isAdjacentToCheckbox || !li || !cb) {
    return false;
  }

  e.preventDefault();

  const parentList = li.parentElement;
  const isNested = !!parentList?.closest('li');
  const listItems = parentList
    ? Array.from(parentList.children).filter((c) => c.tagName.toLowerCase() === 'li')
    : [];
  const isOnlyItemInList = !isNested && listItems.length <= 1;

  if (isOnlyItemInList) {
    // 1. Collect any nested sublists inside this li
    const nestedLists = Array.from(li.children).filter(
      (c) => c.tagName === 'UL' || c.tagName === 'OL'
    );

    // 2. Create the replacement paragraph
    const p = doc.createElement('p');
    p.className = 'editor-block';
    p.setAttribute('data-block-type', 'paragraph');

    // 3. Extract content of li (excluding checkbox and nested sublists)
    if (contentSpan) {
      const nodes = Array.from(contentSpan.childNodes);
      const hasVisibleContent =
        (contentSpan.textContent || '').trim().length > 0 ||
        contentSpan.querySelector('br, img') !== null;
      if (!hasVisibleContent || nodes.length === 0) {
        p.innerHTML = '<br>';
      } else {
        for (const node of nodes) {
          p.appendChild(node);
        }
      }
    } else {
      const nodes = Array.from(li.childNodes).filter(
        (n) => n !== cb && n.nodeName !== 'UL' && n.nodeName !== 'OL'
      );
      const text = nodes.map((n) => n.textContent || '').join('').trim();
      if (nodes.length === 0 || (text.length === 0 && !li.querySelector('br, img'))) {
        p.innerHTML = '<br>';
      } else {
        for (const node of nodes) {
          p.appendChild(node);
        }
      }
    }

    if (!p.firstChild) {
      p.innerHTML = '<br>';
    }

    // 4. Replace parentList with p (and any sublists)
    if (parentList && parentList.parentNode) {
      const container = parentList.parentNode;
      container.insertBefore(p, parentList);
      for (const sub of nestedLists) {
        container.insertBefore(sub, parentList);
      }
      parentList.remove();
    } else {
      li.replaceWith(p);
    }

    // 5. Place caret at start of text in paragraph
    let focusTarget: Node = p;
    let focusOffset = 0;
    let firstText: Node | null = p.firstChild;
    while (firstText && firstText.nodeType !== 3 && firstText.firstChild) {
      firstText = firstText.firstChild;
    }
    if (firstText && firstText.nodeType === 3) {
      focusTarget = firstText;
      focusOffset = 0;
    }

    editorCanvas.focus();
    if (sel) {
      const newRange = doc.createRange();
      newRange.setStart(focusTarget, focusOffset);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    wireTaskCheckboxes?.();
    emitEdit();
    return true;
  }

  // Not the only item in the list: remove checkbox and keep item in the list
  // 1. Remove checkbox and task classes
  cb.remove();
  li.removeAttribute('data-checked');
  li.classList.remove('task-item', 'is-checked');
  li.classList.add('list-item');

  // 2. Unwrap .task-content if present
  let firstChildToFocus: Node = li;
  if (contentSpan) {
    const children = Array.from(contentSpan.childNodes);
    if (children.length > 0) {
      firstChildToFocus = children[0];
      for (const child of children) {
        li.insertBefore(child, contentSpan);
      }
    }
    contentSpan.remove();
  }

  // 3. Update parent list type if no other tasks remain
  if (parentList && parentList.classList.contains('task-list')) {
    const remainingTasks = parentList.querySelectorAll('.task-item, input[type="checkbox"]');
    if (remainingTasks.length === 0) {
      parentList.classList.remove('task-list');
      parentList.classList.add('bullet-list');
      parentList.setAttribute('data-block-type', 'unordered_list');
    }
  }

  // 4. Place caret at start of text
  editorCanvas.focus();
  if (sel) {
    const newRange = doc.createRange();
    if (firstChildToFocus.nodeType === 3) {
      newRange.setStart(firstChildToFocus, 0);
    } else {
      newRange.selectNodeContents(firstChildToFocus);
      newRange.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  wireTaskCheckboxes?.();
  emitEdit();
  return true;
}
