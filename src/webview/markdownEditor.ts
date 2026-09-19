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
import { handleBlockKeyboardGuards } from './keyboardGuards';
import {
  state,
  editorCanvas,
  rawTextarea,
  rawToggleBtn,
  errorBannerDismiss,
  showErrorBanner,
  hideErrorBanner,
  updateWordCount,
  emitEdit,
  emitCanvasEdit,
  getMarkdownFromCanvas,
  saveSelection,
  restoreSelection,
  vscode,
} from './editorState';

// -------------------------------------------------------------
// Core View Management
// -------------------------------------------------------------

/**
 * Wire up interactive click events for task checkboxes.
 */
export function wireTaskCheckboxes(): void {
  const checkboxes = editorCanvas.querySelectorAll<HTMLInputElement>('.task-checkbox');
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
  const { html, error } = safeMarkdownToHtml(markdown);
  if (error) {
    console.error('Agent Cowork Parser error in setContentFormatted:', error);
    state.hasParseError = true;
    state.currentMarkdown = markdown;
    rawTextarea.value = markdown;
    updateWordCount(markdown);
    showErrorBanner(
      'Warnung: Formatierungsfehler im Dokument. Um Datenverlust zu verhindern, wurde in den Quelltext-Modus gewechselt.'
    );
    // Switch to raw mode safely WITHOUT calling domToMarkdown(editorCanvas)
    if (!state.isRawMode) {
      state.isRawMode = true;
      editorCanvas.style.display = 'none';
      rawTextarea.style.display = 'block';
      rawToggleBtn.classList.add('is-active');
      rawToggleBtn.textContent = '📄 Formatiert';
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
  editorCanvas.innerHTML = html;
  rawTextarea.value = markdown;
  updateWordCount(markdown);
  wireTaskCheckboxes();
  wireTableInteractions(editorCanvas, () => emitCanvasEdit());
  return true;
}

/**
 * Toggles between Formatted View (default) and Raw Markdown source mode.
 */
export function toggleRawMode(): void {
  state.isRawMode = !state.isRawMode;

  if (state.isRawMode) {
    // Switch to Raw Mode
    const md = getMarkdownFromCanvas();
    if (md !== null) {
      rawTextarea.value = md;
      state.currentMarkdown = md;
    }
    editorCanvas.style.display = 'none';
    rawTextarea.style.display = 'block';
    rawToggleBtn.classList.add('is-active');
    rawToggleBtn.textContent = '📄 Formatiert';
    rawTextarea.focus();
  } else {
    // Switch to Formatted Mode
    const md = rawTextarea.value;
    const success = setContentFormatted(md);
    if (!success) {
      // Keep in raw mode if parsing failed
      state.isRawMode = true;
      editorCanvas.style.display = 'none';
      rawTextarea.style.display = 'block';
      rawToggleBtn.classList.add('is-active');
      rawToggleBtn.textContent = '📄 Formatiert';
      return;
    }
    rawTextarea.style.display = 'none';
    editorCanvas.style.display = 'block';
    rawToggleBtn.classList.remove('is-active');
    rawToggleBtn.textContent = '</> Raw';
    editorCanvas.focus();
    emitEdit(md);
  }
}

// -------------------------------------------------------------
// Canvas & Textarea Event Listeners
// -------------------------------------------------------------

errorBannerDismiss?.addEventListener('click', () => {
  hideErrorBanner();
});

editorCanvas.addEventListener('input', () => {
  emitCanvasEdit();
});

// Click listener on formatted editor canvas for table checkbox cells
editorCanvas.addEventListener('click', (e: MouseEvent) => {
  const cell = (e.target as HTMLElement).closest('.table-checkbox-cell') as HTMLElement | null;
  if (cell && editorCanvas.contains(cell)) {
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

// Paste listener to ensure formatting is always stripped and text is pasted as plain text
editorCanvas.addEventListener('paste', (e: ClipboardEvent) => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') ?? '';
  if (!text) {
    return;
  }

  // Use execCommand('insertText') to preserve native undo stack and proper selection replacement
  const success = document.execCommand('insertText', false, text);
  if (!success) {
    // Fallback using Selection/Range API if execCommand fails
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

// Raw textarea input listener
rawTextarea.addEventListener('input', () => {
  emitEdit(rawTextarea.value);
});

// Raw textarea Tab and Shift+Tab keydown listener
rawTextarea.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const result = e.shiftKey
      ? outdentRawText(rawTextarea.value, rawTextarea.selectionStart, rawTextarea.selectionEnd)
      : indentRawText(rawTextarea.value, rawTextarea.selectionStart, rawTextarea.selectionEnd);

    rawTextarea.value = result.value;
    rawTextarea.selectionStart = result.selectionStart;
    rawTextarea.selectionEnd = result.selectionEnd;
    emitEdit(rawTextarea.value);
  }
});

// Keyboard shortcuts inside formatted editor canvas
editorCanvas.addEventListener('keydown', (e: KeyboardEvent) => {
  if (handleBlockKeyboardGuards(e, editorCanvas, () => emitCanvasEdit())) {
    return;
  }

  // Tab / Shift+Tab for tables or list indentation / outdenting
  if (e.key === 'Tab') {
    if (handleTableKeyDown(e, editorCanvas, () => emitCanvasEdit())) {
      return;
    }

    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode;
      const li =
        anchorNode instanceof Element ? anchorNode.closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && editorCanvas.contains(li)) {
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
        anchorNode instanceof Element ? anchorNode.closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && editorCanvas.contains(li)) {
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

          const doc = editorCanvas.ownerDocument;
          const p = doc.createElement('p');
          p.className = 'editor-block';
          p.setAttribute('data-block-type', 'paragraph');
          p.innerHTML = '<br>';

          if (currentList && currentList.children.length === 0) {
            currentList.replaceWith(p);
          } else if (currentList) {
            currentList.after(p);
          } else {
            editorCanvas.appendChild(p);
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
          const newLi = document.createElement('li');
          newLi.className = 'task-item';
          newLi.setAttribute('data-checked', 'false');

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'task-checkbox';
          cb.contentEditable = 'false';

          const span = document.createElement('span');
          span.className = 'task-content';
          span.innerHTML = '<br>';

          newLi.appendChild(cb);
          newLi.appendChild(span);

          li.after(newLi);
          wireTaskCheckboxes();

          const range = document.createRange();
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
});

// Initialize toolbar wiring
wireToolbar({
  toggleRawMode,
  wireTaskCheckboxes,
});

// Initialize block focus and delete button handlers
wireBlockFocus(editorCanvas);
wireBlockDelete(editorCanvas, () => emitCanvasEdit());

// -------------------------------------------------------------
// Message Handling from Extension Host
// -------------------------------------------------------------

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'init': {
      setContentFormatted(message.text || '');
      break;
    }
    case 'update': {
      // Only update if not our own recent keystroke
      if (!state.isInternalChange && message.text !== state.currentMarkdown) {
        if (state.isRawMode) {
          rawTextarea.value = message.text || '';
          state.currentMarkdown = message.text || '';
          updateWordCount(state.currentMarkdown);
        } else {
          setContentFormatted(message.text || '');
        }
      }
      break;
    }
  }
});
