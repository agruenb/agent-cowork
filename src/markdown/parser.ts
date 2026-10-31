/**
 * Zero-dependency Markdown to HTML parser designed for the Agent Cowork
 * formatted and editable document view.
 */

import { renderMermaidPreviewHtml } from '../mermaid';
import { resolveImageSrc } from './imagePath';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses inline markdown elements (bold, italic, strikethrough, code, links)
 * into safe HTML spans.
 */
export function parseInlineMarkdown(text: string): string {
  let result = escapeHtml(text);

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold + Italic: ***text*** or ___text___
  result = result.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  result = result.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic: *text* or _text_ (avoid matching mid_word_identifiers)
  result = result.replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1<em>$2</em>$3');
  result = result.replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1<em>$2</em>$3');

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Links with angle brackets: [label](<url>) or [label](<url> "title")
  result = result.replace(
    /(?<!!)\[([^\]]+)\]\(\s*&lt;([\s\S]+?)&gt;(?:\s+(&quot;[\s\S]*?&quot;|'[\s\S]*?'|\([\s\S]*?\)))?\s*\)/g,
    (_match, label, href, title) => {
      const cleanTitle = title ? title.replace(/^(&quot;|'|\()|(&quot;|'|\))$/g, '') : '';
      const titleAttr = cleanTitle ? ` title="${cleanTitle}" data-title="true"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" class="editor-link" data-angle-brackets="true">${label}</a>`;
    }
  );

  // Standard links: [label](url) or [label](url "title")
  result = result.replace(
    /(?<!!)\[([^\]]+)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+(&quot;[\s\S]*?&quot;|'[\s\S]*?'|\([\s\S]*?\)))?\s*\)/g,
    (_match, label, href, title) => {
      const cleanTitle = title ? title.replace(/^(&quot;|'|\()|(&quot;|'|\))$/g, '') : '';
      const titleAttr = cleanTitle ? ` title="${cleanTitle}" data-title="true"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" class="editor-link">${label}</a>`;
    }
  );

  return result;
}

/**
 * Checks whether a markdown line is a table delimiter row (e.g. |---|---| or ---|---).
 */
export function isTableDelimiterRow(line: string): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '').trim();
  if (!stripped) return false;
  const cells = stripped.split('|');
  return (
    cells.length >= 1 &&
    cells.every((c) => {
      const t = c.trim();
      return t.length > 0 && /^:?-+:?$/.test(t);
    })
  );
}

/**
 * Splits a markdown table row into individual cell strings.
 * Respects escaped pipes (\|).
 */
export function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

/**
 * Fenced code block information.
 */
export interface FenceInfo {
  char: '`' | '~';
  length: number;
  info: string;
}

/**
 * Checks whether a line starts a fenced code block (``` or ~~~).
 */
export function matchFence(line: string): FenceInfo | null {
  if (!line) return null;
  const trimmed = line.trim();
  const match = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  const fenceStr = match[1];
  const char = fenceStr[0] as '`' | '~';
  const info = match[2].trim();
  return {
    char,
    length: fenceStr.length,
    info,
  };
}

/**
 * Checks whether a line closes an open code block fence.
 */
export function isFenceClose(line: string, openFence: FenceInfo): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  const match = trimmed.match(/^(`{3,}|~{3,})\s*$/);
  if (!match) return false;
  const fenceStr = match[1];
  return fenceStr[0] === openFence.char && fenceStr.length >= openFence.length;
}

/**
 * Matches a line that consists solely of an image: `![alt](src "title")`.
 * An empty `![]()` is the placeholder for an image that has not been chosen yet.
 */
export function matchImageLine(line: string): { alt: string; src: string; title?: string } | null {
  const m = line
    .trim()
    .match(/^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^\s)]*))(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/);
  if (!m) return null;
  return { alt: m[1], src: m[2] ?? m[3] ?? '', title: m[4] ?? m[5] };
}

export interface MarkdownListItem {
  text: string;
  checked?: boolean;
  children?: MarkdownBlock[];
  line?: number;
  diffType?: 'same' | 'added' | 'removed' | 'modified';
  oldChecked?: boolean;
  diffHtml?: string;
  value?: number;
}

export interface MarkdownBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'code_block'
    | 'blockquote'
    | 'task_list'
    | 'unordered_list'
    | 'ordered_list'
    | 'table'
    | 'hr'
    | 'image';
  level?: number;
  content?: string;
  items?: MarkdownListItem[];
  language?: string;
  headers?: string[];
  rows?: string[][];
  startLine?: number;
  endLine?: number;
  /** image blocks: path as written in Markdown (empty while no image is selected) */
  src?: string;
  alt?: string;
  title?: string;
}

export interface BlockDiffContext {
  diffType?: 'same' | 'added' | 'removed' | 'modified';
  oldLevel?: number;
  oldLanguage?: string;
  oldContent?: string;
  diffHtml?: string;
  copySource?: string;
  diffData?: any;
}

export interface RenderContext {
  lang?: 'en' | 'de';
  isNested?: boolean;
  review?: boolean;
  diffContext?: BlockDiffContext;
}

interface ParsedListLine {
  indent: number;
  listType: 'task_list' | 'unordered_list' | 'ordered_list';
  checked?: boolean;
  text: string;
}

function matchListItem(line: string): ParsedListLine | null {
  const expanded = line.replace(/\t/g, '  ');
  const indentMatch = expanded.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1].length : 0;
  const trimmed = line.trim();

  // Task list item: - [ ] or - [x] or * [ ] or + [ ]
  const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
  if (taskMatch) {
    return {
      indent,
      listType: 'task_list',
      checked: taskMatch[1].toLowerCase() === 'x',
      text: taskMatch[2],
    };
  }

  // Unordered list item: - or * or + (exclude horizontal rules ---, ***, ___)
  const hrMatch = /^(\*{3,}|-{3,}|_{3,})$/.test(trimmed);
  if (!hrMatch) {
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      return {
        indent,
        listType: 'unordered_list',
        text: unorderedMatch[1],
      };
    }
  }

  // Ordered list item: 1. or 1)
  const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
  if (orderedMatch) {
    return {
      indent,
      listType: 'ordered_list',
      text: orderedMatch[1],
    };
  }

  return null;
}

interface ListStackFrame {
  indent: number;
  block: MarkdownBlock;
  currentItem: MarkdownListItem;
}

/**
 * Parses a markdown document string into an array of structured blocks.
 */
export function parseMarkdownToBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown || !markdown.trim()) {
    return [];
  }
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n');
  const hasTrailingNewline = markdown.endsWith('\n');
  const lines = hasTrailingNewline && rawLines.length > 1 ? rawLines.slice(0, -1) : rawLines;
  const blocks: MarkdownBlock[] = [];

  const consumeBlockDelimiter = (fromIdx: number): number => {
    let nextIdx = fromIdx;
    if (nextIdx < lines.length && !lines[nextIdx].trim()) {
      // Only consume as delimiter if there is a subsequent non-empty line
      let hasSubsequent = false;
      for (let j = nextIdx + 1; j < lines.length; j++) {
        if (lines[j].trim().length > 0) {
          hasSubsequent = true;
          break;
        }
      }
      if (hasSubsequent) {
        nextIdx++;
      }
    }
    return nextIdx;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      blocks.push({
        type: 'paragraph',
        content: '',
        startLine: i + 1,
        endLine: i + 1,
      });
      i++;
      continue;
    }

    // Fenced Code Block: ```lang or ~~~lang
    const fence = matchFence(line);
    if (fence) {
      const startLine = i + 1;
      const language = fence.info;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !isFenceClose(lines[i], fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        i++; // skip closing fence
      }
      blocks.push({
        type: 'code_block',
        language,
        content: codeLines.join('\n'),
        startLine,
        endLine: i,
      });
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({
        type: 'hr',
        startLine: i + 1,
        endLine: i + 1,
      });
      i++;
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Image on its own line: ![alt](path)
    const imageMatch = matchImageLine(trimmed);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        src: imageMatch.src,
        alt: imageMatch.alt,
        title: imageMatch.title,
        startLine: i + 1,
        endLine: i + 1,
      });
      i++;
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Heading: # H1 to ###### H6
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
        startLine: i + 1,
        endLine: i + 1,
      });
      i++;
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Blockquote: > line
    if (trimmed.startsWith('>')) {
      const startLine = i + 1;
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
        startLine,
        endLine: i,
      });
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Table: starts with pipe-separated cells and followed by delimiter row
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableDelimiterRow(lines[i + 1])
    ) {
      const startLine = i + 1;
      const headers = parseTableRow(lines[i]);
      i += 2; // skip header and delimiter line
      const rows: string[][] = [];

      while (
        i < lines.length &&
        lines[i].includes('|') &&
        !isTableDelimiterRow(lines[i]) &&
        !matchFence(lines[i]) &&
        !lines[i].trim().startsWith('#')
      ) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        rows,
        startLine,
        endLine: i,
      });
      i = consumeBlockDelimiter(i);
      continue;
    }

    // List item (Task list, Unordered list, or Ordered list) with nested support
    const initialListLine = matchListItem(line);
    if (initialListLine) {
      const startLine = i + 1;
      const rootBlock: MarkdownBlock = {
        type: initialListLine.listType,
        items: [],
        startLine,
      };
      const firstItem: MarkdownListItem = {
        text: initialListLine.text,
        line: startLine,
        ...(initialListLine.checked !== undefined ? { checked: initialListLine.checked } : {}),
      };
      rootBlock.items!.push(firstItem);

      const stack: ListStackFrame[] = [
        {
          indent: initialListLine.indent,
          block: rootBlock,
          currentItem: firstItem,
        },
      ];

      i++;

      while (i < lines.length) {
        const curLine = lines[i];
        const curTrimmed = curLine.trim();

        if (!curTrimmed) {
          // Check if list continues after blank line
          let nextIdx = i + 1;
          while (nextIdx < lines.length && !lines[nextIdx].trim()) {
            nextIdx++;
          }
          if (nextIdx < lines.length && matchListItem(lines[nextIdx])) {
            i = nextIdx;
            continue;
          }
          // Blank line ends list
          break;
        }

        const parsed = matchListItem(curLine);
        if (parsed) {
          const itemLine = i + 1;
          const newItem: MarkdownListItem = {
            text: parsed.text,
            line: itemLine,
            ...(parsed.checked !== undefined ? { checked: parsed.checked } : {}),
          };

          if (parsed.indent > stack[stack.length - 1].indent) {
            // Nested child list
            const parentFrame = stack[stack.length - 1];
            const subBlock: MarkdownBlock = {
              type: parsed.listType,
              items: [newItem],
              startLine: itemLine,
            };
            if (!parentFrame.currentItem.children) {
              parentFrame.currentItem.children = [];
            }
            parentFrame.currentItem.children.push(subBlock);
            stack.push({
              indent: parsed.indent,
              block: subBlock,
              currentItem: newItem,
            });
          } else {
            // Unwind stack to matching indent
            while (stack.length > 1 && parsed.indent < stack[stack.length - 1].indent) {
              const popped = stack.pop();
              if (popped) {
                popped.block.endLine = i;
              }
            }

            const topFrame = stack[stack.length - 1];
            if (parsed.indent < topFrame.indent) {
              // Indented less than root list -> end of list
              break;
            }

            if (topFrame.block.type === parsed.listType) {
              topFrame.block.items!.push(newItem);
              topFrame.currentItem = newItem;
            } else {
              // Sibling list of different type
              if (stack.length === 1) {
                // Different list type at root level ends current list block
                break;
              } else {
                const parentFrame = stack[stack.length - 2];
                const subBlock: MarkdownBlock = {
                  type: parsed.listType,
                  items: [newItem],
                  startLine: itemLine,
                };
                if (!parentFrame.currentItem.children) {
                  parentFrame.currentItem.children = [];
                }
                parentFrame.currentItem.children.push(subBlock);
                stack[stack.length - 1] = {
                  indent: parsed.indent,
                  block: subBlock,
                  currentItem: newItem,
                };
              }
            }
          }

          i++;
          continue;
        }

        // Check if line is an indented continuation text of current item
        const curIndentMatch = curLine.replace(/\t/g, '  ').match(/^(\s*)/);
        const curIndent = curIndentMatch ? curIndentMatch[1].length : 0;
        if (
          curIndent > stack[0].indent &&
          !curTrimmed.startsWith('#') &&
          !matchFence(curTrimmed) &&
          !curTrimmed.startsWith('>')
        ) {
          const currentItem = stack[stack.length - 1].currentItem;
          currentItem.text += ' ' + curTrimmed;
          i++;
          continue;
        }

        // Not a list item or continuation -> end list
        break;
      }

      for (const frame of stack) {
        if (!frame.block.endLine) {
          frame.block.endLine = i;
        }
      }
      rootBlock.endLine = i;
      blocks.push(rootBlock);
      i = consumeBlockDelimiter(i);
      continue;
    }

    // Standard Paragraph: consume lines until an empty line or another block start
    const startLine = i + 1;
    const pLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur) {
        break;
      }
      if (
        /^#{1,6}\s/.test(cur) ||
        matchFence(cur) !== null ||
        cur.startsWith('>') ||
        (cur.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && /\|[\s-:]+\|/.test(lines[i + 1].trim())) ||
        /^(\*{3,}|-{3,}|_{3,})$/.test(cur) ||
        matchImageLine(cur) !== null ||
        matchListItem(lines[i]) !== null
      ) {
        break;
      }
      pLines.push(cur);
      i++;
    }

    blocks.push({
      type: 'paragraph',
      content: pLines.join(' '),
      startLine,
      endLine: i,
    });
    i = consumeBlockDelimiter(i);
  }

  return blocks;
}

export function getBlockDeleteBtnHtml(lang?: 'en' | 'de'): string {
  const isEn = lang === 'en';
  const label = isEn ? 'Delete block' : 'Block löschen';
  return (
    `<button class="block-delete-btn" type="button" title="${label}" contenteditable="false" aria-label="${label}">` +
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<line x1="3" y1="3" x2="11" y2="11"/>' +
    '<line x1="11" y1="3" x2="3" y2="11"/>' +
    '</svg></button>'
  );
}

export const BLOCK_DELETE_BTN_HTML = getBlockDeleteBtnHtml('de');

function detectParserLang(lang?: 'en' | 'de'): 'en' | 'de' {
  if (lang) return lang;
  if (typeof document !== 'undefined' && document.documentElement) {
    const docLang = (
      document.documentElement.lang ||
      document.documentElement.getAttribute('lang') ||
      ''
    ).toLowerCase();
    if (docLang.startsWith('en')) {
      return 'en';
    }
  }
  return 'de';
}

export function renderHeading(block: MarkdownBlock, ctx: RenderContext): string {
  const level = block.level || 1;
  const tag = `h${level}`;
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  let oldLevelAttr = '';
  let badgeHtml = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') {
    diffClass = ' diff-block-modified';
    if (ctx.diffContext?.oldLevel && ctx.diffContext.oldLevel !== level) {
      oldLevelAttr = ` data-diff-old-level="${ctx.diffContext.oldLevel}"`;
      badgeHtml = `<span class="diff-level-badge" aria-hidden="true">H${ctx.diffContext.oldLevel} → H${level}</span>`;
    }
  }
  const inner = ctx.diffContext?.diffHtml !== undefined
    ? ctx.diffContext.diffHtml
    : parseInlineMarkdown(block.content || '');
  return `<${tag} class="editor-block${diffClass}" data-block-type="heading" data-level="${level}"${oldLevelAttr}>${badgeHtml}${inner}</${tag}>`;
}

export function renderParagraph(block: MarkdownBlock, ctx: RenderContext): string {
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  let content: string;
  if (ctx.diffContext?.diffHtml !== undefined) {
    content = ctx.diffContext.diffHtml;
  } else if (block.content) {
    content = parseInlineMarkdown(block.content);
  } else {
    content = '<br>';
  }
  return `<p class="editor-block${diffClass}" data-block-type="paragraph">${content}</p>`;
}

export function renderBlockquote(block: MarkdownBlock, ctx: RenderContext): string {
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  let quoteHtml: string;
  if (ctx.diffContext?.diffHtml !== undefined) {
    quoteHtml = ctx.diffContext.diffHtml;
  } else {
    const quoteLines = (block.content || '').split('\n');
    if (quoteLines.some((line) => /^\s*([-*+]|\d+[.)])\s/.test(line))) {
      quoteHtml = blocksToHtml(parseMarkdownToBlocks(block.content || ''), true, ctx.lang);
    } else {
      quoteHtml = quoteLines.map((line) => `<p>${parseInlineMarkdown(line)}</p>`).join('');
    }
  }
  const editable = ctx.review ? 'false' : 'true';
  const inner = `<blockquote class="editor-block${diffClass}" data-block-type="blockquote" contenteditable="${editable}">${quoteHtml}</blockquote>`;
  if (ctx.isNested) {
    return inner;
  }
  const deleteBtnHtml = ctx.review ? '' : getBlockDeleteBtnHtml(ctx.lang);
  return `<div class="editor-block-container widget-block${diffClass}" data-block-type="blockquote" contenteditable="false">${deleteBtnHtml}${inner}</div>`;
}

export function renderCodeBlock(block: MarkdownBlock, ctx: RenderContext): string {
  const diffType = ctx.diffContext?.diffType;
  const langStr = block.language ? escapeHtml(block.language) : '';
  const isMermaid = langStr.toLowerCase() === 'mermaid';
  const effectiveLang = ctx.lang || 'de';
  const codeLangTitle = effectiveLang === 'en' ? 'Edit code language' : 'Code-Typ bearbeiten';
  const codeCopyTitle = effectiveLang === 'en' ? 'Copy code' : 'Code kopieren';
  const copySource = ctx.diffContext?.copySource ?? block.content ?? '';
  const copyBtnHtml = `<button type="button" class="code-copy-btn" title="${codeCopyTitle}" aria-label="${codeCopyTitle}" tabindex="-1" data-copy-source="${escapeHtml(copySource)}"><svg class="copy-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/></svg></button>`;
  const codeToggleTitle = effectiveLang === 'en' ? 'Show code' : 'Code anzeigen';
  const toggleBtnHtml = `<button type="button" class="code-toggle-view-btn" data-view="diagram" title="${codeToggleTitle}" aria-label="${codeToggleTitle}" tabindex="-1"><svg class="code-toggle-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25zm6.56 0a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L14.94 8l-3.72-3.72a.75.75 0 0 1 0-1.06z"/></svg></button>`;

  if (diffType === 'modified') {
    let oldLangAttr = '';
    let headerContent = '';
    if (ctx.diffContext?.oldLanguage !== undefined && ctx.diffContext.oldLanguage !== (block.language || '')) {
      const oldLangDisplay = escapeHtml(ctx.diffContext.oldLanguage || 'none');
      const newLangDisplay = escapeHtml(block.language || 'none');
      headerContent = `<span class="code-diff-header-lang">${oldLangDisplay} → ${newLangDisplay}</span>`;
      oldLangAttr = ` data-diff-old-language="${escapeHtml(ctx.diffContext.oldLanguage)}"`;
    } else {
      headerContent = `<span class="code-diff-header-lang">${langStr || 'Code'}</span>`;
    }

    if (isMermaid) {
      const viewsControl = `<div class="mermaid-diff-views" role="group" aria-label="Mermaid view"><button type="button" class="btn-mermaid-view is-active" data-view="after">After</button><button type="button" class="btn-mermaid-view" data-view="before">Before</button><button type="button" class="btn-mermaid-view" data-view="code-diff">Code diff</button></div>`;
      const afterDiagram = renderMermaidPreviewHtml(block.content || '', effectiveLang);
      const beforeDiagram = renderMermaidPreviewHtml(ctx.diffContext?.oldContent || '', effectiveLang);
      const codeDiffContent = ctx.diffContext?.diffHtml || escapeHtml(block.content || '');

      const previewAfter = `<div class="mermaid-preview mermaid-diff-after" contenteditable="false" data-scale="1" data-pan-x="0" data-pan-y="0">${afterDiagram}</div>`;
      const previewBefore = `<div class="mermaid-preview mermaid-diff-before" style="display:none;" contenteditable="false" data-scale="1" data-pan-x="0" data-pan-y="0">${beforeDiagram}</div>`;
      const codeDiffView = `<div class="mermaid-diff-code" style="display:none;"><pre><code class="editor-code">${codeDiffContent}</code></pre></div>`;

      const inner = `<div class="editor-block code-block-wrapper is-mermaid-block diff-block-modified" data-block-type="code_block" data-language="mermaid" data-view="diagram"${oldLangAttr}><div class="code-block-header">${viewsControl}${copyBtnHtml}</div>${previewAfter}${previewBefore}${codeDiffView}</div>`;
      return ctx.isNested ? inner : `<div class="editor-block-container widget-block" data-block-type="code_block" contenteditable="false">${inner}</div>`;
    }

    const codeDiffHtml = ctx.diffContext?.diffHtml || escapeHtml(block.content || '');
    const inner = `<div class="editor-block code-block-wrapper code-diff-wrapper diff-block-modified" data-block-type="code_block" data-language="${langStr}"${oldLangAttr}><div class="code-block-header">${headerContent}<span class="code-diff-badge">AI Diff</span>${copyBtnHtml}</div><pre><code class="editor-code">${codeDiffHtml}</code></pre></div>`;
    return ctx.isNested ? inner : `<div class="editor-block-container widget-block" data-block-type="code_block" contenteditable="false">${inner}</div>`;
  }

  // Normal / Added / Removed
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';

  let headerBtns = copyBtnHtml;
  let previewHtml = '';
  let preStyle = '';
  let wrapperClass = `editor-block code-block-wrapper${diffClass}`;
  let viewAttr = '';

  if (isMermaid) {
    headerBtns = `${toggleBtnHtml}${copyBtnHtml}`;
    wrapperClass += ' is-mermaid-block';
    viewAttr = ' data-view="diagram"';
    const renderedDiagram = renderMermaidPreviewHtml(block.content || '', effectiveLang);
    previewHtml = `<div class="mermaid-preview" contenteditable="false" data-scale="1" data-pan-x="0" data-pan-y="0">${renderedDiagram}</div>`;
    preStyle = ' style="display: none;"';
  }

  const readonlyAttr = ctx.review ? ' readonly' : '';
  const editableCode = ctx.review ? 'false' : 'true';
  const codeText = escapeHtml(block.content || '');
  const deleteBtnHtml = ctx.review ? '' : getBlockDeleteBtnHtml(effectiveLang);

  const inner = `<div class="${wrapperClass}" data-block-type="code_block" data-language="${langStr}"${viewAttr}><div class="code-block-header"><input type="text" class="code-lang-input" value="${langStr}" placeholder="Code" title="${codeLangTitle}" spellcheck="false" autocomplete="off"${readonlyAttr} />${headerBtns}</div>${previewHtml}<pre${preStyle}><code class="editor-code" contenteditable="${editableCode}">${codeText}</code></pre></div>`;

  return ctx.isNested
    ? inner
    : `<div class="editor-block-container widget-block${diffClass}" data-block-type="code_block" contenteditable="false">${deleteBtnHtml}${inner}</div>`;
}

export function renderList(block: MarkdownBlock, ctx: RenderContext): string {
  if (ctx.diffContext?.diffHtml !== undefined) {
    return ctx.diffContext.diffHtml;
  }
  const isNested = !!ctx.isNested;
  const effectiveLang = ctx.lang || 'de';
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  switch (block.type) {
    case 'task_list': {
      const blockClass = isNested ? `task-list${diffClass}` : `editor-block task-list${diffClass}`;
      const itemHtmls = (block.items || []).map((item) => {
        const checkedAttr = item.checked ? 'checked' : '';
        const checkedClass = item.checked ? ' is-checked' : '';
        const diffItemClass = item.diffType ? ` diff-item-${item.diffType}` : '';
        const diffCheckboxClass = item.oldChecked !== undefined && item.oldChecked !== item.checked ? ' diff-checkbox-changed' : '';
        const oldCheckedAttr = item.oldChecked !== undefined && item.oldChecked !== item.checked ? ` data-diff-old-checked="${item.oldChecked}"` : '';
        let childHtml = '';
        if (item.children && item.children.length > 0) {
          childHtml = blocksToHtml(item.children, true, effectiveLang, { review: ctx.review });
        }
        let inlineHtml: string;
        if (item.diffHtml !== undefined) {
          inlineHtml = item.diffHtml;
        } else if (item.text && item.text.trim()) {
          inlineHtml = parseInlineMarkdown(item.text);
        } else {
          inlineHtml = '<br>';
        }
        if (item.diffType === 'removed') {
          inlineHtml = `<del class="diff-del">${inlineHtml}</del>`;
        } else if (item.diffType === 'added') {
          inlineHtml = `<ins class="diff-ins">${inlineHtml}</ins>`;
        }
        const disabledAttr = ctx.review ? 'disabled' : '';
        return `<li class="task-item${checkedClass}${diffItemClass}${diffCheckboxClass}" data-checked="${item.checked ? 'true' : 'false'}"${oldCheckedAttr}><input type="checkbox" class="task-checkbox" ${checkedAttr} ${disabledAttr} contenteditable="false"><span class="task-content">${inlineHtml}</span>${childHtml}</li>`;
      });
      return `<ul class="${blockClass}" data-block-type="task_list">${itemHtmls.join('')}</ul>`;
    }

    case 'unordered_list': {
      const blockClass = isNested ? `bullet-list${diffClass}` : `editor-block bullet-list${diffClass}`;
      const itemHtmls = (block.items || []).map((item) => {
        const diffItemClass = item.diffType ? ` diff-item-${item.diffType}` : '';
        let childHtml = '';
        if (item.children && item.children.length > 0) {
          childHtml = blocksToHtml(item.children, true, effectiveLang, { review: ctx.review });
        }
        let inlineHtml: string;
        if (item.diffHtml !== undefined) {
          inlineHtml = item.diffHtml;
        } else if (item.text && item.text.trim()) {
          inlineHtml = parseInlineMarkdown(item.text);
        } else {
          inlineHtml = '<br>';
        }
        if (item.diffType === 'removed') {
          inlineHtml = `<del class="diff-del">${inlineHtml}</del>`;
        } else if (item.diffType === 'added') {
          inlineHtml = `<ins class="diff-ins">${inlineHtml}</ins>`;
        }
        return `<li class="list-item${diffItemClass}">${inlineHtml}${childHtml}</li>`;
      });
      return `<ul class="${blockClass}" data-block-type="unordered_list">${itemHtmls.join('')}</ul>`;
    }

    case 'ordered_list': {
      const blockClass = isNested ? `ordered-list${diffClass}` : `editor-block ordered-list${diffClass}`;
      const itemHtmls = (block.items || []).map((item) => {
        const diffItemClass = item.diffType ? ` diff-item-${item.diffType}` : '';
        const valueAttr = item.value !== undefined ? ` value="${item.value}"` : '';
        let childHtml = '';
        if (item.children && item.children.length > 0) {
          childHtml = blocksToHtml(item.children, true, effectiveLang, { review: ctx.review });
        }
        let inlineHtml: string;
        if (item.diffHtml !== undefined) {
          inlineHtml = item.diffHtml;
        } else if (item.text && item.text.trim()) {
          inlineHtml = parseInlineMarkdown(item.text);
        } else {
          inlineHtml = '<br>';
        }
        if (item.diffType === 'removed') {
          inlineHtml = `<del class="diff-del">${inlineHtml}</del>`;
        } else if (item.diffType === 'added') {
          inlineHtml = `<ins class="diff-ins">${inlineHtml}</ins>`;
        }
        return `<li class="list-item${diffItemClass}"${valueAttr}>${inlineHtml}${childHtml}</li>`;
      });
      return `<ol class="${blockClass}" data-block-type="ordered_list">${itemHtmls.join('')}</ol>`;
    }
    default:
      return '';
  }
}

export function renderTable(block: MarkdownBlock, ctx: RenderContext): string {
  if (ctx.diffContext?.diffHtml !== undefined) {
    return ctx.diffContext.diffHtml;
  }
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  const renderCell = (content: string, isHeader: boolean) => {
    const trimmed = content.trim();
    const checkboxMatch = trimmed.match(/^([-*+]?\s*)?\[([ xX])\]$/);
    const tag = isHeader ? 'th' : 'td';
    if (checkboxMatch) {
      const isChecked = checkboxMatch[2].toLowerCase() === 'x';
      const checkedAttr = isChecked ? 'checked' : '';
      const checkedClass = isChecked ? ' is-checked' : '';
      const disabledAttr = ctx.review ? 'disabled' : '';
      return `<${tag} class="table-checkbox-cell${checkedClass}" data-checked="${isChecked ? 'true' : 'false'}"><input type="checkbox" class="table-cell-checkbox" ${checkedAttr} ${disabledAttr} contenteditable="false"></${tag}>`;
    }
    const parsed = parseInlineMarkdown(content);
    return `<${tag}>${parsed || '<br>'}</${tag}>`;
  };

  const headers = (block.headers || [])
    .map((h) => renderCell(h, true))
    .join('');
  const rows = (block.rows || [])
    .map((row) => {
      const cells = row.map((c) => renderCell(c, false)).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const editable = ctx.review ? 'false' : 'true';
  const inner = `<div class="editor-block table-wrapper${diffClass}" data-block-type="table"><div class="table-scroll-wrapper"><table class="editor-table" contenteditable="${editable}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  if (ctx.isNested) {
    return inner;
  }
  const deleteBtnHtml = ctx.review ? '' : getBlockDeleteBtnHtml(ctx.lang);
  return `<div class="editor-block-container widget-block${diffClass}" data-block-type="table" contenteditable="false">${deleteBtnHtml}${inner}</div>`;
}

export function renderHr(_block: MarkdownBlock, ctx: RenderContext): string {
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  const inner = `<hr class="editor-block${diffClass}" data-block-type="hr">`;
  if (ctx.isNested) {
    return inner;
  }
  const deleteBtnHtml = ctx.review ? '' : getBlockDeleteBtnHtml(ctx.lang);
  return `<div class="editor-block-container widget-block${diffClass}" data-block-type="hr" contenteditable="false">${deleteBtnHtml}${inner}</div>`;
}

export function renderImage(block: MarkdownBlock, ctx: RenderContext): string {
  const diffType = ctx.diffContext?.diffType;
  let diffClass = '';
  if (diffType === 'added') diffClass = ' diff-block-added';
  else if (diffType === 'removed') diffClass = ' diff-block-removed';
  else if (diffType === 'modified') diffClass = ' diff-block-modified';

  const lang = detectParserLang(ctx.lang);
  const src = block.src || '';
  const attrs =
    ` data-src="${escapeHtml(src)}" data-alt="${escapeHtml(block.alt || '')}"` +
    (block.title ? ` data-title="${escapeHtml(block.title)}"` : '');
  const labelSelect = lang === 'en' ? 'Select image' : 'Bild auswählen';
  const labelMissing = lang === 'en' ? 'Image not found' : 'Bild nicht gefunden';

  let inner: string;
  if (!src) {
    const editable = ctx.review ? '' : ' role="button" tabindex="0"';
    inner =
      `<div class="image-placeholder"${editable}>` +
      '<svg class="image-placeholder-icon" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="5.75" cy="6" r="1.1"/><path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3"/></svg>' +
      `<span class="image-placeholder-label">${labelSelect}</span></div>`;
  } else {
    const resolved = resolveImageSrc(src);
    const titleAttr = block.title ? ` title="${escapeHtml(block.title)}"` : '';
    inner =
      `<img class="image-element" src="${escapeHtml(resolved)}" alt="${escapeHtml(block.alt || '')}"${titleAttr} draggable="false">` +
      `<div class="image-missing" hidden><span class="image-placeholder-label">${labelMissing}</span><span class="image-missing-path">${escapeHtml(src)}</span></div>`;
  }

  const replaceLabel = lang === 'en' ? 'Replace image' : 'Bild ersetzen';
  const replaceBtnHtml =
    src && !ctx.review
      ? `<button class="image-replace-btn" type="button" title="${replaceLabel}" contenteditable="false" aria-label="${replaceLabel}">` +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M13.5 6A5.5 5.5 0 0 0 3.6 4.6M2.5 10a5.5 5.5 0 0 0 9.9 1.4"/><path d="M3.5 1.75v3h3M12.5 14.25v-3h-3"/></svg></button>'
      : '';
  const deleteBtnHtml = ctx.review ? '' : getBlockDeleteBtnHtml(ctx.lang);
  return `<div class="editor-block-container widget-block${diffClass}" data-block-type="image"${attrs} contenteditable="false">${replaceBtnHtml}${deleteBtnHtml}${inner}</div>`;
}

export function renderBlock(block: MarkdownBlock, ctx: RenderContext): string {
  switch (block.type) {
    case 'heading':
      return renderHeading(block, ctx);
    case 'paragraph':
      return renderParagraph(block, ctx);
    case 'blockquote':
      return renderBlockquote(block, ctx);
    case 'code_block':
      return renderCodeBlock(block, ctx);
    case 'task_list':
    case 'unordered_list':
    case 'ordered_list':
      return renderList(block, ctx);
    case 'table':
      return renderTable(block, ctx);
    case 'hr':
      return renderHr(block, ctx);
    case 'image':
      return renderImage(block, ctx);
    default:
      return '';
  }
}

/**
 * Converts parsed MarkdownBlocks into an editable HTML structure.
 */
export function blocksToHtml(
  blocks: MarkdownBlock[],
  isNested = false,
  lang?: 'en' | 'de',
  ctxOverride?: Partial<RenderContext>
): string {
  if (blocks.length === 0) {
    return isNested ? '' : '<p class="editor-block" data-block-type="paragraph"><br></p>';
  }

  const effectiveLang = detectParserLang(lang);
  const ctx: RenderContext = {
    lang: effectiveLang,
    isNested,
    ...ctxOverride,
  };

  return blocks.map((block) => renderBlock(block, ctx)).join('\n');
}


/**
 * Complete parser converting markdown string to formatted HTML.
 */
export function markdownToHtml(markdown: string, lang?: 'en' | 'de'): string {
  const blocks = parseMarkdownToBlocks(markdown);
  return blocksToHtml(blocks, false, lang);
}

/**
 * Safe wrapper around markdownToHtml that intercepts any parser exceptions
 * and guards against returning an empty HTML string when the source Markdown
 * contains non-whitespace content.
 */
export function safeMarkdownToHtml(markdown: string, lang?: 'en' | 'de'): { html: string; error?: Error } {
  try {
    const html = markdownToHtml(markdown, lang);
    if (markdown.trim().length > 0 && html.trim().length === 0) {
      return {
        html: '',
        error: new Error('Parser produced empty HTML for non-empty Markdown content.'),
      };
    }
    return { html };
  } catch (err) {
    return {
      html: '',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

