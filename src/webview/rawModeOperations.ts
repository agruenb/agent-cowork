import { indentRawText, outdentRawText } from '../markdown/listOperations';
import { tWebview } from './i18n';
import { autoResizeRawTextarea } from './editorState';
import { updateRawLineNumbers } from './rawLineNumbers';

/**
 * Applies markdown formatting to a raw textarea based on the toolbar action.
 */
export function applyRawFormatting(
  textarea: HTMLTextAreaElement,
  action: string,
  param?: string
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selectedText = val.slice(start, end);

  let newText = val;
  let newStart = start;
  let newEnd = end;

  switch (action) {
    case 'bold': {
      if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length >= 4) {
        // Toggle off
        const inner = selectedText.slice(2, -2);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `**${selectedText}**`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 2;
        newEnd = selectedText ? start + wrap.length : start + 2;
      }
      break;
    }

    case 'italic': {
      if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length >= 2) {
        // Toggle off
        const inner = selectedText.slice(1, -1);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `*${selectedText}*`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 1;
        newEnd = selectedText ? start + wrap.length : start + 1;
      }
      break;
    }

    case 'strike': {
      if (selectedText.startsWith('~~') && selectedText.endsWith('~~') && selectedText.length >= 4) {
        // Toggle off
        const inner = selectedText.slice(2, -2);
        newText = val.slice(0, start) + inner + val.slice(end);
        newEnd = start + inner.length;
      } else {
        const wrap = `~~${selectedText}~~`;
        newText = val.slice(0, start) + wrap + val.slice(end);
        newStart = selectedText ? start : start + 2;
        newEnd = selectedText ? start + wrap.length : start + 2;
      }
      break;
    }

    case 'code': {
      if (selectedText.includes('\n') || !selectedText) {
        const placeholder = tWebview('// Code hier eingeben...');
        const block = `\`\`\`markdown\n${selectedText || placeholder}\n\`\`\``;
        newText = val.slice(0, start) + block + val.slice(end);
        newEnd = start + block.length;
      } else {
        const inline = `\`${selectedText}\``;
        newText = val.slice(0, start) + inline + val.slice(end);
        newEnd = start + inline.length;
      }
      break;
    }

    case 'quote': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allQuoted = targetLines.every((l) => l.trimStart().startsWith('> '));
      const transformed = targetLines
        .map((l) => (allQuoted ? l.replace(/^(\s*)>\s?/, '$1') : `> ${l}`))
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'bullet': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allBulleted = targetLines.every((l) => /^\s*[-*+]\s+/.test(l));
      const transformed = targetLines
        .map((l) => (allBulleted ? l.replace(/^(\s*)[-*+]\s+/, '$1') : l.replace(/^(\s*)/, '$1- ')))
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'ordered': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allOrdered = targetLines.every((l) => /^\s*\d+[.)]\s+/.test(l));
      let idx = 1;
      const transformed = targetLines
        .map((l) => {
          if (allOrdered) {
            return l.replace(/^(\s*)\d+[.)]\s+/, '$1');
          } else {
            const res = l.replace(/^(\s*)/, `$1${idx}. `);
            idx++;
            return res;
          }
        })
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'task': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const targetLines = val.slice(lineStart, lineEnd).split('\n');

      const allTasks = targetLines.every((l) => /^\s*[-*+]\s+\[([ xX])\]\s*/.test(l));
      const transformed = targetLines
        .map((l) => {
          if (allTasks) {
            // Toggle off
            return l.replace(/^(\s*)[-*+]\s+\[([ xX])\]\s*/, '$1');
          } else {
            // Remove any bullet/number marker then add task marker
            const clean = l.replace(/^(\s*)([-*+]|\d+[.)])\s+/, '$1');
            return clean.replace(/^(\s*)/, '$1- [ ] ');
          }
        })
        .join('\n');

      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + transformed.length;
      break;
    }

    case 'indent': {
      const res = indentRawText(val, start, end);
      newText = res.value;
      newStart = res.selectionStart;
      newEnd = res.selectionEnd;
      break;
    }

    case 'outdent': {
      const res = outdentRawText(val, start, end);
      newText = res.value;
      newStart = res.selectionStart;
      newEnd = res.selectionEnd;
      break;
    }

    case 'table': {
      const col1 = tWebview('Spalte 1');
      const col2 = tWebview('Spalte 2');
      const col3 = tWebview('Spalte 3');
      const val1 = tWebview('Inhalt 1');
      const val2 = tWebview('Inhalt 2');
      const val3 = tWebview('Inhalt 3');
      const val4 = tWebview('Inhalt 4');
      const val5 = tWebview('Inhalt 5');
      const val6 = tWebview('Inhalt 6');
      const tableMarkdown = `\n| ${col1} | ${col2} | ${col3} |\n| --- | --- | --- |\n| ${val1} | ${val2} | ${val3} |\n| ${val4} | ${val5} | ${val6} |\n`;
      newText = val.slice(0, start) + tableMarkdown + val.slice(end);
      newEnd = start + tableMarkdown.length;
      break;
    }

    case 'hr': {
      const hr = `\n---\n`;
      newText = val.slice(0, start) + hr + val.slice(end);
      newEnd = start + hr.length;
      break;
    }

    case 'heading': {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const line = val.slice(lineStart, lineEnd);
      const cleanLine = line.replace(/^\s*#{1,6}\s*/, '');

      let prefix = '';
      if (param === 'h1') prefix = '# ';
      else if (param === 'h2') prefix = '## ';
      else if (param === 'h3') prefix = '### ';

      const transformed = `${prefix}${cleanLine}`;
      newText = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
      newStart = lineStart + transformed.length;
      newEnd = newStart;
      break;
    }
  }

  textarea.value = newText;
  textarea.selectionStart = newStart;
  textarea.selectionEnd = newEnd;
  autoResizeRawTextarea();
  updateRawLineNumbers();
  textarea.focus();
  const win = textarea.ownerDocument?.defaultView;
  const Evt = win ? win.Event : Event;
  try {
    textarea.dispatchEvent(new Evt('input', { bubbles: true }));
  } catch {
    // Ignore in headless test runners if Event constructor differs
  }
}
