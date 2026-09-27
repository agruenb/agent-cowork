/**
 * Zero-dependency HTML and Markdown clipboard paste preprocessor for Agent Cowork.
 *
 * Ensures that Markdown-compatible formatting (headings, bold, italic, strikethrough,
 * inline code, code blocks, blockquotes, lists, task lists, tables, links, hr)
 * is maintained, while all incompatible formatting (colors, font-families,
 * font-sizes, margins, borders, shadows, and arbitrary styles) is stripped.
 */

import { domToMarkdown } from './serializer';
import { parseInlineMarkdown } from './parser';

export interface ProcessedPaste {
  /** The normalized Markdown representation of the pasted content */
  markdown: string;
  /** Whether the content is purely inline (single line / inline formatting only) */
  isInline: boolean;
}

/**
 * Returns a valid DOM Document in both browser and test (jsdom) environments.
 */
function getDocument(ownerDoc?: Document): Document {
  if (ownerDoc) {
    return ownerDoc;
  }
  if (typeof document !== 'undefined') {
    return document;
  }
  throw new Error('DOM Document is not available in this environment.');
}

/**
 * Checks whether an HTML string represents syntax-highlighted code editor tokens
 * (such as from VS Code, Monaco, Sublime, or Atom) rather than rich document text.
 */
export function isCodeEditorHtml(html: string): boolean {
  if (!html) {
    return false;
  }
  const hasMonospace = /font-family\s*:\s*[^;]*(monospace|consolas|courier|menlo)/i.test(html);
  const hasWhiteSpacePre = /white-space\s*:\s*pre/i.test(html);
  const hasVscode = /vscode-editor|data-vscode/i.test(html);
  const hasNoSemanticBlocks = !/<(h[1-6]|ul|ol|blockquote|table)\b/i.test(html);
  return (hasMonospace || hasWhiteSpacePre || hasVscode) && hasNoSemanticBlocks;
}

/**
 * Checks whether a Markdown string is purely inline content (e.g. bold word,
 * single line, inline link) rather than block structures (headings, lists, tables, etc.).
 */
export function isInlineMarkdown(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return true;
  }

  // Multiple paragraphs separated by blank lines are block-level
  if (/\n\s*\n/.test(trimmed)) {
    return false;
  }

  const lines = trimmed.split('\n');
  for (const line of lines) {
    const l = line.trim();
    // Headings: # Heading
    if (/^#{1,6}\s+/.test(l)) {
      return false;
    }
    // Horizontal rules: ---, ***, ___
    if (/^([-*_]){3,}\s*$/.test(l)) {
      return false;
    }
    // Blockquote: > text
    if (/^>\s*/.test(l)) {
      return false;
    }
    // Code block fences: ``` or ~~~
    if (/^(`{3,}|~{3,})/.test(l)) {
      return false;
    }
    // List items: - item, * item, + item, 1. item
    if (/^([-*+]|\d+[.)])\s+/.test(l)) {
      return false;
    }
    // Table rows: | ... |
    if (/^\|.+\|$/.test(l)) {
      return false;
    }
  }

  // Single line with no block markers is inline
  return lines.length <= 1;
}

/**
 * Preprocesses and sanitizes a raw HTML fragment into a clean semantic DOM tree.
 * Strips all style attributes, color attributes, font tags, custom classes,
 * scripts, and styles, while preserving and normalizing markdown-compatible structures.
 */
export function cleanHtmlToDom(html: string, ownerDoc?: Document): HTMLElement {
  const doc = getDocument(ownerDoc);
  const container = doc.createElement('div');
  container.innerHTML = html;

  // 1. Remove dangerous or non-content elements
  const blacklisted = container.querySelectorAll(
    'script, style, noscript, meta, link, svg, iframe, object, embed, applet, base, template'
  );
  blacklisted.forEach((el) => el.remove());

  // 2. Convert images to markdown text nodes before element stripping
  const images = Array.from(container.querySelectorAll('img'));
  images.forEach((img) => {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    if (src && !/^javascript:/i.test(src)) {
      const textNode = doc.createTextNode(`![${alt}](${src})`);
      img.replaceWith(textNode);
    } else {
      img.remove();
    }
  });

  // 3. Normalize whitespace in text nodes outside <pre> (standard HTML whitespace collapsing)
  const walker = doc.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
  let textNode: Node | null;
  let lastEndedWithSpace = true;

  while ((textNode = walker.nextNode())) {
    if (textNode.parentElement?.closest('pre, code')) {
      lastEndedWithSpace = false;
      continue;
    }

    let val = (textNode.nodeValue || '').replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
    if (lastEndedWithSpace && val.startsWith(' ')) {
      val = val.substring(1);
    }
    if (!val) {
      textNode.nodeValue = '';
      continue;
    }

    lastEndedWithSpace = val.endsWith(' ');
    textNode.nodeValue = val;
  }

  // 4. Process elements in reverse document order (leaves before ancestors)
  // to normalize inline styles (bold, italic, strikethrough, monospace) into semantic tags
  const elements = Array.from(container.querySelectorAll('*')).reverse();

  elements.forEach((el) => {
    if (!el.parentNode) {
      return;
    }

    const tagName = el.tagName.toLowerCase();
    const styleAttr = el.getAttribute('style') || '';
    const styleLower = styleAttr.toLowerCase();

    // Check for bold styles (e.g. font-weight: bold or >= 600)
    // Note: use (?:^|;|\s) to avoid matching mso-bidi-font-weight
    const hasExplicitNormal = /(?:^|;|\s)font-weight\s*:\s*(normal|[1-4]00)/i.test(styleLower);
    const isBold =
      /(?:^|;|\s)font-weight\s*:\s*(bold|[6-9]00)/i.test(styleLower) ||
      tagName === 'strong' ||
      (tagName === 'b' && !hasExplicitNormal);

    // Check for italic styles
    const isItalic =
      /(?:^|;|\s)font-style\s*:\s*(italic|oblique)/i.test(styleLower) ||
      tagName === 'em' ||
      tagName === 'i';

    // Check for strikethrough styles
    const isStrike =
      /(?:^|;|\s)text-decoration(?:-line)?\s*:\s*[^;]*line-through/i.test(styleLower) ||
      tagName === 'del' ||
      tagName === 's' ||
      tagName === 'strike';

    // Check for monospace code styles
    const isCode =
      tagName === 'code' ||
      tagName === 'kbd' ||
      tagName === 'samp' ||
      tagName === 'tt' ||
      (/(?:^|;|\s)font-family\s*:\s*[^;]*(monospace|consolas|courier|menlo)/i.test(styleLower) &&
        tagName !== 'pre' &&
        !el.closest('pre'));

    // Handle Google Docs normal-weight <b> tag
    if (tagName === 'b' && hasExplicitNormal) {
      unwrapElement(el);
      return;
    }

    // Handle generic <span>, <font>, or styled containers that have inline formatting
    if (tagName === 'span' || tagName === 'font') {
      let wrapper: HTMLElement | null = null;
      if (isBold) {
        wrapper = doc.createElement('strong');
      }
      if (isItalic) {
        const em = doc.createElement('em');
        if (wrapper) {
          wrapper.appendChild(em);
          wrapper = em;
        } else {
          wrapper = em;
        }
      }
      if (isStrike) {
        const del = doc.createElement('del');
        if (wrapper) {
          wrapper.appendChild(del);
          wrapper = del;
        } else {
          wrapper = del;
        }
      }
      if (isCode && !wrapper) {
        wrapper = doc.createElement('code');
      }

      if (wrapper) {
        // Move children into wrapper, and replace el with wrapper root
        let rootWrapper = wrapper;
        while (rootWrapper.parentNode) {
          rootWrapper = rootWrapper.parentNode as HTMLElement;
        }
        while (el.firstChild) {
          wrapper.appendChild(el.firstChild);
        }
        el.replaceWith(rootWrapper);
        return;
      } else {
        // No semantic meaning, unwrap the span/font
        unwrapElement(el);
        return;
      }
    }

    // Convert old tags: <b> -> <strong>, <i> -> <em>, <s>/<strike> -> <del>
    if (tagName === 'b') {
      const strong = doc.createElement('strong');
      while (el.firstChild) {
        strong.appendChild(el.firstChild);
      }
      el.replaceWith(strong);
      return;
    }
    if (tagName === 'i') {
      const em = doc.createElement('em');
      while (el.firstChild) {
        em.appendChild(el.firstChild);
      }
      el.replaceWith(em);
      return;
    }
    if (tagName === 's' || tagName === 'strike') {
      const del = doc.createElement('del');
      while (el.firstChild) {
        del.appendChild(el.firstChild);
      }
      el.replaceWith(del);
      return;
    }

    // Handle pre / code blocks: extract language class if present
    if (tagName === 'pre') {
      const codeEl = el.querySelector('code');
      let lang = '';
      const classes = (codeEl?.getAttribute('class') || '') + ' ' + (el.getAttribute('class') || '');
      const langMatch = classes.match(/(?:language|lang)-([a-zA-Z0-9_-]+)/i);
      if (langMatch) {
        lang = langMatch[1];
      }
      el.classList.add('code-block-wrapper');
      el.setAttribute('data-block-type', 'code_block');
      if (lang) {
        el.setAttribute('data-language', lang);
      }
    }

    // Handle table normalization: ensure thead and tbody exist
    if (tagName === 'table') {
      normalizeTable(el as HTMLTableElement, doc);
    }

    // Handle task lists from GitHub / markdown preview
    if (tagName === 'li') {
      const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb) {
        const isChecked = cb.checked || cb.hasAttribute('checked');
        el.setAttribute('data-checked', isChecked ? 'true' : 'false');
      }
    }

    // Normalize links: keep href (strip javascript:), remove everything else
    if (tagName === 'a') {
      const href = el.getAttribute('href') || '';
      if (!href || /^javascript:/i.test(href)) {
        unwrapElement(el);
        return;
      }
    }

    // Handle generic <div>: if it contains block children, unwrap it;
    // if it contains only inline children, treat as <p>
    if (tagName === 'div' && !el.classList.contains('code-block-wrapper')) {
      const hasBlockChild = el.querySelector(
        'p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, hr, pre'
      );
      if (!hasBlockChild) {
        const p = doc.createElement('p');
        while (el.firstChild) {
          p.appendChild(el.firstChild);
        }
        el.replaceWith(p);
        return;
      }
    }
  });

  // 4. Strip all style, color, font, class, and id attributes from remaining elements
  const remaining = Array.from(container.querySelectorAll('*'));
  remaining.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const isSpecialBlock =
      el.classList.contains('code-block-wrapper') || el.classList.contains('task-item');
    const checked = el.getAttribute('data-checked');
    const lang = el.getAttribute('data-language');
    const href = el.getAttribute('href');

    // Remove all attributes
    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }

    // Restore essential normalized attributes
    if (isSpecialBlock) {
      if (lang) {
        el.setAttribute('data-language', lang);
      }
      el.classList.add('code-block-wrapper');
      el.setAttribute('data-block-type', 'code_block');
    }
    if (checked !== null) {
      el.setAttribute('data-checked', checked);
    }
    if (tagName === 'a' && href) {
      el.setAttribute('href', href);
    }
    const parentChecked = el.parentElement?.getAttribute('data-checked');
    if (tagName === 'input' && parentChecked !== undefined && parentChecked !== null) {
      (el as HTMLInputElement).type = 'checkbox';
      if (parentChecked === 'true') {
        (el as HTMLInputElement).checked = true;
      }
    }
  });

  // 5. Wrap orphan top-level inline nodes in <p> blocks so they serialize with markdown syntax
  wrapTopLevelInlinesInParagraphs(container, doc);

  return container;
}

/**
 * Ensures any top-level inline nodes (text, strong, em, a, etc.) are wrapped in <p> blocks.
 */
function wrapTopLevelInlinesInParagraphs(container: HTMLElement, doc: Document): void {
  const blockTags = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'table',
    'blockquote',
    'pre',
    'hr',
    'div',
    'section',
    'article',
    'main',
  ]);

  let currentInlineNodes: Node[] = [];

  const flushInlines = () => {
    if (currentInlineNodes.length === 0) {
      return;
    }
    const hasText = currentInlineNodes.some(
      (n) => n.textContent && n.textContent.trim().length > 0
    );
    if (hasText) {
      const p = doc.createElement('p');
      const first = currentInlineNodes[0];
      container.insertBefore(p, first);
      currentInlineNodes.forEach((n) => p.appendChild(n));
    } else {
      currentInlineNodes.forEach((n) => n.parentNode?.removeChild(n));
    }
    currentInlineNodes = [];
  };

  const children = Array.from(container.childNodes);
  for (const child of children) {
    if (child.nodeType === 1 /* Element */) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (blockTags.has(tag)) {
        flushInlines();
        continue;
      }
    }
    currentInlineNodes.push(child);
  }
  flushInlines();
}

/**
 * Replaces an element with its child nodes in the DOM.
 */
function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) {
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  el.remove();
}

/**
 * Normalizes a table so that it has valid <thead> with <th> cells and <tbody> with <tr> cells.
 */
function normalizeTable(table: HTMLTableElement, doc: Document): void {
  let thead = table.querySelector('thead');
  let tbody = table.querySelector('tbody');

  // If table lacks thead, promote the first row to thead
  if (!thead) {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      thead = doc.createElement('thead');
      // Convert all td in the first row to th
      const cells = Array.from(firstRow.children);
      cells.forEach((cell) => {
        if (cell.tagName.toLowerCase() === 'td') {
          const th = doc.createElement('th');
          while (cell.firstChild) {
            th.appendChild(cell.firstChild);
          }
          cell.replaceWith(th);
        }
      });
      thead.appendChild(firstRow);
      table.insertBefore(thead, table.firstChild);
    }
  }

  // Ensure remaining rows are inside a tbody
  if (!tbody) {
    const remainingRows = Array.from(table.querySelectorAll('tr')).filter(
      (tr) => tr.parentNode !== thead
    );
    if (remainingRows.length > 0) {
      tbody = doc.createElement('tbody');
      remainingRows.forEach((r) => tbody?.appendChild(r));
      table.appendChild(tbody);
    }
  }
}

/**
 * Converts a raw HTML snippet into clean, standardized Markdown text.
 * All colors, font families, font sizes, margins, borders, and incompatible
 * formatting are stripped, while Markdown-supported formatting is maintained.
 */
export function cleanHtmlToMarkdown(html: string, ownerDoc?: Document): string {
  if (!html || !html.trim()) {
    return '';
  }
  const cleanDom = cleanHtmlToDom(html, ownerDoc);
  const markdown = domToMarkdown(cleanDom);
  return markdown.trim();
}

/**
 * Main clipboard paste processor.
 * Inspects both HTML and plain text clipboard data, determines the cleanest
 * representation, and returns the normalized Markdown string along with an
 * `isInline` indicator.
 */
export function processPastedContent(
  html: string | undefined | null,
  plainText: string | undefined | null,
  ownerDoc?: Document
): ProcessedPaste {
  const rawHtml = (html || '').trim();
  const rawText = (plainText || '').trim();

  // If HTML is present, check whether it is syntax tokens from a code editor
  if (rawHtml) {
    if (isCodeEditorHtml(rawHtml) && rawText) {
      // Code editor (VS Code, Monaco) clipboard: plainText contains the true source text
      return {
        markdown: rawText,
        isInline: isInlineMarkdown(rawText),
      };
    }

    // Rich text from browser, Google Docs, Word, Slack, etc.
    const convertedMd = cleanHtmlToMarkdown(rawHtml, ownerDoc);
    if (convertedMd) {
      return {
        markdown: convertedMd,
        isInline: isInlineMarkdown(convertedMd),
      };
    }
  }

  // Plain text fallback (or plain text clipboard with Markdown syntax)
  if (rawText) {
    return {
      markdown: rawText,
      isInline: isInlineMarkdown(rawText),
    };
  }

  return {
    markdown: '',
    isInline: true,
  };
}

/**
 * Formats an inline markdown string to HTML for insertion at a collapsed selection.
 */
export function getInlinePasteHtml(markdown: string): string {
  // Convert soft breaks to <br> for multi-line text inside paragraphs
  const lines = markdown.split('\n');
  return lines.map((line) => parseInlineMarkdown(line)).join('<br>');
}
