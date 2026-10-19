/**
 * Sankey diagram parser, topological stage layout, and SVG ribbon renderer.
 */

import { SankeyData, SankeyLink } from '../types';
import { escapeXml } from '../svgUtils';

export function parseSankey(code: string): SankeyData {
  const lines = code.split('\n');
  const links: SankeyLink[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || /^(?:sankey|sankey-beta)$/i.test(line)) {
      continue;
    }

    // CSV format: Source, Target, Value  or  "Source","Target",Value
    const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length >= 3) {
      const source = parts[0];
      const target = parts[1];
      const value = parseFloat(parts[2]);
      if (source && target && !isNaN(value) && value > 0) {
        links.push({ source, target, value });
      }
    }
  }

  return { links };
}

export function layoutSankey(data: SankeyData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { links } = data;
  if (links.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  // Identify nodes and calculate in/out values
  const nodeSet = new Set<string>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const nodeValues = new Map<string, number>();

  links.forEach((l) => {
    nodeSet.add(l.source);
    nodeSet.add(l.target);
    outDegree.set(l.source, (outDegree.get(l.source) || 0) + 1);
    inDegree.set(l.target, (inDegree.get(l.target) || 0) + 1);
    nodeValues.set(l.source, (nodeValues.get(l.source) || 0) + l.value);
    nodeValues.set(l.target, (nodeValues.get(l.target) || 0) + l.value);
  });

  // Assign columns/stages: 0 for pure sources, 1 for middle, 2 for pure targets
  const nodeColumn = new Map<string, number>();
  nodeSet.forEach((n) => {
    if (!inDegree.has(n) || inDegree.get(n) === 0) {
      nodeColumn.set(n, 0);
    } else if (!outDegree.has(n) || outDegree.get(n) === 0) {
      nodeColumn.set(n, 2);
    } else {
      nodeColumn.set(n, 1);
    }
  });

  const columns: string[][] = [[], [], []];
  nodeSet.forEach((n) => {
    const col = nodeColumn.get(n) || 0;
    columns[col].push(n);
  });

  // Filter out empty columns
  const activeCols = columns.filter((c) => c.length > 0);
  const totalStages = activeCols.length;

  const stageWidth = 220;
  const nodeBarWidth = 14;
  const leftMargin = 80;
  const rightMargin = 80;
  const topMargin = 40;
  const bottomMargin = 40;

  const totalWidth = leftMargin + (totalStages - 1) * stageWidth + rightMargin;
  const totalHeight = 360;
  const chartHeight = totalHeight - topMargin - bottomMargin;

  // Node position map: { x, y, height, currentOutY, currentInY }
  const nodePos = new Map<
    string,
    { x: number; y: number; h: number; outY: number; inY: number; color: string }
  >();

  const palette = ['#0284c7', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#3b82f6'];
  let colorIdx = 0;

  activeCols.forEach((colNodes, colIdx) => {
    const x = leftMargin + colIdx * stageWidth;
    const count = colNodes.length;
    const gap = 18;
    const availableH = chartHeight - (count - 1) * gap;
    const h = Math.max(24, availableH / count);

    colNodes.forEach((node, rowIdx) => {
      const y = topMargin + rowIdx * (h + gap);
      const color = palette[colorIdx++ % palette.length];
      nodePos.set(node, { x, y, h, outY: y, inY: y, color });
    });
  });

  const ribbons: string[] = [];
  const nodeSvgs: string[] = [];

  // Draw Links as bezier ribbons
  links.forEach((l) => {
    const src = nodePos.get(l.source);
    const tgt = nodePos.get(l.target);
    if (!src || !tgt) return;

    // Approximate ribbon thickness proportional to value
    const srcVal = nodeValues.get(l.source) || 1;
    const ribbonH = Math.max(4, Math.min(src.h * 0.8, (l.value / srcVal) * src.h));

    const x0 = src.x + nodeBarWidth;
    const y0 = src.outY + ribbonH / 2;
    const x1 = tgt.x;
    const y1 = tgt.inY + ribbonH / 2;
    src.outY += ribbonH;
    tgt.inY += ribbonH;

    const midX = (x0 + x1) / 2;
    ribbons.push(`
      <path d="M ${x0} ${y0 - ribbonH / 2} C ${midX} ${y0 - ribbonH / 2}, ${midX} ${y1 - ribbonH / 2}, ${x1} ${y1 - ribbonH / 2} L ${x1} ${y1 + ribbonH / 2} C ${midX} ${y1 + ribbonH / 2}, ${midX} ${y0 + ribbonH / 2}, ${x0} ${y0 + ribbonH / 2} Z" fill="${src.color}" fill-opacity="0.35" stroke="${src.color}" stroke-opacity="0.5" stroke-width="0.8" />
    `);
  });

  // Draw Nodes
  nodePos.forEach((pos, node) => {
    const isLeft = pos.x <= leftMargin + 10;
    const textAnchor = isLeft ? 'end' : 'start';
    const textX = isLeft ? pos.x - 10 : pos.x + nodeBarWidth + 10;

    nodeSvgs.push(`
      <rect x="${pos.x}" y="${pos.y}" width="${nodeBarWidth}" height="${pos.h}" rx="3" ry="3" fill="${pos.color}" />
      <text x="${textX}" y="${pos.y + pos.h / 2 + 4}" text-anchor="${textAnchor}" font-size="12" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(node)}</text>
    `);
  });

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: `${ribbons.join('\n')}\n${nodeSvgs.join('\n')}`,
  };
}
