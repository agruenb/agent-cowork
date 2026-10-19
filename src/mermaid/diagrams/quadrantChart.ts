/**
 * Quadrant chart diagram parser, coordinate mapping, and SVG renderer.
 */

import { QuadrantData, QuadrantPoint } from '../types';
import { escapeXml, estimateTextWidth } from '../svgUtils';

export function parseQuadrant(code: string): QuadrantData {
  const lines = code.split('\n');
  let title: string | undefined;
  let xAxisLabelLeft: string | undefined;
  let xAxisLabelRight: string | undefined;
  let yAxisLabelBottom: string | undefined;
  let yAxisLabelTop: string | undefined;
  let quadrant1: string | undefined;
  let quadrant2: string | undefined;
  let quadrant3: string | undefined;
  let quadrant4: string | undefined;
  const points: QuadrantPoint[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'quadrantchart') {
      continue;
    }

    // title Title Text
    const titleMatch = line.match(/^title\s+(.*?)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // x-axis Left Label --> Right Label  or  x-axis Label
    const xAxisMatch = line.match(/^x-axis\s+(.*?)$/i);
    if (xAxisMatch) {
      const rest = xAxisMatch[1].trim();
      const parts = rest.split(/\s*-->\s*/);
      if (parts.length > 1) {
        xAxisLabelLeft = parts[0]?.trim().replace(/^["']|["']$/g, '');
        xAxisLabelRight = parts[1]?.trim().replace(/^["']|["']$/g, '');
      } else {
        xAxisLabelLeft = parts[0]?.trim().replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // y-axis Bottom Label --> Top Label  or  y-axis Label
    const yAxisMatch = line.match(/^y-axis\s+(.*?)$/i);
    if (yAxisMatch) {
      const rest = yAxisMatch[1].trim();
      const parts = rest.split(/\s*-->\s*/);
      if (parts.length > 1) {
        yAxisLabelBottom = parts[0]?.trim().replace(/^["']|["']$/g, '');
        yAxisLabelTop = parts[1]?.trim().replace(/^["']|["']$/g, '');
      } else {
        yAxisLabelBottom = parts[0]?.trim().replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // quadrant-1 / 2 / 3 / 4 Text
    const qMatch = line.match(/^quadrant-([1-4])\s+(.*?)$/i);
    if (qMatch) {
      const qNum = parseInt(qMatch[1], 10);
      const text = qMatch[2].trim().replace(/^["']|["']$/g, '');
      if (qNum === 1) quadrant1 = text;
      else if (qNum === 2) quadrant2 = text;
      else if (qNum === 3) quadrant3 = text;
      else if (qNum === 4) quadrant4 = text;
      continue;
    }

    // Item: [0.3, 0.6]  or  "Item": [0.3, 0.6]
    const ptMatch = line.match(/^["']?(.*?)["']?\s*:\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]$/);
    if (ptMatch) {
      const label = ptMatch[1].trim();
      const x = parseFloat(ptMatch[2]);
      const y = parseFloat(ptMatch[3]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ label, x, y });
      }
      continue;
    }
  }

  return {
    title,
    xAxisLabelLeft,
    xAxisLabelRight,
    yAxisLabelBottom,
    yAxisLabelTop,
    quadrant1,
    quadrant2,
    quadrant3,
    quadrant4,
    points,
  };
}

export function layoutQuadrant(data: QuadrantData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const {
    title,
    xAxisLabelLeft,
    xAxisLabelRight,
    yAxisLabelBottom,
    yAxisLabelTop,
    quadrant1,
    quadrant2,
    quadrant3,
    quadrant4,
    points,
  } = data;

  // Measure y-axis labels to dynamically ensure leftMargin accommodates them fully without clipping
  const yTopWidth = yAxisLabelTop ? estimateTextWidth(yAxisLabelTop, 12) : 0;
  const yBottomWidth = yAxisLabelBottom ? estimateTextWidth(yAxisLabelBottom, 12) : 0;
  const maxYLabelWidth = Math.max(yTopWidth, yBottomWidth);

  const topMargin = title ? 56 : 36;
  const leftMargin = maxYLabelWidth > 0 ? Math.max(54, maxYLabelWidth + 24) : 36;

  // Measure right margin so point labels don't get cut off on the right
  const chartWidth = 440;
  const chartHeight = 360;

  let maxRightPointOverflow = 0;
  points.forEach((p) => {
    if (p.x > 0.6) {
      const ptLabelW = estimateTextWidth(p.label, 11.5);
      const overflow = (p.x - 1) * chartWidth + 9 + ptLabelW;
      if (overflow > maxRightPointOverflow) {
        maxRightPointOverflow = overflow;
      }
    }
  });

  const rightMargin = Math.max(44, maxRightPointOverflow + 18);
  const bottomMargin = (xAxisLabelLeft || xAxisLabelRight) ? 54 : 36;

  const totalWidth = leftMargin + chartWidth + rightMargin;
  const totalHeight = topMargin + chartHeight + bottomMargin;

  const halfW = chartWidth / 2;
  const halfH = chartHeight / 2;
  const midX = leftMargin + halfW;
  const midY = topMargin + halfH;

  const titleSvg = title
    ? `<text x="${totalWidth / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    : '';

  // Quadrants background rects
  // Q2: top-left (0 to 0.5, 0.5 to 1 in standard coords)
  // Q1: top-right (0.5 to 1, 0.5 to 1)
  // Q3: bottom-left (0 to 0.5, 0 to 0.5)
  // Q4: bottom-right (0.5 to 1, 0 to 0.5)
  const q2Rect = `<rect x="${leftMargin}" y="${topMargin}" width="${halfW}" height="${halfH}" fill="rgba(56, 189, 248, 0.07)" rx="4" />`;
  const q1Rect = `<rect x="${midX}" y="${topMargin}" width="${halfW}" height="${halfH}" fill="rgba(52, 211, 153, 0.07)" rx="4" />`;
  const q3Rect = `<rect x="${leftMargin}" y="${midY}" width="${halfW}" height="${halfH}" fill="rgba(244, 114, 182, 0.07)" rx="4" />`;
  const q4Rect = `<rect x="${midX}" y="${midY}" width="${halfW}" height="${halfH}" fill="rgba(251, 191, 36, 0.07)" rx="4" />`;

  // Quadrant corner labels
  const qLabels: string[] = [];
  if (quadrant2) {
    qLabels.push(`<text x="${leftMargin + 14}" y="${topMargin + 24}" font-size="12" font-weight="600" fill="var(--text-muted, #64748b)">${escapeXml(quadrant2)}</text>`);
  }
  if (quadrant1) {
    qLabels.push(`<text x="${leftMargin + chartWidth - 14}" y="${topMargin + 24}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text-muted, #64748b)">${escapeXml(quadrant1)}</text>`);
  }
  if (quadrant3) {
    qLabels.push(`<text x="${leftMargin + 14}" y="${topMargin + chartHeight - 14}" font-size="12" font-weight="600" fill="var(--text-muted, #64748b)">${escapeXml(quadrant3)}</text>`);
  }
  if (quadrant4) {
    qLabels.push(`<text x="${leftMargin + chartWidth - 14}" y="${topMargin + chartHeight - 14}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text-muted, #64748b)">${escapeXml(quadrant4)}</text>`);
  }

  // Cross dividing lines
  const centerLines = `
    <line x1="${midX}" y1="${topMargin}" x2="${midX}" y2="${topMargin + chartHeight}" stroke="var(--card-border, #cbd5e1)" stroke-dasharray="4 4" stroke-width="1.5" />
    <line x1="${leftMargin}" y1="${midY}" x2="${leftMargin + chartWidth}" y2="${midY}" stroke="var(--card-border, #cbd5e1)" stroke-dasharray="4 4" stroke-width="1.5" />
    <rect x="${leftMargin}" y="${topMargin}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" rx="6" />
  `;

  // Axis labels
  const axisSvgs: string[] = [];
  if (xAxisLabelLeft && xAxisLabelRight) {
    axisSvgs.push(`<text x="${leftMargin}" y="${topMargin + chartHeight + 22}" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(xAxisLabelLeft)}</text>`);
    axisSvgs.push(`<text x="${leftMargin + chartWidth}" y="${topMargin + chartHeight + 22}" text-anchor="end" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(xAxisLabelRight)}</text>`);
  } else if (xAxisLabelLeft || xAxisLabelRight) {
    const singleX = xAxisLabelLeft || xAxisLabelRight || '';
    axisSvgs.push(`<text x="${leftMargin + chartWidth / 2}" y="${topMargin + chartHeight + 22}" text-anchor="middle" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(singleX)}</text>`);
  }

  if (yAxisLabelTop && yAxisLabelBottom) {
    axisSvgs.push(`<text x="${leftMargin - 12}" y="${topMargin + 16}" text-anchor="end" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(yAxisLabelTop)}</text>`);
    axisSvgs.push(`<text x="${leftMargin - 12}" y="${topMargin + chartHeight - 4}" text-anchor="end" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(yAxisLabelBottom)}</text>`);
  } else if (yAxisLabelBottom || yAxisLabelTop) {
    const singleY = yAxisLabelBottom || yAxisLabelTop || '';
    axisSvgs.push(`<text x="${leftMargin - 12}" y="${topMargin + chartHeight / 2 + 4}" text-anchor="end" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(singleY)}</text>`);
  }

  // Points rendering
  const pointSvgs: string[] = [];
  const palette = ['#0284c7', '#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa'];

  points.forEach((pt, idx) => {
    // Normalise x and y: clamp to [0, 1]
    const clampedX = Math.max(0, Math.min(1, pt.x));
    const clampedY = Math.max(0, Math.min(1, pt.y));

    const cx = leftMargin + clampedX * chartWidth;
    // In SVG, y is inverted: y=1 at top, y=0 at bottom
    const cy = topMargin + (1 - clampedY) * chartHeight;
    const color = palette[idx % palette.length];

    pointSvgs.push(`
      <g class="mermaid-quadrant-point">
        <circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="var(--card-bg, #ffffff)" stroke-width="2" />
        <text x="${cx + 9}" y="${cy + 4}" font-size="11.5" font-weight="500" fill="var(--text, #0f172a)">${escapeXml(pt.label)}</text>
      </g>
    `);
  });

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: `
      ${titleSvg}
      ${q2Rect}
      ${q1Rect}
      ${q3Rect}
      ${q4Rect}
      ${centerLines}
      ${qLabels.join('\n')}
      ${axisSvgs.join('\n')}
      ${pointSvgs.join('\n')}
    `,
  };
}
