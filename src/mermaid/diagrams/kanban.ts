/**
 * Kanban board diagram parser, column layout engine, and SVG renderer.
 */

import { KanbanData, KanbanColumn } from '../types';
import { escapeXml } from '../svgUtils';

export function parseKanban(code: string): KanbanData {
  const lines = code.split('\n');
  const columns: KanbanColumn[] = [];
  let currentColumn: KanbanColumn | null = null;
  let itemIdCounter = 1;
  let colIndent: number | null = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('%%') || rawLine.trim().toLowerCase() === 'kanban') {
      continue;
    }

    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const text = rawLine.trim();

    if (colIndent === null) {
      colIndent = indent;
    }

    // If indent is at the column level or lower and not card syntax, this is a column header
    const isCardSyntax = text.startsWith('[') || text.startsWith('- ');
    if (indent <= colIndent && !isCardSyntax) {
      colIndent = indent;
      // Column title: "Todo" or "todo[Todo Title]"
      const colMatch = text.match(/^(?:([a-zA-Z0-9_.-]+)\[(.*?)\]|(.*?))$/);
      const title = (colMatch ? (colMatch[2] || colMatch[3]) : text).trim();
      currentColumn = {
        id: `col_${columns.length + 1}`,
        title,
        items: [],
      };
      columns.push(currentColumn);
    } else if (currentColumn) {
      // Card item: "[Task Name]" or "id[Task Name]" or "- Task Name" or "Task Name"
      let label = text;
      const bracketMatch = text.match(/^(?:[a-zA-Z0-9_.-]+)?\[(.*?)\]/);
      if (bracketMatch) {
        label = bracketMatch[1].trim();
      } else if (label.startsWith('- ')) {
        label = label.slice(2).trim();
      }

      currentColumn.items.push({
        id: `item_${itemIdCounter++}`,
        label,
      });
    }
  }

  return { columns };
}

export function layoutKanban(data: KanbanData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { columns } = data;
  if (columns.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const colWidth = 170;
  const colGap = 16;
  const leftMargin = 24;
  const topMargin = 28;
  const cardHeight = 44;
  const cardGap = 10;

  let maxColHeight = 120;
  const renderedCols: string[] = [];

  columns.forEach((col, colIdx) => {
    const cx = leftMargin + colIdx * (colWidth + colGap);
    const totalItems = col.items.length;
    const itemsHeight = totalItems * (cardHeight + cardGap);
    const columnH = Math.max(140, 48 + itemsHeight + 16);
    if (columnH > maxColHeight) maxColHeight = columnH;

    const cardsSvg: string[] = [];
    let cy = topMargin + 48;

    col.items.forEach((item) => {
      cardsSvg.push(`
        <g class="mermaid-kanban-card">
          <rect x="${cx + 10}" y="${cy}" width="${colWidth - 20}" height="${cardHeight}" rx="5" ry="5" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #e2e8f0)" stroke-width="1.2" />
          <rect x="${cx + 10}" y="${cy}" width="3.5" height="${cardHeight}" rx="2" fill="#38bdf8" />
          <text x="${cx + 20}" y="${cy + 26}" font-size="12" font-weight="500" fill="var(--text, #0f172a)">${escapeXml(item.label)}</text>
        </g>
      `);
      cy += cardHeight + cardGap;
    });

    renderedCols.push(`
      <g class="mermaid-kanban-col">
        <rect x="${cx}" y="${topMargin}" width="${colWidth}" height="${columnH}" rx="8" ry="8" fill="rgba(100, 116, 139, 0.07)" stroke="var(--card-border, #cbd5e1)" stroke-width="1" />
        <text x="${cx + 12}" y="${topMargin + 26}" font-size="13" font-weight="700" fill="var(--text, #0f172a)">${escapeXml(col.title)}</text>
        <circle cx="${cx + colWidth - 22}" cy="${topMargin + 22}" r="9" fill="var(--card-border, #cbd5e1)" />
        <text x="${cx + colWidth - 22}" y="${topMargin + 26}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text-muted, #475569)">${totalItems}</text>
        ${cardsSvg.join('\n')}
      </g>
    `);
  });

  const totalWidth = leftMargin + columns.length * (colWidth + colGap) + leftMargin - colGap;
  const totalHeight = topMargin + maxColHeight + topMargin;

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: renderedCols.join('\n'),
  };
}
