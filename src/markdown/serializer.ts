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

    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      text += node.nodeValue || '';
      continue;
    }

    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Skip task checkboxes in inline serialization
      if (tagName === 'input' && (el as HTMLInputElement).type === 'checkbox') {
        continue;
      }

      // Skip nested lists in inline serialization (handled by list block serializer)
      if (tagName === 'ul' || tagName === 'ol') {
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
 * Recursively serializes a list element (ul or ol) and all its nested sublists into Markdown lines.
 */
export function serializeListBlock(listEl: HTMLElement, indentLevel = 0): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(indentLevel);
  const isOrdered =
    listEl.tagName.toLowerCase() === 'ol' ||
    listEl.getAttribute('data-block-type') === 'ordered_list' ||
    listEl.classList.contains('ordered-list');

  let orderIndex = 1;

  for (let i = 0; i < listEl.children.length; i++) {
    const child = listEl.children[i] as HTMLElement;
    const childTag = child.tagName.toLowerCase();

    // Handle browser-quirk where a sublist is placed directly inside parent list instead of inside li
    if (childTag === 'ul' || childTag === 'ol') {
      const subLines = serializeListBlock(child, indentLevel + 1);
      lines.push(...subLines);
      continue;
    }

    if (childTag === 'li') {
      const isTaskItem =
        child.classList.contains('task-item') ||
        child.getAttribute('data-checked') !== null ||
        child.querySelector(':scope > input[type="checkbox"]') !== null;

      let prefix = '';
      if (isTaskItem) {
        const checkbox = child.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
        const isChecked = checkbox ? checkbox.checked : child.getAttribute('data-checked') === 'true';
        prefix = `- [${isChecked ? 'x' : ' '}] `;
      } else if (isOrdered) {
        prefix = `${orderIndex}. `;
        orderIndex++;
      } else {
        prefix = '- ';
      }

      const contentEl = child.querySelector(':scope > .task-content') || child;
      const text = serializeInlineNodes(contentEl).trim();
      lines.push(`${indent}${prefix}${text}`);

      // Inspect any nested lists inside this li (child ul/ol or inside task-content)
      const nestedLists: HTMLElement[] = [];
      for (let j = 0; j < child.children.length; j++) {
        const liChild = child.children[j] as HTMLElement;
        const liChildTag = liChild.tagName.toLowerCase();
        if (liChildTag === 'ul' || liChildTag === 'ol') {
          nestedLists.push(liChild);
        } else if (liChild.classList.contains('task-content')) {
          for (let k = 0; k < liChild.children.length; k++) {
            const taskChild = liChild.children[k] as HTMLElement;
            const taskChildTag = taskChild.tagName.toLowerCase();
            if (taskChildTag === 'ul' || taskChildTag === 'ol') {
              nestedLists.push(taskChild);
            }
          }
        }
      }

      for (const subList of nestedLists) {
        const subLines = serializeListBlock(subList, indentLevel + 1);
        lines.push(...subLines);
      }
    }
  }

  return lines;
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

    // Lists (Unordered, Ordered, Task Lists, and nested variations)
    if (
      tagName === 'ul' ||
      tagName === 'ol' ||
      blockType === 'unordered_list' ||
      blockType === 'ordered_list' ||
      blockType === 'task_list' ||
      blockEl.classList.contains('task-list') ||
      blockEl.classList.contains('bullet-list') ||
      blockEl.classList.contains('ordered-list')
    ) {
      const listLines = serializeListBlock(blockEl, 0);
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

/**
 * Safe wrapper around domToMarkdown that intercepts any serialization exceptions
 * and guards against returning an empty Markdown string when the DOM container
 * contains visible text or substantive block elements.
 */
export function safeDomToMarkdown(container: HTMLElement): { markdown: string; error?: Error } {
  try {
    const markdown = domToMarkdown(container);
    const visibleText = (container.textContent || '').trim();
    // If the DOM has text content but serializer produced empty markdown, flag an anomaly
    if (visibleText.length > 0 && markdown.trim().length === 0) {
      return {
        markdown: '',
        error: new Error('Serializer produced empty Markdown despite non-empty DOM content.'),
      };
    }
    return { markdown };
  } catch (err) {
    return {
      markdown: '',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

