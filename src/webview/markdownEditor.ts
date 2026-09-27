import { safeMarkdownToHtml } from '../markdown/parser';
import {
  processPastedContent,
  cleanHtmlToMarkdown,
  isCodeEditorHtml,
  getInlinePasteHtml,
} from '../markdown/pasteHandler';
import { findTopBlock, getActiveListItem, isBlockEmpty } from './toolbarOperations';
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
import { wireAllTaskListControls } from './taskListInteractions';
import { getWebviewLanguage, setWebviewLanguage, tWebview, WebviewLanguage } from './i18n';
import {
  wireSelectionCowork,
  hideSelectionCoworkButton,
  updateSelectionCoworkButtonLanguage,
} from './selectionCowork';
import {
  wireCodeBlockCopy,
  wireCodeBlockCopyButtons,
  initInlineCodeCopy,
  updateCodeCopyLanguage,
} from './codeCopy';
import {
  setAnnotations,
  renderAllAnnotations,
  updateCoworkButtonWithAnnotations,
  wireAnnotationGlobalEvents,
} from './annotations';
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
  persistWebviewState,
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
        // Re-wire task list controls to update delete/send-to-top button visibility
        if (canvas) wireAllTaskListControls(canvas, () => emitCanvasEdit(), wireTaskCheckboxes);
      }
    };
  });
  // Wire task list controls (drag handles, delete, send-to-top)
  if (canvas) wireAllTaskListControls(canvas, () => emitCanvasEdit(), wireTaskCheckboxes);
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
  state.isInitialized = true;
  persistWebviewState();
  if (canvas) {
    canvas.innerHTML = html;
    syncBlockLineAttributes(canvas, markdown);
  }
  if (textarea) textarea.value = markdown;
  wireTaskCheckboxes();
  if (canvas) wireTableInteractions(canvas, () => emitCanvasEdit());
  if (canvas) wireCodeBlockCopyButtons(canvas);
  renderAllAnnotations();
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

export interface VisualLine {
  top: number;
  bottom: number;
  left: number;
  right: number;
  rects: DOMRect[];
}

export function getVisualLinesForBlock(doc: Document, contentEl: HTMLElement): VisualLine[] {
  const childNodes = Array.from(contentEl.childNodes).filter(
    (n) => n.nodeName !== 'UL' && n.nodeName !== 'OL' && n.nodeName !== 'INPUT'
  );
  if (childNodes.length === 0) {
    const br = contentEl.getBoundingClientRect();
    return [{ top: br.top, bottom: br.bottom, left: br.left, right: br.right, rects: [br] }];
  }

  const firstNode = childNodes[0];
  const lastNode = childNodes[childNodes.length - 1];

  let validRects: DOMRect[] = [];
  try {
    const r = doc.createRange();
    r.setStartBefore(firstNode);
    r.setEndAfter(lastNode);
    validRects = Array.from(
      typeof r.getClientRects === 'function' ? r.getClientRects() : []
    ).filter((rect) => rect.width > 0 || rect.height > 0);
  } catch {
    // Ignore measurement error
  }

  if (validRects.length === 0) {
    const br = typeof contentEl.getBoundingClientRect === 'function' ? contentEl.getBoundingClientRect() : null;
    if (br && (br.width > 0 || br.height > 0)) {
      validRects.push(br);
    }
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
  return lines;
}

export function getCaretPositionForCoordinates(
  doc: Document,
  canvas: HTMLElement,
  clientX: number,
  clientY: number
): { node: Node; offset: number } | null {
  const canvasRect = canvas.getBoundingClientRect();
  const hasCanvasDimensions = canvasRect.width > 0 && canvasRect.height > 0;

  const blocks = Array.from(
    canvas.querySelectorAll<HTMLElement>(
      'li, p.editor-block, h1, h2, h3, h4, h5, h6, blockquote, .editor-code'
    )
  ).filter((b) => canvas.contains(b));

  if (blocks.length === 0) {
    return { node: canvas, offset: 0 };
  }

  // If clientY is above the canvas:
  if (hasCanvasDimensions && clientY < canvasRect.top) {
    const firstBlock = blocks[0];
    const isTask =
      firstBlock.classList.contains('task-item') ||
      firstBlock.querySelector(':scope > input[type="checkbox"]');
    const contentEl =
      ((isTask ? firstBlock.querySelector('.task-content') : firstBlock) as HTMLElement) ||
      firstBlock;
    return getFirstCaretPosition(contentEl);
  }

  // If clientY is below the canvas:
  if (hasCanvasDimensions && clientY > canvasRect.bottom) {
    const lastBlock = blocks[blocks.length - 1];
    return getLastCaretPosition(lastBlock);
  }

  // Find block at clientY:
  let targetBlock: HTMLElement | null = null;
  let minDistance = Infinity;

  for (const b of blocks) {
    const br = b.getBoundingClientRect();
    if (br.height > 0) {
      if (clientY >= br.top - 2 && clientY <= br.bottom + 2) {
        targetBlock = b;
        break;
      }
      const dist = Math.min(Math.abs(clientY - br.top), Math.abs(clientY - br.bottom));
      if (dist < minDistance) {
        minDistance = dist;
        targetBlock = b;
      }
    }
  }

  if (!targetBlock) {
    // If no block had height > 0 (e.g. headless tests without mocked element rects),
    // check if caretPositionFromPoint or caretRangeFromPoint can directly find the container:
    if (typeof (doc as any).caretPositionFromPoint === 'function') {
      const pos = (doc as any).caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode && canvas.contains(pos.offsetNode)) {
        return { node: pos.offsetNode, offset: pos.offset };
      }
    }
    if (typeof (doc as any).caretRangeFromPoint === 'function') {
      const range = (doc as any).caretRangeFromPoint(clientX, clientY);
      if (range && range.startContainer && canvas.contains(range.startContainer)) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }
    targetBlock = blocks[0];
  }

  const isTask =
    targetBlock.classList.contains('task-item') ||
    targetBlock.querySelector(':scope > input[type="checkbox"]');
  const contentEl =
    ((isTask ? targetBlock.querySelector('.task-content') : targetBlock) as HTMLElement) ||
    targetBlock;
  const lines = getVisualLinesForBlock(doc, contentEl);

  if (lines.length > 0) {
    let targetLine = lines[0];
    let targetLineIndex = 0;
    let bestLineDist = Infinity;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (clientY >= line.top - 2 && clientY <= line.bottom + 2) {
        targetLine = line;
        targetLineIndex = i;
        break;
      }
      const dist = Math.min(Math.abs(clientY - line.top), Math.abs(clientY - line.bottom));
      if (dist < bestLineDist) {
        bestLineDist = dist;
        targetLine = line;
        targetLineIndex = i;
      }
    }

    const isFirstLine = targetLineIndex === 0;
    const isLastLine = targetLineIndex === lines.length - 1;
    const hasMeasuredLine = targetLine.right > targetLine.left;

    if (hasMeasuredLine) {
      // Check if clientX is to the left of the line text
      if (clientX <= targetLine.left + 2 || (isFirstLine && clientY < targetLine.top - 2)) {
        if (isFirstLine) {
          return getFirstCaretPosition(contentEl);
        } else {
          const centerY = targetLine.top + (targetLine.bottom - targetLine.top) / 2;
          const pt = getCaretAtPoint(doc, targetLine.left + 1, centerY, contentEl);
          return pt || getFirstCaretPosition(contentEl);
        }
      }

      // Check if clientX is to the right of the line text
      if (clientX >= targetLine.right - 2 || (isLastLine && clientY > targetLine.bottom + 2)) {
        if (isLastLine) {
          return getLastCaretPosition(contentEl);
        } else {
          const centerY = targetLine.top + (targetLine.bottom - targetLine.top) / 2;
          const pt = getCaretAtPoint(doc, targetLine.right - 1, centerY, contentEl);
          return pt || getLastCaretPosition(contentEl);
        }
      }
    }
  }

  // Otherwise, coordinates are inside text area of canvas:
  // Fall back to native getCaretAtPoint
  const ptPos = getCaretAtPoint(doc, clientX, clientY, canvas);
  if (ptPos) {
    if (ptPos.offset === 1 && ptPos.node.nodeType === 3) {
      try {
        const r = doc.createRange();
        r.setStart(ptPos.node, 0);
        r.setEnd(ptPos.node, 1);
        const char0Rect = r.getBoundingClientRect();
        if (char0Rect.width > 0 && clientX <= char0Rect.left + char0Rect.width * 0.6) {
          ptPos.offset = 0;
        }
      } catch {
        // Ignore
      }
    }
    return ptPos;
  }

  // Fallback for test / headless environments when caretRangeFromPoint is not mocked
  if (typeof doc.elementFromPoint === 'function') {
    const el = doc.elementFromPoint(clientX, clientY);
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

  // Don't interfere if clicking interactive elements (checkbox, buttons, tables, code language input, delete buttons, task list controls)
  if (
    target.closest(
      'input, button, a, table, code, .widget-block:not([data-block-type="blockquote"]), .block-delete-btn, .table-controls, .task-list-controls, .task-item-drag-btn, .task-item-del-btn, .task-item-top-btn'
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
    const lines = getVisualLinesForBlock(doc, contentEl);

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
      const optH4 = selectHeading.querySelector('option[value="h4"]');
      if (optH4) optH4.textContent = tWebview('Überschrift 4 (Sehr klein)');
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
    updateCoworkButtonWithAnnotations();
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

    updateCodeCopyLanguage(document);

    // Show cowork tree button
    const btnShowCoworkTree = document.getElementById('btn-show-cowork-tree');
    if (btnShowCoworkTree) {
      btnShowCoworkTree.title = tWebview('Arbeitsordner anzeigen');
      btnShowCoworkTree.setAttribute('aria-label', tWebview('Arbeitsordner anzeigen'));
    }
  }
}

export function setCoworkTreeButtonVisible(visible: boolean): void {
  const btn = document.getElementById('btn-show-cowork-tree');
  if (btn) {
    btn.classList.toggle('is-visible', visible);
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
  state.activeFilename = filename;
  persistWebviewState();
  const hue = getFilenameHue(filename);
  const darkShade = getDarkShade(hue);

  let hoverL = 26;
  const hoverS = 75;
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
      if (typeof message.treeViewVisible === 'boolean') {
        setCoworkTreeButtonVisible(!message.treeViewVisible);
      }
      if (message.language) {
        state.activeLanguage = message.language;
        setWebviewLanguage(message.language);
      }
      if (message.filename) {
        applyFilenameTint(message.filename);
      }
      if (Array.isArray(message.annotations)) {
        setAnnotations(message.annotations);
      }
      setContentFormatted(message.text || '');
      state.isInitialized = true;
      persistWebviewState();
      if (state.isRawMode) {
        autoResizeRawTextarea();
        updateRawLineNumbers();
      }
      break;
    }
    case 'setAnnotations': {
      if (Array.isArray(message.annotations)) {
        setAnnotations(message.annotations);
      }
      break;
    }
    case 'treeViewVisibility': {
      if (typeof message.visible === 'boolean') {
        setCoworkTreeButtonVisible(!message.visible);
      }
      break;
    }
    case 'setLanguage': {
      if (message.language) {
        state.activeLanguage = message.language;
        persistWebviewState();
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
          state.isInitialized = true;
          persistWebviewState();
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

/**
 * Handles paste events on the contenteditable formatted canvas.
 * Preserves Markdown-compatible formatting (bold, italic, headings, lists, tables, etc.)
 * while completely stripping colors, fonts, and incompatible styles.
 */
export function handleCanvasPaste(e: ClipboardEvent, canvas: HTMLElement): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest('input')) {
    return;
  }
  e.preventDefault();

  const doc = canvas.ownerDocument;
  const sel = doc.defaultView ? doc.defaultView.getSelection() : window.getSelection();
  const anchor = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const anchorEl = (anchor?.nodeType === 1 ? anchor : anchor?.parentElement) as HTMLElement | null;

  const html = e.clipboardData?.getData('text/html');
  const plainText = e.clipboardData?.getData('text/plain') ?? '';

  if (!html && !plainText) {
    return;
  }

  // 1. Inside a code block: paste raw plain text only (no formatting/blocks)
  const codeBlock =
    anchorEl?.closest('code.editor-code, pre') || target?.closest('code.editor-code, pre');
  if (codeBlock) {
    const rawText = plainText || (html ? doc.createElement('div').textContent || '' : '');
    if (!rawText) return;
    const success = doc.execCommand?.('insertText', false, rawText);
    if (!success && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = doc.createTextNode(rawText);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    emitCanvasEdit();
    return;
  }

  // 2. Inside a table cell: keep content inline to avoid breaking the table structure
  const tableCell = anchorEl?.closest('td, th') || target?.closest('td, th');
  if (tableCell) {
    const processed = processPastedContent(html, plainText, doc);
    if (!processed.markdown) return;
    const flattenedMd = processed.markdown.replace(/\r?\n+/g, ' ').trim();
    const inlineHtml = getInlinePasteHtml(flattenedMd);
    const success = doc.execCommand?.('insertHTML', false, inlineHtml);
    if (!success && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const temp = doc.createElement('template');
      temp.innerHTML = inlineHtml;
      const frag = temp.content || temp;
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    emitCanvasEdit();
    return;
  }

  // 3. General canvas paste: process content
  const processed = processPastedContent(html, plainText, doc);
  if (!processed.markdown) {
    return;
  }

  if (processed.isInline) {
    // Single line / inline content: insert at cursor
    const inlineHtml = getInlinePasteHtml(processed.markdown);
    const success = doc.execCommand?.('insertHTML', false, inlineHtml);
    if (!success && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const temp = doc.createElement('template');
      temp.innerHTML = inlineHtml;
      const frag = temp.content || temp;
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    emitCanvasEdit();
    return;
  }

  // 4. Block-level content: parse to canvas DOM blocks
  const { html: blocksHtml, error } = safeMarkdownToHtml(processed.markdown);
  if (error || !blocksHtml) {
    const success = doc.execCommand?.('insertText', false, processed.markdown);
    if (!success && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = doc.createTextNode(processed.markdown);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    emitCanvasEdit();
    return;
  }

  const temp = doc.createElement('div');
  temp.innerHTML = blocksHtml.trim();
  const newBlocks = Array.from(temp.children) as HTMLElement[];
  if (newBlocks.length === 0) {
    return;
  }

  const activeLi = getActiveListItem(canvas, sel);
  if (
    activeLi &&
    newBlocks.length === 1 &&
    (newBlocks[0].tagName.toLowerCase() === 'ul' || newBlocks[0].tagName.toLowerCase() === 'ol')
  ) {
    // Pasting list items inside a list: insert items into the current list
    const items = Array.from(newBlocks[0].children);
    let lastLi: Node = activeLi;
    for (const li of items) {
      activeLi.parentNode?.insertBefore(li, lastLi.nextSibling);
      lastLi = li;
    }
    if (!activeLi.textContent?.trim()) {
      activeLi.remove();
    }
  } else {
    const topBlock = findTopBlock(anchor, canvas);
    if (topBlock && canvas.contains(topBlock)) {
      const isEmpty = isBlockEmpty(topBlock) && !topBlock.classList.contains('widget-block');
      if (isEmpty) {
        let last: Node = topBlock;
        for (const block of newBlocks) {
          topBlock.parentNode?.insertBefore(block, last.nextSibling);
          last = block;
        }
        topBlock.remove();
      } else {
        let last: Node = topBlock;
        for (const block of newBlocks) {
          topBlock.parentNode?.insertBefore(block, last.nextSibling);
          last = block;
        }
      }
    } else {
      for (const block of newBlocks) {
        canvas.appendChild(block);
      }
    }
  }

  // Restore cursor at the end of the newly inserted content
  if (sel && newBlocks.length > 0) {
    const lastBlock = newBlocks[newBlocks.length - 1];
    const targetFocus = lastBlock.querySelector<HTMLElement>('.editor-code, p, li') || lastBlock;
    const range = doc.createRange();
    range.selectNodeContents(targetFocus);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  wireTaskCheckboxes();
  wireTableInteractions(canvas, () => emitCanvasEdit());
  emitCanvasEdit();
}

export function wireDragSelection(
  doc: Document,
  canvas: HTMLElement,
  viewport?: HTMLElement | null,
  container?: HTMLElement | null
): () => void {
  let isEditorMouseDown = false;

  const onDocMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (state.isRawMode) return;
    const targetNode = e.target as Node | null;
    const target = targetNode?.nodeType === 1 ? (targetNode as HTMLElement) : targetNode?.parentElement;
    if (!target) return;
    if (
      target.closest(
        'input, button, a, table, code, .widget-block:not([data-block-type="blockquote"]), .block-delete-btn, .table-controls, .task-list-controls, .task-item-drag-btn, .task-item-del-btn, .task-item-top-btn'
      )
    ) {
      return;
    }
    if (canvas.contains(target) || viewport?.contains(target) || container?.contains(target)) {
      isEditorMouseDown = true;
    }
  };

  const adjustBackwardSelectionIfAtLineStart = (
    sel: Selection,
    clientX: number,
    clientY: number
  ) => {
    if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return;
    if (!canvas.contains(sel.anchorNode)) return;

    const comp = sel.anchorNode.compareDocumentPosition(sel.focusNode);
    const isBackward =
      (comp & Node.DOCUMENT_POSITION_PRECEDING) !== 0 ||
      (sel.anchorNode === sel.focusNode && sel.anchorOffset > sel.focusOffset);

    if (!isBackward) return;

    const canvasRect = canvas.getBoundingClientRect();
    const hasCanvasDimensions = canvasRect.width > 0 && canvasRect.height > 0;
    const isLeftOfCanvas = hasCanvasDimensions && clientX <= canvasRect.left + 2;
    const isAboveCanvas = hasCanvasDimensions && clientY < canvasRect.top;

    const focusEl =
      sel.focusNode.nodeType === 1
        ? (sel.focusNode as HTMLElement)
        : sel.focusNode.parentElement;
    const blockEl = focusEl
      ? focusEl.closest<HTMLElement>(
          'li, p, h1, h2, h3, h4, h5, h6, blockquote, .editor-code'
        )
      : null;

    if (blockEl && canvas.contains(blockEl)) {
      const isTask =
        blockEl.classList.contains('task-item') ||
        blockEl.querySelector(':scope > input[type="checkbox"]');
      const contentEl =
        ((isTask ? blockEl.querySelector('.task-content') : blockEl) as HTMLElement) ||
        blockEl;
      const targetFirstPos = getFirstCaretPosition(contentEl);
      const bRect = contentEl.getBoundingClientRect();
      const lines = getVisualLinesForBlock(doc, contentEl);

      let isTopVisualLine = true;
      if (lines.length > 1) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (clientY >= line.top - 2 && clientY <= line.bottom + 2) {
            isTopVisualLine = i === 0;
            break;
          }
        }
      }

      if (isTopVisualLine) {
        let shouldSnap =
          (bRect.width > 0 && clientX <= bRect.left + 2) ||
          (bRect.height > 0 && clientY < bRect.top - 2) ||
          isLeftOfCanvas ||
          isAboveCanvas;

        if (!shouldSnap && targetFirstPos.node.nodeType === 3) {
          try {
            const r = doc.createRange();
            r.setStart(targetFirstPos.node, 0);
            r.setEnd(
              targetFirstPos.node,
              Math.min(1, (targetFirstPos.node.textContent || '').length)
            );
            const char0Rect = r.getBoundingClientRect();
            if (char0Rect.width > 0 && clientX <= char0Rect.left + char0Rect.width * 0.6) {
              shouldSnap = true;
            }
          } catch {
            // Ignore
          }
        }

        if (shouldSnap && (sel.focusNode !== targetFirstPos.node || sel.focusOffset !== 0)) {
          if (typeof sel.setBaseAndExtent === 'function') {
            try {
              sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, targetFirstPos.node, 0);
            } catch {
              // Ignore
            }
          }
        }
      }
    } else if (isLeftOfCanvas || isAboveCanvas) {
      const focusPos = getCaretPositionForCoordinates(doc, canvas, clientX, clientY);
      if (focusPos && (sel.focusNode !== focusPos.node || sel.focusOffset !== focusPos.offset)) {
        if (typeof sel.setBaseAndExtent === 'function') {
          try {
            sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, focusPos.node, focusPos.offset);
          } catch {
            // Ignore
          }
        }
      }
    }
  };

  const onDocMouseMove = (e: MouseEvent) => {
    if (!isEditorMouseDown || e.buttons !== 1) {
      if (e.buttons !== 1) {
        isEditorMouseDown = false;
      }
      return;
    }
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    const sel = win ? win.getSelection() : null;
    if (sel) {
      adjustBackwardSelectionIfAtLineStart(sel, e.clientX, e.clientY);
    }
  };

  const onDocMouseUp = (e: MouseEvent) => {
    if (isEditorMouseDown) {
      isEditorMouseDown = false;
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const sel = win ? win.getSelection() : null;
      if (sel) {
        adjustBackwardSelectionIfAtLineStart(sel, e.clientX, e.clientY);
      }
    }
  };

  doc.addEventListener('mousedown', onDocMouseDown, true);
  doc.addEventListener('mousemove', onDocMouseMove, true);
  doc.addEventListener('mouseup', onDocMouseUp, true);

  return () => {
    doc.removeEventListener('mousedown', onDocMouseDown, true);
    doc.removeEventListener('mousemove', onDocMouseMove, true);
    doc.removeEventListener('mouseup', onDocMouseUp, true);
  };
}

export function initMarkdownEditor(): void {
  // Always register window message listener immediately so incoming messages are never lost
  window.addEventListener('message', handleWindowMessage);

  const canvas = getEditorCanvas();
  const textarea = getRawTextarea();
  const dismissBtn = getErrorBannerDismiss();

  if (!canvas || !textarea) {
    return;
  }

  // Restore state: 1. From vscode.getState() (for auxiliary windows, tab moves, reloads)
  let restored = false;
  try {
    const saved = vscode.getState() as Record<string, unknown> | undefined;
    if (saved && typeof saved.markdown === 'string') {
      if (typeof saved.activeFilename === 'string') {
        state.activeFilename = saved.activeFilename;
        applyFilenameTint(saved.activeFilename);
      }
      if (saved.activeLanguage === 'en' || saved.activeLanguage === 'de') {
        state.activeLanguage = saved.activeLanguage;
        setWebviewLanguage(saved.activeLanguage);
      }
      if (saved.isRawMode === true && !state.isRawMode) {
        state.isRawMode = true;
        if (canvas) canvas.style.display = 'none';
        const wrapper = getRawWrapper();
        if (wrapper) wrapper.style.display = 'flex';
        const gutter = getRawGutter();
        if (gutter) gutter.style.display = 'block';
        if (textarea) textarea.style.display = 'block';
        const toggleBtn = getRawToggleBtn();
        if (toggleBtn) {
          toggleBtn.classList.add('is-active');
          toggleBtn.textContent = getWebviewLanguage() === 'en' ? '📄 Formatted' : '📄 Formatiert';
        }
      }
      if (Array.isArray(saved.annotations)) {
        setAnnotations(saved.annotations);
      }
      setContentFormatted(saved.markdown);
      state.isInitialized = true;
      restored = true;
    }
  } catch (err) {
    console.warn('Agent Cowork: Failed to restore state from vscode.getState():', err);
  }

  // 2. If not restored from state, load from embedded JSON script tag
  if (!restored) {
    try {
      const dataEl = document.getElementById('agent-cowork-init-data');
      if (dataEl && dataEl.textContent) {
        const initData = JSON.parse(dataEl.textContent);
        if (typeof initData.treeViewVisible === 'boolean') {
          setCoworkTreeButtonVisible(!initData.treeViewVisible);
        }
        if (initData.language === 'en' || initData.language === 'de') {
          state.activeLanguage = initData.language;
          setWebviewLanguage(initData.language);
        }
        if (initData.filename) {
          state.activeFilename = initData.filename;
          applyFilenameTint(initData.filename);
        }
        if (Array.isArray(initData.annotations)) {
          setAnnotations(initData.annotations);
        }
        if (typeof initData.text === 'string') {
          setContentFormatted(initData.text);
          state.isInitialized = true;
          restored = true;
          persistWebviewState();
        }
      }
    } catch (err) {
      console.warn('Agent Cowork: Failed to load embedded initial data:', err);
    }
  }

  // Signal ready to extension host
  vscode.postMessage({ type: 'ready' });

  // Wire document-wide annotation popover dismissal
  wireAnnotationGlobalEvents();

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
    handleCanvasPaste(e, canvas);
  });

  textarea.addEventListener('paste', (e: ClipboardEvent) => {
    const html = e.clipboardData?.getData('text/html');
    if (html && !isCodeEditorHtml(html)) {
      const md = cleanHtmlToMarkdown(html, textarea.ownerDocument);
      if (md) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + md + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + md.length;
        autoResizeRawTextarea();
        updateRawLineNumbers();
        emitEdit(textarea.value);
      }
    }
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

  // Wire global drag selection listener to ensure backward selections include the first character
  // when dragging from bottom to top across lines or into margins
  if (doc) {
    wireDragSelection(doc, canvas, viewport, container);
  }

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

  // Initialize code copying for code blocks and inline code
  wireCodeBlockCopy(canvas);
  initInlineCodeCopy(canvas, (viewport || container) as HTMLElement);

  // Wire floating button to reopen closed Cowork tree view
  const btnShowCoworkTree = document.getElementById('btn-show-cowork-tree');
  if (btnShowCoworkTree) {
    btnShowCoworkTree.addEventListener('click', () => {
      vscode.postMessage({ type: 'openCoworkView' });
    });
  }
}

// Auto-run in browser environment when DOM is ready
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMarkdownEditor());
  } else {
    initMarkdownEditor();
  }
}
