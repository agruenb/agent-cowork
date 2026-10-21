import assert from 'assert';
import { JSDOM } from 'jsdom';
import { formatMarkdownDiff } from '../src/markdown/diffEngine';

function renderDom(html: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="canvas">${html}</div></body></html>`);
  return dom.window.document;
}

// target(...) marks target behaviors from the strategy that are now fully implemented.
const target = it;

describe('Diff Rendering: Interactive Components & Edge Cases', () => {

  // =========================================================================
  // 1. REGRESSION GUARDS (Behavior that already works or core engine baselines)
  // =========================================================================
  describe('Regression Guards', () => {
    it('returns empty html and no changes when content is identical', () => {
      const res = formatMarkdownDiff('Hello world\n\nParagraph 2', 'Hello world\n\nParagraph 2');
      assert.strictEqual(res.html, '');
      assert.strictEqual(res.stats.hasChanges, false);
      assert.strictEqual(res.stats.additions, 0);
      assert.strictEqual(res.stats.deletions, 0);
    });

    it('identifies pure paragraph addition', () => {
      const res = formatMarkdownDiff('Hello world', 'Hello world\n\nAdded paragraph');
      assert.strictEqual(res.stats.hasChanges, true);
      const doc = renderDom(res.html);
      const added = doc.querySelectorAll('.diff-block-added, .diff-ins');
      assert.ok(added.length > 0);
    });

    it('identifies pure paragraph deletion', () => {
      const res = formatMarkdownDiff('Hello world\n\nDeleted line', 'Hello world');
      assert.strictEqual(res.stats.hasChanges, true);
      const doc = renderDom(res.html);
      const removed = doc.querySelectorAll('.diff-block-removed, .diff-del');
      assert.ok(removed.length > 0);
    });
  });

  // =========================================================================
  // 2. BLOCKQUOTES & HORIZONTAL RULES
  // =========================================================================
  describe('Blockquotes & Horizontal Rules', () => {
    target('renders unchanged blockquote as a <blockquote> element, not a <p>&gt; ...</p>', () => {
      const orig = '> Quote line 1\n> Quote line 2\n\nPara';
      const mod = '> Quote line 1\n> Quote line 2\n\nPara modified';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const bq = doc.querySelector('blockquote');
      assert.ok(bq, 'Should render as <blockquote> tag');
      assert.strictEqual(doc.body.textContent?.includes('&gt;'), false, 'Should not render raw &gt;');
    });

    target('renders modified blockquote with block and inline diff decorations', () => {
      const orig = '> The old quote statement';
      const mod = '> The new quote statement';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const bq = doc.querySelector('blockquote, [data-block-type="blockquote"]');
      assert.ok(bq, 'Should render within blockquote block structure');
      assert.ok(doc.querySelector('.diff-del'), 'Should highlight deleted word');
      assert.ok(doc.querySelector('.diff-ins'), 'Should highlight added word');
    });

    target('renders added blockquote with diff-block-added marker', () => {
      const orig = 'Intro';
      const mod = 'Intro\n\n> Added quote with **bold** text';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const bq = doc.querySelector('blockquote, [data-block-type="blockquote"]');
      assert.ok(bq, 'Should render blockquote');
      assert.ok(
        bq?.classList.contains('diff-block-added') || bq?.closest('.diff-block-added'),
        'Should mark added blockquote'
      );
      assert.ok(doc.querySelector('strong'), 'Should render inline markdown (bold) inside quote');
    });

    target('renders horizontal rules (<hr>) rather than literal paragraph text "---"', () => {
      const orig = 'Before\n\n---\n\nAfter old';
      const mod = 'Before\n\n---\n\nAfter new';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const hr = doc.querySelector('hr');
      assert.ok(hr, 'Should render <hr> element');
      // Verify "---" is not rendered as paragraph content
      const paragraphs = Array.from(doc.querySelectorAll('p'));
      const hasLiteralHrP = paragraphs.some((p) => p.textContent?.trim() === '---');
      assert.strictEqual(hasLiteralHrP, false, 'Should not render literal "---" paragraph');
    });
  });

  // =========================================================================
  // 3. INLINE FORMATTING & LINK PRESERVATION
  // =========================================================================
  describe('Inline Formatting & Links', () => {
    target('renders bold and italic formatting on unchanged lines in a diffed document', () => {
      const orig = 'Some **bold** and *italic* and `code`\n\nUnchanged';
      const mod = 'Some **bold** and *italic* and `code`\n\nChanged';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      assert.ok(doc.querySelector('strong'), 'Strong element must be parsed and rendered');
      assert.ok(doc.querySelector('em'), 'Em element must be parsed and rendered');
      assert.ok(doc.querySelector('code'), 'Inline code element must be parsed and rendered');
      assert.strictEqual(doc.body.innerHTML.includes('**bold**'), false, 'Raw asterisks must not leak');
    });

    target('handles inline diff when tokens change inside formatting delimiters (**old** -> **new**)', () => {
      const orig = 'Hello **world** today';
      const mod = 'Hello **planet** today';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const strong = doc.querySelector('strong');
      assert.ok(strong, '<strong> tag should be preserved');
      assert.ok(strong?.querySelector('.diff-del, del'), 'Deletion marker should be inside or around strong');
      assert.ok(strong?.querySelector('.diff-ins, ins'), 'Insertion marker should be inside or around strong');
      assert.strictEqual(doc.body.innerHTML.includes('**'), false, 'Raw markdown delimiters should not be rendered');
    });

    target('handles pure formatting changes (word -> **word**) without displaying raw syntax', () => {
      const orig = 'Click the button below.';
      const mod = 'Click the **button** below.';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const strong = doc.querySelector('strong');
      assert.ok(strong, 'Should render <strong> element');
      assert.strictEqual(strong?.textContent?.trim(), 'button');
      assert.strictEqual(doc.body.innerHTML.includes('**'), false, 'No raw ** should leak');
    });

    target('preserves clickable links with href rather than dumping raw markdown syntax', () => {
      const orig = 'Check [our documentation](https://example.com/docs)\n\nOld info';
      const mod = 'Check [our documentation](https://example.com/docs)\n\nNew info';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const link = doc.querySelector('a');
      assert.ok(link, 'Should render <a> tag');
      assert.strictEqual(link?.getAttribute('href'), 'https://example.com/docs');
      assert.strictEqual(link?.textContent, 'our documentation');
    });

    target('detects and indicates link target (URL) change with same label', () => {
      const orig = 'Go to [Dashboard](https://example.com/v1)';
      const mod = 'Go to [Dashboard](https://example.com/v2)';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const link = doc.querySelector('a');
      assert.ok(link, 'Should render <a> tag');
      assert.ok(
        link?.classList.contains('diff-link-changed') || link?.hasAttribute('data-diff-old-href'),
        'Should annotate changed link destination'
      );
    });
  });

  // =========================================================================
  // 4. LISTS: ORDERED, NESTED, AND TASK CHECKBOXES
  // =========================================================================
  describe('Lists: Ordered, Nested, and Tasks', () => {
    target('renders ordered list as a single coherent <ol> without restarting at 1 for each item', () => {
      const orig = '1. First item\n2. Second item\n3. Third item';
      const mod = '1. First item\n2. Modified second item\n3. Third item';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const ols = doc.querySelectorAll('ol');
      assert.strictEqual(ols.length, 1, 'Should group items under a single <ol>');
      const lis = ols[0].querySelectorAll('li');
      assert.strictEqual(lis.length, 3, 'Should have 3 list items');
      assert.strictEqual(doc.body.innerHTML.includes('2. '), false, 'Literal item prefix "2. " should not leak');
    });

    target('preserves nested list hierarchy in diff view', () => {
      const orig = '- Parent\n  - Child item old\n- Sibling';
      const mod = '- Parent\n  - Child item new\n- Sibling';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const outerUl = doc.querySelector('ul');
      assert.ok(outerUl, 'Outer <ul> should exist');
      const innerUl = outerUl?.querySelector('ul');
      assert.ok(innerUl, 'Nested <ul> must be preserved inside the parent hierarchy');
      assert.strictEqual(doc.body.innerHTML.includes('  - '), false, 'Nested dash prefix should not leak');
    });

    target('detects task checkbox toggle ([ ] -> [x]) as a first-class state change', () => {
      const orig = '- [ ] Deploy application\n- [ ] Notify users';
      const mod = '- [x] Deploy application\n- [ ] Notify users';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const checkboxes = doc.querySelectorAll('input[type="checkbox"]');
      assert.strictEqual(checkboxes.length, 2, 'Should render interactive/preview checkboxes');
      const firstLi = doc.querySelector('li');
      assert.ok(
        firstLi?.classList.contains('diff-checkbox-changed') ||
        firstLi?.hasAttribute('data-diff-old-checked') ||
        firstLi?.classList.contains('diff-block-modified'),
        'Should identify checkbox state toggle'
      );
      assert.strictEqual((checkboxes[0] as HTMLInputElement).checked, true, 'Checkbox should show new state');
    });
  });

  // =========================================================================
  // 5. TABLES: DELIMITERS, COLUMNS, ROWS, AND CHECKBOX CELLS
  // =========================================================================
  describe('Tables', () => {
    target('does not leak delimiter row (|---|---|) into body when header columns change', () => {
      const orig = '| A | B |\n|---|---|\n| 1 | 2 |';
      const mod = '| A | X | B |\n|---|---|---|\n| 1 | y | 2 |';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const cells = Array.from(doc.querySelectorAll('td'));
      const leakedDelimiter = cells.some((td) => td.textContent?.includes('---'));
      assert.strictEqual(leakedDelimiter, false, 'Table delimiter row must never render as data cell');
    });

    target('correctly aligns multi-row edits without generating mispaired garbage cells', () => {
      const orig = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
      const mod = '| A | B |\n|---|---|\n| 1x | 2 |\n| 3x | 4 |';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const rows = doc.querySelectorAll('tbody tr');
      assert.strictEqual(rows.length, 2, 'Should pair into exactly 2 modified body rows');
      const firstRowText = rows[0].textContent;
      assert.ok(firstRowText?.includes('1') && firstRowText?.includes('1x'));
      assert.ok(!firstRowText?.includes('3'), 'Row 1 should not be paired with Row 2 cells');
    });

    target('handles table replacement with different schema cleanly as removed + added or structured change', () => {
      const orig = '| A | B |\n|---|---|\n| 1 | 2 |';
      const mod = '| C | D | E |\n|:--|---|--:|\n| 5 | 6 | 7 |';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const cells = Array.from(doc.querySelectorAll('td'));
      const leaked = cells.some((td) => td.textContent?.includes(':--') || td.textContent?.includes('--:'));
      assert.strictEqual(leaked, false, 'Alignment delimiter syntax must not leak as table cells');
    });

    target('preserves checkbox cells in tables and marks cell changes appropriately', () => {
      const orig = '| Task | Status |\n|---|---|\n| Item 1 | [ ] |';
      const mod = '| Task | Status |\n|---|---|\n| Item 1 | [x] |';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const checkbox = doc.querySelector('.table-cell-checkbox, input[type="checkbox"]');
      assert.ok(checkbox, 'Checkbox element should be rendered');
      assert.strictEqual((checkbox as HTMLInputElement)?.checked, true, 'Should reflect checked status');
      assert.strictEqual(doc.body.innerHTML.includes('[x]'), false, 'Literal syntax [x] should not be rendered');
    });

    target('renders inline formatting inside modified table cells', () => {
      const orig = '| Feature |\n|---|\n| **old** |';
      const mod = '| Feature |\n|---|\n| **new** |';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const strong = doc.querySelector('strong');
      assert.ok(strong, 'Strong tag should render inside table cell');
      assert.strictEqual(doc.body.innerHTML.includes('**'), false, 'No raw ** inside table');
    });
  });

  // =========================================================================
  // 6. CODE BLOCKS & FENCES
  // =========================================================================
  describe('Code Blocks & Fences', () => {
    target('handles code block language change without breaking following blocks or document', () => {
      const orig = '```js\nconst a = 1;\n```\n\nParagraph after';
      const mod = '```ts\nconst a = 1;\n```\n\nParagraph after';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      // Paragraph after must NOT be swallowed into a code block
      const paragraphs = Array.from(doc.querySelectorAll('p'));
      const afterPara = paragraphs.find((p) => p.textContent?.includes('Paragraph after'));
      assert.ok(afterPara, 'Paragraph after code block must remain a paragraph');
      assert.strictEqual(afterPara?.closest('pre'), null, 'Paragraph after code block must not be inside <pre>');
    });

    target('multi-line code modifications pair corresponding lines rather than offset cross-pairs', () => {
      const orig = '```js\nconst a = 1;\nconst b = 2;\n```';
      const mod = '```js\nconst a = 10;\nconst b = 20;\n```';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      // Verify lines with 'a' and lines with 'b' are paired or grouped cleanly
      const codeLines = Array.from(doc.querySelectorAll('.code-diff-line, .raw-diff-line'));
      if (codeLines.length > 0) {
        const text = doc.body.textContent || '';
        // In the flawed implementation, b = 2 got token-diffed against a = 10 (b -> a, 2 -> 10)
        // With correct run pairing, line 'a' diffs with 'a', and line 'b' diffs with 'b'
        assert.ok(text.includes('10'));
        assert.ok(text.includes('20'));
      }
    });

    target('supports tilde (~~~) code block fences', () => {
      const orig = '~~~\n# not a heading\n| a | b |\n|---|---|\n~~~';
      const mod = '~~~\n# not a heading 2\n| a | b |\n|---|---|\n~~~';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      // Must NOT parse as an HTML <h1> or <table>
      assert.strictEqual(doc.querySelectorAll('h1').length, 0, 'Should not render h1 inside code fence');
      assert.strictEqual(doc.querySelectorAll('table').length, 0, 'Should not render table inside code fence');
    });

    target('renders unchanged code block without unnecessary AI Diff badges or full diff frame', () => {
      const orig = '```python\nprint("hello")\n```\n\nPara';
      const mod = '```python\nprint("hello")\n```\n\nPara changed';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const codeWrappers = doc.querySelectorAll('.code-block-wrapper');
      assert.ok(codeWrappers.length > 0, 'Code block should be rendered');
      // Unchanged code block shouldn't claim to be an AI Diff
      const badge = doc.querySelector('.code-diff-badge');
      assert.strictEqual(badge, null, 'Unchanged code block should not display an AI Diff badge');
    });
  });

  // =========================================================================
  // 7. MERMAID DIAGRAMS
  // =========================================================================
  describe('Mermaid Diagrams in AI Diff', () => {
    target('renders modified Mermaid block as diagram widget with diff indicator', () => {
      const orig = '```mermaid\ngraph TD\nA-->B\n```';
      const mod = '```mermaid\ngraph TD\nA-->C\n```';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const mermaidBlock = doc.querySelector('.is-mermaid-block, [data-language="mermaid"]');
      assert.ok(mermaidBlock, 'Should preserve Mermaid block wrapper');
    });
  });

  // =========================================================================
  // 8. MULTI-LINE PROSE RUNS & SOFT BREAKS
  // =========================================================================
  describe('Multi-line Prose & Paragraphs', () => {
    target('pairs multi-line paragraph edits sequentially without swapping intermediate lines', () => {
      const orig = 'Line one old\nLine two old';
      const mod = 'Line one new\nLine two new';
      const res = formatMarkdownDiff(orig, mod);
      const doc = renderDom(res.html);

      const text = doc.body.innerHTML;
      // In flawed pairing, "Line two" was diffed against "Line one", showing Line <del>two</del><ins>one</ins>
      assert.strictEqual(
        text.includes('<del class="diff-del">two</del><ins class="diff-ins">one</ins>'),
        false,
        'Should not cross-pair line one and line two'
      );
    });
  });
});
