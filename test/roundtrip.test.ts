import assert from 'assert';
import { JSDOM } from 'jsdom';
import { markdownToHtml } from '../src/markdown/parser';
import { domToMarkdown } from '../src/markdown/serializer';

describe('Markdown Roundtrip Tests (Parser -> HTML -> Serializer)', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
    document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  });

  function roundtrip(inputMd: string): string {
    const html = markdownToHtml(inputMd);
    const editor = document.getElementById('editor')!;
    editor.innerHTML = html;
    return domToMarkdown(editor).trim();
  }

  it('roundtrips 2-level nested bullet lists', () => {
    const input = [
      '- Vegetables',
      '  - Carrot',
      '  - Broccoli',
      '- Fruits',
      '  - Apple',
      '  - Banana',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips 3-level deep nested bullet lists', () => {
    const input = [
      '- Root',
      '  - Branch 1',
      '    - Leaf 1.1',
      '    - Leaf 1.2',
      '  - Branch 2',
      '    - Leaf 2.1',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips nested ordered lists', () => {
    const input = [
      '1. Getting Started',
      '  1. Installation',
      '  2. Configuration',
      '2. Advanced Usage',
      '  1. Custom Themes',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips nested task checklists with mixed checked states', () => {
    const input = [
      '- [ ] Project Launch',
      '  - [x] Write documentation',
      '  - [x] Add automated tests',
      '  - [ ] Deploy to production',
      '- [x] Preliminary Research',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips mixed list hierarchies (ordered inside unordered)', () => {
    const input = [
      '- Step Guidelines',
      '  1. Prepare workspace',
      '  2. Run build script',
      '- Verification',
      '  1. Check unit tests',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips mixed list hierarchies (task list inside bullet list)', () => {
    const input = [
      '- Release checklist',
      '  - [x] Version bump',
      '  - [ ] Publish package',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });

  it('roundtrips a complex document containing headings, nested lists, and formatting', () => {
    const input = [
      '# Project Overview',
      '',
      'Welcome to **Agent Cowork**!',
      '',
      '## Features',
      '',
      '- Simplicity',
      '  - Minimal UI',
      '  - Clean browser tabs',
      '- Productivity',
      '  1. Fast editing',
      '  2. Instant reload',
      '',
      '## Action Items',
      '',
      '- [ ] Immediate',
      '  - [x] Support nested lists',
      '  - [x] Add automated testing',
      '  - [ ] Enjoy coffee',
    ].join('\n');

    const output = roundtrip(input);
    assert.strictEqual(output, input);
  });
});
