import { safeDomToMarkdown } from '../markdown/serializer';
import { getWebviewLanguage } from './i18n';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export const vscode =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : {
        postMessage: () => {},
        getState: () => ({}),
        setState: () => {},
      };

// DOM elements with dynamic fallback for test environments
export const editorCanvas = (typeof document !== 'undefined'
  ? document.getElementById('editor')
  : null) as HTMLElement;

export const rawTextarea = (typeof document !== 'undefined'
  ? document.getElementById('raw-textarea')
  : null) as HTMLTextAreaElement;

export const rawWrapper = (typeof document !== 'undefined'
  ? document.getElementById('raw-wrapper')
  : null) as HTMLElement | null;

export const rawGutter = (typeof document !== 'undefined'
  ? document.getElementById('raw-gutter')
  : null) as HTMLElement | null;

export const rawMirror = (typeof document !== 'undefined'
  ? document.getElementById('raw-mirror')
  : null) as HTMLElement | null;

export const rawToggleBtn = (typeof document !== 'undefined'
  ? document.getElementById('btn-toggle-raw')
  : null) as HTMLButtonElement;

export const headingSelect = (typeof document !== 'undefined'
  ? document.getElementById('select-heading')
  : null) as HTMLSelectElement;

export const wordCountEl = (typeof document !== 'undefined'
  ? document.getElementById('word-count')
  : null) as HTMLElement;

export const coworkBtn = (typeof document !== 'undefined'
  ? document.getElementById('btn-cowork')
  : null) as HTMLButtonElement;

export const errorBanner = (typeof document !== 'undefined'
  ? document.getElementById('error-banner')
  : null) as HTMLElement | null;

export const errorBannerText = (typeof document !== 'undefined'
  ? document.getElementById('error-banner-text')
  : null) as HTMLElement | null;

export const errorBannerDismiss = (typeof document !== 'undefined'
  ? document.getElementById('error-banner-dismiss')
  : null) as HTMLButtonElement | null;

export const toolbarEl = (typeof document !== 'undefined'
  ? document.querySelector('.toolbar')
  : null) as HTMLElement | null;

export const toolbarToggleBtn = (typeof document !== 'undefined'
  ? document.getElementById('btn-toggle-toolbar')
  : null) as HTMLButtonElement | null;

export function getEditorCanvas(): HTMLElement {
  return (editorCanvas?.isConnected ? editorCanvas : (typeof document !== 'undefined' ? document.getElementById('editor') : null)) as HTMLElement;
}

export function getRawTextarea(): HTMLTextAreaElement {
  return (rawTextarea?.isConnected ? rawTextarea : (typeof document !== 'undefined' ? document.getElementById('raw-textarea') : null)) as HTMLTextAreaElement;
}

export function getRawWrapper(): HTMLElement | null {
  return (rawWrapper?.isConnected ? rawWrapper : (typeof document !== 'undefined' ? document.getElementById('raw-wrapper') : null)) as HTMLElement | null;
}

export function getRawGutter(): HTMLElement | null {
  return (rawGutter?.isConnected ? rawGutter : (typeof document !== 'undefined' ? document.getElementById('raw-gutter') : null)) as HTMLElement | null;
}

export function getRawMirror(): HTMLElement | null {
  return (rawMirror?.isConnected ? rawMirror : (typeof document !== 'undefined' ? document.getElementById('raw-mirror') : null)) as HTMLElement | null;
}

export function getRawToggleBtn(): HTMLButtonElement {
  return (rawToggleBtn?.isConnected ? rawToggleBtn : (typeof document !== 'undefined' ? document.getElementById('btn-toggle-raw') : null)) as HTMLButtonElement;
}

export function getHeadingSelect(): HTMLSelectElement {
  return (headingSelect?.isConnected ? headingSelect : (typeof document !== 'undefined' ? document.getElementById('select-heading') : null)) as HTMLSelectElement;
}

export function getWordCountEl(): HTMLElement | null {
  return (wordCountEl?.isConnected ? wordCountEl : (typeof document !== 'undefined' ? document.getElementById('word-count') : null)) as HTMLElement | null;
}

export function getErrorBanner(): HTMLElement | null {
  return (errorBanner?.isConnected ? errorBanner : (typeof document !== 'undefined' ? document.getElementById('error-banner') : null)) as HTMLElement | null;
}

export function getErrorBannerText(): HTMLElement | null {
  return (errorBannerText?.isConnected ? errorBannerText : (typeof document !== 'undefined' ? document.getElementById('error-banner-text') : null)) as HTMLElement | null;
}

export function getErrorBannerDismiss(): HTMLButtonElement | null {
  return (errorBannerDismiss?.isConnected ? errorBannerDismiss : (typeof document !== 'undefined' ? document.getElementById('error-banner-dismiss') : null)) as HTMLButtonElement | null;
}

export function getToolbarEl(): HTMLElement | null {
  return (toolbarEl?.isConnected ? toolbarEl : (typeof document !== 'undefined' ? document.querySelector('.toolbar') : null)) as HTMLElement | null;
}

export function getToolbarToggleBtn(): HTMLButtonElement | null {
  return (toolbarToggleBtn?.isConnected ? toolbarToggleBtn : (typeof document !== 'undefined' ? document.getElementById('btn-toggle-toolbar') : null)) as HTMLButtonElement | null;
}

/**
 * Auto-expands the raw textarea height to match its content scrollHeight, ensuring
 * the outer document viewport handles all scrolling naturally without an internal scrollbar.
 */
export function autoResizeRawTextarea(): void {
  const textarea = getRawTextarea();
  if (!textarea) return;

  const doc = textarea.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const viewport =
    textarea.closest('.document-viewport') ||
    (doc ? doc.querySelector('.document-viewport') : null);
  const prevScrollTop = viewport ? viewport.scrollTop : null;

  textarea.style.height = 'auto';
  const targetHeight = Math.max(textarea.scrollHeight, 500);
  textarea.style.height = `${targetHeight}px`;

  if (viewport && prevScrollTop !== null && viewport.scrollTop !== prevScrollTop) {
    viewport.scrollTop = prevScrollTop;
  }
}

// Editor State
export interface EditorState {
  isRawMode: boolean;
  currentMarkdown: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  isInternalChange: boolean;
  hasParseError: boolean;
}

export const state: EditorState = {
  isRawMode: false,
  currentMarkdown: '',
  debounceTimer: null,
  isInternalChange: false,
  hasParseError: false,
};

/**
 * Displays the error / warning banner in the editor.
 */
export function showErrorBanner(message: string): void {
  const banner = getErrorBanner();
  const textEl = getErrorBannerText();
  if (banner && textEl) {
    textEl.textContent = message;
    banner.style.display = 'flex';
  }
}

/**
 * Hides the error / warning banner in the editor.
 */
export function hideErrorBanner(): void {
  const banner = getErrorBanner();
  if (banner) {
    banner.style.display = 'none';
  }
}

/**
 * Updates word count display.
 */
export function updateWordCount(text: string): void {
  const clean = text.replace(/[#*`~>[\]()|_-]/g, ' ').trim();
  const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  const countEl = getWordCountEl();
  if (countEl) {
    const isEn = getWebviewLanguage() === 'en';
    const wordLabel = isEn ? (words === 1 ? 'word' : 'words') : (words === 1 ? 'Wort' : 'Wörter');
    countEl.textContent = `${words} ${wordLabel}`;
  }
}

/**
 * Checks whether a markdown string contains any visible, readable text
 * beyond pure syntax characters (heading markers, list bullets, fences, etc.)
 * and whitespace. Used as a client-side guard against content erasure.
 */
export function hasVisibleContent(markdown: string): boolean {
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
 * Safely converts editorCanvas DOM into Markdown with error handling and anomaly detection.
 * Returns null if serialization failed or produced an anomaly.
 */
export function getMarkdownFromCanvas(): string | null {
  if (state.hasParseError) {
    return null;
  }
  const canvas = getEditorCanvas();
  const { markdown, error } = safeDomToMarkdown(canvas);
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
 * Sends updated markdown text to the VS Code extension host.
 * @param markdown The serialized markdown text
 */
export function emitEdit(markdown: string): void {
  // Safety guard: Suppress emitting edits from formatted mode if parser failed and canvas is corrupted
  if (state.hasParseError && !state.isRawMode) {
    console.warn('Agent Cowork: Suppressing edit emission due to active parser error.');
    return;
  }

  // Safety guard: Block edits that would erase all visible content from a document
  // that currently has visible content. This catches content loss at the source,
  // before the edit reaches the provider — covering raw textarea input, view mode
  // switches, and canvas mutations.
  if (hasVisibleContent(state.currentMarkdown) && !hasVisibleContent(markdown)) {
    console.warn('Agent Cowork: Blocked content-erasing edit in webview.');
    showErrorBanner(
      'Der gesamte Inhalt kann nicht gelöscht werden. Ihre Daten wurden geschützt.'
    );
    return;
  }

  state.currentMarkdown = markdown;
  updateWordCount(markdown);

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    state.isInternalChange = true;
    vscode.postMessage({
      type: 'edit',
      text: state.currentMarkdown,
    });
    // Reset flag after brief delay
    setTimeout(() => {
      state.isInternalChange = false;
    }, 150);
  }, 250);
}

/**
 * Serializes the canvas and emits an edit if serialization succeeded.
 */
export function emitCanvasEdit(): void {
  const md = getMarkdownFromCanvas();
  if (md !== null) {
    emitEdit(md);
  }
}

/**
 * Saves the current window selection anchor container and offset.
 */
export function saveSelection(): { container: Node; offset: number } | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    return { container: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/**
 * Restores a previously saved selection.
 */
export function restoreSelection(saved: { container: Node; offset: number } | null): void {
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
