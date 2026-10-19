/**
 * Git Graph diagram parser, branch-track layout engine, and SVG renderer.
 */

import { GitCommit, GitGraphData } from '../types';
import { escapeXml, estimateTextWidth } from '../svgUtils';

export function parseGitGraph(code: string): GitGraphData {
  const lines = code.split('\n');
  const branches: string[] = ['main'];
  const commits: GitCommit[] = [];
  let currentBranch = 'main';
  let commitIdCounter = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'gitgraph') {
      continue;
    }

    // branch branchName
    const branchMatch = line.match(/^branch\s+([a-zA-Z0-9_.-]+)/i);
    if (branchMatch) {
      const bName = branchMatch[1].trim();
      if (!branches.includes(bName)) {
        branches.push(bName);
      }
      currentBranch = bName;
      continue;
    }

    // checkout branchName
    const checkoutMatch = line.match(/^checkout\s+([a-zA-Z0-9_.-]+)/i);
    if (checkoutMatch) {
      const bName = checkoutMatch[1].trim();
      if (!branches.includes(bName)) {
        branches.push(bName);
      }
      currentBranch = bName;
      continue;
    }

    // merge branchName [id: "..."] [tag: "..."]
    const mergeMatch = line.match(/^merge\s+([a-zA-Z0-9_.-]+)(.*)$/i);
    if (mergeMatch) {
      const fromBranch = mergeMatch[1].trim();
      const rest = mergeMatch[2] || '';
      const idMatch = rest.match(/id:\s*["']?([^"'\s]+)["']?/);
      const tagMatch = rest.match(/tag:\s*["']?([^"'\s]+)["']?/);

      const commitId = idMatch ? idMatch[1] : `m_${commitIdCounter++}`;
      const tag = tagMatch ? tagMatch[1] : undefined;

      // Find last commit on currentBranch and last commit on fromBranch
      const parent1 = commits.filter((c) => c.branch === currentBranch).pop()?.id;
      const parent2 = commits.filter((c) => c.branch === fromBranch).pop()?.id;
      const parents: string[] = [];
      if (parent1) parents.push(parent1);
      if (parent2) parents.push(parent2);

      commits.push({
        id: commitId,
        branch: currentBranch,
        parents,
        tag,
      });
      continue;
    }

    // commit [id: "..."] [tag: "..."] [type: ...]
    const commitMatch = line.match(/^commit(?:\s+(.*))?$/i);
    if (commitMatch) {
      const rest = commitMatch[1] || '';
      const idMatch = rest.match(/id:\s*["']?([^"'\s]+)["']?/);
      const tagMatch = rest.match(/tag:\s*["']?([^"'\s]+)["']?/);
      const typeMatch = rest.match(/type:\s*([a-zA-Z]+)/);

      const commitId = idMatch ? idMatch[1] : `c_${commitIdCounter++}`;
      const tag = tagMatch ? tagMatch[1] : undefined;
      const type = (typeMatch ? typeMatch[1].toUpperCase() : 'NORMAL') as GitCommit['type'];

      const lastOnBranch = commits.filter((c) => c.branch === currentBranch).pop();
      const parents = lastOnBranch ? [lastOnBranch.id] : [];

      commits.push({
        id: commitId,
        branch: currentBranch,
        parents,
        tag,
        type,
      });
      continue;
    }
  }

  return { branches, commits };
}

export function layoutGitGraph(data: GitGraphData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { branches, commits } = data;
  if (commits.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const branchColors = ['#0284c7', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
  const branchYMap = new Map<string, number>();

  const trackGap = 44;
  const startY = 48;
  branches.forEach((b, idx) => {
    branchYMap.set(b, startY + idx * trackGap);
  });

  const commitGap = 56;
  const startX = 130;
  const totalWidth = startX + commits.length * commitGap + 50;
  const totalHeight = startY + branches.length * trackGap + 40;

  const renderedElements: string[] = [];

  // Branch label badges on the left & horizontal track guide lines
  branches.forEach((b, idx) => {
    const y = branchYMap.get(b)!;
    const color = branchColors[idx % branchColors.length];

    // Track guide line
    renderedElements.push(`
      <line x1="${startX - 20}" y1="${y}" x2="${totalWidth - 30}" y2="${y}" stroke="var(--card-border, #e2e8f0)" stroke-dasharray="2 4" stroke-width="1.2" />
    `);

    // Branch badge
    const badgeW = estimateTextWidth(b, 11) + 20;
    renderedElements.push(`
      <g class="mermaid-git-branch-badge">
        <rect x="${startX - badgeW - 28}" y="${y - 12}" width="${badgeW}" height="24" rx="12" fill="${color}" />
        <text x="${startX - badgeW / 2 - 28}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#ffffff">${escapeXml(b)}</text>
      </g>
    `);
  });

  // Calculate commit coordinates
  const commitPositions = new Map<string, { x: number; y: number }>();
  commits.forEach((c, idx) => {
    const cx = startX + idx * commitGap;
    const cy = branchYMap.get(c.branch) || startY;
    commitPositions.set(c.id, { x: cx, y: cy });
  });

  // Draw connecting edges
  commits.forEach((c) => {
    const target = commitPositions.get(c.id)!;
    c.parents.forEach((parentId) => {
      const source = commitPositions.get(parentId);
      if (!source) return;

      const branchIdx = branches.indexOf(c.branch);
      const edgeColor = branchColors[branchIdx >= 0 ? branchIdx % branchColors.length : 0];

      if (source.y === target.y) {
        // Straight line on same branch
        renderedElements.push(`
          <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="${edgeColor}" stroke-width="3" />
        `);
      } else {
        // Bezier curve connecting different branches
        const midX = (source.x + target.x) / 2;
        const pathD = `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`;
        renderedElements.push(`
          <path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="2.8" />
        `);
      }
    });
  });

  // Draw commit dots and tags
  commits.forEach((c) => {
    const pos = commitPositions.get(c.id)!;
    const branchIdx = branches.indexOf(c.branch);
    const color = branchColors[branchIdx >= 0 ? branchIdx % branchColors.length : 0];

    // Commit node circle
    renderedElements.push(`
      <circle cx="${pos.x}" cy="${pos.y}" r="6.5" fill="${color}" stroke="var(--card-bg, #ffffff)" stroke-width="2.5" />
    `);

    // Commit ID below
    renderedElements.push(`
      <text x="${pos.x}" y="${pos.y + 19}" text-anchor="middle" font-size="10" font-family="monospace" fill="var(--text-muted, #64748b)">${escapeXml(c.id)}</text>
    `);

    // Tag badge above if present
    if (c.tag) {
      const tagW = estimateTextWidth(c.tag, 10) + 12;
      renderedElements.push(`
        <rect x="${pos.x - tagW / 2}" y="${pos.y - 25}" width="${tagW}" height="16" rx="4" fill="#f59e0b" />
        <text x="${pos.x}" y="${pos.y - 13}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#ffffff">${escapeXml(c.tag)}</text>
      `);
    }
  });

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: renderedElements.join('\n'),
  };
}
