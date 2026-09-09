import { safeMarkdownToHtml } from '../markdown/parser';
import { safeDomToMarkdown } from '../markdown/serializer';
import {
  indentListItem,
  outdentListItem,
  indentRawText,
  outdentRawText,
  isCursorAtStartOfListItem,
} from '../markdown/listOperations';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// DOM elements
const editorCanvas = document.getElementById('editor') as HTMLElement;
const rawTextarea = document.getElementById('raw-textarea') as HTMLTextAreaElement;
const rawToggleBtn = document.getElementById('btn-toggle-raw') as HTMLButtonElement;
const headingSelect = document.getElementById('select-heading') as HTMLSelectElement;
const wordCountEl = document.getElementById('word-count') as HTMLElement;
const coworkBtn = document.getElementById('btn-cowork') as HTMLButtonElement;
const errorBanner = document.getElementById('error-banner') as HTMLElement | null;
const errorBannerText = document.getElementById('error-banner-text') as HTMLElement | null;
const errorBannerDismiss = document.getElementById('error-banner-dismiss') as HTMLButtonElement | null;

let isRawMode = false;
let currentMarkdown = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInternalChange = false;
let hasParseError = false;

/**
 * Displays the error / warning banner in the editor.
 */
function showErrorBanner(message: string): void {
  if (errorBanner && errorBannerText) {
    errorBannerText.textContent = message;
    errorBanner.style.display = 'flex';
  }
}

/**
 * Hides the error / warning banner in the editor.
 */
function hideErrorBanner(): void {
  if (errorBanner) {
    errorBanner.style.display = 'none';
  }
}

errorBannerDismiss?.addEventListener('click', () => {
  hideErrorBanner();
});

/**
 * Checks if the current empty state is user-initiated (e.g. cleared canvas or raw textarea)
 * rather than a corrupted DOM or error state.
 */
function isUserInitiatedEmpty(): boolean {
  if (hasParseError) {
    return false;
  }
  if (isRawMode) {
    return rawTextarea.value.trim().length === 0;
  }
  return (editorCanvas.textContent || '').trim().length === 0;
}

/**
 * Safely converts editorCanvas DOM into Markdown with error handling and anomaly detection.
 * Returns null if serialization failed or produced an anomaly.
 */
function getMarkdownFromCanvas(): string | null {
  if (hasParseError) {
    return null;
  }
  const { markdown, error } = safeDomToMarkdown(editorCanvas);
  if (error) {
    console.error('Agent Cowork DOM Serializer anomaly/error:', error);
    showErrorBanner(
      'Fehler beim Konvertieren der Formatierung. Die Änderung wurde zum Schutz Ihrer Daten nicht gespeichert.'
    );
    vscode.postMessage({
      type: 'serializationError',
      error: error.message,
    });
    return null;
  }
  return markdown;
}

/**
 * Serializes the canvas and emits an edit if serialization succeeded.
 */
function emitCanvasEdit(): void {
  const md = getMarkdownFromCanvas();
  if (md !== null) {
    emitEdit(md);
  }
}

/**
 * Sends updated markdown text to the VS Code extension host.
 * @param markdown The serialized markdown text
 * @param isExplicitEmpty Whether this edit is an intentional, user-driven deletion of all text
 */
function emitEdit(markdown: string, isExplicitEmpty: boolean = false): void {
  // Safety guard: Suppress emitting edits from formatted mode if parser failed and canvas is corrupted
  if (hasParseError && !isRawMode) {
    console.warn('Agent Cowork: Suppressing edit emission due to active parser error.');
    return;
  }

  currentMarkdown = markdown;
  updateWordCount(markdown);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    isInternalChange = true;
    vscode.postMessage({
      type: 'edit',
      text: currentMarkdown,
      isExplicitEmpty: isExplicitEmpty || (currentMarkdown.trim().length === 0 && isUserInitiatedEmpty()),
    });
    // Reset flag after brief delay
    setTimeout(() => {
      isInternalChange = false;
    }, 150);
  }, 250);
}

/**
 * Updates word count display.
 */
function updateWordCount(text: string): void {
  const clean = text.replace(/[#*`~>[\]()|_-]/g, ' ').trim();
  const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  if (wordCountEl) {
    wordCountEl.textContent = `${words} ${words === 1 ? 'Wort' : 'Wörter'}`;
  }
}

/**
 * Renders markdown text into the formatted contenteditable canvas with safe error boundaries.
 * Returns true if parsing succeeded, or false if parser encountered an error and fell back.
 */
function setContentFormatted(markdown: string): boolean {
  const { html, error } = safeMarkdownToHtml(markdown);
  if (error) {
    console.error('Agent Cowork Parser error in setContentFormatted:', error);
    hasParseError = true;
    currentMarkdown = markdown;
    rawTextarea.value = markdown;
    updateWordCount(markdown);
    showErrorBanner(
      'Warnung: Formatierungsfehler im Dokument. Um Datenverlust zu verhindern, wurde in den Quelltext-Modus gewechselt.'
    );
    // Switch to raw mode safely WITHOUT calling domToMarkdown(editorCanvas)
    if (!isRawMode) {
      isRawMode = true;
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

  hasParseError = false;
  hideErrorBanner();
  currentMarkdown = markdown;
  editorCanvas.innerHTML = html;
  rawTextarea.value = markdown;
  updateWordCount(markdown);
  wireTaskCheckboxes();
  return true;
}

/**
 * Wire up interactive click events for task checkboxes.
 */
function wireTaskCheckboxes(): void {
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
 * Toggles between Formatted View (default) and Raw Markdown source mode.
 */
function toggleRawMode(): void {
  isRawMode = !isRawMode;

  if (isRawMode) {
    // Switch to Raw Mode
    const md = getMarkdownFromCanvas();
    if (md !== null) {
      rawTextarea.value = md;
      currentMarkdown = md;
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
      isRawMode = true;
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
// Toolbar Formatting Actions
// -------------------------------------------------------------

function executeCommand(cmd: string, val: string = ''): void {
  editorCanvas.focus();
  document.execCommand(cmd, false, val);
  emitCanvasEdit();
}

function handleHeadingChange(val: string): void {
  editorCanvas.focus();
  if (val === 'p') {
    document.execCommand('formatBlock', false, '<p>');
  } else {
    document.execCommand('formatBlock', false, `<${val}>`);
  }
  emitCanvasEdit();
}


function insertTaskItem(): void {
  editorCanvas.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const taskUl = document.createElement('ul');
  taskUl.className = 'editor-block task-list';
  taskUl.setAttribute('data-block-type', 'task_list');

  const taskLi = document.createElement('li');
  taskLi.className = 'task-item';
  taskLi.setAttribute('data-checked', 'false');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.contentEditable = 'false';

  const contentSpan = document.createElement('span');
  contentSpan.className = 'task-content';
  contentSpan.innerHTML = range.toString() || 'Aufgabe...';

  taskLi.appendChild(checkbox);
  taskLi.appendChild(contentSpan);
  taskUl.appendChild(taskLi);

  range.deleteContents();
  range.insertNode(taskUl);

  // Position cursor inside contentSpan
  const newRange = document.createRange();
  newRange.selectNodeContents(contentSpan);
  newRange.collapse(false);
  selection.removeAllRanges();
  selection.addRange(newRange);

  wireTaskCheckboxes();
  emitCanvasEdit();
}

function insertTable(): void {
  editorCanvas.focus();
  const tableHtml = `
    <div class="editor-block table-wrapper" data-block-type="table">
      <table class="editor-table">
        <thead>
          <tr><th>Spalte 1</th><th>Spalte 2</th><th>Spalte 3</th></tr>
        </thead>
        <tbody>
          <tr><td>Inhalt 1</td><td>Inhalt 2</td><td>Inhalt 3</td></tr>
          <tr><td>Inhalt 4</td><td>Inhalt 5</td><td>Inhalt 6</td></tr>
        </tbody>
      </table>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  document.execCommand('insertHTML', false, tableHtml);
  emitCanvasEdit();
}

function insertCodeBlock(): void {
  editorCanvas.focus();
  const codeHtml = `
    <div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="markdown">
      <div class="code-block-header"><span>Markdown</span></div>
      <pre><code class="editor-code">// Code hier eingeben...</code></pre>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  document.execCommand('insertHTML', false, codeHtml);
  emitCanvasEdit();
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------

// Formatted canvas input listener
editorCanvas.addEventListener('input', () => {
  emitCanvasEdit();
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

function saveSelection(): { container: Node; offset: number } | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    return { container: range.startContainer, offset: range.startOffset };
  }
  return null;
}

function restoreSelection(saved: { container: Node; offset: number } | null): void {
  if (!saved) return;
  const sel = window.getSelection();
  if (sel) {
    try {
      const range = document.createRange();
      const maxOffset = saved.container.textContent?.length || 0;
      range.setStart(saved.container, Math.min(saved.offset, maxOffset));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // Ignore if DOM node hierarchy shifted
    }
  }
}

// Raw textarea input listener
rawTextarea.addEventListener('input', () => {
  emitEdit(rawTextarea.value, rawTextarea.value.trim().length === 0);
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
  // Tab / Shift+Tab for list indentation / outdenting
  if (e.key === 'Tab') {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode;
      const li = anchorNode instanceof Element ? anchorNode.closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && editorCanvas.contains(li)) {
        if (e.shiftKey) {
          const saved = saveSelection();
          outdentListItem(li);
          wireTaskCheckboxes();
          restoreSelection(saved);
          emitCanvasEdit();
          return;
        }

        // Only indent the list item if cursor is at the beginning of the item or text is selected
        if (!selection.isCollapsed || isCursorAtStartOfListItem(li, selection)) {
          const saved = saveSelection();
          indentListItem(li);
          wireTaskCheckboxes();
          restoreSelection(saved);
          emitCanvasEdit();
          return;
        }

        // Inside list item but cursor is in the middle or at the end: insert 2 spaces
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
      const li = anchorNode instanceof Element ? anchorNode.closest('li') : anchorNode?.parentElement?.closest('li');
      if (li && editorCanvas.contains(li)) {
        const isTask =
          li.classList.contains('task-item') ||
          li.parentElement?.classList.contains('task-list') ||
          li.querySelector(':scope > input[type="checkbox"]') !== null;
        const contentEl = isTask ? (li.querySelector('.task-content') || li) : li;
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
          if (currentList && currentList.children.length === 0) {
            currentList.remove();
          }

          const p = document.createElement('p');
          p.className = 'editor-block';
          p.setAttribute('data-block-type', 'paragraph');
          p.innerHTML = '<br>';
          if (currentList && currentList.parentNode) {
            currentList.parentNode.insertBefore(p, currentList.nextSibling);
          } else {
            editorCanvas.appendChild(p);
          }
          const range = document.createRange();
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

// Hook up toolbar buttons
document.getElementById('btn-bold')?.addEventListener('click', () => executeCommand('bold'));
document.getElementById('btn-italic')?.addEventListener('click', () => executeCommand('italic'));
document.getElementById('btn-strike')?.addEventListener('click', () => executeCommand('strikeThrough'));
document.getElementById('btn-bullet')?.addEventListener('click', () => executeCommand('insertUnorderedList'));
document.getElementById('btn-ordered')?.addEventListener('click', () => executeCommand('insertOrderedList'));
document.getElementById('btn-task')?.addEventListener('click', () => insertTaskItem());
document.getElementById('btn-quote')?.addEventListener('click', () => executeCommand('formatBlock', '<blockquote>'));
document.getElementById('btn-table')?.addEventListener('click', () => insertTable());
document.getElementById('btn-code')?.addEventListener('click', () => insertCodeBlock());
document.getElementById('btn-hr')?.addEventListener('click', () => executeCommand('insertHorizontalRule'));
document.getElementById('btn-undo')?.addEventListener('click', () => executeCommand('undo'));
document.getElementById('btn-redo')?.addEventListener('click', () => executeCommand('redo'));

// Heading select
headingSelect?.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  handleHeadingChange(target.value);
});

// Raw toggle
rawToggleBtn?.addEventListener('click', () => {
  toggleRawMode();
});

// Cowork with AI button
coworkBtn?.addEventListener('click', () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (!hasParseError || isRawMode) {
      isInternalChange = true;
      vscode.postMessage({
        type: 'edit',
        text: currentMarkdown,
        isExplicitEmpty: currentMarkdown.trim().length === 0 && isUserInitiatedEmpty(),
      });
      setTimeout(() => {
        isInternalChange = false;
      }, 150);
    }
  }
  vscode.postMessage({
    type: 'cowork',
  });
});

// Update heading select value based on selection change
document.addEventListener('selectionchange', () => {
  if (!editorCanvas.contains(document.activeElement)) {
    return;
  }
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    let node = selection.anchorNode;
    while (node && node !== editorCanvas) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (/^h[1-3]$/.test(tag)) {
          if (headingSelect) {
            headingSelect.value = tag;
          }
          return;
        }
      }
      node = node.parentNode;
    }
    if (headingSelect) {
      headingSelect.value = 'p';
    }
  }
});

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
      if (!isInternalChange && message.text !== currentMarkdown) {
        if (isRawMode) {
          rawTextarea.value = message.text || '';
          currentMarkdown = message.text || '';
          updateWordCount(currentMarkdown);
        } else {
          setContentFormatted(message.text || '');
        }
      }
      break;
    }
  }
});
