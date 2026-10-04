import assert from 'assert';
import {
  diffLines,
  diffWords,
  tokenizeLine,
  countDiffStats,
  formatCodeBlockDiff,
  formatMarkdownDiff,
} from '../src/markdown/diffEngine';

describe('Diff Engine Unit Tests', () => {
  describe('diffLines', () => {
    it('returns empty array when both inputs are empty', () => {
      assert.deepStrictEqual(diffLines('', ''), []);
    });

    it('identifies pure additions when original is empty', () => {
      const diff = diffLines('', 'Line 1\nLine 2');
      assert.deepStrictEqual(diff, [
        { type: 'add', text: 'Line 1', modifiedLine: 1 },
        { type: 'add', text: 'Line 2', modifiedLine: 2 },
      ]);
    });

    it('identifies pure deletions when modified is empty', () => {
      const diff = diffLines('Line 1\nLine 2', '');
      assert.deepStrictEqual(diff, [
        { type: 'del', text: 'Line 1', originalLine: 1 },
        { type: 'del', text: 'Line 2', originalLine: 2 },
      ]);
    });

    it('identifies identical lines as same', () => {
      const diff = diffLines('Hello\nWorld', 'Hello\nWorld');
      assert.deepStrictEqual(diff, [
        { type: 'same', text: 'Hello', originalLine: 1, modifiedLine: 1 },
        { type: 'same', text: 'World', originalLine: 2, modifiedLine: 2 },
      ]);
    });

    it('handles mixed additions, deletions, and unchanged lines', () => {
      const orig = 'Line 1\nLine 2\nLine 3';
      const mod = 'Line 1\nModified Line 2\nLine 3\nLine 4';
      const diff = diffLines(orig, mod);

      assert.strictEqual(diff.find((d) => d.text === 'Line 1')?.type, 'same');
      assert.strictEqual(diff.find((d) => d.text === 'Line 2')?.type, 'del');
      assert.strictEqual(diff.find((d) => d.text === 'Modified Line 2')?.type, 'add');
      assert.strictEqual(diff.find((d) => d.text === 'Line 3')?.type, 'same');
      assert.strictEqual(diff.find((d) => d.text === 'Line 4')?.type, 'add');
    });
  });

  describe('tokenizeLine and diffWords', () => {
    it('tokenizes words, whitespace, and punctuation', () => {
      const tokens = tokenizeLine('const x = 42;');
      assert.deepStrictEqual(tokens, ['const', ' ', 'x', ' ', '=', ' ', '42', ';']);
    });

    it('computes word-level additions and deletions', () => {
      const orig = 'const total = price;';
      const mod = 'const total = price + tax;';
      const words = diffWords(orig, mod);

      assert.deepStrictEqual(words, [
        { type: 'same', text: 'const total = price' },
        { type: 'add', text: ' + tax' },
        { type: 'same', text: ';' },
      ]);
    });
  });

  describe('countDiffStats', () => {
    it('computes correct statistics', () => {
      const diff = diffLines('A\nB\nC', 'A\nX\nC\nY');
      const stats = countDiffStats(diff);
      assert.strictEqual(stats.additions, 2);
      assert.strictEqual(stats.deletions, 1);
      assert.strictEqual(stats.hasChanges, true);
    });

    it('returns hasChanges = false when no edits', () => {
      const diff = diffLines('Same', 'Same');
      const stats = countDiffStats(diff);
      assert.strictEqual(stats.additions, 0);
      assert.strictEqual(stats.deletions, 0);
      assert.strictEqual(stats.hasChanges, false);
    });
  });

  describe('formatCodeBlockDiff', () => {
    it('formats code additions with + and deletions with -', () => {
      const orig = 'function test() {\n  return 1;\n}';
      const mod = 'function test() {\n  return 2;\n}';
      const html = formatCodeBlockDiff(orig, mod);

      assert.ok(html.includes('code-diff-del'));
      assert.ok(html.includes('code-diff-add'));
      assert.ok(html.includes('code-diff-gutter'));
      assert.ok(html.includes('-'));
      assert.ok(html.includes('+'));
      assert.ok(html.includes('code-diff-token-del'));
      assert.ok(html.includes('code-diff-token-add'));
    });
  });

  describe('formatMarkdownDiff', () => {
    it('formats markdown with inline additions and deletions', () => {
      const orig = '# Hello World\nOld paragraph';
      const mod = '# Hello World\nNew paragraph';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      assert.ok(html.includes('diff-ins'));
      assert.ok(html.includes('diff-del'));
      assert.ok(html.includes('New'));
      assert.ok(html.includes('Old'));
    });

    it('formats code block diffs embedded inside markdown', () => {
      const orig = '```ts\nconst a = 1;\n```';
      const mod = '```ts\nconst a = 2;\n```';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      assert.ok(html.includes('code-diff-wrapper'));
      assert.ok(html.includes('code-diff-line'));
    });

    it('formats table diffs with cell-level token highlights instead of raw md', () => {
      const orig = '| Feature | Supported |\n| --- | --- |\n| Audio | False |\n| Video | True |';
      const mod = '| Feature | Supported |\n| --- | --- |\n| Audio | True |\n| Video | True |';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      // Must render as actual table element, NOT raw paragraph
      assert.ok(html.includes('<table class="editor-table"'), 'Must render table element');
      assert.ok(html.includes('table-wrapper'), 'Must have table wrapper');
      assert.ok(html.includes('diff-cell-modified'), 'Must highlight modified cell');
      assert.ok(html.includes('<del class="diff-del">False</del>'), 'Must have deleted token False');
      assert.ok(html.includes('<ins class="diff-ins">True</ins>'), 'Must have added token True');
      assert.ok(!html.includes('<p class="editor-block">| Feature |'), 'Must not render raw pipes in paragraph');
    });

    it('formats table with added and deleted rows', () => {
      const orig = '| Item | Count |\n| --- | --- |\n| Apples | 5 |\n| Bananas | 3 |';
      const mod = '| Item | Count |\n| --- | --- |\n| Apples | 5 |\n| Cherries | 10 |';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      assert.ok(html.includes('<table class="editor-table"'));
      assert.ok(html.includes('diff-row-modified') || html.includes('diff-cell-modified'));
    });

    it('formats table with purely added rows', () => {
      const orig = '| Item | Count |\n| --- | --- |\n| Apples | 5 |';
      const mod = '| Item | Count |\n| --- | --- |\n| Apples | 5 |\n| Oranges | 8 |';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      assert.ok(html.includes('diff-row-added'));
      assert.ok(html.includes('Oranges'));
    });

    it('formats table with purely deleted rows', () => {
      const orig = '| Item | Count |\n| --- | --- |\n| Apples | 5 |\n| Oranges | 8 |';
      const mod = '| Item | Count |\n| --- | --- |\n| Apples | 5 |';
      const { html, stats } = formatMarkdownDiff(orig, mod);

      assert.strictEqual(stats.hasChanges, true);
      assert.ok(html.includes('diff-row-deleted'));
      assert.ok(html.includes('Oranges'));
    });
  });
});

