/**
 * Helpers for image paths stored in Markdown.
 *
 * Images are stored as paths relative to the Markdown file (always with `/`
 * separators and percent-encoded segments) so a folder can be moved together
 * with its images without breaking the links.
 */

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

let imageBaseUri = '';

/**
 * Sets the webview URI of the folder that contains the Markdown file.
 * Relative image paths are resolved against it.
 */
export function setImageBaseUri(uri: string): void {
  imageBaseUri = uri ? (uri.endsWith('/') ? uri : `${uri}/`) : '';
}

/**
 * Converts the path written in Markdown into a URL the webview can load.
 * Returns an empty string if the image cannot be resolved.
 */
export function resolveImageSrc(src: string): string {
  if (!src) return '';
  if (ABSOLUTE_URL.test(src)) return src;
  if (!imageBaseUri) return '';
  try {
    return new URL(src, imageBaseUri).toString();
  } catch {
    return '';
  }
}

/**
 * Builds the Markdown path for an image from a relative file-system path.
 * Segments are percent-encoded so spaces and parentheses do not break the syntax.
 */
export function toMarkdownImagePath(relativePath: string): string {
  return relativePath
    .split(/[\\/]/)
    .map((segment) => (segment === '..' || segment === '.' ? segment : encodeURIComponent(segment)))
    .join('/')
    .replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
}

/**
 * Human-readable form of a stored image path (percent-decoding undone).
 */
export function decodeImagePath(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
