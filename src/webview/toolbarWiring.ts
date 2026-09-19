import {
  state,
  editorCanvas,
  rawTextarea,
  rawToggleBtn,
  headingSelect,
  coworkBtn,
  vscode,
  emitEdit,
  emitCanvasEdit,
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
import { BLOCK_DELETE_BTN_HTML } from '../markdown/parser';
import { handleCodeButtonClick } from './inlineCode';

export interface ToolbarHooks {
  toggleRawMode: () => void;
  wireTaskCheckboxes: () => void;
}

export function executeCommand(cmd: string, val: string = ''): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, cmd, val);
    return;
  }
  editorCanvas.focus();
  if (cmd === 'strike') {
    document.execCommand('strikeThrough', false, val);
  } else if (cmd === 'quote') {
    const quoteHtml = `
      <div class="editor-block-container widget-block" data-block-type="blockquote" contenteditable="false">
        ${BLOCK_DELETE_BTN_HTML}
        <blockquote class="editor-block" data-block-type="blockquote" contenteditable="true">
          <p>Zitat...</p>
        </blockquote>
      </div>
      <p class="editor-block" data-block-type="paragraph"><br></p>
    `;
    insertBlockElement(editorCanvas, quoteHtml, () => {
      emitCanvasEdit();
    });
    return;
  } else if (cmd === 'hr') {
    const hrHtml = `
      <div class="editor-block-container widget-block" data-block-type="hr" contenteditable="false">
        ${BLOCK_DELETE_BTN_HTML}
        <hr class="editor-block" data-block-type="hr">
      </div>
      <p class="editor-block" data-block-type="paragraph"><br></p>
    `;
    insertBlockElement(editorCanvas, hrHtml, () => {
      emitCanvasEdit();
    });
    return;
  } else {
    document.execCommand(cmd, false, val);
  }
  emitCanvasEdit();
}

export function handleHeadingChange(val: string): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, 'heading', val);
    return;
  }
  editorCanvas.focus();
  applyHeading(editorCanvas, val, () => emitCanvasEdit());
}

export function handleListToggle(
  type: 'bullet' | 'ordered' | 'task',
  wireTaskCheckboxes: () => void
): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, type);
    return;
  }
  editorCanvas.focus();
  toggleListBlock(editorCanvas, type, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

export function handleIndent(wireTaskCheckboxes: () => void): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, 'indent');
    return;
  }
  editorCanvas.focus();
  indentActiveListItem(editorCanvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

export function handleOutdent(wireTaskCheckboxes: () => void): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, 'outdent');
    return;
  }
  editorCanvas.focus();
  outdentActiveListItem(editorCanvas, () => {
    wireTaskCheckboxes();
    emitCanvasEdit();
  });
}

export function insertTable(): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, 'table');
    return;
  }
  editorCanvas.focus();
  const tableHtml = `
    <div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">
      ${BLOCK_DELETE_BTN_HTML}
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
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  insertBlockElement(editorCanvas, tableHtml, () => {
    wireTableInteractions(editorCanvas, () => emitCanvasEdit());
    emitCanvasEdit();
  });
}

export function insertCodeBlock(): void {
  if (state.isRawMode) {
    applyRawFormatting(rawTextarea, 'code');
    return;
  }
  editorCanvas.focus();
  const codeHtml = `
    <div class="editor-block-container widget-block" data-block-type="code_block" data-language="markdown" contenteditable="false">
      ${BLOCK_DELETE_BTN_HTML}
      <div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="markdown">
        <div class="code-block-header"><span>Markdown</span></div>
        <pre><code class="editor-code" contenteditable="true">// Code hier eingeben...</code></pre>
      </div>
    </div>
    <p class="editor-block" data-block-type="paragraph"><br></p>
  `;
  insertBlockElement(editorCanvas, codeHtml, () => {
    emitCanvasEdit();
  });
}

export function updateHeadingSelect(): void {
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
}

/**
 * Attaches all toolbar button listeners, select changes, and shortcuts.
 */
export function wireToolbar(hooks: ToolbarHooks): void {
  // Prevent mousedown on formatting toolbar buttons from blurring the editor selection
  document.querySelector('.toolbar')?.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button, .tb-btn');
    if (btn && btn.id !== 'btn-toggle-raw' && btn.id !== 'btn-cowork') {
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
  document.getElementById('btn-outdent')?.addEventListener('click', () => handleOutdent(hooks.wireTaskCheckboxes));
  document.getElementById('btn-indent')?.addEventListener('click', () => handleIndent(hooks.wireTaskCheckboxes));
  document.getElementById('btn-quote')?.addEventListener('click', () => executeCommand('quote'));
  document.getElementById('btn-table')?.addEventListener('click', () => insertTable());
  document.getElementById('btn-code')?.addEventListener('click', () => {
    if (state.isRawMode) {
      applyRawFormatting(rawTextarea, 'code');
    } else {
      handleCodeButtonClick(editorCanvas, () => insertCodeBlock(), () => emitCanvasEdit());
    }
  });
  document.getElementById('btn-hr')?.addEventListener('click', () => executeCommand('hr'));

  document.getElementById('btn-undo')?.addEventListener('click', () => {
    if (state.isRawMode) {
      rawTextarea.focus();
      document.execCommand('undo');
    } else {
      executeCommand('undo');
    }
  });

  document.getElementById('btn-redo')?.addEventListener('click', () => {
    if (state.isRawMode) {
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
    hooks.toggleRawMode();
  });

  // Cowork with AI button
  coworkBtn?.addEventListener('click', () => {
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

  // Update heading select value based on selection change
  document.addEventListener('selectionchange', updateHeadingSelect);
}
