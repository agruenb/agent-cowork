/**
 * Shared types for the custom Mermaid diagram renderer.
 */

export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'pie'
  | 'mindmap'
  | 'unknown';

export type NodeShape =
  | 'rect'
  | 'rounded'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'flag'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogram-inv'
  | 'trapezoid'
  | 'trapezoid-inv';

export type EdgeLinkType = 'solid' | 'dashed' | 'thick';
export type EdgeArrowType = 'arrow' | 'none' | 'circle' | 'cross';

export interface FlowchartNode {
  id: string;
  label: string;
  shape: NodeShape;
  subgraphId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rank?: number;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
  linkType: EdgeLinkType;
  arrowType: EdgeArrowType;
  points?: { x: number; y: number }[];
}

export interface FlowchartSubgraph {
  id: string;
  title: string;
  nodeIds: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FlowchartGraph {
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  nodes: Map<string, FlowchartNode>;
  edges: FlowchartEdge[];
  subgraphs: FlowchartSubgraph[];
}

// Sequence diagram types
export interface SequenceActor {
  id: string;
  name: string;
  type: 'participant' | 'actor';
}

export type SequenceArrowType =
  | 'solid_arrow'
  | 'dotted_arrow'
  | 'solid_line'
  | 'dotted_line'
  | 'solid_cross'
  | 'dotted_cross'
  | 'solid_open'
  | 'dotted_open';

export interface SequenceMessage {
  from: string;
  to: string;
  text: string;
  arrowType: SequenceArrowType;
  isSelf: boolean;
  stepIndex: number;
}

export interface SequenceNote {
  actors: string[];
  placement: 'left' | 'right' | 'over';
  text: string;
  stepIndex: number;
}

export interface SequenceBlock {
  type: 'loop' | 'alt' | 'else' | 'opt' | 'par' | 'critical';
  label: string;
  startIndex: number;
  endIndex?: number;
}

export interface SequenceData {
  autonumber: boolean;
  actors: SequenceActor[];
  steps: Array<
    | { kind: 'message'; data: SequenceMessage }
    | { kind: 'note'; data: SequenceNote }
    | { kind: 'block_start'; data: SequenceBlock }
    | { kind: 'block_divider'; data: SequenceBlock }
    | { kind: 'block_end' }
    | { kind: 'activate'; actor: string }
    | { kind: 'deactivate'; actor: string }
  >;
}

// Class diagram types
export interface ClassMember {
  visibility: '+' | '-' | '#' | '~';
  name: string;
  type?: string;
  isMethod: boolean;
}

export interface ClassEntity {
  name: string;
  annotation?: string;
  members: ClassMember[];
}

export type ClassRelationType =
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'link';

export interface ClassRelation {
  class1: string;
  class2: string;
  type: ClassRelationType;
  label?: string;
}

export interface ClassData {
  classes: Map<string, ClassEntity>;
  relations: ClassRelation[];
}

// State diagram types
export interface StateItem {
  id: string;
  label: string;
  type: 'initial' | 'terminal' | 'state' | 'composite';
  substates?: StateItem[];
}

export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

export interface StateData {
  states: Map<string, StateItem>;
  transitions: StateTransition[];
}

// ER diagram types
export interface ErAttribute {
  type: string;
  name: string;
  key?: 'PK' | 'FK' | string;
}

export interface ErEntity {
  name: string;
  attributes: ErAttribute[];
}

export interface ErRelation {
  entity1: string;
  entity2: string;
  cardinality1: string;
  cardinality2: string;
  label: string;
}

export interface ErData {
  entities: Map<string, ErEntity>;
  relations: ErRelation[];
}

// Pie chart types
export interface PieSlice {
  label: string;
  value: number;
  percentage?: number;
  color?: string;
}

export interface PieData {
  title?: string;
  slices: PieSlice[];
}

// Mindmap types
export interface MindmapNode {
  id: string;
  text: string;
  level: number;
  shape?: 'rect' | 'circle' | 'pill' | 'cloud' | 'bang';
  children: MindmapNode[];
  color?: string;
}

export interface MindmapData {
  root: MindmapNode | null;
}

export interface MermaidRenderResult {
  svg: string;
  error?: string;
  diagramType: DiagramType;
}

export interface MermaidRenderOptions {
  darkMode?: boolean;
  fontFamily?: string;
}
