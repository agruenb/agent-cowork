/**
 * Zero-dependency DOM to Markdown serializer for the Agent Cowork
 * formatted editor. Converts the live DOM tree back into clean Markdown.
 */

/**
 * Serializes inline child nodes of an element (spans, bold, italic, code, links)
 * to markdown format.
 */
export function serializeInlineNodes(container: Node): string {
  let text = '';

  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i];

    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue || '';
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Skip task checkboxes in inline serialization
      if (tagName === 'input' && (el as HTMLInputElement).type === 'checkbox') {
        continue;
      }

      if (tagName === 'br') {
        text += '\n';
        continue;
      }

      if (tagName === 'strong' || tagName === 'b') {
        const inner = serializeInlineNodes(el).trim();
        if (inner) {
          text += `**${inner}**`;
        }
        continue;
      }

      if (tagName === 'em' || tagName === 'i') {
        const inner = serializeInlineNodes(el).trim();
        if (inner) {
          text += `*${inner}*`;
        }
        continue;
      }

      if (tagName === 'del' || tagName === 's' || tagName === 'strike') {
        const inner = serializeInlineNodes(el).trim();
        if (inner) {
          text += `~~${inner}~~`;
        }
        continue;
      }

      if (tagName === 'code') {
        const inner = el.textContent || '';
        if (inner) {
          text += `\`${inner}\``;
        }
        continue;
      }

      if (tagName === 'a') {
        const href = el.getAttribute('href') || '';
        const inner = serializeInlineNodes(el).trim();
        if (href) {
          text += `[${inner || href}](${href})`;
        } else {
          text += inner;
        }
        continue;
      }

      // Other spans or containers (like .task-content)
      text += serializeInlineNodes(el);
    }
  }

  return text;
}

/**
 * Serializes the entire editor DOM container into standard Markdown.
 */
export function domToMarkdown(editorRoot: HTMLElement): string {
  const blocks: string[] = [];

  for (let i = 0; i < editorRoot.children.length; i++) {
    const blockEl = editorRoot.children[i] as HTMLElement;
    const tagName = blockEl.tagName.toLowerCase();
    const blockType = blockEl.getAttribute('data-block-type') || '';

    // Headings
    if (/^h[1-6]$/.test(tagName) || blockType === 'heading') {
      const level = parseInt(
        blockEl.getAttribute('data-level') || tagName.replace('h', '') || '1',
        10
      );
      const prefix = '#'.repeat(Math.max(1, Math.min(6, level)));
      const content = serializeInlineNodes(blockEl).trim();
      blocks.push(`${prefix} ${content}`);
      continue;
    }

    // Horizontal Rule
    if (tagName === 'hr' || blockType === 'hr') {
      blocks.push('---');
      continue;
    }

    // Code Block
    if (blockEl.classList.contains('code-block-wrapper') || blockType === 'code_block') {
      const lang = blockEl.getAttribute('data-language') || '';
      const codeEl = blockEl.querySelector('code');
      const codeText = codeEl ? (codeEl.textContent || '') : '';
      blocks.push(`\`\`\`${lang}\n${codeText}\n\`\`\``);
      continue;
    }

    // Blockquote
    if (tagName === 'blockquote' || blockType === 'blockquote') {
      const quoteParagraphs = blockEl.querySelectorAll('p');
      if (quoteParagraphs.length > 0) {
        const quoteLines: string[] = [];
        quoteParagraphs.forEach((p) => {
          quoteLines.push(`> ${serializeInlineNodes(p).trim()}`);
        });
        blocks.push(quoteLines.join('\n'));
      } else {
        const lines = (blockEl.textContent || '').split('\n');
        blocks.push(lines.map((l) => `> ${l.trim()}`).join('\n'));
      }
      continue;
    }

    // Task List
    if (blockEl.classList.contains('task-list') || blockType === 'task_list') {
      const taskLines: string[] = [];
      const items = blockEl.querySelectorAll('li');
      items.forEach((li) => {
        const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        const isChecked = checkbox ? checkbox.checked : li.getAttribute('data-checked') === 'true';
        const contentEl = li.querySelector('.task-content') || li;
        const text = serializeInlineNodes(contentEl).trim();
        taskLines.push(`- [${isChecked ? 'x' : ' '}] ${text}`);
      });
      if (taskLines.length > 0) {
        blocks.push(taskLines.join('\n'));
      }
      continue;
    }

    // Unordered Bullet List
    if (tagName === 'ul' || blockType === 'unordered_list') {
      const listLines: string[] = [];
      const items = blockEl.querySelectorAll(':scope > li');
      items.forEach((li) => {
        const text = serializeInlineNodes(li).trim();
        listLines.push(`- ${text}`);
      });
      if (listLines.length > 0) {
        blocks.push(listLines.join('\n'));
      }
      continue;
    }

    // Ordered List
    if (tagName === 'ol' || blockType === 'ordered_list') {
      const listLines: string[] = [];
      const items = blockEl.querySelectorAll(':scope > li');
      items.forEach((li, index) => {
        const text = serializeInlineNodes(li).trim();
        listLines.push(`${index + 1}. ${text}`);
      });
      if (listLines.length > 0) {
        blocks.push(listLines.join('\n'));
      }
      continue;
    }

    // Table
    if (blockEl.classList.contains('table-wrapper') || tagName === 'table' || blockType === 'table') {
      const table = blockEl.tagName.toLowerCase() === 'table' ? blockEl : blockEl.querySelector('table');
      if (table) {
        const headerCells = table.querySelectorAll('thead th');
        const headers: string[] = [];
        headerCells.forEach((th) => headers.push(serializeInlineNodes(th).trim() || ' '));

        const bodyRows = table.querySelectorAll('tbody tr');
        const rows: string[][] = [];
        bodyRows.forEach((tr) => {
          const rowCells: string[] = [];
          tr.querySelectorAll('td').forEach((td) => {
            rowCells.push(serializeInlineNodes(td).trim() || ' ');
          });
          rows.push(rowCells);
        });

        if (headers.length > 0) {
          const headerLine = `| ${headers.join(' | ')} |`;
          const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
          const rowLines = rows.map((r) => `| ${r.join(' | ')} |`);
          blocks.push([headerLine, sepLine, ...rowLines].join('\n'));
          continue;
        }
      }
    }

    // Standard Paragraph or generic div
    const pContent = serializeInlineNodes(blockEl).trim();
    if (pContent) {
      blocks.push(pContent);
    }
  }

  return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}
