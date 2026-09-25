import { safeMarkdownToHtml } from '../markdown/parser';
import { getFilenameHue, getDarkShade, hslToHex } from '../utils/colorUtils';
import {
  indentListItem,
  outdentListItem,
  indentRawText,
  outdentRawText,
} from '../markdown/listOperations';
import { wireTableInteractions, handleTableKeyDown } from './tableInteractions';
import { wireToolbar, executeCommand } from './toolbarWiring';
import { wireBlockFocus } from './blockFocus';
import { wireBlockDelete } from './blockDelete';
import { handleBlockKeyboardGuards, handleTaskCheckboxBackspace } from './keyboardGuards';
import { getWebviewLanguage, setWebviewLanguage, tWebview, WebviewLanguage } from './i18n';
import {
  wireSelectionCowork,
  hideSelectionCoworkButton,
  updateSelectionCoworkButtonLanguage,
} from './selectionCowork';
import {
  state,
  showErrorBanner,
  hideErrorBanner,
  emitEdit,
  emitCanvasEdit,
  getMarkdownFromCanvas,
  saveSelection,
  restoreSelection,
  vscode,
  getEditorCanvas,
  getRawTextarea,
  getRawToggleBtn,
  getErrorBannerDismiss,
  autoResizeRawTextarea,
  getRawWrapper,
  getRawGutter,
  flushPendingEdit,
  getDocumentViewport,
} from './editorState';
import { updateRawLineNumbers } from './rawLineNumbers';
import {
  syncBlockLineAttributes,
  getVisibleLineInFormatted,
  getVisibleLineInRaw,
  scrollToLineInFormatted,
  scrollToLineInRaw,
} from './scrollSync';

// -------------------------------------------------------------
// Core View Management
// -------------------------------------------------------------

/**
 * Wire up interactive click events for task checkboxes.
 */
export function wireTaskCheckboxes(): void {
  const canvas = getEditorCanvas();
  const checkboxes = canvas ? canvas.querySelectorAll<HTMLInputElement>('.task-checkbox') : [];
  checkboxes.forEach((cb) => {
    cb.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const li = target.closest('li');
      if (li) {
        if (target.checked) {
          li.classList.add('is-checked');
          li.setAttribute('data-checked', 'true');
        } else {
          li.classList.remove('is-checked');
          li.setAttribute('data-checked', 'false');
        }
        emitCanvasEdit();
      }
    };
  });
}

/**
 * Renders markdown text into the formatted contenteditable canvas with safe error boundaries.
 * Returns true if parsing succeeded, or false if parser encountered an error and fell back.
 */
export function setContentFormatted(markdown: string): boolean {
  const canvas = getEditorCanvas();
  const textarea = getRawTextarea();
  const toggleBtn = getRawToggleBtn();
  const { html, error } = safeMarkdownToHtml(markdown);
  if (error) {
    console.error('Agent Cowork Parser error in setContentFormatted:', error);
    state.hasParseError = true;
    state.currentMarkdown = markdown;
    if (textarea) {
      textarea.value = markdown;
    }
    showErrorBanner(
      getWebviewLanguage() === 'en'
        ? 'Warning: Formatting error in document. Switched to raw source mode to prevent data loss.'
        : 'Warnung: Formatierungsfehler im Dokument. Um Datenverlust zu verhindern, wurde in den Quelltext-Modus gewechselt.'
    );
    // Switch to raw mode safely WITHOUT calling domToMarkdown(editorCanvas)
    if (!state.isRawMode) {
      state.isRawMode = true;
      if (canvas) canvas.style.display = 'none';
      const wrapper = getRawWrapper();
      if (wrapper) wrapper.style.display = 'flex';
      const gutter = getRawGutter();
      if (gutter) gutter.style.display = 'block';
      if (textarea) {
        textarea.style.display = 'block';
        autoResizeRawTextarea();
        updateRawLineNumbers();
      }
      if (toggleBtn) {
        toggleBtn.classList.add('is-active');
        toggleBtn.textContent = getWebviewLanguage() === 'en' ? '📄 Formatted' : '📄 Formatiert';
      }
    }
    vscode.postMessage({
      type: 'parseError',
      error: error.message,
    });
    return false;
  }

  state.hasParseError = false;
  hideErrorBanner();
  state.currentMarkdown = markdown;
  if (canvas) {
    canvas.innerHTML = html;
    syncBlockLineAttributes(canvas, markdown);
  }
  if (textarea) textarea.value = markdown;
  wireTaskCheckboxes();
  if (canvas) wireTableInteractions(canvas, () => emitCanvasEdit());
  state.isCanvasDirty = false;
  return true;
}

/**
 * Toggles between Formatted View (default) and Raw Markdown source mode.
 */
export function toggleRawMode(): void {
  hideSelectionCoworkButton();
  const canvas = getEditorCanvas();
  const textarea = getRawTextarea();
  const toggleBtn = getRawToggleBtn();
  const viewport = getDocumentViewport();
  state.isRawMode = !state.isRawMode;

  if (state.isRawMode) {
    // Switch to Raw Mode
    flushPendingEdit();
    if (state.isCanvasDirty) {
      const md = getMarkdownFromCanvas();
      if (md !== null) {
        if (textarea) textarea.value = md;
        state.currentMarkdown = md;
        if (canvas) syncBlockLineAttributes(canvas, md);
      }
      state.isCanvasDirty = false;
    } else {
      if (textarea && textarea.value !== state.currentMarkdown) {
        textarea.value = state.currentMarkdown;
      }
    }

    // Capture visible line while Formatted canvas is still visible
    const target = canvas && viewport
      ? getVisibleLineInFormatted(canvas, viewport)
      : { line: 1, fraction: 0 };

    if (canvas) canvas.style.display = 'none';
    const wrapper = getRawWrapper();
    if (wrapper) wrapper.style.display = 'flex';
    const gutter = getRawGutter();
    if (gutter) gutter.style.display = 'block';
    if (textarea) {
      textarea.style.display = 'block';
      autoResizeRawTextarea();
      updateRawLineNumbers();
      textarea.focus({ preventScroll: true });
    }
    if (toggleBtn) {
      toggleBtn.classList.add('is-active');
      toggleBtn.textContent = getWebviewLanguage() === 'en' ? '📄 Formatted' : '📄 Formatiert';
    }

    // Scroll to target line in Raw mode
    if (textarea && viewport) {
      scrollToLineInRaw(target.line, target.fraction, textarea, gutter, viewport, target.isBottom);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          scrollToLineInRaw(target.line, target.fraction, textarea, gutter, viewport, target.isBottom);
        });
      }
    }
  } else {
    // Switch to Formatted Mode
    const gutter = getRawGutter();
    // Capture visible line while Raw view is still visible
    const target = textarea && viewport
      ? getVisibleLineInRaw(textarea, gutter, viewport)
      : { line: 1, fraction: 0 };

    const md = textarea ? textarea.value : '';
    const isModifiedInRaw = md !== state.currentMarkdown;
    const success = setContentFormatted(md);
    if (!success) {
      // Keep in raw mode if parsing failed
      state.isRawMode = true;
      if (canvas) canvas.style.display = 'none';
      const wrapper = getRawWrapper();
      if (wrapper) wrapper.style.display = 'flex';
      if (gutter) gutter.style.display = 'block';
      if (textarea) {
        textarea.style.display = 'block';
        autoResizeRawTextarea();
        updateRawLineNumbers();
      }
      if (toggleBtn) {
        toggleBtn.classList.add('is-active');
        toggleBtn.textContent = getWebviewLanguage() === 'en' ? '📄 Formatted' : '📄 Formatiert';
      }
      return;
    }
    const wrapper = getRawWrapper();
    if (wrapper) wrapper.style.display = 'none';
    if (gutter) gutter.style.display = 'none';
    if (textarea) textarea.style.display = 'none';
    if (canvas) {
      canvas.style.display = 'block';
      canvas.focus({ preventScroll: true });
    }
    if (toggleBtn) {
      toggleBtn.classList.remove('is-active');
      toggleBtn.textContent = '</> Raw';
    }
    if (isModifiedInRaw) {
      emitEdit(md);
    }
    flushPendingEdit();

    // Scroll to target line in Formatted mode
    if (canvas && viewport) {
      scrollToLineInFormatted(target.line, target.fraction, canvas, viewport, target.isBottom);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          scrollToLineInFormatted(target.line, target.fraction, canvas, viewport, target.isBottom);
        });
      }
    }
  }
}

// -------------------------------------------------------------
// Canvas & Textarea Event Handlers
// -------------------------------------------------------------

export function handleRawKeyDown(e: KeyboardEvent): void {
  const textarea = getRawTextarea();
  if (!textarea) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    const result = e.shiftKey
      ? outdentRawText(textarea.value, textarea.selectionStart, textarea.selectionEnd)
      : indentRawText(textarea.value, textarea.selectionStart, textarea.selectionEnd);

    textarea.value = result.value;
    textarea.selectionStart = result.selectionStart;
    textarea.selectionEnd = result.selectionEnd;
    emitEdit(textarea.value);
  }
}

export function handleCanvasKeyDown(e: KeyboardEvent): void {
  const canvas = getEditorCanvas();
  if (!canvas) return;

  const target = e.target as HTMLElement | null;
  const langInput = target?.closest<HTMLInputElement>('input.code-lang-input');
  if (langInput && canvas.contains(langInput)) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const wrapper = langInput.closest<HTMLElement>('.code-block-wrapper');
      const codeEl = wrapper?.querySelector<HTMLElement>('code.editor-code');
      if (codeEl) {
        codeEl.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(codeEl);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    return;
  }
  if (target?.closest('input')) {
    return;
  }

  if (handleBlockKeyboardGuards(e, canvas, () => emitCanvasEdit())) {
    return;
  }

  // Backspace / Delete handling adjacent to a task checkbox
  if (handleTaskCheckboxBackspace(e, canvas, () => emitCanvasEdit(), wireTaskCheckboxes)) {
    return;
  }

  // Table key handling: Tab, Shift+Tab, and Arrow key navigation
  if (handleTableKeyDown(e, canvas, () => emitCanvasEdit())) {
    return;
  }

  // Tab / Shift+Tab for list indentation / outdenting
  if (e.key === 'Tab') {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode;
      const li =
        anchorNode && anchorNode.nodeType === 1 ? (anchorNode as Element).closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && canvas.contains(li)) {
        if (e.shiftKey) {
          const saved = saveSelection();
          outdentListItem(li);
          wireTaskCheckboxes();
          restoreSelection(saved);
          emitCanvasEdit();
          return;
        }

        const saved = saveSelection();
        const didIndent = indentListItem(li);
        if (didIndent) {
          wireTaskCheckboxes();
          restoreSelection(saved);
          emitCanvasEdit();
          return;
        }

        // Inside first list item that cannot be indented further: insert 2 spaces
        document.execCommand('insertText', false, '  ');
        emitCanvasEdit();
        return;
      }

      // If not in a list item and not Shift+Tab, insert 2 spaces
      if (!e.shiftKey) {
        document.execCommand('insertText', false, '  ');
        emitCanvasEdit();
        return;
      }
    }
    return;
  }

  // Enter key handling in list items
  if (e.key === 'Enter' && !e.shiftKey) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode;
      const li =
        anchorNode && anchorNode.nodeType === 1 ? (anchorNode as Element).closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && canvas.contains(li)) {
        const isTask =
          li.classList.contains('task-item') ||
          li.parentElement?.classList.contains('task-list') ||
          li.querySelector(':scope > input[type="checkbox"]') !== null;
        const contentEl = isTask ? li.querySelector('.task-content') || li : li;
        const text = contentEl.textContent?.trim() || '';

        // If empty list item: outdent if nested, or exit list if at root
        if (!text) {
          e.preventDefault();
          const currentList = li.parentElement;
          const parentLi = currentList?.closest('li');
          if (parentLi) {
            outdentListItem(li);
            wireTaskCheckboxes();
            emitCanvasEdit();
            return;
          }

          // Top-level empty list item: exit list and insert a paragraph
          li.remove();

          const doc = canvas.ownerDocument || document;
          const p = doc.createElement('p');
          p.className = 'editor-block';
          p.setAttribute('data-block-type', 'paragraph');
          p.innerHTML = '<br>';

          if (currentList && currentList.children.length === 0) {
            currentList.replaceWith(p);
          } else if (currentList) {
            currentList.after(p);
          } else {
            canvas.appendChild(p);
          }

          const range = doc.createRange();
          range.setStart(p, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          emitCanvasEdit();
          return;
        }

        if (isTask) {
          // Only for task checklists: insert a new task item with checkbox
          e.preventDefault();
          const doc = canvas.ownerDocument || document;
          const newLi = doc.createElement('li');
          newLi.className = 'task-item';
          newLi.setAttribute('data-checked', 'false');

          const cb = doc.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'task-checkbox';
          cb.contentEditable = 'false';

          const span = doc.createElement('span');
          span.className = 'task-content';
          span.innerHTML = '<br>';

          newLi.appendChild(cb);
          newLi.appendChild(span);

          li.after(newLi);
          wireTaskCheckboxes();

          const range = doc.createRange();
          range.setStart(span, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          emitCanvasEdit();
          return;
        }

        // For regular bullet or ordered lists with text:
        // Native contenteditable handles Enter by creating a new <li> of the current list type.
      }
    }
  }

  // Ctrl/Cmd + B for bold
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    executeCommand('bold');
  }

  // Ctrl/Cmd + I for italic
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    executeCommand('italic');
  }
}

export function getCaretPositionForCoordinates(
  doc: Document,
  canvas: HTMLElement,
  clientX: number,
  clientY: number
): { node: Node; offset: number } | null {
  const canvasRect = canvas.getBoundingClientRect();
  let clampedX = clientX;
  let clampedY = clientY;
  if (canvasRect.width > 0 && canvasRect.height > 0) {
    clampedX = Math.max(canvasRect.left + 5, Math.min(canvasRect.right - 5, clientX));
    clampedY = Math.max(canvasRect.top + 2, Math.min(canvasRect.bottom - 2, clientY));
  }

  // 1. Standard API: caretPositionFromPoint (Chrome 128+)
  if (typeof (doc as any).caretPositionFromPoint === 'function') {
    const pos = (doc as any).caretPositionFromPoint(clampedX, clampedY);
    if (pos && pos.offsetNode && canvas.contains(pos.offsetNode)) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }

  // 2. WebKit / Blink API: caretRangeFromPoint (All Chrome / Electron versions)
  if (typeof (doc as any).caretRangeFromPoint === 'function') {
    const range = (doc as any).caretRangeFromPoint(clampedX, clampedY);
    if (range && range.startContainer && canvas.contains(range.startContainer)) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }

  // 3. Fallback for test / headless environments
  if (typeof doc.elementFromPoint === 'function') {
    const el = doc.elementFromPoint(clampedX, clampedY);
    if (el && canvas.contains(el)) {
      const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
      let lastText: Text | null = null;
      let curr = walker.nextNode();
      while (curr) {
        lastText = curr as Text;
        curr = walker.nextNode();
      }
      if (lastText) {
        return { node: lastText, offset: lastText.length };
      }
    }
  }

  return null;
}

export function getFirstCaretPosition(node: Node): { node: Node; offset: number } {
  let curr: Node = node;
  while (curr.firstChild) {
    curr = curr.firstChild;
  }
  if (curr.nodeType === 3) {
    return { node: curr, offset: 0 };
  }
  if (curr.parentNode) {
    const idx = Array.prototype.indexOf.call(curr.parentNode.childNodes, curr);
    return { node: curr.parentNode, offset: idx >= 0 ? idx : 0 };
  }
  return { node: curr, offset: 0 };
}

export function getLastCaretPosition(node: Node): { node: Node; offset: number } {
  let curr: Node = node;
  while (curr.lastChild) {
    curr = curr.lastChild;
  }
  if (curr.nodeName === 'BR') {
    if (curr.previousSibling && curr.previousSibling.nodeType === 3) {
      return { node: curr.previousSibling, offset: (curr.previousSibling as Text).length };
    }
    if (curr.parentNode) {
      const idx = Array.prototype.indexOf.call(curr.parentNode.childNodes, curr);
      return { node: curr.parentNode, offset: idx >= 0 ? idx : 0 };
    }
  }
  if (curr.nodeType === 3) {
    return { node: curr, offset: (curr as Text).length };
  }
  if (curr.parentNode) {
    return { node: curr.parentNode, offset: curr.parentNode.childNodes.length };
  }
  return { node: curr, offset: 0 };
}

export function getCaretAtPoint(
  doc: Document,
  x: number,
  y: number,
  container: HTMLElement
): { node: Node; offset: number } | null {
  if (typeof (doc as any).caretPositionFromPoint === 'function') {
    const pos = (doc as any).caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode && container.contains(pos.offsetNode)) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }
  if (typeof (doc as any).caretRangeFromPoint === 'function') {
    const range = (doc as any).caretRangeFromPoint(x, y);
    if (range && range.startContainer && container.contains(range.startContainer)) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

/**
 * Places caret at the end of a line's text when the user clicks or starts dragging
 * in the empty line area to the right of the text (in list items, paragraphs, headings, blockquotes, etc.).
 * When the user drags, handles drag selection smoothly.
 */
export function handleLineClickOrDragOutsideText(e: MouseEvent, canvas: HTMLElement): boolean {
  if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;

  const target = e.target as HTMLElement | null;
  if (!target) return false;

  const doc = canvas.ownerDocument || document;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;

  // Don't interfere if clicking interactive elements (checkbox, buttons, tables, code language input, delete buttons)
  if (
    target.closest(
      'input, button, a, table, code, .widget-block:not([data-block-type="blockquote"]), .block-delete-btn, .table-controls'
    )
  ) {
    return false;
  }

  // Only adjust when selection is collapsed (or on mousedown)
  if (e.type !== 'mousedown' && sel && !sel.isCollapsed) return false;

  const viewport = (doc.querySelector('.document-viewport') as HTMLElement | null) || null;
  const container = (doc.querySelector('.document-container') as HTMLElement | null) || null;

  // Don't interfere if user clicked the scrollbar in the viewport
  if (viewport && target === viewport) {
    const hasScrollbar = viewport.offsetWidth > viewport.clientWidth && viewport.clientWidth > 0;
    if (hasScrollbar) {
      const vRect = viewport.getBoundingClientRect();
      if (e.clientX >= vRect.left + viewport.clientWidth) {
        return false;
      }
    }
  }

  const prevScrollTop = viewport ? viewport.scrollTop : null;

  // Only adjust when selection is collapsed (or on mousedown)
  if (e.type !== 'mousedown' && sel && !sel.isCollapsed) return false;

  // Find the relevant block element:
  let blockEl: HTMLElement | null = null;
  let isBelowAllBlocks = false;
  let isAboveAllBlocks = false;

  if (canvas.contains(target) && target !== canvas) {
    blockEl =
      target.closest<HTMLElement>('li, p, h1, h2, h3, h4, h5, h6, blockquote') ||
      (target.classList.contains('editor-block') ? target : null);
  }

  if (!blockEl) {
    // If clicked on canvas background, document-viewport or document-container outside canvas at clientY
    if (target === canvas || target === viewport || target === container || viewport?.contains(target)) {
      const blocks = Array.from(
        canvas.querySelectorAll<HTMLElement>('li, p.editor-block, h1, h2, h3, h4, h5, h6, blockquote')
      );
      if (blocks.length > 0) {
        let closestBlock: HTMLElement | null = null;
        let minDistance = Infinity;
        for (const b of blocks) {
          const br = b.getBoundingClientRect();
          if (br.height > 0) {
            if (e.clientY >= br.top - 2 && e.clientY <= br.bottom + 2) {
              blockEl = b;
              break;
            }
            const dist = Math.min(Math.abs(e.clientY - br.top), Math.abs(e.clientY - br.bottom));
            if (dist < minDistance) {
              minDistance = dist;
              closestBlock = b;
            }
          }
        }
        if (!blockEl) {
          blockEl = closestBlock || blocks[blocks.length - 1];
          const lastRect = blocks[blocks.length - 1].getBoundingClientRect();
          const firstRect = blocks[0].getBoundingClientRect();
          if (e.clientY > lastRect.bottom) {
            isBelowAllBlocks = true;
          } else if (e.clientY < firstRect.top) {
            isAboveAllBlocks = true;
          }
        }
      }
    }
  }

  if (!blockEl || !canvas.contains(blockEl)) {
    if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
      canvas.focus({ preventScroll: true });
    }
    if (viewport && prevScrollTop !== null && viewport.scrollTop !== prevScrollTop) {
      viewport.scrollTop = prevScrollTop;
    }
    return false;
  }

  // Content container (e.g. .task-content for task items, to avoid checkbox)
  const isTask =
    blockEl.classList.contains('task-item') ||
    blockEl.querySelector(':scope > input[type="checkbox"]') !== null;
  const contentEl = ((isTask ? blockEl.querySelector('.task-content') : blockEl) as HTMLElement) || blockEl;

  // Find non-sublist, non-input child nodes in contentEl
  const childNodes = Array.from(contentEl.childNodes).filter(
    (n) => n.nodeName !== 'UL' && n.nodeName !== 'OL' && n.nodeName !== 'INPUT'
  );

  // If block is completely empty or text is empty/whitespace/<br>, place cursor in block
  const textContent = childNodes.map((n) => n.textContent || '').join('').trim();
  if (childNodes.length === 0 || !textContent) {
    if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
      canvas.focus({ preventScroll: true });
    }
    const newRange = doc.createRange();
    newRange.setStart(blockEl, 0);
    newRange.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    if (viewport && prevScrollTop !== null && viewport.scrollTop !== prevScrollTop) {
      viewport.scrollTop = prevScrollTop;
    }
    e.preventDefault();
    return true;
  }

  const firstNode = childNodes[0];
  const lastNode = childNodes[childNodes.length - 1];

  try {
    const r = doc.createRange();
    r.setStartBefore(firstNode);
    r.setEndAfter(lastNode);

    const validRects = Array.from(
      typeof r.getClientRects === 'function' ? r.getClientRects() : []
    ).filter((rect) => rect.width > 0 || rect.height > 0);
    if (validRects.length === 0) {
      const br = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null;
      if (br && (br.width > 0 || br.height > 0)) {
        validRects.push(br);
      } else {
        validRects.push(contentEl.getBoundingClientRect());
      }
    }

    interface VisualLine {
      top: number;
      bottom: number;
      left: number;
      right: number;
      rects: DOMRect[];
    }

    const sortedRects = [...validRects].sort((a, b) => a.top - b.top || a.left - b.left);
    const lines: VisualLine[] = [];

    for (const rect of sortedRects) {
      let matchedLine: VisualLine | null = null;
      for (const line of lines) {
        const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
        const minHeight = Math.min(line.bottom - line.top, rect.bottom - rect.top);
        const rectCenterY = rect.top + rect.height / 2;
        const lineCenterY = line.top + (line.bottom - line.top) / 2;
        const isNearLine =
          (overlap > 0 && (minHeight <= 0 || overlap >= minHeight * 0.3)) ||
          Math.abs(rectCenterY - lineCenterY) <= Math.max(8, minHeight * 0.5);

        if (isNearLine) {
          matchedLine = line;
          break;
        }
      }

      if (matchedLine) {
        matchedLine.top = Math.min(matchedLine.top, rect.top);
        matchedLine.bottom = Math.max(matchedLine.bottom, rect.bottom);
        matchedLine.left = Math.min(matchedLine.left, rect.left);
        matchedLine.right = Math.max(matchedLine.right, rect.right);
        matchedLine.rects.push(rect);
      } else {
        lines.push({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          rects: [rect],
        });
      }
    }

    lines.sort((a, b) => a.top - b.top);

    let targetLine = lines[lines.length - 1];
    let targetLineIndex = lines.length - 1;
    let bestDist = Infinity;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (e.clientY >= line.top - 2 && e.clientY <= line.bottom + 2) {
        targetLine = line;
        targetLineIndex = i;
        break;
      }
      const dist = Math.min(Math.abs(e.clientY - line.top), Math.abs(e.clientY - line.bottom));
      if (dist < bestDist) {
        bestDist = dist;
        targetLine = line;
        targetLineIndex = i;
      }
    }

    const isFirstVisualLine = targetLineIndex === 0;
    const isLastVisualLine = targetLineIndex === lines.length - 1;

    const isClickBelowLine = isBelowAllBlocks || (targetLine && e.clientY > targetLine.bottom + 2);
    const isClickAboveLine = isAboveAllBlocks || (targetLine && e.clientY < targetLine.top - 2);

    const isClickToRight =
      (targetLine && targetLine.right > 0 && e.clientX > targetLine.right - 2) ||
      (isLastVisualLine && isClickBelowLine);
    const isClickToLeft =
      (targetLine && e.clientX < targetLine.left + 2) ||
      (isFirstVisualLine && isClickAboveLine);

    // Handle clicks to the left (start of line) or right (end of line) of text:
    if (isClickToRight || isClickToLeft) {
      if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
        canvas.focus({ preventScroll: true });
      }

      let anchorNode: Node;
      let anchorOffset: number;

      if (isClickToLeft) {
        // Place caret at start of line
        if (isFirstVisualLine) {
          const firstPos = getFirstCaretPosition(firstNode);
          anchorNode = firstPos.node;
          anchorOffset = firstPos.offset;
        } else {
          const centerY = targetLine.top + (targetLine.bottom - targetLine.top) / 2;
          const ptPos = getCaretAtPoint(doc, targetLine.left + 1, centerY, contentEl);
          if (ptPos) {
            anchorNode = ptPos.node;
            anchorOffset = ptPos.offset;
          } else {
            const firstPos = getFirstCaretPosition(firstNode);
            anchorNode = firstPos.node;
            anchorOffset = firstPos.offset;
          }
        }
      } else {
        // Place caret at end of line
        if (isLastVisualLine) {
          const lastPos = getLastCaretPosition(lastNode);
          anchorNode = lastPos.node;
          anchorOffset = lastPos.offset;
        } else {
          const centerY = targetLine.top + (targetLine.bottom - targetLine.top) / 2;
          const ptPos = getCaretAtPoint(doc, targetLine.right - 1, centerY, contentEl);
          if (ptPos) {
            anchorNode = ptPos.node;
            anchorOffset = ptPos.offset;
          } else {
            const lastPos = getLastCaretPosition(lastNode);
            anchorNode = lastPos.node;
            anchorOffset = lastPos.offset;
          }
        }
      }

      const newRange = doc.createRange();
      try {
        newRange.setStart(anchorNode, anchorOffset);
        newRange.collapse(true);
      } catch {
        if (isClickToLeft) {
          newRange.setStartBefore(anchorNode);
        } else {
          newRange.setStartAfter(anchorNode);
        }
        newRange.collapse(true);
      }

      if (sel) {
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      if (viewport && prevScrollTop !== null && viewport.scrollTop !== prevScrollTop) {
        viewport.scrollTop = prevScrollTop;
      }

      // If mousedown: attach drag selection listeners to track dragging
      if (e.type === 'mousedown') {
        let isDragging = false;

        const onMouseMove = (moveEvent: MouseEvent) => {
          if (moveEvent.buttons !== 1) {
            cleanup();
            return;
          }

          isDragging = true;

          const focusPos = getCaretPositionForCoordinates(doc, canvas, moveEvent.clientX, moveEvent.clientY);
          if (!focusPos) return;

          const curSel = win ? win.getSelection() : null;
          if (!curSel) return;

          if (typeof curSel.setBaseAndExtent === 'function') {
            try {
              curSel.setBaseAndExtent(anchorNode, anchorOffset, focusPos.node, focusPos.offset);
            } catch {
              // Ignore coordinate mismatch
            }
          } else {
            try {
              const range = doc.createRange();
              const comp = anchorNode.compareDocumentPosition(focusPos.node);
              if (
                comp & Node.DOCUMENT_POSITION_FOLLOWING ||
                (anchorNode === focusPos.node && anchorOffset <= focusPos.offset)
              ) {
                range.setStart(anchorNode, anchorOffset);
                range.setEnd(focusPos.node, focusPos.offset);
              } else {
                range.setStart(focusPos.node, focusPos.offset);
                range.setEnd(anchorNode, anchorOffset);
              }
              curSel.removeAllRanges();
              curSel.addRange(range);
            } catch {
              // Ignore
            }
          }
        };

        const onMouseUp = () => {
          cleanup();
          if (isDragging) {
            const EventCtor = (win && (win as any).Event) || Event;
            doc.dispatchEvent(new EventCtor('selectionchange'));
          }
        };

        const cleanup = () => {
          doc.removeEventListener('mousemove', onMouseMove, true);
          doc.removeEventListener('mouseup', onMouseUp, true);
        };

        doc.addEventListener('mousemove', onMouseMove, true);
        doc.addEventListener('mouseup', onMouseUp, true);
      }

      e.preventDefault();
      return true;
    }

    // If clicked on text when no cursor is present in canvas:
    const hasCaretInCanvas = sel && sel.anchorNode && canvas.contains(sel.anchorNode);
    if (!hasCaretInCanvas && doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
      const pos = getCaretPositionForCoordinates(doc, canvas, e.clientX, e.clientY);
      if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
        canvas.focus({ preventScroll: true });
      }
      if (pos) {
        const textRange = doc.createRange();
        try {
          textRange.setStart(pos.node, pos.offset);
          textRange.collapse(true);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(textRange);
          }
        } catch {
          // Ignore
        }
      }
      if (viewport && prevScrollTop !== null && viewport.scrollTop !== prevScrollTop) {
        viewport.scrollTop = prevScrollTop;
      }
    }
  } catch {
    // Ignore measurement or range errors
  }

  return false;
}

/**
 * Backwards-compatible alias for handleLineClickOrDragOutsideText.
 */
export function handleListItemClickOutsideText(e: MouseEvent, canvas: HTMLElement): boolean {
  return handleLineClickOrDragOutsideText(e, canvas);
}

export function updateEditorLanguage(lang: WebviewLanguage): void {
  setWebviewLanguage(lang);

  // Update toolbar aria-label
  if (typeof document !== 'undefined') {
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      toolbar.setAttribute('aria-label', tWebview('Editor Werkzeugleiste'));
    }

    // Heading select
    const selectHeading = document.getElementById('select-heading') as HTMLSelectElement | null;
    if (selectHeading) {
      selectHeading.title = tWebview('Textformatierung');
      const optP = selectHeading.querySelector('option[value="p"]');
      if (optP) optP.textContent = tWebview('Normaler Text');
      const optH1 = selectHeading.querySelector('option[value="h1"]');
      if (optH1) optH1.textContent = tWebview('Überschrift 1 (Groß)');
      const optH2 = selectHeading.querySelector('option[value="h2"]');
      if (optH2) optH2.textContent = tWebview('Überschrift 2 (Mittel)');
      const optH3 = selectHeading.querySelector('option[value="h3"]');
      if (optH3) optH3.textContent = tWebview('Überschrift 3 (Klein)');
    }

    // Formatting buttons
    const btnBold = document.getElementById('btn-bold');
    if (btnBold) btnBold.title = tWebview('Fett (Cmd+B)');
    const btnItalic = document.getElementById('btn-italic');
    if (btnItalic) btnItalic.title = tWebview('Kursiv (Cmd+I)');
    const btnStrike = document.getElementById('btn-strike');
    if (btnStrike) btnStrike.title = tWebview('Durchgestrichen');

    // List buttons
    const btnTask = document.getElementById('btn-task');
    if (btnTask) {
      btnTask.title = tWebview('Aufgabenliste (Checkliste)');
      const span = btnTask.querySelector('span');
      if (span) span.textContent = tWebview('Aufgabe');
    }
    const btnBullet = document.getElementById('btn-bullet');
    if (btnBullet) {
      btnBullet.title = tWebview('Aufzählungsliste');
      const span = btnBullet.querySelector('span');
      if (span) span.textContent = tWebview('Liste');
    }
    const btnOrdered = document.getElementById('btn-ordered');
    if (btnOrdered) {
      btnOrdered.title = tWebview('Nummerierte Liste');
      const span = btnOrdered.querySelector('span');
      if (span) span.textContent = tWebview('Nummeriert');
    }

    // Insert buttons
    const btnQuote = document.getElementById('btn-quote');
    if (btnQuote) {
      btnQuote.title = tWebview('Zitat / Info-Kasten');
      btnQuote.textContent = tWebview('❝ Zitat');
    }
    const btnTable = document.getElementById('btn-table');
    if (btnTable) {
      btnTable.title = tWebview('Tabelle einfügen');
      btnTable.textContent = tWebview('田 Tabelle');
    }
    const btnCode = document.getElementById('btn-code');
    if (btnCode) {
      btnCode.title = tWebview('Code-Block');
    }

    // Toggle raw button
    const toggleBtn = getRawToggleBtn();
    if (toggleBtn) {
      toggleBtn.title = tWebview('Markdown-Quelltext anzeigen oder bearbeiten');
      if (state.isRawMode) {
        toggleBtn.textContent = lang === 'en' ? '📄 Formatted' : '📄 Formatiert';
      }
    }

    // Cowork button
    const btnCowork = document.getElementById('btn-cowork');
    if (btnCowork) {
      btnCowork.title = tWebview('Mit KI-Agent an diesem Dokument zusammenarbeiten');
    }
    updateSelectionCoworkButtonLanguage();

    // Collapse toolbar button
    const collapseBtn = document.getElementById('btn-toggle-toolbar');
    if (collapseBtn) {
      const isCollapsed = collapseBtn.classList.contains('is-collapsed');
      const title = isCollapsed
        ? tWebview('Symbolleiste ausklappen')
        : tWebview('Symbolleiste einklappen');
      collapseBtn.title = title;
      collapseBtn.setAttribute('aria-label', title);
    }

    // Error banner dismiss
    const dismissBtn = getErrorBannerDismiss();
    if (dismissBtn) {
      dismissBtn.title = tWebview('Schließen');
    }

    // Raw textarea placeholder
    const textarea = getRawTextarea();
    if (textarea) {
      textarea.placeholder = tWebview('Markdown eingeben...');
    }
  }
}

// -------------------------------------------------------------
// Filename-based Pastel Background Tint
// -------------------------------------------------------------

/**
 * Applies document accents and toolbar background tint based on the filename.
 * Derives a deterministic hue so each file gets its unique coordinated color palette,
 * automatically adapting links, blockquotes, checkboxes, table focus, and selections.
 */
export function applyFilenameTint(filename: string): void {
  const hue = getFilenameHue(filename);
  const darkShade = getDarkShade(hue);

  let hoverL = 26;
  let hoverS = 75;
  if (40 <= hue && hue <= 80) {
    hoverL = 22;
  } else if (200 <= hue && hue <= 280) {
    hoverL = 32;
  }
  const hoverShade = hslToHex(hue, hoverS, hoverL);
  const lightShade = hslToHex(hue, 55, 95);
  const lightTransShade = `hsla(${hue}, 55%, 95%, 0.35)`;
  const borderShade = hslToHex(hue, 50, 80);
  const deepDarkShade = hslToHex(hue, 80, 18);
  const selectionShade = `hsla(${hue}, 65%, 45%, 0.22)`;

  document.documentElement.style.setProperty('--file-tint-hue', String(hue));
  document.documentElement.style.setProperty('--primary', darkShade);
  document.documentElement.style.setProperty('--primary-hover', hoverShade);
  document.documentElement.style.setProperty('--primary-light', lightShade);
  document.documentElement.style.setProperty('--primary-light-trans', lightTransShade);
  document.documentElement.style.setProperty('--primary-border', borderShade);
  document.documentElement.style.setProperty('--primary-dark', deepDarkShade);
  document.documentElement.style.setProperty('--primary-selection', selectionShade);
  document.documentElement.classList.add('has-file-tint');
}

export function handleWindowMessage(event: MessageEvent): void {
  const message = event.data;
  const textarea = getRawTextarea();
  switch (message?.type) {
    case 'init': {
      if (message.language) {
        setWebviewLanguage(message.language);
      }
      if (message.filename) {
        applyFilenameTint(message.filename);
      }
      setContentFormatted(message.text || '');
      if (state.isRawMode) {
        autoResizeRawTextarea();
        updateRawLineNumbers();
      }
      break;
    }
    case 'setLanguage': {
      if (message.language) {
        updateEditorLanguage(message.language);
      }
      break;
    }
    case 'update': {
      // Only update if not our own recent keystroke
      if (!state.isInternalChange && message.text !== state.currentMarkdown) {
        if (state.isRawMode && textarea) {
          textarea.value = message.text || '';
          state.currentMarkdown = message.text || '';
          autoResizeRawTextarea();
          updateRawLineNumbers();
        } else {
          setContentFormatted(message.text || '');
        }
      }
      break;
    }
    case 'focus': {
      if (state.isRawMode) {
        textarea?.focus({ preventScroll: true });
      } else {
        const canvas = getEditorCanvas();
        canvas?.focus({ preventScroll: true });
      }
      break;
    }
  }
}

export function initMarkdownEditor(): void {
  const canvas = getEditorCanvas();
  const textarea = getRawTextarea();
  const dismissBtn = getErrorBannerDismiss();

  if (!canvas || !textarea) {
    return;
  }

  dismissBtn?.addEventListener('click', () => {
    hideErrorBanner();
  });

  canvas.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLElement | null;
    const langInput = target?.closest<HTMLInputElement>('input.code-lang-input');
    if (langInput && canvas.contains(langInput)) {
      const val = langInput.value.trim();
      const wrapper = langInput.closest<HTMLElement>('.code-block-wrapper');
      if (wrapper) {
        wrapper.setAttribute('data-language', val);
      }
      const container = langInput.closest<HTMLElement>('.editor-block-container');
      if (container) {
        container.setAttribute('data-language', val);
      }
    }
    emitCanvasEdit();
  });

  // Immediately place caret at the end of the line on mousedown, preventing default start-of-line placement,
  // and handle drag-selection starting from empty space behind a line
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    handleLineClickOrDragOutsideText(e, canvas);
  });

  canvas.addEventListener('mouseup', (e: MouseEvent) => {
    handleLineClickOrDragOutsideText(e, canvas);
  });

  canvas.addEventListener('click', (e: MouseEvent) => {
    handleLineClickOrDragOutsideText(e, canvas);
    const cell = (e.target as HTMLElement).closest('.table-checkbox-cell') as HTMLElement | null;
    if (cell && canvas.contains(cell)) {
      e.preventDefault();
      const cb = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (cb) {
        cb.checked = !cb.checked;
        cell.setAttribute('data-checked', cb.checked ? 'true' : 'false');
        if (cb.checked) {
          cell.classList.add('is-checked');
        } else {
          cell.classList.remove('is-checked');
        }
        emitCanvasEdit();
      }
    }
  });

  canvas.addEventListener('paste', (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input')) {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) {
      return;
    }

    const success = document.execCommand('insertText', false, text);
    if (!success) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    emitCanvasEdit();
  });

  textarea.addEventListener('input', () => {
    autoResizeRawTextarea();
    updateRawLineNumbers();
    emitEdit(textarea.value);
  });

  textarea.addEventListener('keydown', handleRawKeyDown);
  canvas.addEventListener('keydown', handleCanvasKeyDown);

  // Resize raw textarea and line numbers when window width / wrapped lines change
  window.addEventListener('resize', () => {
    if (state.isRawMode) {
      autoResizeRawTextarea();
      updateRawLineNumbers();
    }
  });

  // Focus textarea when clicking in empty document viewport space in raw mode,
  // or handle line click / drag outside text in formatted mode
  const doc = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const viewport = (doc?.querySelector('.document-viewport') as HTMLElement | null) || null;
  const container = (doc?.querySelector('.document-container') as HTMLElement | null) || null;

  // Preserve scroll position during clicks when viewport is scrolled
  let lastScrollTop: number | null = null;
  const onViewportScrollGuard = (e: MouseEvent) => {
    if (!viewport) return;
    const vRect = viewport.getBoundingClientRect();
    if (e.clientX >= vRect.left + viewport.clientWidth) {
      return; // Scrollbar interaction
    }
    lastScrollTop = viewport.scrollTop;
  };

  const onViewportScrollRestore = (e: MouseEvent) => {
    if (!viewport || lastScrollTop === null) return;
    const vRect = viewport.getBoundingClientRect();
    if (e.clientX >= vRect.left + viewport.clientWidth) {
      return; // Scrollbar interaction
    }
    if (viewport.scrollTop !== lastScrollTop) {
      viewport.scrollTop = lastScrollTop;
    }
  };

  viewport?.addEventListener('mousedown', onViewportScrollGuard as EventListener, true);
  viewport?.addEventListener('mouseup', onViewportScrollRestore as EventListener, true);
  viewport?.addEventListener('click', onViewportScrollRestore as EventListener, true);

  const onViewportMouseDown = (e: Event) => {
    if (!state.isRawMode && (e.target === viewport || e.target === container)) {
      handleLineClickOrDragOutsideText(e as MouseEvent, canvas);
    }
  };
  viewport?.addEventListener('mousedown', onViewportMouseDown);
  container?.addEventListener('mousedown', onViewportMouseDown);

  const onViewportClick = (e: Event) => {
    if (e.target === viewport || e.target === container) {
      if (state.isRawMode) {
        textarea.focus({ preventScroll: true });
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      } else {
        // If selection is already placed inside canvas (e.g. by mousedown at start/end of line), do not reset to top
        const sel = (doc?.defaultView || window).getSelection();
        if (sel && sel.anchorNode && canvas.contains(sel.anchorNode)) {
          return;
        }
        const handled = handleLineClickOrDragOutsideText(e as MouseEvent, canvas);
        if (!handled) {
          canvas.focus({ preventScroll: true });
        }
      }
    }
  };
  viewport?.addEventListener('click', onViewportClick);
  container?.addEventListener('click', onViewportClick);

  // Initialize toolbar wiring
  wireToolbar({
    toggleRawMode,
    wireTaskCheckboxes,
  });

  // Initialize block focus and delete button handlers
  wireBlockFocus(canvas);
  wireBlockDelete(canvas, () => emitCanvasEdit());

  // Initialize selection Cowork floating button
  wireSelectionCowork();

  window.addEventListener('message', handleWindowMessage);
}

// Auto-run in browser environment when DOM is ready
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMarkdownEditor());
  } else {
    initMarkdownEditor();
  }
}
