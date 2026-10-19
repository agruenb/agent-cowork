/**
 * Packet diagram parser, bit-field row layout engine, and SVG renderer.
 */

import { PacketData, PacketField } from '../types';
import { escapeXml } from '../svgUtils';

export function parsePacketDiagram(code: string): PacketData {
  const lines = code.split('\n');
  const fields: PacketField[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || /^(?:packet|packet-beta)$/i.test(line)) {
      continue;
    }

    // 0-15: "Source Port"  or  16-31: Destination Port
    const match = line.match(/^(\d+)(?:-(\d+))?\s*:\s*["']?(.*?)["']?$/);
    if (match) {
      const startBit = parseInt(match[1], 10);
      const endBit = match[2] ? parseInt(match[2], 10) : startBit;
      const label = match[3].trim();
      fields.push({ startBit, endBit, label });
    }
  }

  return { fields };
}

export function layoutPacketDiagram(data: PacketData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { fields } = data;
  if (fields.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const bitsPerRow = 32;
  const maxBit = Math.max(...fields.map((f) => f.endBit));
  const numRows = Math.ceil((maxBit + 1) / bitsPerRow);

  const leftMargin = 36;
  const topMargin = 40;
  const rowHeight = 44;
  const totalBitWidth = 576; // 18px per bit
  const bitWidth = totalBitWidth / bitsPerRow;
  const totalWidth = leftMargin + totalBitWidth + 36;
  const totalHeight = topMargin + numRows * rowHeight + 36;

  const renderedElements: string[] = [];

  // Bit index header on top: 0, 4, 8, 12, 16, 20, 24, 28, 31
  const headerIndices = [0, 4, 8, 12, 16, 20, 24, 28, 31];
  headerIndices.forEach((bit) => {
    const bx = leftMargin + bit * bitWidth + (bit === 31 ? bitWidth : 0);
    renderedElements.push(`
      <text x="${bx}" y="${topMargin - 12}" text-anchor="${bit === 31 ? 'end' : 'start'}" font-size="10.5" font-family="monospace" fill="var(--text-muted, #64748b)">${bit}</text>
    `);
  });

  // Background grid rows
  for (let r = 0; r < numRows; r++) {
    const ry = topMargin + r * rowHeight;
    renderedElements.push(`
      <rect x="${leftMargin}" y="${ry}" width="${totalBitWidth}" height="${rowHeight}" fill="rgba(100, 116, 139, 0.04)" stroke="var(--card-border, #cbd5e1)" stroke-width="1.2" />
    `);
  }

  const palette = [
    'rgba(56, 189, 248, 0.12)', // sky
    'rgba(129, 140, 248, 0.12)', // indigo
    'rgba(52, 211, 153, 0.12)', // emerald
    'rgba(251, 191, 36, 0.12)', // amber
    'rgba(244, 114, 182, 0.12)', // pink
  ];

  // Draw fields across rows
  fields.forEach((field, fIdx) => {
    const color = palette[fIdx % palette.length];

    // Field may span across multiple 32-bit rows
    let currentBit = field.startBit;
    while (currentBit <= field.endBit) {
      const rowIndex = Math.floor(currentBit / bitsPerRow);
      const rowStartBit = rowIndex * bitsPerRow;
      const rowEndBit = rowStartBit + bitsPerRow - 1;

      const segmentStart = currentBit;
      const segmentEnd = Math.min(field.endBit, rowEndBit);

      const cellX = leftMargin + (segmentStart - rowStartBit) * bitWidth;
      const cellY = topMargin + rowIndex * rowHeight;
      const cellW = (segmentEnd - segmentStart + 1) * bitWidth;

      renderedElements.push(`
        <rect x="${cellX}" y="${cellY}" width="${cellW}" height="${rowHeight}" fill="${color}" stroke="var(--card-border, #cbd5e1)" stroke-width="1.2" />
        <text x="${cellX + 4}" y="${cellY + 12}" font-size="9" font-family="monospace" fill="var(--text-muted, #64748b)">${segmentStart === segmentEnd ? segmentStart : `${segmentStart}-${segmentEnd}`}</text>
        <text x="${cellX + cellW / 2}" y="${cellY + rowHeight / 2 + 5}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(field.label)}</text>
      `);

      currentBit = segmentEnd + 1;
    }
  });

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: renderedElements.join('\n'),
  };
}
