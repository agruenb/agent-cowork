/**
 * XY Chart (bar & line) diagram parser, scale mapper, and SVG renderer.
 */

import { XyChartData, XySeries } from '../types';
import { escapeXml } from '../svgUtils';

export function parseXyChart(code: string): XyChartData {
  const lines = code.split('\n');
  let title: string | undefined;
  let xAxisTitle: string | undefined;
  let xAxisCategories: string[] | undefined;
  let xAxisRange: [number, number] | undefined;
  let yAxisTitle: string | undefined;
  let yAxisRange: [number, number] | undefined;
  const series: XySeries[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || /^(?:xychart|xychart-beta)$/i.test(line)) {
      continue;
    }

    // title "Title Text"
    const titleMatch = line.match(/^title\s+(.*?)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // x-axis ["cat1", "cat2"] or x-axis [cat1, cat2] or x-axis "Title" [cat1, cat2]
    const xAxisMatch = line.match(/^x-axis(?:\s+"([^"]+)")?\s+(.*?)$/i);
    if (xAxisMatch) {
      if (xAxisMatch[1]) xAxisTitle = xAxisMatch[1].trim();
      const rest = xAxisMatch[2].trim();
      if (rest.startsWith('[')) {
        xAxisCategories = rest
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
      } else if (rest.includes('-->')) {
        const parts = rest.split(/\s*-->\s*/);
        const min = parseFloat(parts[0]);
        const max = parseFloat(parts[1]);
        if (!isNaN(min) && !isNaN(max)) {
          xAxisRange = [min, max];
        }
      }
      continue;
    }

    // y-axis "Title" 4000 --> 11000 or y-axis 0 --> 100
    const yAxisMatch = line.match(/^y-axis(?:\s+"([^"]+)")?\s+(.*?)$/i);
    if (yAxisMatch) {
      if (yAxisMatch[1]) yAxisTitle = yAxisMatch[1].trim();
      const rest = yAxisMatch[2].trim();
      if (rest.includes('-->')) {
        const parts = rest.split(/\s*-->\s*/);
        const min = parseFloat(parts[0]);
        const max = parseFloat(parts[1]);
        if (!isNaN(min) && !isNaN(max)) {
          yAxisRange = [min, max];
        }
      }
      continue;
    }

    // bar [1, 2, 3] or bar "Series A" [1, 2, 3]
    const barMatch = line.match(/^bar(?:\s+"([^"]+)")?\s*\[(.*?)\]/i);
    if (barMatch) {
      const sTitle = barMatch[1]?.trim();
      const vals = barMatch[2]
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      series.push({ type: 'bar', title: sTitle, values: vals });
      continue;
    }

    // line [1, 2, 3] or line "Series B" [1, 2, 3]
    const lineMatch = line.match(/^line(?:\s+"([^"]+)")?\s*\[(.*?)\]/i);
    if (lineMatch) {
      const sTitle = lineMatch[1]?.trim();
      const vals = lineMatch[2]
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      series.push({ type: 'line', title: sTitle, values: vals });
      continue;
    }
  }

  return {
    title,
    xAxisTitle,
    xAxisCategories,
    xAxisRange,
    yAxisTitle,
    yAxisRange,
    series,
  };
}

export function layoutXyChart(data: XyChartData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { title, xAxisTitle, xAxisCategories = [], yAxisTitle, yAxisRange, series } = data;

  // Determine category count
  let catCount = xAxisCategories.length;
  if (catCount === 0) {
    const maxVals = Math.max(0, ...series.map((s) => s.values.length));
    catCount = maxVals;
    for (let i = 1; i <= maxVals; i++) {
      xAxisCategories.push(`${i}`);
    }
  }

  // Calculate min and max y
  let minY = yAxisRange ? yAxisRange[0] : 0;
  let maxY = yAxisRange ? yAxisRange[1] : 0;

  if (!yAxisRange || isNaN(maxY)) {
    let allVals: number[] = [];
    for (const s of series) {
      allVals = allVals.concat(s.values);
    }
    if (allVals.length > 0) {
      const actualMax = Math.max(...allVals);
      const actualMin = Math.min(...allVals, 0);
      minY = actualMin;
      maxY = actualMax <= 0 ? 10 : Math.ceil(actualMax * 1.15);
    } else {
      minY = 0;
      maxY = 100;
    }
  }

  if (minY === maxY) maxY = minY + 10;

  const topMargin = title ? 56 : 36;
  const leftMargin = 68;
  const rightMargin = 36;
  const bottomMargin = xAxisTitle ? 64 : 48;

  const plotWidth = Math.max(320, catCount * 46);
  const plotHeight = 240;
  const totalWidth = leftMargin + plotWidth + rightMargin;
  const totalHeight = topMargin + plotHeight + bottomMargin;

  const titleSvg = title
    ? `<text x="${totalWidth / 2}" y="28" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    : '';

  // Y-axis gridlines and ticks (5 steps)
  const steps = 4;
  const gridLines: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const val = minY + ((maxY - minY) * (steps - i)) / steps;
    const yPos = topMargin + (plotHeight * i) / steps;
    const valStr = Math.abs(val) >= 1000 ? `${Math.round(val / 100) / 10}k` : `${Math.round(val)}`;

    gridLines.push(`
      <line x1="${leftMargin}" y1="${yPos}" x2="${leftMargin + plotWidth}" y2="${yPos}" stroke="var(--card-border, #e2e8f0)" stroke-dasharray="3 3" stroke-width="1" />
      <text x="${leftMargin - 10}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="var(--text-muted, #64748b)">${valStr}</text>
    `);
  }

  // Y-axis title
  if (yAxisTitle) {
    gridLines.push(`
      <text x="${16}" y="${topMargin + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${topMargin + plotHeight / 2})" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(yAxisTitle)}</text>
    `);
  }

  // Base axis line
  const baseLine = `
    <line x1="${leftMargin}" y1="${topMargin + plotHeight}" x2="${leftMargin + plotWidth}" y2="${topMargin + plotHeight}" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
    <line x1="${leftMargin}" y1="${topMargin}" x2="${leftMargin}" y2="${topMargin + plotHeight}" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
  `;

  // X-axis category labels
  const colWidth = catCount > 0 ? plotWidth / catCount : plotWidth;
  const catSvgs: string[] = [];
  for (let i = 0; i < catCount; i++) {
    const cx = leftMargin + i * colWidth + colWidth / 2;
    const catLabel = xAxisCategories[i] || '';
    catSvgs.push(`
      <text x="${cx}" y="${topMargin + plotHeight + 20}" text-anchor="middle" font-size="11.5" fill="var(--text, #0f172a)">${escapeXml(catLabel)}</text>
    `);
  }

  if (xAxisTitle) {
    catSvgs.push(`
      <text x="${leftMargin + plotWidth / 2}" y="${topMargin + plotHeight + 42}" text-anchor="middle" font-size="12" font-weight="500" fill="var(--text-muted, #64748b)">${escapeXml(xAxisTitle)}</text>
    `);
  }

  // Render Series
  const seriesSvgs: string[] = [];
  const barSeries = series.filter((s) => s.type === 'bar');
  const barColors = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24'];
  const lineColors = ['#0284c7', '#f472b6', '#a78bfa', '#fb7185'];

  // Bars
  if (barSeries.length > 0) {
    const numBars = barSeries.length;
    const barPad = 8;
    const availColW = Math.max(12, colWidth - barPad * 2);
    const individualBarW = Math.max(6, availColW / numBars);

    barSeries.forEach((s, sIdx) => {
      const color = barColors[sIdx % barColors.length];
      s.values.forEach((val, vIdx) => {
        if (vIdx >= catCount) return;
        const normalized = (val - minY) / (maxY - minY);
        const barH = Math.max(2, Math.min(plotHeight, normalized * plotHeight));
        const bx = leftMargin + vIdx * colWidth + barPad + sIdx * individualBarW;
        const by = topMargin + plotHeight - barH;

        seriesSvgs.push(`
          <rect x="${bx}" y="${by}" width="${individualBarW - 2}" height="${barH}" fill="${color}" rx="3" ry="3" />
        `);
      });
    });
  }

  // Lines
  const lineSeries = series.filter((s) => s.type === 'line');
  lineSeries.forEach((s, sIdx) => {
    const color = lineColors[sIdx % lineColors.length];
    const pts: { x: number; y: number }[] = [];

    s.values.forEach((val, vIdx) => {
      if (vIdx >= catCount) return;
      const normalized = (val - minY) / (maxY - minY);
      const px = leftMargin + vIdx * colWidth + colWidth / 2;
      const py = topMargin + plotHeight - normalized * plotHeight;
      pts.push({ x: px, y: py });
    });

    if (pts.length > 0) {
      const pathD = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      seriesSvgs.push(`
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      `);

      pts.forEach((p) => {
        seriesSvgs.push(`
          <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="var(--card-bg, #ffffff)" stroke-width="2" />
        `);
      });
    }
  });

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: `
      ${titleSvg}
      ${gridLines.join('\n')}
      ${baseLine}
      ${catSvgs.join('\n')}
      ${seriesSvgs.join('\n')}
    `,
  };
}
