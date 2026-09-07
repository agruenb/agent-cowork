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

  // Links: [label](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="editor-link">$1</a>'
  );

  return result;
}

export interface MarkdownListItem {
  text: string;
  checked?: boolean;
  children?: MarkdownBlock[];
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
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced Code Block: ```lang
    if (trimmed.startsWith('```')) {
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
      });
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading: # H1 to ###### H6
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote: > line
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Table: starts with | and contains |
    if (trimmed.startsWith('|') && trimmed.includes('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && /\|[\s-:]+\|/.test(lines[i + 1].trim())) {
      const parseRow = (r: string) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(lines[i]);
      i += 2; // skip header and delimiter line
      const rows: string[][] = [];

      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        rows,
      });
      continue;
    }

    // List item (Task list, Unordered list, or Ordered list) with nested support
    const initialListLine = matchListItem(line);
    if (initialListLine) {
      const rootBlock: MarkdownBlock = {
        type: initialListLine.listType,
        items: [],
      };
      const firstItem: MarkdownListItem = {
        text: initialListLine.text,
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
          const newItem: MarkdownListItem = {
            text: parsed.text,
            ...(parsed.checked !== undefined ? { checked: parsed.checked } : {}),
          };

          if (parsed.indent > stack[stack.length - 1].indent) {
            // Nested child list
            const parentFrame = stack[stack.length - 1];
            const subBlock: MarkdownBlock = {
              type: parsed.listType,
              items: [newItem],
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
              stack.pop();
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

      blocks.push(rootBlock);
      continue;
    }

    // Standard Paragraph: consume lines until an empty line or another block start
    const pLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur) {
        break;
      }
      if (
        cur.startsWith('#') ||
        cur.startsWith('```') ||
        cur.startsWith('>') ||
        cur.startsWith('|') ||
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
    });
  }

  return blocks;
}

/**
 * Converts parsed MarkdownBlocks into an editable HTML structure.
 */
export function blocksToHtml(blocks: MarkdownBlock[], isNested = false): string {
  if (blocks.length === 0) {
    return isNested ? '' : '<p class="editor-block" data-block-type="paragraph"><br></p>';
  }

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
        htmlParts.push(
          `<p class="editor-block" data-block-type="paragraph">${content}</p>`
        );
        break;
      }

      case 'blockquote': {
        const quoteHtml = (block.content || '')
          .split('\n')
          .map((line) => `<p>${parseInlineMarkdown(line)}</p>`)
          .join('');
        htmlParts.push(
          `<blockquote class="editor-block" data-block-type="blockquote">${quoteHtml}</blockquote>`
        );
        break;
      }

      case 'code_block': {
        const lang = block.language ? escapeHtml(block.language) : '';
        const codeText = escapeHtml(block.content || '');
        htmlParts.push(
          `<div class="editor-block code-block-wrapper" data-block-type="code_block" data-language="${lang}"><div class="code-block-header">${lang ? `<span>${lang}</span>` : '<span>Code</span>'}</div><pre><code class="editor-code">${codeText}</code></pre></div>`
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
            childHtml = blocksToHtml(item.children, true);
          }
          return `<li class="task-item${checkedClass}" data-checked="${item.checked ? 'true' : 'false'}"><input type="checkbox" class="task-checkbox" ${checkedAttr} contenteditable="false"><span class="task-content">${parseInlineMarkdown(item.text)}</span>${childHtml}</li>`;
        });
        htmlParts.push(
          `<ul class="${blockClass}" data-block-type="task_list">${itemHtmls.join('')}</ul>`
        );
        break;
      }

      case 'unordered_list': {
        const blockClass = isNested ? 'bullet-list' : 'editor-block bullet-list';
        const itemHtmls = (block.items || []).map((item) => {
          let childHtml = '';
          if (item.children && item.children.length > 0) {
            childHtml = blocksToHtml(item.children, true);
          }
          return `<li class="list-item">${parseInlineMarkdown(item.text)}${childHtml}</li>`;
        });
        htmlParts.push(
          `<ul class="${blockClass}" data-block-type="unordered_list">${itemHtmls.join('')}</ul>`
        );
        break;
      }

      case 'ordered_list': {
        const blockClass = isNested ? 'ordered-list' : 'editor-block ordered-list';
        const itemHtmls = (block.items || []).map((item) => {
          let childHtml = '';
          if (item.children && item.children.length > 0) {
            childHtml = blocksToHtml(item.children, true);
          }
          return `<li class="list-item">${parseInlineMarkdown(item.text)}${childHtml}</li>`;
        });
        htmlParts.push(
          `<ol class="${blockClass}" data-block-type="ordered_list">${itemHtmls.join('')}</ol>`
        );
        break;
      }

      case 'table': {
        const headers = (block.headers || [])
          .map((h) => `<th>${parseInlineMarkdown(h)}</th>`)
          .join('');
        const rows = (block.rows || [])
          .map((row) => {
            const cells = row.map((c) => `<td>${parseInlineMarkdown(c)}</td>`).join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
        htmlParts.push(
          `<div class="editor-block table-wrapper" data-block-type="table"><table class="editor-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`
        );
        break;
      }

      case 'hr': {
        htmlParts.push('<hr class="editor-block" data-block-type="hr">');
        break;
      }
    }
  }

  return htmlParts.join('\n');
}

/**
 * Complete parser converting markdown string to formatted HTML.
 */
export function markdownToHtml(markdown: string): string {
  const blocks = parseMarkdownToBlocks(markdown);
  return blocksToHtml(blocks);
}
