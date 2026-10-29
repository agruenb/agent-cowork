import { state, getEditorCanvas } from './editorState';
import { tWebview } from './i18n';

const CURRENT_CLASS = 'is-current-change';

let changeTargets: HTMLElement[] = [];
let currentIndex = -1;

/**
 * Collects the elements that represent one AI change each, in document order.
 * Formatted mode: top-level canvas blocks carrying diff markup.
 * Raw mode: the first line of every consecutive run of added/removed lines.
 */
export function getAiChangeTargets(): HTMLElement[] {
  if (typeof document === 'undefined') return [];

  if (state.isRawMode) {
    const rawDiff = document.getElementById('raw-diff');
    if (!rawDiff) return [];
    const lines = Array.from(rawDiff.querySelectorAll<HTMLElement>('.raw-diff-line'));
    return lines.filter((line) => {
      if (line.classList.contains('raw-diff-same')) return false;
      const prev = line.previousElementSibling;
      return !prev || prev.classList.contains('raw-diff-same');
    });
  }

  const canvas = getEditorCanvas();
  if (!canvas) return [];
  return (Array.from(canvas.children) as HTMLElement[]).filter(
    (el) => el.matches('[class*="diff-"]') || el.querySelector('ins.diff-ins, del.diff-del, [class*="diff-"]') !== null
  );
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateCounter(): void {
  const total = changeTargets.length;
  // Always shown while there are changes, so the next/previous buttons never shift under the cursor
  setText('ai-change-count', total > 0 ? tWebview('{0} von {1}', currentIndex >= 0 ? currentIndex + 1 : '–', total) : '');
}

/**
 * Re-reads the rendered diff and updates the review bar title and change counter.
 * Called whenever the diff is (re-)rendered in formatted or raw mode, and on language change.
 */
export function refreshAiReviewSummary(): void {
  if (typeof document === 'undefined') return;
  changeTargets = getAiChangeTargets();
  currentIndex = -1;

  const total = changeTargets.length;
  let title: string;
  if (total === 1) {
    title = tWebview('Cowork hat 1 Stelle geändert');
  } else if (total > 1) {
    title = tWebview('Cowork hat {0} Stellen geändert', total);
  } else {
    title = tWebview('KI-Änderungen');
  }
  setText('ai-edits-title', title);
  setText('ai-edits-hint', tWebview('Bearbeiten pausiert, bis du entscheidest'));

  const prev = document.getElementById('btn-ai-prev') as HTMLButtonElement | null;
  const next = document.getElementById('btn-ai-next') as HTMLButtonElement | null;
  if (prev) prev.disabled = total === 0;
  if (next) next.disabled = total === 0;
  updateCounter();
}

/**
 * Clears navigation state and the current-change highlight when review mode ends.
 */
export function resetAiReviewNavigation(): void {
  for (const el of changeTargets) {
    el.classList.remove(CURRENT_CLASS);
  }
  changeTargets = [];
  currentIndex = -1;
  if (typeof document !== 'undefined') {
    setText('ai-change-count', '');
  }
}

/**
 * Moves to the next (1) or previous (-1) AI change, scrolling it into view and highlighting it.
 */
export function navigateAiChange(direction: 1 | -1): void {
  if (!state.isReviewMode) return;
  // Targets go stale when the diff is re-rendered (e.g. raw/formatted switch)
  if (changeTargets.length === 0 || !changeTargets[0].isConnected) {
    changeTargets = getAiChangeTargets();
    currentIndex = -1;
  }
  const total = changeTargets.length;
  if (total === 0) return;

  changeTargets[currentIndex]?.classList.remove(CURRENT_CLASS);
  currentIndex = currentIndex < 0
    ? (direction === 1 ? 0 : total - 1)
    : (currentIndex + direction + total) % total;

  const target = changeTargets[currentIndex];
  target.classList.add(CURRENT_CLASS);
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  updateCounter();
}

/**
 * Wires the previous/next buttons and the F7 / Shift+F7 shortcuts (same as VS Code's diff navigation).
 */
export function wireAiReview(): void {
  if (typeof document === 'undefined') return;
  document.getElementById('btn-ai-prev')?.addEventListener('click', () => navigateAiChange(-1));
  document.getElementById('btn-ai-next')?.addEventListener('click', () => navigateAiChange(1));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F7' || !state.isReviewMode) return;
    e.preventDefault();
    navigateAiChange(e.shiftKey ? -1 : 1);
  });
}
