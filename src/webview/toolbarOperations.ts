import { indentListItem, outdentListItem } from '../markdown/listOperations';
export { applyRawFormatting } from './rawModeOperations';

/**
 * Finds the closest ancestor element matching a predicate, stopping before reaching stopAt.
 */
function findAncestor(node: Node | null, stopAt: Node, predicate: (el: HTMLElement) => boolean): HTMLElement | null {
  let curr = node;
  while (curr && curr !== stopAt) {
    if (curr.nodeType === 1 /* Element */ && predicate(curr as HTMLElement)) {
      return curr as HTMLElement;
    }
    curr = curr.parentNode;
  }
  return null;
}

/**
 * Finds the top-level block element in canvas that contains the node.
 */
export function findTopBlock(node: Node | null, canvas: HTMLElement): HTMLElement | null {
  if (!node) return null;
  if (node === canvas) {
    const sel = canvas.ownerDocument?.defaultView?.getSelection?.() || (typeof window !== 'undefined' ? window.getSelection() : null);
    const offset = sel?.anchorOffset ?? 0;
    const child = canvas.childNodes[offset] || canvas.firstElementChild;
    return child && child.nodeType === 1 ? (child as HTMLElement) : (canvas.firstElementChild as HTMLElement | null);
  }
  let curr: Node | null = node;
  while (curr && curr.parentNode !== canvas) {
    curr = curr.parentNode;
  }
  return curr && curr.nodeType === 1 ? (curr as HTMLElement) : null;
}

/**
 * Finds the active list item (<li>) at current selection, if any.
 */
export function getActiveListItem(canvas: HTMLElement, selection?: Selection | null): HTMLElement | null {
  const sel = selection || (typeof window !== 'undefined' ? window.getSelection() : null);
  if (!sel || sel.rangeCount === 0) {
    return null;
  }
  return findAncestor(sel.anchorNode, canvas, (el) => el.tagName.toLowerCase() === 'li');
}

/**
 * Returns the inner content element for a top-level block, unwrapping .editor-block-container if present.
 */
export function getInnerContentBlock(block: HTMLElement): HTMLElement {
  if (block.classList.contains('editor-block-container')) {
    return (
      (block.querySelector('.editor-block') as HTMLElement) ||
      (block.firstElementChild as HTMLElement) ||
      block
    );
  }
  return block;
}

/**
 * Checks if a block element contains only empty whitespace / <br>.
 */
export function isBlockEmpty(el: HTMLElement): boolean {
  const text = el.textContent?.replace(/[\s\u200B\u00A0]+/g, '') || '';
  if (text.length > 0) return false;
  const hasInteractive = el.querySelector('img, table, pre, code, input, hr, a');
  return !hasInteractive;
}

/**
 * Creates a new list block element directly for the canvas.
 */
/**
 * Creates a single list item element.
 */
export function createListItem(
  doc: Document,
  type: 'bullet' | 'ordered' | 'task',
  itemContent?: string | Node | null
): HTMLElement {
  const li = doc.createElement('li');
  const isFragment =
    itemContent && typeof itemContent === 'object' && (itemContent as Node).nodeType === 11;

  if (type === 'task') {
    li.className = 'task-item';
    li.setAttribute('data-checked', 'false');

    const cb = doc.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-checkbox';
    cb.contentEditable = 'false';

    const span = doc.createElement('span');
    span.className = 'task-content';
    if (isFragment) {
      span.appendChild(itemContent as DocumentFragment);
      if (
        span.childNodes.length === 0 ||
        (span.childNodes.length === 1 &&
          span.firstChild?.nodeType === 3 &&
          !span.firstChild.nodeValue?.trim())
      ) {
        span.innerHTML = '<br>';
      }
    } else if (typeof itemContent === 'string' && itemContent.trim()) {
      span.innerHTML = itemContent;
    } else {
      span.innerHTML = '<br>';
    }

    li.appendChild(cb);
    li.appendChild(span);
  } else {
    li.className = 'list-item';
    if (isFragment) {
      li.appendChild(itemContent as DocumentFragment);
      if (
        li.childNodes.length === 0 ||
        (li.childNodes.length === 1 &&
          li.firstChild?.nodeType === 3 &&
          !li.firstChild.nodeValue?.trim())
      ) {
        li.innerHTML = '<br>';
      }
    } else if (typeof itemContent === 'string' && itemContent.trim()) {
      li.innerHTML = itemContent;
    } else {
      li.innerHTML = '<br>';
    }
  }

  return li;
}

/**
 * Creates a new list block element directly for the canvas.
 */
export function createListBlock(
  doc: Document,
  type: 'bullet' | 'ordered' | 'task',
  itemContent: string | DocumentFragment | Node | null
): HTMLElement {
  const blockType =
    type === 'task' ? 'task_list' : type === 'ordered' ? 'ordered_list' : 'unordered_list';
  const listTag = type === 'ordered' ? 'ol' : 'ul';
  const listClass =
    type === 'task'
      ? 'editor-block task-list'
      : type === 'ordered'
      ? 'editor-block ordered-list'
      : 'editor-block bullet-list';

  const listEl = doc.createElement(listTag);
  listEl.className = listClass;
  listEl.setAttribute('data-block-type', blockType);

  const li = createListItem(doc, type, itemContent);
  listEl.appendChild(li);
  return listEl;
}

function focusListItem(
  sel: Selection | null,
  targetEl: HTMLElement,
  type: 'bullet' | 'ordered' | 'task',
  atStart = false
): void {
  if (!sel) return;
  const doc = targetEl.ownerDocument;
  const target =
    type === 'task'
      ? (targetEl.querySelector('.task-content') as HTMLElement) ||
        (targetEl.classList.contains('task-content') ? targetEl : null)
      : (targetEl.querySelector('li') as HTMLElement) ||
        (targetEl.tagName.toLowerCase() === 'li' ? targetEl : targetEl);
  if (!target) return;

  const range = doc.createRange();
  if (atStart) {
    if (target.firstChild && target.firstChild.nodeType === 3) {
      range.setStart(target.firstChild, 0);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);
  } else {
    range.selectNodeContents(target);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCaretPositionInBlock(
  sel: Selection,
  contentEl: HTMLElement,
  doc: Document,
  endAnchorNode?: Node | null
): { isAtStart: boolean; isAtEnd: boolean; isMiddle: boolean } {
  if (!sel.isCollapsed || sel.rangeCount === 0) {
    return { isAtStart: false, isAtEnd: false, isMiddle: false };
  }
  try {
    const range = sel.getRangeAt(0);

    const preRange = doc.createRange();
    preRange.setStart(contentEl, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString().replace(/[\s\u200B\u00A0]+/g, '');

    const postRange = doc.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    if (
      endAnchorNode &&
      contentEl.contains(endAnchorNode) &&
      endAnchorNode.parentNode === contentEl
    ) {
      postRange.setEndBefore(endAnchorNode);
    } else {
      postRange.setEnd(contentEl, contentEl.childNodes.length);
    }
    const textAfter = postRange.toString().replace(/[\s\u200B\u00A0]+/g, '');

    const hasBefore = textBefore.length > 0;
    const hasAfter = textAfter.length > 0;

    if (!hasBefore) {
      return { isAtStart: true, isAtEnd: false, isMiddle: false };
    }
    if (!hasAfter) {
      return { isAtStart: false, isAtEnd: true, isMiddle: false };
    }
    return { isAtStart: false, isAtEnd: false, isMiddle: true };
  } catch {
    return { isAtStart: false, isAtEnd: false, isMiddle: false };
  }
}

function insertBlockAfterListItem(activeLi: HTMLElement, newBlock: HTMLElement, doc: Document): void {
  const parentList = activeLi.parentElement;
  if (!parentList || !parentList.parentNode) {
    activeLi.after(newBlock);
    return;
  }
  const grandParent = parentList.parentNode;
  const nextSiblings: Element[] = [];
  let next = activeLi.nextElementSibling;
  while (next) {
    nextSiblings.push(next);
    next = next.nextElementSibling;
  }

  // Insert newBlock after parentList
  grandParent.insertBefore(newBlock, parentList.nextSibling);

  if (nextSiblings.length > 0) {
    const splitList = doc.createElement(parentList.tagName);
    splitList.className = parentList.className;
    for (const attr of Array.from(parentList.attributes)) {
      splitList.setAttribute(attr.name, attr.value);
    }
    for (const sib of nextSiblings) {
      splitList.appendChild(sib);
    }
    grandParent.insertBefore(splitList, newBlock.nextSibling);
  }
}

/**
 * Toggles or converts a list item or block in the contenteditable canvas.
 * - At the beginning of the line: toggle that line from list to no list (or no list to list).
 * - In the middle of a line: start a new line with a list containing the text that followed on that line.
 * - At the end of a line: start a new list on the next line that is empty.
 */
export function toggleListBlock(
  canvas: HTMLElement,
  type: 'bullet' | 'ordered' | 'task',
  onMutated?: () => void
): void {
  const doc = canvas.ownerDocument;
  const sel = doc.defaultView ? doc.defaultView.getSelection() : window.getSelection();
  const activeLi = getActiveListItem(canvas, sel);

  if (activeLi && canvas.contains(activeLi)) {
    const isCurrentlyTask =
      activeLi.classList.contains('task-item') ||
      activeLi.getAttribute('data-checked') !== null ||
      activeLi.querySelector(':scope > input[type="checkbox"]') !== null;
    const parentList = activeLi.parentElement;
    const isCurrentlyOrdered =
      !isCurrentlyTask &&
      (parentList?.tagName.toLowerCase() === 'ol' ||
        parentList?.classList.contains('ordered-list') ||
        parentList?.getAttribute('data-block-type') === 'ordered_list');

    const currentType: 'bullet' | 'ordered' | 'task' = isCurrentlyTask
      ? 'task'
      : isCurrentlyOrdered
      ? 'ordered'
      : 'bullet';

    const contentEl =
      (activeLi.querySelector(':scope > .task-content') as HTMLElement) || activeLi;
    const nestedList = activeLi.querySelector(':scope > ul, :scope > ol');
    const caretPos =
      sel && sel.isCollapsed
        ? getCaretPositionInBlock(sel, contentEl, doc, nestedList)
        : { isAtStart: false, isAtEnd: false, isMiddle: false };

    // 1. In middle of line: start a new line with a list containing the text that followed
    if (caretPos.isMiddle && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const tailRange = doc.createRange();
      tailRange.setStart(range.endContainer, range.endOffset);
      if (contentEl !== activeLi) {
        tailRange.setEnd(contentEl, contentEl.childNodes.length);
      } else if (nestedList) {
        tailRange.setEndBefore(nestedList);
      } else {
        tailRange.setEnd(activeLi, activeLi.childNodes.length);
      }
      const tailFragment = tailRange.extractContents();
      if (!contentEl.innerHTML.trim()) {
        contentEl.innerHTML = '<br>';
      }

      if (currentType === type) {
        const newLi = createListItem(doc, type, tailFragment);
        activeLi.after(newLi);
        focusListItem(sel, newLi, type, true);
      } else {
        const newListBlock = createListBlock(doc, type, tailFragment);
        insertBlockAfterListItem(activeLi, newListBlock, doc);
        focusListItem(sel, newListBlock, type, true);
      }

      onMutated?.();
      return;
    }

    // 2. At end of line: start a new list on the next line that is empty
    if (caretPos.isAtEnd) {
      if (currentType === type) {
        const newLi = createListItem(doc, type, null);
        activeLi.after(newLi);
        focusListItem(sel, newLi, type, true);
      } else {
        const newListBlock = createListBlock(doc, type, null);
        insertBlockAfterListItem(activeLi, newListBlock, doc);
        focusListItem(sel, newListBlock, type, true);
      }

      onMutated?.();
      return;
    }

    // 3. At start of line (or whole item / highlighted selection): toggle from list to no list or convert
    if (currentType === type) {
      // TOGGLE OFF: convert list item back into a paragraph
      const cloned = contentEl.cloneNode(true) as HTMLElement;
      cloned.querySelectorAll('ul, ol, input[type="checkbox"]').forEach((n) => n.remove());
      const htmlContent = cloned.innerHTML.trim() || '<br>';

      const p = doc.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.innerHTML = htmlContent;

      const nestedLists = Array.from(activeLi.children).filter(
        (c) => c.tagName === 'UL' || c.tagName === 'OL'
      );

      if (parentList && parentList.parentNode) {
        const grandParent = parentList.parentNode;
        const nextSiblings: Element[] = [];
        let next = activeLi.nextElementSibling;
        while (next) {
          nextSiblings.push(next);
          next = next.nextElementSibling;
        }

        activeLi.remove();
        grandParent.insertBefore(p, parentList.nextSibling);

        let insertAnchor: Node = p;
        for (const sub of nestedLists) {
          grandParent.insertBefore(sub, insertAnchor.nextSibling);
          insertAnchor = sub;
        }

        if (nextSiblings.length > 0) {
          const splitList = doc.createElement(parentList.tagName);
          splitList.className = parentList.className;
          for (const attr of Array.from(parentList.attributes)) {
            splitList.setAttribute(attr.name, attr.value);
          }
          for (const sib of nextSiblings) {
            splitList.appendChild(sib);
          }
          grandParent.insertBefore(splitList, insertAnchor.nextSibling);
        }

        if (parentList.children.length === 0) {
          parentList.remove();
        }
      } else {
        activeLi.replaceWith(p);
      }

      if (sel) {
        const range = doc.createRange();
        range.selectNodeContents(p);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      onMutated?.();
      return;
    }

    // CONVERT to different list type in-place
    const targetType =
      type === 'task' ? 'task_list' : type === 'ordered' ? 'ordered_list' : 'unordered_list';
    if (type === 'task') {
      activeLi.className = 'task-item';
      activeLi.setAttribute('data-checked', 'false');

      let cb = activeLi.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      if (!cb) {
        cb = doc.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-checkbox';
        cb.contentEditable = 'false';
      }

      let contentSpan = activeLi.querySelector(':scope > .task-content') as HTMLElement | null;
      if (!contentSpan) {
        contentSpan = doc.createElement('span');
        contentSpan.className = 'task-content';
        const toMove: Node[] = [];
        activeLi.childNodes.forEach((n) => {
          if (
            n !== cb &&
            (n.nodeType !== 1 ||
              ((n as HTMLElement).tagName !== 'UL' && (n as HTMLElement).tagName !== 'OL'))
          ) {
            toMove.push(n);
          }
        });
        toMove.forEach((n) => contentSpan!.appendChild(n));
        if (contentSpan.childNodes.length === 0) {
          contentSpan.innerHTML = '<br>';
        }
      }

      const sublists = Array.from(activeLi.children).filter(
        (c) => c.tagName === 'UL' || c.tagName === 'OL'
      );
      activeLi.innerHTML = '';
      activeLi.appendChild(cb);
      activeLi.appendChild(contentSpan);
      sublists.forEach((sub) => activeLi.appendChild(sub));

      if (parentList && parentList.tagName.toLowerCase() !== 'ul') {
        const newUl = doc.createElement('ul');
        newUl.className = 'editor-block task-list';
        newUl.setAttribute('data-block-type', 'task_list');
        parentList.replaceWith(newUl);
        Array.from(parentList.children).forEach((c) => newUl.appendChild(c));
      } else if (parentList) {
        parentList.className = 'editor-block task-list';
        parentList.setAttribute('data-block-type', 'task_list');
      }

      if (sel) {
        const range = doc.createRange();
        if (caretPos.isAtStart) {
          if (contentSpan.firstChild && contentSpan.firstChild.nodeType === 3) {
            range.setStart(contentSpan.firstChild, 0);
          } else {
            range.setStart(contentSpan, 0);
          }
          range.collapse(true);
        } else {
          range.selectNodeContents(contentSpan);
          range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const cb = activeLi.querySelector(':scope > input[type="checkbox"]');
      if (cb) cb.remove();

      const contentSpan = activeLi.querySelector(':scope > .task-content');
      if (contentSpan) {
        while (contentSpan.firstChild) {
          activeLi.insertBefore(contentSpan.firstChild, contentSpan);
        }
        contentSpan.remove();
      }

      activeLi.className = 'list-item';
      activeLi.removeAttribute('data-checked');

      const targetTag = type === 'ordered' ? 'ol' : 'ul';
      const targetClass =
        type === 'ordered' ? 'editor-block ordered-list' : 'editor-block bullet-list';

      if (parentList && parentList.tagName.toLowerCase() !== targetTag) {
        const newList = doc.createElement(targetTag);
        newList.className = targetClass;
        newList.setAttribute('data-block-type', targetType);
        parentList.replaceWith(newList);
        Array.from(parentList.children).forEach((c) => newList.appendChild(c));
      } else if (parentList) {
        parentList.className = targetClass;
        parentList.setAttribute('data-block-type', targetType);
      }

      if (sel) {
        const range = doc.createRange();
        if (caretPos.isAtStart) {
          if (activeLi.firstChild && activeLi.firstChild.nodeType === 3) {
            range.setStart(activeLi.firstChild, 0);
          } else {
            range.setStart(activeLi, 0);
          }
          range.collapse(true);
        } else {
          range.selectNodeContents(activeLi);
          range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    onMutated?.();
    return;
  }

  // Not inside a list item: handle text-based blocks as expected for a text editor
  const anchorNode = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const topBlock = findTopBlock(anchorNode, canvas);

  if (!topBlock || !canvas.contains(topBlock)) {
    const listBlock = createListBlock(doc, type, null);
    canvas.appendChild(listBlock);
    focusListItem(sel, listBlock, type, true);
    onMutated?.();
    return;
  }

  const innerBlock = getInnerContentBlock(topBlock);

  // Check if text is highlighted (selection is not collapsed)
  if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
    const selectedText = sel.toString();
    if (selectedText.includes('\n')) {
      const lines = selectedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length > 1) {
        const blockType =
          type === 'task' ? 'task_list' : type === 'ordered' ? 'ordered_list' : 'unordered_list';
        const listTag = type === 'ordered' ? 'ol' : 'ul';
        const listClass =
          type === 'task'
            ? 'editor-block task-list'
            : type === 'ordered'
            ? 'editor-block ordered-list'
            : 'editor-block bullet-list';

        const listEl = doc.createElement(listTag);
        listEl.className = listClass;
        listEl.setAttribute('data-block-type', blockType);

        for (const line of lines) {
          const li = createListItem(doc, type, line);
          listEl.appendChild(li);
        }

        topBlock.replaceWith(listEl);
        focusListItem(sel, listEl, type);
        onMutated?.();
        return;
      }
    }

    // A part of the paragraph is highlighted: convert the paragraph into a list item
    const content = innerBlock.innerHTML.trim();
    const listBlock = createListBlock(doc, type, content);
    topBlock.replaceWith(listBlock);
    focusListItem(sel, listBlock, type, true);
    onMutated?.();
    return;
  }

  // If the block is completely empty, convert it into the new list
  if (isBlockEmpty(topBlock) || isBlockEmpty(innerBlock)) {
    const listBlock = createListBlock(doc, type, null);
    topBlock.replaceWith(listBlock);
    focusListItem(sel, listBlock, type, true);
    onMutated?.();
    return;
  }

  // Caret position evaluation for collapsed selection
  const caretPos = sel && sel.isCollapsed
    ? getCaretPositionInBlock(sel, innerBlock, doc)
    : { isAtStart: false, isAtEnd: false, isMiddle: false };

  // 1. Cursor at beginning of line: toggle that line from list to no list (convert to list)
  if (caretPos.isAtStart) {
    const content = innerBlock.innerHTML.trim();
    const listBlock = createListBlock(doc, type, content);
    topBlock.replaceWith(listBlock);
    focusListItem(sel, listBlock, type, true);
    onMutated?.();
    return;
  }

  // 2. Cursor in middle of line: start a new line with a list containing the text that followed
  if (caretPos.isMiddle && sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const tailRange = doc.createRange();
    tailRange.setStart(range.endContainer, range.endOffset);
    tailRange.setEnd(innerBlock, innerBlock.childNodes.length);
    const tailFragment = tailRange.extractContents();
    if (!innerBlock.innerHTML.trim()) {
      innerBlock.innerHTML = '<br>';
    }

    const listBlock = createListBlock(doc, type, tailFragment);
    topBlock.after(listBlock);
    focusListItem(sel, listBlock, type, true);
    onMutated?.();
    return;
  }

  // 3. Cursor at end of line: start a new list on the next line that is empty
  const listBlock = createListBlock(doc, type, null);
  topBlock.after(listBlock);
  focusListItem(sel, listBlock, type, true);

  onMutated?.();
}

/**
 * Indents the active list item at selection.
 */
export function indentActiveListItem(canvas: HTMLElement, onMutated?: () => void): boolean {
  const activeLi = getActiveListItem(canvas);
  if (activeLi && canvas.contains(activeLi)) {
    const success = indentListItem(activeLi);
    if (success) {
      onMutated?.();
      return true;
    }
  }
  return false;
}

/**
 * Outdents the active list item at selection.
 */
export function outdentActiveListItem(canvas: HTMLElement, onMutated?: () => void): boolean {
  const activeLi = getActiveListItem(canvas);
  if (activeLi && canvas.contains(activeLi)) {
    const success = outdentListItem(activeLi);
    if (success) {
      onMutated?.();
      return true;
    }
  }
  return false;
}

/**
 * Safely inserts a block element (table wrapper, code block, etc.) into the canvas.
 */
export function insertBlockElement(canvas: HTMLElement, blockHtml: string, onMutated?: () => void): void {
  const doc = canvas.ownerDocument;
  const sel = doc.defaultView ? doc.defaultView.getSelection() : window.getSelection();
  const anchor = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const topBlock = findTopBlock(anchor, canvas);

  const temp = doc.createElement('div');
  temp.innerHTML = blockHtml.trim();
  const newBlocks = Array.from(temp.children);

  if (topBlock && canvas.contains(topBlock)) {
    const isEmpty = !topBlock.classList.contains('widget-block') && isBlockEmpty(topBlock);
    if (isEmpty) {
      let last: Node = topBlock;
      for (const el of newBlocks) {
        topBlock.parentNode?.insertBefore(el, last.nextSibling);
        last = el;
      }
      topBlock.remove();
    } else {
      let last: Node = topBlock;
      for (const el of newBlocks) {
        topBlock.parentNode?.insertBefore(el, last.nextSibling);
        last = el;
      }
    }
  } else {
    for (const el of newBlocks) {
      canvas.appendChild(el);
    }
  }

  onMutated?.();
}

/**
 * Applies or toggles a heading level on the active block.
 */
export function applyHeading(canvas: HTMLElement, val: string, onMutated?: () => void): void {
  const doc = canvas.ownerDocument;
  const sel = doc.defaultView ? doc.defaultView.getSelection() : window.getSelection();
  const anchor = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const topBlock = findTopBlock(anchor, canvas);

  if (!topBlock || !canvas.contains(topBlock)) {
    return;
  }

  // Do not convert widget blocks (tables, code blocks, blockquotes) into headings
  if (topBlock.classList.contains('widget-block')) {
    return;
  }

  const tag = val.toLowerCase();
  const content = topBlock.innerHTML.trim() || '<br>';

  let newEl: HTMLElement;
  if (tag === 'p') {
    const p = doc.createElement('p');
    p.className = 'editor-block';
    p.setAttribute('data-block-type', 'paragraph');
    p.innerHTML = content;
    newEl = p;
  } else {
    const level = tag.replace('h', '') || '1';
    const h = doc.createElement(tag);
    h.className = 'editor-block';
    h.setAttribute('data-block-type', 'heading');
    h.setAttribute('data-level', level);
    h.innerHTML = content;
    newEl = h;
  }

  topBlock.replaceWith(newEl);

  if (sel) {
    const range = doc.createRange();
    range.selectNodeContents(newEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  onMutated?.();
}

