/**
 * Caret handling at the edges of inline code snippets.
 *
 * Browsers collapse the two caret positions at each edge of an inline `<code>`
 * (inside vs. outside the box) into one. This module tracks which of the four
 * edge positions the caret logically sits in, draws a matching caret via CSS
 * (the native caret is hidden while at an edge), and routes typing, arrow keys
 * and clicks so the chosen side is respected:
 *
 *   outside-start | inside-start  code text  inside-end | outside-end
 */

export type InlineCodeEdgeSide = 'outside-start' | 'inside-start' | 'inside-end' | 'outside-end';

export interface InlineCodeEdge {
  code: HTMLElement;
  side: InlineCodeEdgeSide;
}

type Boundary = 'start' | 'end';

const ACTIVE_CANVAS_CLASS = 'inline-code-caret-active';
const EDGE_ATTR = 'data-caret-edge';
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th';

let currentEdge: InlineCodeEdge | null = null;

function boundaryOf(side: InlineCodeEdgeSide): Boundary {
  return side === 'outside-start' || side === 'inside-start' ? 'start' : 'end';
}

function isInlineCode(node: Node | null, canvas: HTMLElement): node is HTMLElement {
  if (!node || node.nodeType !== 1) return false;
  const el = node as HTMLElement;
  return (
    el.tagName.toLowerCase() === 'code' &&
    canvas.contains(el) &&
    !el.closest('.code-block-wrapper') &&
    (el.textContent || '').length > 0
  );
}

function firstTextNode(el: HTMLElement): Text | null {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  return walker.nextNode() as Text | null;
}

function lastTextNode(el: HTMLElement): Text | null {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let last: Text | null = null;
  let n: Node | null;
  while ((n = walker.nextNode())) last = n as Text;
  return last;
}

function textBetween(doc: Document, startNode: Node, startOffset: number, endNode: Node, endOffset: number): string {
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range.toString();
}

/**
 * Maps a DOM caret position to the inline code edge it sits on, using the literal
 * DOM position to pick the side. Returns null when the position is not at an edge.
 */
export function findInlineCodeEdgeAt(node: Node, offset: number, canvas: HTMLElement): InlineCodeEdge | null {
  const doc = canvas.ownerDocument;
  const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  const code = el?.closest('code') as HTMLElement | null;

  // Inside the snippet: start or end of its text
  if (code && isInlineCode(code, canvas)) {
    const before = textBetween(doc, code, 0, node, offset);
    if (before === '') return { code, side: 'inside-start' };
    const after = textBetween(doc, node, offset, code, code.childNodes.length);
    if (after === '') return { code, side: 'inside-end' };
    return null;
  }

  if (node.nodeType === 3) {
    const len = (node.nodeValue || '').length;
    if (offset === 0 && isInlineCode(node.previousSibling, canvas)) {
      return { code: node.previousSibling, side: 'outside-end' };
    }
    if (offset === len && isInlineCode(node.nextSibling, canvas)) {
      return { code: node.nextSibling, side: 'outside-start' };
    }
    return null;
  }

  if (node.nodeType === 1) {
    const prev = offset > 0 ? node.childNodes[offset - 1] : null;
    if (isInlineCode(prev, canvas)) return { code: prev, side: 'outside-end' };
    const next = node.childNodes[offset] || null;
    if (isInlineCode(next, canvas)) return { code: next, side: 'outside-start' };
  }

  return null;
}

/** The DOM position that represents an edge side. */
function domPositionFor(edge: InlineCodeEdge): { node: Node; offset: number } {
  const { code, side } = edge;
  const parent = code.parentNode as Node;
  const index = Array.prototype.indexOf.call(parent.childNodes, code) as number;
  switch (side) {
    case 'inside-start': {
      const t = firstTextNode(code);
      return t ? { node: t, offset: 0 } : { node: code, offset: 0 };
    }
    case 'inside-end': {
      const t = lastTextNode(code);
      return t ? { node: t, offset: (t.nodeValue || '').length } : { node: code, offset: code.childNodes.length };
    }
    case 'outside-start': {
      const prev = code.previousSibling;
      if (prev && prev.nodeType === 3) return { node: prev, offset: (prev.nodeValue || '').length };
      return { node: parent, offset: index };
    }
    case 'outside-end': {
      const next = code.nextSibling;
      if (next && next.nodeType === 3) return { node: next, offset: 0 };
      return { node: parent, offset: index + 1 };
    }
  }
}

function getSelection(canvas: HTMLElement): Selection | null {
  const win = canvas.ownerDocument.defaultView;
  return win ? win.getSelection() : null;
}

function clearVisual(canvas: HTMLElement): void {
  canvas.classList.remove(ACTIVE_CANVAS_CLASS);
  canvas.querySelectorAll(`code[${EDGE_ATTR}]`).forEach((el) => el.removeAttribute(EDGE_ATTR));
}

function applyVisual(canvas: HTMLElement, edge: InlineCodeEdge | null): void {
  const prevSide = edge ? edge.code.getAttribute(EDGE_ATTR) : null;
  clearVisual(canvas);
  if (!edge) return;
  canvas.classList.add(ACTIVE_CANVAS_CLASS);
  if (prevSide === edge.side) {
    edge.code.setAttribute(EDGE_ATTR, edge.side);
    return;
  }
  // Force a reflow so the blink animation restarts at full opacity after each move
  void edge.code.offsetWidth;
  edge.code.setAttribute(EDGE_ATTR, edge.side);
}

/** The edge the caret currently sits on, if any. */
export function getInlineCodeEdge(): InlineCodeEdge | null {
  return currentEdge;
}

/** Places the caret at an edge side and shows it. */
export function setInlineCodeEdge(canvas: HTMLElement, edge: InlineCodeEdge): void {
  const sel = getSelection(canvas);
  currentEdge = edge;
  if (sel) {
    const pos = domPositionFor(edge);
    sel.collapse(pos.node, pos.offset);
  }
  applyVisual(canvas, edge);
}

/** Clears any tracked edge and the custom caret. */
export function clearInlineCodeEdge(canvas: HTMLElement): void {
  currentEdge = null;
  clearVisual(canvas);
}

/**
 * Re-derives the edge from the current selection. A tracked side is kept as long as
 * the caret stays on the same boundary of the same snippet (browsers report either
 * DOM position for it); otherwise the literal DOM position decides.
 */
export function syncInlineCodeEdgeFromSelection(canvas: HTMLElement): void {
  const sel = getSelection(canvas);
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !sel.focusNode || !canvas.contains(sel.focusNode)) {
    clearInlineCodeEdge(canvas);
    return;
  }
  const found = findInlineCodeEdgeAt(sel.focusNode, sel.focusOffset, canvas);
  if (!found) {
    clearInlineCodeEdge(canvas);
    return;
  }
  if (
    currentEdge &&
    currentEdge.code === found.code &&
    currentEdge.code.isConnected &&
    boundaryOf(currentEdge.side) === boundaryOf(found.side)
  ) {
    applyVisual(canvas, currentEdge);
    return;
  }
  currentEdge = found;
  applyVisual(canvas, found);
}

/** Resolves the edge from the live selection, keeping a tracked side when it still applies. */
function resolveEdge(canvas: HTMLElement): InlineCodeEdge | null {
  syncInlineCodeEdgeFromSelection(canvas);
  return currentEdge;
}

/**
 * Handles ← / → at an inline code edge. Returns true when the key was consumed.
 */
export function handleInlineCodeArrowKey(e: KeyboardEvent, canvas: HTMLElement): boolean {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;

  const edge = resolveEdge(canvas);
  if (!edge) return false;

  const transitions: Record<string, InlineCodeEdgeSide> = {
    'ArrowRight:inside-end': 'outside-end',
    'ArrowLeft:outside-end': 'inside-end',
    'ArrowRight:outside-start': 'inside-start',
    'ArrowLeft:inside-start': 'outside-start',
  };
  const nextSide = transitions[`${e.key}:${edge.side}`];
  if (!nextSide) return false;

  e.preventDefault();
  setInlineCodeEdge(canvas, { code: edge.code, side: nextSide });
  return true;
}

function closestBlock(code: HTMLElement, canvas: HTMLElement): Node {
  const block = code.parentElement?.closest(BLOCK_SELECTOR);
  return block && canvas.contains(block) ? block : canvas;
}

/**
 * Keeps a typed space visible: a space at the very start or end of a block, or next to
 * another collapsible space, is stored as a non-breaking space.
 */
function visibleText(data: string, block: Node, node: Node, offset: number): string {
  if (data !== ' ') return data;
  const doc = node.ownerDocument as Document;
  const before = textBetween(doc, block, 0, node, offset);
  const after = textBetween(doc, node, offset, block, block.childNodes.length);
  const collapsible = (ch: string | undefined) => ch === undefined || /[ \t\n\r]/.test(ch);
  return collapsible(before[before.length - 1]) || collapsible(after[0]) ? ' ' : data;
}

/**
 * Inserts text at an edge side, putting it inside or outside the snippet as chosen.
 * Exported for tests; normally driven by `beforeinput`.
 */
export function insertTextAtInlineCodeEdge(canvas: HTMLElement, edge: InlineCodeEdge, data: string): void {
  const { code, side } = edge;
  const doc = canvas.ownerDocument;
  const block = closestBlock(code, canvas);
  const pos = domPositionFor(edge);
  const text = visibleText(data, block, pos.node, pos.offset);

  let target: Text;
  let caretOffset: number;
  switch (side) {
    case 'inside-start': {
      target = firstTextNode(code) || code.insertBefore(doc.createTextNode(''), code.firstChild);
      target.insertData(0, text);
      caretOffset = text.length;
      break;
    }
    case 'inside-end': {
      target = lastTextNode(code) || code.appendChild(doc.createTextNode(''));
      target.appendData(text);
      caretOffset = (target.nodeValue || '').length;
      break;
    }
    case 'outside-start': {
      const prev = code.previousSibling;
      target = prev && prev.nodeType === 3 ? (prev as Text) : code.parentNode!.insertBefore(doc.createTextNode(''), code);
      target.appendData(text);
      caretOffset = (target.nodeValue || '').length;
      break;
    }
    case 'outside-end': {
      const next = code.nextSibling;
      target = next && next.nodeType === 3 ? (next as Text) : code.parentNode!.insertBefore(doc.createTextNode(''), next);
      target.insertData(0, text);
      caretOffset = text.length;
      break;
    }
  }

  const sel = getSelection(canvas);
  sel?.collapse(target, caretOffset);
  // Typing at an end-side position leaves the caret on the same edge; keep that side.
  currentEdge = side === 'inside-end' || side === 'outside-start' ? { code, side } : null;
  syncInlineCodeEdgeFromSelection(canvas);

  const InputEventCtor = (doc.defaultView as (Window & typeof globalThis) | null)?.InputEvent;
  const evt = InputEventCtor
    ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data })
    : new Event('input', { bubbles: true });
  (target.parentNode || canvas).dispatchEvent(evt);
}

/**
 * Intercepts plain text insertion at an inline code edge. Returns true when handled.
 */
export function handleInlineCodeBeforeInput(e: InputEvent, canvas: HTMLElement): boolean {
  if (e.inputType !== 'insertText' || e.isComposing || !e.data) return false;
  const edge = resolveEdge(canvas);
  if (!edge) return false;
  e.preventDefault();
  insertTextAtInlineCodeEdge(canvas, edge, e.data);
  return true;
}

/**
 * After a click that put the caret on a snippet edge, chooses the side by where the
 * click landed: on the snippet's box (padding included) → inside, beyond it → outside.
 */
export function handleInlineCodeMouseUp(e: MouseEvent, canvas: HTMLElement): void {
  if (e.button !== 0) return;
  const sel = getSelection(canvas);
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !sel.focusNode || !canvas.contains(sel.focusNode)) {
    return;
  }
  const found = findInlineCodeEdgeAt(sel.focusNode, sel.focusOffset, canvas);
  if (!found) {
    clearInlineCodeEdge(canvas);
    return;
  }

  const boundary = boundaryOf(found.side);
  const rects = found.code.getClientRects();
  const rect = rects.length > 0 ? rects[boundary === 'start' ? 0 : rects.length - 1] : found.code.getBoundingClientRect();
  const onBox =
    e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top - 1 && e.clientY <= rect.bottom + 1;

  const side: InlineCodeEdgeSide =
    boundary === 'start' ? (onBox ? 'inside-start' : 'outside-start') : onBox ? 'inside-end' : 'outside-end';
  setInlineCodeEdge(canvas, { code: found.code, side });
}

/**
 * Wires edge caret handling on the editor canvas.
 */
export function wireInlineCodeCaret(canvas: HTMLElement): void {
  const doc = canvas.ownerDocument;
  clearInlineCodeEdge(canvas);

  doc.addEventListener('selectionchange', () => syncInlineCodeEdgeFromSelection(canvas));
  canvas.addEventListener('beforeinput', (e: Event) => {
    handleInlineCodeBeforeInput(e as InputEvent, canvas);
  });
  canvas.addEventListener('mouseup', (e: MouseEvent) => handleInlineCodeMouseUp(e, canvas));
  canvas.addEventListener('focusout', () => clearVisual(canvas));
  canvas.addEventListener('focusin', () => syncInlineCodeEdgeFromSelection(canvas));
}
