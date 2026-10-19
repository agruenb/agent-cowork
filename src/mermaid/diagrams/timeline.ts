/**
 * Timeline diagram parser, chronological event layout, and SVG renderer.
 */

import { TimelineData, TimelineEvent, TimelineSection } from '../types';
import { escapeXml } from '../svgUtils';

export function parseTimeline(code: string): TimelineData {
  const lines = code.split('\n');
  let title: string | undefined;
  const sections: TimelineSection[] = [];
  let currentSection: TimelineSection = { title: '', events: [] };
  let currentEvent: TimelineEvent | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'timeline') {
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
      if (currentSection.events.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: secMatch[1].trim(), events: [] };
      currentEvent = null;
      continue;
    }

    // Follow-up event: ": Event Name"
    if (line.startsWith(':') && currentEvent) {
      const evt = line.slice(1).trim();
      if (evt) currentEvent.events.push(evt);
      continue;
    }

    // Period : Event Name
    const periodMatch = line.match(/^(.*?)\s*:\s*(.*)$/);
    if (periodMatch) {
      const period = periodMatch[1].trim();
      const firstEvt = periodMatch[2].trim();
      currentEvent = {
        period,
        events: firstEvt ? [firstEvt] : [],
      };
      currentSection.events.push(currentEvent);
      continue;
    }

    // Single period line without colon
    currentEvent = {
      period: line,
      events: [],
    };
    currentSection.events.push(currentEvent);
  }

  if (currentSection.events.length > 0) {
    sections.push(currentSection);
  }

  return { title, sections };
}

export function layoutTimeline(data: TimelineData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { title, sections } = data;
  const allEvents = sections.flatMap((s) => s.events);
  if (allEvents.length === 0) {
    return { width: 300, height: 100, svgInner: '' };
  }

  const topMargin = title ? 54 : 36;
  const cardWidth = 140;
  const cardGap = 24;
  const leftMargin = 36;
  const totalWidth = leftMargin + allEvents.length * (cardWidth + cardGap) + 16;

  const titleSvg = title
    ? `<text x="${totalWidth / 2}" y="28" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text, #0f172a)">${escapeXml(title)}</text>`
    : '';

  const palette = ['#0284c7', '#818cf8', '#059669', '#d97706', '#db2777', '#7c3aed'];
  const svgs: string[] = [];

  // Timeline backbone axis
  const axisY = topMargin + 32;
  svgs.push(`
    <line x1="${leftMargin}" y1="${axisY}" x2="${totalWidth - 36}" y2="${axisY}" stroke="var(--card-border, #cbd5e1)" stroke-width="2.5" stroke-linecap="round" />
  `);

  let maxCardHeight = 80;
  let eventIdx = 0;

  sections.forEach((sec, sIdx) => {
    const secColor = palette[sIdx % palette.length];

    sec.events.forEach((evt) => {
      const cx = leftMargin + eventIdx * (cardWidth + cardGap) + cardWidth / 2;
      const cardX = cx - cardWidth / 2;
      const cardY = axisY + 24;

      // Period bubble / node on axis
      svgs.push(`
        <circle cx="${cx}" cy="${axisY}" r="7" fill="${secColor}" stroke="var(--card-bg, #ffffff)" stroke-width="2.5" />
        <line x1="${cx}" y1="${axisY + 7}" x2="${cx}" y2="${cardY}" stroke="${secColor}" stroke-width="1.5" stroke-dasharray="2 2" />
      `);

      // Period label above axis
      svgs.push(`
        <text x="${cx}" y="${axisY - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="${secColor}">${escapeXml(evt.period)}</text>
      `);

      // Event Card
      const itemSvgs: string[] = [];
      let itemY = cardY + 26;
      evt.events.forEach((itemText) => {
        itemSvgs.push(`
          <text x="${cardX + 12}" y="${itemY}" font-size="11.5" fill="var(--text, #0f172a)">• ${escapeXml(itemText)}</text>
        `);
        itemY += 18;
      });

      const cardH = Math.max(50, itemY - cardY + 8);
      if (cardH > maxCardHeight) maxCardHeight = cardH;

      svgs.push(`
        <g class="mermaid-timeline-card">
          <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardH}" rx="6" ry="6" fill="var(--card-bg, #ffffff)" stroke="var(--card-border, #e2e8f0)" stroke-width="1.2" />
          <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="4" rx="2" fill="${secColor}" />
          ${itemSvgs.join('\n')}
        </g>
      `);

      eventIdx++;
    });
  });

  const totalHeight = axisY + 24 + maxCardHeight + 36;

  return {
    width: totalWidth,
    height: totalHeight,
    svgInner: `${titleSvg}\n${svgs.join('\n')}`,
  };
}
