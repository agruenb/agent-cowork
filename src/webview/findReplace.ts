import {
  state,
  getEditorCanvas,
  getRawTextarea,
  getRawGutter,
  getDocumentViewport,
  autoResizeRawTextarea,
  emitEdit,
  emitCanvasEdit,
} from './editorState';
import { updateRawLineNumbers } from './rawLineNumbers';
import { scrollToLineInRaw } from './scrollSync';
import { tWebview } from './i18n';

export interface FindMatchInfo {
  id: number;
  // In formatted mode: mark element(s) wrapping the match
  marks?: HTMLElement[];
  block?: HTMLElement;
  // In raw mode: character start and end index in textarea value
  start?: number;
  end?: number;
}

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

// Module State
let isFindOpen = false;
let isReplaceOpen = false;
let currentQuery = '';
let currentReplaceText = '';
const currentOptions: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
};
let activeMatchIndex = -1;
let formattedMatches: FindMatchInfo[] = [];
let rawMatches: FindMatchInfo[] = [];

// DOM Element Getters (safe for jsdom tests)
export function getFindWidget(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.getElementById('find-widget') : null;
}

export function getFindInput(): HTMLInputElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('find-input') as HTMLInputElement | null)
    : null;
}

export function getFindReplaceInput(): HTMLInputElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('find-replace-input') as HTMLInputElement | null)
    : null;
}

export function getFindCount(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.getElementById('find-count') : null;
}

export function getFindReplaceRow(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.getElementById('find-replace-row') : null;
}

export function getBtnFindToggleReplace(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-toggle-replace') as HTMLButtonElement | null)
    : null;
}

export function getBtnFindCase(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-case') as HTMLButtonElement | null)
    : null;
}

export function getBtnFindWord(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-word') as HTMLButtonElement | null)
    : null;
}

export function getBtnFindPrev(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-prev') as HTMLButtonElement | null)
    : null;
}

export function getBtnFindNext(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-next') as HTMLButtonElement | null)
    : null;
}

export function getBtnFindClose(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-find-close') as HTMLButtonElement | null)
    : null;
}

export function getBtnReplace(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-replace') as HTMLButtonElement | null)
    : null;
}

export function getBtnReplaceAll(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-replace-all') as HTMLButtonElement | null)
    : null;
}

export function getBtnToolbarFind(): HTMLButtonElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('btn-toolbar-find') as HTMLButtonElement | null)
    : null;
}

/**
 * Escapes special regex characters in a query string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a DOM node should be ignored during formatted text searching.
 */
function isIgnoredNode(node: Node): boolean {
  let el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el.id !== 'editor') {
    if (
      el.classList.contains('code-block-header') ||
      el.classList.contains('code-lang-input') ||
      el.classList.contains('code-copy-btn') ||
      el.classList.contains('inline-code-copy-btn') ||
      el.classList.contains('block-delete-btn') ||
      el.classList.contains('block-confirm-popup') ||
      el.classList.contains('table-controls') ||
      el.classList.contains('table-confirm-popup') ||
      el.classList.contains('task-list-controls') ||
      el.classList.contains('task-item-drag-btn') ||
      el.classList.contains('task-item-del-btn') ||
      el.classList.contains('task-item-top-btn') ||
      el.classList.contains('task-drop-indicator') ||
      el.id === 'find-widget' ||
      el.tagName.toLowerCase() === 'button'
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Unwraps all <mark class="find-match"> elements in the canvas and normalizes text nodes.
 */
export function clearFormattedHighlights(canvas: HTMLElement): void {
  const marks = Array.from(canvas.querySelectorAll('mark.find-match')) as HTMLElement[];
  const parentsToNormalize = new Set<Node>();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (parent) {
      parentsToNormalize.add(parent);
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  }
  for (const p of parentsToNormalize) {
    p.normalize();
  }
  formattedMatches = [];
}

/**
 * Returns distinct search units (e.g. paragraphs, table cells, list items, headings)
 * within the editor canvas.
 */
function getSearchUnits(canvas: HTMLElement): HTMLElement[] {
  const units: HTMLElement[] = [];

  function collect(el: HTMLElement) {
    if (isIgnoredNode(el)) return;
    const tag = el.tagName.toLowerCase();

    if (tag === 'table') {
      const cells = el.querySelectorAll<HTMLElement>('th, td');
      cells.forEach((c) => {
        if (!isIgnoredNode(c)) units.push(c);
      });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const lis = el.querySelectorAll<HTMLElement>(':scope > li');
      lis.forEach((li) => {
        const content = li.querySelector<HTMLElement>(':scope > .task-content');
        if (content) {
          units.push(content);
        } else {
          units.push(li);
        }
        const sublists = li.querySelectorAll<HTMLElement>(':scope > ul, :scope > ol');
        sublists.forEach((sub) => collect(sub));
      });
      return;
    }

    if (el.classList.contains('code-block-wrapper')) {
      const code = el.querySelector<HTMLElement>('code.editor-code');
      if (code) units.push(code);
      return;
    }

    if (tag === 'blockquote') {
      const paras = el.querySelectorAll<HTMLElement>('p');
      if (paras.length > 0) {
        paras.forEach((p) => units.push(p));
      } else {
        units.push(el);
      }
      return;
    }

    if (/^h[1-6]$/.test(tag) || tag === 'p' || el.classList.contains('editor-block')) {
      units.push(el);
      return;
    }

    if (el.parentElement === canvas) {
      units.push(el);
    }
  }

  for (const child of Array.from(canvas.children) as HTMLElement[]) {
    collect(child);
  }

  return units;
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

/**
 * Performs find in Formatted Mode (#editor).
 */
function findInFormatted(
  canvas: HTMLElement,
  query: string,
  options: FindOptions
): FindMatchInfo[] {
  clearFormattedHighlights(canvas);
  if (!query) return [];

  const escaped = escapeRegex(query);
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }

  const units = getSearchUnits(canvas);
  const matches: FindMatchInfo[] = [];
  let nextMatchId = 0;

  const filterAccept = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_ACCEPT : 1;
  const filterReject = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_REJECT : 2;
  const showText = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;

  for (const unit of units) {
    // Collect text nodes in this unit
    const walker = document.createTreeWalker(unit, showText, {
      acceptNode(node) {
        if (isIgnoredNode(node)) return filterReject;
        const parent = node.parentElement;
        if (parent && (parent.tagName.toLowerCase() === 'mark' || parent.classList.contains('find-match'))) {
          return filterReject;
        }
        return filterAccept;
      },
    });

    const segments: TextSegment[] = [];
    let runningLen = 0;
    let currNode = walker.nextNode();
    while (currNode) {
      const txt = (currNode as Text).nodeValue || '';
      const len = txt.length;
      if (len > 0) {
        segments.push({
          node: currNode as Text,
          start: runningLen,
          end: runningLen + len,
        });
        runningLen += len;
      }
      currNode = walker.nextNode();
    }

    if (segments.length === 0) continue;
    const unitText = segments.map((s) => s.node.nodeValue || '').join('');
    regex.lastIndex = 0;

    interface RawMatchUnit {
      matchIndex: number;
      start: number;
      end: number;
    }

    const unitMatches: RawMatchUnit[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(unitText)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      unitMatches.push({
        matchIndex: nextMatchId++,
        start: m.index,
        end: m.index + m[0].length,
      });
      if (!regex.global) break;
    }

    // Process unit matches in REVERSE order so splitting nodes does not alter earlier offsets
    for (let i = unitMatches.length - 1; i >= 0; i--) {
      const match = unitMatches[i];
      const matchMarks: HTMLElement[] = [];

      for (const seg of segments) {
        if (match.start < seg.end && match.end > seg.start) {
          const overlapStart = Math.max(match.start, seg.start) - seg.start;
          const overlapEnd = Math.min(match.end, seg.end) - seg.start;
          const fullLen = (seg.node.nodeValue || '').length;

          let targetNode = seg.node;
          if (overlapEnd < fullLen) {
            targetNode.splitText(overlapEnd);
          }
          if (overlapStart > 0) {
            targetNode = targetNode.splitText(overlapStart);
          }

          const mark = document.createElement('mark');
          mark.className = 'find-match';
          mark.setAttribute('data-match-id', String(match.matchIndex));
          const parent = targetNode.parentNode;
          if (parent) {
            parent.insertBefore(mark, targetNode);
            mark.appendChild(targetNode);
            matchMarks.unshift(mark);
          }
        }
      }

      if (matchMarks.length > 0) {
        matches.push({
          id: match.matchIndex,
          marks: matchMarks,
          block: unit,
        });
      }
    }
  }

  // Sort matches back in document order (by id)
  matches.sort((a, b) => a.id - b.id);
  return matches;
}

/**
 * Performs find in Raw Mode (#raw-textarea).
 */
function findInRaw(
  textarea: HTMLTextAreaElement,
  query: string,
  options: FindOptions
): FindMatchInfo[] {
  if (!query) return [];
  const text = textarea.value;
  const escaped = escapeRegex(query);
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }

  const matches: FindMatchInfo[] = [];
  let m: RegExpExecArray | null;
  let id = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    matches.push({
      id: id++,
      start: m.index,
      end: m.index + m[0].length,
    });
    if (!regex.global) break;
  }
  return matches;
}

/**
 * Updates the match count text display (e.g. "1/5" or "No results").
 */
function updateCountDisplay(currentIndex: number, total: number): void {
  const countEl = getFindCount();
  if (!countEl) return;

  if (total === 0) {
    countEl.textContent = currentQuery ? tWebview('Keine Ergebnisse') : '0/0';
    countEl.classList.toggle('has-no-results', Boolean(currentQuery));
  } else {
    countEl.textContent = `${currentIndex + 1}/${total}`;
    countEl.classList.remove('has-no-results');
  }
}

/**
 * Highlights and scrolls to the active match at activeMatchIndex.
 */
function highlightActiveMatch(): void {
  if (state.isRawMode) {
    const textarea = getRawTextarea();
    if (!textarea || rawMatches.length === 0 || activeMatchIndex < 0) {
      updateCountDisplay(-1, rawMatches.length);
      return;
    }
    const match = rawMatches[activeMatchIndex];
    if (match && typeof match.start === 'number' && typeof match.end === 'number') {
      updateCountDisplay(activeMatchIndex, rawMatches.length);
      textarea.setSelectionRange(match.start, match.end);

      // Scroll viewport in raw mode
      const line = textarea.value.substring(0, match.start).split('\n').length;
      const viewport = getDocumentViewport() || textarea;
      const gutter = getRawGutter();
      scrollToLineInRaw(line, 0, textarea, gutter, viewport);
    }
  } else {
    const canvas = getEditorCanvas();
    if (!canvas || formattedMatches.length === 0 || activeMatchIndex < 0) {
      updateCountDisplay(-1, formattedMatches.length);
      return;
    }

    // Clear active status on previous marks
    canvas.querySelectorAll('mark.find-match.active').forEach((m) => {
      m.classList.remove('active');
    });

    const match = formattedMatches[activeMatchIndex];
    if (match && match.marks && match.marks.length > 0) {
      for (const m of match.marks) {
        m.classList.add('active');
      }
      updateCountDisplay(activeMatchIndex, formattedMatches.length);

      const firstMark = match.marks[0];
      if (typeof firstMark.scrollIntoView === 'function') {
        firstMark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}

/**
 * Runs the find search and updates match count and active highlights.
 */
export function performFind(query?: string): void {
  if (query !== undefined) {
    currentQuery = query;
    const findInput = getFindInput();
    if (findInput && findInput.value !== query) {
      findInput.value = query;
    }
  } else {
    const findInput = getFindInput();
    if (findInput && findInput.value !== undefined) {
      currentQuery = findInput.value;
    }
  }

  if (state.isRawMode) {
    const textarea = getRawTextarea();
    if (!textarea) return;
    rawMatches = findInRaw(textarea, currentQuery, currentOptions);
    if (rawMatches.length === 0) {
      activeMatchIndex = -1;
      updateCountDisplay(-1, 0);
    } else {
      if (activeMatchIndex < 0 || activeMatchIndex >= rawMatches.length) {
        activeMatchIndex = 0;
      }
      highlightActiveMatch();
    }
  } else {
    const canvas = getEditorCanvas();
    if (!canvas) return;
    formattedMatches = findInFormatted(canvas, currentQuery, currentOptions);
    if (formattedMatches.length === 0) {
      activeMatchIndex = -1;
      updateCountDisplay(-1, 0);
    } else {
      if (activeMatchIndex < 0 || activeMatchIndex >= formattedMatches.length) {
        activeMatchIndex = 0;
      }
      highlightActiveMatch();
    }
  }
}

/**
 * Advances to the next match.
 */
export function findNext(): void {
  const total = state.isRawMode ? rawMatches.length : formattedMatches.length;
  if (total === 0) return;
  activeMatchIndex = (activeMatchIndex + 1) % total;
  highlightActiveMatch();
}

/**
 * Moves to the previous match.
 */
export function findPrevious(): void {
  const total = state.isRawMode ? rawMatches.length : formattedMatches.length;
  if (total === 0) return;
  activeMatchIndex = (activeMatchIndex - 1 + total) % total;
  highlightActiveMatch();
}

/**
 * Replaces the current active match with replacement text.
 */
export function replaceCurrent(): void {
  const replaceInput = getFindReplaceInput();
  const repText = replaceInput ? replaceInput.value : currentReplaceText;

  if (state.isRawMode) {
    const textarea = getRawTextarea();
    if (!textarea || rawMatches.length === 0 || activeMatchIndex < 0) return;
    const match = rawMatches[activeMatchIndex];
    if (!match || match.start === undefined || match.end === undefined) return;

    const val = textarea.value;
    textarea.value = val.substring(0, match.start) + repText + val.substring(match.end);
    autoResizeRawTextarea();
    updateRawLineNumbers();
    emitEdit(textarea.value);

    // Re-run search
    performFind();
    if (rawMatches.length > 0) {
      activeMatchIndex = Math.min(activeMatchIndex, rawMatches.length - 1);
      highlightActiveMatch();
    }
  } else {
    const canvas = getEditorCanvas();
    if (!canvas || formattedMatches.length === 0 || activeMatchIndex < 0) return;
    const match = formattedMatches[activeMatchIndex];
    if (!match || !match.marks || match.marks.length === 0) return;

    const firstMark = match.marks[0];
    const repNode = document.createTextNode(repText);
    const parent = firstMark.parentNode;
    if (parent) {
      parent.replaceChild(repNode, firstMark);
    }
    // Remove any remaining multi-segment marks for this match
    for (let i = 1; i < match.marks.length; i++) {
      match.marks[i].remove();
    }
    if (match.block) {
      match.block.normalize();
    }

    emitCanvasEdit();

    // Re-run search
    performFind();
    if (formattedMatches.length > 0) {
      activeMatchIndex = Math.min(activeMatchIndex, formattedMatches.length - 1);
      highlightActiveMatch();
    }
  }
}

/**
 * Replaces all occurrences in the document.
 */
export function replaceAll(): void {
  const replaceInput = getFindReplaceInput();
  const repText = replaceInput ? replaceInput.value : currentReplaceText;
  if (!currentQuery) return;

  if (state.isRawMode) {
    const textarea = getRawTextarea();
    if (!textarea) return;
    const escaped = escapeRegex(currentQuery);
    const pattern = currentOptions.wholeWord ? `\\b${escaped}\\b` : escaped;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, currentOptions.caseSensitive ? 'g' : 'gi');
    } catch {
      return;
    }

    textarea.value = textarea.value.replace(regex, repText);
    autoResizeRawTextarea();
    updateRawLineNumbers();
    emitEdit(textarea.value);

    performFind();
  } else {
    const canvas = getEditorCanvas();
    if (!canvas || formattedMatches.length === 0) return;

    const parents = new Set<Node>();
    for (const match of formattedMatches) {
      if (match.marks && match.marks.length > 0) {
        const firstMark = match.marks[0];
        const repNode = document.createTextNode(repText);
        const parent = firstMark.parentNode;
        if (parent) {
          parents.add(parent);
          parent.replaceChild(repNode, firstMark);
        }
        for (let i = 1; i < match.marks.length; i++) {
          match.marks[i].remove();
        }
      }
      if (match.block) {
        parents.add(match.block);
      }
    }

    for (const p of parents) {
      p.normalize();
    }

    formattedMatches = [];
    emitCanvasEdit();

    performFind();
  }
}

/**
 * Toggles the Replace row open or collapsed.
 */
export function toggleReplaceRow(forceOpen?: boolean, refocus = true): void {
  const row = getFindReplaceRow();
  const toggleBtn = getBtnFindToggleReplace();
  if (!row) return;

  isReplaceOpen = forceOpen !== undefined ? forceOpen : !isReplaceOpen;
  row.style.display = isReplaceOpen ? 'flex' : 'none';

  if (toggleBtn) {
    toggleBtn.classList.toggle('expanded', isReplaceOpen);
    toggleBtn.setAttribute('aria-expanded', String(isReplaceOpen));
  }

  if (!refocus || !isFindOpen) return;

  if (isReplaceOpen) {
    const repInput = getFindReplaceInput();
    if (repInput) {
      repInput.focus();
      repInput.select();
    }
  } else {
    const findInput = getFindInput();
    if (findInput) {
      findInput.focus();
    }
  }
}

/**
 * Toggles case sensitive search.
 */
export function toggleCaseSensitive(): void {
  currentOptions.caseSensitive = !currentOptions.caseSensitive;
  const btn = getBtnFindCase();
  if (btn) {
    btn.classList.toggle('active', currentOptions.caseSensitive);
    btn.setAttribute('aria-pressed', String(currentOptions.caseSensitive));
  }
  performFind();
}

/**
 * Toggles whole word search.
 */
export function toggleWholeWord(): void {
  currentOptions.wholeWord = !currentOptions.wholeWord;
  const btn = getBtnFindWord();
  if (btn) {
    btn.classList.toggle('active', currentOptions.wholeWord);
    btn.setAttribute('aria-pressed', String(currentOptions.wholeWord));
  }
  performFind();
}

/**
 * Dynamically positions the find widget to sit just below the toolbar (and error banner if present).
 */
export function updateFindWidgetPosition(): void {
  const widget = getFindWidget();
  if (!widget) return;
  const toolbar =
    typeof document !== 'undefined'
      ? (document.querySelector('.toolbar') as HTMLElement | null)
      : null;
  const errorBanner =
    typeof document !== 'undefined'
      ? (document.getElementById('error-banner') as HTMLElement | null)
      : null;

  let topOffset = toolbar && toolbar.offsetHeight > 0 ? toolbar.offsetHeight : 58;
  if (errorBanner && errorBanner.style.display !== 'none' && errorBanner.offsetHeight > 0) {
    topOffset += errorBanner.offsetHeight;
  }
  widget.style.top = `${topOffset + 8}px`;
}

/**
 * Opens the Find & Replace widget.
 * Pre-populates the query with active text selection if available.
 */
export function openFindWidget(showReplace = false): void {
  const widget = getFindWidget();
  const findInput = getFindInput();
  if (!widget) return;

  isFindOpen = true;
  widget.style.display = 'flex';
  updateFindWidgetPosition();

  // Extract selected text if available
  let selectedText = '';
  if (state.isRawMode) {
    const textarea = getRawTextarea();
    if (textarea && textarea.selectionEnd > textarea.selectionStart) {
      selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
    }
  } else {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (sel && !sel.isCollapsed) {
      selectedText = sel.toString().trim();
    }
  }

  if (selectedText && selectedText.length <= 100 && !selectedText.includes('\n')) {
    if (findInput) {
      findInput.value = selectedText;
    }
    currentQuery = selectedText;
  }

  if (showReplace) {
    toggleReplaceRow(true);
  }

  performFind();

  if (findInput) {
    findInput.focus();
    findInput.select();
  }
}

/**
 * Closes the Find & Replace widget and cleans up highlights.
 */
export function closeFindWidget(): void {
  const widget = getFindWidget();
  if (!widget) return;

  const viewport = getDocumentViewport();
  const prevScrollTop = viewport ? viewport.scrollTop : 0;
  const prevScrollLeft = viewport ? viewport.scrollLeft : 0;
  const rawTextarea = getRawTextarea();
  const prevTextareaScrollTop = rawTextarea ? rawTextarea.scrollTop : 0;

  isFindOpen = false;
  widget.style.display = 'none';
  toggleReplaceRow(false, false);

  // Unfocus any active element inside the find widget
  if (
    typeof document !== 'undefined' &&
    document.activeElement &&
    widget.contains(document.activeElement)
  ) {
    (document.activeElement as HTMLElement).blur();
    if (document.body && typeof document.body.focus === 'function') {
      const prevTabindex = document.body.getAttribute('tabindex');
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
      if (prevTabindex === null) {
        document.body.removeAttribute('tabindex');
      } else {
        document.body.setAttribute('tabindex', prevTabindex);
      }
    }
  }

  // Clear any active selection ranges so the cursor is not placed in the document
  if (typeof window !== 'undefined' && window.getSelection) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      sel.removeAllRanges();
    }
  }

  const canvas = getEditorCanvas();
  if (canvas) {
    clearFormattedHighlights(canvas);
  }
  activeMatchIndex = -1;
  updateCountDisplay(-1, 0);

  // Restore scroll positions so the view stays exactly where it is without jumping
  if (viewport) {
    viewport.scrollTop = prevScrollTop;
    viewport.scrollLeft = prevScrollLeft;
  }
  if (rawTextarea) {
    rawTextarea.scrollTop = prevTextareaScrollTop;
  }
}

/**
 * Checks whether the find widget is currently visible.
 */
export function isFindWidgetOpen(): boolean {
  return isFindOpen;
}

/**
 * Refreshes find results when view mode or document changes.
 */
export function refreshFindIfOpen(): void {
  if (isFindOpen) {
    performFind();
  }
}

/**
 * Updates UI labels and placeholders according to the current language.
 */
export function updateFindWidgetLanguage(): void {
  const findInput = getFindInput();
  if (findInput) findInput.placeholder = tWebview('Suchen');

  const repInput = getFindReplaceInput();
  if (repInput) repInput.placeholder = tWebview('Ersetzen');

  const btnToggleRep = getBtnFindToggleReplace();
  if (btnToggleRep) {
    btnToggleRep.title = tWebview('Ersetzen ein-/ausblenden');
    btnToggleRep.setAttribute('aria-label', tWebview('Ersetzen ein-/ausblenden'));
  }

  const btnCase = getBtnFindCase();
  if (btnCase) {
    btnCase.title = tWebview('Groß-/Kleinschreibung beachten');
    btnCase.setAttribute('aria-label', tWebview('Groß-/Kleinschreibung beachten'));
  }

  const btnWord = getBtnFindWord();
  if (btnWord) {
    btnWord.title = tWebview('Nur ganzes Wort');
    btnWord.setAttribute('aria-label', tWebview('Nur ganzes Wort'));
  }

  const btnPrev = getBtnFindPrev();
  if (btnPrev) {
    btnPrev.title = tWebview('Vorheriges Ergebnis (Umschalt+Eingabe)');
    btnPrev.setAttribute('aria-label', tWebview('Vorheriges Ergebnis'));
  }

  const btnNext = getBtnFindNext();
  if (btnNext) {
    btnNext.title = tWebview('Nächstes Ergebnis (Eingabe)');
    btnNext.setAttribute('aria-label', tWebview('Nächstes Ergebnis'));
  }

  const btnClose = getBtnFindClose();
  if (btnClose) {
    btnClose.title = tWebview('Schließen (Esc)');
    btnClose.setAttribute('aria-label', tWebview('Schließen'));
  }

  const btnRep = getBtnReplace();
  if (btnRep) {
    btnRep.title = tWebview('Ersetzen');
    const span = btnRep.querySelector('span');
    if (span) span.textContent = tWebview('Ersetzen');
  }

  const btnRepAll = getBtnReplaceAll();
  if (btnRepAll) {
    btnRepAll.title = tWebview('Alles ersetzen');
    const span = btnRepAll.querySelector('span');
    if (span) span.textContent = tWebview('Alles ersetzen');
  }

  const btnToolbarFind = getBtnToolbarFind();
  if (btnToolbarFind) {
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
    btnToolbarFind.title = isMac ? tWebview('Suchen (Cmd+F)') : tWebview('Suchen (Ctrl+F)');
    btnToolbarFind.setAttribute('aria-label', tWebview('Suchen'));
  }

  if (isFindOpen) {
    const total = state.isRawMode ? rawMatches.length : formattedMatches.length;
    updateCountDisplay(activeMatchIndex, total);
  }
}

/**
 * Global keydown handler to intercept find shortcuts.
 */
export function handleGlobalFindShortcuts(e: KeyboardEvent): void {
  const hasMod = e.ctrlKey || e.metaKey;

  // Escape closes the find widget if open
  if (e.key === 'Escape' && isFindOpen) {
    e.preventDefault();
    e.stopPropagation();
    closeFindWidget();
    return;
  }

  // Ctrl+F / Cmd+F -> Open Find widget
  if (hasMod && (e.key.toLowerCase() === 'f' || e.code === 'KeyF') && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    openFindWidget(false);
    return;
  }

  // Ctrl+H (Win/Linux) or Cmd+Alt+F (Mac) or Cmd+H -> Open Find & Replace with replace row expanded
  const isReplaceShortcut =
    (hasMod && (e.key.toLowerCase() === 'h' || e.code === 'KeyH') && !e.shiftKey && !e.altKey) ||
    (e.metaKey && e.altKey && (e.key.toLowerCase() === 'f' || e.code === 'KeyF'));

  if (isReplaceShortcut) {
    e.preventDefault();
    e.stopPropagation();
    openFindWidget(true);
    return;
  }
}

/**
 * Initializes and wires up all event listeners for the Find & Replace widget.
 */
export function wireFindReplace(): void {
  const findInput = getFindInput();
  const replaceInput = getFindReplaceInput();
  const btnToggleReplace = getBtnFindToggleReplace();
  const btnCase = getBtnFindCase();
  const btnWord = getBtnFindWord();
  const btnPrev = getBtnFindPrev();
  const btnNext = getBtnFindNext();
  const btnClose = getBtnFindClose();
  const btnReplace = getBtnReplace();
  const btnReplaceAll = getBtnReplaceAll();
  const btnToolbarFind = getBtnToolbarFind();

  // Input typing in Find
  findInput?.addEventListener('input', () => {
    performFind(findInput.value);
  });

  findInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFindWidget();
    } else if (e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      toggleCaseSensitive();
    } else if (e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      toggleWholeWord();
    }
  });

  // Input typing in Replace
  replaceInput?.addEventListener('input', () => {
    currentReplaceText = replaceInput.value;
  });

  replaceInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) {
        replaceAll();
      } else {
        replaceCurrent();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFindWidget();
    }
  });

  // Toggle Replace
  btnToggleReplace?.addEventListener('click', () => {
    toggleReplaceRow();
  });

  // Options toggles
  btnCase?.addEventListener('click', () => {
    toggleCaseSensitive();
  });

  btnWord?.addEventListener('click', () => {
    toggleWholeWord();
  });

  // Navigation
  btnPrev?.addEventListener('click', () => {
    findPrevious();
  });

  btnNext?.addEventListener('click', () => {
    findNext();
  });

  // Close
  btnClose?.addEventListener('click', () => {
    closeFindWidget();
  });

  // Replace buttons
  btnReplace?.addEventListener('click', () => {
    replaceCurrent();
  });

  btnReplaceAll?.addEventListener('click', () => {
    replaceAll();
  });

  // Toolbar search button
  btnToolbarFind?.addEventListener('click', () => {
    openFindWidget(false);
  });

  // Track window resizing to ensure find widget is positioned below toolbar
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateFindWidgetPosition);
  }
  updateFindWidgetPosition();
}
