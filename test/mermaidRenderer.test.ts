import assert from 'assert';
import {
  renderMermaidToSvg,
  detectDiagramType,
  renderMermaidPreviewHtml,
} from '../src/mermaid';

describe('Custom Mermaid Renderer', () => {
  describe('Diagram Type Detection', () => {
    it('detects flowchart and graph diagrams', () => {
      assert.strictEqual(detectDiagramType('graph TD\n  A --> B'), 'flowchart');
      assert.strictEqual(detectDiagramType('flowchart LR\n  A --> B'), 'flowchart');
      assert.strictEqual(detectDiagramType('graph BT\n  X --- Y'), 'flowchart');
    });

    it('detects sequence diagrams', () => {
      assert.strictEqual(detectDiagramType('sequenceDiagram\n  Alice->>Bob: Hello'), 'sequence');
      assert.strictEqual(detectDiagramType('sequenceDiagram\n  autonumber\n  A->>B: Ping'), 'sequence');
    });

    it('detects pie charts', () => {
      assert.strictEqual(detectDiagramType('pie title Pets\n  "Dogs" : 386\n  "Cats" : 85'), 'pie');
      assert.strictEqual(detectDiagramType('pie\n  "A" : 10\n  "B" : 20'), 'pie');
    });

    it('detects class diagrams', () => {
      assert.strictEqual(detectDiagramType('classDiagram\n  Animal <|-- Duck'), 'class');
    });

    it('detects state diagrams', () => {
      assert.strictEqual(detectDiagramType('stateDiagram-v2\n  [*] --> Still\n  Still --> [*]'), 'state');
    });

    it('detects ER diagrams', () => {
      assert.strictEqual(detectDiagramType('erDiagram\n  CUSTOMER ||--o{ ORDER : places'), 'er');
    });

    it('detects mindmaps', () => {
      assert.strictEqual(detectDiagramType('mindmap\n  root((Root))\n    Branch 1'), 'mindmap');
    });

    it('detects quadrant charts', () => {
      assert.strictEqual(detectDiagramType('quadrantChart\n  title Reach\n  Campaign A: [0.3, 0.6]'), 'quadrant');
    });

    it('detects XY charts', () => {
      assert.strictEqual(detectDiagramType('xychart-beta\n  title Sales\n  bar [1, 2, 3]'), 'xychart');
      assert.strictEqual(detectDiagramType('xychart\n  bar [1, 2]'), 'xychart');
    });

    it('detects Gantt charts', () => {
      assert.strictEqual(detectDiagramType('gantt\n  title Project Schedule\n  section Dev\n  Task 1 : 5d'), 'gantt');
    });

    it('detects timeline diagrams', () => {
      assert.strictEqual(detectDiagramType('timeline\n  title History\n  2020 : Event'), 'timeline');
    });

    it('detects kanban boards', () => {
      assert.strictEqual(detectDiagramType('kanban\n  Todo\n    [Task 1]'), 'kanban');
    });

    it('detects user journeys', () => {
      assert.strictEqual(detectDiagramType('journey\n  title My Day\n  Make tea: 5: Me'), 'journey');
    });

    it('detects git graphs', () => {
      assert.strictEqual(detectDiagramType('gitGraph\n  commit\n  branch feat'), 'gitGraph');
    });

    it('detects sankey diagrams', () => {
      assert.strictEqual(detectDiagramType('sankey-beta\n  A,B,10'), 'sankey');
    });

    it('detects block diagrams', () => {
      assert.strictEqual(detectDiagramType('block-beta\n  columns 2\n  a["Block A"]'), 'block');
    });

    it('detects packet diagrams', () => {
      assert.strictEqual(detectDiagramType('packet-beta\n  0-15: "Port"'), 'packet');
    });

    it('detects requirement diagrams', () => {
      assert.strictEqual(detectDiagramType('requirementDiagram\n  requirement req1 {\n  id: 1\n  }'), 'requirement');
    });

    it('falls back to flowchart when edge arrows are present', () => {
      assert.strictEqual(detectDiagramType('A --> B --> C'), 'flowchart');
    });
  });

  describe('Flowchart SVG Generation', () => {
    it('renders a simple TD flowchart with nodes, edges, and markers', () => {
      const code = `graph TD
        A[Start] --> B{Is Valid?}
        B -->|Yes| C([Proceed])
        B -->|No| D[(Database)]`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'flowchart');
      assert.ok(!result.error, 'Should have no errors');
      assert.ok(result.svg.includes('<svg class="mermaid-svg mermaid-flowchart"'));
      assert.ok(result.svg.includes('id="node-A"'));
      assert.ok(result.svg.includes('id="node-B"'));
      assert.ok(result.svg.includes('id="node-C"'));
      assert.ok(result.svg.includes('id="node-D"'));
      assert.ok(result.svg.includes('Start'));
      assert.ok(result.svg.includes('Is Valid?'));
      assert.ok(result.svg.includes('Proceed'));
      assert.ok(result.svg.includes('Database'));
      assert.ok(result.svg.includes('marker-end="url(#mermaid-arrow)"'));
    });

    it('renders Left-to-Right (LR) flowchart', () => {
      const code = `flowchart LR
        Input --> Process --> Output`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'flowchart');
      assert.ok(result.svg.includes('Input'));
      assert.ok(result.svg.includes('Process'));
      assert.ok(result.svg.includes('Output'));
    });

    it('renders subgraphs with header and border', () => {
      const code = `graph TB
        subgraph Backend [Server Cluster]
          API --> DB[(SQL)]
        end
        Client --> API`;

      const result = renderMermaidToSvg(code);
      assert.ok(result.svg.includes('class="mermaid-subgraph"'));
      assert.ok(result.svg.includes('Server Cluster'));
    });

    it('supports varied node shapes (circle, hexagon, subroutine, trapezoid)', () => {
      const code = `graph TD
        N1((Circle Node))
        N2{{Hexagon Node}}
        N3[[Subroutine Node]]
        N4[/Trapezoid Node\\]`;

      const result = renderMermaidToSvg(code);
      assert.ok(result.svg.includes('<circle'));
      assert.ok(result.svg.includes('<polygon'));
      assert.ok(result.svg.includes('Circle Node'));
      assert.ok(result.svg.includes('Hexagon Node'));
    });
  });

  describe('Sequence Diagram SVG Generation', () => {
    it('renders actors, lifelines, messages, notes, and activations', () => {
      const code = `sequenceDiagram
        autonumber
        actor Alice as User
        participant Bob as Server
        Alice->>+Bob: Authentication Request
        Note right of Bob: Validate Credentials
        Bob-->>-Alice: Authentication Response`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'sequence');
      assert.ok(result.svg.includes('class="mermaid-actor"'));
      assert.ok(result.svg.includes('User'));
      assert.ok(result.svg.includes('Server'));
      assert.ok(result.svg.includes('class="mermaid-lifeline"'));
      assert.ok(result.svg.includes('class="mermaid-message'));
      assert.ok(result.svg.includes('class="mermaid-note"'));
      assert.ok(result.svg.includes('Authentication Request'));
      assert.ok(result.svg.includes('Validate Credentials'));
      assert.ok(result.svg.includes('Authentication Response'));
    });

    it('supports self-loop messages in sequence diagrams', () => {
      const code = `sequenceDiagram
        participant A
        A->>A: Internal computation`;

      const result = renderMermaidToSvg(code);
      assert.ok(result.svg.includes('Internal computation'));
      assert.ok(result.svg.includes('h 36 v 24 h -36'));
    });
  });

  describe('Pie Chart SVG Generation', () => {
    it('calculates slice percentages and renders arcs with legend', () => {
      const code = `pie title Favorite Fruits
        "Apples" : 50
        "Bananas" : 30
        "Cherries" : 20`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'pie');
      assert.ok(result.svg.includes('Favorite Fruits'));
      assert.ok(result.svg.includes('Apples'));
      assert.ok(result.svg.includes('50%'));
      assert.ok(result.svg.includes('Bananas'));
      assert.ok(result.svg.includes('30%'));
      assert.ok(result.svg.includes('Cherries'));
      assert.ok(result.svg.includes('20%'));
      assert.ok(result.svg.includes('mermaid-pie-legend-item'));
    });
  });

  describe('Class Diagram SVG Generation', () => {
    it('renders class cards with methods, attributes, and inheritance', () => {
      const code = `classDiagram
        Animal <|-- Duck
        class Animal {
          +String name
          +int age
          +eat()
        }
        class Duck {
          +String beakColor
          +swim()
          +quack()
        }`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'class');
      assert.ok(result.svg.includes('Animal'));
      assert.ok(result.svg.includes('Duck'));
      assert.ok(result.svg.includes('eat()'));
      assert.ok(result.svg.includes('swim()'));
      assert.ok(result.svg.includes('marker-start="url(#mermaid-triangle)"'));
    });
  });

  describe('State Diagram SVG Generation', () => {
    it('renders states, transitions, and initial/terminal dots', () => {
      const code = `stateDiagram-v2
        [*] --> Active
        Active --> Inactive: Timeout
        Inactive --> [*]`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'state');
      assert.ok(result.svg.includes('Active'));
      assert.ok(result.svg.includes('Inactive'));
      assert.ok(result.svg.includes('Timeout'));
      assert.ok(result.svg.includes('<circle cx='));
    });
  });

  describe('ER Diagram SVG Generation', () => {
    it('renders entities with attribute badges and relationships', () => {
      const code = `erDiagram
        CUSTOMER ||--o{ ORDER : places
        CUSTOMER {
          string name PK
          string email
        }
        ORDER {
          int orderId PK
          float amount
        }`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'er');
      assert.ok(result.svg.includes('CUSTOMER'));
      assert.ok(result.svg.includes('ORDER'));
      assert.ok(result.svg.includes('places'));
      assert.ok(result.svg.includes('[PK]'));
    });
  });

  describe('Mindmap SVG Generation', () => {
    it('renders tree hierarchy with root node and branches', () => {
      const code = `mindmap
        root((Project Core))
          Frontend
            React
            Vite
          Backend
            Node
            Postgres`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'mindmap');
      assert.ok(result.svg.includes('Project Core'));
      assert.ok(result.svg.includes('Frontend'));
      assert.ok(result.svg.includes('React'));
      assert.ok(result.svg.includes('Backend'));
      assert.ok(result.svg.includes('Postgres'));
    });
  });

  describe('Quadrant Chart SVG Generation', () => {
    it('renders quadrant matrix with title, labels, and coordinate points', () => {
      const code = `quadrantChart
        title Campaign Performance
        x-axis Low Reach --> High Reach
        y-axis Low ROI --> High ROI
        quadrant-1 Expand
        quadrant-2 Optimize
        quadrant-3 Cut
        quadrant-4 Monitor
        Campaign Alpha: [0.75, 0.85]
        Campaign Beta: [0.25, 0.40]`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'quadrant');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Campaign Performance'));
      assert.ok(result.svg.includes('Low Reach'));
      assert.ok(result.svg.includes('High Reach'));
      assert.ok(result.svg.includes('Low ROI'));
      assert.ok(result.svg.includes('High ROI'));
      assert.ok(result.svg.includes('Expand'));
      assert.ok(result.svg.includes('Optimize'));
      assert.ok(result.svg.includes('Campaign Alpha'));
      assert.ok(result.svg.includes('Campaign Beta'));
    });
  });

  describe('XY Chart SVG Generation', () => {
    it('renders categorical XY chart with bars and line series', () => {
      const code = `xychart-beta
        title "Monthly Revenue"
        x-axis [Jan, Feb, Mar]
        y-axis "USD" 0 --> 1000
        bar [300, 600, 900]
        line [350, 620, 880]`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'xychart');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Monthly Revenue'));
      assert.ok(result.svg.includes('Jan'));
      assert.ok(result.svg.includes('Feb'));
      assert.ok(result.svg.includes('Mar'));
      assert.ok(result.svg.includes('USD'));
      assert.ok(result.svg.includes('<rect'));
      assert.ok(result.svg.includes('<path'));
    });
  });

  describe('Gantt Chart SVG Generation', () => {
    it('renders timeline with sections, tasks, and status styles', () => {
      const code = `gantt
        title Sprint Schedule
        section Phase 1
          Design :done, 2024-01-01, 3d
          Develop :active, 5d
          Deploy :crit, milestone, 1d`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'gantt');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Sprint Schedule'));
      assert.ok(result.svg.includes('PHASE 1'));
      assert.ok(result.svg.includes('Design'));
      assert.ok(result.svg.includes('Develop'));
      assert.ok(result.svg.includes('Deploy'));
    });
  });

  describe('Timeline SVG Generation', () => {
    it('renders chronological timeline nodes and event cards', () => {
      const code = `timeline
        title Company Milestones
        2020 : Founded
             : Seed Round
        2022 : Series A`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'timeline');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Company Milestones'));
      assert.ok(result.svg.includes('2020'));
      assert.ok(result.svg.includes('Founded'));
      assert.ok(result.svg.includes('Seed Round'));
      assert.ok(result.svg.includes('2022'));
      assert.ok(result.svg.includes('Series A'));
    });
  });

  describe('Kanban Board SVG Generation', () => {
    it('renders columns with task cards and badge counters', () => {
      const code = `kanban
        Backlog
          [Research API]
        Doing
          [Write Code]
        Done
          [Setup Repo]`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'kanban');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Backlog'));
      assert.ok(result.svg.includes('Doing'));
      assert.ok(result.svg.includes('Done'));
      assert.ok(result.svg.includes('Research API'));
      assert.ok(result.svg.includes('Write Code'));
      assert.ok(result.svg.includes('Setup Repo'));
    });
  });

  describe('User Journey SVG Generation', () => {
    it('renders customer journey steps, score indicators, and trendline', () => {
      const code = `journey
        title Onboarding
        section Sign up
          Fill form: 4: User
          Verify email: 2: User, Auth`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'journey');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Onboarding'));
      assert.ok(result.svg.includes('Sign up'));
      assert.ok(result.svg.includes('Fill form'));
      assert.ok(result.svg.includes('Verify email'));
      assert.ok(result.svg.includes('User'));
    });
  });

  describe('Git Graph SVG Generation', () => {
    it('renders branches, commits, branch badges, and merge curves', () => {
      const code = `gitGraph
        commit id: "init"
        branch develop
        checkout develop
        commit id: "feat-1"
        checkout main
        merge develop id: "merge-1" tag: "v1.0"`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'gitGraph');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('main'));
      assert.ok(result.svg.includes('develop'));
      assert.ok(result.svg.includes('init'));
      assert.ok(result.svg.includes('feat-1'));
      assert.ok(result.svg.includes('v1.0'));
    });
  });

  describe('Sankey Diagram SVG Generation', () => {
    it('renders flow stages with nodes and smooth connecting ribbons', () => {
      const code = `sankey-beta
        Energy,Grid,100
        Grid,Homes,60
        Grid,Industry,40`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'sankey');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Energy'));
      assert.ok(result.svg.includes('Grid'));
      assert.ok(result.svg.includes('Homes'));
      assert.ok(result.svg.includes('Industry'));
      assert.ok(result.svg.includes('<path'));
    });
  });

  describe('Block Diagram SVG Generation', () => {
    it('renders grid blocks with column spans', () => {
      const code = `block-beta
        columns 3
        a["Frontend"] b["API Gateway"]:2
        space c["Database"]:2`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'block');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Frontend'));
      assert.ok(result.svg.includes('API Gateway'));
      assert.ok(result.svg.includes('Database'));
    });
  });

  describe('Packet Diagram SVG Generation', () => {
    it('renders bit field rows with headers and labels', () => {
      const code = `packet-beta
        0-15: "Source Port"
        16-31: "Dest Port"
        32-63: "Seq Num"`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'packet');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('Source Port'));
      assert.ok(result.svg.includes('Dest Port'));
      assert.ok(result.svg.includes('Seq Num'));
      assert.ok(result.svg.includes('0-15'));
      assert.ok(result.svg.includes('16-31'));
    });
  });

  describe('Requirement Diagram SVG Generation', () => {
    it('renders requirement and element boxes with relationships', () => {
      const code = `requirementDiagram
        requirement auth_req {
          id: REQ-1
          text: Secure login
          risk: high
        }
        element login_service {
          type: service
        }
        login_service - satisfies -> auth_req`;

      const result = renderMermaidToSvg(code);
      assert.strictEqual(result.diagramType, 'requirement');
      assert.ok(!result.error);
      assert.ok(result.svg.includes('auth_req'));
      assert.ok(result.svg.includes('login_service'));
      assert.ok(result.svg.includes('REQ-1'));
      assert.ok(result.svg.includes('satisfies'));
    });
  });

  describe('HTML Preview & Error Handling', () => {
    it('renders SVG markup when syntax is valid', () => {
      const html = renderMermaidPreviewHtml('graph TD\n  A --> B');
      assert.ok(html.includes('<svg class="mermaid-svg mermaid-flowchart"'));
    });

    it('renders localized error banner when syntax is empty or invalid', () => {
      const htmlDe = renderMermaidPreviewHtml('', 'de');
      assert.ok(htmlDe.includes('mermaid-error-card'));
      assert.ok(htmlDe.includes('Mermaid Syntaxfehler'));
      assert.ok(htmlDe.includes('Klicke auf das Code-Symbol oben rechts'));

      const htmlEn = renderMermaidPreviewHtml('', 'en');
      assert.ok(htmlEn.includes('mermaid-error-card'));
      assert.ok(htmlEn.includes('Mermaid Syntax Error'));
      assert.ok(htmlEn.includes('Click the code icon in the header'));
    });
  });
});
