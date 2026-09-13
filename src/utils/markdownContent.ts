/**
 * Checks whether a Markdown string contains any visible, readable content
 * beyond pure syntax characters and whitespace.
 *
 * This strips heading markers, list bullets, task checkboxes, code fences,
 * blockquote markers, horizontal rules, table pipes/separators, and inline
 * formatting markers, then checks if any actual text remains.
 *
 * Used by the provider-level safety guard to catch content deletion even when
 * residual markdown syntax (e.g. `\n`, `---`, empty `# `) is still present.
 */
export function hasVisibleContent(markdown: string): boolean {
  if (!markdown) {
    return false;
  }

  let text = markdown;

  // Remove fenced code block markers (``` or ~~~, with optional language tag)
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[ \t]*\w*[ \t]*$/gm, '');

  // Remove horizontal rules (---, ***, ___ with optional spaces)
  text = text.replace(/^[ \t]*([-*_][ \t]*){3,}[ \t]*$/gm, '');

  // Remove table separator rows (| --- | --- |)
  text = text.replace(/^[ \t]*\|?[ \t]*(:?-{2,}:?[ \t]*\|[ \t]*)*:?-{2,}:?[ \t]*\|?[ \t]*$/gm, '');

  // Remove heading markers (# ## ### etc.)
  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');

  // Remove blockquote markers (> at line start)
  text = text.replace(/^[ \t]*>+[ \t]*/gm, '');

  // Remove list markers (-, *, +, 1., 2., etc.)
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*\d+[.)]\s+/gm, '');

  // Remove task checkbox markers ([ ] or [x])
  text = text.replace(/\[[ xX]\]/g, '');

  // Remove inline formatting syntax: bold, italic, strikethrough, inline code
  text = text.replace(/[*_~`]/g, '');

  // Remove table pipe characters
  text = text.replace(/\|/g, '');

  // Remove link/image syntax brackets and parens (but keep the text inside)
  text = text.replace(/[[\]()!]/g, '');

  // Now check if any non-whitespace characters remain
  return text.trim().length > 0;
}
