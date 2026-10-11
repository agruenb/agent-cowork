/**
 * Flowchart and Graph diagram parser, layout engine, and SVG renderer.
 */

import {
  FlowchartGraph,
  FlowchartNode,
  FlowchartEdge,
  FlowchartSubgraph,
  NodeShape,
} from '../types';
import {
  measureTextLines,
  renderNodeShapeSvg,
  renderMultilineTextSvg,
  escapeXml,
  estimateTextWidth,
  generateCurvedPath,
} from '../svgUtils';

/**
 * Parses node shape token from a string.
 */
function parseNodeToken(token: string): { id: string; label: string; shape: NodeShape } | null {
  const t = token.trim();
  if (!t) return null;

  // Stadium ([label])
  let match = t.match(/^([a-zA-Z0-9_.-]+)\s*\(\[(.*?)\]\)$/);
  if (match) return { id: match[1], label: match[2], shape: 'stadium' };

  // Subroutine [[label]]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\[(.*?)\]\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'subroutine' };

  // Cylinder [(label)]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\((.*?)\)\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'cylinder' };

  // Circle ((label))
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\(\((.*?)\)\)$/);
  if (match) return { id: match[1], label: match[2], shape: 'circle' };

  // Hexagon {{label}}
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\{\{(.*?)\}\}$/);
  if (match) return { id: match[1], label: match[2], shape: 'hexagon' };

  // Trapezoid [/label\]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\/(.*?)\\\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'trapezoid' };

  // Inverted Trapezoid [\label/]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\\(.*?)\/\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'trapezoid-inv' };

  // Parallelogram [/label/]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\/(.*?)\/\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'parallelogram' };

  // Parallelogram-inv [\label\]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[\\(.*?)\\\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'parallelogram-inv' };

  // Asymmetric / Flag >label]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*>\s*(.*?)\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'flag' };

  // Rhombus / Decision {label}
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\{(.*?)\}$/);
  if (match) return { id: match[1], label: match[2], shape: 'diamond' };

  // Rounded (label)
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\((.*?)\)$/);
  if (match) return { id: match[1], label: match[2], shape: 'rounded' };

  // Rect [label]
  match = t.match(/^([a-zA-Z0-9_.-]+)\s*\[(.*?)\]$/);
  if (match) return { id: match[1], label: match[2], shape: 'rect' };

  // Plain identifier
  match = t.match(/^([a-zA-Z0-9_.-]+)$/);
  if (match) return { id: match[1], label: match[1], shape: 'rounded' };

  return null;
}

/**
 * Parses flowchart/graph mermaid code.
 */
export function parseFlowchart(code: string): FlowchartGraph {
  const lines = code.split('\n');
  let direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL' = 'TD';
  const nodes = new Map<string, FlowchartNode>();
  const edges: FlowchartEdge[] = [];
  const subgraphs: FlowchartSubgraph[] = [];

  let currentSubgraph: FlowchartSubgraph | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    // Check header
    const headerMatch = line.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
    if (headerMatch) {
      direction = headerMatch[1].toUpperCase() as 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
      continue;
    }

    // Subgraph start
    const subMatch = line.match(/^subgraph\s+([a-zA-Z0-9_.-]+)?\s*\[?(.*?)\]?$/i);
    if (subMatch && !line.startsWith('end')) {
      const id = subMatch[1] || `sub_${subgraphs.length + 1}`;
      const title = subMatch[2] || id;
      currentSubgraph = {
        id,
        title: title.replace(/^\[|\]$/g, ''),
        nodeIds: [],
      };
      subgraphs.push(currentSubgraph);
      continue;
    }

    // Subgraph end
    if (line === 'end') {
      currentSubgraph = null;
      continue;
    }

    // Parse connections or standalone nodes in line
    // Look for connector operators: -->, ---, -.->, -.-, ==>, ===, with optional labels
    // Pattern: NodeA (connector) NodeB (connector) NodeC...
    const connRegex = /(-->\|.*?\||---\|.*?\||==>\|.*?\||--\s*.*?\s*-->|-\.\s*.*?\s*\.->|==\s*.*?\s*==>|-->|---|-.->|-.-|==>|===)/g;
    const connectors: { index: number; text: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = connRegex.exec(line)) !== null) {
      connectors.push({ index: match.index, text: match[0] });
    }

    if (connectors.length > 0) {
      // Split line into node segments by connectors
      const nodeParts: string[] = [];
      let lastIndex = 0;

      for (const conn of connectors) {
        nodeParts.push(line.substring(lastIndex, conn.index));
        lastIndex = conn.index + conn.text.length;
      }
      nodeParts.push(line.substring(lastIndex));

      // Process each node part and connect
      const parsedPartNodes: FlowchartNode[] = [];
      for (const part of nodeParts) {
        const parsed = parseNodeToken(part);
        if (parsed) {
          let node = nodes.get(parsed.id);
          if (!node) {
            node = {
              id: parsed.id,
              label: parsed.label || parsed.id,
              shape: parsed.shape,
              subgraphId: currentSubgraph ? currentSubgraph.id : undefined,
            };
            nodes.set(parsed.id, node);
          } else {
            // Update label/shape if currently more specific
            if (parsed.label && parsed.label !== parsed.id) node.label = parsed.label;
            if (parsed.shape !== 'rounded') node.shape = parsed.shape;
          }
          if (currentSubgraph && !currentSubgraph.nodeIds.includes(node.id)) {
            currentSubgraph.nodeIds.push(node.id);
            node.subgraphId = currentSubgraph.id;
          }
          parsedPartNodes.push(node);
        }
      }

      // Add edges between consecutive nodes
      for (let i = 0; i < connectors.length; i++) {
        if (i < parsedPartNodes.length - 1) {
          const fromNode = parsedPartNodes[i];
          const toNode = parsedPartNodes[i + 1];
          const connText = connectors[i].text;

          let linkType: 'solid' | 'dashed' | 'thick' = 'solid';
          let arrowType: 'arrow' | 'none' = 'arrow';
          let label = '';

          if (connText.includes('-.-')) linkType = 'dashed';
          if (connText.includes('===')) linkType = 'thick';

          if (connText === '---' || connText === '-.-' || connText === '===') {
            arrowType = 'none';
          }

          // Extract label: -->|label| or -- label -->
          const pipeLabel = connText.match(/\|(.*?)\|/);
          if (pipeLabel) {
            label = pipeLabel[1].trim();
          } else {
            const inlineLabel = connText.match(/(?:--|-\.|==)\s*(.*?)\s*(?:-->|\.->|==>)/);
            if (inlineLabel && inlineLabel[1]) {
              label = inlineLabel[1].trim();
            }
          }

          edges.push({
            from: fromNode.id,
            to: toNode.id,
            label: label || undefined,
            linkType,
            arrowType,
          });
        }
      }
    } else {
      // Standalone node definition
      const parsed = parseNodeToken(line);
      if (parsed) {
        let node = nodes.get(parsed.id);
        if (!node) {
          node = {
            id: parsed.id,
            label: parsed.label || parsed.id,
            shape: parsed.shape,
            subgraphId: currentSubgraph ? currentSubgraph.id : undefined,
          };
          nodes.set(parsed.id, node);
        }
        if (currentSubgraph && !currentSubgraph.nodeIds.includes(node.id)) {
          currentSubgraph.nodeIds.push(node.id);
        }
      }
    }
  }

  return { direction, nodes, edges, subgraphs };
}

/**
 * Computes topological rank and coordinates for all nodes in the flowchart.
 */
export function layoutFlowchart(graph: FlowchartGraph): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { direction, nodes, edges, subgraphs } = graph;
  const nodeList = Array.from(nodes.values());

  if (nodeList.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  // 1. Measure all nodes
  for (const node of nodeList) {
    const { width, height } = measureTextLines(node.label, 13);
    node.width = width;
    node.height = height;
  }

  // 2. Assign topological ranks using longest path
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodeList) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodes.has(edge.from) && nodes.has(edge.to)) {
      adj.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }

  // Initialize roots (in-degree 0) with rank 0
  const ranks = new Map<string, number>();
  const queue: string[] = [];

  for (const node of nodeList) {
    if ((inDegree.get(node.id) || 0) === 0) {
      ranks.set(node.id, 0);
      queue.push(node.id);
    }
  }

  // In case of cycles or disconnected components without 0 in-degree:
  if (queue.length === 0 && nodeList.length > 0) {
    ranks.set(nodeList[0].id, 0);
    queue.push(nodeList[0].id);
  }

  let iterations = 0;
  const maxIterations = nodeList.length * 3;

  while (queue.length > 0 && iterations++ < maxIterations) {
    const u = queue.shift()!;
    const currentRank = ranks.get(u) || 0;

    for (const v of adj.get(u) || []) {
      const nextRank = currentRank + 1;
      const prevRank = ranks.get(v);
      if (prevRank === undefined || nextRank > prevRank) {
        ranks.set(v, nextRank);
        queue.push(v);
      }
    }
  }

  // Assign any remaining unranked nodes
  for (const node of nodeList) {
    if (!ranks.has(node.id)) {
      ranks.set(node.id, 0);
    }
    node.rank = ranks.get(node.id) || 0;
  }

  // If direction is BT (bottom-to-top) or RL (right-to-left), invert ranks
  const maxRank = Math.max(0, ...nodeList.map((n) => n.rank || 0));
  if (direction === 'BT' || direction === 'RL') {
    for (const node of nodeList) {
      node.rank = maxRank - (node.rank || 0);
    }
  }

  // 3. Group nodes by rank into layers
  const layers: FlowchartNode[][] = [];
  for (let r = 0; r <= maxRank; r++) {
    layers[r] = [];
  }
  for (const node of nodeList) {
    const r = Math.min(maxRank, Math.max(0, node.rank || 0));
    layers[r].push(node);
  }

  // 4. Calculate coordinates based on direction
  const isVertical = direction === 'TD' || direction === 'TB' || direction === 'BT';
  const hasLabels = edges.some((e) => Boolean(e.label));
  const colGap = hasLabels ? 48 : 34;
  const rowGap = hasLabels ? 56 : 42;
  const margin = 24;

  let totalWidth = 0;
  let totalHeight = 0;

  if (isVertical) {
    // Top-to-bottom layout
    // Calculate layer widths
    let maxLayerWidth = 0;
    const layerWidths: number[] = [];
    const layerHeights: number[] = [];

    for (let r = 0; r <= maxRank; r++) {
      const layer = layers[r] || [];
      let w = 0;
      let h = 0;
      for (const node of layer) {
        w += (node.width || 80) + colGap;
        h = Math.max(h, node.height || 40);
      }
      w = Math.max(0, w - colGap);
      layerWidths[r] = w;
      layerHeights[r] = h;
      if (w > maxLayerWidth) maxLayerWidth = w;
    }

    totalWidth = maxLayerWidth + margin * 2;

    let currentY = margin;
    for (let r = 0; r <= maxRank; r++) {
      const layer = layers[r] || [];
      const currentLayerW = layerWidths[r] || 0;
      const startX = (totalWidth - currentLayerW) / 2;

      let currentX = startX;
      for (const node of layer) {
        node.x = currentX;
        node.y = currentY;
        currentX += (node.width || 80) + colGap;
      }

      currentY += (layerHeights[r] || 40) + rowGap;
    }

    totalHeight = currentY - rowGap + margin;
  } else {
    // Left-to-right layout
    let maxLayerHeight = 0;
    const colWidths: number[] = [];
    const colHeights: number[] = [];

    for (let r = 0; r <= maxRank; r++) {
      const layer = layers[r] || [];
      let w = 0;
      let h = 0;
      for (const node of layer) {
        w = Math.max(w, node.width || 80);
        h += (node.height || 40) + rowGap;
      }
      h = Math.max(0, h - rowGap);
      colWidths[r] = w;
      colHeights[r] = h;
      if (h > maxLayerHeight) maxLayerHeight = h;
    }

    totalHeight = maxLayerHeight + margin * 2;

    let currentX = margin;
    for (let r = 0; r <= maxRank; r++) {
      const layer = layers[r] || [];
      const currentColH = colHeights[r] || 0;
      const startY = (totalHeight - currentColH) / 2;

      let currentY = startY;
      for (const node of layer) {
        node.x = currentX;
        node.y = currentY;
        currentY += (node.height || 40) + rowGap;
      }

      currentX += (colWidths[r] || 80) + colGap;
    }

    totalWidth = currentX - colGap + margin;
  }

  // 5. Layout Subgraphs around their nodes
  for (const sub of subgraphs) {
    const subNodes = sub.nodeIds.map((id) => nodes.get(id)).filter(Boolean) as FlowchartNode[];
    if (subNodes.length > 0) {
      const minX = Math.min(...subNodes.map((n) => n.x || 0));
      const minY = Math.min(...subNodes.map((n) => n.y || 0));
      const maxX = Math.max(...subNodes.map((n) => (n.x || 0) + (n.width || 0)));
      const maxY = Math.max(...subNodes.map((n) => (n.y || 0) + (n.height || 0)));

      const pad = 16;
      const topPad = 30; // space for subgraph title
      sub.x = minX - pad;
      sub.y = minY - topPad;
      sub.width = maxX - minX + pad * 2;
      sub.height = maxY - minY + pad + topPad;
    }
  }

  // 6. Build SVG elements
  const svgParts: string[] = [];

  // Render Subgraphs
  for (const sub of subgraphs) {
    if (sub.x !== undefined && sub.y !== undefined && sub.width && sub.height) {
      svgParts.push(`
        <g class="mermaid-subgraph">
          <rect x="${sub.x}" y="${sub.y}" width="${sub.width}" height="${sub.height}" />
          <text x="${sub.x + 12}" y="${sub.y + 18}">${escapeXml(sub.title)}</text>
        </g>
      `);
    }
  }

  // Render Edges and Edge Labels in distinct layers
  // Collecting edge paths first and label badges second guarantees that all
  // arrows, lines, and markers are drawn UNDER edge labels, never on top of them.
  const edgeSvgParts: string[] = [];
  const labelSvgParts: string[] = [];

  for (const edge of edges) {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromW = fromNode.width || 80;
    const fromH = fromNode.height || 40;
    const toW = toNode.width || 80;
    const toH = toNode.height || 40;

    let p1: { x: number; y: number };
    let p2: { x: number; y: number };

    if (isVertical) {
      // Source bottom center -> Target top center
      p1 = { x: (fromNode.x || 0) + fromW / 2, y: (fromNode.y || 0) + fromH };
      p2 = { x: (toNode.x || 0) + toW / 2, y: (toNode.y || 0) };
    } else {
      // Source right center -> Target left center
      p1 = { x: (fromNode.x || 0) + fromW, y: (fromNode.y || 0) + fromH / 2 };
      p2 = { x: (toNode.x || 0), y: (toNode.y || 0) + toH / 2 };
    }

    const pathData = generateCurvedPath(p1, p2, direction);
    const classes = [
      'mermaid-edge',
      edge.linkType === 'dashed' ? 'is-dashed' : '',
      edge.linkType === 'thick' ? 'is-thick' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const marker = edge.arrowType === 'arrow' ? 'marker-end="url(#mermaid-arrow)"' : '';
    edgeSvgParts.push(`<path d="${pathData}" class="${classes}" ${marker} />`);

    // Edge label badge if present
    if (edge.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelW = estimateTextWidth(edge.label, 11) + 14;
      const labelH = 20;

      labelSvgParts.push(`
        <g class="mermaid-edge-label">
          <rect class="mermaid-edge-label-bg" x="${midX - labelW / 2}" y="${midY - labelH / 2}" width="${labelW}" height="${labelH}" rx="4" />
          <text x="${midX}" y="${midY}">${escapeXml(edge.label)}</text>
        </g>
      `);
    }
  }

  // 1. Edge lines and arrows (rendered first)
  svgParts.push(...edgeSvgParts);

  // 2. Nodes
  for (const node of nodeList) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 80;
    const h = node.height || 40;
    const shapeSvg = renderNodeShapeSvg(node.shape, x, y, w, h);
    const { lines } = measureTextLines(node.label, 13);
    const textSvg = renderMultilineTextSvg(lines, x + w / 2, y + h / 2, 13);

    svgParts.push(`
      <g class="mermaid-node" id="node-${escapeXml(node.id)}">
        ${shapeSvg}
        ${textSvg}
      </g>
    `);
  }

  // 3. Edge labels (rendered last so they are always on top of all lines, markers, and shapes)
  svgParts.push(...labelSvgParts);

  return {
    width: Math.max(120, totalWidth),
    height: Math.max(80, totalHeight),
    svgInner: svgParts.join('\n'),
  };
}
