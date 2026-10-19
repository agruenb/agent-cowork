/**
 * Block diagram parser, grid placement engine, and SVG renderer.
 */

import { BlockData, BlockItem } from '../types';
import { escapeXml } from '../svgUtils';

export function parseBlockDiagram(code: string): BlockData {
  const lines = code.split('\n');
  let columns = 3;
  const blocks: BlockItem[] = [];
  let blockIdCounter = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || /^(?:block|block-beta)$/i.test(line)) {
      continue;
    }

    // columns 3
    const colMatch = line.match(/^columns\s+(\d+)/i);
    if (colMatch) {
      columns = Math.max(1, parseInt(colMatch[1], 10));
      continue;
    }

    // Match blocks on line: `a["Block A"]` or `b["Block B"]:2` or `space` or `space:2`
    // Regex matches tokens on the line
    const regex = /(?:([a-zA-Z0-9_.-]+)\["(.*?)"\](?::(\d+))?)|(?:([a-zA-Z0-9_.-]+)\[(.*?)\](?::(\d+))?)|(?:space(?::(\d+))?)|(?:([a-zA-Z0-9_.-]+)(?::(\d+))?)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const full = match[0].trim();
      if (!full) continue;

      if (full.startsWith('space')) {
        const spanMatch = full.match(/space(?::(\d+))?/);
        const span = spanMatch && spanMatch[1] ? parseInt(spanMatch[1], 10) : 1;
        blocks.push({ id: `space_${blockIdCounter++}`, label: '', span, isSpace: true });
      } else if (match[1] && match[2]) {
        // id["label"]:span
        const id = match[1];
        const label = match[2];
        const span = match[3] ? parseInt(match[3], 10) : 1;
        blocks.push({ id, label, span });
      } else if (match[4] && match[5]) {
        // id[label]:span
        const id = match[4];
        const label = match[5];
        const span = match[6] ? parseInt(match[6], 10) : 1;
        blocks.push({ id, label, span });
      } else if (match[8]) {
        // simple token
        const id = match[8];
        const span = match[9] ? parseInt(match[9], 10) : 1;
        blocks.push({ id, label: id, span });
      }
    }
  }

  return { columns, blocks };
}

export function layoutBlockDiagram(data: BlockData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { columns, blocks } = data;
  if (blocks.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const leftMargin = 28;
  const topMargin = 28;
  const colGap = 12;
  const rowGap = 12;
  const baseColWidth = 140;
  const cellHeight = 52;

  const totalGridWidth = columns * baseColWidth + (columns - 1) * colGap;
  const totalWidth = leftMargin + totalGridWidth + leftMargin;

  let currentCol = 0;
  let currentRow = 0;
  const renderedBlocks: string[] = [];

  blocks.forEach((b) => {
    const span = Math.min(columns, b.span || 1);

    // If block doesn't fit on current row, wrap to next row
    if (currentCol + span > columns && currentCol > 0) {
      currentRow++;
      currentCol = 0;
    }

    const bx = leftMargin + currentCol * (baseColWidth + colGap);
    const by = topMargin + currentRow * (cellHeight + rowGap);
    const bw = span * baseColWidth + (span - 1) * colGap;

    if (!b.isSpace) {
      renderedBlocks.push(`
        <g class="mermaid-block-item" id="block-${escapeXml(b.id)}">
          <rect x="${bx}" y="${by}" width="${bw}" height="${cellHeight}" rx="6" ry="6" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
          <text x="${bx + bw / 2}" y="${by + cellHeight / 2 + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(b.label)}</text>
        </g>
      `);
    }

    currentCol += span;
    if (currentCol >= columns) {
      currentRow++;
      currentCol = 0;
    }
  });

  const finalRows = currentCol > 0 ? currentRow + 1 : currentRow;
  const totalHeight = topMargin + finalRows * (cellHeight + rowGap) + topMargin;

  return {
    width: totalWidth,
    height: Math.max(120, totalHeight),
    svgInner: renderedBlocks.join('\n'),
  };
}
