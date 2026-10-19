/**
 * Gantt diagram parser, task timeline scheduler, and SVG renderer.
 */

import { GanttData, GanttSection, GanttTask } from '../types';
import { escapeXml } from '../svgUtils';

export function parseGantt(code: string): GanttData {
  const lines = code.split('\n');
  let title: string | undefined;
  let dateFormat: string | undefined;
  const sections: GanttSection[] = [];
  const allTasks: GanttTask[] = [];

  let currentSection: GanttSection = { title: 'General', tasks: [] };
  let hasExplicitSection = false;
  let taskIdCounter = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'gantt') {
      continue;
    }

    // title Title
    const titleMatch = line.match(/^title\s+(.*?)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    // dateFormat YYYY-MM-DD
    const dateMatch = line.match(/^dateformat\s+(.*?)$/i);
    if (dateMatch) {
      dateFormat = dateMatch[1].trim();
      continue;
    }

    // section Section Name
    const secMatch = line.match(/^section\s+(.*?)$/i);
    if (secMatch) {
      if (hasExplicitSection && currentSection.tasks.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: secMatch[1].trim(), tasks: [] };
      hasExplicitSection = true;
      continue;
    }

    // Task Name : [tags/status], [id], [start], [duration]
    // e.g. "Completed task :done, des1, 2014-01-06, 2014-01-08"
    const taskMatch = line.match(/^(.*?)\s*:\s*(.*)$/);
    if (taskMatch) {
      const taskLabel = taskMatch[1].trim();
      const metaParts = taskMatch[2].split(',').map((p) => p.trim());

      let status: GanttTask['status'] = undefined;
      let id = `task_${taskIdCounter++}`;
      let startDate: string | undefined;
      let duration: string | undefined;
      let afterId: string | undefined;

      for (const part of metaParts) {
        if (['done', 'active', 'crit', 'milestone'].includes(part.toLowerCase())) {
          status = part.toLowerCase() as GanttTask['status'];
        } else if (part.toLowerCase().startsWith('after ')) {
          afterId = part.slice(6).trim();
        } else if (/^\d+[dhwms]$/i.test(part)) {
          duration = part;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(part)) {
          if (!startDate) startDate = part;
          else duration = part;
        } else if (!id || id.startsWith('task_')) {
          id = part;
        }
      }

      const task: GanttTask = {
        id,
        label: taskLabel,
        section: currentSection.title,
        status,
        startDate,
        duration,
        afterId,
      };

      currentSection.tasks.push(task);
      allTasks.push(task);
    }
  }

  if (currentSection.tasks.length > 0) {
    sections.push(currentSection);
  }

  return { title, dateFormat, sections, allTasks };
}

export function layoutGantt(data: GanttData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { title, sections, allTasks } = data;
  if (allTasks.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const rowHeight = 36;
  const sectionHeaderHeight = 28;
  const topMargin = title ? 54 : 32;
  const labelColWidth = 180;
  const timelineWidth = 460;
  const rightMargin = 30;
  const totalWidth = labelColWidth + timelineWidth + rightMargin;

  let currentY = topMargin;
  const renderedElements: string[] = [];

  // Title
  if (title) {
    renderedElements.push(
      `<text x="${totalWidth / 2}" y="26" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    );
  }

  // Draw vertical grid columns (4 time intervals)
  for (let col = 0; col <= 4; col++) {
    const gx = labelColWidth + (timelineWidth * col) / 4;
    renderedElements.push(`
      <line x1="${gx}" y1="${topMargin}" x2="${gx}" y2="##TOTAL_HEIGHT##" stroke="var(--card-border, #e2e8f0)" stroke-dasharray="3 3" stroke-width="1" />
    `);
  }

  // Sequentially schedule tasks visually across the timeline
  let virtualTime = 0;
  const taskPositions = new Map<string, { start: number; len: number }>();

  // Determine span of tasks across available timeline
  allTasks.forEach((t) => {
    let len = 1;
    if (t.duration) {
      const match = t.duration.match(/^(\d+)/);
      if (match) len = Math.max(1, Math.min(4, parseInt(match[1], 10) / 5));
    }
    if (t.status === 'milestone') len = 0.2;

    let start = virtualTime;
    if (t.afterId && taskPositions.has(t.afterId)) {
      const prev = taskPositions.get(t.afterId)!;
      start = prev.start + prev.len;
    }
    taskPositions.set(t.id, { start: start % 4, len });
    virtualTime = (start + len) % 4;
  });

  sections.forEach((sec) => {
    // Section Header
    if (sections.length > 1 || sec.title !== 'General') {
      renderedElements.push(`
        <rect x="16" y="${currentY}" width="${totalWidth - 32}" height="${sectionHeaderHeight}" fill="rgba(100, 116, 139, 0.08)" rx="4" />
        <text x="26" y="${currentY + 18}" font-size="12" font-weight="700" fill="var(--text-muted, #475569)">${escapeXml(sec.title).toUpperCase()}</text>
      `);
      currentY += sectionHeaderHeight + 6;
    }

    sec.tasks.forEach((task) => {
      const y = currentY;
      const pos = taskPositions.get(task.id) || { start: 0, len: 1 };
      const barX = labelColWidth + (pos.start / 4) * (timelineWidth - 40);
      const barW = Math.max(28, (pos.len / 4) * timelineWidth);

      // Task label on left
      renderedElements.push(`
        <text x="${labelColWidth - 14}" y="${y + 22}" text-anchor="end" font-size="12" font-weight="500" fill="var(--text, #0f172a)">${escapeXml(task.label)}</text>
      `);

      // Determine bar styling
      let barFill = '#38bdf8'; // sky
      let strokeColor = '#0284c7';
      if (task.status === 'done') {
        barFill = '#10b981'; // emerald
        strokeColor = '#059669';
      } else if (task.status === 'crit') {
        barFill = '#f43f5e'; // rose
        strokeColor = '#e11d48';
      } else if (task.status === 'active') {
        barFill = '#0ea5e9'; // intense blue
        strokeColor = '#0284c7';
      }

      if (task.status === 'milestone') {
        // Rotated diamond
        const cx = barX + 10;
        const cy = y + 18;
        const pts = `${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`;
        renderedElements.push(`
          <polygon points="${pts}" fill="#f59e0b" stroke="#d97706" stroke-width="1.5" />
        `);
      } else {
        // Rounded bar
        renderedElements.push(`
          <rect x="${barX}" y="${y + 8}" width="${barW}" height="${rowHeight - 16}" rx="6" ry="6" fill="${barFill}" stroke="${strokeColor}" stroke-width="1.2" opacity="0.9" />
        `);
      }

      currentY += rowHeight;
    });

    currentY += 8;
  });

  const totalHeight = currentY + 16;
  const svgInner = renderedElements
    .join('\n')
    .replace(/##TOTAL_HEIGHT##/g, `${totalHeight - 16}`);

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner,
  };
}
