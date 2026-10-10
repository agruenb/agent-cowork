/**
 * Zero-dependency Markdown to HTML parser designed for the Agent Cowork
 * formatted and editable document view.
 */

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

export interface MarkdownListItem {
  text: string;
  checked?: boolean;
  children?: MarkdownBlock[];
  line?: number;
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
    | 'hr';
  level?: number;
  content?: string;
  items?: MarkdownListItem[];
  language?: string;
  headers?: string[];
  rows?: string[][];
  startLine?: number;
  endLine?: number;
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

    // Fenced Code Block: ```lang
    if (trimmed.startsWith('```')) {
      const startLine = i + 1;
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        i++; // skip closing ```
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
        !lines[i].trim().startsWith('```') &&
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
          !curTrimmed.startsWith('```') &&
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
        cur.startsWith('```') ||
        cur.startsWith('>') ||
        (cur.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && /\|[\s-:]+\|/.test(lines[i + 1].trim())) ||
        /^(\*{3,}|-{3,}|_{3,})$/.test(cur) ||
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

/**
 * Converts parsed MarkdownBlocks into an editable HTML structure.
 */
export function blocksToHtml(blocks: MarkdownBlock[], isNested = false, lang?: 'en' | 'de'): string {
  if (blocks.length === 0) {
    return isNested ? '' : '<p class="editor-block" data-block-type="paragraph"><br></p>';
  }

  const effectiveLang = detectParserLang(lang);
  const deleteBtnHtml = getBlockDeleteBtnHtml(effectiveLang);
  const codeLangTitle = effectiveLang === 'en' ? 'Edit code language' : 'Code-Typ bearbeiten';
  const codeCopyTitle = effectiveLang === 'en' ? 'Copy code' : 'Code kopieren';
  const copyBtnHtml = `<button type="button" class="code-copy-btn" title="${codeCopyTitle}" aria-label="${codeCopyTitle}" tabindex="-1"><svg class="copy-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/></svg></button>`;

  const htmlParts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const level = block.level || 1;
        const tag = `h${level}`;
        htmlParts.push(
          `<${tag} class="editor-block" data-block-type="heading" data-level="${level}">${parseInlineMarkdown(
            block.content || ''
          )}</${tag}>`
        );
        break;
      }

      case 'paragraph': {
        const content = block.content ? parseInlineMarkdown(block.content) : '<br>';
        htmlParts.push(`<p class="editor-block" data-block-type="paragraph">${content}</p>`);
        break;
      }

      case 'blockquote': {
        const quoteHtml = (block.content || '')
          .split('\n')
          .map((line) => `<p>${parseInlineMarkdown(line)}</p>`)
          .join('');
        const inner = `<blockquote class="editor-block" data-block-type="blockquote" contenteditable="true">${quoteHtml}</blockquote>`;
        htmlParts.push(
          isNested
            ? inner
            : `<div class="editor-block-container widget-block" data-block-type="blockquote" contenteditable="false">${deleteBtnHtml}${inner}</div>`
        );
        break;
      }

      case 'code_block': {
        const langStr = block.language ? escapeHtml(block.language) : '';
        const codeText = escapeHtml(block.content || '');
        const inner = `<div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="${langStr}"><div class="code-block-header"><input type="text" class="code-lang-input" value="${langStr}" placeholder="Code" title="${codeLangTitle}" spellcheck="false" autocomplete="off" />${copyBtnHtml}</div><pre><code class="editor-code" contenteditable="true">${codeText}</code></pre></div>`;
        htmlParts.push(
          isNested
            ? inner
            : `<div class="editor-block-container widget-block" data-block-type="code_block" contenteditable="false">${deleteBtnHtml}${inner}</div>`
        );
        break;
      }

      case 'task_list': {
        const blockClass = isNested ? 'task-list' : 'editor-block task-list';
        const itemHtmls = (block.items || []).map((item) => {
          const checkedAttr = item.checked ? 'checked' : '';
          const checkedClass = item.checked ? ' is-checked' : '';
          let childHtml = '';
          if (item.children && item.children.length > 0) {
            childHtml = blocksToHtml(item.children, true, effectiveLang);
          }
          const inlineHtml = item.text && item.text.trim() ? parseInlineMarkdown(item.text) : '<br>';
          return `<li class="task-item${checkedClass}" data-checked="${item.checked ? 'true' : 'false'}"><input type="checkbox" class="task-checkbox" ${checkedAttr} contenteditable="false"><span class="task-content">${inlineHtml}</span>${childHtml}</li>`;
        });
        htmlParts.push(`<ul class="${blockClass}" data-block-type="task_list">${itemHtmls.join('')}</ul>`);
        break;
      }

      case 'unordered_list': {
        const blockClass = isNested ? 'bullet-list' : 'editor-block bullet-list';
        const itemHtmls = (block.items || []).map((item) => {
          let childHtml = '';
          if (item.children && item.children.length > 0) {
            childHtml = blocksToHtml(item.children, true, effectiveLang);
          }
          const inlineHtml = item.text && item.text.trim() ? parseInlineMarkdown(item.text) : '<br>';
          return `<li class="list-item">${inlineHtml}${childHtml}</li>`;
        });
        htmlParts.push(`<ul class="${blockClass}" data-block-type="unordered_list">${itemHtmls.join('')}</ul>`);
        break;
      }

      case 'ordered_list': {
        const blockClass = isNested ? 'ordered-list' : 'editor-block ordered-list';
        const itemHtmls = (block.items || []).map((item) => {
          let childHtml = '';
          if (item.children && item.children.length > 0) {
            childHtml = blocksToHtml(item.children, true, effectiveLang);
          }
          const inlineHtml = item.text && item.text.trim() ? parseInlineMarkdown(item.text) : '<br>';
          return `<li class="list-item">${inlineHtml}${childHtml}</li>`;
        });
        htmlParts.push(`<ol class="${blockClass}" data-block-type="ordered_list">${itemHtmls.join('')}</ol>`);
        break;
      }

      case 'table': {
        const renderCell = (content: string, isHeader: boolean) => {
          const trimmed = content.trim();
          const checkboxMatch = trimmed.match(/^([-*+]?\s*)?\[([ xX])\]$/);
          const tag = isHeader ? 'th' : 'td';
          if (checkboxMatch) {
            const isChecked = checkboxMatch[2].toLowerCase() === 'x';
            const checkedAttr = isChecked ? 'checked' : '';
            const checkedClass = isChecked ? ' is-checked' : '';
            return `<${tag} class="table-checkbox-cell${checkedClass}" data-checked="${isChecked ? 'true' : 'false'}"><input type="checkbox" class="table-cell-checkbox" ${checkedAttr} contenteditable="false"></${tag}>`;
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
        const inner = `<div class="editor-block table-wrapper" data-block-type="table"><div class="table-scroll-wrapper"><table class="editor-table" contenteditable="true"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
        htmlParts.push(
          isNested
            ? inner
            : `<div class="editor-block-container widget-block" data-block-type="table" contenteditable="false">${deleteBtnHtml}${inner}</div>`
        );
        break;
      }

      case 'hr': {
        const inner = '<hr class="editor-block" data-block-type="hr">';
        htmlParts.push(
          isNested
            ? inner
            : `<div class="editor-block-container widget-block" data-block-type="hr" contenteditable="false">${deleteBtnHtml}${inner}</div>`
        );
        break;
      }
    }
  }

  return htmlParts.join('\n');
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

