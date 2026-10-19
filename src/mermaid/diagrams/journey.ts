/**
 * User Journey diagram parser, satisfaction metric mapper, and SVG renderer.
 */

import { JourneyData, JourneySection } from '../types';
import { escapeXml } from '../svgUtils';

export function parseJourney(code: string): JourneyData {
  const lines = code.split('\n');
  let title: string | undefined;
  const sections: JourneySection[] = [];
  let currentSection: JourneySection = { title: '', tasks: [] };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'journey') {
      continue;
    }

    // title Title
    const titleMatch = line.match(/^title\s+(.*?)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    // section Section Name
    const secMatch = line.match(/^section\s+(.*?)$/i);
    if (secMatch) {
      if (currentSection.tasks.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: secMatch[1].trim(), tasks: [] };
      continue;
    }

    // Task Name : score : Actors
    // e.g. "Make tea: 5: Me" or "Do work: 1: Me, Cat"
    const taskMatch = line.match(/^(.*?)\s*:\s*([1-5])(?:\s*:\s*(.*))?$/);
    if (taskMatch) {
      const name = taskMatch[1].trim();
      const score = parseInt(taskMatch[2], 10);
      const rawActors = taskMatch[3] ? taskMatch[3].trim() : '';
      const actors = rawActors
        ? rawActors.split(',').map((a) => a.trim()).filter((a) => a.length > 0)
        : [];

      currentSection.tasks.push({ name, score, actors });
    }
  }

  if (currentSection.tasks.length > 0) {
    sections.push(currentSection);
  }

  return { title, sections };
}

export function layoutJourney(data: JourneyData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { title, sections } = data;
  const allTasks = sections.flatMap((s) => s.tasks);
  if (allTasks.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const topMargin = title ? 56 : 36;
  const colWidth = 140;
  const colGap = 16;
  const leftMargin = 28;
  const totalWidth = leftMargin + allTasks.length * (colWidth + colGap) + leftMargin - colGap;

  const scoreColors: Record<number, { bg: string; text: string; icon: string }> = {
    5: { bg: '#10b981', text: '#ffffff', icon: '😄 5' },
    4: { bg: '#34d399', text: '#064e3b', icon: '🙂 4' },
    3: { bg: '#fbbf24', text: '#78350f', icon: '😐 3' },
    2: { bg: '#fb923c', text: '#7c2d12', icon: '🙁 2' },
    1: { bg: '#f43f5e', text: '#ffffff', icon: '😡 1' },
  };

  const renderedSvgs: string[] = [];

  // Title
  if (title) {
    renderedSvgs.push(
      `<text x="${totalWidth / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    );
  }

  // Section banners at top
  let taskOffset = 0;
  sections.forEach((sec) => {
    if (sec.title) {
      const secX = leftMargin + taskOffset * (colWidth + colGap);
      const secW = sec.tasks.length * (colWidth + colGap) - colGap;
      renderedSvgs.push(`
        <rect x="${secX}" y="${topMargin}" width="${secW}" height="28" rx="4" fill="rgba(2, 132, 199, 0.08)" />
        <text x="${secX + secW / 2}" y="${topMargin + 19}" text-anchor="middle" font-size="12" font-weight="700" fill="#0284c7">${escapeXml(sec.title)}</text>
      `);
    }
    taskOffset += sec.tasks.length;
  });

  // Step cards and trendline points
  const cardTopY = topMargin + (sections.some((s) => s.title) ? 38 : 0);
  const trendPoints: { x: number; y: number }[] = [];

  allTasks.forEach((task, idx) => {
    const x = leftMargin + idx * (colWidth + colGap);
    const scoreInfo = scoreColors[task.score] || scoreColors[3];

    // Card background
    renderedSvgs.push(`
      <g class="mermaid-journey-step">
        <rect x="${x}" y="${cardTopY}" width="${colWidth}" height="130" rx="8" ry="8" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #e2e8f0)" stroke-width="1.2" />
        <text x="${x + colWidth / 2}" y="${cardTopY + 28}" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(task.name)}</text>
        
        <!-- Score pill -->
        <rect x="${x + colWidth / 2 - 28}" y="${cardTopY + 44}" width="56" height="24" rx="12" fill="${scoreInfo.bg}" />
        <text x="${x + colWidth / 2}" y="${cardTopY + 60}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${scoreInfo.text}">${scoreInfo.icon}</text>
        
        <!-- Actors -->
        <text x="${x + colWidth / 2}" y="${cardTopY + 104}" text-anchor="middle" font-size="11" fill="var(--text-muted, #64748b)">👤 ${escapeXml(task.actors.join(', ') || 'User')}</text>
      </g>
    `);

    // Trend point
    trendPoints.push({
      x: x + colWidth / 2,
      y: cardTopY + 180 - task.score * 16,
    });
  });

  // Draw trend curve
  if (trendPoints.length > 1) {
    const pathD = trendPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
    renderedSvgs.push(`
      <path d="${pathD}" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-dasharray="3 3" />
    `);
    trendPoints.forEach((p) => {
      renderedSvgs.push(`
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="#0284c7" stroke="var(--card-bg, #ffffff)" stroke-width="2" />
      `);
    });
  }

  const totalHeight = cardTopY + 190;

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: renderedSvgs.join('\n'),
  };
}
