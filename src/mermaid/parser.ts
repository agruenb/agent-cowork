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
import { parseQuadrant, layoutQuadrant } from './diagrams/quadrantChart';
import { parseXyChart, layoutXyChart } from './diagrams/xyChart';
import { parseGantt, layoutGantt } from './diagrams/gantt';
import { parseTimeline, layoutTimeline } from './diagrams/timeline';
import { parseKanban, layoutKanban } from './diagrams/kanban';
import { parseJourney, layoutJourney } from './diagrams/journey';
import { parseGitGraph, layoutGitGraph } from './diagrams/gitGraph';
import { parseSankey, layoutSankey } from './diagrams/sankey';
import { parseBlockDiagram, layoutBlockDiagram } from './diagrams/blockDiagram';
import { parsePacketDiagram, layoutPacketDiagram } from './diagrams/packetDiagram';
import { parseRequirementDiagram, layoutRequirementDiagram } from './diagrams/requirementDiagram';
import { getStandardSvgDefs } from './svgUtils';
import { getMermaidSvgStyles } from './theme';

export function detectDiagramType(code: string): DiagramType {
  const lines = code.split('\n');
  let inFrontmatter = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    // Handle YAML frontmatter (--- ... ---)
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (/^(graph|flowchart)\s+/i.test(line)) return 'flowchart';
    if (/^sequencediagram/i.test(line)) return 'sequence';
    if (/^classdiagram/i.test(line)) return 'class';
    if (/^statediagram/i.test(line)) return 'state';
    if (/^erdiagram/i.test(line)) return 'er';
    if (/^pie(\s+|$)/i.test(line)) return 'pie';
    if (/^mindmap(\s+|$)/i.test(line)) return 'mindmap';
    if (/^quadrantchart(\s+|$)/i.test(line)) return 'quadrant';
    if (/^(?:xychart-beta|xychart)(\s+|$)/i.test(line)) return 'xychart';
    if (/^gantt(\s+|$)/i.test(line)) return 'gantt';
    if (/^timeline(\s+|$)/i.test(line)) return 'timeline';
    if (/^kanban(\s+|$)/i.test(line)) return 'kanban';
    if (/^journey(\s+|$)/i.test(line)) return 'journey';
    if (/^gitgraph(\s+|$)/i.test(line)) return 'gitGraph';
    if (/^(?:sankey-beta|sankey)(\s+|$)/i.test(line)) return 'sankey';
    if (/^(?:block-beta|block)(\s+|$)/i.test(line)) return 'block';
    if (/^(?:packet-beta|packet)(\s+|$)/i.test(line)) return 'packet';
    if (/^requirementdiagram(\s+|$)/i.test(line)) return 'requirement';

    // If first meaningful line has connectors like --> or ---, treat as flowchart
    if (/-->|---|-.->|==>/.test(line)) return 'flowchart';

    // If line is just title, keep scanning
    if (/^title\s+/i.test(line)) continue;

    break;
  }

  // Fallback check in case first line was title or frontmatter
  if (/\b(?:-->|---|-.->|==>)\b/.test(code)) return 'flowchart';
  if (/^participant\s+/m.test(code)) return 'sequence';
  if (/^quadrantchart\b/im.test(code)) return 'quadrant';
  if (/^(?:xychart-beta|xychart)\b/im.test(code)) return 'xychart';
  if (/^gantt\b/im.test(code)) return 'gantt';
  if (/^timeline\b/im.test(code)) return 'timeline';
  if (/^kanban\b/im.test(code)) return 'kanban';
  if (/^journey\b/im.test(code)) return 'journey';
  if (/^gitgraph\b/im.test(code)) return 'gitGraph';
  if (/^(?:sankey-beta|sankey)\b/im.test(code)) return 'sankey';
  if (/^(?:block-beta|block)\b/im.test(code)) return 'block';
  if (/^(?:packet-beta|packet)\b/im.test(code)) return 'packet';
  if (/^requirementdiagram\b/im.test(code)) return 'requirement';

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

      case 'quadrant':
        layout = layoutQuadrant(parseQuadrant(trimmed));
        break;

      case 'xychart':
        layout = layoutXyChart(parseXyChart(trimmed));
        break;

      case 'gantt':
        layout = layoutGantt(parseGantt(trimmed));
        break;

      case 'timeline':
        layout = layoutTimeline(parseTimeline(trimmed));
        break;

      case 'kanban':
        layout = layoutKanban(parseKanban(trimmed));
        break;

      case 'journey':
        layout = layoutJourney(parseJourney(trimmed));
        break;

      case 'gitGraph':
        layout = layoutGitGraph(parseGitGraph(trimmed));
        break;

      case 'sankey':
        layout = layoutSankey(parseSankey(trimmed));
        break;

      case 'block':
        layout = layoutBlockDiagram(parseBlockDiagram(trimmed));
        break;

      case 'packet':
        layout = layoutPacketDiagram(parsePacketDiagram(trimmed));
        break;

      case 'requirement':
        layout = layoutRequirementDiagram(parseRequirementDiagram(trimmed));
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
