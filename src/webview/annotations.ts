import { DocumentAnnotation } from '../types/annotation';
import { state, vscode, getEditorCanvas, persistWebviewState } from './editorState';
import { tWebview } from './i18n';

let annotationsList: DocumentAnnotation[] = [];
let activeViewAnnotationId: string | null = null;
let pendingSelectionForAnnotation: {
  selectedText: string;
  prefix: string;
  suffix: string;
  rect: { top: number; bottom: number; left: number; right: number };
} | null = null;

export function getAnnotations(): DocumentAnnotation[] {
  return annotationsList;
}

export function setAnnotations(newAnnotations: DocumentAnnotation[]): void {
  annotationsList = Array.isArray(newAnnotations) ? [...newAnnotations] : [];
  state.annotations = annotationsList;
  persistWebviewState();
  updateCoworkButtonWithAnnotations();
  renderAllAnnotations();
}

/**
 * Updates the Cowork toolbar button label and title based on annotation count.
 */
export function updateCoworkButtonWithAnnotations(): void {
  if (typeof document === 'undefined') return;
  const cowork = document.getElementById('btn-cowork');
  if (!cowork) return;

  const count = annotationsList.length;
  const span = cowork.querySelector('span');
  if (count > 0) {
    const label = tWebview('An Agent weiterleiten ({0})', count);
    if (span) {
      span.textContent = label;
    } else {
      cowork.textContent = label;
    }
    cowork.title = tWebview('Dokument und {0} Anmerkungen an KI-Agent weiterleiten', count);
    cowork.classList.add('has-annotations');
  } else {
    if (span) {
      span.textContent = 'Cowork';
    } else {
      cowork.textContent = 'Cowork';
    }
    cowork.title = tWebview('Mit KI-Agent an diesem Dokument zusammenarbeiten');
    cowork.classList.remove('has-annotations');
  }
}

/**
 * Calculates string similarity using Levenshtein distance.
 * Returns a value between 0.0 (completely different) and 1.0 (identical).
 */
export function calculateTextSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastVal = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newVal = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newVal = Math.min(Math.min(newVal, lastVal), costs[j]) + 1;
        }
        costs[j - 1] = lastVal;
        lastVal = newVal;
      }
    }
    if (i > 0) costs[s2.length] = lastVal;
  }
  const editDistance = costs[s2.length];
  return (longer.length - editDistance) / longer.length;
}

/**
 * Splits and wraps a single text node with a mark element.
 */
function wrapSingleTextNode(
  node: Text,
  startOffset: number,
  endOffset: number,
  annotationId: string
): HTMLElement {
  const text = node.nodeValue || '';
  const before = text.slice(0, startOffset);
  const selected = text.slice(startOffset, endOffset);
  const after = text.slice(endOffset);

  const parent = node.parentNode!;
  const mark = document.createElement('mark');
  mark.className = 'doc-annotation';
  mark.dataset.annotationId = annotationId;
  mark.textContent = selected;

  if (before) {
    parent.insertBefore(document.createTextNode(before), node);
  }
  parent.insertBefore(mark, node);
  if (after) {
    parent.insertBefore(document.createTextNode(after), node);
  }
  parent.removeChild(node);
  return mark;
}

/**
 * Safely wraps a DOM range with one or more mark elements.
 */
export function wrapRangeWithAnnotation(range: Range, annotationId: string): HTMLElement[] {
  const marks: HTMLElement[] = [];
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    marks.push(wrapSingleTextNode(startNode as Text, startOffset, endOffset, annotationId));
    return marks;
  }

  const common = range.commonAncestorContainer;
  const doc = common.ownerDocument || document;
  const walker = doc.createTreeWalker(common, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let curr = walker.nextNode();
  while (curr) {
    textNodes.push(curr as Text);
    curr = walker.nextNode();
  }

  for (let i = 0; i < textNodes.length; i++) {
    const tNode = textNodes[i];
    const s = tNode === startNode ? startOffset : 0;
    const e = tNode === endNode ? endOffset : (tNode.nodeValue?.length || 0);
    if (s < e) {
      marks.push(wrapSingleTextNode(tNode, s, e, annotationId));
    }
  }

  return marks;
}

/**
 * Removes all mark elements for an annotation and normalizes adjacent text nodes.
 */
export function unwrapAnnotationMarks(annotationId: string, canvas: HTMLElement): void {
  const marks = canvas.querySelectorAll<HTMLElement>(
    `mark.doc-annotation[data-annotation-id="${annotationId}"]`
  );
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }
  });
}

interface CharMapEntry {
  node: Text;
  offset: number;
}

/**
 * Scans canvas text nodes and searches for an annotation match.
 */
function findAndHighlightAnnotation(
  canvas: HTMLElement,
  ann: DocumentAnnotation
): boolean {
  // If mark already exists in DOM, verify its text still matches
  const existingMarks = canvas.querySelectorAll<HTMLElement>(
    `mark.doc-annotation[data-annotation-id="${ann.id}"]`
  );
  if (existingMarks.length > 0) {
    const combined = Array.from(existingMarks)
      .map((m) => m.textContent || '')
      .join('');
    if (calculateTextSimilarity(combined, ann.selectedText) >= 0.7) {
      return true;
    }
    // Mismatch or corrupted, unwrap and re-search
    unwrapAnnotationMarks(ann.id, canvas);
  }

  // Build character map of the canvas text nodes
  const doc = canvas.ownerDocument || document;
  const walker = doc.createTreeWalker(canvas, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const el = n.parentElement;
      if (
        el &&
        (el.classList.contains('annotation-margin-pill') ||
          el.classList.contains('annotation-popover') ||
          el.classList.contains('table-controls') ||
          el.classList.contains('code-block-header'))
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const charMap: CharMapEntry[] = [];
  let fullText = '';
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const val = textNode.nodeValue || '';
    for (let i = 0; i < val.length; i++) {
      charMap.push({ node: textNode, offset: i });
      fullText += val[i];
    }
    node = walker.nextNode();
  }

  if (fullText.length === 0) {
    return false;
  }

  let matchStart = -1;
  let matchLength = ann.selectedText.length;

  // 1. Try context match: prefix + selectedText + suffix
  if (ann.prefix || ann.suffix) {
    const fullQuery = (ann.prefix || '') + ann.selectedText + (ann.suffix || '');
    const idx = fullText.indexOf(fullQuery);
    if (idx !== -1) {
      matchStart = idx + (ann.prefix ? ann.prefix.length : 0);
    }
  }

  // 2. Exact match of selectedText
  if (matchStart === -1) {
    matchStart = fullText.indexOf(ann.selectedText);
  }

  // 3. Fallback: Fuzzy search across full text if exact text is slightly modified
  if (matchStart === -1 && ann.selectedText.length >= 8) {
    const targetLen = ann.selectedText.length;
    let bestSim = 0;
    let bestIdx = -1;
    // Step in chunks of 5 characters for performance
    const step = Math.max(1, Math.floor(targetLen / 6));
    for (let i = 0; i <= fullText.length - targetLen; i += step) {
      const slice = fullText.slice(i, i + targetLen);
      const sim = calculateTextSimilarity(slice, ann.selectedText);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestSim >= 0.7 && bestIdx !== -1) {
      matchStart = bestIdx;
      matchLength = targetLen;
    }
  }

  if (matchStart === -1 || matchStart + matchLength > charMap.length) {
    return false; // Significantly changed or deleted
  }

  // Create range from character map
  const startEntry = charMap[matchStart];
  const endEntry = charMap[matchStart + matchLength - 1];
  if (!startEntry || !endEntry) {
    return false;
  }

  const range = doc.createRange();
  range.setStart(startEntry.node, startEntry.offset);
  range.setEnd(endEntry.node, endEntry.offset + 1);

  wrapRangeWithAnnotation(range, ann.id);
  return true;
}

/**
 * Re-anchors all annotations into the canvas DOM and prunes orphaned ones.
 */
export function renderAllAnnotations(): void {
  const canvas = getEditorCanvas();
  if (!canvas) return;

  const validAnnotations: DocumentAnnotation[] = [];
  let changed = false;

  for (const ann of annotationsList) {
    const found = findAndHighlightAnnotation(canvas, ann);
    if (found) {
      validAnnotations.push(ann);
    } else {
      changed = true; // Pruned because text changed significantly or was deleted
    }
  }

  if (changed) {
    annotationsList = validAnnotations;
    state.annotations = annotationsList;
    persistWebviewState();
    vscode.postMessage({
      type: 'updateAnnotations',
      annotations: annotationsList,
    });
    updateCoworkButtonWithAnnotations();
  }

  wireAnnotationMarks(canvas);
  renderMarginPills(canvas);
}

/**
 * Wires click and hover interactions on `<mark.doc-annotation>` elements.
 */
export function wireAnnotationMarks(canvas: HTMLElement): void {
  const marks = canvas.querySelectorAll<HTMLElement>('mark.doc-annotation');
  marks.forEach((mark) => {
    if (mark.dataset.wired) return;
    mark.dataset.wired = 'true';

    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      const annId = mark.dataset.annotationId;
      if (annId) {
        showViewAnnotationPopover(annId, mark);
      }
    });
  });
}

/**
 * Renders small comment indicator pills in the right margin of the document container.
 */
export function renderMarginPills(canvas: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const container = (canvas.closest('.document-container') as HTMLElement) || canvas;
  if (!container) return;

  // Clear existing pills
  container.querySelectorAll('.annotation-margin-pill').forEach((p) => p.remove());

  // Ensure container has relative positioning for margin pill positioning
  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const containerRect = container.getBoundingClientRect();

  // Position a pill for each unique annotation
  for (const ann of annotationsList) {
    const mark = canvas.querySelector<HTMLElement>(
      `mark.doc-annotation[data-annotation-id="${ann.id}"]`
    );
    if (!mark) continue;

    const markRect = mark.getBoundingClientRect();
    const pill = document.createElement('button');
    pill.className = 'annotation-margin-pill';
    pill.dataset.annotationId = ann.id;
    pill.tabIndex = -1;
    pill.title = ann.comment;
    pill.setAttribute('aria-label', `Anmerkung: ${ann.comment}`);
    pill.innerHTML = '💬';

    const topOffset = markRect.top - containerRect.top + (markRect.height / 2 - 12);
    pill.style.top = `${Math.max(0, Math.round(topOffset))}px`;

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showViewAnnotationPopover(ann.id, pill);
    });

    pill.addEventListener('mouseenter', () => {
      mark.classList.add('is-active');
    });
    pill.addEventListener('mouseleave', () => {
      mark.classList.remove('is-active');
    });

    container.appendChild(pill);
  }
}

// -------------------------------------------------------------
// Popover UI (Create & View)
// -------------------------------------------------------------

function getOrCreateCreatePopover(): HTMLElement {
  let popover = document.getElementById('annotation-create-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'annotation-create-popover';
    popover.className = 'annotation-popover annotation-create-popover';
    popover.style.display = 'none';
    popover.innerHTML = `
      <div class="annotation-popover-header">
        <span class="annotation-popover-title">💬 ${tWebview('Anmerkung hinzufügen')}</span>
        <button class="annotation-popover-close" title="${tWebview('Schließen')}">✕</button>
      </div>
      <div class="annotation-popover-body">
        <textarea class="annotation-input" placeholder="${tWebview('Anmerkung eingeben...')}"></textarea>
      </div>
      <div class="annotation-popover-actions">
        <button class="annotation-btn annotation-btn-cancel">${tWebview('Abbrechen')}</button>
        <button class="annotation-btn annotation-btn-save">${tWebview('Speichern')}</button>
      </div>
    `;
    document.body.appendChild(popover);

    const closeBtn = popover.querySelector('.annotation-popover-close');
    const cancelBtn = popover.querySelector('.annotation-btn-cancel');
    const saveBtn = popover.querySelector('.annotation-btn-save');
    const textarea = popover.querySelector('textarea') as HTMLTextAreaElement;

    const close = () => hideCreateAnnotationPopover();
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);

    saveBtn?.addEventListener('click', () => {
      handleSaveNewAnnotation();
    });

    textarea?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSaveNewAnnotation();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    popover.addEventListener('mousedown', (e) => e.stopPropagation());
  }
  return popover;
}

function getOrCreateViewPopover(): HTMLElement {
  let popover = document.getElementById('annotation-view-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'annotation-view-popover';
    popover.className = 'annotation-popover annotation-view-popover';
    popover.style.display = 'none';
    popover.innerHTML = `
      <div class="annotation-popover-header">
        <span class="annotation-popover-title">💬 ${tWebview('Anmerkung')}</span>
        <button class="annotation-popover-close" title="${tWebview('Schließen')}">✕</button>
      </div>
      <div class="annotation-popover-quote">
        <span class="annotation-quote-text"></span>
      </div>
      <div class="annotation-popover-body">
        <div class="annotation-comment-text"></div>
        <textarea class="annotation-edit-input" style="display: none;"></textarea>
      </div>
      <div class="annotation-popover-actions">
        <button class="annotation-btn annotation-btn-delete" title="${tWebview('Löschen')}">🗑 ${tWebview('Löschen')}</button>
        <div class="annotation-actions-spacer"></div>
        <button class="annotation-btn annotation-btn-edit">${tWebview('Bearbeiten')}</button>
        <button class="annotation-btn annotation-btn-save-edit" style="display: none;">${tWebview('Speichern')}</button>
      </div>
    `;
    document.body.appendChild(popover);

    const closeBtn = popover.querySelector('.annotation-popover-close');
    const deleteBtn = popover.querySelector('.annotation-btn-delete');
    const editBtn = popover.querySelector('.annotation-btn-edit') as HTMLElement | null;
    const saveEditBtn = popover.querySelector('.annotation-btn-save-edit') as HTMLElement | null;
    const editTextarea = popover.querySelector('.annotation-edit-input') as HTMLTextAreaElement;

    closeBtn?.addEventListener('click', () => hideViewAnnotationPopover());

    deleteBtn?.addEventListener('click', () => {
      if (activeViewAnnotationId) {
        deleteAnnotation(activeViewAnnotationId);
        hideViewAnnotationPopover();
      }
    });

    editBtn?.addEventListener('click', () => {
      const commentDiv = popover?.querySelector('.annotation-comment-text') as HTMLElement;
      if (commentDiv && editTextarea && activeViewAnnotationId) {
        const ann = annotationsList.find((a) => a.id === activeViewAnnotationId);
        if (ann) {
          editTextarea.value = ann.comment;
          commentDiv.style.display = 'none';
          editTextarea.style.display = 'block';
          editBtn.style.display = 'none';
          if (saveEditBtn) saveEditBtn.style.display = 'inline-flex';
          editTextarea.focus();
        }
      }
    });

    const saveEdit = () => {
      if (activeViewAnnotationId && editTextarea) {
        const ann = annotationsList.find((a) => a.id === activeViewAnnotationId);
        if (ann) {
          const newComment = editTextarea.value.trim();
          if (newComment) {
            ann.comment = newComment;
            state.annotations = annotationsList;
            persistWebviewState();
            vscode.postMessage({
              type: 'updateAnnotations',
              annotations: annotationsList,
            });
            renderMarginPills(getEditorCanvas());
          }
        }
        hideViewAnnotationPopover();
      }
    };

    saveEditBtn?.addEventListener('click', saveEdit);
    editTextarea?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideViewAnnotationPopover();
      }
    });

    popover.addEventListener('mousedown', (e) => e.stopPropagation());
  }
  return popover;
}

export function openCreateAnnotationPopover(data: {
  selectedText: string;
  prefix: string;
  suffix: string;
  rect: { top: number; bottom: number; left: number; right: number };
}): void {
  hideViewAnnotationPopover();
  pendingSelectionForAnnotation = data;

  const popover = getOrCreateCreatePopover();
  const textarea = popover.querySelector('textarea');
  if (textarea) textarea.value = '';

  positionPopoverNearRect(popover, data.rect);
  popover.style.display = 'block';
  setTimeout(() => textarea?.focus(), 30);
}

export function hideCreateAnnotationPopover(): void {
  const popover = document.getElementById('annotation-create-popover');
  if (popover) {
    popover.style.display = 'none';
  }
  pendingSelectionForAnnotation = null;
}

export function showViewAnnotationPopover(annotationId: string, anchorEl: HTMLElement): void {
  hideCreateAnnotationPopover();
  const ann = annotationsList.find((a) => a.id === annotationId);
  if (!ann) return;

  activeViewAnnotationId = annotationId;
  const popover = getOrCreateViewPopover();

  const quoteEl = popover.querySelector('.annotation-quote-text');
  const commentDiv = popover.querySelector('.annotation-comment-text') as HTMLElement;
  const editTextarea = popover.querySelector('.annotation-edit-input') as HTMLElement;
  const editBtn = popover.querySelector('.annotation-btn-edit') as HTMLElement;
  const saveEditBtn = popover.querySelector('.annotation-btn-save-edit') as HTMLElement;

  if (quoteEl) quoteEl.textContent = `"${ann.selectedText}"`;
  if (commentDiv) {
    commentDiv.textContent = ann.comment;
    commentDiv.style.display = 'block';
  }
  if (editTextarea) editTextarea.style.display = 'none';
  if (editBtn) editBtn.style.display = 'inline-flex';
  if (saveEditBtn) saveEditBtn.style.display = 'none';

  const rect = anchorEl.getBoundingClientRect();
  positionPopoverNearRect(popover, rect);
  popover.style.display = 'block';
}

export function hideViewAnnotationPopover(): void {
  const popover = document.getElementById('annotation-view-popover');
  if (popover) {
    popover.style.display = 'none';
  }
  activeViewAnnotationId = null;
}

function positionPopoverNearRect(
  popover: HTMLElement,
  rect: { top: number; bottom: number; left: number; right: number }
): void {
  popover.style.visibility = 'hidden';
  popover.style.display = 'block';

  const pWidth = popover.offsetWidth || 290;
  const pHeight = popover.offsetHeight || 160;
  popover.style.visibility = 'visible';

  const margin = 12;
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 600;

  // Align horizontally with target
  let left = rect.left;
  if (left + pWidth > winWidth - margin) {
    left = Math.max(margin, winWidth - pWidth - margin);
  }
  if (left < margin) left = margin;

  // Align vertically: try below, if overflow try above
  let top = rect.bottom + 8;
  if (top + pHeight > winHeight - margin) {
    top = Math.max(margin, rect.top - pHeight - 8);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function handleSaveNewAnnotation(): void {
  const popover = document.getElementById('annotation-create-popover');
  const textarea = popover?.querySelector('textarea');
  const comment = textarea?.value.trim() || '';
  if (!comment || !pendingSelectionForAnnotation) {
    hideCreateAnnotationPopover();
    return;
  }

  const ann: DocumentAnnotation = {
    id: `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    selectedText: pendingSelectionForAnnotation.selectedText,
    prefix: pendingSelectionForAnnotation.prefix,
    suffix: pendingSelectionForAnnotation.suffix,
    comment,
    createdAt: Date.now(),
  };

  annotationsList.push(ann);
  state.annotations = annotationsList;
  persistWebviewState();

  // Highlight in DOM
  const canvas = getEditorCanvas();
  if (canvas) {
    findAndHighlightAnnotation(canvas, ann);
    wireAnnotationMarks(canvas);
    renderMarginPills(canvas);
  }

  updateCoworkButtonWithAnnotations();
  vscode.postMessage({
    type: 'updateAnnotations',
    annotations: annotationsList,
  });

  hideCreateAnnotationPopover();
}

export function deleteAnnotation(annotationId: string): void {
  annotationsList = annotationsList.filter((a) => a.id !== annotationId);
  state.annotations = annotationsList;
  persistWebviewState();

  const canvas = getEditorCanvas();
  if (canvas) {
    unwrapAnnotationMarks(annotationId, canvas);
    renderMarginPills(canvas);
  }

  updateCoworkButtonWithAnnotations();
  vscode.postMessage({
    type: 'updateAnnotations',
    annotations: annotationsList,
  });
}

/**
 * Attaches document-wide click listeners to close popovers on outside clicks.
 */
export function wireAnnotationGlobalEvents(): () => void {
  if (typeof document === 'undefined') return () => {};

  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (
      target.closest('.annotation-popover') ||
      target.closest('mark.doc-annotation') ||
      target.closest('.annotation-margin-pill') ||
      target.closest('.selection-annotate-btn')
    ) {
      return;
    }

    hideCreateAnnotationPopover();
    hideViewAnnotationPopover();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideCreateAnnotationPopover();
      hideViewAnnotationPopover();
    }
  };

  document.addEventListener('click', handleDocClick);
  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('click', handleDocClick);
    document.removeEventListener('keydown', handleKeyDown);
  };
}
