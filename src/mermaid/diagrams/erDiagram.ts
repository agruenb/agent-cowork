/**
 * Entity-Relationship (ER) diagram parser, card layout engine, and SVG renderer.
 */

import { ErData, ErEntity, ErRelation } from '../types';
import {
  escapeXml,
  estimateTextWidth,
  generateCurvedPath,
} from '../svgUtils';

export function parseErDiagram(code: string): ErData {
  const lines = code.split('\n');
  const entities = new Map<string, ErEntity>();
  const relations: ErRelation[] = [];

  const ensureEntity = (name: string): ErEntity => {
    const clean = name.trim();
    let ent = entities.get(clean);
    if (!ent) {
      ent = { name: clean, attributes: [] };
      entities.set(clean, ent);
    }
    return ent;
  };

  let currentEntity: ErEntity | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase().startsWith('erdiagram')) {
      continue;
    }

    // Entity { string name string email }
    const entMatch = line.match(/^([a-zA-Z0-9_-]+)\s*\{\s*$/);
    if (entMatch) {
      currentEntity = ensureEntity(entMatch[1]);
      continue;
    }

    if (line === '}') {
      currentEntity = null;
      continue;
    }

    if (currentEntity) {
      // Attribute: type name [key]
      const attrMatch = line.match(/^([a-zA-Z0-9_-]+)\s+([a-zA-Z0-9_-]+)(?:\s+(PK|FK))?/i);
      if (attrMatch) {
        currentEntity.attributes.push({
          type: attrMatch[1],
          name: attrMatch[2],
          key: attrMatch[3] ? (attrMatch[3].toUpperCase() as 'PK' | 'FK') : undefined,
        });
      }
      continue;
    }

    // Relation: ENTITY1 ||--o{ ENTITY2 : label
    const relMatch = line.match(
      /^([a-zA-Z0-9_-]+)\s*([|o}{]{1,2}\s*(?:--|\.\.)\s*[|o}{]{1,2})\s*([a-zA-Z0-9_-]+)(?:\s*:\s*["']?(.*?)["']?)?$/
    );
    if (relMatch) {
      const e1 = relMatch[1];
      const relStr = relMatch[2];
      const e2 = relMatch[3];
      const label = relMatch[4] ? relMatch[4].trim() : '';

      ensureEntity(e1);
      ensureEntity(e2);

      const parts = relStr.split('--');
      const card1 = parts[0] ? parts[0].trim() : '||';
      const card2 = parts[1] ? parts[1].trim() : '||';

      relations.push({
        entity1: e1,
        entity2: e2,
        cardinality1: card1,
        cardinality2: card2,
        label,
      });
      continue;
    }
  }

  return { entities, relations };
}

export function layoutErDiagram(data: ErData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { entities, relations } = data;
  const entityList = Array.from(entities.values());
  if (entityList.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  const margin = 32;
  const colGap = 48;

  const entityDims = new Map<
    string,
    { width: number; height: number; x: number; y: number }
  >();

  let currentX = margin;
  const currentY = margin;
  let rowMaxH = 0;
  let totalWidth = 0;

  for (const ent of entityList) {
    let maxW = estimateTextWidth(ent.name, 14);
    for (const a of ent.attributes) {
      const lineText = `${a.type} ${a.name} ${a.key || ''}`;
      const w = estimateTextWidth(lineText, 12);
      if (w > maxW) maxW = w;
    }

    const boxW = Math.max(140, maxW + 32);
    const headerH = 34;
    const bodyH = Math.max(20, ent.attributes.length * 22 + 12);
    const boxH = headerH + bodyH;

    if (boxH > rowMaxH) rowMaxH = boxH;

    entityDims.set(ent.name, {
      width: boxW,
      height: boxH,
      x: currentX,
      y: currentY,
    });

    currentX += boxW + colGap;
    if (currentX > totalWidth) totalWidth = currentX;
  }

  const totalHeight = currentY + rowMaxH + margin;
  const svgParts: string[] = [];

  const edgeSvgParts: string[] = [];
  const labelSvgParts: string[] = [];

  // Render relationships
  for (const rel of relations) {
    const d1 = entityDims.get(rel.entity1);
    const d2 = entityDims.get(rel.entity2);
    if (!d1 || !d2) continue;

    const p1 = { x: d1.x + d1.width, y: d1.y + d1.height / 2 };
    const p2 = { x: d2.x, y: d2.y + d2.height / 2 };

    const pathData = generateCurvedPath(p1, p2, 'LR');
    edgeSvgParts.push(`
      <path d="${pathData}" class="mermaid-edge" />
    `);

    if (rel.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelW = estimateTextWidth(rel.label, 11) + 14;

      labelSvgParts.push(`
        <g class="mermaid-edge-label">
          <rect class="mermaid-edge-label-bg" x="${midX - labelW / 2}" y="${midY - 10}" width="${labelW}" height="20" rx="4" />
          <text x="${midX}" y="${midY}">${escapeXml(rel.label)}</text>
        </g>
      `);
    }
  }

  // 1. Relationships (edges)
  svgParts.push(...edgeSvgParts);

  // Render entities
  for (const ent of entityList) {
    const dim = entityDims.get(ent.name);
    if (!dim) continue;

    const { x, y, width, height } = dim;
    const headerH = 34;

    const attrLines = ent.attributes.map((a, i) => {
      const lineY = y + headerH + 16 + i * 22;
      const keyBadge = a.key ? `<tspan fill="var(--primary, #0ea5e9)" font-weight="700"> [${a.key}]</tspan>` : '';
      return `<text x="${x + 12}" y="${lineY}" font-size="12" fill="var(--text, #0f172a)"><tspan fill="var(--text-muted, #64748b)">${a.type}</tspan> ${escapeXml(a.name)}${keyBadge}</text>`;
    });

    svgParts.push(`
      <g class="mermaid-er-entity">
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
        <path d="M ${x} ${y + headerH} h ${width}" stroke="var(--card-border, #cbd5e1)" stroke-width="1" />
        <text x="${x + width / 2}" y="${y + headerH / 2 + 5}" text-anchor="middle" font-weight="700" font-size="13" fill="var(--text, #0f172a)">${escapeXml(ent.name)}</text>
        ${attrLines.join('\n')}
      </g>
    `);
  }

  // 2. Relationship labels on top
  svgParts.push(...labelSvgParts);

  return {
    width: Math.max(160, totalWidth + margin),
    height: Math.max(120, totalHeight),
    svgInner: svgParts.join('\n'),
  };
}
