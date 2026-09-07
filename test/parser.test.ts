import assert from 'assert';
import { parseMarkdownToBlocks, blocksToHtml, markdownToHtml } from '../src/markdown/parser';

describe('Markdown Parser - Nested Lists', () => {
  describe('Unordered Lists', () => {
    it('parses single-level unordered lists', () => {
      const md = '- Item 1\n- Item 2\n- Item 3';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'unordered_list');
      assert.strictEqual(blocks[0].items?.length, 3);
      assert.strictEqual(blocks[0].items?.[0].text, 'Item 1');
      assert.strictEqual(blocks[0].items?.[1].text, 'Item 2');
      assert.strictEqual(blocks[0].items?.[2].text, 'Item 3');
    });

    it('parses 2-level nested unordered lists', () => {
      const md = '- Fruits\n  - Apple\n  - Banana\n- Vegetables';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'unordered_list');
      assert.strictEqual(blocks[0].items?.length, 2);

      const fruitsItem = blocks[0].items![0];
      assert.strictEqual(fruitsItem.text, 'Fruits');
      assert.ok(fruitsItem.children && fruitsItem.children.length === 1);
      assert.strictEqual(fruitsItem.children[0].type, 'unordered_list');
      assert.strictEqual(fruitsItem.children[0].items?.length, 2);
      assert.strictEqual(fruitsItem.children[0].items?.[0].text, 'Apple');
      assert.strictEqual(fruitsItem.children[0].items?.[1].text, 'Banana');

      const vegItem = blocks[0].items![1];
      assert.strictEqual(vegItem.text, 'Vegetables');
      assert.strictEqual(vegItem.children, undefined);
    });

    it('parses 3-level deep nested unordered lists', () => {
      const md = '- Level 1\n  - Level 2\n    - Level 3';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      const l1 = blocks[0].items![0];
      assert.strictEqual(l1.text, 'Level 1');

      const l2Block = l1.children![0];
      assert.strictEqual(l2Block.type, 'unordered_list');
      const l2 = l2Block.items![0];
      assert.strictEqual(l2.text, 'Level 2');

      const l3Block = l2.children![0];
      assert.strictEqual(l3Block.type, 'unordered_list');
      const l3 = l3Block.items![0];
      assert.strictEqual(l3.text, 'Level 3');
    });

    it('parses lists indented with 4 spaces and tabs', () => {
      const md4 = '- Parent\n    - 4 Space Child';
      const blocks4 = parseMarkdownToBlocks(md4);
      assert.strictEqual(blocks4[0].items![0].children?.length, 1);
      assert.strictEqual(blocks4[0].items![0].children![0].items![0].text, '4 Space Child');

      const mdTab = '- Parent\n\t- Tab Child';
      const blocksTab = parseMarkdownToBlocks(mdTab);
      assert.strictEqual(blocksTab[0].items![0].children?.length, 1);
      assert.strictEqual(blocksTab[0].items![0].children![0].items![0].text, 'Tab Child');
    });
  });

  describe('Ordered Lists', () => {
    it('parses single-level ordered lists', () => {
      const md = '1. Step one\n2. Step two\n3. Step three';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'ordered_list');
      assert.strictEqual(blocks[0].items?.length, 3);
      assert.strictEqual(blocks[0].items?.[0].text, 'Step one');
      assert.strictEqual(blocks[0].items?.[1].text, 'Step two');
      assert.strictEqual(blocks[0].items?.[2].text, 'Step three');
    });

    it('parses nested ordered lists', () => {
      const md = '1. Chapter 1\n   1. Section 1.1\n   2. Section 1.2\n2. Chapter 2';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'ordered_list');
      assert.strictEqual(blocks[0].items?.length, 2);

      const ch1 = blocks[0].items![0];
      assert.strictEqual(ch1.text, 'Chapter 1');
      assert.ok(ch1.children && ch1.children.length === 1);
      assert.strictEqual(ch1.children[0].type, 'ordered_list');
      assert.strictEqual(ch1.children[0].items?.length, 2);
      assert.strictEqual(ch1.children[0].items?.[0].text, 'Section 1.1');
      assert.strictEqual(ch1.children[0].items?.[1].text, 'Section 1.2');

      const ch2 = blocks[0].items![1];
      assert.strictEqual(ch2.text, 'Chapter 2');
    });
  });

  describe('Task Lists', () => {
    it('parses single-level task checklists', () => {
      const md = '- [ ] Todo item\n- [x] Done item';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'task_list');
      assert.strictEqual(blocks[0].items?.length, 2);
      assert.strictEqual(blocks[0].items?.[0].text, 'Todo item');
      assert.strictEqual(blocks[0].items?.[0].checked, false);
      assert.strictEqual(blocks[0].items?.[1].text, 'Done item');
      assert.strictEqual(blocks[0].items?.[1].checked, true);
    });

    it('parses nested task lists', () => {
      const md = '- [ ] Main task\n  - [x] Subtask A\n  - [ ] Subtask B\n- [x] Completed task';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'task_list');
      assert.strictEqual(blocks[0].items?.length, 2);

      const mainTask = blocks[0].items![0];
      assert.strictEqual(mainTask.text, 'Main task');
      assert.strictEqual(mainTask.checked, false);
      assert.ok(mainTask.children && mainTask.children.length === 1);
      assert.strictEqual(mainTask.children[0].type, 'task_list');
      assert.strictEqual(mainTask.children[0].items?.[0].text, 'Subtask A');
      assert.strictEqual(mainTask.children[0].items?.[0].checked, true);
      assert.strictEqual(mainTask.children[0].items?.[1].text, 'Subtask B');
      assert.strictEqual(mainTask.children[0].items?.[1].checked, false);
    });
  });

  describe('Mixed Nested Lists', () => {
    it('parses ordered list nested inside unordered list', () => {
      const md = '- Bullet item\n  1. First ordered\n  2. Second ordered';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'unordered_list');
      const bullet = blocks[0].items![0];
      assert.strictEqual(bullet.text, 'Bullet item');
      assert.ok(bullet.children && bullet.children.length === 1);
      assert.strictEqual(bullet.children[0].type, 'ordered_list');
      assert.strictEqual(bullet.children[0].items?.length, 2);
      assert.strictEqual(bullet.children[0].items?.[0].text, 'First ordered');
      assert.strictEqual(bullet.children[0].items?.[1].text, 'Second ordered');
    });

    it('parses task list nested inside bullet list', () => {
      const md = '- Tasks for today\n  - [ ] Write tests\n  - [x] Fix parser';
      const blocks = parseMarkdownToBlocks(md);

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'unordered_list');
      const item = blocks[0].items![0];
      assert.ok(item.children && item.children.length === 1);
      assert.strictEqual(item.children[0].type, 'task_list');
      assert.strictEqual(item.children[0].items?.[0].text, 'Write tests');
      assert.strictEqual(item.children[0].items?.[0].checked, false);
      assert.strictEqual(item.children[0].items?.[1].text, 'Fix parser');
      assert.strictEqual(item.children[0].items?.[1].checked, true);
    });
  });

  describe('HTML Generation (blocksToHtml & markdownToHtml)', () => {
    it('generates proper HTML hierarchy for nested lists', () => {
      const md = '- Parent\n  - Child';
      const html = markdownToHtml(md);

      assert.ok(html.includes('<ul class="editor-block bullet-list" data-block-type="unordered_list">'));
      assert.ok(html.includes('<li class="list-item">Parent<ul class="bullet-list" data-block-type="unordered_list">'));
      assert.ok(html.includes('<li class="list-item">Child</li>'));
      assert.ok(html.includes('</ul></li></ul>'));
    });

    it('generates proper HTML for nested task lists', () => {
      const md = '- [ ] Parent task\n  - [x] Child task';
      const html = markdownToHtml(md);

      assert.ok(html.includes('<ul class="editor-block task-list" data-block-type="task_list">'));
      assert.ok(html.includes('<li class="task-item" data-checked="false">'));
      assert.ok(html.includes('<ul class="task-list" data-block-type="task_list">'));
      assert.ok(html.includes('<li class="task-item is-checked" data-checked="true">'));
    });
  });
});
