import { safeMarkdownToHtml } from '../markdown/parser';
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

/**
 * Places caret at the end of a list item's text when the user clicks
 * in the empty line area to the right of the text.
 */
export function handleListItemClickOutsideText(e: MouseEvent, canvas: HTMLElement): boolean {
  if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return false;

  const target = e.target as HTMLElement | null;
  if (!target || !canvas.contains(target)) return false;

  // Don't interfere if clicking interactive elements
  if (target.closest('input, button, a, .widget-block, table, code, .block-delete-btn')) {
    return false;
  }

  const li = target.closest('li') as HTMLElement | null;
  if (!li || !canvas.contains(li)) return false;

  const doc = canvas.ownerDocument || document;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sel = win ? win.getSelection() : null;

  // Only adjust when selection is collapsed (user did not drag to highlight a range)
  if (sel && !sel.isCollapsed) return false;

  const isTask =
    li.classList.contains('task-item') ||
    li.querySelector(':scope > input[type="checkbox"]') !== null;
  const contentEl = ((isTask ? li.querySelector('.task-content') : li) as HTMLElement) || li;

  // Find non-sublist, non-input child nodes in contentEl
  const childNodes = Array.from(contentEl.childNodes).filter(
    (n) => n.nodeName !== 'UL' && n.nodeName !== 'OL' && n.nodeName !== 'INPUT'
  );
  if (childNodes.length === 0) return false;

  const firstNode = childNodes[0];
  const lastNode = childNodes[childNodes.length - 1];

  // If text is empty or only whitespace / <br>, nothing to adjust
  const textContent = childNodes.map((n) => n.textContent || '').join('').trim();
  if (!textContent) return false;

  try {
    const r = doc.createRange();
    r.setStartBefore(firstNode);
    r.setEndAfter(lastNode);

    const rects = r.getClientRects();
    const lastRect = rects.length > 0 ? rects[rects.length - 1] : r.getBoundingClientRect();

    // If click was to the right of the text content:
    if (lastRect && lastRect.right > 0 && e.clientX > lastRect.right - 2) {
      if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) {
        canvas.focus();
      }

      const newRange = doc.createRange();
      if (lastNode.nodeType === 3) {
        newRange.setStart(lastNode, (lastNode as Text).length);
        newRange.collapse(true);
      } else {
        newRange.setStartAfter(lastNode);
        newRange.collapse(true);
      }

      if (sel) {
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      // Prevent browser's default mousedown behavior which would misplace caret at (li, 0)
      e.preventDefault();
      return true;
    }
  } catch {
    // Ignore measurement or range errors
  }
  return false;
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

export function handleWindowMessage(event: MessageEvent): void {
  const message = event.data;
  const textarea = getRawTextarea();
  switch (message?.type) {
    case 'init': {
      if (message.language) {
        setWebviewLanguage(message.language);
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
        textarea?.focus();
      } else {
        const canvas = getEditorCanvas();
        canvas?.focus();
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

  // Immediately place caret at the end of the line on mousedown, preventing default start-of-line placement
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    handleListItemClickOutsideText(e, canvas);
  });

  canvas.addEventListener('mouseup', (e: MouseEvent) => {
    handleListItemClickOutsideText(e, canvas);
  });

  canvas.addEventListener('click', (e: MouseEvent) => {
    handleListItemClickOutsideText(e, canvas);
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

  // Focus textarea when clicking in empty document viewport space in raw mode
  const doc = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const viewport = doc?.querySelector('.document-viewport');
  viewport?.addEventListener('click', (e: Event) => {
    if (e.target === viewport) {
      if (state.isRawMode) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      } else {
        canvas.focus();
      }
    }
  });

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
