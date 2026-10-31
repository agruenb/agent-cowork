/**
 * Image widget behaviour: the "Select image" placeholder, the file picker round trip
 * with the extension host and the fallback shown for images that cannot be loaded.
 */

import { vscode } from './editorState';
import { resolveImageSrc, setImageBaseUri, decodeImagePath } from '../markdown/imagePath';
import { renderImage } from '../markdown/parser';
import { getWebviewLanguage } from './i18n';

let nextRequestId = 1;
const pendingRequests = new Map<number, HTMLElement>();

function findImageContainer(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.('.editor-block-container[data-block-type="image"]') ?? null;
}

/**
 * Asks the extension host to open a file picker for the given image block.
 */
export function requestImagePick(container: HTMLElement): void {
  const requestId = nextRequestId++;
  pendingRequests.set(requestId, container);
  vscode.postMessage({ type: 'pickImage', requestId });
}

/**
 * Applies the result of the file picker: swaps the placeholder for the chosen image.
 * `src` is the path relative to the Markdown file, as it is written to the document.
 */
export function applyPickedImage(
  requestId: number,
  src: string,
  alt: string,
  canvas: HTMLElement,
  emitEdit: () => void
): void {
  const container = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  if (!container || !canvas.contains(container) || !src) return;

  // Keep a hand-written alt text; a name derived from the previous file name is replaced
  const oldAlt = container.getAttribute('data-alt') || '';
  const oldName = decodeImagePath(container.getAttribute('data-src') || '')
    .split('/')
    .pop()
    ?.replace(/\.[^.]*$/, '');
  const keepAlt = oldAlt !== '' && oldAlt !== oldName;

  const replacement = document.createElement('div');
  replacement.innerHTML = renderImage(
    {
      type: 'image',
      src,
      alt: keepAlt ? oldAlt : alt,
      title: container.getAttribute('data-title') || undefined,
    },
    { lang: getWebviewLanguage() }
  );
  const fresh = replacement.firstElementChild as HTMLElement | null;
  if (!fresh) return;
  container.replaceWith(fresh);
  emitEdit();
}

/**
 * Re-resolves every image after the base URI of the document folder became known or changed.
 */
export function updateImageBaseUri(canvas: HTMLElement | null, baseUri: string): void {
  setImageBaseUri(baseUri);
  if (!canvas) return;
  canvas.querySelectorAll<HTMLImageElement>('.editor-block-container[data-block-type="image"] img').forEach((img) => {
    const container = findImageContainer(img);
    const resolved = resolveImageSrc(container?.getAttribute('data-src') || '');
    if (resolved && img.getAttribute('src') !== resolved) {
      img.setAttribute('src', resolved);
      img.hidden = false;
      container?.classList.remove('is-missing');
      container?.querySelector<HTMLElement>('.image-missing')?.setAttribute('hidden', '');
    }
  });
}

/**
 * Wires placeholder clicks and broken-image handling on the editor canvas.
 * Returns a cleanup function.
 */
export function wireImageBlocks(canvas: HTMLElement): () => void {
  const onClick = (e: MouseEvent) => {
    const replaceBtn = (e.target as HTMLElement | null)?.closest?.('.image-replace-btn');
    if (replaceBtn && canvas.contains(replaceBtn)) {
      const container = findImageContainer(replaceBtn);
      if (container) {
        e.preventDefault();
        requestImagePick(container);
      }
      return;
    }
    const placeholder = (e.target as HTMLElement | null)?.closest?.('.image-placeholder');
    if (!placeholder || !canvas.contains(placeholder)) return;
    const container = findImageContainer(placeholder);
    if (container) {
      e.preventDefault();
      requestImagePick(container);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const placeholder = (e.target as HTMLElement | null)?.closest?.('.image-placeholder');
    const container = placeholder ? findImageContainer(placeholder) : null;
    if (container) {
      e.preventDefault();
      requestImagePick(container);
    }
  };

  // Image load errors do not bubble, so they are caught in the capture phase.
  const onError = (e: Event) => {
    const img = e.target as HTMLElement | null;
    if (!img || img.tagName !== 'IMG') return;
    const container = findImageContainer(img);
    if (!container) return;
    container.classList.add('is-missing');
    img.hidden = true;
    container.querySelector<HTMLElement>('.image-missing')?.removeAttribute('hidden');
  };

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('error', onError, true);
  return () => {
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('error', onError, true);
  };
}
