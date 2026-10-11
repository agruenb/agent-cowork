/**
 * Mindmap diagram parser, tree layout engine, and SVG renderer.
 */

import { MindmapData, MindmapNode } from '../types';
import { MERMAID_PALETTE } from '../theme';
import {
  escapeXml,
  estimateTextWidth,
  generateCurvedPath,
} from '../svgUtils';

export function parseMindmap(code: string): MindmapData {
  const lines = code.split('\n');
  let root: MindmapNode | null = null;
  const stack: { node: MindmapNode; indent: number }[] = [];
  let nodeIdCounter = 1;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('%%') || rawLine.trim().toLowerCase() === 'mindmap') {
      continue;
    }

    // Determine indentation
    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const text = rawLine.trim();

    // Parse shape: ((circle)), [rect], (rounded)
    let shape: MindmapNode['shape'] = 'pill';
    let cleanText = text;

    const circleMatch = text.match(/^\(\((.*?)\)\)$/);
    if (circleMatch) {
      shape = 'circle';
      cleanText = circleMatch[1];
    } else {
      const rectMatch = text.match(/^\[(.*?)\]$/);
      if (rectMatch) {
        shape = 'rect';
        cleanText = rectMatch[1];
      }
    }

    const node: MindmapNode = {
      id: `mm_${nodeIdCounter++}`,
      text: cleanText,
      level: 0,
      shape,
      children: [],
    };

    if (!root) {
      root = node;
      node.level = 0;
      stack.push({ node, indent });
    } else {
      // Find parent by comparing indentation
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        node.level = parent.level + 1;
        parent.children.push(node);
      }
      stack.push({ node, indent });
    }
  }

  return { root };
}

export function layoutMindmap(data: MindmapData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { root } = data;
  if (!root) {
    return { width: 100, height: 60, svgInner: '' };
  }

  const margin = 40;
  const colGap = 80;
  const rowGap = 16;
  const colors = MERMAID_PALETTE.pieColors;

  // Flatten branches into columns by level
  // Root at left (level 0), level 1, level 2...
  const levels: MindmapNode[][] = [];

  const traverse = (node: MindmapNode, lvl: number, branchColor?: string) => {
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(node);

    node.children.forEach((child, idx) => {
      const color = lvl === 0 ? colors[idx % colors.length] : branchColor;
      child.color = color;
      traverse(child, lvl + 1, color);
    });
  };

  root.color = '#0284c7';
  traverse(root, 0, '#0284c7');

  // Measure all nodes
  const nodeDims = new Map<
    string,
    { width: number; height: number; x: number; y: number }
  >();

  let maxTotalHeight = 0;
  const colWidths: number[] = [];

  for (let l = 0; l < levels.length; l++) {
    let colMaxW = 0;
    let colH = 0;
    for (const n of levels[l]) {
      const w = Math.max(80, estimateTextWidth(n.text, 12) + 24);
      const h = 32;
      if (w > colMaxW) colMaxW = w;
      colH += h + rowGap;
    }
    colWidths[l] = colMaxW;
    if (colH > maxTotalHeight) maxTotalHeight = colH;
  }

  const totalHeight = Math.max(160, maxTotalHeight + margin * 2);
  let currentX = margin;

  // Position nodes vertically centered per column
  for (let l = 0; l < levels.length; l++) {
    const colNodes = levels[l];
    const colH = colNodes.length > 0 ? colNodes.length * (32 + rowGap) - rowGap : 0;

    let currentY = (totalHeight - colH) / 2;
    for (const n of colNodes) {
      const w = Math.max(80, estimateTextWidth(n.text, 12) + 24);
      nodeDims.set(n.id, {
        width: w,
        height: 32,
        x: currentX,
        y: currentY,
      });
      currentY += 32 + rowGap;
    }

    currentX += colWidths[l] + colGap;
  }

  const totalWidth = currentX - colGap + margin;
  const svgParts: string[] = [];

  // Draw connectors
  const drawLinks = (node: MindmapNode) => {
    const parentDim = nodeDims.get(node.id);
    if (!parentDim) return;

    for (const child of node.children) {
      const childDim = nodeDims.get(child.id);
      if (childDim) {
        const p1 = { x: parentDim.x + parentDim.width, y: parentDim.y + parentDim.height / 2 };
        const p2 = { x: childDim.x, y: childDim.y + childDim.height / 2 };
        const pathData = generateCurvedPath(p1, p2, 'LR');
        const strokeColor = child.color || 'var(--text-muted, #64748b)';
        svgParts.push(`
          <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2" />
        `);
      }
      drawLinks(child);
    }
  };

  drawLinks(root);

  // Draw node pills
  const drawNodes = (node: MindmapNode) => {
    const dim = nodeDims.get(node.id);
    if (dim) {
      const { x, y, width, height } = dim;
      const rx = node.level === 0 ? 8 : 16;
      const borderColor = node.color || 'var(--card-border, #cbd5e1)';
      const isRoot = node.level === 0;

      svgParts.push(`
        <g class="mermaid-node">
          <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="var(--card-bg, #ffffff)" stroke="${borderColor}" stroke-width="${isRoot ? 2 : 1.5}" />
          <text x="${x + width / 2}" y="${y + height / 2}" font-weight="${isRoot ? '700' : '500'}" font-size="${isRoot ? 13 : 12}">${escapeXml(node.text)}</text>
        </g>
      `);
    }
    node.children.forEach(drawNodes);
  };

  drawNodes(root);

  return {
    width: Math.max(160, totalWidth),
    height: Math.max(120, totalHeight),
    svgInner: svgParts.join('\n'),
  };
}
