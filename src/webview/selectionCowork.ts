import { serializeBlockElement } from '../markdown/serializer';
import { state, vscode, getEditorCanvas, getRawTextarea } from './editorState';
import { tWebview } from './i18n';

export interface SelectionLineRange {
  startLine: number;
  endLine: number;
}

let isMouseDown = false;
let lastMouseUpCoords: { x: number; y: number } | null = null;

/**
 * Returns character offset of a (targetNode, targetOffset) point within root node.
 */
function getNodeTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let length = 0;
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    return 0;
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === targetNode) {
      return length + targetOffset;
    }
    length += current.nodeValue ? current.nodeValue.length : 0;
    current = walker.nextNode();
  }
  return length;
}

/**
 * Finds the direct top-level child element of canvas that contains target node.
 */
function findTopLevelBlock(node: Node, canvas: HTMLElement): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr.parentElement !== canvas) {
    curr = curr.parentElement;
  }
  return curr && curr.nodeType === 1 ? (curr as HTMLElement) : null;
}

/**
 * Calculates 1-based start and end lines of a selection within a single block or across blocks.
 */
export function getSelectionLineRange(
  canvas: HTMLElement | null,
  selection: Selection | null
): SelectionLineRange | null {
  if (!canvas || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!canvas.contains(range.startContainer) || !canvas.contains(range.endContainer)) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) {
    return null;
  }

  const topBlocks = Array.from(canvas.childNodes).filter(
    (n) => n.nodeType === 1
  ) as HTMLElement[];
  if (topBlocks.length === 0) {
    return null;
  }

  const startTopBlock = findTopLevelBlock(range.startContainer, canvas);
  const endTopBlock = findTopLevelBlock(range.endContainer, canvas);

  let currentLine = 1;
  let resolvedStartLine: number | null = null;
  let resolvedEndLine: number | null = null;

  for (let bIdx = 0; bIdx < topBlocks.length; bIdx++) {
    const blockEl = topBlocks[bIdx];
    const serializedLines = serializeBlockElement(blockEl);
    if (serializedLines.length === 0) {
      continue;
    }

    const blockTotalLines = serializedLines.reduce(
      (sum, str) => sum + str.split('\n').length,
      0
    );
    const blockStartLine = currentLine;
    const blockEndLine = currentLine + blockTotalLines - 1;

    // Check if start container is inside this block
    if (blockEl === startTopBlock && resolvedStartLine === null) {
      resolvedStartLine = calculateLineInsideBlock(
        blockEl,
        range.startContainer,
        range.startOffset,
        blockStartLine,
        blockEndLine,
        true
      );
    }

    // Check if end container is inside this block
    if (blockEl === endTopBlock) {
      resolvedEndLine = calculateLineInsideBlock(
        blockEl,
        range.endContainer,
        range.endOffset,
        blockStartLine,
        blockEndLine,
        false
      );
    }

    // Advance line cursor: blocks are separated by empty line (\n\n)
    currentLine = blockEndLine + 2;
  }

  if (resolvedStartLine === null && startTopBlock) {
    resolvedStartLine = 1;
  }
  if (resolvedEndLine === null && endTopBlock) {
    resolvedEndLine = resolvedStartLine ?? 1;
  }

  if (resolvedStartLine === null || resolvedEndLine === null) {
    return null;
  }

  const startLine = Math.min(resolvedStartLine, resolvedEndLine);
  const endLine = Math.max(resolvedStartLine, resolvedEndLine);

  return {
    startLine: Math.max(1, startLine),
    endLine: Math.max(1, endLine),
  };
}

/**
 * Pinpoints line inside a block (table, code block, quote, list, paragraph, heading).
 */
function calculateLineInsideBlock(
  blockEl: HTMLElement,
  containerNode: Node,
  offset: number,
  blockStartLine: number,
  blockEndLine: number,
  isStart: boolean
): number {
  // 1. Table
  const table =
    blockEl.tagName.toLowerCase() === 'table'
      ? blockEl
      : blockEl.querySelector('table');
  if (table && table.contains(containerNode)) {
    const thead = table.querySelector('thead');
    if (thead && thead.contains(containerNode)) {
      return blockStartLine; // Table header line
    }
    const tbody = table.querySelector('tbody');
    if (tbody && tbody.contains(containerNode)) {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].contains(containerNode)) {
          // Line 1: Header, Line 2: Separator (|---|), Line 3+: Data rows
          return blockStartLine + 2 + r;
        }
      }
    }
    return blockStartLine;
  }

  // 2. Code Block
  const codeWrapper = blockEl.classList.contains('code-block-wrapper')
    ? blockEl
    : blockEl.querySelector('.code-block-wrapper');
  if (codeWrapper && codeWrapper.contains(containerNode)) {
    const codeEl = codeWrapper.querySelector('code');
    if (codeEl && codeEl.contains(containerNode)) {
      const textOffset = getNodeTextOffset(codeEl, containerNode, offset);
      const textBefore = (codeEl.textContent || '').slice(0, textOffset);
      const lineInCode = textBefore.split('\n').length - 1;
      // Opening ```lang is blockStartLine, code content starts at blockStartLine + 1
      return Math.min(blockStartLine + 1 + lineInCode, blockEndLine - 1);
    }
    return isStart ? blockStartLine : blockEndLine;
  }

  // 3. Blockquote
  const blockquote =
    blockEl.tagName.toLowerCase() === 'blockquote'
      ? blockEl
      : blockEl.querySelector('blockquote');
  if (blockquote && blockquote.contains(containerNode)) {
    const paragraphs = Array.from(blockquote.querySelectorAll('p'));
    if (paragraphs.length > 0) {
      let lineAcc = 0;
      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const p = paragraphs[pIdx];
        if (p.contains(containerNode)) {
          // Count <br> inside this p before containerNode
          const brCount = countBrsBefore(p, containerNode);
          return blockStartLine + lineAcc + brCount;
        }
        const pBrs = p.querySelectorAll('br').length;
        lineAcc += Math.max(1, pBrs + 1);
      }
    }
    return blockStartLine;
  }

  // 4. Lists (Task lists, Bullet lists, Ordered lists)
  const isList =
    blockEl.tagName.toLowerCase() === 'ul' ||
    blockEl.tagName.toLowerCase() === 'ol' ||
    blockEl.classList.contains('task-list') ||
    blockEl.classList.contains('bullet-list') ||
    blockEl.classList.contains('ordered-list');
  if (isList) {
    const allLis = Array.from(blockEl.querySelectorAll('li'));
    for (let i = 0; i < allLis.length; i++) {
      const li = allLis[i];
      if (li.contains(containerNode)) {
        // Find line by counting lines in preceding top-level items
        return blockStartLine + i;
      }
    }
    return blockStartLine;
  }

  // 5. Paragraph with potential <br> tags
  if (blockEl.tagName.toLowerCase() === 'p' || blockEl.getAttribute('data-block-type') === 'paragraph') {
    const brCount = countBrsBefore(blockEl, containerNode);
    return blockStartLine + brCount;
  }

  // 6. Heading or other block
  return isStart ? blockStartLine : blockEndLine;
}

/**
 * Counts <br> elements occurring before containerNode in root element.
 */
function countBrsBefore(root: HTMLElement, containerNode: Node): number {
  let count = 0;
  const walker = (root.ownerDocument || document).createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  let el: Node | null = walker.nextNode();
  while (el) {
    if (el === containerNode || el.contains(containerNode)) {
      break;
    }
    if ((el as HTMLElement).tagName?.toLowerCase() === 'br') {
      count++;
    }
    el = walker.nextNode();
  }
  return count;
}

/**
 * Calculates 1-based start and end lines of a selection in the raw markdown textarea.
 */
export function getRawSelectionLineRange(
  textarea: HTMLTextAreaElement | null
): SelectionLineRange | null {
  if (!textarea) {
    return null;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end || typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  const text = textarea.value;
  const startLine = text.slice(0, start).split('\n').length;
  let endLine = text.slice(0, end).split('\n').length;
  if (end > start && text[end - 1] === '\n') {
    endLine = Math.max(startLine, endLine - 1);
  }

  return {
    startLine: Math.max(1, startLine),
    endLine: Math.max(1, endLine),
  };
}

/**
 * Gets active selection line range based on whether editor is in raw mode or formatted mode.
 */
export function getActiveSelectionLineRange(): SelectionLineRange | null {
  if (state.isRawMode) {
    return getRawSelectionLineRange(getRawTextarea());
  }
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  return getSelectionLineRange(getEditorCanvas(), sel);
}

let cachedSelectionRange: SelectionLineRange | null = null;

/**
 * Returns or dynamically creates the floating selection Cowork button element.
 */
export function getSelectionCoworkButton(): HTMLButtonElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  let btn = document.getElementById('btn-selection-cowork') as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-selection-cowork';
    btn.className = 'selection-cowork-btn';
    btn.tabIndex = -1;
    btn.title = tWebview('Mit KI-Agent an den ausgewählten Zeilen zusammenarbeiten');
    btn.setAttribute('aria-label', 'Cowork');
    btn.innerHTML = `
      <span>Cowork</span>
      <svg class="cowork-arrow-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path fill-rule="evenodd" d="M1 8a.75.75 0 0 1 .75-.75h10.19L8.22 3.53a.75.75 0 0 1 1.06-1.06l5 5a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06-1.06l3.72-3.72H1.75A.75.75 0 0 1 1 8z"/>
      </svg>
    `;
    document.body.appendChild(btn);
  }

  // Ensure listeners are always attached (even if button already existed in static HTML)
  if (!btn.dataset.wired) {
    btn.dataset.wired = 'true';

    const preventDef = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    btn.addEventListener('mousedown', preventDef);
    btn.addEventListener('pointerdown', preventDef);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCoworkSelectionClick();
    });
  }

  return btn;
}

/**
 * Hides the floating selection Cowork button.
 */
export function hideSelectionCoworkButton(): void {
  const btn = document.getElementById('btn-selection-cowork');
  if (btn) {
    btn.classList.remove('is-visible');
    btn.style.display = 'none';
  }
}

/**
 * Positions the floating Cowork button at the bottom right of the selection.
 */
export function positionSelectionButton(
  btn: HTMLButtonElement,
  rect: { top: number; bottom: number; left: number; right: number }
): void {
  if (
    !rect ||
    (rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0)
  ) {
    hideSelectionCoworkButton();
    return;
  }

  btn.style.display = 'inline-flex';
  btn.style.visibility = 'hidden';

  const btnWidth = btn.offsetWidth || 84;
  const btnHeight = btn.offsetHeight || 26;
  btn.style.visibility = 'visible';

  const margin = 8;
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 600;

  // Align with bottom-right corner of selection
  let left = rect.right + 4;
  if (left + btnWidth > windowWidth - margin) {
    left = Math.max(margin, windowWidth - btnWidth - margin);
  }
  if (left < margin) {
    left = margin;
  }

  let top = rect.bottom + 6;
  if (top + btnHeight > windowHeight - margin) {
    top = Math.max(margin, rect.top - btnHeight - 6);
  }

  btn.style.left = `${Math.round(left)}px`;
  btn.style.top = `${Math.round(top)}px`;
  btn.classList.add('is-visible');
}

/**
 * Dispatches a message to VS Code with current selection lines and hides button.
 */
export function handleCoworkSelectionClick(): void {
  // Flush any pending debounced edits to ensure document state is synced
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
    if (!state.hasParseError || state.isRawMode) {
      state.isInternalChange = true;
      vscode.postMessage({
        type: 'edit',
        text: state.currentMarkdown,
      });
      setTimeout(() => {
        state.isInternalChange = false;
      }, 150);
    }
  }

  const lineRange = cachedSelectionRange || getActiveSelectionLineRange();
  const startLine = lineRange?.startLine;
  const endLine = lineRange?.endLine;

  vscode.postMessage({
    type: 'cowork',
    startLine,
    endLine,
  });

  hideSelectionCoworkButton();
  cachedSelectionRange = null;
}

/**
 * Updates tooltip of selection cowork button when language changes.
 */
export function updateSelectionCoworkButtonLanguage(): void {
  const btn = document.getElementById('btn-selection-cowork');
  if (btn) {
    btn.title = tWebview('Mit KI-Agent an den ausgewählten Zeilen zusammenarbeiten');
  }
}

/**
 * Checks current selection and displays or hides the button accordingly.
 */
export function checkAndDisplaySelectionButton(): void {
  if (isMouseDown) {
    return;
  }

  const btn = getSelectionCoworkButton();
  if (!btn) {
    return;
  }

  if (state.isRawMode) {
    const textarea = getRawTextarea();
    const range = getRawSelectionLineRange(textarea);
    if (!range || !textarea) {
      cachedSelectionRange = null;
      hideSelectionCoworkButton();
      return;
    }
    cachedSelectionRange = range;
    // Position near mouseup coordinate if available or visible textarea edge
    const rect = typeof textarea.getBoundingClientRect === 'function' ? textarea.getBoundingClientRect() : null;
    const coords = lastMouseUpCoords || {
      x: rect
        ? Math.min((typeof window !== 'undefined' ? window.innerWidth : 800) - 100, rect.left + rect.width - 20)
        : textarea.offsetLeft + textarea.offsetWidth - 100,
      y: rect ? Math.max(60, rect.top + 40) : textarea.offsetTop + 40,
    };
    positionSelectionButton(btn, {
      top: coords.y,
      bottom: coords.y,
      left: coords.x,
      right: coords.x,
    });
    return;
  }

  // Formatted Mode
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  const canvas = getEditorCanvas();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !canvas) {
    cachedSelectionRange = null;
    hideSelectionCoworkButton();
    return;
  }

  const lineRange = getSelectionLineRange(canvas, sel);
  if (!lineRange) {
    cachedSelectionRange = null;
    hideSelectionCoworkButton();
    return;
  }

  cachedSelectionRange = lineRange;
  const domRange = sel.getRangeAt(0);
  const clientRects = domRange.getClientRects();
  const rect =
    clientRects.length > 0
      ? clientRects[clientRects.length - 1]
      : domRange.getBoundingClientRect();

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    cachedSelectionRange = null;
    hideSelectionCoworkButton();
    return;
  }

  positionSelectionButton(btn, rect);
}

/**
 * Attaches selection listener events to canvas, textarea, and document.
 */
export function wireSelectionCowork(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  // Ensure button exists and is wired
  getSelectionCoworkButton();

  const handleMouseDown = (e: MouseEvent) => {
    const btn = document.getElementById('btn-selection-cowork');
    if (btn && (btn === e.target || btn.contains(e.target as Node))) {
      return;
    }
    isMouseDown = true;
    hideSelectionCoworkButton();
  };

  const handleMouseUp = (e: MouseEvent) => {
    isMouseDown = false;
    lastMouseUpCoords = { x: e.clientX, y: e.clientY };
    setTimeout(() => {
      checkAndDisplaySelectionButton();
    }, 10);
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideSelectionCoworkButton();
      return;
    }
    setTimeout(() => {
      checkAndDisplaySelectionButton();
    }, 10);
  };

  const handleSelectionChange = () => {
    if (isMouseDown) {
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideSelectionCoworkButton();
    }
  };

  const handleScroll = () => {
    hideSelectionCoworkButton();
  };

  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keyup', handleKeyUp);
  document.addEventListener('selectionchange', handleSelectionChange);
  window.addEventListener('scroll', handleScroll, true);

  return () => {
    document.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('keyup', handleKeyUp);
    document.removeEventListener('selectionchange', handleSelectionChange);
    window.removeEventListener('scroll', handleScroll, true);
  };
}
