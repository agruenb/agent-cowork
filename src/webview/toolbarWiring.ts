import {
  state,
  coworkBtn,
  vscode,
  emitCanvasEdit,
  getEditorCanvas,
  getRawTextarea,
  getHeadingSelect,
  getRawToggleBtn,
} from './editorState';
import {
  toggleListBlock,
  indentActiveListItem,
  outdentActiveListItem,
  insertBlockElement,
  applyHeading,
  applyRawFormatting,
} from './toolbarOperations';
import { wireTableInteractions } from './tableInteractions';
import { getBlockDeleteBtnHtml } from '../markdown/parser';
import { handleCodeButtonClick } from './inlineCode';
import { tWebview, getWebviewLanguage } from './i18n';

export interface ToolbarHooks {
  toggleRawMode: () => void;
  wireTaskCheckboxes: () => void;
}

function focusCanvas(canvas: HTMLElement | null): void {
  if (canvas && typeof document !== 'undefined' && document.activeElement !== canvas && !canvas.contains(document.activeElement)) {
    canvas.focus();
  }
}

export function executeCommand(cmd: string, val: string = ''): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, cmd, val);
    return;
  }
  focusCanvas(canvas);
  if (cmd === 'strike') {
    document.execCommand('strikeThrough', false, val);
  } else if (cmd === 'quote') {
    const lang = getWebviewLanguage();
    const deleteBtn = getBlockDeleteBtnHtml(lang);
    const quoteHtml = `
      <div class="editor-block-container widget-block" data-block-type="blockquote" contenteditable="false">
        ${deleteBtn}
        <blockquote class="editor-block" data-block-type="blockquote" contenteditable="true">
          <p>${tWebview('Zitat...')}</p>
        </blockquote>
      </div>
      <p class="editor-block" data-block-type="paragraph"><br></p>
    `;
    insertBlockElement(canvas, quoteHtml, () => {
      emitCanvasEdit();
    });
    return;
  } else if (cmd === 'hr') {
    const lang = getWebviewLanguage();
    const deleteBtn = getBlockDeleteBtnHtml(lang);
    const hrHtml = `
      <div class="editor-block-container widget-block" data-block-type="hr" contenteditable="false">
        ${deleteBtn}
        <hr class="editor-block" data-block-type="hr">
      </div>
      <p class="editor-block" data-block-type="paragraph"><br></p>
    `;
    insertBlockElement(canvas, hrHtml, () => {
      emitCanvasEdit();
    });
    return;
  } else {
    document.execCommand(cmd, false, val);
  }
  emitCanvasEdit();
  updateToolbarActiveStates();
}

export function handleHeadingChange(val: string): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, 'heading', val);
    return;
  }
  applyHeading(canvas, val, () => {
    emitCanvasEdit();
    updateToolbarActiveStates();
  });
}

export function handleListToggle(
  type: 'bullet' | 'ordered' | 'task',
  wireTaskCheckboxes: () => void
): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, type);
    return;
  }
  toggleListBlock(canvas, type, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
    updateToolbarActiveStates();
  });
}

export function handleIndent(wireTaskCheckboxes: () => void): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, 'indent');
    return;
  }
  focusCanvas(canvas);
  indentActiveListItem(canvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

export function handleOutdent(wireTaskCheckboxes: () => void): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, 'outdent');
    return;
  }
  focusCanvas(canvas);
  outdentActiveListItem(canvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

export function insertTable(): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, 'table');
    return;
  }
  focusCanvas(canvas);
  const lang = getWebviewLanguage();
  const deleteBtn = getBlockDeleteBtnHtml(lang);
  const tableHtml = `
    <div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">
      ${deleteBtn}
      <div class="editor-block table-wrapper" data-block-type="table">
        <div class="table-scroll-wrapper">
          <table class="editor-table" contenteditable="true">
            <thead>
              <tr><th>${tWebview('Spalte 1')}</th><th>${tWebview('Spalte 2')}</th><th>${tWebview('Spalte 3')}</th></tr>
            </thead>
            <tbody>
              <tr><td>${tWebview('Inhalt 1')}</td><td>${tWebview('Inhalt 2')}</td><td>${tWebview('Inhalt 3')}</td></tr>
              <tr><td>${tWebview('Inhalt 4')}</td><td>${tWebview('Inhalt 5')}</td><td>${tWebview('Inhalt 6')}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  insertBlockElement(canvas, tableHtml, () => {
    wireTableInteractions(canvas, () => emitCanvasEdit());
    emitCanvasEdit();
  });
}

export function insertCodeBlock(): void {
  const textarea = getRawTextarea();
  const canvas = getEditorCanvas();
  if (state.isRawMode) {
    applyRawFormatting(textarea, 'code');
    return;
  }
  focusCanvas(canvas);
  const lang = getWebviewLanguage();
  const deleteBtn = getBlockDeleteBtnHtml(lang);
  const codeHtml = `
    <div class="editor-block-container widget-block" data-block-type="code_block" data-language="" contenteditable="false">
      ${deleteBtn}
      <div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="">
        <div class="code-block-header">
          <input type="text" class="code-lang-input" value="" placeholder="${tWebview('Code')}" title="${tWebview('Code-Typ bearbeiten')}" spellcheck="false" autocomplete="off" />
        </div>
        <pre><code class="editor-code" contenteditable="true">${tWebview('// Code hier eingeben...')}</code></pre>
      </div>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  insertBlockElement(canvas, codeHtml, () => {
    emitCanvasEdit();
  });
}

export function updateHeadingSelect(): void {
  const canvas = getEditorCanvas();
  const headingSel = getHeadingSelect();
  if (!canvas) {
    return;
  }
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    let node = selection.anchorNode;
    if (!node || (!canvas.contains(node) && node !== canvas)) {
      return;
    }
    while (node && node !== canvas) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (/^h[1-3]$/.test(tag)) {
          if (headingSel) {
            headingSel.value = tag;
          }
          return;
        }
      }
      node = node.parentNode;
    }
    if (headingSel) {
      headingSel.value = 'p';
    }
  }
}

export function updateToolbarActiveStates(): void {
  const canvas = getEditorCanvas();
  if (!canvas) return;

  const btnBold = document.getElementById('btn-bold');
  const btnItalic = document.getElementById('btn-italic');
  const btnStrike = document.getElementById('btn-strike');
  const btnQuote = document.getElementById('btn-quote');
  const btnTable = document.getElementById('btn-table');
  const btnCode = document.getElementById('btn-code');

  const setBtnActive = (btn: HTMLElement | null, active: boolean) => {
    if (btn) {
      btn.classList.toggle('is-active', active);
    }
  };

  if (state.isRawMode) {
    setBtnActive(btnBold, false);
    setBtnActive(btnItalic, false);
    setBtnActive(btnStrike, false);
    setBtnActive(btnQuote, false);
    setBtnActive(btnTable, false);
    setBtnActive(btnCode, false);
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    setBtnActive(btnBold, false);
    setBtnActive(btnItalic, false);
    setBtnActive(btnStrike, false);
    setBtnActive(btnQuote, false);
    setBtnActive(btnTable, false);
    setBtnActive(btnCode, false);
    return;
  }

  const anchorNode = selection.anchorNode;
  if (!anchorNode || (!canvas.contains(anchorNode) && anchorNode !== canvas)) {
    return;
  }

  let isBold = false;
  let isItalic = false;
  let isStrike = false;
  let isQuote = false;
  let isTable = false;
  let isCode = false;

  try {
    if (typeof document.queryCommandState === 'function') {
      isBold = document.queryCommandState('bold');
      isItalic = document.queryCommandState('italic');
      isStrike = document.queryCommandState('strikeThrough');
    }
  } catch {
    // Ignore queryCommandState errors
  }

  const nodesToCheck: Node[] = [];
  if (anchorNode) nodesToCheck.push(anchorNode);
  if (selection.focusNode && selection.focusNode !== anchorNode) {
    nodesToCheck.push(selection.focusNode);
  }

  for (const n of nodesToCheck) {
    let curr: Node | null = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
    while (curr && curr !== canvas && canvas.contains(curr)) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (tag === 'strong' || tag === 'b') isBold = true;
        if (tag === 'em' || tag === 'i') isItalic = true;
        if (tag === 'del' || tag === 's' || tag === 'strike') isStrike = true;
        if (tag === 'code' || el.classList.contains('code-block-wrapper') || el.dataset?.blockType === 'code_block') isCode = true;
        if (tag === 'blockquote' || el.dataset?.blockType === 'blockquote') isQuote = true;
        if (tag === 'table' || el.classList.contains('table-wrapper') || el.dataset?.blockType === 'table') isTable = true;
      }
      curr = curr.parentNode;
    }
  }

  setBtnActive(btnBold, isBold);
  setBtnActive(btnItalic, isItalic);
  setBtnActive(btnStrike, isStrike);
  setBtnActive(btnQuote, isQuote);
  setBtnActive(btnTable, isTable);
  setBtnActive(btnCode, isCode);
}

/**
 * Checks whether the toolbar is currently collapsed.
 */
export function isToolbarCollapsed(): boolean {
  const toolbar = document.querySelector('.toolbar');
  return toolbar ? toolbar.classList.contains('is-collapsed') : false;
}

/**
 * Sets the toolbar collapsed state, updates button ARIA and title attributes,
 * and persists the state in VS Code webview state.
 */
export function setToolbarCollapsed(collapsed: boolean): void {
  const toolbar = document.querySelector('.toolbar');
  const toggleBtn = document.getElementById('btn-toggle-toolbar');
  if (!toolbar) return;

  if (collapsed) {
    toolbar.classList.add('is-collapsed');
    if (toggleBtn) {
      toggleBtn.setAttribute('title', tWebview('Symbolleiste ausklappen'));
      toggleBtn.setAttribute('aria-label', tWebview('Symbolleiste ausklappen'));
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  } else {
    toolbar.classList.remove('is-collapsed');
    if (toggleBtn) {
      toggleBtn.setAttribute('title', tWebview('Symbolleiste einklappen'));
      toggleBtn.setAttribute('aria-label', tWebview('Symbolleiste einklappen'));
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }

  try {
    const prev = (vscode.getState() as Record<string, unknown> | null) || {};
    vscode.setState({ ...prev, isToolbarCollapsed: collapsed });
  } catch {
    // Ignore in environments where getState/setState is not supported
  }
}

/**
 * Toggles toolbar between collapsed and expanded states.
 */
export function toggleToolbarCollapse(): boolean {
  const nextState = !isToolbarCollapsed();
  setToolbarCollapsed(nextState);
  return nextState;
}

/**
 * Attaches all toolbar button listeners, select changes, and shortcuts.
 */
export function wireToolbar(hooks: ToolbarHooks): void {
  // Prevent mousedown on formatting toolbar buttons from blurring the editor selection
  document.querySelector('.toolbar')?.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button, .tb-btn');
    if (btn && btn.id !== 'btn-toggle-raw' && btn.id !== 'btn-cowork' && btn.id !== 'btn-toggle-toolbar') {
      e.preventDefault();
    }
  });

  // Hook up formatting toolbar buttons
  document.getElementById('btn-bold')?.addEventListener('click', () => executeCommand('bold'));
  document.getElementById('btn-italic')?.addEventListener('click', () => executeCommand('italic'));
  document.getElementById('btn-strike')?.addEventListener('click', () => executeCommand('strike'));
  document.getElementById('btn-bullet')?.addEventListener('click', () => handleListToggle('bullet', hooks.wireTaskCheckboxes));
  document.getElementById('btn-ordered')?.addEventListener('click', () => handleListToggle('ordered', hooks.wireTaskCheckboxes));
  document.getElementById('btn-task')?.addEventListener('click', () => handleListToggle('task', hooks.wireTaskCheckboxes));
  document.getElementById('btn-quote')?.addEventListener('click', () => executeCommand('quote'));
  document.getElementById('btn-table')?.addEventListener('click', () => insertTable());
  document.getElementById('btn-code')?.addEventListener('click', () => {
    const textarea = getRawTextarea();
    const canvas = getEditorCanvas();
    if (state.isRawMode) {
      applyRawFormatting(textarea, 'code');
    } else {
      handleCodeButtonClick(canvas, () => insertCodeBlock(), () => emitCanvasEdit());
    }
  });

  // Heading select
  const headingSel = getHeadingSelect();
  headingSel?.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    handleHeadingChange(target.value);
  });

  // Raw toggle
  const toggleBtn = getRawToggleBtn();
  toggleBtn?.addEventListener('click', () => {
    hooks.toggleRawMode();
  });

  // Cowork with AI button
  const cowork = document.getElementById('btn-cowork') || coworkBtn;
  cowork?.addEventListener('click', () => {
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
    vscode.postMessage({
      type: 'cowork',
    });
  });

  // Collapse / expand toolbar button
  const collapseBtn = document.getElementById('btn-toggle-toolbar');
  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToolbarCollapse();
  });

  // Expand toolbar when clicking anywhere on the collapsed bar
  document.querySelector('.toolbar')?.addEventListener('click', () => {
    if (isToolbarCollapsed()) {
      setToolbarCollapsed(false);
    }
  });

  // Restore saved collapse state if any
  try {
    const saved = vscode.getState() as { isToolbarCollapsed?: boolean } | null;
    if (saved && saved.isToolbarCollapsed) {
      setToolbarCollapsed(true);
    }
  } catch {
    // Ignore in environments where getState is not supported
  }

  // Update heading select value and toolbar active states based on selection change
  const onSelectionChange = () => {
    updateHeadingSelect();
    updateToolbarActiveStates();
  };
  document.addEventListener('selectionchange', onSelectionChange);

  const canvas = getEditorCanvas();
  canvas?.addEventListener('keyup', onSelectionChange);
  canvas?.addEventListener('mouseup', onSelectionChange);
}
