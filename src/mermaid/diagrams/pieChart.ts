/**
 * Pie chart diagram parser, percentage calculation, and SVG renderer.
 */

import { PieData, PieSlice } from '../types';
import { MERMAID_PALETTE } from '../theme';
import { escapeXml, describeArc, estimateTextWidth } from '../svgUtils';

export function parsePie(code: string): PieData {
  const lines = code.split('\n');
  let title: string | undefined;
  const slices: PieSlice[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    const titleMatch = line.match(/^pie(?:\s+title\s+(.*?))?$/i);
    if (titleMatch) {
      if (titleMatch[1]) title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // "Label" : 123  or  Label : 123
    const sliceMatch = line.match(/^["']?(.*?)["']?\s*:\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (sliceMatch) {
      const label = sliceMatch[1].trim();
      const value = parseFloat(sliceMatch[2]);
      if (!isNaN(value) && value > 0) {
        slices.push({ label, value });
      }
    }
  }

  // Calculate percentages and assign palette colors
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const colors = MERMAID_PALETTE.pieColors;

  slices.forEach((slice, idx) => {
    slice.percentage = total > 0 ? (slice.value / total) * 100 : 0;
    slice.color = colors[idx % colors.length];
  });

  return { title, slices };
}

export function layoutPie(data: PieData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { title, slices } = data;
  if (slices.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  const radius = 95;
  const centerX = 125;
  const topOffset = title ? 40 : 25;
  const centerY = topOffset + radius;

  let currentAngle = 0;
  const svgPaths: string[] = [];

  // Special case: Single slice (100%)
  if (slices.length === 1) {
    const s = slices[0];
    svgPaths.push(`
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${s.color}" stroke="var(--card-bg, #ffffff)" stroke-width="2" />
    `);
  } else {
    for (const slice of slices) {
      const sliceAngle = ((slice.percentage || 0) / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;

      const pathData = describeArc(centerX, centerY, radius, startAngle, endAngle);
      svgPaths.push(`
        <path d="${pathData} L ${centerX} ${centerY} Z" fill="${slice.color}" stroke="var(--card-bg, #ffffff)" stroke-width="2" />
      `);

      currentAngle = endAngle;
    }
  }

  // Legend on right
  const legendX = centerX + radius + 35;
  let legendY = topOffset + 15;
  const legendItems: string[] = [];
  let maxLegendWidth = 0;

  for (const slice of slices) {
    const pctStr = `${Math.round(slice.percentage || 0)}%`;
    const labelText = `${slice.label} (${pctStr})`;
    const textW = estimateTextWidth(labelText, 12);
    if (textW > maxLegendWidth) maxLegendWidth = textW;

    legendItems.push(`
      <g class="mermaid-pie-legend-item">
        <rect x="${legendX}" y="${legendY - 9}" width="14" height="14" rx="3" fill="${slice.color}" />
        <text x="${legendX + 22}" y="${legendY + 2}" font-size="12" fill="var(--text, #0f172a)">${escapeXml(slice.label)} <tspan fill="var(--text-muted, #64748b)" font-weight="600">${pctStr}</tspan></text>
      </g>
    `);
    legendY += 24;
  }

  const totalWidth = legendX + maxLegendWidth + 50;
  const totalHeight = Math.max(centerY + radius + 30, legendY + 20);

  const titleSvg = title
    ? `<text x="${totalWidth / 2}" y="24" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    : '';

  return {
    width: Math.max(340, totalWidth),
    height: Math.max(240, totalHeight),
    svgInner: `${titleSvg}\n${svgPaths.join('\n')}\n${legendItems.join('\n')}`,
  };
}
