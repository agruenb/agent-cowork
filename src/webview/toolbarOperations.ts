import { indentListItem, outdentListItem, indentRawText, outdentRawText } from '../markdown/listOperations';

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
 * Toggles or converts a list item or block in the contenteditable canvas.
 * - If current item matches type: toggles off to a standard paragraph.
 * - If current item is a different list type: converts in-place (never nests!).
 * - If current block is a paragraph or heading: converts to the requested list type.
 * - If canvas is empty: inserts a new list.
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
      // Extract inline content excluding child lists
      const cloned = contentEl.cloneNode(true) as HTMLElement;
      cloned.querySelectorAll('ul, ol, input[type="checkbox"]').forEach((n) => n.remove());
      const htmlContent = cloned.innerHTML.trim() || '<br>';

      const p = doc.createElement('p');
      p.className = 'editor-block';
      p.setAttribute('data-block-type', 'paragraph');
      p.innerHTML = htmlContent;

      // Extract any nested sublists inside this li so they are not lost
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

        // Insert p right after parentList
        grandParent.insertBefore(p, parentList.nextSibling);

        // If there were nested sublists, place them after p
        let insertAnchor: Node = p;
        for (const sub of nestedLists) {
          grandParent.insertBefore(sub, insertAnchor.nextSibling);
          insertAnchor = sub;
        }

        // If there were next siblings, split them into a new list of same type after insertAnchor
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

      // Position cursor inside the new paragraph
      if (sel) {
        const range = doc.createRange();
        range.selectNodeContents(p);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      onMutated?.();
      return;
    }

    // CONVERT to different list type in-place
    if (type === 'task') {
      // Convert to task item
      activeLi.className = 'task-item';
      activeLi.setAttribute('data-checked', 'false');

      // Check if checkbox already exists
      let cb = activeLi.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      if (!cb) {
        cb = doc.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-checkbox';
        cb.contentEditable = 'false';
      }

      // Content
      let contentSpan = activeLi.querySelector(':scope > .task-content') as HTMLElement | null;
      if (!contentSpan) {
        contentSpan = doc.createElement('span');
        contentSpan.className = 'task-content';
        // Move all non-list children into contentSpan
        const toMove: Node[] = [];
        activeLi.childNodes.forEach((n) => {
          if (n !== cb && (n.nodeType !== 1 || ((n as HTMLElement).tagName !== 'UL' && (n as HTMLElement).tagName !== 'OL'))) {
            toMove.push(n);
          }
        });
        toMove.forEach((n) => contentSpan!.appendChild(n));
        if (contentSpan.childNodes.length === 0) {
          contentSpan.innerHTML = '<br>';
        }
      }

      // Re-assemble activeLi
      const sublists = Array.from(activeLi.children).filter(
        (c) => c.tagName === 'UL' || c.tagName === 'OL'
      );
      activeLi.innerHTML = '';
      activeLi.appendChild(cb);
      activeLi.appendChild(contentSpan);
      sublists.forEach((sub) => activeLi.appendChild(sub));

      // Ensure parent list is a task list
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
      // Convert to regular bullet or ordered item
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
      const targetClass = type === 'ordered' ? 'editor-block ordered-list' : 'editor-block bullet-list';
      const targetType = type === 'ordered' ? 'ordered_list' : 'unordered_list';

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

  // Not inside a list item: convert active block or insert new list
  const anchorNode = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const topBlock = findTopBlock(anchorNode, canvas);

  const listTag = type === 'ordered' ? 'ol' : 'ul';
  const listEl = doc.createElement(listTag);
  listEl.className =
    type === 'task'
      ? 'editor-block task-list'
      : type === 'ordered'
      ? 'editor-block ordered-list'
      : 'editor-block bullet-list';
  listEl.setAttribute(
    'data-block-type',
    type === 'task' ? 'task_list' : type === 'ordered' ? 'ordered_list' : 'unordered_list'
  );

  const li = doc.createElement('li');

  let textContent = '';
  if (topBlock) {
    textContent = topBlock.innerHTML.trim();
    if (textContent === '<br>') textContent = '';
  }

  if (type === 'task') {
    li.className = 'task-item';
    li.setAttribute('data-checked', 'false');

    const cb = doc.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-checkbox';
    cb.contentEditable = 'false';

    const span = doc.createElement('span');
    span.className = 'task-content';
    span.innerHTML = textContent || 'Aufgabe...';

    li.appendChild(cb);
    li.appendChild(span);
    listEl.appendChild(li);

    if (topBlock) {
      topBlock.replaceWith(listEl);
    } else {
      canvas.appendChild(listEl);
    }

    if (sel) {
      const range = doc.createRange();
      range.selectNodeContents(span);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else {
    li.className = 'list-item';
    li.innerHTML = textContent || (type === 'ordered' ? 'Element...' : 'Element...');
    listEl.appendChild(li);

    if (topBlock) {
      topBlock.replaceWith(listEl);
    } else {
      canvas.appendChild(listEl);
    }

    if (sel) {
      const range = doc.createRange();
      range.selectNodeContents(li);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
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
    const isEmpty = !topBlock.textContent?.trim() && (!topBlock.children.length || topBlock.innerHTML === '<br>');
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

  const tag = val.toLowerCase();
  const content = topBlock.innerHTML || '<br>';

  let newEl: HTMLElement;
  if (tag === 'p') {
    const p = doc.createElement('p');
    p.className = 'editor-block';
    p.setAttribute('data-block-type', 'paragraph');
    p.innerHTML = content;
    topBlock.replaceWith(p);
    newEl = p;
  } else {
    const level = tag.replace('h', '') || '1';
    const h = doc.createElement(tag);
    h.className = 'editor-block';
    h.setAttribute('data-block-type', 'heading');
    h.setAttribute('data-level', level);
    h.innerHTML = content;
    topBlock.replaceWith(h);
    newEl = h;
  }

  if (sel) {
    const range = doc.createRange();
    range.selectNodeContents(newEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  onMutated?.();
}

/**
 * Applies markdown formatting to a raw textarea based on the toolbar action.
 */
export function applyRawFormatting(
  textarea: HTMLTextAreaElement,
  action: string,
  param?: string
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selectedText = val.slice(start, end);

  let newText = val;
  let newStart = start;
  let newEnd = end;

  switch (action) {
    case 'bold': {
      if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length >= 4) {
        // Toggle off
        const inner = selectedText.slice(2, -2);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `**${selectedText}**`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 2;
        newEnd = selectedText ? start + wrap.length : start + 2;
      }
      break;
    }

    case 'italic': {
      if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length >= 2) {
        // Toggle off
        const inner = selectedText.slice(1, -1);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `*${selectedText}*`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 1;
        newEnd = selectedText ? start + wrap.length : start + 1;
      }
      break;
    }

    case 'strike': {
      if (selectedText.startsWith('~~') && selectedText.endsWith('~~') && selectedText.length >= 4) {
        // Toggle off
        const inner = selectedText.slice(2, -2);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `~~${selectedText}~~`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 2;
        newEnd = selectedText ? start + wrap.length : start + 2;
      }
      break;
    }

    case 'code': {
      if (selectedText.includes('\n') || !selectedText) {
        const block = `\`\`\`markdown\n${selectedText || '// Code hier eingeben...'}\n\`\`\``;
        newText = val.slice(0, start) + block + val.slice(end);
        newEnd = start + block.length;
      } else {
        const inline = `\`${selectedText}\``;
        newText = val.slice(0, start) + inline + val.slice(end);
        newEnd = start + inline.length;
      }
      break;
    }

    case 'quote': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allQuoted = targetLines.every((l) => l.trimStart().startsWith('> '));
      const transformed = targetLines
        .map((l) => (allQuoted ? l.replace(/^(\s*)>\s?/, '$1') : `> ${l}`))
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'bullet': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allBulleted = targetLines.every((l) => /^\s*[-*+]\s+/.test(l));
      const transformed = targetLines
        .map((l) => (allBulleted ? l.replace(/^(\s*)[-*+]\s+/, '$1') : l.replace(/^(\s*)/, '$1- ')))
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'ordered': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allOrdered = targetLines.every((l) => /^\s*\d+[.)]\s+/.test(l));
      let idx = 1;
      const transformed = targetLines
        .map((l) => {
          if (allOrdered) {
            return l.replace(/^(\s*)\d+[.)]\s+/, '$1');
          } else {
            const res = l.replace(/^(\s*)/, `$1${idx}. `);
            idx++;
            return res;
          }
        })
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'task': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allTasks = targetLines.every((l) => /^\s*[-*+]\s+\[([ xX])\]\s*/.test(l));
      const transformed = targetLines
        .map((l) => {
          if (allTasks) {
            // Toggle off
            return l.replace(/^(\s*)[-*+]\s+\[([ xX])\]\s*/, '$1');
          } else {
            // Remove any bullet/number marker then add task marker
            const clean = l.replace(/^(\s*)([-*+]|\d+[.)])\s+/, '$1');
            return clean.replace(/^(\s*)/, '$1- [ ] ');
          }
        })
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'indent': {
      const res = indentRawText(val, start, end);
      newText = res.value;
      newStart = res.selectionStart;
      newEnd = res.selectionEnd;
      break;
    }

    case 'outdent': {
      const res = outdentRawText(val, start, end);
      newText = res.value;
      newStart = res.selectionStart;
      newEnd = res.selectionEnd;
      break;
    }

    case 'table': {
      const tableMarkdown = `\n| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n| Inhalt 1 | Inhalt 2 | Inhalt 3 |\n| Inhalt 4 | Inhalt 5 | Inhalt 6 |\n`;
      newText = val.slice(0, start) + tableMarkdown + val.slice(end);
      newEnd = start + tableMarkdown.length;
      break;
    }

    case 'hr': {
      const hr = `\n---\n`;
      newText = val.slice(0, start) + hr + val.slice(end);
      newEnd = start + hr.length;
      break;
    }

    case 'heading': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const line = val.slice(lineStart, lineEnd);
      const cleanLine = line.replace(/^\s*#{1,6}\s*/, '');

      let prefix = '';
      if (param === 'h1') prefix = '# ';
      else if (param === 'h2') prefix = '## ';
      else if (param === 'h3') prefix = '### ';

      const transformed = `${prefix}${cleanLine}`;
      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart + transformed.length;
      newEnd = newStart;
      break;
    }
  }

  textarea.value = newText;
  textarea.selectionStart = newStart;
  textarea.selectionEnd = newEnd;
  textarea.focus();
  const win = textarea.ownerDocument?.defaultView;
  const Evt = win ? win.Event : Event;
  try {
    textarea.dispatchEvent(new Evt('input', { bubbles: true }));
  } catch {
    // Ignore in headless test runners if Event constructor differs
  }
}
