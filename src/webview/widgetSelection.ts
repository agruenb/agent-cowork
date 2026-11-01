/**
 * Alt/Option + Shift + Arrow selection extension inside widget blocks.
 *
 * Widgets (quotes, code blocks, tables) are nested editing hosts inside a
 * `contenteditable="false"` container. Chromium's native word / paragraph
 * extension walks out of such a host and then clamps the selection at the
 * editing boundary, which ends up selecting the whole widget. We perform the
 * extension ourselves and keep the focus inside the widget (or table cell).
 */

const ARROW_KEYS: Record<string, { direction: 'forward' | 'backward'; granularity: string }> = {
  ArrowLeft: { direction: 'backward', granularity: 'word' },
  ArrowRight: { direction: 'forward', granularity: 'word' },
  ArrowUp: { direction: 'backward', granularity: 'paragraphboundary' },
  ArrowDown: { direction: 'forward', granularity: 'paragraphboundary' },
};

type ModifiableSelection = Selection & {
  modify?: (alter: string, direction: string, granularity: string) => void;
};

/**
 * Returns the nested editing host (widget) containing the node, or null when
 * the node lives directly in the editor canvas.
 */
function getWidgetHost(node: Node | null, canvas: HTMLElement): HTMLElement | null {
  const el = node && node.nodeType === 1 ? (node as HTMLElement) : node?.parentElement;
  const host = el?.closest<HTMLElement>('[contenteditable="true"]');
  if (!host || host === canvas || !canvas.contains(host)) return null;
  if (!host.parentElement?.closest('[contenteditable="false"]')) return null;
  return host;
}

/**
 * Handles Alt+Shift+Arrow inside widgets. Returns true when the event was handled.
 */
export function handleWidgetSelectionExtend(e: KeyboardEvent, canvas: HTMLElement): boolean {
  const mapping = ARROW_KEYS[e.key];
  if (!mapping || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;

  const doc = canvas.ownerDocument;
  const sel = (doc.defaultView?.getSelection() || null) as ModifiableSelection | null;
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode || typeof sel.modify !== 'function') {
    return false;
  }

  const host = getWidgetHost(sel.anchorNode, canvas);
  if (!host || !host.contains(sel.focusNode)) return false;

  // Table selections stay within the anchor's cell
  const anchorEl = sel.anchorNode.nodeType === 1 ? (sel.anchorNode as HTMLElement) : sel.anchorNode.parentElement;
  const cell = anchorEl?.closest<HTMLElement>('td, th');
  const bounds = cell && host.contains(cell) ? cell : host;

  e.preventDefault();

  const { anchorNode, anchorOffset, focusNode, focusOffset } = sel;
  const { direction, granularity } = mapping;

  sel.modify('extend', direction, granularity);
  // Already at a paragraph boundary: step past it to reach the next one (macOS behaviour)
  if (granularity === 'paragraphboundary' && sel.focusNode === focusNode && sel.focusOffset === focusOffset) {
    sel.modify('extend', direction, 'character');
    sel.modify('extend', direction, granularity);
  }

  let newFocusNode: Node = sel.focusNode || focusNode;
  let newFocusOffset = sel.focusOffset;
  if (!bounds.contains(newFocusNode)) {
    newFocusNode = bounds;
    newFocusOffset = direction === 'forward' ? bounds.childNodes.length : 0;
  }

  sel.setBaseAndExtent(anchorNode, anchorOffset, newFocusNode, newFocusOffset);
  return true;
}
