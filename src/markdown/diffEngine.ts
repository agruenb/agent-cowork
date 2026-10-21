/**
 * Zero-dependency AI Diff Engine for Agent Cowork.
 * Implements block-level alignment, component-specific diffing,
 * markdown-aware inline diffing with sentinel merge, and grid-based table diffs.
 */

import {
  escapeHtml,
  parseInlineMarkdown,
  MarkdownBlock,
  MarkdownListItem,
  RenderContext,
  parseMarkdownToBlocks,
  renderHeading,
  renderParagraph,
  renderBlockquote,
  renderCodeBlock,
  renderList,
  renderTable,
  renderHr,
  renderBlock,
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

export interface PairedChange<T> {
  del?: T;
  add?: T;
}

/**
 * Computes the Longest Common Subsequence (LCS) matrix for two arrays.
 */
export function computeLCS<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const m = a.length;
  const n = b.length;
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
 * Token-level Dice coefficient similarity metric between two strings.
 */
export function diceSimilarity(textA: string, textB: string): number {
  if (textA === textB) return 1.0;
  if (!textA || !textB) return 0.0;
  const tokensA = tokenizeLine(textA).filter((t) => t.trim().length > 0);
  const tokensB = tokenizeLine(textB).filter((t) => t.trim().length > 0);
  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const freqA = new Map<string, number>();
  for (const t of tokensA) {
    freqA.set(t, (freqA.get(t) || 0) + 1);
  }
  let intersection = 0;
  for (const t of tokensB) {
    const count = freqA.get(t);
    if (count && count > 0) {
      intersection++;
      freqA.set(t, count - 1);
    }
  }

  return (2 * intersection) / (tokensA.length + tokensB.length);
}

/**
 * Monotonically pairs deleted items with added items based on similarity.
 * Preserves sequential document order.
 */
export function pairChangeRuns<T>(
  delRun: T[],
  addRun: T[],
  similarity: (del: T, add: T) => number,
  threshold = 0.35
): PairedChange<T>[] {
  const n = delRun.length;
  const m = addRun.length;

  if (n === 0) {
    return addRun.map((add) => ({ add }));
  }
  if (m === 0) {
    return delRun.map((del) => ({ del }));
  }
  if (n === 1 && m === 1) {
    return [{ del: delRun[0], add: addRun[0] }];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1) as unknown as number[]);
  const backtrack: ('diag' | 'up' | 'left')[][] = Array.from({ length: n + 1 }, () => new Array(m + 1));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(delRun[i - 1], addRun[j - 1]);
      const matchScore = sim >= threshold ? dp[i - 1][j - 1] + sim : -1;

      if (matchScore > dp[i - 1][j] && matchScore > dp[i][j - 1]) {
        dp[i][j] = matchScore;
        backtrack[i][j] = 'diag';
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        dp[i][j] = dp[i - 1][j];
        backtrack[i][j] = 'up';
      } else {
        dp[i][j] = dp[i][j - 1];
        backtrack[i][j] = 'left';
      }
    }
  }

  const pairedDel = new Map<number, number>();
  const pairedAdd = new Set<number>();

  let currI = n;
  let currJ = m;
  while (currI > 0 && currJ > 0) {
    const dir = backtrack[currI][currJ];
    if (dir === 'diag') {
      pairedDel.set(currI - 1, currJ - 1);
      pairedAdd.add(currJ - 1);
      currI--;
      currJ--;
    } else if (dir === 'up') {
      currI--;
    } else {
      currJ--;
    }
  }

  const result: PairedChange<T>[] = [];
  let delIdx = 0;
  let addIdx = 0;

  while (delIdx < n || addIdx < m) {
    if (delIdx < n && pairedDel.has(delIdx)) {
      const targetAddIdx = pairedDel.get(delIdx)!;
      while (addIdx < targetAddIdx) {
        if (!pairedAdd.has(addIdx)) {
          result.push({ add: addRun[addIdx] });
        }
        addIdx++;
      }
      result.push({ del: delRun[delIdx], add: addRun[targetAddIdx] });
      delIdx++;
      addIdx = targetAddIdx + 1;
    } else if (delIdx < n) {
      result.push({ del: delRun[delIdx] });
      delIdx++;
    } else if (addIdx < m) {
      if (!pairedAdd.has(addIdx)) {
        result.push({ add: addRun[addIdx] });
      }
      addIdx++;
    }
  }

  return result;
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
 * Formats a code block diff into HTML with gutter markers (+/-) and word highlights,
 * using run pairing to prevent line transposition.
 */
export function formatCodeBlockDiff(originalCode: string, modifiedCode: string): string {
  const lineDiffs = diffLines(originalCode, modifiedCode);
  const htmlRows: string[] = [];

  let i = 0;
  while (i < lineDiffs.length) {
    if (lineDiffs[i].type === 'same') {
      htmlRows.push(
        `<div class="code-diff-line code-diff-same"><span class="code-diff-gutter" aria-hidden="true">&nbsp;</span><span class="code-diff-content">${escapeHtml(lineDiffs[i].text) || '&nbsp;'}</span></div>`
      );
      i++;
      continue;
    }

    // Collect run of del and add
    const delRun: DiffLine[] = [];
    const addRun: DiffLine[] = [];
    while (i < lineDiffs.length && lineDiffs[i].type === 'del') {
      delRun.push(lineDiffs[i]);
      i++;
    }
    while (i < lineDiffs.length && lineDiffs[i].type === 'add') {
      addRun.push(lineDiffs[i]);
      i++;
    }

    const pairs = pairChangeRuns(delRun, addRun, (a, b) => diceSimilarity(a.text, b.text), 0.3);

    for (const pair of pairs) {
      if (pair.del && pair.add) {
        const wordDiff = diffWords(pair.del.text, pair.add.text);

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
      } else if (pair.del) {
        htmlRows.push(
          `<div class="code-diff-line code-diff-del"><span class="code-diff-gutter" aria-hidden="true">-</span><span class="code-diff-content">${escapeHtml(pair.del.text) || '&nbsp;'}</span></div>`
        );
      } else if (pair.add) {
        htmlRows.push(
          `<div class="code-diff-line code-diff-add"><span class="code-diff-gutter" aria-hidden="true">+</span><span class="code-diff-content">${escapeHtml(pair.add.text) || '&nbsp;'}</span></div>`
        );
      }
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

  let i = 0;
  while (i < lineDiffs.length) {
    if (lineDiffs[i].type === 'same') {
      const cur = lineDiffs[i];
      const lineNum = cur.modifiedLine !== undefined ? String(cur.modifiedLine) : cur.originalLine !== undefined ? String(cur.originalLine) : '';
      htmlRows.push(
        `<div class="raw-diff-line raw-diff-same"><span class="raw-diff-gutter-num">${lineNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">&nbsp;</span><span class="raw-diff-code">${escapeHtml(cur.text) || '&nbsp;'}</span></div>`
      );
      i++;
      continue;
    }

    const delRun: DiffLine[] = [];
    const addRun: DiffLine[] = [];
    while (i < lineDiffs.length && lineDiffs[i].type === 'del') {
      delRun.push(lineDiffs[i]);
      i++;
    }
    while (i < lineDiffs.length && lineDiffs[i].type === 'add') {
      addRun.push(lineDiffs[i]);
      i++;
    }

    const pairs = pairChangeRuns(delRun, addRun, (a, b) => diceSimilarity(a.text, b.text), 0.3);

    for (const pair of pairs) {
      if (pair.del && pair.add) {
        const wordDiff = diffWords(pair.del.text, pair.add.text);

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

        const origNum = pair.del.originalLine !== undefined ? String(pair.del.originalLine) : '';
        const modNum = pair.add.modifiedLine !== undefined ? String(pair.add.modifiedLine) : '';

        htmlRows.push(
          `<div class="raw-diff-line raw-diff-del"><span class="raw-diff-gutter-num">${origNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">-</span><span class="raw-diff-code">${delHtml || '&nbsp;'}</span></div>`
        );
        htmlRows.push(
          `<div class="raw-diff-line raw-diff-add"><span class="raw-diff-gutter-num">${modNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">+</span><span class="raw-diff-code">${addHtml || '&nbsp;'}</span></div>`
        );
      } else if (pair.del) {
        const origNum = pair.del.originalLine !== undefined ? String(pair.del.originalLine) : '';
        htmlRows.push(
          `<div class="raw-diff-line raw-diff-del"><span class="raw-diff-gutter-num">${origNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">-</span><span class="raw-diff-code">${escapeHtml(pair.del.text) || '&nbsp;'}</span></div>`
        );
      } else if (pair.add) {
        const modNum = pair.add.modifiedLine !== undefined ? String(pair.add.modifiedLine) : '';
        htmlRows.push(
          `<div class="raw-diff-line raw-diff-add"><span class="raw-diff-gutter-num">${modNum}</span><span class="raw-diff-gutter-sign" aria-hidden="true">+</span><span class="raw-diff-code">${escapeHtml(pair.add.text) || '&nbsp;'}</span></div>`
        );
      }
    }
  }

  return `<div class="raw-diff-lines">${htmlRows.join('')}</div>`;
}

// ============================================================================
// Markdown-Aware Inline Tokenizer & Differ with Sentinel Merge
// ============================================================================

const INLINE_TOKEN_REGEX = /(\[(?:[^\]]+)\]\((?:(?:<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?)\)|`[^`]+`|\*{3}|_{3}|\*{2}|_{2}|~~|\*|_|\s+|[a-zA-Z0-9_\u00C0-\u017F]+|[^\s\w\u00C0-\u017F])/g;

export function tokenizeMarkdownInline(text: string): string[] {
  if (!text) return [];
  const matches = text.match(INLINE_TOKEN_REGEX);
  return matches || [text];
}

function stripFormatting(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1$2$3')
    .replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1$2$3')
    .replace(/~~(.*?)~~/g, '$1')
    .trim();
}

const INS_START = '\uE000';
const INS_END = '\uE001';
const DEL_START = '\uE002';
const DEL_END = '\uE003';

function splitSentinelsAcrossDelimiters(str: string): string {
  const delimiters = ['***', '___', '**', '__', '~~', '*', '_', '`'];
  let res = str;
  for (const d of delimiters) {
    const escaped = d.replace(/[*_`~]/g, '\\$&');
    res = res.replace(new RegExp(`\uE000([^\uE001]*?)${escaped}([^\uE001]*?)\uE001`, 'g'), `\uE000$1\uE001${d}\uE000$2\uE001`);
    res = res.replace(new RegExp(`\uE002([^\uE003]*?)${escaped}([^\uE003]*?)\uE003`, 'g'), `\uE002$1\uE003${d}\uE002$2\uE003`);
  }
  res = res.replace(/\uE000\uE001/g, '').replace(/\uE002\uE003/g, '');
  return res;
}

interface ParsedLink {
  label: string;
  href: string;
  title?: string;
}

function parseLinkToken(tok: string): ParsedLink | null {
  const m = tok.match(/^\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/);
  if (!m) return null;
  return {
    label: m[1],
    href: m[2] || m[3] || '',
    title: m[4] || m[5],
  };
}

/**
 * Computes intra-line inline diff rendering real markdown formatting and <ins>/<del> tags.
 */
export function diffInlineMarkdown(originalText: string, modifiedText: string): string {
  if (originalText === modifiedText) {
    return parseInlineMarkdown(modifiedText);
  }
  if (!originalText) {
    return `<ins class="diff-ins">${parseInlineMarkdown(modifiedText)}</ins>`;
  }
  if (!modifiedText) {
    return `<del class="diff-del">${parseInlineMarkdown(originalText)}</del>`;
  }

  // Pure formatting change check (e.g. word -> **word**)
  if (stripFormatting(originalText) === stripFormatting(modifiedText)) {
    const origHtml = parseInlineMarkdown(originalText);
    const modHtml = parseInlineMarkdown(modifiedText);

    const annotated = modHtml.replace(/<(strong|em|code|del)(?![^>]*class=)([^>]*)>/g, (_match, tag, rest) => {
      if (!origHtml.includes(`<${tag}`)) {
        return `<${tag} class="diff-format-changed" title="Formatting changed"${rest}>`;
      }
      return _match;
    });
    return annotated;
  }

  const origTokens = tokenizeMarkdownInline(originalText);
  const modTokens = tokenizeMarkdownInline(modifiedText);

  const matrix = computeLCS(origTokens, modTokens);
  const diffTokens: DiffToken[] = [];

  let i = origTokens.length;
  let j = modTokens.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === modTokens[j - 1]) {
      diffTokens.push({ type: 'same', text: origTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      diffTokens.push({ type: 'add', text: modTokens[j - 1] });
      j--;
    } else if (i > 0) {
      diffTokens.push({ type: 'del', text: origTokens[i - 1] });
      i--;
    }
  }

  diffTokens.reverse();

  // Sentinel merge
  let mergedStr = '';
  const htmlPlaceholders: string[] = [];
  const makePlaceholder = (html: string): string => {
    const pIdx = htmlPlaceholders.length;
    htmlPlaceholders.push(html);
    return `\uE004${pIdx}\uE005`;
  };

  let idx = 0;
  while (idx < diffTokens.length) {
    const cur = diffTokens[idx];

    // Check for paired link change
    if (cur.type === 'del' && idx + 1 < diffTokens.length && diffTokens[idx + 1].type === 'add') {
      const next = diffTokens[idx + 1];
      const link1 = parseLinkToken(cur.text);
      const link2 = parseLinkToken(next.text);

      if (link1 && link2) {
        if (link1.label === link2.label && link1.href !== link2.href) {
          const linkHtml = `<a href="${link2.href}" class="editor-link diff-link-changed" data-diff-old-href="${link1.href}" title="Target changed: ${link1.href} → ${link2.href}" target="_blank" rel="noopener noreferrer">${escapeHtml(link2.label)}</a>`;
          mergedStr += makePlaceholder(linkHtml);
          idx += 2;
          continue;
        } else if (link1.label !== link2.label && link1.href === link2.href) {
          const linkHtml = `<a href="${link2.href}" class="editor-link" target="_blank" rel="noopener noreferrer"><del class="diff-del">${escapeHtml(link1.label)}</del><ins class="diff-ins">${escapeHtml(link2.label)}</ins></a>`;
          mergedStr += makePlaceholder(linkHtml);
          idx += 2;
          continue;
        }
      }
    }

    if (cur.type === 'del') {
      mergedStr += `${DEL_START}${cur.text}${DEL_END}`;
    } else if (cur.type === 'add') {
      mergedStr += `${INS_START}${cur.text}${INS_END}`;
    } else {
      mergedStr += cur.text;
    }
    idx++;
  }

  const sanitized = splitSentinelsAcrossDelimiters(mergedStr);
  const parsed = parseInlineMarkdown(sanitized);

  // Replace sentinels with ins/del tags
  let result = parsed
    .replace(new RegExp(INS_START, 'g'), '<ins class="diff-ins">')
    .replace(new RegExp(INS_END, 'g'), '</ins>')
    .replace(new RegExp(DEL_START, 'g'), '<del class="diff-del">')
    .replace(new RegExp(DEL_END, 'g'), '</del>');

  // Restore protected HTML placeholders
  for (let pIdx = 0; pIdx < htmlPlaceholders.length; pIdx++) {
    result = result.replace(`\uE004${pIdx}\uE005`, htmlPlaceholders[pIdx]);
  }

  return result;
}

// ============================================================================
// Component-Specific Differs
// ============================================================================

function diffBlockquote(orig: MarkdownBlock, mod: MarkdownBlock, ctx: RenderContext): string {
  const origLines = (orig.content || '').split('\n');
  const modLines = (mod.content || '').split('\n');

  const lineDiffs = diffLines(origLines.join('\n'), modLines.join('\n'));
  const pParts: string[] = [];

  let i = 0;
  while (i < lineDiffs.length) {
    if (lineDiffs[i].type === 'same') {
      pParts.push(`<p>${parseInlineMarkdown(lineDiffs[i].text)}</p>`);
      i++;
      continue;
    }

    const delRun: DiffLine[] = [];
    const addRun: DiffLine[] = [];
    while (i < lineDiffs.length && lineDiffs[i].type === 'del') {
      delRun.push(lineDiffs[i]);
      i++;
    }
    while (i < lineDiffs.length && lineDiffs[i].type === 'add') {
      addRun.push(lineDiffs[i]);
      i++;
    }

    const pairs = pairChangeRuns(delRun, addRun, (a, b) => diceSimilarity(a.text, b.text), 0.35);
    for (const pair of pairs) {
      if (pair.del && pair.add) {
        pParts.push(`<p>${diffInlineMarkdown(pair.del.text, pair.add.text)}</p>`);
      } else if (pair.del) {
        pParts.push(`<p class="diff-line-del"><del class="diff-del">${parseInlineMarkdown(pair.del.text)}</del></p>`);
      } else if (pair.add) {
        pParts.push(`<p class="diff-line-add"><ins class="diff-ins">${parseInlineMarkdown(pair.add.text)}</ins></p>`);
      }
    }
  }

  return renderBlockquote(mod, {
    ...ctx,
    diffContext: {
      diffType: 'modified',
      diffHtml: pParts.join(''),
    },
  });
}

function diffListItems(
  oldItems: MarkdownListItem[],
  newItems: MarkdownListItem[],
  listType: 'task_list' | 'unordered_list' | 'ordered_list',
  _ctx: RenderContext
): MarkdownListItem[] {
  const matrix = computeLCS(oldItems, newItems, (a, b) => a.text === b.text && a.checked === b.checked);
  const diffItems: { type: DiffType; item: MarkdownListItem }[] = [];

  let i = oldItems.length;
  let j = newItems.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldItems[i - 1].text === newItems[j - 1].text && oldItems[i - 1].checked === newItems[j - 1].checked) {
      diffItems.push({ type: 'same', item: newItems[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      diffItems.push({ type: 'add', item: newItems[j - 1] });
      j--;
    } else if (i > 0) {
      diffItems.push({ type: 'del', item: oldItems[i - 1] });
      i--;
    }
  }

  diffItems.reverse();

  const resultItems: MarkdownListItem[] = [];
  let ordValue = 1;

  let idx = 0;
  while (idx < diffItems.length) {
    if (diffItems[idx].type === 'same') {
      const it = diffItems[idx].item;
      resultItems.push({
        text: it.text,
        checked: it.checked,
        children: it.children,
        value: listType === 'ordered_list' ? ordValue++ : undefined,
      });
      idx++;
      continue;
    }

    const delRun: MarkdownListItem[] = [];
    const addRun: MarkdownListItem[] = [];
    while (idx < diffItems.length && diffItems[idx].type === 'del') {
      delRun.push(diffItems[idx].item);
      idx++;
    }
    while (idx < diffItems.length && diffItems[idx].type === 'add') {
      addRun.push(diffItems[idx].item);
      idx++;
    }

    const pairs = pairChangeRuns(delRun, addRun, (a, b) => diceSimilarity(a.text, b.text), 0.3);

    for (const pair of pairs) {
      if (pair.del && pair.add) {
        const textChanged = pair.del.text !== pair.add.text;
        const cbChanged = pair.del.checked !== undefined && pair.add.checked !== undefined && pair.del.checked !== pair.add.checked;
        const inlineHtml = textChanged ? diffInlineMarkdown(pair.del.text, pair.add.text) : parseInlineMarkdown(pair.add.text);

        let mergedChildren: MarkdownBlock[] | undefined;
        if (pair.del.children && pair.add.children) {
          mergedChildren = pair.add.children;
        } else if (pair.add.children) {
          mergedChildren = pair.add.children;
        }

        resultItems.push({
          text: pair.add.text,
          checked: pair.add.checked,
          oldChecked: cbChanged ? pair.del.checked : undefined,
          diffType: textChanged || cbChanged ? 'modified' : undefined,
          diffHtml: inlineHtml,
          children: mergedChildren,
          value: listType === 'ordered_list' ? ordValue++ : undefined,
        });
      } else if (pair.del) {
        resultItems.push({
          text: pair.del.text,
          checked: pair.del.checked,
          diffType: 'removed',
          diffHtml: parseInlineMarkdown(pair.del.text),
          children: pair.del.children,
        });
      } else if (pair.add) {
        resultItems.push({
          text: pair.add.text,
          checked: pair.add.checked,
          diffType: 'added',
          diffHtml: parseInlineMarkdown(pair.add.text),
          children: pair.add.children,
          value: listType === 'ordered_list' ? ordValue++ : undefined,
        });
      }
    }
  }

  return resultItems;
}

function diffList(orig: MarkdownBlock, mod: MarkdownBlock, ctx: RenderContext): string {
  const mergedItems = diffListItems(orig.items || [], mod.items || [], mod.type as any, ctx);
  const diffBlock: MarkdownBlock = {
    ...mod,
    items: mergedItems,
  };
  return renderList(diffBlock, {
    ...ctx,
    diffContext: {
      diffType: 'modified',
    },
  });
}

function parseCellCheckbox(cell: string): boolean | null {
  const m = cell.trim().match(/^([-*+]?\s*)?\[([ xX])\]$/);
  if (!m) return null;
  return m[2].toLowerCase() === 'x';
}

function diffTable(orig: MarkdownBlock, mod: MarkdownBlock, ctx: RenderContext): { html: string; unpairable?: boolean } {
  const oldHeaders = orig.headers || [];
  const newHeaders = mod.headers || [];

  // Check structural compatibility
  if (oldHeaders.length > 0 && newHeaders.length > 0) {
    const lcs = computeLCS(oldHeaders, newHeaders, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
    if (lcs[oldHeaders.length][newHeaders.length] === 0) {
      // Unpairable schema
      const oldHtml = renderTable(orig, { ...ctx, diffContext: { diffType: 'removed' } });
      const newHtml = renderTable(mod, { ...ctx, diffContext: { diffType: 'added' } });
      return { html: `${oldHtml}\n${newHtml}`, unpairable: true };
    }
  }

  // Align columns
  const colLcs = computeLCS(oldHeaders, newHeaders, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
  interface AlignedCol {
    status: 'same' | 'added' | 'removed' | 'modified';
    oldIdx?: number;
    newIdx?: number;
    name: string;
    oldName?: string;
  }

  const alignedCols: AlignedCol[] = [];
  let ci = oldHeaders.length;
  let cj = newHeaders.length;

  while (ci > 0 || cj > 0) {
    if (ci > 0 && cj > 0 && oldHeaders[ci - 1].trim().toLowerCase() === newHeaders[cj - 1].trim().toLowerCase()) {
      const isExact = oldHeaders[ci - 1] === newHeaders[cj - 1];
      alignedCols.push({
        status: isExact ? 'same' : 'modified',
        oldIdx: ci - 1,
        newIdx: cj - 1,
        name: newHeaders[cj - 1],
        oldName: oldHeaders[ci - 1],
      });
      ci--;
      cj--;
    } else if (cj > 0 && (ci === 0 || colLcs[ci][cj - 1] >= colLcs[ci - 1][cj])) {
      alignedCols.push({
        status: 'added',
        newIdx: cj - 1,
        name: newHeaders[cj - 1],
      });
      cj--;
    } else if (ci > 0) {
      alignedCols.push({
        status: 'removed',
        oldIdx: ci - 1,
        name: oldHeaders[ci - 1],
      });
      ci--;
    }
  }

  alignedCols.reverse();

  // Render thead
  const thHtml = alignedCols
    .map((col) => {
      if (col.status === 'added') {
        return `<th class="diff-col-added"><ins class="diff-ins">${parseInlineMarkdown(col.name)}</ins></th>`;
      }
      if (col.status === 'removed') {
        return `<th class="diff-col-removed"><del class="diff-del">${parseInlineMarkdown(col.name)}</del></th>`;
      }
      if (col.status === 'modified') {
        return `<th class="diff-cell-modified">${diffInlineMarkdown(col.oldName || '', col.name)}</th>`;
      }
      return `<th>${parseInlineMarkdown(col.name)}</th>`;
    })
    .join('');

  // Align body rows
  const oldRows = orig.rows || [];
  const newRows = mod.rows || [];

  const rowLcs = computeLCS(oldRows, newRows, (r1, r2) => r1.join(' | ') === r2.join(' | '));
  const diffRows: { type: DiffType; row: string[] }[] = [];

  let ri = oldRows.length;
  let rj = newRows.length;

  while (ri > 0 || rj > 0) {
    if (ri > 0 && rj > 0 && oldRows[ri - 1].join(' | ') === newRows[rj - 1].join(' | ')) {
      diffRows.push({ type: 'same', row: newRows[rj - 1] });
      ri--;
      rj--;
    } else if (rj > 0 && (ri === 0 || rowLcs[ri][rj - 1] >= rowLcs[ri - 1][rj])) {
      diffRows.push({ type: 'add', row: newRows[rj - 1] });
      rj--;
    } else if (ri > 0) {
      diffRows.push({ type: 'del', row: oldRows[ri - 1] });
      ri--;
    }
  }

  diffRows.reverse();

  // Render tbody rows
  const trHtmlParts: string[] = [];

  const renderCellContent = (val: string): string => {
    const cb = parseCellCheckbox(val);
    if (cb !== null) {
      const checkedAttr = cb ? 'checked' : '';
      return `<input type="checkbox" class="table-cell-checkbox" ${checkedAttr} disabled contenteditable="false">`;
    }
    return parseInlineMarkdown(val) || '&nbsp;';
  };

  let rIdx = 0;
  while (rIdx < diffRows.length) {
    if (diffRows[rIdx].type === 'same') {
      const curRow = diffRows[rIdx].row;
      const cellHtmls = alignedCols
        .map((col) => {
          const val = col.newIdx !== undefined ? curRow[col.newIdx] || '' : '';
          const cb = parseCellCheckbox(val);
          if (cb !== null) {
            const checkedClass = cb ? ' is-checked' : '';
            return `<td class="table-checkbox-cell${checkedClass}" data-checked="${cb}">${renderCellContent(val)}</td>`;
          }
          return `<td>${renderCellContent(val)}</td>`;
        })
        .join('');
      trHtmlParts.push(`<tr>${cellHtmls}</tr>`);
      rIdx++;
      continue;
    }

    const delRun: string[][] = [];
    const addRun: string[][] = [];
    while (rIdx < diffRows.length && diffRows[rIdx].type === 'del') {
      delRun.push(diffRows[rIdx].row);
      rIdx++;
    }
    while (rIdx < diffRows.length && diffRows[rIdx].type === 'add') {
      addRun.push(diffRows[rIdx].row);
      rIdx++;
    }

    const pairs = pairChangeRuns(delRun, addRun, (r1, r2) => diceSimilarity(r1.join(' '), r2.join(' ')), 0.25);

    for (const pair of pairs) {
      if (pair.del && pair.add) {
        const cellHtmls = alignedCols
          .map((col) => {
            if (col.status === 'added') {
              const newVal = col.newIdx !== undefined ? pair.add![col.newIdx] || '' : '';
              return `<td class="diff-col-added"><ins class="diff-ins">${renderCellContent(newVal)}</ins></td>`;
            }
            if (col.status === 'removed') {
              const oldVal = col.oldIdx !== undefined ? pair.del![col.oldIdx] || '' : '';
              return `<td class="diff-col-removed"><del class="diff-del">${renderCellContent(oldVal)}</del></td>`;
            }

            const oldVal = col.oldIdx !== undefined ? pair.del![col.oldIdx] || '' : '';
            const newVal = col.newIdx !== undefined ? pair.add![col.newIdx] || '' : '';

            if (oldVal === newVal) {
              const cb = parseCellCheckbox(newVal);
              if (cb !== null) {
                const checkedClass = cb ? ' is-checked' : '';
                return `<td class="table-checkbox-cell${checkedClass}" data-checked="${cb}">${renderCellContent(newVal)}</td>`;
              }
              return `<td>${renderCellContent(newVal)}</td>`;
            }

            // Cell changed
            const oldCb = parseCellCheckbox(oldVal);
            const newCb = parseCellCheckbox(newVal);
            if (oldCb !== null && newCb !== null) {
              const checkedAttr = newCb ? 'checked' : '';
              const checkedClass = newCb ? ' is-checked' : '';
              return `<td class="table-checkbox-cell${checkedClass} diff-cell-modified diff-checkbox-changed" data-checked="${newCb}" data-diff-old-checked="${oldCb}"><input type="checkbox" class="table-cell-checkbox" ${checkedAttr} disabled contenteditable="false"></td>`;
            }

            const cellDiff = diffInlineMarkdown(oldVal, newVal);
            return `<td class="diff-cell-modified">${cellDiff || '&nbsp;'}</td>`;
          })
          .join('');
        trHtmlParts.push(`<tr class="diff-row-modified">${cellHtmls}</tr>`);
      } else if (pair.del) {
        const cellHtmls = alignedCols
          .map((col) => {
            if (col.status === 'added') {
              return `<td class="diff-col-added">&nbsp;</td>`;
            }
            const val = col.oldIdx !== undefined ? pair.del![col.oldIdx] || '' : '';
            return `<td class="diff-col-removed"><del class="diff-del">${renderCellContent(val)}</del></td>`;
          })
          .join('');
        trHtmlParts.push(`<tr class="diff-row-deleted">${cellHtmls}</tr>`);
      } else if (pair.add) {
        const cellHtmls = alignedCols
          .map((col) => {
            if (col.status === 'removed') {
              return `<td class="diff-col-removed">&nbsp;</td>`;
            }
            const val = col.newIdx !== undefined ? pair.add![col.newIdx] || '' : '';
            return `<td class="diff-col-added"><ins class="diff-ins">${renderCellContent(val)}</ins></td>`;
          })
          .join('');
        trHtmlParts.push(`<tr class="diff-row-added">${cellHtmls}</tr>`);
      }
    }
  }

  const tableHtml = `<div class="editor-block table-wrapper diff-block-modified" data-block-type="table"><div class="table-scroll-wrapper"><table class="editor-table" contenteditable="false"><thead><tr>${thHtml}</tr></thead><tbody>${trHtmlParts.join('')}</tbody></table></div></div>`;
  const deleteBtn = ctx.review ? '' : '';
  const finalHtml = ctx.isNested
    ? tableHtml
    : `<div class="editor-block-container widget-block diff-block-modified" data-block-type="table" contenteditable="false">${deleteBtn}${tableHtml}</div>`;

  return { html: finalHtml };
}

// ============================================================================
// Block Alignment & formatMarkdownDiff Entry Point
// ============================================================================

function computeBlockSignature(b: MarkdownBlock): string {
  switch (b.type) {
    case 'heading':
      return `heading:${b.level}:${b.content?.trim()}`;
    case 'paragraph':
      return `paragraph:${b.content?.trim()}`;
    case 'blockquote':
      return `blockquote:${b.content?.trim()}`;
    case 'code_block':
      return `code_block:${b.language || ''}:${b.content}`;
    case 'hr':
      return 'hr';
    case 'table':
      return `table:${(b.headers || []).join('|')}::${(b.rows || []).map((r) => r.join('|')).join('\n')}`;
    case 'task_list':
    case 'unordered_list':
    case 'ordered_list':
      return `${b.type}:${(b.items || []).map((it) => `${it.checked ?? ''}:${it.text}`).join('\n')}`;
    default:
      return '';
  }
}

function computeBlockSimilarity(b1: MarkdownBlock, b2: MarkdownBlock): number {
  if (b1.type !== b2.type) {
    return 0; // Never pair differing block types
  }
  if (b1.type === 'hr') {
    return 1.0;
  }
  if (b1.type === 'table') {
    const h1 = b1.headers || [];
    const h2 = b2.headers || [];
    const overlap = h1.filter((h) => h2.some((x) => x.trim().toLowerCase() === h.trim().toLowerCase())).length;
    if (h1.length > 0 && h2.length > 0 && overlap === 0) return 0;
    return diceSimilarity(
      (b1.headers || []).join(' ') + ' ' + (b1.rows || []).map((r) => r.join(' ')).join(' '),
      (b2.headers || []).join(' ') + ' ' + (b2.rows || []).map((r) => r.join(' ')).join(' ')
    );
  }
  if (b1.type === 'code_block') {
    return diceSimilarity(b1.content || '', b2.content || '');
  }
  if (b1.type === 'paragraph' || b1.type === 'heading' || b1.type === 'blockquote') {
    return diceSimilarity(b1.content || '', b2.content || '');
  }
  if (b1.type === 'task_list' || b1.type === 'unordered_list' || b1.type === 'ordered_list') {
    return diceSimilarity(
      (b1.items || []).map((it) => it.text).join(' '),
      (b2.items || []).map((it) => it.text).join(' ')
    );
  }
  return 0;
}

/**
 * Computes formatted markdown diff HTML from original and modified markdown strings.
 * Renders document with shared per-block renderers and decorated diff annotations.
 */
export function formatMarkdownDiff(
  originalMarkdown: string,
  modifiedMarkdown: string,
  lang?: 'en' | 'de'
): { html: string; stats: DiffStats } {
  const lineDiffs = diffLines(originalMarkdown, modifiedMarkdown);
  const stats = countDiffStats(lineDiffs);

  if (!stats.hasChanges) {
    return { html: '', stats };
  }

  const origBlocks = parseMarkdownToBlocks(originalMarkdown);
  const modBlocks = parseMarkdownToBlocks(modifiedMarkdown);

  // Filter out empty-line paragraphs so they are alignment-neutral
  const filteredOrig = origBlocks.filter((b) => !(b.type === 'paragraph' && !b.content?.trim()));
  const filteredMod = modBlocks.filter((b) => !(b.type === 'paragraph' && !b.content?.trim()));

  const origSigs = filteredOrig.map(computeBlockSignature);
  const modSigs = filteredMod.map(computeBlockSignature);

  const sigMatrix = computeLCS(origSigs, modSigs);
  const diffBlocks: { type: DiffType; block: MarkdownBlock }[] = [];

  let i = filteredOrig.length;
  let j = filteredMod.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origSigs[i - 1] === modSigs[j - 1]) {
      diffBlocks.push({ type: 'same', block: filteredMod[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || sigMatrix[i][j - 1] >= sigMatrix[i - 1][j])) {
      diffBlocks.push({ type: 'add', block: filteredMod[j - 1] });
      j--;
    } else if (i > 0) {
      diffBlocks.push({ type: 'del', block: filteredOrig[i - 1] });
      i--;
    }
  }

  diffBlocks.reverse();

  const renderedHtmlParts: string[] = [];
  const baseCtx: RenderContext = { lang, review: true };

  let bIdx = 0;
  while (bIdx < diffBlocks.length) {
    if (diffBlocks[bIdx].type === 'same') {
      // Unchanged block: render normally with shared renderer, no diff markers
      renderedHtmlParts.push(renderBlock(diffBlocks[bIdx].block, baseCtx));
      bIdx++;
      continue;
    }

    const delRun: MarkdownBlock[] = [];
    const addRun: MarkdownBlock[] = [];
    while (bIdx < diffBlocks.length && diffBlocks[bIdx].type === 'del') {
      delRun.push(diffBlocks[bIdx].block);
      bIdx++;
    }
    while (bIdx < diffBlocks.length && diffBlocks[bIdx].type === 'add') {
      addRun.push(diffBlocks[bIdx].block);
      bIdx++;
    }

    const pairedBlocks = pairChangeRuns(delRun, addRun, computeBlockSimilarity, 0.45);

    for (const pair of pairedBlocks) {
      if (pair.del && pair.add) {
        // Hand to type differ
        const delB = pair.del;
        const addB = pair.add;

        switch (addB.type) {
          case 'paragraph': {
            const inlineDiff = diffInlineMarkdown(delB.content || '', addB.content || '');
            renderedHtmlParts.push(
              renderParagraph(addB, {
                ...baseCtx,
                diffContext: { diffType: 'modified', diffHtml: inlineDiff },
              })
            );
            break;
          }

          case 'heading': {
            const inlineDiff = diffInlineMarkdown(delB.content || '', addB.content || '');
            renderedHtmlParts.push(
              renderHeading(addB, {
                ...baseCtx,
                diffContext: {
                  diffType: 'modified',
                  diffHtml: inlineDiff,
                  oldLevel: delB.level !== addB.level ? delB.level : undefined,
                },
              })
            );
            break;
          }

          case 'blockquote': {
            renderedHtmlParts.push(diffBlockquote(delB, addB, baseCtx));
            break;
          }

          case 'code_block': {
            const isMermaid = (addB.language || '').toLowerCase() === 'mermaid' || (delB.language || '').toLowerCase() === 'mermaid';
            const langChanged = (delB.language || '') !== (addB.language || '');
            const contentChanged = (delB.content || '') !== (addB.content || '');

            if (!langChanged && !contentChanged) {
              // Unchanged
              renderedHtmlParts.push(renderCodeBlock(addB, baseCtx));
            } else if (isMermaid) {
              const codeDiff = formatCodeBlockDiff(delB.content || '', addB.content || '');
              renderedHtmlParts.push(
                renderCodeBlock(addB, {
                  ...baseCtx,
                  diffContext: {
                    diffType: 'modified',
                    diffHtml: codeDiff,
                    oldLanguage: langChanged ? delB.language : undefined,
                    oldContent: delB.content,
                  },
                })
              );
            } else {
              const codeDiff = formatCodeBlockDiff(delB.content || '', addB.content || '');
              renderedHtmlParts.push(
                renderCodeBlock(addB, {
                  ...baseCtx,
                  diffContext: {
                    diffType: 'modified',
                    diffHtml: codeDiff,
                    oldLanguage: langChanged ? delB.language : undefined,
                  },
                })
              );
            }
            break;
          }

          case 'task_list':
          case 'unordered_list':
          case 'ordered_list': {
            renderedHtmlParts.push(diffList(delB, addB, baseCtx));
            break;
          }

          case 'table': {
            const tableRes = diffTable(delB, addB, baseCtx);
            renderedHtmlParts.push(tableRes.html);
            break;
          }

          case 'hr': {
            renderedHtmlParts.push(renderHr(addB, baseCtx));
            break;
          }
        }
      } else if (pair.del) {
        renderedHtmlParts.push(
          renderBlock(pair.del, {
            ...baseCtx,
            diffContext: { diffType: 'removed' },
          })
        );
      } else if (pair.add) {
        renderedHtmlParts.push(
          renderBlock(pair.add, {
            ...baseCtx,
            diffContext: { diffType: 'added' },
          })
        );
      }
    }
  }

  return { html: renderedHtmlParts.join('\n'), stats };
}
