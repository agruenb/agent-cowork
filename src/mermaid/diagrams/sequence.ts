/**
 * Sequence diagram parser, timeline layout engine, and SVG renderer.
 */

import {
  SequenceData,
  SequenceActor,
  SequenceArrowType,
} from '../types';
import {
  measureTextLines,
  escapeXml,
  estimateTextWidth,
  renderMultilineTextSvg,
} from '../svgUtils';

export function parseSequence(code: string): SequenceData {
  const lines = code.split('\n');
  const actorsMap = new Map<string, SequenceActor>();
  const steps: SequenceData['steps'] = [];
  let autonumber = false;

  const ensureActor = (id: string, name?: string, type: 'participant' | 'actor' = 'participant') => {
    const cleanId = id.trim();
    if (!actorsMap.has(cleanId)) {
      actorsMap.set(cleanId, {
        id: cleanId,
        name: (name || cleanId).trim(),
        type,
      });
    }
  };

  let stepCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.toLowerCase() === 'sequencediagram') {
      continue;
    }

    if (line.toLowerCase() === 'autonumber') {
      autonumber = true;
      continue;
    }

    // participant Alice as Alicia
    let match = line.match(/^(participant|actor)\s+([a-zA-Z0-9_.-]+)(?:\s+as\s+(.*?))?$/i);
    if (match) {
      const type = match[1].toLowerCase() as 'participant' | 'actor';
      const id = match[2];
      const name = match[3] || id;
      ensureActor(id, name, type);
      continue;
    }

    // activate / deactivate
    match = line.match(/^(activate|deactivate)\s+([a-zA-Z0-9_.-]+)$/i);
    if (match) {
      const kind = match[1].toLowerCase() as 'activate' | 'deactivate';
      const actor = match[2];
      ensureActor(actor);
      steps.push({ kind, actor });
      continue;
    }

    // Note (left of / right of / over)
    match = line.match(/^Note\s+(left\s+of|right\s+of|over)\s+([a-zA-Z0-9_.,\s]+)\s*:\s*(.*)$/i);
    if (match) {
      const placementRaw = match[1].toLowerCase().replace(/\s+/g, '');
      const placement = placementRaw.includes('left')
        ? 'left'
        : placementRaw.includes('right')
        ? 'right'
        : 'over';
      const actors = match[2].split(',').map((s) => s.trim());
      actors.forEach((a) => ensureActor(a));
      const text = match[3] || '';
      steps.push({
        kind: 'note',
        data: {
          actors,
          placement,
          text,
          stepIndex: stepCounter++,
        },
      });
      continue;
    }

    // loop / alt / opt / par / critical
    match = line.match(/^(loop|alt|opt|par|critical)(?:\s+(.*?))?$/i);
    if (match && !line.startsWith('end')) {
      const type = match[1].toLowerCase() as 'loop' | 'alt' | 'opt' | 'par' | 'critical';
      const label = match[2] || type;
      steps.push({
        kind: 'block_start',
        data: { type, label, startIndex: stepCounter++ },
      });
      continue;
    }

    // else
    match = line.match(/^else(?:\s+(.*?))?$/i);
    if (match) {
      steps.push({
        kind: 'block_divider',
        data: { type: 'else', label: match[1] || 'else', startIndex: stepCounter++ },
      });
      continue;
    }

    // end
    if (line === 'end') {
      steps.push({ kind: 'block_end' });
      continue;
    }

    // Message arrows: A->>+B: text, B-->>-A: text, etc.
    const msgMatch = line.match(
      /^([a-zA-Z0-9_.-]+)\s*(->>|-->>|->|-->|-x|--x|-\)|--\))\s*([+-])?\s*([a-zA-Z0-9_.-]+)\s*:\s*(.*)$/
    );
    if (msgMatch) {
      const from = msgMatch[1];
      const arrowRaw = msgMatch[2];
      const modifier = msgMatch[3]; // + or -
      const to = msgMatch[4];
      const text = msgMatch[5] || '';

      ensureActor(from);
      ensureActor(to);

      let arrowType: SequenceArrowType = 'solid_arrow';
      if (arrowRaw === '-->>') arrowType = 'dotted_arrow';
      else if (arrowRaw === '->') arrowType = 'solid_open';
      else if (arrowRaw === '-->') arrowType = 'dotted_open';
      else if (arrowRaw === '-x') arrowType = 'solid_cross';
      else if (arrowRaw === '--x') arrowType = 'dotted_cross';
      else if (arrowRaw === '-)') arrowType = 'solid_open';
      else if (arrowRaw === '--)') arrowType = 'dotted_open';

      const isSelf = from === to;

      steps.push({
        kind: 'message',
        data: {
          from,
          to,
          text,
          arrowType,
          isSelf,
          stepIndex: stepCounter++,
        },
      });

      if (modifier === '+') steps.push({ kind: 'activate', actor: to });
      if (modifier === '-') steps.push({ kind: 'deactivate', actor: from });
      continue;
    }
  }

  return {
    autonumber,
    actors: Array.from(actorsMap.values()),
    steps,
  };
}

export function layoutSequence(data: SequenceData): {
  width: number;
  height: number;
  svgInner: string;
} {
  const { actors, steps, autonumber } = data;
  if (actors.length === 0) {
    return { width: 100, height: 60, svgInner: '' };
  }

  const marginX = 40;
  const marginTop = 30;
  const actorHeight = 36;
  const actorGap = 70;
  const stepHeight = 44;

  // Measure actor box widths
  const actorPositions = new Map<string, { x: number; width: number; center: number }>();
  let currentX = marginX;

  for (const actor of actors) {
    const textWidth = estimateTextWidth(actor.name, 13);
    const boxW = Math.max(90, textWidth + 28);
    const center = currentX + boxW / 2;
    actorPositions.set(actor.id, { x: currentX, width: boxW, center });
    currentX += boxW + actorGap;
  }

  const totalWidth = currentX - actorGap + marginX;
  const lifelineStartY = marginTop + actorHeight;

  // Calculate total height based on steps
  let totalStepsCount = 0;
  for (const step of steps) {
    if (step.kind === 'message' || step.kind === 'note' || step.kind === 'block_start') {
      totalStepsCount++;
    }
  }
  const totalHeight = lifelineStartY + Math.max(2, totalStepsCount) * stepHeight + 50;

  const svgParts: string[] = [];

  // Render vertical lifelines
  for (const actor of actors) {
    const pos = actorPositions.get(actor.id);
    if (pos) {
      svgParts.push(`
        <line class="mermaid-lifeline" x1="${pos.center}" y1="${lifelineStartY}" x2="${pos.center}" y2="${totalHeight - 30}" />
      `);
    }
  }

  // Active state trackers for activations
  const activeRanges = new Map<string, { startY: number }[]>();
  for (const a of actors) activeRanges.set(a.id, []);

  // Render steps chronologically
  let currentY = lifelineStartY + 30;
  let messageNumber = 1;

  for (const step of steps) {
    if (step.kind === 'activate') {
      activeRanges.get(step.actor)?.push({ startY: currentY });
      continue;
    }
    if (step.kind === 'deactivate') {
      const activeList = activeRanges.get(step.actor);
      if (activeList && activeList.length > 0) {
        const active = activeList.pop()!;
        const pos = actorPositions.get(step.actor);
        if (pos) {
          const barW = 10;
          svgParts.push(`
            <rect class="mermaid-activation" x="${pos.center - barW / 2}" y="${active.startY}" width="${barW}" height="${currentY - active.startY}" rx="2" />
          `);
        }
      }
      continue;
    }

    if (step.kind === 'message') {
      const msg = step.data;
      const fromPos = actorPositions.get(msg.from);
      const toPos = actorPositions.get(msg.to);

      if (fromPos && toPos) {
        const labelText = autonumber ? `${messageNumber++}. ${msg.text}` : msg.text;
        const isDashed = msg.arrowType.startsWith('dotted');
        const marker =
          msg.arrowType === 'solid_arrow' || msg.arrowType === 'dotted_arrow'
            ? 'marker-end="url(#mermaid-arrow-solid)"'
            : msg.arrowType === 'solid_cross' || msg.arrowType === 'dotted_cross'
            ? 'marker-end="url(#mermaid-cross)"'
            : 'marker-end="url(#mermaid-arrow-open)"';

        if (msg.isSelf) {
          // Self-loop to the right
          const startX = fromPos.center;
          const loopW = 36;
          const loopH = 24;
          const path = `M ${startX} ${currentY} h ${loopW} v ${loopH} h -${loopW}`;
          svgParts.push(`
            <path d="${path}" class="mermaid-message ${isDashed ? 'is-dashed' : ''}" fill="none" ${marker} />
            <text class="mermaid-message-text" x="${startX + loopW + 8}" y="${currentY + loopH / 2 + 4}" style="text-anchor: start;">${escapeXml(labelText)}</text>
          `);
          currentY += loopH + 16;
        } else {
          // Direct arrow between actors
          const x1 = fromPos.center;
          const x2 = toPos.center;
          const midX = (x1 + x2) / 2;

          svgParts.push(`
            <line x1="${x1}" y1="${currentY}" x2="${x2}" y2="${currentY}" class="mermaid-message ${isDashed ? 'is-dashed' : ''}" ${marker} />
            <text class="mermaid-message-text" x="${midX}" y="${currentY - 6}">${escapeXml(labelText)}</text>
          `);
          currentY += stepHeight;
        }
      }
    } else if (step.kind === 'note') {
      const note = step.data;
      const primaryActor = note.actors[0];
      const pos = actorPositions.get(primaryActor);
      if (pos) {
        const { lines, width, height } = measureTextLines(note.text, 11);
        const noteW = Math.max(90, width);
        const noteH = Math.max(26, height);

        let noteX = pos.center - noteW / 2;
        if (note.placement === 'left') noteX = pos.center - noteW - 12;
        if (note.placement === 'right') noteX = pos.center + 12;

        svgParts.push(`
          <g class="mermaid-note">
            <rect x="${noteX}" y="${currentY - noteH / 2}" width="${noteW}" height="${noteH}" />
            ${renderMultilineTextSvg(lines, noteX + noteW / 2, currentY, 11)}
          </g>
        `);
        currentY += noteH + 16;
      }
    } else if (step.kind === 'block_start') {
      const b = step.data;
      const labelW = estimateTextWidth(b.label, 11) + 20;
      svgParts.push(`
        <g class="mermaid-frame">
          <rect class="mermaid-frame-header" x="${marginX - 10}" y="${currentY - 14}" width="${labelW}" height="18" rx="2" />
          <text class="mermaid-frame-title" x="${marginX}" y="${currentY - 2}">${escapeXml(b.label)}</text>
        </g>
      `);
      currentY += 24;
    }
  }

  // Render Actor boxes at Top
  for (const actor of actors) {
    const pos = actorPositions.get(actor.id);
    if (pos) {
      svgParts.push(`
        <g class="mermaid-actor">
          <rect x="${pos.x}" y="${marginTop}" width="${pos.width}" height="${actorHeight}" />
          <text x="${pos.center}" y="${marginTop + actorHeight / 2}">${escapeXml(actor.name)}</text>
        </g>
      `);
    }
  }

  return {
    width: Math.max(160, totalWidth),
    height: Math.max(120, currentY + 30),
    svgInner: svgParts.join('\n'),
  };
}
