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
  items?: { text: string; checked?: boolean }[];
  language?: string;
  headers?: string[];
  rows?: string[][];
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

    // Task list: - [ ] or - [x] or * [ ] or * [x]
    if (/^[-*+]\s+\[([ xX])\]\s+(.*)$/.test(trimmed)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length) {
        const match = lines[i].trim().match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (!match) {
          break;
        }
        items.push({
          checked: match[1].toLowerCase() === 'x',
          text: match[2],
        });
        i++;
      }
      blocks.push({
        type: 'task_list',
        items,
      });
      continue;
    }

    // Unordered list: - or * or + (not task list)
    if (/^[-*+]\s+(.*)$/.test(trimmed)) {
      const items: { text: string }[] = [];
      while (i < lines.length) {
        const match = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (!match || /^[-*+]\s+\[([ xX])\]/.test(lines[i].trim())) {
          break;
        }
        items.push({ text: match[1] });
        i++;
      }
      blocks.push({
        type: 'unordered_list',
        items,
      });
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+(.*)$/.test(trimmed)) {
      const items: { text: string }[] = [];
      while (i < lines.length) {
        const match = lines[i].trim().match(/^\d+\.\s+(.*)$/);
        if (!match) {
          break;
        }
        items.push({ text: match[1] });
        i++;
      }
      blocks.push({
        type: 'ordered_list',
        items,
      });
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
        /^[-*+]\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur)
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
export function blocksToHtml(blocks: MarkdownBlock[]): string {
  if (blocks.length === 0) {
    return '<p class="editor-block" data-block-type="paragraph"><br></p>';
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
        const itemHtmls = (block.items || []).map((item) => {
          const checkedAttr = item.checked ? 'checked' : '';
          const checkedClass = item.checked ? ' is-checked' : '';
          return `<li class="task-item${checkedClass}" data-checked="${item.checked ? 'true' : 'false'}"><input type="checkbox" class="task-checkbox" ${checkedAttr} contenteditable="false"><span class="task-content">${parseInlineMarkdown(item.text)}</span></li>`;
        });
        htmlParts.push(
          `<ul class="editor-block task-list" data-block-type="task_list">${itemHtmls.join('')}</ul>`
        );
        break;
      }

      case 'unordered_list': {
        const itemHtmls = (block.items || []).map(
          (item) => `<li class="list-item">${parseInlineMarkdown(item.text)}</li>`
        );
        htmlParts.push(
          `<ul class="editor-block bullet-list" data-block-type="unordered_list">${itemHtmls.join('')}</ul>`
        );
        break;
      }

      case 'ordered_list': {
        const itemHtmls = (block.items || []).map(
          (item) => `<li class="list-item">${parseInlineMarkdown(item.text)}</li>`
        );
        htmlParts.push(
          `<ol class="editor-block ordered-list" data-block-type="ordered_list">${itemHtmls.join('')}</ol>`
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
