/**
 * Class diagram parser, UML box layout engine, and SVG renderer.
 */

import { ClassData, ClassEntity, ClassRelation, ClassRelationType } from '../types';
import {
  escapeXml,
  estimateTextWidth,
  generateCurvedPath,
} from '../svgUtils';

export function parseClassDiagram(code: string): ClassData {
  const lines = code.split('\n');
  const classes = new Map<string, ClassEntity>();
  const relations: ClassRelation[] = [];

  const ensureClass = (name: string): ClassEntity => {
    const cleanName = name.trim();
    let entity = classes.get(cleanName);
    if (!entity) {
      entity = { name: cleanName, members: [] };
      classes.set(cleanName, entity);
    }
    return entity;
  };

  let currentClass: ClassEntity | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase().startsWith('classdiagram')) {
      continue;
    }

    // class ClassName { ... }
    const classBlockStart = line.match(/^class\s+([a-zA-Z0-9_.-]+)(?:\s*\{\s*)?$/i);
    if (classBlockStart) {
      currentClass = ensureClass(classBlockStart[1]);
      if (!line.includes('{')) currentClass = null;
      continue;
    }

    if (line === '}') {
      currentClass = null;
      continue;
    }

    // Relations: ClassA <|-- ClassB : label
    const relMatch = line.match(
      /^([a-zA-Z0-9_.-]+)\s*(<\|--|<\|\.\.|\*--|o--|-->|--|\.\.>)\s*([a-zA-Z0-9_.-]+)(?:\s*:\s*(.*))?$/
    );
    if (relMatch) {
      const c1 = relMatch[1];
      const op = relMatch[2];
      const c2 = relMatch[3];
      const label = relMatch[4] ? relMatch[4].trim() : undefined;

      ensureClass(c1);
      ensureClass(c2);

      let type: ClassRelationType = 'association';
      if (op === '<|--') type = 'inheritance';
      else if (op === '<|..') type = 'realization';
      else if (op === '*--') type = 'composition';
      else if (op === 'o--') type = 'aggregation';
      else if (op === '-->') type = 'association';
      else if (op === '--') type = 'link';
      else if (op === '..>') type = 'dependency';

      relations.push({ class1: c1, class2: c2, type, label });
      continue;
    }

    // Class member inside block or standalone: ClassName : +type member
    if (currentClass) {
      const memberMatch = line.match(/^([+\-#~])?\s*(.*)$/);
      if (memberMatch) {
        const visibility = (memberMatch[1] || '+') as '+' | '-' | '#' | '~';
        const memberText = memberMatch[2].trim();
        const isMethod = memberText.includes('(');
        currentClass.members.push({
          visibility,
          name: memberText,
          isMethod,
        });
      }
    } else {
      const memberLineMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*([+\-#~])?\s*(.*)$/);
      if (memberLineMatch) {
        const cls = ensureClass(memberLineMatch[1]);
        const visibility = (memberLineMatch[2] || '+') as '+' | '-' | '#' | '~';
        const memberText = memberLineMatch[3].trim();
        const isMethod = memberText.includes('(');
        cls.members.push({
          visibility,
          name: memberText,
          isMethod,
        });
      }
    }
  }

  return { classes, relations };
}

export function layoutClassDiagram(data: ClassData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { classes, relations } = data;
  const classList = Array.from(classes.values());
  if (classList.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  // Calculate box dimensions for each class
  const classDimensions = new Map<
    string,
    { width: number; height: number; x: number; y: number }
  >();
  const margin = 32;
  const colGap = 48;
  const rowGap = 50;

  // Layout in a grid (max 3 columns)
  const cols = Math.min(3, Math.max(1, classList.length));
  let currentX = margin;
  let currentY = margin;
  let rowMaxHeight = 0;
  let totalWidth = 0;
  let colIndex = 0;

  for (const cls of classList) {
    let maxW = estimateTextWidth(cls.name, 14);
    for (const m of cls.members) {
      const w = estimateTextWidth(`${m.visibility} ${m.name}`, 12);
      if (w > maxW) maxW = w;
    }

    const boxW = Math.max(130, maxW + 28);
    const headerH = 34;
    const membersH = Math.max(20, cls.members.length * 20 + 12);
    const boxH = headerH + membersH;

    if (boxH > rowMaxHeight) rowMaxHeight = boxH;

    classDimensions.set(cls.name, {
      width: boxW,
      height: boxH,
      x: currentX,
      y: currentY,
    });

    currentX += boxW + colGap;
    if (currentX > totalWidth) totalWidth = currentX;

    colIndex++;
    if (colIndex >= cols) {
      colIndex = 0;
      currentX = margin;
      currentY += rowMaxHeight + rowGap;
      rowMaxHeight = 0;
    }
  }

  const totalHeight = currentY + rowMaxHeight + margin;
  const svgParts: string[] = [];

  // Render Relations
  for (const rel of relations) {
    const d1 = classDimensions.get(rel.class1);
    const d2 = classDimensions.get(rel.class2);
    if (!d1 || !d2) continue;

    const p1 = { x: d1.x + d1.width / 2, y: d1.y + d1.height };
    const p2 = { x: d2.x + d2.width / 2, y: d2.y };

    const pathData = generateCurvedPath(p1, p2, 'TD');
    let marker = 'marker-end="url(#mermaid-arrow)"';
    let isDashed = false;

    if (rel.type === 'inheritance') marker = 'marker-start="url(#mermaid-triangle)"';
    else if (rel.type === 'realization') {
      marker = 'marker-start="url(#mermaid-triangle)"';
      isDashed = true;
    } else if (rel.type === 'composition') marker = 'marker-start="url(#mermaid-diamond-filled)"';
    else if (rel.type === 'aggregation') marker = 'marker-start="url(#mermaid-diamond)"';
    else if (rel.type === 'dependency') isDashed = true;

    svgParts.push(`
      <path d="${pathData}" class="mermaid-edge ${isDashed ? 'is-dashed' : ''}" ${marker} />
    `);
  }

  // Render Class Boxes
  for (const cls of classList) {
    const dim = classDimensions.get(cls.name);
    if (!dim) continue;

    const { x, y, width, height } = dim;
    const headerH = 34;

    const memberLines = cls.members.map((m, i) => {
      const lineY = y + headerH + 16 + i * 20;
      return `<text x="${x + 12}" y="${lineY}" font-size="12" fill="var(--text, #0f172a)"><tspan font-weight="600" fill="var(--text-muted, #64748b)">${m.visibility}</tspan> ${escapeXml(m.name)}</text>`;
    });

    svgParts.push(`
      <g class="mermaid-class-box">
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #cbd5e1)" stroke-width="1.5" />
        <path d="M ${x} ${y + headerH} h ${width}" stroke="var(--card-border, #cbd5e1)" stroke-width="1" />
        <text x="${x + width / 2}" y="${y + headerH / 2 + 5}" text-anchor="middle" font-weight="700" font-size="13" fill="var(--text, #0f172a)">${escapeXml(cls.name)}</text>
        ${memberLines.join('\n')}
      </g>
    `);
  }

  return {
    width: Math.max(160, totalWidth + margin),
    height: Math.max(120, totalHeight),
    svgInner: svgParts.join('\n'),
  };
}
