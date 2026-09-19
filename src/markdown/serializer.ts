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

      // Skip UI controls in inline serialization
      if (
        el.classList.contains('block-delete-btn') ||
        el.classList.contains('block-confirm-popup') ||
        el.classList.contains('table-controls') ||
        el.classList.contains('table-confirm-popup')
      ) {
        continue;
      }

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
      let text = serializeInlineNodes(contentEl).trim();
      // Remove any trailing/leading newlines that may have been caused by <br> in list items
      text = text.replace(/^\n+|\n+$/g, '').trim();
      lines.push(`${indent}${prefix}${text}`);

      // Inspect any nested lists inside this li (sublists whose immediate ancestor li is this child)
      const allSubLists = Array.from(child.querySelectorAll<HTMLElement>('ul, ol'));
      const nestedLists = allSubLists.filter((subList) => subList.closest('li') === child);

      for (const subList of nestedLists) {
        const subLines = serializeListBlock(subList, indentLevel + 1);
        lines.push(...subLines);
      }
    }
  }

  return lines;
}

/**
 * Serializes a single block element or container element into one or more Markdown blocks.
 */
function serializeBlockElement(blockEl: HTMLElement): string[] {
  // Block containers: unwrap and serialize child blocks (skipping UI buttons/controls)
  if (blockEl.classList.contains('editor-block-container')) {
    const subBlocks: string[] = [];
    for (let i = 0; i < blockEl.children.length; i++) {
      const child = blockEl.children[i] as HTMLElement;
      if (
        child.classList.contains('block-delete-btn') ||
        child.classList.contains('block-confirm-popup') ||
        child.classList.contains('table-controls') ||
        child.classList.contains('table-confirm-popup')
      ) {
        continue;
      }
      subBlocks.push(...serializeBlockElement(child));
    }
    if (subBlocks.length > 0) {
      return subBlocks;
    }
  }

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
    return [`${prefix} ${content}`];
  }

  // Horizontal Rule
  if (tagName === 'hr' || blockType === 'hr') {
    return ['---'];
  }

  // Code Block
  if (blockEl.classList.contains('code-block-wrapper') || blockType === 'code_block') {
    const lang = blockEl.getAttribute('data-language') || '';
    const codeEl = blockEl.querySelector('code');
    const codeText = codeEl ? (codeEl.textContent || '') : '';
    return [`\`\`\`${lang}\n${codeText}\n\`\`\``];
  }

  // Blockquote
  if (tagName === 'blockquote' || blockType === 'blockquote') {
    const quoteParagraphs = blockEl.querySelectorAll('p');
    if (quoteParagraphs.length > 0) {
      const quoteLines: string[] = [];
      quoteParagraphs.forEach((p) => {
        quoteLines.push(`> ${serializeInlineNodes(p).trim()}`);
      });
      return [quoteLines.join('\n')];
    } else {
      const lines = (blockEl.textContent || '').split('\n');
      return [lines.map((l) => `> ${l.trim()}`).join('\n')];
    }
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
    return listLines.length > 0 ? [listLines.join('\n')] : [];
  }

  // Orphaned list item at root level
  if (tagName === 'li') {
    const isTaskItem =
      blockEl.classList.contains('task-item') ||
      blockEl.getAttribute('data-checked') !== null ||
      blockEl.querySelector(':scope > input[type="checkbox"]') !== null;
    let prefix = '- ';
    if (isTaskItem) {
      const cb = blockEl.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      const isChecked = cb ? cb.checked : blockEl.getAttribute('data-checked') === 'true';
      prefix = `- [${isChecked ? 'x' : ' '}] `;
    }
    const contentEl = blockEl.querySelector(':scope > .task-content') || blockEl;
    const text = serializeInlineNodes(contentEl).trim();
    return [`${prefix}${text}`];
  }

  // Table
  if (blockEl.classList.contains('table-wrapper') || tagName === 'table' || blockType === 'table') {
    const table = blockEl.tagName.toLowerCase() === 'table' ? blockEl : blockEl.querySelector('table');
    if (table) {
      const serializeCell = (cell: HTMLElement): string => {
        const cb = cell.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        const inlineText = serializeInlineNodes(cell).trim();
        if (cell.classList.contains('table-checkbox-cell') || (cb && !inlineText)) {
          const isChecked = cb ? cb.checked : cell.getAttribute('data-checked') === 'true';
          return `[${isChecked ? 'x' : ' '}]`;
        }
        return inlineText || ' ';
      };

      const headerCells = table.querySelectorAll('thead th');
      const headers: string[] = [];
      headerCells.forEach((th) => headers.push(serializeCell(th as HTMLElement)));

      const bodyRows = table.querySelectorAll('tbody tr');
      const rows: string[][] = [];
      bodyRows.forEach((tr) => {
        const rowCells: string[] = [];
        tr.querySelectorAll('td').forEach((td) => {
          rowCells.push(serializeCell(td as HTMLElement));
        });
        rows.push(rowCells);
      });

      if (headers.length > 0) {
        const headerLine = `| ${headers.join(' | ')} |`;
        const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
        const rowLines = rows.map((r) => `| ${r.join(' | ')} |`);
        return [[headerLine, sepLine, ...rowLines].join('\n')];
      }
    }
  }

  // Container elements (p, div, etc.): check if it contains child block elements
  // (e.g. browser putting <ul> inside <div> or <p>, or table inside <div>)
  const hasBlockChildren = blockEl.querySelector(
    'ul, ol, table, .table-wrapper, .code-block-wrapper, blockquote, h1, h2, h3, h4, h5, h6, hr, .editor-block-container'
  );

  if (hasBlockChildren) {
    const subBlocks: string[] = [];
    let currentInlineNodes: Node[] = [];

    const flushInlineNodes = () => {
      if (currentInlineNodes.length > 0) {
        const tempContainer = blockEl.ownerDocument.createElement('span');
        currentInlineNodes.forEach((n) => tempContainer.appendChild(n.cloneNode(true)));
        const text = serializeInlineNodes(tempContainer).trim();
        if (text) {
          subBlocks.push(text);
        }
        currentInlineNodes = [];
      }
    };

    for (let i = 0; i < blockEl.childNodes.length; i++) {
      const childNode = blockEl.childNodes[i];
      if (childNode.nodeType === 1 /* Element */) {
        const childEl = childNode as HTMLElement;
        const childTag = childEl.tagName.toLowerCase();
        const isBlock =
          childTag === 'ul' ||
          childTag === 'ol' ||
          childTag === 'table' ||
          childTag === 'blockquote' ||
          childTag === 'hr' ||
          /^h[1-6]$/.test(childTag) ||
          childEl.classList.contains('table-wrapper') ||
          childEl.classList.contains('code-block-wrapper') ||
          childEl.classList.contains('editor-block-container') ||
          childEl.classList.contains('task-list') ||
          childEl.classList.contains('bullet-list') ||
          childEl.classList.contains('ordered-list');

        if (isBlock) {
          flushInlineNodes();
          subBlocks.push(...serializeBlockElement(childEl));
          continue;
        }
      }
      currentInlineNodes.push(childNode);
    }
    flushInlineNodes();

    if (subBlocks.length > 0) {
      return subBlocks;
    }
  }

  // Standard Paragraph or generic div
  const pContent = serializeInlineNodes(blockEl).trim();
  if (pContent) {
    return [pContent];
  }

  return [];
}

/**
 * Serializes the entire editor DOM container into standard Markdown.
 */
export function domToMarkdown(editorRoot: HTMLElement): string {
  const blocks: string[] = [];

  for (let i = 0; i < editorRoot.childNodes.length; i++) {
    const node = editorRoot.childNodes[i];
    if (node.nodeType === 1 /* Element */) {
      const blockEl = node as HTMLElement;
      const serializedBlocks = serializeBlockElement(blockEl);
      blocks.push(...serializedBlocks);
    } else if (node.nodeType === 3 /* Text */) {
      const text = (node.nodeValue || '').trim();
      if (text) {
        blocks.push(text);
      }
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

