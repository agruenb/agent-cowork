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
  | 'quadrant'
  | 'xychart'
  | 'gantt'
  | 'timeline'
  | 'kanban'
  | 'journey'
  | 'gitGraph'
  | 'sankey'
  | 'block'
  | 'packet'
  | 'requirement'
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

// Quadrant Chart types
export interface QuadrantPoint {
  label: string;
  x: number;
  y: number;
}

export interface QuadrantData {
  title?: string;
  xAxisLabelLeft?: string;
  xAxisLabelRight?: string;
  yAxisLabelBottom?: string;
  yAxisLabelTop?: string;
  quadrant1?: string;
  quadrant2?: string;
  quadrant3?: string;
  quadrant4?: string;
  points: QuadrantPoint[];
}

// XY Chart types
export type XySeriesType = 'bar' | 'line';

export interface XySeries {
  type: XySeriesType;
  title?: string;
  values: number[];
}

export interface XyChartData {
  title?: string;
  xAxisTitle?: string;
  xAxisCategories?: string[];
  xAxisRange?: [number, number];
  yAxisTitle?: string;
  yAxisRange?: [number, number];
  series: XySeries[];
}

// Gantt Chart types
export interface GanttTask {
  id: string;
  label: string;
  section?: string;
  status?: 'done' | 'active' | 'crit' | 'milestone';
  startDate?: string;
  endDate?: string;
  duration?: string;
  afterId?: string;
}

export interface GanttSection {
  title: string;
  tasks: GanttTask[];
}

export interface GanttData {
  title?: string;
  dateFormat?: string;
  sections: GanttSection[];
  allTasks: GanttTask[];
}

// Timeline types
export interface TimelineEvent {
  period: string;
  events: string[];
}

export interface TimelineSection {
  title: string;
  events: TimelineEvent[];
}

export interface TimelineData {
  title?: string;
  sections: TimelineSection[];
}

// Kanban types
export interface KanbanItem {
  id: string;
  label: string;
  shape?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  items: KanbanItem[];
}

export interface KanbanData {
  columns: KanbanColumn[];
}

// User Journey types
export interface JourneyTask {
  name: string;
  score: number;
  actors: string[];
}

export interface JourneySection {
  title: string;
  tasks: JourneyTask[];
}

export interface JourneyData {
  title?: string;
  sections: JourneySection[];
}

// Git Graph types
export interface GitCommit {
  id: string;
  branch: string;
  parents: string[];
  tag?: string;
  type?: 'NORMAL' | 'HIGHLIGHT' | 'REVERSE';
}

export interface GitGraphData {
  branches: string[];
  commits: GitCommit[];
}

// Sankey Diagram types
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  links: SankeyLink[];
}

// Block Diagram types
export interface BlockItem {
  id: string;
  label: string;
  span?: number;
  isSpace?: boolean;
}

export interface BlockData {
  columns: number;
  blocks: BlockItem[];
}

// Packet Diagram types
export interface PacketField {
  startBit: number;
  endBit: number;
  label: string;
}

export interface PacketData {
  fields: PacketField[];
}

// Requirement Diagram types
export interface ReqItem {
  name: string;
  id?: string;
  text?: string;
  risk?: string;
  verifyMethod?: string;
  type: string;
}

export interface ReqElement {
  name: string;
  type?: string;
  docRef?: string;
}

export interface ReqRelationship {
  source: string;
  target: string;
  type: string;
}

export interface RequirementData {
  requirements: Map<string, ReqItem>;
  elements: Map<string, ReqElement>;
  relationships: ReqRelationship[];
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
