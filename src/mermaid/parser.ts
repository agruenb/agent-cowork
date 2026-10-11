/**
 * Main diagram type detection and layout dispatcher for Mermaid renderer.
 */

import { DiagramType, MermaidRenderResult, MermaidRenderOptions } from './types';
import { parseFlowchart, layoutFlowchart } from './diagrams/flowchart';
import { parseSequence, layoutSequence } from './diagrams/sequence';
import { parsePie, layoutPie } from './diagrams/pieChart';
import { parseClassDiagram, layoutClassDiagram } from './diagrams/classDiagram';
import { parseStateDiagram, layoutStateDiagram } from './diagrams/stateDiagram';
import { parseErDiagram, layoutErDiagram } from './diagrams/erDiagram';
import { parseMindmap, layoutMindmap } from './diagrams/mindmap';
import { getStandardSvgDefs } from './svgUtils';
import { getMermaidSvgStyles } from './theme';

export function detectDiagramType(code: string): DiagramType {
  const lines = code.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    if (/^(graph|flowchart)\s+/i.test(line)) return 'flowchart';
    if (/^sequencediagram/i.test(line)) return 'sequence';
    if (/^classdiagram/i.test(line)) return 'class';
    if (/^statediagram/i.test(line)) return 'state';
    if (/^erdiagram/i.test(line)) return 'er';
    if (/^pie(\s+|$)/i.test(line)) return 'pie';
    if (/^mindmap(\s+|$)/i.test(line)) return 'mindmap';

    // If first meaningful line has connectors like --> or ---, treat as flowchart
    if (/-->|---|-.->|==>/.test(line)) return 'flowchart';
    break;
  }

  // Fallback check in case first line was title or frontmatter
  if (/\b(?:-->|---|-.->|==>)\b/.test(code)) return 'flowchart';
  if (/^participant\s+/m.test(code)) return 'sequence';

  return 'unknown';
}

export function renderDiagram(
  code: string,
  _options?: MermaidRenderOptions
): MermaidRenderResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return {
      svg: '',
      diagramType: 'unknown',
    };
  }

  const diagramType = detectDiagramType(trimmed);
  if (diagramType === 'unknown') {
    return {
      svg: '',
      error: 'Unknown or invalid Mermaid diagram syntax',
      diagramType: 'unknown',
    };
  }

  try {
    let layout: { width: number; height: number; svgInner: string };

    switch (diagramType) {
      case 'sequence':
        layout = layoutSequence(parseSequence(trimmed));
        break;

      case 'pie':
        layout = layoutPie(parsePie(trimmed));
        break;

      case 'class':
        layout = layoutClassDiagram(parseClassDiagram(trimmed));
        break;

      case 'state':
        layout = layoutStateDiagram(parseStateDiagram(trimmed));
        break;

      case 'er':
        layout = layoutErDiagram(parseErDiagram(trimmed));
        break;

      case 'mindmap':
        layout = layoutMindmap(parseMindmap(trimmed));
        break;

      case 'flowchart':
      default:
        layout = layoutFlowchart(parseFlowchart(trimmed));
        break;
    }

    const { width, height, svgInner } = layout;
    const defs = getStandardSvgDefs();
    const styles = getMermaidSvgStyles();

    const svg = `<svg class="mermaid-svg mermaid-${diagramType}" viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="max-width: ${Math.max(200, width)}px;" xmlns="http://www.w3.org/2000/svg">
  <style>${styles}</style>
  ${defs}
  ${svgInner}
</svg>`;

    return {
      svg,
      diagramType,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Mermaid parsing error';
    return {
      svg: '',
      error,
      diagramType,
    };
  }
}
