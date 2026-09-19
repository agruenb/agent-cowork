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
  let curr = node;
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
export function createListBlock(
  doc: Document,
  type: 'bullet' | 'ordered' | 'task',
  itemContent: string | DocumentFragment | null
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

  const li = doc.createElement('li');
  if (type === 'task') {
    li.className = 'task-item';
    li.setAttribute('data-checked', 'false');

    const cb = doc.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-checkbox';
    cb.contentEditable = 'false';

    const span = doc.createElement('span');
    span.className = 'task-content';
    const isFragment =
      itemContent && typeof itemContent === 'object' && (itemContent as Node).nodeType === 11;
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
    const isFragment =
      itemContent && typeof itemContent === 'object' && (itemContent as Node).nodeType === 11;
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

  listEl.appendChild(li);
  return listEl;
}

function focusListItem(
  sel: Selection | null,
  listBlock: HTMLElement,
  type: 'bullet' | 'ordered' | 'task',
  atStart = false
): void {
  if (!sel) return;
  const doc = listBlock.ownerDocument;
  const target =
    type === 'task'
      ? (listBlock.querySelector('.task-content') as HTMLElement)
      : (listBlock.querySelector('li') as HTMLElement);
  if (!target) return;

  const range = doc.createRange();
  if (atStart) {
    range.setStart(target, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(target);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Toggles or converts a list item or block in the contenteditable canvas.
 * - If current item matches type: toggles off to a standard paragraph.
 * - If current item is a different list type: converts in-place (never nests!).
 * - If current block is a text block: starts a list as expected in a text editor.
 *   - At end of block or inside heading: keeps block, starts list on new line below.
 *   - In empty block: converts empty block to list.
 *   - In middle of paragraph: splits paragraph at cursor and starts list with tail.
 *   - At start of paragraph: converts paragraph to list.
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

    if (currentType === type) {
      // TOGGLE OFF: convert list item back into a paragraph
      const contentEl = activeLi.querySelector(':scope > .task-content') || activeLi;
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
    const targetType = type === 'task' ? 'task_list' : type === 'ordered' ? 'ordered_list' : 'unordered_list';
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
        range.selectNodeContents(contentSpan);
        range.collapse(false);
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
        range.selectNodeContents(activeLi);
        range.collapse(false);
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
    focusListItem(sel, listBlock, type);
    onMutated?.();
    return;
  }

  // Check if multiple lines are selected
  if (sel && !sel.isCollapsed) {
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
          const li = doc.createElement('li');
          if (type === 'task') {
            li.className = 'task-item';
            li.setAttribute('data-checked', 'false');
            const cb = doc.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-checkbox';
            cb.contentEditable = 'false';
            const span = doc.createElement('span');
            span.className = 'task-content';
            span.textContent = line;
            li.appendChild(cb);
            li.appendChild(span);
          } else {
            li.className = 'list-item';
            li.textContent = line;
          }
          listEl.appendChild(li);
        }

        topBlock.replaceWith(listEl);
        focusListItem(sel, listEl, type);
        onMutated?.();
        return;
      }
    }
  }

  // Heading blocks should never be converted or split into a list; start a list below them
  if (topBlock.tagName.match(/^H[1-6]$/i)) {
    const listBlock = createListBlock(doc, type, null);
    topBlock.after(listBlock);
    focusListItem(sel, listBlock, type);
    onMutated?.();
    return;
  }

  // If the block is completely empty, convert it into the new list
  if (isBlockEmpty(topBlock)) {
    const listBlock = createListBlock(doc, type, null);
    topBlock.replaceWith(listBlock);
    focusListItem(sel, listBlock, type);
    onMutated?.();
    return;
  }

  // For non-empty text blocks (paragraphs, blockquotes):
  // Check caret position: at start, in middle, or at end
  let textBefore = '';
  let textAfter = '';

  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    try {
      const preRange = doc.createRange();
      preRange.setStart(topBlock, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      textBefore = preRange.toString();
    } catch {
      textBefore = '';
    }

    try {
      const postRange = doc.createRange();
      postRange.setStart(range.endContainer, range.endOffset);
      postRange.setEnd(topBlock, topBlock.childNodes.length);
      textAfter = postRange.toString();
    } catch {
      textAfter = '';
    }
  }

  const isAtStart = textBefore.replace(/[\s\u200B\u00A0]+/g, '') === '';
  const isAtEnd = textAfter.replace(/[\s\u200B\u00A0]+/g, '') === '';

  if (isAtStart) {
    // Caret at start of paragraph: convert the whole paragraph into a list item
    const content = topBlock.innerHTML.trim();
    const listBlock = createListBlock(doc, type, content);
    topBlock.replaceWith(listBlock);
    focusListItem(sel, listBlock, type, true);
  } else if (isAtEnd) {
    // Caret at end of paragraph: keep the paragraph, start a new list below it
    const listBlock = createListBlock(doc, type, null);
    topBlock.after(listBlock);
    focusListItem(sel, listBlock, type);
  } else {
    // Caret in the middle: split the paragraph at caret
    try {
      const range = sel!.getRangeAt(0);
      const postRange = doc.createRange();
      postRange.setStart(range.endContainer, range.endOffset);
      postRange.setEnd(topBlock, topBlock.childNodes.length);
      const tail = postRange.extractContents();

      if (topBlock.childNodes.length === 0 || !topBlock.textContent?.trim()) {
        topBlock.innerHTML = '<br>';
      }

      const listBlock = createListBlock(doc, type, tail);
      topBlock.after(listBlock);
      focusListItem(sel, listBlock, type, true);
    } catch {
      // Fallback: start list after block
      const listBlock = createListBlock(doc, type, null);
      topBlock.after(listBlock);
      focusListItem(sel, listBlock, type);
    }
  }

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

