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

interface ParseLineResult {
  text: string;
  shape: MindmapNode['shape'];
  id: string;
}

function parseMindmapNodeLine(rawText: string): ParseLineResult {
  // Strip class annotations like :::urgent
  let clean = rawText.replace(/:::[a-zA-Z0-9_-]+$/, '').trim();

  // Strip icon annotations like ::icon(...)
  clean = clean.replace(/::icon\([^)]*\)/, '').trim();

  let shape: MindmapNode['shape'] = 'pill';
  let label = clean;
  let id = '';

  // 1. Double parens: id((text)) or ((text))
  const circleMatch = clean.match(/^(?:([a-zA-Z0-9_.-]+)\s*)?\(\((.*?)\)\)$/);
  if (circleMatch) {
    id = circleMatch[1] || '';
    label = circleMatch[2];
    shape = 'circle';
  } else {
    // 2. Square brackets: id[text] or [text]
    const rectMatch = clean.match(/^(?:([a-zA-Z0-9_.-]+)\s*)?\[(.*?)\]$/);
    if (rectMatch) {
      id = rectMatch[1] || '';
      label = rectMatch[2];
      shape = 'rect';
    } else {
      // 3. Bang: id))text(( or ))text((
      const bangMatch = clean.match(/^(?:([a-zA-Z0-9_.-]+)\s*)?\)\)(.*?)\(\($/);
      if (bangMatch) {
        id = bangMatch[1] || '';
        label = bangMatch[2];
        shape = 'bang';
      } else {
        // 4. Cloud: id)text( or )text(
        const cloudMatch = clean.match(/^(?:([a-zA-Z0-9_.-]+)\s*)?\)(.*?)\($/);
        if (cloudMatch) {
          id = cloudMatch[1] || '';
          label = cloudMatch[2];
          shape = 'cloud';
        } else {
          // 5. Rounded parens: id(text) or (text)
          const roundMatch = clean.match(/^(?:([a-zA-Z0-9_.-]+)\s*)?\((.*?)\)$/);
          if (roundMatch) {
            id = roundMatch[1] || '';
            label = roundMatch[2];
            shape = 'pill';
          }
        }
      }
    }
  }

  // Strip enclosing quotes from label
  label = label.trim().replace(/^["']|["']$/g, '');

  return {
    text: label || clean,
    shape,
    id: id || '',
  };
}

export function parseMindmap(code: string): MindmapData {
  const lines = code.split('\n');
  const roots: MindmapNode[] = [];
  const stack: { node: MindmapNode; indent: number }[] = [];
  let nodeIdCounter = 1;
  let title: string | undefined;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.toLowerCase() === 'mindmap') {
      continue;
    }

    // Skip icon-only or standalone annotation lines
    if (trimmed.startsWith('::icon(') || trimmed.startsWith(':::')) {
      continue;
    }

    // Optional title
    const titleMatch = trimmed.match(/^title\s+(.*?)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // Determine indentation
    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    const { text, shape, id: explicitId } = parseMindmapNodeLine(trimmed);
    const nodeId = explicitId || `mm_${nodeIdCounter++}`;

    const node: MindmapNode = {
      id: nodeId,
      text,
      level: 0,
      shape,
      children: [],
    };

    // If stack is empty, this is the first root node
    if (stack.length === 0) {
      node.level = 0;
      roots.push(node);
      stack.push({ node, indent });
    } else {
      // Find the parent by popping anything at or deeper than current indent
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        // Line has same or less indent than root -> treat as another top-level root
        node.level = 0;
        roots.push(node);
      }
      stack.push({ node, indent });
    }
  }

  if (roots.length === 0) {
    return { root: null };
  }

  // If there's a single root, use it; if multiple top-level roots, wrap under a virtual root
  let finalRoot: MindmapNode;
  if (roots.length === 1) {
    finalRoot = roots[0];
  } else {
    finalRoot = {
      id: 'mm_virtual_root',
      text: title || 'Mindmap',
      level: 0,
      shape: 'circle',
      children: roots,
    };
    // Adjust levels of wrapped children
    const adjustLevel = (n: MindmapNode, lvl: number) => {
      n.level = lvl;
      n.children.forEach((c) => adjustLevel(c, lvl + 1));
    };
    adjustLevel(finalRoot, 0);
  }

  return { root: finalRoot };
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
  const colGap = 72;
  const rowGap = 16;
  const nodeHeight = 34;
  const colors = MERMAID_PALETTE.pieColors;

  // 1. Assign branch colors to top-level branches
  root.color = '#0284c7';
  root.children.forEach((child, idx) => {
    const branchColor = colors[idx % colors.length];
    const assignColor = (n: MindmapNode) => {
      n.color = branchColor;
      n.children.forEach(assignColor);
    };
    assignColor(child);
  });

  // 2. Measure widths per column level
  const colWidths: number[] = [];
  const measureNode = (node: MindmapNode) => {
    const isRoot = node.level === 0;
    const textW = estimateTextWidth(node.text, isRoot ? 13 : 12);
    const w = Math.max(isRoot ? 90 : 70, textW + 28);
    const lvl = node.level;
    colWidths[lvl] = Math.max(colWidths[lvl] || 0, w);
    node.children.forEach(measureNode);
  };
  measureNode(root);

  // 3. Calculate column X coordinates
  const colX: number[] = [];
  let currentX = margin;
  for (let l = 0; l < colWidths.length; l++) {
    colX[l] = currentX;
    currentX += colWidths[l] + colGap;
  }
  const totalWidth = currentX - colGap + margin + 20;

  // 4. Hierarchical post-order leaf-accumulation Y layout
  // Every leaf node receives its own non-overlapping row slot.
  // Every parent node is centered precisely between its children.
  let leafIndex = 0;
  const nodePositions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  function positionSubtree(node: MindmapNode): number {
    const isRoot = node.level === 0;
    const textW = estimateTextWidth(node.text, isRoot ? 13 : 12);
    const width = Math.max(isRoot ? 90 : 70, textW + 28);
    const x = colX[node.level];

    let y: number;
    if (node.children.length === 0) {
      // Leaf node
      y = margin + leafIndex * (nodeHeight + rowGap);
      leafIndex++;
    } else {
      // Parent node: layout children first
      const childYs = node.children.map((child) => positionSubtree(child));
      const firstY = childYs[0];
      const lastY = childYs[childYs.length - 1];
      y = (firstY + lastY) / 2;
    }

    nodePositions.set(node.id, {
      x,
      y,
      width,
      height: nodeHeight,
    });

    return y;
  }

  positionSubtree(root);

  const totalHeight = Math.max(160, margin + leafIndex * (nodeHeight + rowGap) + margin);

  // 5. Render SVG link paths and node pills
  const svgLinks: string[] = [];
  const svgNodes: string[] = [];

  const drawElements = (node: MindmapNode) => {
    const dim = nodePositions.get(node.id);
    if (!dim) return;

    // Draw links to children
    for (const child of node.children) {
      const childDim = nodePositions.get(child.id);
      if (childDim) {
        const p1 = { x: dim.x + dim.width, y: dim.y + dim.height / 2 };
        const p2 = { x: childDim.x, y: childDim.y + childDim.height / 2 };
        const pathData = generateCurvedPath(p1, p2, 'LR');
        const strokeColor = child.color || 'var(--text-muted, #64748b)';
        svgLinks.push(`
          <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" />
        `);
      }
      drawElements(child);
    }

    // Draw node pill
    const isRoot = node.level === 0;
    let rx = isRoot ? 17 : 14;
    if (node.shape === 'rect') rx = 4;
    else if (node.shape === 'circle') rx = 17;

    const borderColor = node.color || 'var(--card-border, #cbd5e1)';

    svgNodes.push(`
      <g class="mermaid-node" id="node-${escapeXml(node.id)}">
        <rect x="${dim.x}" y="${dim.y}" width="${dim.width}" height="${dim.height}" rx="${rx}" fill="var(--card-bg, #ffffff)" stroke="${borderColor}" stroke-width="${isRoot ? 2.5 : 1.5}" />
        <text x="${dim.x + dim.width / 2}" y="${dim.y + dim.height / 2}" text-anchor="middle" dominant-baseline="central" font-weight="${isRoot ? '700' : '500'}" font-size="${isRoot ? 13 : 12}" fill="var(--text, #0f172a)">${escapeXml(node.text)}</text>
      </g>
    `);
  };

  drawElements(root);

  return {
    width: Math.max(200, totalWidth),
    height: Math.max(140, totalHeight),
    svgInner: `${svgLinks.join('\n')}\n${svgNodes.join('\n')}`,
  };
}
