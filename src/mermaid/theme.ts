/**
 * Theme configuration and SVG style definitions for the custom Mermaid renderer.
 * Designed to look modern, crisp, and harmonious in both Light and Dark modes.
 */

export const MERMAID_PALETTE = {
  light: {
    bg: '#ffffff',
    nodeBg: '#ffffff',
    nodeBorder: '#cbd5e1',
    nodeText: '#0f172a',
    edgeStroke: '#64748b',
    edgeText: '#475569',
    edgeBadgeBg: '#f8fafc',
    edgeBadgeBorder: '#e2e8f0',
    subgraphBg: '#f8fafc',
    subgraphBorder: '#cbd5e1',
    subgraphTitle: '#334155',
    accent: '#0284c7',
    accentLight: '#e0f2fe',
    noteBg: '#fef3c7',
    noteBorder: '#f59e0b',
    noteText: '#78350f',
    actorBg: '#f1f5f9',
    actorBorder: '#94a3b8',
    lifeline: '#cbd5e1',
    activationBg: '#e0f2fe',
    activationBorder: '#38bdf8',
  },
  dark: {
    bg: '#0b1120',
    nodeBg: '#1e293b',
    nodeBorder: '#334155',
    nodeText: '#f8fafc',
    edgeStroke: '#94a3b8',
    edgeText: '#cbd5e1',
    edgeBadgeBg: '#0f172a',
    edgeBadgeBorder: '#1e293b',
    subgraphBg: '#0b1120',
    subgraphBorder: '#1e293b',
    subgraphTitle: '#94a3b8',
    accent: '#38bdf8',
    accentLight: 'rgba(56, 189, 248, 0.15)',
    noteBg: '#451a03',
    noteBorder: '#d97706',
    noteText: '#fef3c7',
    actorBg: '#1e293b',
    actorBorder: '#475569',
    lifeline: '#334155',
    activationBg: '#0369a1',
    activationBorder: '#38bdf8',
  },
  pieColors: [
    '#38bdf8', // sky
    '#818cf8', // indigo
    '#34d399', // emerald
    '#f472b6', // pink
    '#fbbf24', // amber
    '#a78bfa', // purple
    '#fb7185', // rose
    '#2dd4bf', // teal
    '#60a5fa', // blue
  ],
};

/**
 * Returns embedded CSS rules for the Mermaid SVG to dynamically react to VS Code theme.
 */
export function getMermaidSvgStyles(): string {
  return `
    .mermaid-svg {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      user-select: none;
      display: block;
      margin: 0 auto;
    }
    .mermaid-node rect,
    .mermaid-node circle,
    .mermaid-node ellipse,
    .mermaid-node polygon,
    .mermaid-node path {
      fill: var(--card-bg, #ffffff);
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1.5px;
    }
    .mermaid-node text {
      fill: var(--text, #0f172a);
      font-size: 13px;
      font-weight: 500;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .mermaid-edge {
      fill: none;
      stroke: var(--text-muted, #64748b);
      stroke-width: 1.5px;
    }
    .mermaid-edge.is-thick {
      stroke-width: 2.5px;
    }
    .mermaid-edge.is-dashed {
      stroke-dasharray: 4, 4;
    }
    .mermaid-edge-label-bg {
      fill: var(--card-bg, #ffffff);
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1px;
      rx: 4px;
    }
    .mermaid-edge-label text {
      fill: var(--text, #0f172a);
      font-size: 11px;
      font-weight: 600;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .mermaid-subgraph rect {
      fill: var(--card-bg, #f8fafc);
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1px;
      stroke-dasharray: 4, 3;
      rx: 8px;
    }
    .mermaid-subgraph text {
      fill: var(--text-muted, #64748b);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    /* Sequence diagram styles */
    .mermaid-lifeline {
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1.5px;
      stroke-dasharray: 4, 4;
    }
    .mermaid-actor rect {
      fill: var(--card-header-bg, #f1f5f9);
      stroke: var(--card-border, #94a3b8);
      stroke-width: 1.5px;
      rx: 6px;
    }
    .mermaid-actor text {
      fill: var(--text, #0f172a);
      font-size: 13px;
      font-weight: 600;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .mermaid-message {
      stroke: var(--text, #0f172a);
      stroke-width: 1.5px;
    }
    .mermaid-message.is-dashed {
      stroke-dasharray: 4, 4;
    }
    .mermaid-message-text {
      fill: var(--text, #0f172a);
      font-size: 12px;
      text-anchor: middle;
      dominant-baseline: auto;
    }
    .mermaid-note rect {
      fill: #fef3c7;
      stroke: #f59e0b;
      stroke-width: 1px;
      rx: 4px;
    }
    .mermaid-note text {
      fill: #78350f;
      font-size: 11px;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .mermaid-activation {
      fill: #e0f2fe;
      stroke: #38bdf8;
      stroke-width: 1.5px;
    }
    .mermaid-frame rect {
      fill: transparent;
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1px;
      rx: 6px;
    }
    .mermaid-frame-header {
      fill: var(--card-header-bg, #f1f5f9);
      stroke: var(--card-border, #cbd5e1);
      stroke-width: 1px;
    }
    .mermaid-frame-title {
      fill: var(--text-muted, #64748b);
      font-size: 11px;
      font-weight: 600;
    }
    /* Dark mode overrides */
    body.vscode-dark .mermaid-note rect {
      fill: #451a03;
      stroke: #d97706;
    }
    body.vscode-dark .mermaid-note text {
      fill: #fef3c7;
    }
    body.vscode-dark .mermaid-activation {
      fill: #0369a1;
      stroke: #38bdf8;
    }
    body.vscode-dark .mermaid-edge-label-bg {
      fill: #1e293b;
      stroke: #334155;
    }
    body.vscode-dark .mermaid-edge-label text {
      fill: #f8fafc;
    }
  `;
}
