import { safeMarkdownToHtml } from '../markdown/parser';
import { safeDomToMarkdown } from '../markdown/serializer';
import {
  indentListItem,
  outdentListItem,
  indentRawText,
  outdentRawText,
} from '../markdown/listOperations';
import { wireTableInteractions, handleTableKeyDown } from './tableInteractions';
import {
  toggleListBlock,
  indentActiveListItem,
  outdentActiveListItem,
  insertBlockElement,
  applyHeading,
  applyRawFormatting,
} from './toolbarOperations';

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
 * Checks whether a markdown string contains any visible, readable text
 * beyond pure syntax characters (heading markers, list bullets, fences, etc.)
 * and whitespace. Used as a client-side guard against content erasure.
 */
function hasVisibleContent(markdown: string): boolean {
  if (!markdown) {
    return false;
  }
  let text = markdown;
  // Remove fenced code block markers
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[ \t]*\w*[ \t]*$/gm, '');
  // Remove horizontal rules
  text = text.replace(/^[ \t]*([-*_][ \t]*){3,}[ \t]*$/gm, '');
  // Remove table separator rows
  text = text.replace(/^[ \t]*\|?[ \t]*(:?-{2,}:?[ \t]*\|[ \t]*)*:?-{2,}:?[ \t]*\|?[ \t]*$/gm, '');
  // Remove heading markers
  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');
  // Remove blockquote markers
  text = text.replace(/^[ \t]*>+[ \t]*/gm, '');
  // Remove list markers
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*\d+[.)]\s+/gm, '');
  // Remove task checkbox markers
  text = text.replace(/\[[ xX]\]/g, '');
  // Remove inline formatting syntax
  text = text.replace(/[*_~`]/g, '');
  // Remove table pipe characters
  text = text.replace(/\|/g, '');
  // Remove link/image syntax brackets
  text = text.replace(/[[\]()!]/g, '');
  return text.trim().length > 0;
}

/**
 * Sends updated markdown text to the VS Code extension host.
 * @param markdown The serialized markdown text
 */
function emitEdit(markdown: string): void {
  // Safety guard: Suppress emitting edits from formatted mode if parser failed and canvas is corrupted
  if (hasParseError && !isRawMode) {
    console.warn('Agent Cowork: Suppressing edit emission due to active parser error.');
    return;
  }

  // Safety guard: Block edits that would erase all visible content from a document
  // that currently has visible content. This catches content loss at the source,
  // before the edit reaches the provider — covering raw textarea input, view mode
  // switches, and canvas mutations.
  if (hasVisibleContent(currentMarkdown) && !hasVisibleContent(markdown)) {
    console.warn('Agent Cowork: Blocked content-erasing edit in webview.');
    showErrorBanner(
      'Der gesamte Inhalt kann nicht gelöscht werden. Ihre Daten wurden geschützt.'
    );
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
  wireTableInteractions(editorCanvas, () => emitCanvasEdit());
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
  if (isRawMode) {
    applyRawFormatting(rawTextarea, cmd, val);
    return;
  }
  editorCanvas.focus();
  if (cmd === 'strike') {
    document.execCommand('strikeThrough', false, val);
  } else if (cmd === 'quote') {
    document.execCommand('formatBlock', false, '<blockquote>');
  } else if (cmd === 'hr') {
    document.execCommand('insertHorizontalRule', false, val);
  } else {
    document.execCommand(cmd, false, val);
  }
  emitCanvasEdit();
}

function handleHeadingChange(val: string): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, 'heading', val);
    return;
  }
  editorCanvas.focus();
  applyHeading(editorCanvas, val, () => emitCanvasEdit());
}

function handleListToggle(type: 'bullet' | 'ordered' | 'task'): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, type);
    return;
  }
  editorCanvas.focus();
  toggleListBlock(editorCanvas, type, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

function handleIndent(): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, 'indent');
    return;
  }
  editorCanvas.focus();
  indentActiveListItem(editorCanvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

function handleOutdent(): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, 'outdent');
    return;
  }
  editorCanvas.focus();
  outdentActiveListItem(editorCanvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

function insertTable(): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, 'table');
    return;
  }
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
  insertBlockElement(editorCanvas, tableHtml, () => {
    wireTableInteractions(editorCanvas, () => emitCanvasEdit());
    emitCanvasEdit();
  });
}

function insertCodeBlock(): void {
  if (isRawMode) {
    applyRawFormatting(rawTextarea, 'code');
    return;
  }
  editorCanvas.focus();
  const codeHtml = `
    <div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="markdown">
      <div class="code-block-header"><span>Markdown</span></div>
      <pre><code class="editor-code">// Code hier eingeben...</code></pre>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  insertBlockElement(editorCanvas, codeHtml, () => {
    emitCanvasEdit();
  });
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------

// Formatted canvas input listener
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
  // Tab / Shift+Tab for tables or list indentation / outdenting
  if (e.key === 'Tab') {
    if (handleTableKeyDown(e, editorCanvas, () => emitCanvasEdit())) {
      return;
    }

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

// Prevent mousedown on formatting toolbar buttons from blurring the editor selection
document.querySelector('.toolbar')?.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest('button, .tb-btn');
  if (btn && btn.id !== 'btn-toggle-raw' && btn.id !== 'btn-cowork') {
    e.preventDefault();
  }
});

// Hook up toolbar buttons
document.getElementById('btn-bold')?.addEventListener('click', () => executeCommand('bold'));
document.getElementById('btn-italic')?.addEventListener('click', () => executeCommand('italic'));
document.getElementById('btn-strike')?.addEventListener('click', () => executeCommand('strike'));
document.getElementById('btn-bullet')?.addEventListener('click', () => handleListToggle('bullet'));
document.getElementById('btn-ordered')?.addEventListener('click', () => handleListToggle('ordered'));
document.getElementById('btn-task')?.addEventListener('click', () => handleListToggle('task'));
document.getElementById('btn-outdent')?.addEventListener('click', () => handleOutdent());
document.getElementById('btn-indent')?.addEventListener('click', () => handleIndent());
document.getElementById('btn-quote')?.addEventListener('click', () => executeCommand('quote'));
document.getElementById('btn-table')?.addEventListener('click', () => insertTable());
document.getElementById('btn-code')?.addEventListener('click', () => insertCodeBlock());
document.getElementById('btn-hr')?.addEventListener('click', () => executeCommand('hr'));
document.getElementById('btn-undo')?.addEventListener('click', () => {
  if (isRawMode) {
    rawTextarea.focus();
    document.execCommand('undo');
  } else {
    executeCommand('undo');
  }
});
document.getElementById('btn-redo')?.addEventListener('click', () => {
  if (isRawMode) {
    rawTextarea.focus();
    document.execCommand('redo');
  } else {
    executeCommand('redo');
  }
});

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
