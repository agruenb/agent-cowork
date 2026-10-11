/**
 * Utility functions for generating SVG elements and markers in the Mermaid renderer.
 */

import { NodeShape } from './types';

export function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Estimates text width in pixels based on character count and font size.
 */
export function estimateTextWidth(text: string, fontSize = 13): number {
  if (!text) return 0;
  // Non-monospace proportional font averages ~0.6 * fontSize per character
  return Math.max(30, Math.ceil(text.length * (fontSize * 0.62)));
}

/**
 * Splits text into lines and estimates multiline box dimensions.
 */
export function measureTextLines(
  text: string,
  fontSize = 13
): { lines: string[]; width: number; height: number } {
  // Support `<br>` or `\n` in labels
  const rawLines = (text || '').replace(/<br\s*\/?>/gi, '\n').split('\n');
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { lines: [''], width: 40, height: 36 };
  }

  let maxWidth = 0;
  for (const line of lines) {
    const w = estimateTextWidth(line, fontSize);
    if (w > maxWidth) maxWidth = w;
  }

  const lineHeight = fontSize * 1.35;
  const height = Math.max(36, lines.length * lineHeight + 18);
  const width = Math.max(70, maxWidth + 28);

  return { lines, width, height };
}

/**
 * Returns standard SVG defs containing marker arrowheads, crosses, and shapes.
 */
export function getStandardSvgDefs(): string {
  return `<defs>
    <!-- Solid arrowhead for directed edges -->
    <marker id="mermaid-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--text-muted, #64748b)" />
    </marker>
    <!-- Solid arrowhead for sequence messages -->
    <marker id="mermaid-arrow-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--text, #0f172a)" />
    </marker>
    <!-- Open line arrow for sequence messages -->
    <marker id="mermaid-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9" fill="none" stroke="var(--text, #0f172a)" stroke-width="1.5" />
    </marker>
    <!-- Cross marker for async / lost messages -->
    <marker id="mermaid-cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 2 2 L 8 8 M 8 2 L 2 8" fill="none" stroke="var(--text, #0f172a)" stroke-width="1.5" />
    </marker>
    <!-- Circle marker for state / ER start or cardinality -->
    <marker id="mermaid-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <circle cx="5" cy="5" r="3.5" fill="var(--card-bg, #ffffff)" stroke="var(--text-muted, #64748b)" stroke-width="1.5" />
    </marker>
    <!-- Hollow triangle for class inheritance -->
    <marker id="mermaid-triangle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--card-bg, #ffffff)" stroke="var(--text-muted, #64748b)" stroke-width="1.5" />
    </marker>
    <!-- Diamond for aggregation / composition -->
    <marker id="mermaid-diamond" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="10" markerHeight="7" orient="auto-start-reverse">
      <polygon points="0,5 8,1 16,5 8,9" fill="var(--card-bg, #ffffff)" stroke="var(--text-muted, #64748b)" stroke-width="1.5" />
    </marker>
    <marker id="mermaid-diamond-filled" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="10" markerHeight="7" orient="auto-start-reverse">
      <polygon points="0,5 8,1 16,5 8,9" fill="var(--text, #0f172a)" stroke="var(--text, #0f172a)" stroke-width="1.5" />
    </marker>
  </defs>`;
}

/**
 * Generates the SVG element for a node shape given its bounding box.
 */
export function renderNodeShapeSvg(
  shape: NodeShape,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  const halfW = width / 2;
  const halfH = height / 2;
  const cx = x + halfW;
  const cy = y + halfH;

  switch (shape) {
    case 'rect':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2" ry="2" />`;

    case 'rounded':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8" />`;

    case 'stadium': {
      const r = Math.min(halfW, halfH);
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" ry="${r}" />`;
    }

    case 'subroutine':
      return `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2" ry="2" />
        <line x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y + height}" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
        <line x1="${x + width - 8}" y1="${y}" x2="${x + width - 8}" y2="${y + height}" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
      `;

    case 'cylinder': {
      const ellipseH = Math.min(10, height * 0.2);
      return `
        <path d="M ${x} ${y + ellipseH} A ${halfW} ${ellipseH} 0 0 0 ${x + width} ${y + ellipseH} v ${height - ellipseH * 2} A ${halfW} ${ellipseH} 0 0 1 ${x} ${y + height - ellipseH} Z" />
        <ellipse cx="${cx}" cy="${y + ellipseH}" rx="${halfW}" ry="${ellipseH}" />
      `;
    }

    case 'circle': {
      const r = Math.max(halfW, halfH);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" />`;
    }

    case 'diamond': {
      // Rhombus / Decision
      const pts = `${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`;
      return `<polygon points="${pts}" />`;
    }

    case 'hexagon': {
      const inset = Math.min(16, width * 0.2);
      const pts = `${x + inset},${y} ${x + width - inset},${y} ${x + width},${cy} ${x + width - inset},${y + height} ${x + inset},${y + height} ${x},${cy}`;
      return `<polygon points="${pts}" />`;
    }

    case 'parallelogram': {
      const skew = Math.min(16, width * 0.18);
      const pts = `${x + skew},${y} ${x + width},${y} ${x + width - skew},${y + height} ${x},${y + height}`;
      return `<polygon points="${pts}" />`;
    }

    case 'parallelogram-inv': {
      const skew = Math.min(16, width * 0.18);
      const pts = `${x},${y} ${x + width - skew},${y} ${x + width},${y + height} ${x + skew},${y + height}`;
      return `<polygon points="${pts}" />`;
    }

    case 'trapezoid': {
      const inset = Math.min(14, width * 0.15);
      const pts = `${x + inset},${y} ${x + width - inset},${y} ${x + width},${y + height} ${x},${y + height}`;
      return `<polygon points="${pts}" />`;
    }

    case 'trapezoid-inv': {
      const inset = Math.min(14, width * 0.15);
      const pts = `${x},${y} ${x + width},${y} ${x + width - inset},${y + height} ${x + inset},${y + height}`;
      return `<polygon points="${pts}" />`;
    }

    case 'flag':
    default:
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" ry="6" />`;
  }
}

/**
 * Generates an SVG text element supporting multiple lines.
 */
export function renderMultilineTextSvg(
  lines: string[],
  cx: number,
  cy: number,
  fontSize = 13
): string {
  if (lines.length === 1) {
    return `<text x="${cx}" y="${cy}">${escapeXml(lines[0])}</text>`;
  }

  const lineHeight = fontSize * 1.35;
  const totalH = (lines.length - 1) * lineHeight;
  const startY = cy - totalH / 2;

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${cx}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join('');

  return `<text>${tspans}</text>`;
}

/**
 * Computes smooth bezier or straight paths between two points.
 */
export function generateCurvedPath(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL'
): string {
  const isVertical = direction === 'TD' || direction === 'TB' || direction === 'BT';

  if (isVertical) {
    const midY = (p1.y + p2.y) / 2;
    return `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
  } else {
    const midX = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`;
  }
}

/**
 * Math helpers for polar coordinates to SVG arc command.
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(' ');
}
