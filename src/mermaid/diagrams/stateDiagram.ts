/**
 * State diagram parser, state-transition layout engine, and SVG renderer.
 */

import { StateData, StateItem, StateTransition } from '../types';
import {
  escapeXml,
  measureTextLines,
  estimateTextWidth,
  generateCurvedPath,
} from '../svgUtils';

export function parseStateDiagram(code: string): StateData {
  const lines = code.split('\n');
  const states = new Map<string, StateItem>();
  const transitions: StateTransition[] = [];

  const ensureState = (id: string, label?: string): StateItem => {
    const cleanId = id.trim();
    let state = states.get(cleanId);
    if (!state) {
      const type = cleanId === '[*]' ? 'initial' : 'state';
      state = { id: cleanId, label: label || cleanId, type };
      states.set(cleanId, state);
    }
    return state;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase().startsWith('statediagram')) {
      continue;
    }

    // [*] --> StateA : text
    const transMatch = line.match(
      /^(\[\*\]|[a-zA-Z0-9_.-]+)\s*-->\s*(\[\*\]|[a-zA-Z0-9_.-]+)(?:\s*:\s*(.*))?$/
    );
    if (transMatch) {
      const from = transMatch[1];
      const to = transMatch[2];
      const label = transMatch[3] ? transMatch[3].trim() : undefined;

      ensureState(from);
      ensureState(to);

      transitions.push({ from, to, label });
      continue;
    }

    // state "Descriptive Name" as s1  or  state s1
    const stateDefMatch = line.match(/^state\s+(?:"(.*?)"\s+as\s+)?([a-zA-Z0-9_.-]+)$/i);
    if (stateDefMatch) {
      const label = stateDefMatch[1];
      const id = stateDefMatch[2];
      ensureState(id, label || id);
      continue;
    }
  }

  return { states, transitions };
}

export function layoutStateDiagram(data: StateData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { states, transitions } = data;
  const stateList = Array.from(states.values());
  if (stateList.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  const margin = 32;
  const rowGap = 48;

  // Simple rank-based positioning: initial [*] at top, transitions downwards
  let currentY = margin;
  const statePositions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  let maxWidth = 160;

  for (const st of stateList) {
    if (st.id === '[*]') {
      statePositions.set(st.id, {
        x: maxWidth / 2 - 10,
        y: currentY,
        width: 20,
        height: 20,
      });
      currentY += 20 + rowGap;
    } else {
      const { width, height } = measureTextLines(st.label, 13);
      const w = Math.max(100, width);
      const h = Math.max(38, height);
      if (w > maxWidth) maxWidth = w;

      statePositions.set(st.id, {
        x: maxWidth / 2 - w / 2,
        y: currentY,
        width: w,
        height: h,
      });
      currentY += h + rowGap;
    }
  }

  const totalWidth = maxWidth + margin * 2;
  const totalHeight = currentY - rowGap + margin;
  const svgParts: string[] = [];

  const edgeSvgParts: string[] = [];
  const labelSvgParts: string[] = [];
  const nodeSvgParts: string[] = [];

  // Render transitions
  for (const trans of transitions) {
    const fromPos = statePositions.get(trans.from);
    const toPos = statePositions.get(trans.to);
    if (!fromPos || !toPos) continue;

    const p1 = { x: fromPos.x + fromPos.width / 2, y: fromPos.y + fromPos.height };
    const p2 = { x: toPos.x + toPos.width / 2, y: toPos.y };

    const pathData = generateCurvedPath(p1, p2, 'TD');
    edgeSvgParts.push(`
      <path d="${pathData}" class="mermaid-edge" marker-end="url(#mermaid-arrow)" />
    `);

    if (trans.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelW = estimateTextWidth(trans.label, 11) + 14;

      labelSvgParts.push(`
        <g class="mermaid-edge-label">
          <rect class="mermaid-edge-label-bg" x="${midX - labelW / 2}" y="${midY - 10}" width="${labelW}" height="20" rx="4" />
          <text x="${midX}" y="${midY}">${escapeXml(trans.label)}</text>
        </g>
      `);
    }
  }

  // Render states
  for (const st of stateList) {
    const pos = statePositions.get(st.id);
    if (!pos) continue;

    if (st.id === '[*]') {
      // Circle for initial or terminal state
      nodeSvgParts.push(`
        <circle cx="${pos.x + 10}" cy="${pos.y + 10}" r="10" fill="var(--text, #0f172a)" />
      `);
    } else {
      nodeSvgParts.push(`
        <g class="mermaid-node">
          <rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="10" />
          <text x="${pos.x + pos.width / 2}" y="${pos.y + pos.height / 2}">${escapeXml(st.label)}</text>
        </g>
      `);
    }
  }

  // Layer order: edges -> states -> labels (labels always on top)
  svgParts.push(...edgeSvgParts);
  svgParts.push(...nodeSvgParts);
  svgParts.push(...labelSvgParts);

  return {
    width: Math.max(140, totalWidth),
    height: Math.max(100, totalHeight),
    svgInner: svgParts.join('\n'),
  };
}
