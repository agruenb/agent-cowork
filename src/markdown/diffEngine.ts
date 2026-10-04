/**
 * Zero-dependency Diff Engine for Agent Cowork.
 * Computes line-level and intra-line word-level diffs,
 * formats code block diffs, and computes AI change statistics.
 */

import {
  escapeHtml,
  parseInlineMarkdown,
  isTableDelimiterRow,
  parseTableRow,
} from './parser';

export type DiffType = 'same' | 'add' | 'del';

export interface DiffLine {
  type: DiffType;
  text: string;
  originalLine?: number;
  modifiedLine?: number;
}

export interface DiffToken {
  type: DiffType;
  text: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  hasChanges: boolean;
}

/**
 * Computes the Longest Common Subsequence (LCS) matrix for two arrays.
 */
function computeLCS<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const m = a.length;
  const n = b.length;
  // Initialize (m+1) x (n+1) matrix
  const matrix: number[][] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1) as unknown as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (equals(a[i - 1], b[j - 1])) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  return matrix;
}

/**
 * Computes line-by-line diff between two strings.
 */
export function diffLines(original: string, modified: string): DiffLine[] {
  // Normalize CRLF to LF
  const origLines = original ? original.replace(/\r\n/g, '\n').split('\n') : [];
  const modLines = modified ? modified.replace(/\r\n/g, '\n').split('\n') : [];

  if (origLines.length === 0 && modLines.length === 0) {
    return [];
  }
  if (origLines.length === 0) {
    return modLines.map((text, idx) => ({ type: 'add', text, modifiedLine: idx + 1 }));
  }
  if (modLines.length === 0) {
    return origLines.map((text, idx) => ({ type: 'del', text, originalLine: idx + 1 }));
  }

  const matrix = computeLCS(origLines, modLines);
  const result: DiffLine[] = [];

  let i = origLines.length;
  let j = modLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      result.push({
        type: 'same',
        text: origLines[i - 1],
        originalLine: i,
        modifiedLine: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.push({
        type: 'add',
        text: modLines[j - 1],
        modifiedLine: j,
      });
      j--;
    } else if (i > 0) {
      result.push({
        type: 'del',
        text: origLines[i - 1],
        originalLine: i,
      });
      i--;
    }
  }

  result.reverse();
  return result;
}

/**
 * Tokenizes a string into words, whitespace, and symbols for intra-line diffing.
 */
export function tokenizeLine(line: string): string[] {
  if (!line) return [];
  const tokens = line.match(/(\s+|[a-zA-Z0-9_\u00C0-\u017F]+|[^\s\w\u00C0-\u017F])/g);
  return tokens || [line];
}

/**
 * Computes word-level diff between two lines of text.
 */
export function diffWords(originalLine: string, modifiedLine: string): DiffToken[] {
  const origTokens = tokenizeLine(originalLine);
  const modTokens = tokenizeLine(modifiedLine);

  if (origTokens.length === 0 && modTokens.length === 0) {
    return [];
  }
  if (origTokens.length === 0) {
    return [{ type: 'add', text: modifiedLine }];
  }
  if (modTokens.length === 0) {
    return [{ type: 'del', text: originalLine }];
  }

  const matrix = computeLCS(origTokens, modTokens);
  const result: DiffToken[] = [];

  let i = origTokens.length;
  let j = modTokens.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === modTokens[j - 1]) {
      result.push({
        type: 'same',
        text: origTokens[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.push({
        type: 'add',
        text: modTokens[j - 1],
      });
      j--;
    } else if (i > 0) {
      result.push({
        type: 'del',
        text: origTokens[i - 1],
      });
      i--;
    }
  }

  result.reverse();

  // Consolidate adjacent tokens of the same type for cleaner HTML
  return consolidateTokens(result);
}

function consolidateTokens(tokens: DiffToken[]): DiffToken[] {
  const consolidated: DiffToken[] = [];
  for (const token of tokens) {
    if (!token.text) continue;
    const last = consolidated[consolidated.length - 1];
    if (last && last.type === token.type) {
      last.text += token.text;
    } else {
      consolidated.push({ type: token.type, text: token.text });
    }
  }
  return consolidated;
}

/**
 * Computes statistics (number of additions and deletions) from a list of diff lines.
 */
export function countDiffStats(diffs: DiffLine[]): DiffStats {
  let additions = 0;
  let deletions = 0;

  for (const item of diffs) {
    if (item.type === 'add') {
      additions++;
    } else if (item.type === 'del') {
      deletions++;
    }
  }

  return {
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}

/**
 * Formats a code block diff into syntax-rich HTML with gutter markers (+/-) and word highlights.
 */
export function formatCodeBlockDiff(originalCode: string, modifiedCode: string): string {
  const lineDiffs = diffLines(originalCode, modifiedCode);
  const htmlRows: string[] = [];

  for (let i = 0; i < lineDiffs.length; i++) {
    const cur = lineDiffs[i];

    // Check if next is a paired addition/deletion for word diff
    if (cur.type === 'del' && i + 1 < lineDiffs.length && lineDiffs[i + 1].type === 'add') {
      const next = lineDiffs[i + 1];
      const wordDiff = diffWords(cur.text, next.text);

      // Render deletion line with word highlight
      let delHtml = '';
      for (const tok of wordDiff) {
        if (tok.type === 'del') {
          delHtml += `<span class="code-diff-token-del">${escapeHtml(tok.text)}</span>`;
        } else if (tok.type === 'same') {
          delHtml += escapeHtml(tok.text);
        }
      }
      htmlRows.push(
        `<div class="code-diff-line code-diff-del"><span class="code-diff-gutter" aria-hidden="true">-</span><span class="code-diff-content">${delHtml || '&nbsp;'}</span></div>`
      );

      // Render addition line with word highlight
      let addHtml = '';
      for (const tok of wordDiff) {
        if (tok.type === 'add') {
          addHtml += `<span class="code-diff-token-add">${escapeHtml(tok.text)}</span>`;
        } else if (tok.type === 'same') {
          addHtml += escapeHtml(tok.text);
        }
      }
      htmlRows.push(
        `<div class="code-diff-line code-diff-add"><span class="code-diff-gutter" aria-hidden="true">+</span><span class="code-diff-content">${addHtml || '&nbsp;'}</span></div>`
      );

      i++; // skip next since we paired it
      continue;
    }

    if (cur.type === 'add') {
      htmlRows.push(
        `<div class="code-diff-line code-diff-add"><span class="code-diff-gutter" aria-hidden="true">+</span><span class="code-diff-content">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    } else if (cur.type === 'del') {
      htmlRows.push(
        `<div class="code-diff-line code-diff-del"><span class="code-diff-gutter" aria-hidden="true">-</span><span class="code-diff-content">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    } else {
      htmlRows.push(
        `<div class="code-diff-line code-diff-same"><span class="code-diff-gutter" aria-hidden="true">&nbsp;</span><span class="code-diff-content">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    }
  }

  return `<div class="code-diff-container">${htmlRows.join('')}</div>`;
}

/**
 * Formats a full raw Markdown inline diff for display in Raw Mode during AI review.
 * Displays line numbers, gutter signs (+/-), and intra-line word/token diff highlights.
 */
export function formatRawDiff(originalMarkdown: string, modifiedMarkdown: string): string {
  const lineDiffs = diffLines(originalMarkdown, modifiedMarkdown);
  const htmlRows: string[] = [];

  for (let i = 0; i < lineDiffs.length; i++) {
    const cur = lineDiffs[i];

    // Check for paired deletion + addition (modified line)
    if (cur.type === 'del' && i + 1 < lineDiffs.length && lineDiffs[i + 1].type === 'add') {
      const next = lineDiffs[i + 1];
      const wordDiff = diffWords(cur.text, next.text);

      let delHtml = '';
      for (const tok of wordDiff) {
        if (tok.type === 'del') {
          delHtml += `<span class="raw-diff-token-del">${escapeHtml(tok.text)}</span>`;
        } else if (tok.type === 'same') {
          delHtml += escapeHtml(tok.text);
        }
      }

      let addHtml = '';
      for (const tok of wordDiff) {
        if (tok.type === 'add') {
          addHtml += `<span class="raw-diff-token-add">${escapeHtml(tok.text)}</span>`;
        } else if (tok.type === 'same') {
          addHtml += escapeHtml(tok.text);
        }
      }

      const origNum = cur.originalLine !== undefined ? String(cur.originalLine) : '';
      const modNum = next.modifiedLine !== undefined ? String(next.modifiedLine) : '';

      htmlRows.push(
        `<div class="raw-diff-line raw-diff-del"><span class="raw-diff-gutter-num">${origNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">-</span><span class="raw-diff-code">${delHtml || '&nbsp;'}</span></div>`
      );
      htmlRows.push(
        `<div class="raw-diff-line raw-diff-add"><span class="raw-diff-gutter-num">${modNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">+</span><span class="raw-diff-code">${addHtml || '&nbsp;'}</span></div>`
      );

      i++; // paired
      continue;
    }

    if (cur.type === 'add') {
      const modNum = cur.modifiedLine !== undefined ? String(cur.modifiedLine) : '';
      htmlRows.push(
        `<div class="raw-diff-line raw-diff-add"><span class="raw-diff-gutter-num">${modNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">+</span><span class="raw-diff-code">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    } else if (cur.type === 'del') {
      const origNum = cur.originalLine !== undefined ? String(cur.originalLine) : '';
      htmlRows.push(
        `<div class="raw-diff-line raw-diff-del"><span class="raw-diff-gutter-num">${origNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">-</span><span class="raw-diff-code">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    } else {
      const lineNum = cur.modifiedLine !== undefined ? String(cur.modifiedLine) : cur.originalLine !== undefined ? String(cur.originalLine) : '';
      htmlRows.push(
        `<div class="raw-diff-line raw-diff-same"><span class="raw-diff-gutter-num">${lineNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">&nbsp;</span><span class="raw-diff-code">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
    }
  }

  return `<div class="raw-diff-lines">${htmlRows.join('')}</div>`;
}

function parseListLine(line: string): { type: 'task' | 'bullet' | 'ordered'; checked?: boolean; content: string } | null {
  const trimmed = line.trim();
  const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
  if (taskMatch) {
    return { type: 'task', checked: taskMatch[1].toLowerCase() === 'x', content: taskMatch[2] };
  }
  const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
  if (bulletMatch) {
    return { type: 'bullet', content: bulletMatch[1] };
  }
  const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
  if (orderedMatch) {
    return { type: 'ordered', content: orderedMatch[2] };
  }
  return null;
}

/**
 * Detects whether lineDiffs starting at index i is the beginning of a markdown table.
 */
function isTableStart(diffs: DiffLine[], i: number): boolean {
  const line = diffs[i];
  if (!line || !line.text.includes('|') || isTableDelimiterRow(line.text)) {
    return false;
  }
  const trimmed = line.text.trim();
  if (trimmed.startsWith('```') || trimmed.startsWith('#')) {
    return false;
  }

  // Look ahead up to 4 lines for the delimiter row
  for (let j = i + 1; j < Math.min(diffs.length, i + 5); j++) {
    const nextLine = diffs[j];
    const nextTrimmed = nextLine.text.trim();
    if (!nextTrimmed || nextTrimmed.startsWith('```') || nextTrimmed.startsWith('#')) {
      return false;
    }
    if (isTableDelimiterRow(nextLine.text)) {
      return true;
    }
    if (!nextLine.text.includes('|')) {
      return false;
    }
  }

  return false;
}

/**
 * Renders a row of cells for a table diff.
 */
function renderTableRow(cells: string[], isHeader: boolean, rowDiffType: 'same' | 'add' | 'del'): string {
  const tag = isHeader ? 'th' : 'td';
  const cellHtmls = cells.map((c) => {
    const trimmed = c.trim();
    const checkboxMatch = trimmed.match(/^([-*+]?\s*)?\[([ xX])\]$/);
    if (checkboxMatch) {
      const isChecked = checkboxMatch[2].toLowerCase() === 'x';
      const checkedAttr = isChecked ? 'checked' : '';
      const checkedClass = isChecked ? ' is-checked' : '';
      return `<${tag} class="table-checkbox-cell${checkedClass}" data-checked="${isChecked ? 'true' : 'false'}"><input type="checkbox" class="table-cell-checkbox" ${checkedAttr} disabled></${tag}>`;
    }
    const inline = parseInlineMarkdown(c) || '&nbsp;';
    if (rowDiffType === 'add') {
      return `<${tag}><ins class="diff-ins">${inline}</ins></${tag}>`;
    } else if (rowDiffType === 'del') {
      return `<${tag}><del class="diff-del">${inline}</del></${tag}>`;
    }
    return `<${tag}>${inline}</${tag}>`;
  });
  return cellHtmls.join('');
}

/**
 * Renders a modified table row by computing cell-level diffs.
 */
function renderModifiedCells(oldCells: string[], newCells: string[], isHeader: boolean): string {
  const tag = isHeader ? 'th' : 'td';
  const maxCols = Math.max(oldCells.length, newCells.length);
  const cellHtmls: string[] = [];

  for (let c = 0; c < maxCols; c++) {
    const oldC = oldCells[c] !== undefined ? oldCells[c] : '';
    const newC = newCells[c] !== undefined ? newCells[c] : '';

    if (oldCells[c] === undefined) {
      // Cell was added
      cellHtmls.push(`<${tag} class="diff-cell-modified"><ins class="diff-ins">${parseInlineMarkdown(newC) || '&nbsp;'}</ins></${tag}>`);
    } else if (newCells[c] === undefined) {
      // Cell was removed
      cellHtmls.push(`<${tag} class="diff-cell-modified"><del class="diff-del">${parseInlineMarkdown(oldC) || '&nbsp;'}</del></${tag}>`);
    } else if (oldC === newC) {
      // Unchanged cell
      const checkboxMatch = newC.trim().match(/^([-*+]?\s*)?\[([ xX])\]$/);
      if (checkboxMatch) {
        const isChecked = checkboxMatch[2].toLowerCase() === 'x';
        const checkedAttr = isChecked ? 'checked' : '';
        const checkedClass = isChecked ? ' is-checked' : '';
        cellHtmls.push(`<${tag} class="table-checkbox-cell${checkedClass}" data-checked="${isChecked ? 'true' : 'false'}"><input type="checkbox" class="table-cell-checkbox" ${checkedAttr} disabled></${tag}>`);
      } else {
        cellHtmls.push(`<${tag}>${parseInlineMarkdown(newC) || '&nbsp;'}</${tag}>`);
      }
    } else {
      // Changed cell: compute token diff
      const wordTokens = diffWords(oldC, newC);
      let inlineHtml = '';
      for (const tok of wordTokens) {
        if (tok.type === 'del') {
          inlineHtml += `<del class="diff-del">${escapeHtml(tok.text)}</del>`;
        } else if (tok.type === 'add') {
          inlineHtml += `<ins class="diff-ins">${escapeHtml(tok.text)}</ins>`;
        } else {
          inlineHtml += escapeHtml(tok.text);
        }
      }
      cellHtmls.push(`<${tag} class="diff-cell-modified">${inlineHtml || '&nbsp;'}</${tag}>`);
    }
  }

  return cellHtmls.join('');
}

/**
 * Formats a collected sequence of table DiffLines into an HTML <table> diff block.
 */
function formatTableDiff(tableLines: DiffLine[]): string {
  let delimStart = -1;
  let delimEnd = -1;
  for (let idx = 0; idx < tableLines.length; idx++) {
    if (isTableDelimiterRow(tableLines[idx].text)) {
      delimStart = idx;
      delimEnd = idx;
      while (delimEnd + 1 < tableLines.length && isTableDelimiterRow(tableLines[delimEnd + 1].text)) {
        delimEnd++;
      }
      break;
    }
  }

  if (delimStart === -1) {
    return tableLines
      .map((l) => `<p class="editor-block diff-block-${l.type === 'add' ? 'added' : l.type === 'del' ? 'removed' : 'modified'}">${escapeHtml(l.text)}</p>`)
      .join('');
  }

  const headerDiffs = tableLines.slice(0, delimStart);
  const headerRowsHtml: string[] = [];

  if (headerDiffs.length === 2 && headerDiffs[0].type === 'del' && headerDiffs[1].type === 'add') {
    const oldHeaders = parseTableRow(headerDiffs[0].text);
    const newHeaders = parseTableRow(headerDiffs[1].text);
    headerRowsHtml.push(`<tr class="diff-row-modified">${renderModifiedCells(oldHeaders, newHeaders, true)}</tr>`);
  } else {
    for (const h of headerDiffs) {
      const cells = parseTableRow(h.text);
      if (h.type === 'add') {
        headerRowsHtml.push(`<tr class="diff-row-added">${renderTableRow(cells, true, 'add')}</tr>`);
      } else if (h.type === 'del') {
        headerRowsHtml.push(`<tr class="diff-row-deleted">${renderTableRow(cells, true, 'del')}</tr>`);
      } else {
        headerRowsHtml.push(`<tr>${renderTableRow(cells, true, 'same')}</tr>`);
      }
    }
  }

  const bodyDiffs = tableLines.slice(delimEnd + 1);
  const bodyRowsHtml: string[] = [];
  let r = 0;
  while (r < bodyDiffs.length) {
    const cur = bodyDiffs[r];

    if (cur.type === 'del' && r + 1 < bodyDiffs.length && bodyDiffs[r + 1].type === 'add') {
      const next = bodyDiffs[r + 1];
      const oldCells = parseTableRow(cur.text);
      const newCells = parseTableRow(next.text);
      bodyRowsHtml.push(`<tr class="diff-row-modified">${renderModifiedCells(oldCells, newCells, false)}</tr>`);
      r += 2;
      continue;
    }

    if (cur.type === 'add') {
      const cells = parseTableRow(cur.text);
      bodyRowsHtml.push(`<tr class="diff-row-added">${renderTableRow(cells, false, 'add')}</tr>`);
      r++;
      continue;
    }

    if (cur.type === 'del') {
      const cells = parseTableRow(cur.text);
      bodyRowsHtml.push(`<tr class="diff-row-deleted">${renderTableRow(cells, false, 'del')}</tr>`);
      r++;
      continue;
    }

    const cells = parseTableRow(cur.text);
    bodyRowsHtml.push(`<tr>${renderTableRow(cells, false, 'same')}</tr>`);
    r++;
  }

  const hasChanges = tableLines.some((l) => l.type !== 'same');
  const allAdded = tableLines.every((l) => l.type === 'add');
  const allDeleted = tableLines.every((l) => l.type === 'del');

  let tableDiffClass = '';
  if (allAdded) {
    tableDiffClass = ' diff-block-added';
  } else if (allDeleted) {
    tableDiffClass = ' diff-block-removed';
  } else if (hasChanges) {
    tableDiffClass = ' diff-block-modified';
  }

  return `<div class="editor-block table-wrapper${tableDiffClass}" data-block-type="table"><div class="table-scroll-wrapper"><table class="editor-table" contenteditable="false"><thead>${headerRowsHtml.join('')}</thead><tbody>${bodyRowsHtml.join('')}</tbody></table></div></div>`;
}

/**
 * Computes formatted markdown diff HTML from original and modified markdown strings.
 * Renders prose with inline `<ins>` and `<del>`, code blocks with line diffs,
 * and highlights added/modified blocks.
 */
export function formatMarkdownDiff(originalMarkdown: string, modifiedMarkdown: string): { html: string; stats: DiffStats } {
  const lineDiffs = diffLines(originalMarkdown, modifiedMarkdown);
  const stats = countDiffStats(lineDiffs);

  if (!stats.hasChanges) {
    return { html: '', stats };
  }

  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let origCodeLines: string[] = [];
  let modCodeLines: string[] = [];

  let i = 0;
  while (i < lineDiffs.length) {
    const item = lineDiffs[i];
    const trimmed = item.text.trim();

    // Check for fenced code block start or end
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        origCodeLines = [];
        modCodeLines = [];
        i++;
        continue;
      } else {
        inCodeBlock = false;
        const codeDiffHtml = formatCodeBlockDiff(origCodeLines.join('\n'), modCodeLines.join('\n'));
        const langDisplay = escapeHtml(codeBlockLang || 'Code');
        htmlParts.push(
          `<div class="editor-block code-block-wrapper code-diff-wrapper" data-block-type="code_block" data-language="${langDisplay}"><div class="code-block-header"><span class="code-diff-header-lang">${langDisplay}</span><span class="code-diff-badge">AI Diff</span></div><pre><code class="editor-code">${codeDiffHtml}</code></pre></div>`
        );
        i++;
        continue;
      }
    }

    if (inCodeBlock) {
      if (item.type === 'del') {
        origCodeLines.push(item.text);
      } else if (item.type === 'add') {
        modCodeLines.push(item.text);
      } else {
        origCodeLines.push(item.text);
        modCodeLines.push(item.text);
      }
      i++;
      continue;
    }

    // Check for Markdown table start
    if (!inCodeBlock && isTableStart(lineDiffs, i)) {
      const tableLines: DiffLine[] = [];
      while (i < lineDiffs.length) {
        const cur = lineDiffs[i];
        const curTrimmed = cur.text.trim();
        if (
          !curTrimmed ||
          !cur.text.includes('|') ||
          curTrimmed.startsWith('```') ||
          curTrimmed.startsWith('#')
        ) {
          break;
        }
        tableLines.push(cur);
        i++;
      }

      htmlParts.push(formatTableDiff(tableLines));
      continue;
    }

    // Check for paired deletion + addition (modified line)
    if (item.type === 'del' && i + 1 < lineDiffs.length && lineDiffs[i + 1].type === 'add') {
      const nextItem = lineDiffs[i + 1];
      const wordTokens = diffWords(item.text, nextItem.text);

      let inlineHtml = '';
      for (const tok of wordTokens) {
        if (tok.type === 'del') {
          inlineHtml += `<del class="diff-del">${escapeHtml(tok.text)}</del>`;
        } else if (tok.type === 'add') {
          inlineHtml += `<ins class="diff-ins">${escapeHtml(tok.text)}</ins>`;
        } else {
          inlineHtml += escapeHtml(tok.text);
        }
      }

      // Check if list item
      const listInfo = parseListLine(nextItem.text);
      if (listInfo) {
        if (listInfo.type === 'task') {
          const checkedAttr = listInfo.checked ? 'checked' : '';
          const checkedClass = listInfo.checked ? ' is-checked' : '';
          htmlParts.push(
            `<ul class="editor-block task-list diff-block-modified" data-block-type="task_list"><li class="task-item${checkedClass}"><input type="checkbox" class="task-checkbox" ${checkedAttr} disabled><span class="task-content">${inlineHtml}</span></li></ul>`
          );
        } else if (listInfo.type === 'bullet') {
          htmlParts.push(
            `<ul class="editor-block bullet-list diff-block-modified" data-block-type="unordered_list"><li>${inlineHtml}</li></ul>`
          );
        } else {
          htmlParts.push(
            `<ol class="editor-block ordered-list diff-block-modified" data-block-type="ordered_list"><li>${inlineHtml}</li></ol>`
          );
        }
        i += 2;
        continue;
      }

      // Check if heading
      const headingMatch = nextItem.text.trim().match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level} class="editor-block diff-block-modified" data-block-type="heading">${inlineHtml}</h${level}>`);
      } else {
        htmlParts.push(`<p class="editor-block diff-block-modified" data-block-type="paragraph">${inlineHtml || '<br>'}</p>`);
      }

      i += 2;
      continue;
    }

    if (item.type === 'add') {
      const listInfo = parseListLine(item.text);
      if (listInfo) {
        if (listInfo.type === 'task') {
          const checkedAttr = listInfo.checked ? 'checked' : '';
          const checkedClass = listInfo.checked ? ' is-checked' : '';
          htmlParts.push(
            `<ul class="editor-block task-list diff-block-added" data-block-type="task_list"><li class="task-item${checkedClass}"><input type="checkbox" class="task-checkbox" ${checkedAttr} disabled><span class="task-content"><ins class="diff-ins">${escapeHtml(listInfo.content)}</ins></span></li></ul>`
          );
        } else if (listInfo.type === 'bullet') {
          htmlParts.push(
            `<ul class="editor-block bullet-list diff-block-added" data-block-type="unordered_list"><li><ins class="diff-ins">${escapeHtml(listInfo.content)}</ins></li></ul>`
          );
        } else {
          htmlParts.push(
            `<ol class="editor-block ordered-list diff-block-added" data-block-type="ordered_list"><li><ins class="diff-ins">${escapeHtml(listInfo.content)}</ins></li></ol>`
          );
        }
        i++;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level} class="editor-block diff-block-added" data-block-type="heading"><ins class="diff-ins">${escapeHtml(headingMatch[2])}</ins></h${level}>`);
      } else if (trimmed) {
        htmlParts.push(`<p class="editor-block diff-block-added" data-block-type="paragraph"><ins class="diff-ins">${escapeHtml(item.text)}</ins></p>`);
      }
      i++;
      continue;
    }

    if (item.type === 'del') {
      const listInfo = parseListLine(item.text);
      if (listInfo) {
        if (listInfo.type === 'task') {
          const checkedAttr = listInfo.checked ? 'checked' : '';
          const checkedClass = listInfo.checked ? ' is-checked' : '';
          htmlParts.push(
            `<ul class="editor-block task-list diff-block-removed" data-block-type="task_list"><li class="task-item${checkedClass}"><input type="checkbox" class="task-checkbox" ${checkedAttr} disabled><span class="task-content"><del class="diff-del">${escapeHtml(listInfo.content)}</del></span></li></ul>`
          );
        } else if (listInfo.type === 'bullet') {
          htmlParts.push(
            `<ul class="editor-block bullet-list diff-block-removed" data-block-type="unordered_list"><li><del class="diff-del">${escapeHtml(listInfo.content)}</del></li></ul>`
          );
        } else {
          htmlParts.push(
            `<ol class="editor-block ordered-list diff-block-removed" data-block-type="ordered_list"><li><del class="diff-del">${escapeHtml(listInfo.content)}</del></li></ol>`
          );
        }
        i++;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level} class="editor-block diff-block-removed" data-block-type="heading"><del class="diff-del">${escapeHtml(headingMatch[2])}</del></h${level}>`);
      } else if (trimmed) {
        htmlParts.push(`<p class="editor-block diff-block-removed" data-block-type="paragraph"><del class="diff-del">${escapeHtml(item.text)}</del></p>`);
      }
      i++;
      continue;
    }

    // Unchanged lines (type === 'same')
    if (trimmed) {
      const listInfo = parseListLine(item.text);
      if (listInfo) {
        if (listInfo.type === 'task') {
          const checkedAttr = listInfo.checked ? 'checked' : '';
          const checkedClass = listInfo.checked ? ' is-checked' : '';
          htmlParts.push(
            `<ul class="editor-block task-list" data-block-type="task_list"><li class="task-item${checkedClass}"><input type="checkbox" class="task-checkbox" ${checkedAttr} disabled><span class="task-content">${escapeHtml(listInfo.content)}</span></li></ul>`
          );
        } else if (listInfo.type === 'bullet') {
          htmlParts.push(
            `<ul class="editor-block bullet-list" data-block-type="unordered_list"><li>${escapeHtml(listInfo.content)}</li></ul>`
          );
        } else {
          htmlParts.push(
            `<ol class="editor-block ordered-list" data-block-type="ordered_list"><li>${escapeHtml(listInfo.content)}</li></ol>`
          );
        }
        i++;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level} class="editor-block" data-block-type="heading">${escapeHtml(headingMatch[2])}</h${level}>`);
      } else {
        htmlParts.push(`<p class="editor-block" data-block-type="paragraph">${escapeHtml(item.text)}</p>`);
      }
    }
    i++;
  }

  if (inCodeBlock) {
    const codeDiffHtml = formatCodeBlockDiff(origCodeLines.join('\n'), modCodeLines.join('\n'));
    htmlParts.push(
      `<div class="editor-block code-block-wrapper code-diff-wrapper" data-block-type="code_block"><pre><code class="editor-code">${codeDiffHtml}</code></pre></div>`
    );
  }

  return {
    html: htmlParts.join('\n'),
    stats,
  };
}
