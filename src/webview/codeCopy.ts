/**
 * Clipboard copy functionality for code blocks (snippets) and inline code.
 */

import { vscode } from './editorState';
import { tWebview } from './i18n';

export const COPY_ICON_SVG = `<svg class="copy-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/>
  <path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/>
</svg>`;

export const CHECK_ICON_SVG = `<svg class="check-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
</svg>`;

export const COPY_ICON_SMALL_SVG = `<svg class="copy-icon" width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/>
  <path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/>
</svg>`;

export const CHECK_ICON_SMALL_SVG = `<svg class="check-icon" width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
</svg>`;

/**
 * Copies text to clipboard via navigator.clipboard, execCommand fallback, and vscode.postMessage.
 */
export async function copyToClipboard(text: string, doc?: Document): Promise<boolean> {
  let copied = false;
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  const win = targetDoc?.defaultView || (typeof window !== 'undefined' ? window : null);
  const nav = win?.navigator || (typeof navigator !== 'undefined' ? navigator : null);

  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      copied = true;
    } catch {
      // Browser permission or focus restriction
    }
  }

  if (!copied && targetDoc) {
    try {
      const textarea = targetDoc.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      targetDoc.body.appendChild(textarea);
      textarea.select();
      targetDoc.execCommand('copy');
      textarea.remove();
      copied = true;
    } catch {
      // Ignored
    }
  }

  // Also notify VS Code extension host to write to system clipboard
  if (vscode && typeof vscode.postMessage === 'function') {
    try {
      vscode.postMessage({ type: 'copy', text });
    } catch {
      // Ignored
    }
  }

  return copied;
}

/**
 * Returns HTML string for the code block copy button.
 */
export function getCodeBlockCopyBtnHtml(): string {
  const title = tWebview('Code kopieren');
  return `<button type="button" class="code-copy-btn" title="${title}" aria-label="${title}" tabindex="-1">${COPY_ICON_SVG}</button>`;
}

const feedbackTimeouts = new WeakMap<HTMLElement, NodeJS.Timeout>();

/**
 * Shows temporary checkmark / copied state on a button.
 */
export function showCopiedFeedback(btn: HTMLElement, isSmall = false): void {
  const existingTimeout = feedbackTimeouts.get(btn);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  btn.classList.add('is-copied');
  btn.innerHTML = isSmall ? CHECK_ICON_SMALL_SVG : CHECK_ICON_SVG;
  const copiedLabel = tWebview('Kopiert!');
  btn.title = copiedLabel;
  btn.setAttribute('aria-label', copiedLabel);

  const timeout = setTimeout(() => {
    btn.classList.remove('is-copied');
    btn.innerHTML = isSmall ? COPY_ICON_SMALL_SVG : COPY_ICON_SVG;
    const defaultLabel = tWebview('Code kopieren');
    btn.title = defaultLabel;
    btn.setAttribute('aria-label', defaultLabel);
    feedbackTimeouts.delete(btn);
  }, 1800);

  feedbackTimeouts.set(btn, timeout);
}

/**
 * Ensures all .code-block-wrapper elements inside root have a .code-copy-btn.
 */
export function wireCodeBlockCopyButtons(root: HTMLElement): void {
  const wrappers = root.querySelectorAll<HTMLElement>('.code-block-wrapper');
  wrappers.forEach((wrapper) => {
    const header = wrapper.querySelector<HTMLElement>('.code-block-header');
    if (header && !header.querySelector('.code-copy-btn')) {
      const btn = wrapper.ownerDocument.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      const title = tWebview('Code kopieren');
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.tabIndex = -1;
      btn.innerHTML = COPY_ICON_SVG;
      header.appendChild(btn);
    }
  });
}

/**
 * Wires click and mousedown listeners for code block copy buttons on the editor canvas.
 */
export function wireCodeBlockCopy(canvas: HTMLElement): void {
  wireCodeBlockCopyButtons(canvas);

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn');
    if (btn && canvas.contains(btn)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  canvas.addEventListener('click', async (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLElement | null;
    if (btn && canvas.contains(btn)) {
      e.preventDefault();
      e.stopPropagation();

      const wrapper = btn.closest<HTMLElement>('.code-block-wrapper');
      if (wrapper) {
        const codeEl =
          wrapper.querySelector<HTMLElement>('code.editor-code') ||
          wrapper.querySelector<HTMLElement>('pre code');
        const text = codeEl ? (codeEl.textContent || '') : '';
        await copyToClipboard(text, canvas.ownerDocument);
        showCopiedFeedback(btn, false);
      }
    }
  });
}

let activeInlineCodeBtn: HTMLElement | null = null;
let currentTargetCodeEl: HTMLElement | null = null;
let inlineHideTimeout: NodeJS.Timeout | null = null;

/**
 * Initializes the floating copy button for inline code elements.
 */
export function initInlineCodeCopy(canvas: HTMLElement, container?: HTMLElement): void {
  const doc = canvas.ownerDocument;
  const parent = container || doc.querySelector('.document-viewport') || doc.body;

  let btn = doc.getElementById('inline-code-copy-btn');
  if (!btn) {
    btn = doc.createElement('button');
    btn.id = 'inline-code-copy-btn';
    btn.className = 'inline-code-copy-btn';
    btn.setAttribute('type', 'button');
    btn.tabIndex = -1;
    const title = tWebview('Code kopieren');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = COPY_ICON_SMALL_SVG;
    parent.appendChild(btn);
  }

  activeInlineCodeBtn = btn;

  const hideInlineBtn = () => {
    if (activeInlineCodeBtn) {
      activeInlineCodeBtn.classList.remove('is-visible');
    }
    currentTargetCodeEl = null;
  };

  const showInlineBtnFor = (codeEl: HTMLElement) => {
    if (!activeInlineCodeBtn) return;
    currentTargetCodeEl = codeEl;

    if (inlineHideTimeout) {
      clearTimeout(inlineHideTimeout);
      inlineHideTimeout = null;
    }

    const rects = codeEl.getClientRects();
    const rect = rects.length > 0 ? rects[rects.length - 1] : codeEl.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideInlineBtn();
      return;
    }

    const win = doc.defaultView || window;
    const top = rect.top < 22 ? rect.bottom + 2 : rect.top - 14;
    const left = Math.max(4, Math.min((win.innerWidth || 800) - 24, rect.right - 8));

    activeInlineCodeBtn.style.top = `${top}px`;
    activeInlineCodeBtn.style.left = `${left}px`;
    activeInlineCodeBtn.classList.add('is-visible');
  };

  // Canvas mouse interactions
  canvas.addEventListener('mouseover', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const codeEl = target?.closest('code.inline-code:not(.editor-code)') as HTMLElement | null;
    if (codeEl && canvas.contains(codeEl)) {
      showInlineBtnFor(codeEl);
    }
  });

  canvas.addEventListener('mouseout', (e: MouseEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && (related === activeInlineCodeBtn || activeInlineCodeBtn?.contains(related))) {
      return;
    }
    const target = e.target as HTMLElement | null;
    const codeEl = target?.closest('code.inline-code:not(.editor-code)') as HTMLElement | null;
    if (codeEl) {
      if (inlineHideTimeout) clearTimeout(inlineHideTimeout);
      inlineHideTimeout = setTimeout(() => {
        hideInlineBtn();
      }, 250);
    }
  });

  // Floating button mouse interactions
  activeInlineCodeBtn.addEventListener('mouseenter', () => {
    if (inlineHideTimeout) {
      clearTimeout(inlineHideTimeout);
      inlineHideTimeout = null;
    }
  });

  activeInlineCodeBtn.addEventListener('mouseleave', () => {
    hideInlineBtn();
  });

  activeInlineCodeBtn.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  });

  activeInlineCodeBtn.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentTargetCodeEl && activeInlineCodeBtn) {
      const text = currentTargetCodeEl.textContent || '';
      await copyToClipboard(text, doc);
      showCopiedFeedback(activeInlineCodeBtn, true);
    }
  });

  // Hide floating button on scroll, typing, or click elsewhere
  const viewport = doc.querySelector('.document-viewport');
  viewport?.addEventListener('scroll', () => hideInlineBtn(), { passive: true });
  canvas.addEventListener('input', () => hideInlineBtn());
  canvas.addEventListener('keydown', () => hideInlineBtn());
  doc.addEventListener('click', (e: MouseEvent) => {
    if (e.target !== activeInlineCodeBtn && !activeInlineCodeBtn?.contains(e.target as Node)) {
      if (e.target !== currentTargetCodeEl && !currentTargetCodeEl?.contains(e.target as Node)) {
        hideInlineBtn();
      }
    }
  });
}

/**
 * Updates copy button titles and accessibility labels after language switch.
 */
export function updateCodeCopyLanguage(doc: Document = document): void {
  const defaultLabel = tWebview('Code kopieren');
  const codeBtns = doc.querySelectorAll<HTMLElement>('.code-copy-btn:not(.is-copied)');
  codeBtns.forEach((btn) => {
    btn.title = defaultLabel;
    btn.setAttribute('aria-label', defaultLabel);
  });

  const inlineBtn = doc.getElementById('inline-code-copy-btn');
  if (inlineBtn && !inlineBtn.classList.contains('is-copied')) {
    inlineBtn.title = defaultLabel;
    inlineBtn.setAttribute('aria-label', defaultLabel);
  }
}
