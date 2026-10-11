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
