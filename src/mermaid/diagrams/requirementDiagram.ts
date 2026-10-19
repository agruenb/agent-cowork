/**
 * Requirement diagram parser, SysML-style box layout, and SVG renderer.
 */

import { RequirementData, ReqItem, ReqElement, ReqRelationship } from '../types';
import { escapeXml } from '../svgUtils';

export function parseRequirementDiagram(code: string): RequirementData {
  const lines = code.split('\n');
  const requirements = new Map<string, ReqItem>();
  const elements = new Map<string, ReqElement>();
  const relationships: ReqRelationship[] = [];

  let currentBlockType: 'req' | 'elem' | null = null;
  let currentReq: ReqItem | null = null;
  let currentElem: ReqElement | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'requirementdiagram') {
      continue;
    }

    // End of block }
    if (line === '}') {
      if (currentReq) {
        requirements.set(currentReq.name, currentReq);
        currentReq = null;
      }
      if (currentElem) {
        elements.set(currentElem.name, currentElem);
        currentElem = null;
      }
      currentBlockType = null;
      continue;
    }

    // requirement / functionalRequirement Name {
    const reqHeader = line.match(/^([a-zA-Z0-9_]+Requirement|requirement)\s+([a-zA-Z0-9_.-]+)\s*\{/i);
    if (reqHeader) {
      currentBlockType = 'req';
      currentReq = {
        name: reqHeader[2].trim(),
        type: reqHeader[1].trim(),
      };
      continue;
    }

    // element Name {
    const elemHeader = line.match(/^element\s+([a-zA-Z0-9_.-]+)\s*\{/i);
    if (elemHeader) {
      currentBlockType = 'elem';
      currentElem = {
        name: elemHeader[1].trim(),
      };
      continue;
    }

    // Key-value pairs inside blocks
    if (currentBlockType === 'req' && currentReq) {
      const kv = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1].toLowerCase();
        const val = kv[2].trim().replace(/^["']|["']$/g, '');
        if (key === 'id') currentReq.id = val;
        else if (key === 'text') currentReq.text = val;
        else if (key === 'risk') currentReq.risk = val;
        else if (key === 'verifymethod') currentReq.verifyMethod = val;
      }
      continue;
    }

    if (currentBlockType === 'elem' && currentElem) {
      const kv = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1].toLowerCase();
        const val = kv[2].trim().replace(/^["']|["']$/g, '');
        if (key === 'type') currentElem.type = val;
        else if (key === 'docref') currentElem.docRef = val;
      }
      continue;
    }

    // Relationships: elem - satisfies -> req
    const relMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*-\s*([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_.-]+)$/);
    if (relMatch) {
      relationships.push({
        source: relMatch[1].trim(),
        type: relMatch[2].trim(),
        target: relMatch[3].trim(),
      });
      continue;
    }
  }

  return { requirements, elements, relationships };
}

export function layoutRequirementDiagram(data: RequirementData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { requirements, elements, relationships } = data;
  const reqList = Array.from(requirements.values());
  const elemList = Array.from(elements.values());

  if (reqList.length === 0 && elemList.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const boxWidth = 210;
  const boxHeight = 110;
  const gapX = 60;
  const gapY = 48;
  const leftMargin = 36;
  const topMargin = 36;

  // Layout: Requirements on right, Elements on left (or 2 columns)
  const posMap = new Map<string, { x: number; y: number; width: number; height: number }>();
  const renderedBoxes: string[] = [];

  // Place Elements in Column 0
  elemList.forEach((el, idx) => {
    const x = leftMargin;
    const y = topMargin + idx * (boxHeight + gapY);
    posMap.set(el.name, { x, y, width: boxWidth, height: boxHeight });

    renderedBoxes.push(`
      <g class="mermaid-req-box" id="elem-${escapeXml(el.name)}">
        <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" ry="6" fill="var(--card-bg, #ffffff)" stroke="#0284c7" stroke-width="1.5" />
        <rect x="${x}" y="${y}" width="${boxWidth}" height="28" rx="6" ry="6" fill="rgba(2, 132, 199, 0.08)" />
        <text x="${x + boxWidth / 2}" y="${y + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="#0284c7">&lt;&lt;element&gt;&gt;</text>
        <text x="${x + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(el.name)}</text>
        <line x1="${x}" y1="${y + 56}" x2="${x + boxWidth}" y2="${y + 56}" stroke="var(--card-border, #e2e8f0)" stroke-width="1" />
        <text x="${x + 12}" y="${y + 74}" font-size="11" fill="var(--text-muted, #64748b)">Type: <tspan fill="var(--text, #0f172a)">${escapeXml(el.type || 'N/A')}</tspan></text>
        <text x="${x + 12}" y="${y + 92}" font-size="11" fill="var(--text-muted, #64748b)">DocRef: <tspan fill="var(--text, #0f172a)">${escapeXml(el.docRef || 'N/A')}</tspan></text>
      </g>
    `);
  });

  // Place Requirements in Column 1
  const col1X = elemList.length > 0 ? leftMargin + boxWidth + gapX : leftMargin;
  reqList.forEach((req, idx) => {
    const x = col1X;
    const y = topMargin + idx * (boxHeight + gapY);
    posMap.set(req.name, { x, y, width: boxWidth, height: boxHeight });

    renderedBoxes.push(`
      <g class="mermaid-req-box" id="req-${escapeXml(req.name)}">
        <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" ry="6" fill="var(--card-bg, #ffffff)" stroke="#8b5cf6" stroke-width="1.5" />
        <rect x="${x}" y="${y}" width="${boxWidth}" height="28" rx="6" ry="6" fill="rgba(139, 92, 246, 0.08)" />
        <text x="${x + boxWidth / 2}" y="${y + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="#8b5cf6">&lt;&lt;${escapeXml(req.type)}&gt;&gt;</text>
        <text x="${x + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(req.name)}</text>
        <line x1="${x}" y1="${y + 56}" x2="${x + boxWidth}" y2="${y + 56}" stroke="var(--card-border, #e2e8f0)" stroke-width="1" />
        <text x="${x + 12}" y="${y + 74}" font-size="11" fill="var(--text-muted, #64748b)">Id: <tspan fill="var(--text, #0f172a)">${escapeXml(req.id || 'N/A')}</tspan> | Risk: <tspan fill="var(--text, #0f172a)">${escapeXml(req.risk || 'N/A')}</tspan></text>
        <text x="${x + 12}" y="${y + 92}" font-size="10.5" fill="var(--text-muted, #64748b)">${escapeXml(req.text ? req.text.slice(0, 32) + (req.text.length > 32 ? '...' : '') : '')}</text>
      </g>
    `);
  });

  // Render relationships
  const renderedRels: string[] = [];
  relationships.forEach((rel) => {
    const src = posMap.get(rel.source);
    const tgt = posMap.get(rel.target);
    if (!src || !tgt) return;

    const x1 = src.x + src.width;
    const y1 = src.y + src.height / 2;
    const x2 = tgt.x;
    const y2 = tgt.y + tgt.height / 2;
    const midX = (x1 + x2) / 2;

    renderedRels.push(`
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text-muted, #64748b)" stroke-dasharray="3 3" stroke-width="1.5" marker-end="url(#mermaid-arrow)" />
      <rect x="${midX - 35}" y="${(y1 + y2) / 2 - 10}" width="70" height="18" rx="4" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #cbd5e1)" stroke-width="1" />
      <text x="${midX}" y="${(y1 + y2) / 2 + 3}" text-anchor="middle" font-size="9.5" font-weight="600" fill="var(--text-muted, #64748b)">&lt;&lt;${escapeXml(rel.type)}&gt;&gt;</text>
    `);
  });

  const numRows = Math.max(reqList.length, elemList.length, 1);
  const totalWidth = col1X + boxWidth + leftMargin;
  const totalHeight = topMargin + numRows * (boxHeight + gapY);

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: `${renderedRels.join('\n')}\n${renderedBoxes.join('\n')}`,
  };
}
